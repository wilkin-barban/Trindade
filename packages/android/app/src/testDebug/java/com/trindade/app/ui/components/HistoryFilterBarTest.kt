package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The date a history is filtered by, as one line.
 *
 * The rule this file exists for is a height, not a look: the two pickers used to be full-width buttons, one
 * per row, and with the clear action they took three rows of the tallest control on the screen. Three chips
 * on one line is a claim about geometry, and geometry is what is measured here -- at the narrowest width the
 * app supports, with the largest font it supports.
 */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class HistoryFilterBarTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun render(
        dayLabel: String = "Dia",
        daySelected: Boolean = false,
        monthLabel: String = "Mês",
        monthSelected: Boolean = false,
        onPickDay: () -> Unit = {},
        onPickMonth: () -> Unit = {},
        onClear: (() -> Unit)? = null,
        width: Int = 411,
    ) {
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(width.dp)) {
                    HistoryFilterBar(
                        dayLabel = dayLabel,
                        daySelected = daySelected,
                        onPickDay = onPickDay,
                        monthLabel = monthLabel,
                        monthSelected = monthSelected,
                        onPickMonth = onPickMonth,
                        onClear = onClear,
                        clearLabel = "Limpar filtros",
                    )
                }
            }
        }
    }

    @Test
    fun `both pickers and the way to clear them share one line`() {
        render(
            dayLabel = "18/09/2026",
            daySelected = true,
            onClear = {},
        )

        val day = composeRule.onNodeWithText("18/09/2026").assertIsDisplayed().getUnclippedBoundsInRoot()
        val month = composeRule.onNodeWithText("Mês").assertIsDisplayed().getUnclippedBoundsInRoot()
        val clear = composeRule.onNodeWithContentDescription("Limpar filtros").assertIsDisplayed()
            .getUnclippedBoundsInRoot()

        // One line, not three rows: every control's band overlaps every other's.
        for ((first, second) in listOf(day to month, month to clear, day to clear)) {
            val overlap = minOf(first.bottom.value, second.bottom.value) -
                maxOf(first.top.value, second.top.value)
            assertTrue("the filter's controls must sit on one line, overlapped by $overlap dp", overlap > 0f)
        }
    }

    @Test
    fun `each picker is compact enough for the three of them to fit at 320dp`() {
        render(dayLabel = "18/09/2026", daySelected = true, onClear = {}, width = 320)

        val bar = composeRule.onNodeWithText("18/09/2026").assertIsDisplayed().getUnclippedBoundsInRoot()
        // Two chips sharing the row and a 48dp action: a chip may not claim more than the row allows, and
        // the row is what the screen is wide. A full-width button could not pass this.
        assertTrue("a chip cannot be wider than the row it lives in", (bar.right - bar.left).value <= 320f)
        composeRule.onNodeWithText("Mês").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Limpar filtros").assertIsDisplayed()
    }

    @Test
    fun `an unfiltered history offers no way to clear a filter it does not have`() {
        render()

        composeRule.onNodeWithContentDescription("Limpar filtros").assertDoesNotExist()
        composeRule.onNodeWithText("Dia").assertIsDisplayed()
        composeRule.onNodeWithText("Mês").assertIsDisplayed()
    }

    @Test
    fun `the pickers open their own calendar`() {
        var days = 0
        var months = 0
        var clears = 0
        render(onPickDay = { days++ }, onPickMonth = { months++ }, onClear = { clears++ })

        composeRule.onNodeWithText("Dia").performClick()
        composeRule.onNodeWithText("Mês").performClick()
        composeRule.onNodeWithContentDescription("Limpar filtros").performClick()

        assertEquals(1, days)
        assertEquals(1, months)
        assertEquals(1, clears)
    }
}
