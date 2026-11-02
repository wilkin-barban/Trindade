package com.trindade.app.aero

import com.trindade.app.di.NetworkModule
import com.trindade.app.network.AeroMovementsSaved
import com.trindade.app.network.MassasApi
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * The mirror adapter's only job is to say what the backend did with a snapshot.
 *
 * The backend's refusals carry a stable code, and the day a plant closes is the one that matters most: a 409
 * `MASSAS_HISTORY_FROZEN` used to arrive as the same `null` as a dead socket, so the screen offered a retry
 * that could never work. These cases pin the three answers apart at the wire.
 */
class AeroAdaptersTest {

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
    fun `keeps the status and code of a refused snapshot`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(409)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"error":"dia fechado","code":"MASSAS_HISTORY_FROZEN"}"""),
        )

        val result = adapter.saveMovements("2026-10-30", emptyList())

        assertEquals(AeroSnapshotSave.Refused(409, "MASSAS_HISTORY_FROZEN"), result)
    }

    @Test
    fun `reports the stored counts when the backend accepts the snapshot`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"saved":12,"massas":12,"insumos":0}"""),
        )

        val result = adapter.saveMovements("2026-10-30", emptyList())

        assertEquals(AeroSnapshotSave.Saved(AeroMovementsSaved(saved = 12, massas = 12, insumos = 0)), result)
    }

    @Test
    fun `says unreachable only when no answer arrived`() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val result = adapter.saveMovements("2026-10-30", emptyList())

        assertEquals(AeroSnapshotSave.Unreachable, result)
    }
}
