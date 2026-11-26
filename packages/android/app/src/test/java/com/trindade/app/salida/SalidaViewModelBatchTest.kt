package com.trindade.app.salida

import androidx.lifecycle.viewModelScope
import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroMirrorPort
import com.trindade.app.aero.AeroSettings
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.aero.ERP_DISPATCH_TIMEOUT_MS
import com.trindade.app.contract.models.PhotosResponse
import com.trindade.app.contract.models.SalidaCatalogResponse
import com.trindade.app.contract.models.SalidaCreateRequest
import com.trindade.app.contract.models.SalidaCreateResponse
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaErpResultRequest
import com.trindade.app.contract.models.SalidaErpResultResponse
import com.trindade.app.contract.models.SalidaHistoryResponse
import com.trindade.app.contract.models.SalidaHistoryResponseDaysInner
import com.trindade.app.contract.models.SalidaListResponse
import com.trindade.app.contract.models.SalidaMovementErp
import com.trindade.app.contract.models.SalidaMovementItemsInner
import com.trindade.app.contract.models.SalidaMovementReconciliation
import com.trindade.app.contract.models.SalidaPhotoResponse
import com.trindade.app.di.NetworkModule
import com.trindade.app.network.AeroAuditLogRequest
import com.trindade.app.network.AeroMovementsStoredDay
import com.trindade.app.network.SalidaApi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.MultipartBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class SalidaViewModelBatchTest {

    private class StubSalidaApi : SalidaApi {
        override suspend fun catalog(): Response<SalidaCatalogResponse> = Response.success(null)
        override suspend fun create(body: SalidaCreateRequest): Response<SalidaCreateResponse> = Response.success(null)
        override suspend fun day(date: String): Response<SalidaListResponse> = Response.success(null)
        override suspend fun history(): Response<SalidaHistoryResponse> = Response.success(null)
        override suspend fun recordErpResult(id: Int, body: SalidaErpResultRequest): Response<SalidaErpResultResponse> =
            Response.success(null)
        override suspend fun photos(id: Int): Response<PhotosResponse> = Response.success(null)
        override suspend fun uploadPhoto(id: Int, file: MultipartBody.Part): Response<SalidaPhotoResponse> =
            Response.success(null)
        override suspend fun deleteMovement(movementId: Int): Response<Unit> = Response.success(Unit)
        override suspend fun deletePhoto(photoId: Int): Response<Unit> = Response.success(Unit)
    }

    private object NoopMirror : AeroMirrorPort {
        override suspend fun saveMovements(
            date: String,
            movements: List<com.trindade.app.aero.AeroErpMovement>,
        ) = com.trindade.app.aero.AeroSnapshotSave.Saved(com.trindade.app.network.AeroMovementsSaved())

        override suspend fun log(request: AeroAuditLogRequest) = Unit
    }

    private class DummySettings : AeroSettingsPort {
        override fun load(): AeroSettings = AeroSettings(wsUrl = "http://127.0.0.1:9/api", username = "w", password = "p")
        override fun save(settings: AeroSettings) = Unit
        override fun isConfigured(): Boolean = true
        override fun syncedAt(date: String): String? = null
        override fun markSynced(date: String, at: String) = Unit
    }

    private class DummyOutbox : SalidaOutboxPort {
        override fun save(outbox: SalidaOutbox) = Unit
        override fun load(): SalidaOutbox? = null
        override fun clear() = Unit
        override fun advance(outbox: SalidaOutbox): SalidaOutbox? = null
    }

    private inner class FakeBatchRepository : SalidaRepository(
        api = StubSalidaApi(),
        erpClient = AeroErpClient(NetworkModule.provideJson()),
        settings = DummySettings(),
        outbox = DummyOutbox(),
        audit = SalidaAudit(NoopMirror),
        photoClient = null,
    ) {
        var sendGate: CompletableDeferred<Unit>? = null
        val pendingIds = mutableSetOf<Int>()

        override suspend fun catalog(): List<SalidaCatalog.Product> = SalidaCatalog.products
        override suspend fun day(date: String): List<SalidaCreateResponseMovement> = emptyList()
        override suspend fun history(): List<SalidaHistoryResponseDaysInner> = emptyList()

        override suspend fun create(selection: SalidaSelection): Result<SalidaCreateResponseMovement> =
            Result.success(
                movement(
                    id = 91,
                    status = null,
                    codes = selection.lines.map { it.code },
                ),
            )

        override suspend fun sendToErp(
            movement: SalidaCreateResponseMovement,
            username: String?,
        ): SalidaErpOutcome {
            sendGate?.await()
            return SalidaErpOutcome.Complete(movement.items.size)
        }

        override fun hasPendingOutbox(movementId: Int): Boolean = movementId in pendingIds
    }

    private val createdVms = mutableListOf<SalidaViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        runBlocking {
            createdVms.forEach { it.viewModelScope.coroutineContext[Job]?.cancelAndJoin() }
        }
        createdVms.clear()
        Dispatchers.resetMain()
    }

    @Test
    fun `confirmLaunch keeps multi-item timeout alive past single-item 25s floor`() = runTest {
        val repo = FakeBatchRepository()
        val gate = CompletableDeferred<Unit>()
        repo.sendGate = gate
        val vm = SalidaViewModel(repo).also { createdVms += it }
        advanceUntilIdle()

        vm.setQuantity("1357", "2")
        vm.setQuantity("1356", "2")
        vm.setQuantity("1355", "2")
        vm.setQuantity("1358", "2")
        vm.requestLaunch()
        vm.confirmLaunch("wilkin")
        testScheduler.runCurrent()

        testScheduler.advanceTimeBy(ERP_DISPATCH_TIMEOUT_MS + 2_000L)
        testScheduler.runCurrent()
        gate.complete(Unit)
        advanceUntilIdle()

        val notice = vm.state.value.notice
        assertFalse("Multi-item batch must not time out at 25s: ${notice?.message}", notice?.isError == true)
        assertTrue(notice?.message.orEmpty().contains("4"))
    }

    @Test
    fun `isPending treats partial movement as resendable only while local outbox holds unsent items`() = runTest {
        val repo = FakeBatchRepository()
        val vm = SalidaViewModel(repo).also { createdVms += it }
        advanceUntilIdle()

        val partial = movement(id = 77, status = SalidaMovementErp.Status.partial, codes = listOf("1357", "1356"))
        assertFalse(vm.isPending(partial))

        repo.pendingIds += 77
        assertTrue(vm.isPending(partial))
        assertEquals(0, vm.pendingCount())
    }

    private fun movement(
        id: Int,
        status: SalidaMovementErp.Status?,
        codes: List<String>,
    ) = SalidaCreateResponseMovement(
        id = id,
        movementDate = "2026-11-26",
        userId = 1,
        username = "wilkin",
        displayName = "Wilkin",
        createdAt = "2026-11-26T10:00:00.000Z",
        items = codes.mapIndexed { idx, code ->
            SalidaMovementItemsInner(
                id = id * 10 + idx,
                productCode = code,
                productName = "PRODUCT $code",
                block = SalidaMovementItemsInner.Block.embalagens,
                quantity = 2,
                position = idx,
            )
        },
        photos = emptyList(),
        totalUnits = codes.size * 2,
        reconciliation = SalidaMovementReconciliation(
            status = SalidaMovementReconciliation.Status.pending,
            entLans = emptyList(),
            matchedItemIds = emptyList(),
        ),
        erp = status?.let { SalidaMovementErp(status = it, message = null, sentAt = "2026-11-26T10:00:00.000Z") },
    )
}
