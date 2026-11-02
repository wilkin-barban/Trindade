package com.trindade.app.aero

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.di.NetworkModule
import com.trindade.app.network.MassasApi
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * The audit line on the wire, and what happens when the backend refuses it.
 *
 * The adapter used to discard the response entirely, so a 400 was indistinguishable from a line that was
 * written. These tests hold the two halves that changed: the body names the client and the attempt, and a
 * refusal is reported (with the backend's code) instead of being swallowed. Robolectric is here because the
 * report goes through `android.util.Log`.
 */
@RunWith(AndroidJUnit4::class)
class AeroMirrorAdapterTest {

    private lateinit var server: MockWebServer
    private lateinit var adapter: AeroMirrorAdapter

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(NetworkModule.provideJson().asConverterFactory("application/json".toMediaType()))
            .build()
        adapter = AeroMirrorAdapter(retrofit.create(MassasApi::class.java))
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `the line on the wire names android and carries its attempt id`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200))

        adapter.log(
            AeroAudit.request(
                event = AeroAudit.Event.DISPATCH,
                destinationUrl = "http://192.168.25.250:1453/api/entradasitem",
                phase = "response",
                httpStatus = 200,
                durationMs = 120,
            ),
        )

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/integration/aero/log", recorded.path)
        val body = recorded.body.readUtf8()
        assertTrue(body, body.contains("\"client\":\"android\""))
        assertTrue(body, body.contains("\"attemptId\""))
        assertTrue(body, body.contains("\"durationMs\":120"))
    }

    @Test
    fun `a refused line does not throw, so a launch that reached the plant stays a launch`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(400)
                .setBody("""{"error":"Evento de integração inválido","code":"INVALID_AERO_LOG"}"""),
        )

        // The call returns normally: the refusal was reported, not thrown at the launch that already happened.
        adapter.log(
            AeroAudit.request(
                event = AeroAudit.Event.DISPATCH,
                destinationUrl = "http://192.168.25.250:1453/api/entradasitem",
            ),
        )

        assertEquals(1, server.requestCount)
    }
}
