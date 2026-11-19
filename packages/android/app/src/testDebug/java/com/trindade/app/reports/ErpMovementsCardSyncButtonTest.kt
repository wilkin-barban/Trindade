package com.trindade.app.reports

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The card's one action, as a Material 3 control and not as a decorated line of text.
 *
 * The button carried a plain-text refresh emoji glued to the label and stood 44dp tall, which is below the
 * touch target the rest of the app keeps. The assertions are the two the operator feels: the label is the
 * string and nothing else, and the target is at least 48dp. The third is the one the card needs while it
 * works: a sync in flight cannot be fired twice.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w375dp-h1000dp")
class ErpMovementsCardSyncButtonTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: android.content.Context
        get() = ApplicationProvider.getApplicationContext()

    private var syncs = 0

    private fun drawCard(isSyncing: Boolean = false) {
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(360.dp)) {
                    ErpMovementsCard(
                        massasDay = null,
                        receipts = null,
                        isSyncing = isSyncing,
                        onSync = { syncs++ },
                    )
                }
            }
        }
    }

    /**
     * Una sola acción para el bloque entero.
     *
     * La lectura del ERP trae las tres listas a la vez -- massas, insumos y salidas --, así que un botón por
     * tarjeta era la misma acción repetida, y la tarjeta de Salidas, que se refresca con ella, no tenía ninguno.
     */
    @Test
    fun `the block carries exactly one action, and pressing it is one sync`() {
        drawCard()

        val label = context.getString(R.string.report_erp_sync)
        composeRule.onAllNodesWithText(label).assertCountEquals(1)
        composeRule.onNodeWithText(label).assertIsEnabled().performClick()
        composeRule.waitForIdle()

        org.junit.Assert.assertEquals(1, syncs)
        // No decorated variant of the same label exists beside it.
        composeRule.onAllNodesWithText("🔄", substring = true).assertCountEquals(0)
    }

    @Test
    fun `the action keeps the 48dp target`() {
        drawCard()

        val bounds = composeRule
            .onNodeWithText(context.getString(R.string.report_erp_sync))
            .getUnclippedBoundsInRoot()
        val height = bounds.bottom - bounds.top
        assertTrue("the action must be at least 48dp tall; height=$height bounds=$bounds", height >= 48.dp)
    }

    @Test
    fun `a sync in flight cannot be fired twice`() {
        drawCard(isSyncing = true)

        composeRule.onNodeWithText(context.getString(R.string.report_erp_sync)).assertIsNotEnabled()
    }
}
