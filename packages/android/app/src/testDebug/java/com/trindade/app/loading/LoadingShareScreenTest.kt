package com.trindade.app.loading

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.export.PdfGenerator
import com.trindade.app.export.ShareManager
import com.trindade.app.ui.UiText
import com.trindade.app.ui.theme.TrindadeTheme
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "es-w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LoadingShareScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    @Test
    fun `loading share screen renders title, date subtitle, verbatim text, Volver, and no Editar or Copiar`() {
        var backed = 0
        var shared = 0
        var pdfed = 0

        val verbatimText = """
            CRONOGRAMA DE CARREGAMENTO - 18/11/2026
            08:00 - Motorista Carlos (ABC-1234)
            09:00 - Motorista João (XYZ-5678)
        """.trimIndent()

        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = verbatimText,
            message = null,
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = { shared++ },
                    onPdf = { pdfed++ },
                    onBack = { backed++ },
                )
            }
        }

        // Title and subtitle
        composeRule.onNodeWithText(copy(R.string.loading_title)).assertIsDisplayed()
        composeRule.onNodeWithText("2026-11-18").assertIsDisplayed()

        // Verbatim text
        composeRule.onNodeWithText(verbatimText).assertIsDisplayed()
        composeRule.onNodeWithText(verbatimText).assertTextEquals(verbatimText)

        // Actions: Volver exists, no Editar or Copiar
        composeRule.onNodeWithText("Volver").assertIsDisplayed()
        composeRule.onNodeWithText("Editar").assertDoesNotExist()
        assertEquals(0, composeRule.onAllNodesWithText("Copiar", substring = true).fetchSemanticsNodes().size)

        // Callback invocation
        composeRule.onNodeWithText("Volver").performClick()
        assertEquals(1, backed)

        composeRule.onNodeWithText("Compartir por WhatsApp").performClick()
        assertEquals(1, shared)

        composeRule.onNodeWithText("Exportar PDF").performClick()
        assertEquals(1, pdfed)
    }

    @Test
    fun `touch targets for all actions meet 44dp minimum height`() {
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = "Texto",
            message = null,
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                )
            }
        }

        for (action in listOf("Compartir por WhatsApp", "Exportar PDF", "Volver")) {
            val node = composeRule.onNodeWithText(action)
            node.assertIsDisplayed()
            val bounds = node.getUnclippedBoundsInRoot()
            val height = bounds.bottom - bounds.top
            assertTrue("Action '$action' height ($height) must be >= 44dp", height >= 44.dp)
        }
    }

    @Test
    fun `error state shows error message instead of empty text`() {
        val errorSentence = "Falha ao carregar agendamento."
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = null,
            message = UiText.literal(errorSentence),
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                )
            }
        }

        composeRule.onNodeWithText(errorSentence).assertIsDisplayed()
    }
}
