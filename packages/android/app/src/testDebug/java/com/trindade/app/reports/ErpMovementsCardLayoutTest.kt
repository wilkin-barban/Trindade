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
    /** El encabezado del bloque, medido: en el teléfono la única acción va debajo del título. */
    @Test
    fun `on a phone the block's only action sits below its title`() {
        drawCardIn(360)
        assertHeaderStacked()
    }

    @Test
    fun `on a tablet the block's action returns beside the title`() {
        drawCardIn(720)
        assertHeaderBeside()
    }

    private fun title() = composeRule
        .onNodeWithText(context.getString(R.string.report_erp_movements_title))
        .getUnclippedBoundsInRoot()

    private fun action() = composeRule
        .onNodeWithText(context.getString(R.string.report_erp_sync), substring = true)
        .getUnclippedBoundsInRoot()

    private fun assertHeaderStacked() {
        val title = title()
        val button = action()
        assertTrue(
            "the action must start below the title, not beside it; title=$title button=$button",
            button.top >= title.bottom,
        )
    }

    private fun assertHeaderBeside() {
        val title = title()
        val button = action()
        assertTrue(
            "the action must sit to the right of the title; title=$title button=$button",
            button.left > title.left && button.top < title.bottom,
        )
    }
}
