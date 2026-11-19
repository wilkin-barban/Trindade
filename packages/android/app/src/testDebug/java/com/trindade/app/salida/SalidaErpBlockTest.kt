package com.trindade.app.salida

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
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
 * El bloque de salidas del ERP en el histórico: una acción y la misma tarjeta del Relatório.
 *
 * Sólo se dibuja en el día de hoy -- el pasado se queda con el share, que es la regla del módulo -- y el botón no
 * escribe en Trindade: refresca el espejo y relee. Sin credenciales o sin red, la frase del error se lee debajo.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SalidaErpBlockTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    @Test
    fun `the block offers the sync and the report's own card`() {
        var synced = 0
        composeRule.setContent {
            TrindadeTheme {
                SalidaErpBlock(
                    isSyncing = false,
                    onSync = { synced++ },
                    day = null,
                    error = null,
                )
            }
        }

        composeRule.onNodeWithTag(SALIDA_HISTORY_ERP_SYNC_TAG).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.report_erp_sync)).assertIsDisplayed().performClick()
        composeRule.waitForIdle()
        assertEquals(1, synced)
        composeRule.onNodeWithTag("salida-history-erp-block").assertIsDisplayed()
    }

    @Test
    fun `a sync in flight withholds the action and the error is read underneath`() {
        val failure = "Sem conexão com o ERP."
        composeRule.setContent {
            TrindadeTheme {
                SalidaErpBlock(
                    isSyncing = true,
                    onSync = {},
                    day = null,
                    error = UiText.literal(failure),
                )
            }
        }

        composeRule.onNodeWithTag(SALIDA_HISTORY_ERP_SYNC_TAG).assertIsNotEnabled()
        composeRule.onNodeWithText(failure).assertIsDisplayed()
    }
}
