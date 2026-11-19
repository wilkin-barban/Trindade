package com.trindade.app.reports

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
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
 * Where each card's header sits, at the widths the crew's phones and the plant's tablets really have.
 *
 * The complaint this pins is a measurement, not a style preference: on an iPhone the title was drawn beside
 * the sync button with four words to a line, and the button itself was pushed out of the card's padding. So
 * the assertion is about geometry -- the action must sit **below** the title when there is no room beside it,
 * and beside it when there is.
 *
 * The width is forced rather than left to the device, because the card is the same composable on both: what
 * changes its shape has to be the space it is given.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w800dp-h1000dp")
class ErpMovementsCardLayoutTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: android.content.Context
        get() = ApplicationProvider.getApplicationContext()

    private fun drawCardIn(width: Int) {
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(width.dp)) {
                    ErpMovementsCard(
                        massasDay = null,
                        receipts = null,
                        isSyncing = false,
                        onSync = {},
                    )
                }
            }
        }
    }

    /** El encabezado de cada tarjeta, medido: en el teléfono la acción va debajo del título. */
    @Test
    fun `on a phone each card's sync action sits below its title rather than beside it`() {
        drawCardIn(360)

        assertHeaderStacked(R.string.report_massas_day_title, index = 0)
        assertHeaderStacked(R.string.report_receipts_title, index = 1)
    }

    @Test
    fun `on a tablet the sync action returns beside the title`() {
        drawCardIn(720)

        assertHeaderBeside(R.string.report_massas_day_title, index = 0)
        assertHeaderBeside(R.string.report_receipts_title, index = 1)
    }

    private fun assertHeaderStacked(titleRes: Int, index: Int) {
        // El título de cada tarjeta es único; lo que se repite es la acción, una por tarjeta.
        val title = composeRule
            .onNodeWithText(context.getString(titleRes))
            .getUnclippedBoundsInRoot()
        val button = composeRule
            .onAllNodesWithText(context.getString(R.string.report_erp_sync), substring = true)[index]
            .getUnclippedBoundsInRoot()
        assertTrue(
            "the action must start below the title, not beside it; title=$title button=$button",
            button.top >= title.bottom,
        )
    }

    private fun assertHeaderBeside(titleRes: Int, index: Int) {
        // El título de cada tarjeta es único; lo que se repite es la acción, una por tarjeta.
        val title = composeRule
            .onNodeWithText(context.getString(titleRes))
            .getUnclippedBoundsInRoot()
        val button = composeRule
            .onAllNodesWithText(context.getString(R.string.report_erp_sync), substring = true)[index]
            .getUnclippedBoundsInRoot()
        assertTrue(
            "the action must sit to the right of the title; title=$title button=$button",
            button.left > title.left && button.top < title.bottom,
        )
    }
}
