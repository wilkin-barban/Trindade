package com.trindade.app.salida

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * El resultado de una acción del histórico se lee en una ventana con Cerrar.
 *
 * Antes el aviso era un texto dentro del día: la tabla de abajo ya había cambiado y el cartel se leía como parte
 * del estado. La ventana es del mismo componente que usan las demás pantallas, y se cierra sola cuando el operario
 * la cierra.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class SalidaNoticeDialogTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: android.content.Context
        get() = androidx.test.core.app.ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    @Test
    fun `an error is explained in a dialog and Cerrar dismisses it`() {
        var dismissed = 0
        composeRule.setContent {
            TrindadeTheme {
                SalidaNoticeDialog(
                    message = "Sem conexão com o Wi-Fi da empresa.",
                    isError = true,
                    onDismiss = { dismissed++ },
                )
            }
        }

        composeRule.onNodeWithText("Sem conexão com o Wi-Fi da empresa.").assertExists()
        composeRule.onNodeWithText(copy(R.string.action_result_close)).performClick()
        composeRule.waitForIdle()
        assertEquals(1, dismissed)
    }

    @Test
    fun `a deleted draft is confirmed in the same dialog, as a success`() {
        composeRule.setContent {
            TrindadeTheme {
                SalidaNoticeDialog(message = "Movimento excluído.", isError = false, onDismiss = {})
            }
        }

        composeRule.onNodeWithText("Movimento excluído.").assertExists()
        // El título del diálogo dice que fue un éxito; el mensaje es del servidor.
        composeRule.onNodeWithText(copy(R.string.action_result_success)).assertExists()
    }
}
