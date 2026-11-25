package com.trindade.app.salida

import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroMirrorPort
import com.trindade.app.aero.AeroSettings
import com.trindade.app.aero.AeroSettingsPort
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
import kotlinx.coroutines.runBlocking
import okhttp3.MultipartBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
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

    // ---- fixtures ----

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
    private var stored: SalidaOutbox? = null

    override fun save(outbox: SalidaOutbox) {
        stored = outbox
    }

    override fun load(): SalidaOutbox? = stored

    override fun clear() {
        stored = null
    }

    override fun advance(outbox: SalidaOutbox): SalidaOutbox? {
        val next = outbox.copy(done = outbox.done + 1)
        return if (next.isComplete) {
            clear()
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
