package com.trindade.app.loading

import com.trindade.app.export.PdfGenerator
import com.trindade.app.export.ShareManager
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

    private class RecordingShareManager : ShareManager {
        var lastSharedText: String? = null
        var lastSharedTitle: String? = null
        var lastSharedPdfFile: File? = null

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
        override fun openLink(url: String): Boolean = true
    }

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
}
