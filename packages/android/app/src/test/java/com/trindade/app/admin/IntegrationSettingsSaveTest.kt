package com.trindade.app.admin

import com.trindade.app.R
import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroDiagnosis
import com.trindade.app.aero.AeroReachabilityPort
import com.trindade.app.aero.AeroSettings
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.auth.AuthRepository
import com.trindade.app.auth.TokenStore
import com.trindade.app.contract.models.ChangePasswordRequest
import com.trindade.app.contract.models.LoginRequest
import com.trindade.app.contract.models.LoginResponse
import com.trindade.app.contract.models.LogoutRequest
import com.trindade.app.contract.models.ProfileResponse
import com.trindade.app.contract.models.RefreshRequest
import com.trindade.app.contract.models.RefreshResponse
import com.trindade.app.contract.models.RegisterRequest
import com.trindade.app.contract.models.RegisterResponse
import com.trindade.app.contract.models.SetupStatusResponse
import com.trindade.app.contract.models.SuccessResponse
import com.trindade.app.contract.models.UpdateProfileRequest
import com.trindade.app.massas.FakeMirrorPort
import com.trindade.app.network.AuthApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

/**
 * Saving the integration answers, in the operator's language and both ways.
 *
 * The defect this covers is quiet: `isSaving` existed and was never written, so the press that configures the
 * phone for the plant ended with no signal at all -- on a screen whose only other feedback is a probe. What is
 * asserted is the sentence after the press, the flag while it happens, and that a device that cannot write says
 * so instead of showing a success it did not have.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class IntegrationSettingsSaveTest {

    private lateinit var store: RecordingStore
    private lateinit var viewModel: IntegrationSettingsViewModel

    /**
     * The device, in memory: `save` records, and a test can make it refuse.
     */
    private class RecordingStore(
        var stored: AeroSettings = AeroSettings(),
        var failOnSave: Boolean = false,
    ) : AeroSettingsPort {
        var saves = 0

        override fun load(): AeroSettings = stored

        override fun save(settings: AeroSettings) {
            if (failOnSave) throw IllegalStateException("keystore indisponível")
            stored = settings
            saves++
        }

        override fun isConfigured(): Boolean = stored.ready

        override fun syncedAt(date: String): String? = null

        override fun markSynced(date: String, at: String) = Unit
    }

    /** Nothing here probes the plant: the save path never asks the network, and the test proves it. */
    private class NeverProbes : AeroReachabilityPort {
        var calls = 0

        override suspend fun diagnose(wsUrl: String?, timeoutMillis: Int): AeroDiagnosis {
            calls++
            return AeroDiagnosis(wifiConnected = false, hostReachable = null)
        }
    }

    private val reachability = NeverProbes()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        store = RecordingStore()
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        viewModel = IntegrationSettingsViewModel(
            store = store,
            client = AeroErpClient(json),
            reachability = reachability,
            authRepository = AuthRepository(NoAuthApi(), NoTokenStore(), json),
            audit = FakeMirrorPort(),
        )
    }

    @After
    fun tearDown() {
        viewModel.viewModelScope.cancel()
        Dispatchers.resetMain()
    }

    private fun fillIn(
        wsUrl: String = "http://192.168.25.250:1453/api",
        username: String = "WILKIN",
        password: String = "senha",
    ) {
        viewModel.setWsUrl(wsUrl)
        viewModel.setUsername(username)
        viewModel.setPassword(password)
    }

    @Test
    fun `saving says it saved and leaves no spinner behind`() {
        fillIn()

        viewModel.save()

        val state = viewModel.state.value
        assertFalse("el guardado ya terminó", state.isSaving)
        assertNotNull("el operario tiene que recibir una respuesta", state.message)
        assertEquals(R.string.admin_integration_saved, state.message?.resId)
        assertFalse("guardar bien no es un error", state.messageIsError)
        assertTrue("el dispositivo quedó configurado", state.isConfigured)
        assertEquals(1, store.saves)
        // The address and the credentials the form held are the ones written, not the defaults.
        assertEquals("WILKIN", store.stored.username)
        assertEquals("http://192.168.25.250:1453/api", store.stored.wsUrl)
        // Saving is not probing: the press costs the plant nothing.
        assertEquals(0, reachability.calls)
    }

    @Test
    fun `a device that refuses the write reports the failure instead of the success`() {
        fillIn()
        store.failOnSave = true

        viewModel.save()

        val state = viewModel.state.value
        assertFalse(state.isSaving)
        assertEquals(R.string.admin_integration_save_failed, state.message?.resId)
        assertTrue("un fallo se muestra como fallo", state.messageIsError)
        assertFalse("no quedó configurado", state.isConfigured)
    }

    @Test
    fun `an incomplete form is refused without writing anything`() {
        fillIn(password = "")

        viewModel.save()

        val state = viewModel.state.value
        assertEquals(R.string.admin_integration_incomplete, state.message?.resId)
        assertTrue(state.messageIsError)
        assertEquals("no se escribió nada", 0, store.saves)
    }

    @Test
    fun `clearing the message leaves no answer behind`() {
        fillIn()
        viewModel.save()

        viewModel.clearMessage()

        assertNull(viewModel.state.value.message)
        assertFalse(viewModel.state.value.messageIsError)
    }
}

/** Unused by the save path, and present because the view model takes the repository that reads the session. */
private class NoAuthApi : AuthApi {
    override suspend fun login(body: LoginRequest): Response<LoginResponse> = error("no se usa")
    override suspend fun refresh(body: RefreshRequest): Response<RefreshResponse> = error("no se usa")
    override suspend fun logout(body: LogoutRequest): Response<SuccessResponse> = error("no se usa")
    override suspend fun me(): Response<ProfileResponse> = error("no se usa")
    override suspend fun profile(): Response<ProfileResponse> = error("no se usa")
    override suspend fun updateProfile(body: UpdateProfileRequest): Response<ProfileResponse> = error("no se usa")
    override suspend fun changePassword(body: ChangePasswordRequest): Response<SuccessResponse> = error("no se usa")
    override suspend fun setupStatus(): Response<SetupStatusResponse> = error("no se usa")
    override suspend fun register(body: RegisterRequest): Response<RegisterResponse> = error("no se usa")
}

private class NoTokenStore : TokenStore {
    override fun accessToken(): String = "token"
    override fun refreshToken(): String = "refresh"
    override fun role(): String? = null
    override fun save(accessToken: String, refreshToken: String) = Unit
    override fun saveRole(role: String) = Unit
    override fun clear() = Unit
}
