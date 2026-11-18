package com.trindade.app.auth

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
import com.trindade.app.contract.models.UpdateProfileRequest
import com.trindade.app.network.AuthApi
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

/**
 * La ventana de gracia no es un cierre de sesión.
 *
 * El servidor rota el par en cada refresh, pero tolera que el cliente presente el token anterior durante unos
 * segundos: en esa ventana contesta 200 con un access token nuevo y **sin** refresh token rotado. La app leía la
 * ausencia del refresh token como un refresh fallido, y el interceptor cerraba la sesión con el primer 401 que
 * llegara después. En planta eso se ve como un operario al que se le vacía la pantalla a mitad del turno.
 */
class AuthRefreshGraceTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `a refresh inside the grace window keeps the session and rotates only the access token`() = runBlocking {
        val store = FakeTokenStore(access = "old-access", refresh = "refresh-1")
        val api = RefreshApi(Response.success(RefreshResponse(token = "new-access", expiresIn = 900)))
        val repository = AuthRepository(api, store, json)

        assertTrue(repository.refresh())

        assertEquals("new-access", store.accessToken())
        // El refresh token no rotó: el guardado sigue siendo el válido y la sesión está viva.
        assertEquals("refresh-1", store.refreshToken())
        assertTrue(repository.hasSession())
    }

    @Test
    fun `a rotated pair is stored whole`() = runBlocking {
        val store = FakeTokenStore(access = "old-access", refresh = "refresh-1")
        val api = RefreshApi(
            Response.success(RefreshResponse(token = "new-access", expiresIn = 900, refreshToken = "refresh-2")),
        )
        val repository = AuthRepository(api, store, json)

        assertTrue(repository.refresh())

        assertEquals("new-access", store.accessToken())
        assertEquals("refresh-2", store.refreshToken())
    }

    @Test
    fun `a real refusal still ends the refresh`() = runBlocking {
        val store = FakeTokenStore(access = "old-access", refresh = "refresh-1")
        val body: ResponseBody = """{"error":"invalid refresh token"}""".toResponseBody("application/json".toMediaType())
        val api = RefreshApi(Response.error(401, body))
        val repository = AuthRepository(api, store, json)

        assertFalse(repository.refresh())
        // Quien decide cerrar la sesión es el interceptor, con este `false`: el repositorio no la toca.
        assertEquals("old-access", store.accessToken())
        assertEquals("refresh-1", store.refreshToken())
    }

    @Test
    fun `without a stored refresh token there is nothing to rotate`() = runBlocking {
        val store = FakeTokenStore(access = "old-access", refresh = null)
        // Sin refresh token el repositorio ni llama a la API: la respuesta nunca se usa.
        val repository = AuthRepository(
            RefreshApi(Response.success(RefreshResponse(token = "unused", expiresIn = 0))),
            store,
            json,
        )

        assertFalse(repository.refresh())
        assertNull(store.refreshToken())
    }

    private class RefreshApi(private val answer: Response<RefreshResponse>) : AuthApi {
        override suspend fun refresh(body: RefreshRequest): Response<RefreshResponse> = answer
        override suspend fun register(body: RegisterRequest): Response<RegisterResponse> = error("unused")
        override suspend fun login(body: LoginRequest): Response<LoginResponse> = error("unused")
        override suspend fun logout(body: LogoutRequest): Response<Unit> = error("unused")
        override suspend fun me(): Response<ProfileResponse> = error("unused")
        override suspend fun profile(): Response<ProfileResponse> = error("unused")
        override suspend fun updateProfile(body: UpdateProfileRequest): Response<ProfileResponse> = error("unused")
        override suspend fun changePassword(body: ChangePasswordRequest): Response<Unit> = error("unused")
        override suspend fun setupStatus(): Response<SetupStatusResponse> = error("unused")
    }

    private class FakeTokenStore(access: String? = null, refresh: String? = null) : TokenStore {
        private var accessToken: String? = access
        private var refreshToken: String? = refresh

        override fun accessToken(): String? = accessToken
        override fun refreshToken(): String? = refreshToken
        override fun role(): String? = null
        override fun save(accessToken: String, refreshToken: String) {
            this.accessToken = accessToken
            this.refreshToken = refreshToken
        }

        override fun saveAccessToken(accessToken: String) {
            this.accessToken = accessToken
        }

        override fun saveRole(role: String) = Unit
        override fun clear() {
            accessToken = null
            refreshToken = null
        }
    }
}
