package com.trindade.app.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroMirrorPort
import com.trindade.app.aero.AeroReachability
import com.trindade.app.aero.AeroReachabilityPort
import com.trindade.app.aero.AeroSettings
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.aero.AeroSettingsPermissions
import com.trindade.app.aero.AeroTestResult
import com.trindade.app.aero.aeroSettingsEditable
import com.trindade.app.aero.AeroAudit
import com.trindade.app.R
import com.trindade.app.ui.UiText
import com.trindade.app.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The integration, as a screen the panel opens.
 *
 * The address is the only field with a rule of its own: it decides where every launch of the shift goes, so it
 * stays with the owner account, while the credentials belong to whoever is holding the phone. That split is
 * decided by [aeroSettingsEditable] and enforced here, not by hiding the field -- the operator sees the address
 * and cannot move it, which is the honest version of "you are not allowed to change this".
 */
@HiltViewModel
class IntegrationSettingsViewModel @Inject constructor(
    private val store: AeroSettingsPort,
    private val client: AeroErpClient,
    private val reachability: AeroReachabilityPort,
    private val authRepository: AuthRepository,
    /**
     * The shared audit log, because a probe is a query to the ERP like a launch is.
     *
     * The same port the dispatcher writes through, so the test of the connection lands in the same file, with the
     * same prefix, as the launch it is testing the way for. A second mechanism would be a second thing to keep
     * true.
     */
    private val audit: AeroMirrorPort,
) : ViewModel() {

    data class UiState(
        val wsUrl: String = "",
        val username: String = "",
        val password: String = "",
        val userCode: String = "",
        val currentUser: String = "",
        val isConfigured: Boolean = false,
        val isSaving: Boolean = false,
        /**
         * What the last action answered, as the resource the screen resolves.
         *
         * It travelled as a Portuguese `String` before, which meant a Spanish operator read the panel in
         * Spanish and its answers in Portuguese.
         */
        val message: UiText? = null,
        val messageIsError: Boolean = false,
        /** True while a probe is in flight, so the button can say so. */
        val isTesting: Boolean = false,
    ) {
        /** Both fields the ERP needs, plus the address: the three the client actually uses. */
        val ready: Boolean get() = AeroSettings(wsUrl, username, password, userCode).ready

        val permissions: AeroSettingsPermissions get() = aeroSettingsEditable(currentUser)
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    /**
     * Fills the form from the device and from who is holding it.
     *
     * The name comes from the session and not from the APK: the address lock is per operator, so the wrong
     * name here would either hand the address to a worker or hide it from the owner.
     */
    fun load() {
        val stored = store.load()
        _state.value = _state.value.copy(
            wsUrl = stored.wsUrl,
            username = stored.username,
            password = stored.password,
            userCode = stored.userCode,
            isConfigured = store.isConfigured(),
        )
        viewModelScope.launch {
            val profile = authRepository.profile()
            val name = profile?.username.orEmpty()
            _state.update {
                it.copy(
                    currentUser = name,
                    // The operator's own ERP login is pre-filled with their name once and only while the
                    // field is still empty: overwriting a saved one would sign the plant's books for them.
                    username = if (it.username.isBlank()) name.uppercase() else it.username,
                )
            }
        }
    }

    fun setWsUrl(value: String) = _state.update { it.copy(wsUrl = value) }

    fun setUsername(value: String) = _state.update { it.copy(username = value) }

    fun setPassword(value: String) = _state.update { it.copy(password = value) }

    fun clearMessage() = _state.update { it.copy(message = null, messageIsError = false) }

    /**
     * Stores what the form holds, and says so.
     *
     * A locked address keeps the stored one instead of the typed one: the field is disabled, so the only way a
     * different value could arrive here is a stale composition, and saving it would move every future launch.
     *
     * The press used to end in silence -- `isSaving` existed and was never written -- which on a screen whose
     * only other feedback is a probe leaves the operator unsure whether the credentials were kept at all. The
     * write is short, so what is shown is the outcome: a sentence when it worked and a different one when the
     * device refused, never a spinner that outlives the write.
     */
    fun save() {
        val current = _state.value
        if (current.isSaving) return
        val stored = store.load()
        val target = AeroSettings(
            wsUrl = if (current.permissions.canEditWsUrl) current.wsUrl else stored.wsUrl,
            username = current.username.trim(),
            password = current.password,
            userCode = current.userCode.trim(),
        )

        // The button is disabled without the three fields, so this is the belt to that suspender: a stale
        // composition can still reach the press, and a half-filled integration is worse than none.
        if (!target.ready) {
            _state.value = current.copy(
                message = UiText.of(R.string.admin_integration_incomplete),
                messageIsError = true,
            )
            return
        }

        _state.value = current.copy(isSaving = true, message = null, messageIsError = false)
        viewModelScope.launch {
            // `AeroSettingsStore` writes through `SharedPreferences.apply()`, which is what makes this cheap:
            // the operator's answer is the sentence, not a progress bar over a call that returns immediately.
            val failure = runCatching { store.save(target) }.exceptionOrNull()
            _state.value = _state.value.copy(
                wsUrl = target.wsUrl,
                username = target.username,
                userCode = target.userCode,
                isConfigured = failure == null,
                isSaving = false,
                message = if (failure == null) {
                    UiText.of(R.string.admin_integration_saved)
                } else {
                    UiText.of(R.string.admin_integration_save_failed)
                },
                messageIsError = failure != null,
            )
        }
    }

    /**
     * Probes the plant with what the form holds, not with what is stored.
     *
     * Otherwise the operator would have to save an address they are still unsure about before finding out
     * whether it is right, and would then have to remember to undo it.
     */
    fun test() {
        val current = _state.value
        if (current.isTesting) return
        val settings = AeroSettings(
            wsUrl = current.wsUrl,
            username = current.username.trim(),
            password = current.password,
            userCode = current.userCode.trim(),
        )
        val normalized = settings.normalizedWsUrl

        viewModelScope.launch {
            _state.value = _state.value.copy(isTesting = true, message = null, messageIsError = false)
            val diagnosis = reachability.diagnose(settings.wsUrl)
            // The network is asked first, and only a reachable plant is probed: an address that does not
            // answer costs the operator 2.5 seconds either way, but the sentence they get is different and
            // only one of them tells them to go look at the Wi-Fi.
            val startedAt = System.currentTimeMillis()
            val answer = if (normalized == null || !settings.ready || !diagnosis.plantReachable) {
                null
            } else {
                client.testConnection(normalized, settings.username, settings.password)
            }
            val elapsed = System.currentTimeMillis() - startedAt
            recordProbe(settings, normalized, diagnosis, answer, elapsed)
            _state.value = _state.value.copy(
                isTesting = false,
                message = describe(diagnosis, answer),
                messageIsError = answer !is AeroErpClient.Probe.Answered,
            )
        }
    }

    /**
     * Writes the probe to the plant's log, once per attempt, and never blocks the answer on it.
     *
     * An attempt with no address to call is not written: the operator was told the form is incomplete, and a line
     * saying "a probe happened" about a probe that never left the phone is evidence of nothing. Every other
     * outcome is, including the ones where the network stopped it -- that line is what explains, later, why a
     * shift's launches found an unreachable plant while the phone said it had Wi-Fi.
     */
    private fun recordProbe(
        settings: AeroSettings,
        normalized: String?,
        diagnosis: AeroReachability.Diagnosis,
        answer: AeroErpClient.Probe?,
        elapsedMs: Long,
    ) {
        val address = normalized ?: return
        val (outcome, status, detail) = when {
            !settings.ready -> Triple("nao-configurado", null, null)
            !diagnosis.plantReachable ->
                Triple("sem-rede", null, "wifi=${diagnosis.wifiConnected} host=${diagnosis.hostReachable}")
            answer is AeroErpClient.Probe.Unreachable -> Triple("sem-resposta", null, answer.reason.name)
            answer is AeroErpClient.Probe.Answered -> when (val test = answer.test) {
                is AeroTestResult.Ok -> Triple("ok", 200, "user=${test.userName.ifBlank { test.userCode.toString() }}")
                is AeroTestResult.Failed -> Triple("recusado", 200, test.message)
            }
            else -> Triple("sem-resposta", null, null)
        }

        viewModelScope.launch {
            audit.log(
                AeroAudit.testRequest(
                    normalizedWsUrl = address,
                    elapsedMs = elapsedMs,
                    httpStatus = status,
                    outcome = outcome,
                    detail = detail,
                ),
            )
        }
    }
}

/**
 * The one sentence a probe earns, as the resource the screen resolves.
 *
 * The operator's language is decided by the screen's locale and not here: this view model has no `Context`, and
 * a Portuguese sentence handed to a Spanish operator is a translation nobody notices is missing.
 */
private fun describe(
    diagnosis: AeroReachability.Diagnosis,
    answer: AeroErpClient.Probe?,
): UiText = when {
    !diagnosis.wifiConnected -> UiText.of(R.string.admin_integration_no_wifi)
    diagnosis.hostReachable != true -> UiText.of(R.string.admin_integration_no_host)
    answer == null -> UiText.of(R.string.admin_integration_incomplete)
    answer is AeroErpClient.Probe.Unreachable -> when (answer.reason) {
        AeroErpClient.ProbeFailure.TIMEOUT -> UiText.of(R.string.admin_integration_timeout)
        AeroErpClient.ProbeFailure.NO_ROUTE -> UiText.of(R.string.admin_integration_no_route)
        AeroErpClient.ProbeFailure.REFUSED -> UiText.of(R.string.admin_integration_refused)
        AeroErpClient.ProbeFailure.UNKNOWN -> UiText.of(R.string.admin_integration_unknown)
    }
    answer is AeroErpClient.Probe.Answered -> when (val test = answer.test) {
        is com.trindade.app.aero.AeroTestResult.Ok ->
            UiText.of(R.string.admin_integration_probe_ok, test.userName.ifBlank { test.userCode.toString() })
        // The server's own refusal is already a sentence: it names the field the plant did not accept, and a
        // generic replacement would throw away the only explanation the operator has.
        is com.trindade.app.aero.AeroTestResult.Failed ->
            test.message?.let { UiText.literal(it) } ?: UiText.of(R.string.admin_integration_probe_refused)
    }
    else -> UiText.of(R.string.admin_integration_probe_ok, "")
}

/** `MutableStateFlow.update` without the import gymnastics in every setter. */
private inline fun <T> MutableStateFlow<T>.update(transform: (T) -> T) {
    value = transform(value)
}
