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
import com.trindade.app.contract.models.SalidaMovementPhotosInner
import com.trindade.app.contract.models.SalidaMovementReconciliation
import com.trindade.app.contract.models.SalidaPhotoResponse
import com.trindade.app.di.NetworkModule
import com.trindade.app.export.ShareManager
import com.trindade.app.network.AeroAuditLogRequest
import com.trindade.app.network.SalidaApi
import androidx.lifecycle.viewModelScope
import com.trindade.app.reports.ReportPhotoFiles
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.MultipartBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

/**
 * Compartir una baja suelta con sus fotos.
 *
 * En la web la tarjeta de un movimiento comparte su texto y sus fotos. En Android el mismo botón llamaba a `wa.me`
 * con el texto: las fotos del movimiento no viajaban, y el callback que debía abrir la hoja del sistema estaba
 * descolgado en `{}`, así que el botón no hacía nada. Estas pruebas sostienen las dos mitades: el texto del
 * movimiento y las fotos de ese movimiento, no las del día.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SalidaMovementShareTest {

    private class RecordingShareManager : ShareManager {
        var text: String? = null
        var photos: List<File> = emptyList()
        var openedLink: String? = null
        override fun openLink(url: String): Boolean {
            openedLink = url
            return true
        }
        override fun shareText(text: String, title: String?): Boolean {
            this.text = text
            return true
        }
        override fun shareTextWithPhotos(text: String, photos: List<File>, title: String?): Boolean {
            this.text = text
            this.photos = photos
            return true
        }
        override fun sharePdf(file: File, title: String?): Boolean = true
        override fun shareApk(file: File, title: String?): Boolean = true
    }

    private class RecordingPhotoFiles(private val deliver: Boolean = true) : ReportPhotoFiles {
        var requested: List<String> = emptyList()
        override suspend fun download(urls: List<String>): List<File> {
            requested = urls
            if (!deliver) return emptyList()
            return urls.map { File.createTempFile("salida-", ".jpg").apply { writeText(it) } }
        }
    }

    private class InMemoryOutbox : SalidaOutboxPort {
        private var stored: SalidaOutbox? = null
        override fun save(outbox: SalidaOutbox) { stored = outbox }
        override fun load(): SalidaOutbox? = stored
        override fun clear() { stored = null }
        override fun advance(outbox: SalidaOutbox): SalidaOutbox? {
            val next = outbox.copy(done = outbox.done + 1)
            return if (next.isComplete) { clear(); null } else { save(next); next }
        }
    }

    /** The reads this screen does on open answer nothing; what is asserted here is the share, not the day. */
    private class QuietSalidaApi : SalidaApi {
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

    private class FixedSettings(private val current: AeroSettings) : AeroSettingsPort {
        override fun load(): AeroSettings = current
        override fun save(settings: AeroSettings) = Unit
        override fun isConfigured(): Boolean = current.ready
        override fun syncedAt(date: String): String? = null
        override fun markSynced(date: String, at: String) = Unit
    }

    private object NoopMirror : AeroMirrorPort {
        override suspend fun saveMovements(
            date: String,
            movements: List<com.trindade.app.aero.AeroErpMovement>,
        ): com.trindade.app.aero.AeroSnapshotSave =
            com.trindade.app.aero.AeroSnapshotSave.Saved(com.trindade.app.network.AeroMovementsSaved())

        override suspend fun log(request: AeroAuditLogRequest) = Unit
    }

    private fun repository() = SalidaRepository(
        api = QuietSalidaApi(),
        erpClient = AeroErpClient(NetworkModule.provideJson()),
        settings = FixedSettings(AeroSettings(wsUrl = "http://127.0.0.1:9/api", username = "w", password = "p")),
        outbox = InMemoryOutbox(),
        audit = SalidaAudit(NoopMirror),
        photoClient = null,
    )

    private fun photo(id: Int, url: String? = null) = SalidaMovementPhotosInner(
        id = id,
        filePath = "photo-$id.jpg",
        fileSize = 10,
        mimeType = "image/jpeg",
        createdAt = "2026-11-20T10:00:00.000Z",
        url = url ?: "https://host/api/salida/photos/$id.jpg",
        publicUrl = url ?: "https://host/api/salida/photos/$id.jpg",
    )

    private fun movement(photos: List<SalidaMovementPhotosInner>) = SalidaCreateResponseMovement(
        id = 77,
        movementDate = "2026-11-20",
        userId = 1,
        username = "wilkin",
        displayName = "Wilkin",
        createdAt = "2026-11-20T10:00:00.000Z",
        items = emptyList(),
        photos = photos,
        totalUnits = 3,
        reconciliation = SalidaMovementReconciliation(
            status = SalidaMovementReconciliation.Status.pending,
            entLans = emptyList(),
            matchedItemIds = emptyList(),
        ),
        erp = null,
    )

    /** Cada view model que este test construyó, para apagar su scope antes de resetear el dispatcher. */
    private val created = mutableListOf<SalidaViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        // Un scope que sigue vivo al terminar el test retoma en el `Main` del siguiente y kotlinx-coroutines-test
        // lo reporta como excepción no capturada antes de empezar: se cancela primero, como en Massas.
        created.forEach { it.viewModelScope.cancel() }
        created.clear()
        Dispatchers.resetMain()
    }

    private fun viewModel(
        share: ShareManager? = null,
        photos: ReportPhotoFiles? = null,
    ): SalidaViewModel = SalidaViewModel(
        repository(),
        shareManager = share,
        photoFiles = photos,
    ).also { created += it }

    @Test
    fun `a movement with photos downloads them and hands them to the share sheet`() = runTest {
        val share = RecordingShareManager()
        val photos = RecordingPhotoFiles()
        val viewModel = viewModel(share = share, photos = photos)

        val handled = viewModel.shareMovementWithPhotos(movement(listOf(photo(1), photo(2, url = "https://host/public/t2"))))
        advanceUntilIdle()

        assertTrue(handled)
        assertEquals(
            listOf("https://host/api/salida/photos/1.jpg", "https://host/public/t2"),
            photos.requested,
        )
        assertEquals(2, share.photos.size)
        // El texto es de esta baja, con su operario, no el resumen del día.
        assertTrue(share.text.orEmpty().contains("WILKIN"))
    }

    @Test
    fun `a movement without photos shares only the text`() = runTest {
        val share = RecordingShareManager()
        val photos = RecordingPhotoFiles()
        val viewModel = viewModel(share = share, photos = photos)

        val handled = viewModel.shareMovementWithPhotos(movement(emptyList()))
        advanceUntilIdle()

        assertTrue(handled)
        assertEquals(emptyList<String>(), photos.requested)
        assertTrue(share.photos.isEmpty())
        assertTrue(share.text.orEmpty().contains("WILKIN"))
    }

    @Test
    fun `if the photos cannot be downloaded the message still goes out alone`() = runTest {
        val share = RecordingShareManager()
        val viewModel = viewModel(share = share, photos = RecordingPhotoFiles(deliver = false))

        val handled = viewModel.shareMovementWithPhotos(movement(listOf(photo(1))))
        advanceUntilIdle()

        assertTrue(handled)
        assertTrue(share.photos.isEmpty())
        assertTrue(share.text.orEmpty().contains("WILKIN"))
    }

    @Test
    fun `without a share sheet nothing is dispatched and the screen falls back to the link`() = runTest {
        val viewModel = viewModel(share = null, photos = null)

        assertFalse(viewModel.shareMovementWithPhotos(movement(listOf(photo(1)))))
        assertNull(RecordingShareManager().text)
    }

    @Test
    fun `the whatsapp link is opened through the share manager, so the button is not a no-op`() = runTest {
        val share = RecordingShareManager()
        val viewModel = viewModel(share = share, photos = RecordingPhotoFiles())

        assertTrue(viewModel.openWhatsAppLink("https://wa.me/?text=hola"))
        assertEquals("https://wa.me/?text=hola", share.openedLink)
        // Un enlace vacío no abre nada: no hay nada que mandar.
        assertFalse(viewModel.openWhatsAppLink("  "))
    }
}
