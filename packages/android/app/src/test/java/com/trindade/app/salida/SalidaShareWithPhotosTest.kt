package com.trindade.app.salida

import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaHistoryResponseDaysInner
import com.trindade.app.contract.models.SalidaMovementPhotosInner
import com.trindade.app.export.ShareManager
import com.trindade.app.reports.ReportPhotoFiles
import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El share general del día lleva sus fotos.
 *
 * En la web `shareSalida({text, photos})` las adjunta en la hoja del sistema; en Android el botón abría `wa.me` con
 * el texto y las miniaturas decoraban una acción que no las mandaba. La foto que sólo tiene `url` (sin token
 * público) también viaja, igual que en la miniatura y en el Relatório.
 */
class SalidaShareWithPhotosTest {
    private class RecordingShareManager : ShareManager {
        var text: String? = null
        var photos: List<File> = emptyList()
        override fun openLink(url: String): Boolean = true
        override fun shareText(text: String, title: String?): Boolean { this.text = text; return true }
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

    private fun photo(id: Int, publicUrl: String? = null, url: String = "https://host/api/salida/photos/$id.jpg") =
        SalidaMovementPhotosInner(
            id = id,
            filePath = "photo-$id.jpg",
            fileSize = 10,
            mimeType = "image/jpeg",
            createdAt = "2026-11-20T10:00:00.000Z",
            url = url,
            publicUrl = publicUrl ?: url,
        )

    private fun movement(photos: List<SalidaMovementPhotosInner>) = SalidaCreateResponseMovement(
        id = 10,
        movementDate = "2026-11-20",
        userId = 1,
        username = "wilkin",
        displayName = "Wilkin",
        createdAt = "2026-11-20T10:00:00.000Z",
        items = emptyList(),
        photos = photos,
        totalUnits = 1,
        reconciliation = com.trindade.app.contract.models.SalidaMovementReconciliation(
            status = com.trindade.app.contract.models.SalidaMovementReconciliation.Status.pending,
            entLans = emptyList(),
            matchedItemIds = emptyList(),
        ),
        erp = null,
    )

    @Test
    fun `a photo with only the authenticated url still travels`() {
        val day = SalidaHistoryResponseDaysInner(
            date = "2026-11-20",
            totalUnits = 1,
            movements = listOf(movement(listOf(photo(1, publicUrl = null)))),
        )

        assertEquals(listOf("https://host/api/salida/photos/1.jpg"), salidaSharePhotoUrls(day))
    }

    @Test
    fun `the public url wins when there is one`() {
        val day = SalidaHistoryResponseDaysInner(
            date = "2026-11-20",
            totalUnits = 1,
            movements = listOf(movement(listOf(photo(1, publicUrl = "https://host/public/t1")))),
        )

        assertEquals(listOf("https://host/public/t1"), salidaSharePhotoUrls(day))
    }

    @Test
    fun `the day share hands the downloaded files to the share sheet`() = runTest {
        val share = RecordingShareManager()
        val photos = RecordingPhotoFiles()

        val handled = shareSalidaWithPhotos("Salidas del día", listOf("https://host/p/1"), share, photos)

        assertTrue(handled)
        assertEquals(listOf("https://host/p/1"), photos.requested)
        assertEquals(1, share.photos.size)
        assertEquals("Salidas del día", share.text)
    }

    @Test
    fun `without photos the screen keeps the link and nothing is shared`() = runTest {
        val share = RecordingShareManager()
        val photos = RecordingPhotoFiles()

        assertFalse(shareSalidaWithPhotos("Salidas del día", emptyList(), share, photos))
        assertEquals(emptyList<String>(), photos.requested)
        assertNull(share.text)
    }

    @Test
    fun `if no photo arrives the message still goes out alone`() = runTest {
        val share = RecordingShareManager()

        val handled = shareSalidaWithPhotos("Salidas del día", listOf("https://host/p/1"), share, RecordingPhotoFiles(deliver = false))

        assertFalse("la pantalla puede caer al enlace, pero el texto no se pierde", handled)
        assertEquals(emptyList<File>(), share.photos)
        assertEquals("Salidas del día", share.text)
    }

    @Test
    fun `if no photo arrives and a recipient phone is provided the fallback opens that chat link`() = runTest {
        var opened: String? = null
        val share = object : ShareManager {
            var text: String? = null
            override fun openLink(url: String): Boolean {
                opened = url
                return true
            }
            override fun shareText(text: String, title: String?): Boolean {
                this.text = text
                return true
            }
            override fun sharePdf(file: File, title: String?): Boolean = true
            override fun shareApk(file: File, title: String?): Boolean = true
        }
        val photos = RecordingPhotoFiles(deliver = false)

        val handled = shareSalidaWithPhotosCandidates(
            text = "Salidas del día",
            candidates = listOf(listOf("https://host/p/1", "/api/salida/photos/1")),
            shareManager = share,
            photoFiles = photos,
            fallbackLink = "https://api.whatsapp.com/send?phone=5511999998888&text=Salidas",
        )

        assertFalse(handled)
        assertEquals("https://api.whatsapp.com/send?phone=5511999998888&text=Salidas", opened)
    }
}
