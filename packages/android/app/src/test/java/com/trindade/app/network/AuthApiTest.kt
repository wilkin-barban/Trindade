package com.trindade.app.network

import com.trindade.app.contract.models.ChangePasswordRequest
import com.trindade.app.contract.models.LogoutRequest
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * The two auth calls whose success body the client has no use for.
 *
 * The server answers `{"success":true}`: a JSON boolean. The generated `SuccessResponse` model types that
 * field as an enum literal, so a call declared with it threw while decoding a 200 and the repository read a
 * successful logout as an unreachable server. These are the tests that would have caught it, because they
 * exercise the wire the server actually writes instead of a body invented to match the model.
 */
class AuthApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: AuthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
        api = retrofit.create(AuthApi::class.java)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `logout reads the boolean success body as success`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"success":true}""")
        )

        val response = api.logout(LogoutRequest(refreshToken = "refresh-token"))

        assertTrue("a 200 with {\"success\":true} is a success", response.isSuccessful)
        assertEquals(200, response.code())
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/auth/logout", recorded.path)
    }

    @Test
    fun `changePassword reads the boolean success body as success`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"success":true}""")
        )

        val response = api.changePassword(
            ChangePasswordRequest(currentPassword = "actual", newPassword = "nueva-clave-123"),
        )

        assertTrue("a 200 with {\"success\":true} is a success", response.isSuccessful)
        assertEquals(200, response.code())
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/auth/change-password", recorded.path)
    }

    @Test
    fun `a refused logout is still a readable answer and not a decode failure`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"error":"Sessão expirada"}""")
        )

        val response = api.logout(LogoutRequest(refreshToken = "expired"))

        assertEquals(401, response.code())
        assertTrue(
            "the refusal keeps the server's sentence",
            response.errorBody()?.string()?.contains("Sessão expirada") == true,
        )
    }
}
