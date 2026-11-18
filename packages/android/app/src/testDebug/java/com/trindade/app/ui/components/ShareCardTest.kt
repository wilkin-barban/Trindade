package com.trindade.app.ui.components

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
import com.trindade.app.ui.UiText
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "es-w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ShareCardTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `FROM_HISTORY mode shows Volver and no Editar, and invokes onClose`() {
        var closed = 0
        composeRule.setContent {
            TrindadeTheme {
                ShareCard(
                    title = "Relatório #10",
                    subtitle = "2026-11-18 · João",
                    text = "Texto do servidor",
                    loading = false,
                    error = null,
                    mode = ShareCardMode.FROM_HISTORY,
                    onShare = {},
                    onPdf = {},
                    onEdit = null,
                    onClose = { closed++ },
                )
            }
        }

        composeRule.onNodeWithText("Volver").assertIsDisplayed()
        composeRule.onNodeWithText("Editar").assertDoesNotExist()
        composeRule.onNodeWithText("Cerrar").assertDoesNotExist()

        composeRule.onNodeWithText("Volver").performClick()
        assertEquals(1, closed)
    }

    @Test
    fun `SHARE mode shows Volver and no Editar, and invokes onClose`() {
        var closed = 0
        composeRule.setContent {
            TrindadeTheme {
                ShareCard(
                    title = "Cronograma de carregamento",
                    subtitle = "2026-11-18",
                    text = "Texto do servidor",
                    loading = false,
                    error = null,
                    mode = ShareCardMode.SHARE,
                    onShare = {},
                    onPdf = {},
                    onEdit = null,
                    onClose = { closed++ },
                )
            }
        }

        composeRule.onNodeWithText("Volver").assertIsDisplayed()
        composeRule.onNodeWithText("Editar").assertDoesNotExist()
        composeRule.onNodeWithText("Cerrar").assertDoesNotExist()

        composeRule.onNodeWithText("Volver").performClick()
        assertEquals(1, closed)
    }

    @Test
    fun `SAVED mode shows Editar and Cerrar, and invokes respective callbacks`() {
        var edited = 0
        var closed = 0
        composeRule.setContent {
            TrindadeTheme {
                ShareCard(
                    title = "Relatório salvo",
                    subtitle = "2026-11-18 · Carlos",
                    text = "Texto do relatório salvo",
                    loading = false,
                    error = null,
                    mode = ShareCardMode.SAVED,
                    onShare = {},
                    onPdf = {},
                    onEdit = { edited++ },
                    onClose = { closed++ },
                )
            }
        }

        composeRule.onNodeWithText("Editar").assertIsDisplayed()
        composeRule.onNodeWithText("Cerrar").assertIsDisplayed()
        composeRule.onNodeWithText("Volver").assertDoesNotExist()

        composeRule.onNodeWithText("Editar").performClick()
        assertEquals(1, edited)

        composeRule.onNodeWithText("Cerrar").performClick()
        assertEquals(1, closed)
    }

    @Test
    fun `SAVED mode with onEdit null does not show Editar`() {
        composeRule.setContent {
            TrindadeTheme {
                ShareCard(
                    title = "Relatório salvo",
                    subtitle = null,
                    text = "Texto",
                    loading = false,
                    error = null,
                    mode = ShareCardMode.SAVED,
                    onShare = {},
                    onPdf = {},
                    onEdit = null,
                    onClose = {},
                )
            }
        }

        composeRule.onNodeWithText("Editar").assertDoesNotExist()
        composeRule.onNodeWithText("Cerrar").assertIsDisplayed()
    }

    @Test
    fun `server text is painted verbatim including unicode and blank lines`() {
        val verbatimText = """
            TRINDADE MASSAS - RELATÓRIO DO DIA
            Data: 18/11/2026

            👤 Operador: JOÃO SILVA
            📦 Produção:
              - MASSA TRADICIONAL: 1.200 un
              - PASTEL D'OURO: 500 un

            ⚠️ Observação: Temperatura mantida a 4°C.
            
            Fim do relatório.
        """.trimIndent()

        composeRule.setContent {
            TrindadeTheme {
                ShareCard(
                    title = "Relatório #42",
                    subtitle = "2026-11-18",
                    text = verbatimText,
                    loading = false,
                    error = null,
                    mode = ShareCardMode.FROM_HISTORY,
                    onShare = {},
                    onPdf = {},
                    onEdit = null,
                    onClose = {},
                )
            }
        }

        composeRule.onNodeWithText(verbatimText).assertIsDisplayed()
        composeRule.onNodeWithText(verbatimText).assertTextEquals(verbatimText)
    }

    @Test
    fun `no Copiar action exists in SAVED mode`() {
        composeRule.setContent {
            TrindadeTheme {
                ShareCard(
                    title = "Título",
                    subtitle = "Subtítulo",
                    text = "Texto do servidor",
                    loading = false,
                    error = null,
                    mode = ShareCardMode.SAVED,
                    onShare = {},
                    onPdf = {},
                    onEdit = {},
                    onClose = {},
                )
            }
        }

        assertEquals(0, composeRule.onAllNodesWithText("Copiar", substring = true).fetchSemanticsNodes().size)
    }

    @Test
    fun `no Copiar action exists in FROM_HISTORY mode`() {
        composeRule.setContent {
            TrindadeTheme {
                ShareCard(
                    title = "Título",
                    subtitle = "Subtítulo",
                    text = "Texto do servidor",
                    loading = false,
                    error = null,
                    mode = ShareCardMode.FROM_HISTORY,
                    onShare = {},
                    onPdf = {},
                    onEdit = null,
                    onClose = {},
                )
            }
        }

        assertEquals(0, composeRule.onAllNodesWithText("Copiar", substring = true).fetchSemanticsNodes().size)
    }

    @Test
    fun `error state shows the error message instead of empty text`() {
        val errorSentence = "Falha ao carregar texto do servidor. Tente de novo."
        composeRule.setContent {
            TrindadeTheme {
                ShareCard(
                    title = "Relatório com erro",
                    subtitle = null,
                    text = null,
                    loading = false,
                    error = UiText.literal(errorSentence),
                    mode = ShareCardMode.FROM_HISTORY,
                    onShare = {},
                    onPdf = {},
                    onEdit = null,
                    onClose = {},
                )
            }
        }

        composeRule.onNodeWithText(errorSentence).assertIsDisplayed()
    }

    @Test
    fun `touch targets meet minimum 44dp height for all visible actions`() {
        composeRule.setContent {
            TrindadeTheme {
                ShareCard(
                    title = "Título",
                    subtitle = "Subtítulo",
                    text = "Texto do servidor",
                    loading = false,
                    error = null,
                    mode = ShareCardMode.SAVED,
                    onShare = {},
                    onPdf = {},
                    onEdit = {},
                    onClose = {},
                )
            }
        }

        for (actionText in listOf("Compartir por WhatsApp", "Exportar PDF", "Editar", "Cerrar")) {
            val node = composeRule.onNodeWithText(actionText)
            node.assertIsDisplayed()
            val bounds = node.getUnclippedBoundsInRoot()
            val height = bounds.bottom - bounds.top
            assertTrue("Action '$actionText' height ($height) must be >= 44dp", height >= 44.dp)
        }
    }
}
