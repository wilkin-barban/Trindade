package com.trindade.app.aero

import com.trindade.app.di.NetworkModule
import com.trindade.app.network.AeroAuditLogRequest
import com.trindade.app.network.AeroMovementsSaved
import com.trindade.app.network.MassasApi
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
    private lateinit var outbox: FakeOutbox

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(NetworkModule.provideJson().asConverterFactory("application/json".toMediaType()))
            .build()
        outbox = FakeOutbox()
        adapter = AeroMirrorAdapter(retrofit.create(MassasApi::class.java), outbox)
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
        assertEquals("android", server.takeRequest().headers["X-Trindade-Client"])
    }

    @Test
    fun `says unreachable only when no answer arrived`() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val result = adapter.saveMovements("2026-10-30", emptyList())

        assertEquals(AeroSnapshotSave.Unreachable, result)
    }

    @Test
    fun `keeps an audit line when the endpoint is unreachable`() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        adapter.log(auditLine())

        assertEquals(1, outbox.pending().size)
    }

    @Test
    fun `removes an audit line after the backend accepts it`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))

        adapter.log(auditLine())

        assertTrue(outbox.pending().isEmpty())
    }

    @Test
    fun `drops a malformed audit line instead of retrying it forever`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"code":"INVALID_AERO_LOG"}"""))

        adapter.log(auditLine())

        assertTrue(outbox.pending().isEmpty())
    }

    private fun auditLine() = AeroAuditLogRequest(
        event = AeroAudit.Event.SYNC,
        phase = "result",
        destinationUrl = "http://192.168.25.250:1453/api/movimentoitem",
        attemptId = "attempt-1",
        client = AeroAudit.CLIENT,
        appVersion = "0.7.0",
        buildNumber = 7007,
    )

    private class FakeOutbox : AeroAuditOutboxPort {
        val items = mutableListOf<QueuedAeroAudit>()

        override fun enqueue(request: AeroAuditLogRequest) {
            items.removeAll { it.request.attemptId == request.attemptId && it.request.phase == request.phase }
            items += QueuedAeroAudit(request, queuedAt = System.currentTimeMillis())
        }

        override fun pending(): List<QueuedAeroAudit> = items.toList()

        override fun remove(items: Collection<QueuedAeroAudit>) {
            this.items.removeAll(items.toSet())
        }
    }
}
