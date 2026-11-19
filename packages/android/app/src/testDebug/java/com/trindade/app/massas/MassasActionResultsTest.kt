package com.trindade.app.massas

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.UiText
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Cómo responde la pantalla de Masas a lo que una acción devuelve.
 *
 * Importar un asiento del ERP es una acción de datos: la fila cambia debajo y la respuesta va en una ventana. Un
 * cartel en línea dentro de la tabla se lee como parte de la tabla, y por eso el test afirma las dos mitades -- el
 * diálogo con la frase de la importación, y la ausencia del aviso en línea que la acción dejaba antes.
 */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w390dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MassasActionResultsTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    @Test
    fun `an import answers in the dialog and leaves no notice inside the table`() {
        var dismissed = 0
        val message = copy(R.string.massas_aero_imported)

        composeRule.setContent {
            TrindadeTheme {
                MassasActionResults(
                    notice = null,
                    dialog = UiText.of(R.string.massas_aero_imported),
                    dialogIsSuccess = true,
                    onClearNotice = {},
                    onDismissDialog = { dismissed++ },
                )
            }
        }

        composeRule.onNodeWithText(message).assertIsDisplayed()
        // Nada del cartel en línea: ni el texto marcado con el visto, ni su botón de cerrar.
        assertEquals(0, composeRule.onAllNodesWithText("✓ $message").fetchSemanticsNodes().size)

        composeRule.onNodeWithText(copy(R.string.action_result_close)).performClick()
        composeRule.waitForIdle()
        assertEquals(1, dismissed)
    }

    @Test
    fun `a refusal of the import also answers in the dialog`() {
        val message = "Operador inativo"

        composeRule.setContent {
            TrindadeTheme {
                MassasActionResults(
                    notice = null,
                    dialog = UiText.literal(message),
                    dialogIsSuccess = false,
                    onClearNotice = {},
                    onDismissDialog = {},
                )
            }
        }

        composeRule.onNodeWithText(message).assertIsDisplayed()
        assertEquals(0, composeRule.onAllNodesWithText("✓ $message").fetchSemanticsNodes().size)
    }

    @Test
    fun `the inline notice still works for what belongs to the screen, like a copy`() {
        var cleared = 0
        // Literal y no recurso: lo que se prueba es la forma del aviso, no la frase de la copia.
        val message = "Relatório copiado"

        composeRule.setContent {
            TrindadeTheme {
                MassasActionResults(
                    notice = UiText.literal(message),
                    dialog = null,
                    dialogIsSuccess = true,
                    onClearNotice = { cleared++ },
                    onDismissDialog = {},
                )
            }
        }

        composeRule.onNodeWithText("✓ $message").assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.massas_close)).performClick()
        composeRule.waitForIdle()
        assertEquals(1, cleared)
    }
}
