package com.trindade.app.share

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.R
import com.trindade.app.admin.UsersRepository
import com.trindade.app.auth.AuthRepository
import com.trindade.app.auth.PasswordPolicy
import com.trindade.app.auth.RolePolicy
import com.trindade.app.admin.UserWriteResult
import com.trindade.app.contract.models.AdminUserResponseUser
import com.trindade.app.contract.models.CreateAdminUserRequest
import com.trindade.app.contract.models.UpdateAdminUserRequest
import com.trindade.app.network.SystemApi
import com.trindade.app.network.runCatchingCancellable
import com.trindade.app.ui.UiText
import com.trindade.app.ui.filterPhoneDigits
import com.trindade.app.ui.toWhatsAppNumber
import com.trindade.app.ui.waMeLink
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

data class ShareFeedback(
    val message: UiText,
    val isSuccess: Boolean,
)

@HiltViewModel
class ShareAppViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val usersRepository: UsersRepository,
    /** Wired by Hilt in the app and left inert by default, so a screen drawn without a backend says so. */
    private val apkSharer: ApkSharer = NoOpApkSharer,
    private val systemApi: SystemApi? = null,
) : ViewModel() {

    data class UiState(
        val platform: SharePlatform = SharePlatform.ANDROID,
        val release: ShareReleaseInfo = ShareReleaseInfo(),
        val users: List<AdminUserResponseUser> = emptyList(),
        val selectedUserId: Int? = null,
        val displayName: String = "",
        val username: String = "",
        val password: String = "",
        val includeCredentials: Boolean = true,
        /** Creation is the default: the admin already knows the person's name, and leaving to the admin panel is
         * where the sharing stops happening. */
        val credentialMode: ShareCredentialMode = ShareCredentialMode.CREATE,
        val quickName: String = "",
        val quickUsername: String = "",
        /** The login is derived from the name until the admin types over it, and never after. */
        val usernameEdited: Boolean = false,
        /** The login whose account was already created in this visit, so sharing twice does not create twice. */
        val createdUsername: String? = null,
        val syncedExistingPassword: Pair<Int, String>? = null,
        val creating: Boolean = false,
        val createSuccess: Boolean = false,
        val createError: ShareCreateError? = null,
        val phone: String = "",
        val isAdmin: Boolean = false,
        val note: String = "",
        val actionFeedback: ShareFeedback? = null,
        /** The APK is being fetched: the button says so instead of accepting a second tap. */
        val sharingApk: Boolean = false,
        /** How far the download got, or null when it is too early to say. */
        val apkPercent: Int? = null,
        /** Whether the last attempt to hand over the APK failed, so the screen can show a modal error. */
        val apkFailed: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        val userRole = authRepository.sessionRole()
        val admin = userRole == RolePolicy.ADMIN
        _state.update { it.copy(isAdmin = admin) }
        if (admin) {
            loadUsers()
        }
        if (systemApi != null) {
            loadLatestRelease(systemApi)
        }
    }

    private fun loadLatestRelease(api: SystemApi) {
        viewModelScope.launch {
            val body = runCatchingCancellable { api.latestRelease() }.getOrNull()
                ?.takeIf { it.isSuccessful }?.body() ?: return@launch
            val normalizedVersion = body.version.trim().takeIf { it.isNotEmpty() }
                ?.let { if (it.startsWith("v", ignoreCase = true)) it else "v$it" }
            _state.update { s ->
                s.copy(
                    release = s.release.copy(
                        version = normalizedVersion ?: s.release.version,
                        apkUrl = body.apkUrl.ifBlank { s.release.apkUrl },
                        webUrl = body.webUrl.ifBlank { s.release.webUrl },
                    ),
                )
            }
        }
    }

    fun loadUsers() {
        viewModelScope.launch {
            val list = usersRepository.users()
            if (list != null) {
                _state.update { it.copy(users = list) }
            }
        }
    }

    fun onPlatformSelect(platform: SharePlatform) {
        _state.update { it.copy(platform = platform) }
    }

    fun onUserSelect(userId: Int?) {
        if (userId == null) {
            _state.update { it.copy(selectedUserId = null, displayName = "", username = "", password = "") }
            return
        }
        val found = _state.value.users.find { it.id == userId }
        if (found != null) {
            _state.update {
                it.copy(
                    selectedUserId = userId,
                    displayName = found.displayName,
                    username = found.username,
                    password = quickWorkerPassword(found.username),
                    actionFeedback = null,
                )
            }
        }
    }

    fun onPasswordChange(newPass: String) {
        _state.update { it.copy(password = newPass) }
    }

    fun onIncludeCredentialsToggle(enabled: Boolean) {
        _state.update { it.copy(includeCredentials = enabled) }
    }

    fun onCredentialModeSelect(mode: ShareCredentialMode) {
        _state.update { it.copy(credentialMode = mode, createError = null, createSuccess = false) }
    }

    fun onQuickNameChange(value: String) {
        _state.update { state ->
            state.copy(
                quickName = value,
                createError = null,
                createSuccess = false,
                quickUsername = if (state.usernameEdited) state.quickUsername else deriveUsername(value),
            )
        }
    }

    /** The admin's own login wins over the derivation from here on, even if the name changes again. */
    fun onQuickUsernameChange(value: String) {
        _state.update {
            it.copy(
                quickUsername = deriveUsername(value),
                usernameEdited = true,
                createError = null,
                createSuccess = false,
            )
        }
    }

    /** The login the message and the account use: what the admin typed, or what the name suggests. */
    fun quickLogin(): String = _state.value.quickUsername.ifBlank { deriveUsername(_state.value.quickName) }

    fun quickPassword(): String = quickWorkerPassword(quickLogin())

    /**
     * Creates the worker explicitly when the admin taps [ + Cadastrar Operário ] (S9-S11).
     */
    fun createWorker() {
        val s = _state.value
        val displayName = s.quickName.trim()
        val username = quickLogin().trim().lowercase()
        if (displayName.isEmpty()) {
            _state.update { it.copy(createError = ShareCreateError.NAME_REQUIRED, createSuccess = false) }
            return
        }
        if (username.isEmpty()) {
            _state.update { it.copy(createError = ShareCreateError.USERNAME_REQUIRED, createSuccess = false) }
            return
        }
        if (s.createdUsername == username || existingWorker(s, username)) {
            // Already registered: the message is shareable as it stands, and asking the backend again would
            // only earn a 409 for a login that already works.
            _state.update { it.copy(createdUsername = username, createSuccess = true, createError = null) }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(creating = true, createError = null, createSuccess = false) }
            val result = usersRepository.create(
                CreateAdminUserRequest(
                    username = username,
                    password = quickWorkerPassword(username),
                    displayName = displayName,
                    roleId = CreateAdminUserRequest.RoleId._2,
                ),
            )
            when (result) {
                is UserWriteResult.Saved -> {
                    _state.update {
                        it.copy(
                            creating = false,
                            createdUsername = username,
                            createSuccess = true,
                            createError = null,
                        )
                    }
                    loadUsers()
                }
                is UserWriteResult.Refused -> {
                    _state.update {
                        it.copy(
                            creating = false,
                            createSuccess = false,
                            createError = if (result.status == 409) ShareCreateError.DUPLICATED else ShareCreateError.REFUSED,
                        )
                    }
                }
                UserWriteResult.Unreachable -> {
                    _state.update { it.copy(creating = false, createSuccess = false, createError = ShareCreateError.UNREACHABLE) }
                }
            }
        }
    }

    /**
     * Whether the worker in creation mode is already registered (S12).
     *
     * Two things count: the account this visit just created, and one the company already had. The second
     * matters because the plant's operators outlive the screen: a login that exists is a login that works,
     * and refusing to share it would send the admin to create a duplicate the backend answers with 409.
     */
    fun isWorkerRegistered(): Boolean {
        val s = _state.value
        if (!s.isAdmin || !s.includeCredentials || s.credentialMode != ShareCredentialMode.CREATE) return true
        val username = quickLogin().trim().lowercase()
        if (username.isEmpty()) return false
        return s.createdUsername == username || existingWorker(s, username)
    }

    private fun existingWorker(state: UiState, username: String): Boolean =
        state.users.any { it.username.equals(username, ignoreCase = true) }

    /**
     * Checks that the worker is registered or that the existing worker's password is valid and synced
     * on the backend before sharing (S12 + password policy parity).
     */
    suspend fun ensureWorkerCreated(): Boolean {
        val s = _state.value
        if (!s.isAdmin || !s.includeCredentials) return true
        if (s.credentialMode == ShareCredentialMode.CREATE) {
            if (!isWorkerRegistered()) {
                _state.update { it.copy(createError = ShareCreateError.CREATION_REQUIRED) }
                return false
            }
            return true
        }
        val userId = s.selectedUserId
        if (userId == null) {
            showFeedback(R.string.share_select_user_required, isSuccess = false)
            return false
        }
        when (PasswordPolicy.violationOf(s.password)) {
            PasswordPolicy.Violation.TOO_FEW_GRAPHEMES -> {
                showFeedback(R.string.users_error_password_too_short, isSuccess = false)
                return false
            }
            PasswordPolicy.Violation.TOO_MANY_BYTES -> {
                showFeedback(R.string.users_error_password_too_many_bytes, isSuccess = false)
                return false
            }
            null -> Unit
        }
        if (s.syncedExistingPassword == (userId to s.password)) return true
        return when (usersRepository.update(userId, UpdateAdminUserRequest(password = s.password))) {
            is UserWriteResult.Saved -> {
                _state.update { it.copy(syncedExistingPassword = userId to s.password) }
                true
            }
            is UserWriteResult.Refused -> {
                showFeedback(R.string.share_existing_password_sync_error, isSuccess = false)
                false
            }
            UserWriteResult.Unreachable -> {
                showFeedback(R.string.admin_error_unreachable, isSuccess = false)
                false
            }
        }
    }

    fun onPhoneChange(raw: String) {
        _state.update { it.copy(phone = filterPhoneDigits(raw)) }
    }

    fun onNote(text: String) {
        _state.update { it.copy(note = text) }
    }

    fun showFeedback(@StringRes resId: Int, isSuccess: Boolean) {
        _state.update {
            it.copy(actionFeedback = ShareFeedback(message = UiText.of(resId), isSuccess = isSuccess))
        }
    }

    fun dismissFeedback() {
        _state.update {
            it.copy(
                createSuccess = false,
                createError = null,
                apkFailed = false,
                note = "",
                actionFeedback = null,
            )
        }
    }

    fun message(): String {
        val s = _state.value
        if (s.isAdmin && s.includeCredentials && s.credentialMode == ShareCredentialMode.CREATE) {
            val login = quickLogin()
            val creds = if (login.isBlank()) null else ShareCredentials(
                enabled = true,
                displayName = s.quickName.ifBlank { null },
                username = login,
                password = quickWorkerPassword(login),
            )
            return buildShareMessage(
                ShareMessageParams(
                    platform = s.platform,
                    release = s.release,
                    credentials = creds,
                    locale = Locale.getDefault().language,
                ),
            )
        }
        val creds = if (s.isAdmin && s.includeCredentials && s.username.isNotBlank()) {
            ShareCredentials(
                enabled = true,
                displayName = s.displayName.ifBlank { null },
                username = s.username.ifBlank { null },
                password = s.password.ifBlank { null },
            )
        } else null

        val locale = Locale.getDefault().language
        return buildShareMessage(
            ShareMessageParams(
                platform = s.platform,
                release = s.release,
                credentials = creds,
                locale = locale,
            ),
        )
    }

    /**
     * Fetches this deployment's APK and hands it to the platform's own share sheet.
     *
     * The file comes from the address the API publishes -- the same one the web's button fetches and the
     * updater installs -- rather than from the package this app was installed as: that one lives under
     * `/data/app`, which the provider deliberately does not expose, and what the operator wants to send is
     * something the other phone can install.
     */
    fun shareApk() {
        if (_state.value.sharingApk) return
        viewModelScope.launch {
            _state.update { it.copy(sharingApk = true, apkPercent = null, apkFailed = false) }
            val shared = apkSharer.share { percent -> _state.update { it.copy(apkPercent = percent) } }
            _state.update { it.copy(sharingApk = false, apkPercent = null, apkFailed = !shared) }
        }
    }

    fun whatsappLink(): String? {
        val number = toWhatsAppNumber(_state.value.phone)
        if (number.isEmpty()) return null
        return waMeLink(number, message())
    }
}
