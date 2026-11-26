package com.trindade.app.salida

import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroMirrorPort
import com.trindade.app.aero.AeroSettings
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.aero.ErpTrip
import com.trindade.app.aero.withErpTimeout
import com.trindade.app.contract.models.PhotosResponse
import com.trindade.app.contract.models.SalidaCatalogResponse
import com.trindade.app.contract.models.SalidaCreateRequest
import com.trindade.app.contract.models.SalidaCreateResponse
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaErpResultRequest
import com.trindade.app.contract.models.SalidaErpResultResponse
import com.trindade.app.contract.models.SalidaHistoryResponse
import com.trindade.app.contract.models.SalidaListResponse
import com.trindade.app.contract.models.SalidaMovementErp
import com.trindade.app.contract.models.SalidaMovementItemsInner
import com.trindade.app.contract.models.SalidaMovementReconciliation
import com.trindade.app.contract.models.SalidaPhotoResponse
import com.trindade.app.di.NetworkModule
import com.trindade.app.network.AeroAuditLogRequest
import com.trindade.app.network.SalidaApi
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import okhttp3.MultipartBody
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

/**
 * El reenvío de una baja que quedó pendiente.
 *
 * Dos reglas se sostienen acá, y las dos se rompieron en producción. La primera: reenviar al ERP no alcanza,
 * porque el histórico lee el estado del servidor de Trindade y sin `recordErpResult` el documento sigue clavado
 * en `failed` aunque el ERP lo haya recibido. La segunda: la cola local puede no existir -- se reinstaló la app,
 * se limpiaron los datos -- y un movimiento en fallo tiene que poder rearmarse desde sus propios ítems, con la
 * fecha del documento y no la de hoy.
 */
class SalidaRetryPendingTest {

    private lateinit var server: MockWebServer
    private lateinit var api: RecordingSalidaApi
    private lateinit var outbox: InMemoryOutbox
    private lateinit var repository: SalidaRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = RecordingSalidaApi()
        outbox = InMemoryOutbox()
        repository = SalidaRepository(
            api = api,
            erpClient = AeroErpClient(NetworkModule.provideJson()),
            settings = FixedSettings(
                AeroSettings(
                    wsUrl = server.url("/api").toString().trimEnd('/'),
                    username = "wilkin",
                    password = "secret",
                ),
            ),
            outbox = outbox,
            audit = SalidaAudit(NoopMirror),
            photoClient = null,
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun body(request: RecordedRequest): String = request.body.readUtf8()

    @Test
    fun `a successful retry records the verdict in trindade so the history stops showing it as failed`() =
        runBlocking {
            server.enqueue(MockResponse().setBody("""{"success":true}"""))
            outbox.save(
                SalidaOutbox(
                    movementId = 29,
                    date = "2026-11-24",
                    trips = listOf(listOf(payload("1357", 20, "2026-11-24"))),
                ),
            )

            val outcome = repository.retryPending()

            assertTrue(outcome is SalidaErpOutcome.Complete)
            assertEquals(listOf(29 to SalidaErpResultRequest.Status.sent), api.recorded)
        }

    @Test
    fun `an empty outbox rebuilds the trip from the failed movement items and records sent`() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"success":true}"""))

        val outcome = repository.retryPending(movement(id = 29, status = SalidaMovementErp.Status.failed))

        assertTrue(outcome is SalidaErpOutcome.Complete)
        assertEquals(listOf(29 to SalidaErpResultRequest.Status.sent), api.recorded)
        // El documento se rearmó con la fecha del movimiento, no con la del teléfono.
        val sent = body(server.takeRequest())
        assertTrue("the rebuilt body must carry the movement date", sent.contains("\"PED_DTA\":\"2026-11-22\""))
        assertTrue(sent.contains("\"PRO_COD\":\"001357\""))
    }

    @Test
    fun `a reconciled movement is never rebuilt, because the erp already has it`() = runBlocking {
        val outcome = repository.retryPending(movement(id = 30, status = SalidaMovementErp.Status.sent))

        assertTrue(outcome is SalidaErpOutcome.Skipped)
        assertTrue(api.recorded.isEmpty())
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `no queue and no movement stays a skip, exactly as before`() = runBlocking {
        val outcome = repository.retryPending()

        assertTrue(outcome is SalidaErpOutcome.Skipped)
        assertTrue(api.recorded.isEmpty())
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `a failed retry records failed instead of pretending the document travelled`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(500).setBody("""{"success":false}"""))
        outbox.save(
            SalidaOutbox(
                movementId = 31,
                date = "2026-11-24",
                trips = listOf(listOf(payload("1357", 20, "2026-11-24"))),
            ),
        )

        val outcome = repository.retryPending()

        assertTrue(outcome is SalidaErpOutcome.Failed)
        assertEquals(listOf(31 to SalidaErpResultRequest.Status.failed), api.recorded)
        // La cola sigue ahí para el próximo intento.
        assertEquals(31, outbox.load()?.movementId)
    }

    @Test
    fun `sendToErp persists outbox before first call and removes only confirmed payloads individually`() = runBlocking {
        val snapshotsAtRequest = mutableListOf<List<String>>()
        server.dispatcher = object : Dispatcher() {
            private var callIndex = 0
            override fun dispatch(request: RecordedRequest): MockResponse {
                snapshotsAtRequest.add(outbox.loadFor(41)?.pendingTrips?.flatten()?.map { it.PRO_COD }.orEmpty())
                return when (callIndex++) {
                    0, 1 -> MockResponse().setBody("""{"success":true}""")
                    2 -> MockResponse().setResponseCode(500).setBody("""{"success":false,"message":"saldo"}""")
                    else -> MockResponse().setBody("""{"success":true}""")
                }
            }
        }
        val fourItems = multiItemMovement(41, null, listOf("1357", "1356", "1355", "1358"))

        val outcome = repository.sendToErp(fourItems, "wilkin")

        assertTrue(outcome is SalidaErpOutcome.Partial)
        assertEquals(
            listOf(
                listOf("001357", "001356", "001355", "001358"),
                listOf("001356", "001355", "001358"),
                listOf("001355", "001358"),
                listOf("001355", "001358"),
            ),
            snapshotsAtRequest,
        )
        assertEquals(listOf("001355"), outbox.loadFor(41)?.pendingTrips?.flatten()?.map { it.PRO_COD })
        assertEquals(listOf(41 to SalidaErpResultRequest.Status.partial), api.recorded)

        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                MockResponse().setBody("""{"success":true}""")
        }
        val retryOutcome = repository.retryPending(fourItems, "wilkin")
        assertTrue(retryOutcome is SalidaErpOutcome.Complete)
        assertNull(outbox.loadFor(41))
        assertEquals(5, server.requestCount)
    }

    @Test
    fun `sendToErp breaks loop on transport failure and keeps unsent payloads queued`() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"success":true}"""))
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Length", "100").setBody("""{"suc"""))
        val fourItems = multiItemMovement(42, null, listOf("1357", "1356", "1355", "1358"))

        val outcome = repository.sendToErp(fourItems, "wilkin")

        assertTrue(outcome is SalidaErpOutcome.Partial)
        assertEquals(2, server.requestCount)
        assertEquals(
            listOf("001356", "001355", "001358"),
            outbox.loadFor(42)?.pendingTrips?.flatten()?.map { it.PRO_COD },
        )
        assertEquals(listOf(42 to SalidaErpResultRequest.Status.partial), api.recorded)
    }

    @Test
    fun `sendToErp persists remaining outbox and partial verdict inside NonCancellable on mid-batch timeout`() =
        runBlocking {
            server.enqueue(MockResponse().setBody("""{"success":true}"""))
            server.enqueue(MockResponse().setBodyDelay(5, TimeUnit.SECONDS).setBody("""{"success":true}"""))
            val threeItems = multiItemMovement(43, null, listOf("1357", "1356", "1355"))

            val trip = withErpTimeout(250L) { repository.sendToErp(threeItems, "wilkin") }

            assertEquals(ErpTrip.TimedOut, trip)
            assertEquals(
                listOf("001356", "001355"),
                outbox.loadFor(43)?.pendingTrips?.flatten()?.map { it.PRO_COD },
            )
            assertEquals(listOf(43 to SalidaErpResultRequest.Status.partial), api.recorded)
        }

    @Test
    fun `sendToErp persists full outbox and failed verdict inside NonCancellable when first item times out`() =
        runBlocking {
            server.enqueue(MockResponse().setBodyDelay(5, TimeUnit.SECONDS).setBody("""{"success":true}"""))
            val threeItems = multiItemMovement(44, null, listOf("1357", "1356", "1355"))

            val trip = withErpTimeout(250L) { repository.sendToErp(threeItems, "wilkin") }

            assertEquals(ErpTrip.TimedOut, trip)
            assertEquals(
                listOf("001357", "001356", "001355"),
                outbox.loadFor(44)?.pendingTrips?.flatten()?.map { it.PRO_COD },
            )
            assertEquals(listOf(44 to SalidaErpResultRequest.Status.failed), api.recorded)
        }

    @Test
    fun `retryPending preserves partial backend verdict when prior partial movement fails remaining items`() =
        runBlocking {
            server.enqueue(MockResponse().setResponseCode(500).setBody("""{"success":false}"""))
            outbox.save(
                SalidaOutbox(
                    movementId = 45,
                    date = "2026-11-24",
                    trips = listOf(listOf(payload("1356", 20, "2026-11-24"))),
                ),
            )
            val partialMovement = movement(id = 45, status = SalidaMovementErp.Status.partial)

            val outcome = repository.retryPending(partialMovement, "wilkin")

            assertTrue(outcome is SalidaErpOutcome.Failed)
            assertEquals(listOf(45 to SalidaErpResultRequest.Status.partial), api.recorded)
            assertEquals(listOf("001356"), outbox.loadFor(45)?.pendingTrips?.flatten()?.map { it.PRO_COD })
        }

    // ---- fixtures ----

    private fun multiItemMovement(
        id: Int,
        status: SalidaMovementErp.Status?,
        codes: List<String>,
    ): SalidaCreateResponseMovement = SalidaCreateResponseMovement(
        id = id,
        movementDate = "2026-11-22",
        userId = 1,
        username = "wilkin",
        displayName = "Wilkin",
        createdAt = "2026-11-22T11:00:00.000Z",
        items = codes.mapIndexed { idx, code ->
            SalidaMovementItemsInner(
                id = id * 100 + idx,
                productCode = code,
                productName = "PRODUCT $code",
                block = SalidaMovementItemsInner.Block.embalagens,
                quantity = 20,
                position = idx,
            )
        },
        photos = emptyList(),
        totalUnits = codes.size * 20,
        reconciliation = SalidaMovementReconciliation(
            status = SalidaMovementReconciliation.Status.pending,
            entLans = emptyList(),
            matchedItemIds = emptyList(),
        ),
        erp = status?.let { SalidaMovementErp(status = it, message = null, sentAt = "2026-11-22T11:00:00.000Z") },
    )

    private fun payload(code: String, quantity: Int, date: String): SaidaItemPayload =
        SalidaErpPayload.payload(SalidaLine(code, quantity), date, "wilkin")!!

    private fun movement(id: Int, status: SalidaMovementErp.Status): SalidaCreateResponseMovement =
        SalidaCreateResponseMovement(
            id = id,
            movementDate = "2026-11-22",
            userId = 1,
            username = "wilkin",
            displayName = "Wilkin",
            createdAt = "2026-11-22T11:00:00.000Z",
            items = listOf(
                SalidaMovementItemsInner(
                    id = id * 10,
                    productCode = "1357",
                    productName = "EMBALAG. DISCO 200g",
                    block = SalidaMovementItemsInner.Block.embalagens,
                    quantity = 20,
                    position = 0,
                ),
            ),
            photos = emptyList(),
            totalUnits = 20,
            reconciliation = SalidaMovementReconciliation(
                status = SalidaMovementReconciliation.Status.pending,
                entLans = emptyList(),
                matchedItemIds = emptyList(),
            ),
            erp = SalidaMovementErp(status = status, message = null, sentAt = "2026-11-22T11:00:00.000Z"),
        )

    @Test
    fun `sendToErp with 10 items across 2 trips settles individually and retries only the refused item`() = runBlocking {
        val tenCodes = listOf("1357", "1356", "1355", "1358", "1359", "1361", "1307", "1625", "1354", "1528")
        server.dispatcher = object : Dispatcher() {
            private var callIdx = 0
            override fun dispatch(request: RecordedRequest): MockResponse =
                if (callIdx++ == 8) MockResponse().setResponseCode(422).setBody("""{"success":false,"message":"saldo"}""")
                else MockResponse().setBody("""{"success":true}""")
        }
        val tenItems = multiItemMovement(101, null, tenCodes)
        val outcome = repository.sendToErp(tenItems, "wilkin")

        assertTrue(outcome is SalidaErpOutcome.Partial)
        assertEquals(listOf("001354"), outbox.loadFor(101)?.pendingTrips?.flatten()?.map { it.PRO_COD })
        assertEquals(listOf(101 to SalidaErpResultRequest.Status.partial), api.recorded)
        assertEquals(10, server.requestCount)

        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = MockResponse().setBody("""{"success":true}""")
        }
        val retryOutcome = repository.retryPending(movement(101, SalidaMovementErp.Status.partial), "wilkin")
        assertTrue(retryOutcome is SalidaErpOutcome.Complete)
        assertNull(outbox.loadFor(101))
        assertEquals(11, server.requestCount)
        assertEquals(
            listOf(101 to SalidaErpResultRequest.Status.partial, 101 to SalidaErpResultRequest.Status.sent),
            api.recorded,
        )
    }

    @Test
    fun `retryPending on prior partial movement keeps partial status inside NonCancellable even when timeout hits first item`() = runBlocking {
        server.enqueue(MockResponse().setBodyDelay(5, TimeUnit.SECONDS).setBody("""{"success":true}"""))
        val p1 = payload("1354", 2, "2026-11-26")
        val p2 = payload("1528", 2, "2026-11-26")
        outbox.save(SalidaOutbox(movementId = 102, date = "2026-11-26", trips = listOf(listOf(p1, p2))))
        val partialMov = multiItemMovement(102, SalidaMovementErp.Status.partial, listOf("1357", "1354", "1528"))

        val trip = withErpTimeout(200L) { repository.retryPending(partialMov, "wilkin") }

        assertEquals(ErpTrip.TimedOut, trip)
        assertEquals(listOf("001354", "001528"), outbox.loadFor(102)?.pendingTrips?.flatten()?.map { it.PRO_COD })
        assertEquals(listOf(102 to SalidaErpResultRequest.Status.partial), api.recorded)
    }

    @Test
    fun `sendToErp when not configured saves outbox so hasPendingOutbox and pendingItemCount remain accurate`() = runBlocking {
        val unconfiguredRepo = SalidaRepository(
            api = api,
            erpClient = AeroErpClient(NetworkModule.provideJson()),
            settings = FixedSettings(AeroSettings()),
            outbox = outbox,
            audit = SalidaAudit(NoopMirror),
            photoClient = null,
        )
        val threeItems = multiItemMovement(103, null, listOf("1357", "1356", "1355"))
        val outcome = unconfiguredRepo.sendToErp(threeItems, "wilkin")

        assertEquals(SalidaErpOutcome.NotConfigured, outcome)
        assertTrue(unconfiguredRepo.hasPendingOutbox(103))
        assertEquals(3, unconfiguredRepo.pendingItemCount(threeItems))
    }
}

/** Lo único que este test le pide a la API de Trindade: que anote el veredicto que recibió. */
private class RecordingSalidaApi : SalidaApi {
    val recorded = mutableListOf<Pair<Int, SalidaErpResultRequest.Status>>()

    override suspend fun recordErpResult(id: Int, body: SalidaErpResultRequest): Response<SalidaErpResultResponse> {
        recorded += id to body.status
        return Response.success<SalidaErpResultResponse>(null)
    }

    override suspend fun catalog(): Response<SalidaCatalogResponse> = unused()
    override suspend fun create(body: SalidaCreateRequest): Response<SalidaCreateResponse> = unused()
    override suspend fun day(date: String): Response<SalidaListResponse> = unused()
    override suspend fun history(): Response<SalidaHistoryResponse> = unused()
    override suspend fun photos(id: Int): Response<PhotosResponse> = unused()
    override suspend fun uploadPhoto(id: Int, file: MultipartBody.Part): Response<SalidaPhotoResponse> = unused()
    override suspend fun deleteMovement(movementId: Int): Response<Unit> = unused()
    override suspend fun deletePhoto(photoId: Int): Response<Unit> = unused()

    private fun <T> unused(): Response<T> = error("this test only writes the verdict")
}

/** La cola, en memoria: lo que se prueba es el reenvío, no las preferencias de Android. */
private class InMemoryOutbox : SalidaOutboxPort {
    private val entries = linkedMapOf<Int, SalidaOutbox>()

    override fun save(outbox: SalidaOutbox) {
        entries[outbox.movementId] = outbox
    }

    override fun load(): SalidaOutbox? = entries.values.firstOrNull()

    override fun loadFor(movementId: Int): SalidaOutbox? = entries[movementId]

    override fun clear() {
        entries.clear()
    }

    override fun clearFor(movementId: Int) {
        entries.remove(movementId)
    }

    override fun advance(outbox: SalidaOutbox): SalidaOutbox? {
        val next = outbox.copy(done = outbox.done + 1)
        return if (next.isComplete) {
            clearFor(outbox.movementId)
            null
        } else {
            save(next)
            next
        }
    }
}

private class FixedSettings(private val current: AeroSettings) : AeroSettingsPort {
    override fun load(): AeroSettings = current
    override fun save(settings: AeroSettings) = Unit
    override fun isConfigured(): Boolean = current.ready
    override fun syncedAt(date: String): String? = null
    override fun markSynced(date: String, at: String) = Unit
}

/** La auditoría no es lo que este test mide: el viaje al ERP y el veredicto sí. */
private object NoopMirror : AeroMirrorPort {
    override suspend fun saveMovements(
        date: String,
        movements: List<com.trindade.app.aero.AeroErpMovement>,
    ): com.trindade.app.aero.AeroSnapshotSave =
        com.trindade.app.aero.AeroSnapshotSave.Saved(com.trindade.app.network.AeroMovementsSaved())

    override suspend fun log(request: AeroAuditLogRequest) = Unit
}
