package com.trindade.app.salida

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.theme.TrindadeTheme
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * El resultado de un lanzamiento se dibuja aunque la confirmación esté cerrada.
 *
 * Era el defecto: el aviso vivía dentro de `if (confirmOpen)` y `confirmLaunch` cierra la confirmación antes de
 * escribir la respuesta, así que no aparecía ni el éxito ni el error. Este composable es el que la pantalla monta
 * fuera de ese bloque.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class SalidaLaunchActionResultsTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: android.content.Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int, vararg args: Any): String = context.getString(id, *args)

    @Test
    fun `a stored launch shows its dialog with a way to close it`() {
        var dismissed = 0
        composeRule.setContent {
            TrindadeTheme {
                SalidaLaunchActionResults(
                    notice = SalidaNotice("Baja registrada. El ERP no la recibió: queda pendiente.", isError = true),
                    onDismiss = { dismissed++ },
                )
            }
        }

        composeRule.onNodeWithText("Baja registrada. El ERP no la recibió: queda pendiente.").assertExists()
        composeRule.onNodeWithText(copy(R.string.action_result_close)).performClick()
        composeRule.waitForIdle()
        assertEquals(1, dismissed)
    }

    @Test
    fun `with no answer nothing is drawn`() {
        composeRule.setContent {
            TrindadeTheme { SalidaLaunchActionResults(notice = null, onDismiss = {}) }
        }

        composeRule.onNodeWithText(copy(R.string.action_result_close)).assertDoesNotExist()
    }
}
