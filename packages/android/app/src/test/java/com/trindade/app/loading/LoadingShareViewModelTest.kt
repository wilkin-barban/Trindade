package com.trindade.app.loading

import com.trindade.app.contract.models.DriversResponseDriversInner
import com.trindade.app.contract.models.SchedulesResponseSchedulesInner
import com.trindade.app.export.PdfGenerator
import com.trindade.app.export.ShareManager
import com.trindade.app.ui.waMeLink
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class LoadingShareViewModelTest {

    @Before
    fun installMainDispatcher() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun restoreMainDispatcher() {
        Dispatchers.resetMain()
    }

    private class RecordingShareManager(
        private val opensLink: Boolean = true,
    ) : ShareManager {
        var lastSharedText: String? = null
        var lastSharedTitle: String? = null
        var lastSharedPdfFile: File? = null
        var lastOpenedLink: String? = null

        override fun openLink(url: String): Boolean {
            lastOpenedLink = url
            return opensLink
        }

        override fun shareText(text: String, title: String?): Boolean {
            lastSharedText = text
            lastSharedTitle = title
            return true
        }

        override fun sharePdf(file: File, title: String?): Boolean {
            lastSharedPdfFile = file
            return true
        }

        override fun shareApk(file: File, title: String?): Boolean = true
    }

    private fun fletero(id: Int, name: String, phone: String?) = DriversResponseDriversInner(
        id = id,
        name = name,
        licensePlate = null,
        phone = phone,
        driverType = DriversResponseDriversInner.DriverType.fletero,
    )

    private class RecordingPdfGenerator : PdfGenerator {
        var lastText: String? = null
        var lastFileName: String? = null

        override suspend fun generate(text: String, fileName: String): File {
            lastText = text
            lastFileName = fileName
            return File("/tmp/$fileName")
        }
    }

    @Test
    fun `load fetches exportText and updates state`() {
        val api = FakeLoadingApi()
        val repo = LoadingRepository(api)
        val model = LoadingShareViewModel(repo)

        model.load("2026-11-18")

        assertEquals("2026-11-18", model.state.value.date)
        assertEquals(FakeLoadingApi.EXPORT_TEXT, model.state.value.exportText)
        assertFalse(model.state.value.loading)
        assertNull(model.state.value.message)
    }

    @Test
    fun `load with null export sets error message`() {
        val api = FakeLoadingApi(exportToReturn = null)
        val repo = LoadingRepository(api)
        val model = LoadingShareViewModel(repo)

        model.load("2026-11-18")

        assertNull(model.state.value.exportText)
        assertFalse(model.state.value.loading)
        assertNotNull(model.state.value.message)
    }

    @Test
    fun `shareExport shares text via shareManager`() {
        val shareManager = RecordingShareManager()
        val api = FakeLoadingApi()
        val repo = LoadingRepository(api)
        val model = LoadingShareViewModel(repo, shareManager = shareManager)

        model.load("2026-11-18")
        model.shareExport()

        assertEquals(FakeLoadingApi.EXPORT_TEXT, shareManager.lastSharedText)
    }

    @Test
    fun `shareExport with no text does nothing`() {
        val shareManager = RecordingShareManager()
        val api = FakeLoadingApi(exportToReturn = null)
        val repo = LoadingRepository(api)
        val model = LoadingShareViewModel(repo, shareManager = shareManager)

        model.load("2026-11-18")
        model.shareExport()

        assertNull(shareManager.lastSharedText)
    }

    @Test
    fun `sharePdf generates horario-date pdf and shares it`() {
        val shareManager = RecordingShareManager()
        val pdfGenerator = RecordingPdfGenerator()
        val api = FakeLoadingApi()
        val repo = LoadingRepository(api)
        val model = LoadingShareViewModel(
            repository = repo,
            shareManager = shareManager,
            pdfGenerator = pdfGenerator,
        )

        model.load("2026-11-18")
        model.sharePdf()

        assertEquals("horario-2026-11-18.pdf", pdfGenerator.lastFileName)
        assertEquals(FakeLoadingApi.EXPORT_TEXT, pdfGenerator.lastText)
        assertEquals(File("/tmp/horario-2026-11-18.pdf"), shareManager.lastSharedPdfFile)
    }

    @Test
    fun `sharePdf with no text does nothing`() {
        val shareManager = RecordingShareManager()
        val pdfGenerator = RecordingPdfGenerator()
        val api = FakeLoadingApi(exportToReturn = null)
        val repo = LoadingRepository(api)
        val model = LoadingShareViewModel(
            repository = repo,
            shareManager = shareManager,
            pdfGenerator = pdfGenerator,
        )

        model.load("2026-11-18")
        model.sharePdf()

        assertNull(pdfGenerator.lastFileName)
        assertNull(shareManager.lastSharedPdfFile)
    }

    @Test
    fun `load brings the day's own fleteros a chat can reach, each one once`() {
        val api = FakeLoadingApi(
            schedulesToReturn = listOf(
                FakeLoadingApi.entry(7, "04:00"),
                FakeLoadingApi.entry(7, "05:00"),
                FakeLoadingApi.entry(8, "05:30"),
                FakeLoadingApi.entry(9, "06:00"),
                FakeLoadingApi.entry(10, "06:30", type = SchedulesResponseSchedulesInner.DriverType.casa),
            ),
            driversToReturn = listOf(
                fletero(7, "Ana", "+55 (11) 98888-7777"),
                fletero(8, "Beto", null),
                fletero(9, "Caio", "   "),
                fletero(10, "Carlos", "+55 (11) 91111-2222"),
            ),
        )
        val model = LoadingShareViewModel(LoadingRepository(api))

        model.load("2026-11-18")

        // El día y no el plantel: cada fletero una vez aunque tenga dos turnos, y sólo donde un chat puede
        // abrirse -- sin número, o con un número que ningún enlace puede usar, nadie se ofrece.
        assertEquals(listOf(7), model.state.value.fleteros.map { it.id })
        assertEquals(FakeLoadingApi.EXPORT_TEXT, model.state.value.exportText)
    }

    @Test
    fun `openWhatsAppFor opens that driver's chat carrying the day's own text`() {
        val api = FakeLoadingApi(
            schedulesToReturn = listOf(FakeLoadingApi.entry(7, "04:00")),
            driversToReturn = listOf(fletero(7, "Ana", "+55 (11) 98888-7777")),
        )
        val shareManager = RecordingShareManager()
        val model = LoadingShareViewModel(LoadingRepository(api), shareManager = shareManager)
        model.load("2026-11-18")

        model.openWhatsAppFor(model.state.value.fleteros.single())

        assertEquals(
            waMeLink("+55 (11) 98888-7777", FakeLoadingApi.EXPORT_TEXT),
            shareManager.lastOpenedLink,
        )
    }

    @Test
    fun `a chat the device cannot open says so without hiding the day's text`() {
        val api = FakeLoadingApi(
            schedulesToReturn = listOf(FakeLoadingApi.entry(7, "04:00")),
            driversToReturn = listOf(fletero(7, "Ana", "+55 (11) 98888-7777")),
        )
        val shareManager = RecordingShareManager(opensLink = false)
        val model = LoadingShareViewModel(LoadingRepository(api), shareManager = shareManager)
        model.load("2026-11-18")

        model.openWhatsAppFor(model.state.value.fleteros.single())

        // The card draws its error *instead of* the text, so a chat that did not open cannot use that
        // field: the schedule the server rendered still arrived and stays on screen with its own sentence.
        assertNotNull(model.state.value.shareNote)
        assertNull(model.state.value.message)
        assertEquals(FakeLoadingApi.EXPORT_TEXT, model.state.value.exportText)
    }
}
