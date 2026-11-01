package com.trindade.app.dashboard

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasProgressBarRangeInfo
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.contract.models.DashboardSummary
import com.trindade.app.loading.saoPauloToday
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.GraphicsMode

/**
 * The dashboard, rendered rather than read.
 *
 * The screen is rendered directly with a state built by hand -- no ViewModel, no Hilt -- because that is
 * what its stateless shape is for, and it is the only way this lane can reach the states that matter:
 * the cards the operator reads, the two cards that are doors, and the two states with nothing to draw.
 * The last pair is the reason the lane exists at all. Every count in a `DashboardSummary` is a
 * non-nullable `Int`, so a screen that defaulted instead of reporting would draw a plausible day of
 * zeroes for a read that never arrived, and nothing in a JVM test of the view model can see what a
 * screen draws.
 *
 * Four things about this file are deliberate, and the first two are the lane's own conventions:
 *
 *  * `GraphicsMode.NATIVE` is what makes the rendering real: text is measured by the framework's layout
 *    instead of by a shadow that returns a constant. This test asserts that nodes are *displayed*, and a
 *    node's size is what that turns on, so a lane that did not measure text could not make the claim.
 *  * The copy is looked up from the resources the app ships -- `copy(R.string.x, ...)` -- rather than
 *    typed here, so a change to a label or to a count's sentence fails this test instead of passing
 *    silently against a stale expectation.
 *  * Every selection is scrolled to before it is asserted or tapped. The dashboard is taller than the
 *    default test window, and a node outside the viewport is not displayed and cannot be tapped --
 *    a tap is delivered at the node's own position. `verticalScroll` on the screen is what makes the
 *    scroll possible, which is also why the two states that draw a single centred child are asserted
 *    without it: neither has a scrollable ancestor to scroll.
 *  * The cards are found by their labels, and on the two clickable ones the label selects the card
 *    itself. `clickable` merges a node's descendants, so a clickable card, its label and its value are
 *    one node: this is what makes tapping the label tap the card's own click.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DashboardScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    /** One string this screen ships, with a count where it carries one. */
    private fun copy(id: Int, vararg formatArgs: Any): String = context.getString(id, *formatArgs)

    /** The settled state: a summary that arrived, which is what every card test starts from. */
    private fun state(summary: DashboardSummary? = FakeSystemApi.summary()) =
        DashboardViewModel.UiState(loading = false, summary = summary)

    private fun render(
        state: DashboardViewModel.UiState,
        onOpenReport: (Int) -> Unit = {},
        onOpenReports: () -> Unit = {},
        onOpenLoading: () -> Unit = {},
        onOpenLoadingDay: (String) -> Unit = {},
        onOpenShare: () -> Unit = {},
    ) {
        composeRule.setContent {
            TrindadeTheme {
                DashboardScreen(
                    state = state,
                    onOpenReport = onOpenReport,
                    onOpenReports = onOpenReports,
                    onOpenLoading = onOpenLoading,
                    onOpenLoadingDay = onOpenLoadingDay,
                    onOpenStock = {},
                    onOpenAssai = {},
                    onOpenShare = onOpenShare,
                    onShareActiveSchedule = {},
                )
            }
        }
    }

    /** One label or value, asserted as drawn after being scrolled to. */
    private fun displayed(text: String) {
        composeRule.onNodeWithText(text).performScrollTo().assertIsDisplayed()
    }

    /** The card whose label is [label], scrolled into view so that a tap on it lands. */
    private fun card(label: String) = composeRule.onNodeWithText(label).performScrollTo()

    @Test
    fun `the cards and the values the summary carries are drawn`() {
        render(state = state())

        // The labels of the doors, in the web's order and with the web's words, plus the panel that is
        // not a door.
        for (id in listOf(
            R.string.dashboard_reports_today,
            R.string.dashboard_active_schedule,
            R.string.dashboard_summary_title,
        )) {
            displayed(copy(id))
        }

        // The first card's two lines are the web's own breakdown, and each is built the way the screen
        // builds it: the same resource, with the same count. A copy change, or a breakdown line showing
        // the other module's count, fails here.
        displayed(copy(R.string.dashboard_higiene_count, FakeSystemApi.HIGIENE_DONE))
        displayed(copy(R.string.dashboard_recepcion_count, FakeSystemApi.RECEPCION_DONE))

        // The count of the schedules card, in its own style.
        displayed(FakeSystemApi.ACTIVE_SCHEDULE_COUNT.toString())

        // The day the count belongs to is drawn beside it: a number of carregamentos without its day is
        // one the operator cannot act on, which is what the card stops being once the day is on it.
        displayed(FakeSystemApi.ACTIVE_SCHEDULE_DATE)
    }

    /**
     * The panel that replaced three cards, asserted on the three plain totals and the two progress pairs.
     *
     * Each figure is checked once, by the label and the value the screen builds for it: two cards showing
     * the same number in the same style is exactly what this test cannot tell apart from a panel, so the
     * count of the panel's own title is asserted as well -- there is one panel, not four.
     *
     * `reportsToday` is asserted out of the panel on purpose: the card above is titled with those same
     * words, and a second row carrying the label would make the screen say the same sentence twice.
     */
    @Test
    fun `one panel carries every count, including the day's reports and the two progress pairs`() {
        render(state = state())

        composeRule.onNodeWithText(copy(R.string.dashboard_summary_title)).performScrollTo().assertIsDisplayed()
        composeRule.onAllNodesWithText(copy(R.string.dashboard_summary_title)).assertCountEquals(1)

        for (label in listOf(
            R.string.dashboard_schedules_total,
            R.string.dashboard_reports_total,
            R.string.dashboard_active_users,
            R.string.dashboard_higiene_label,
            R.string.dashboard_recepcion_label,
        )) {
            composeRule.onNodeWithText(copy(label)).performScrollTo().assertIsDisplayed()
        }

        // The two plain totals the screen used to draw alone, the day's own count that no client drew,
        // the workforce, and the two pairs as done over total rather than as done alone.
        displayed(FakeSystemApi.SCHEDULES_TOTAL.toString())
        displayed(FakeSystemApi.REPORTS_TOTAL.toString())
        displayed(FakeSystemApi.ACTIVE_USERS.toString())
        displayed(copy(R.string.dashboard_task_progress, FakeSystemApi.HIGIENE_DONE, FakeSystemApi.HIGIENE_TOTAL))
        displayed(copy(R.string.dashboard_goods_progress, FakeSystemApi.RECEPCION_DONE, FakeSystemApi.RECEPCION_TOTAL))
        composeRule.onAllNodesWithText(copy(R.string.dashboard_reports_today)).assertCountEquals(1)

        // The totals reach a pixel now, which is what the pair is for: `done` alone cannot say how much is
        // left, and `higieneTotal`/`recepcionTotal` were the fields no screen read.
        assertTrue(FakeSystemApi.HIGIENE_TOTAL > 0)
        assertTrue(FakeSystemApi.RECEPCION_TOTAL > 0)
    }

    /**
     * The web's own rule for the first card, carried over exactly: a summary that names a latest report
     * opens that report, and the same card opens the reports list when it does not. The two are asserted
     * separately because a card wired to only one of them is the failure worth catching, and the
     * assertion on the other callback is what says the choice was made rather than both being called.
     */
    @Test
    fun `the reports card opens the report the summary names`() {
        var openedReportId: Int? = null
        var openedReportsList = 0
        render(
            state = state(),
            onOpenReport = { openedReportId = it },
            onOpenReports = { openedReportsList += 1 },
        )

        card(copy(R.string.dashboard_reports_today)).performClick()

        assertEquals(FakeSystemApi.LATEST_REPORT_ID, openedReportId)
        assertEquals(0, openedReportsList)
    }

    @Test
    fun `the reports card opens the reports list when the summary names no report`() {
        var openedReportId: Int? = null
        var openedReportsList = 0
        render(
            state = state(FakeSystemApi.summary(latestReportId = null)),
            onOpenReport = { openedReportId = it },
            onOpenReports = { openedReportsList += 1 },
        )

        card(copy(R.string.dashboard_reports_today)).performClick()

        assertNull(openedReportId)
        assertEquals(1, openedReportsList)
    }

    /**
     * The loads card opens the day the operation is on rather than a day of its own, and the halves are
     * asserted apart: a card wired to both callbacks would hide the choice, and a card wired to the wrong
     * one would send an operator looking for a schedule on the wrong day. The second case is the one the
     * day itself decides -- the day being loaded that is today's own belongs to the grid that is today's.
     */
    @Test
    fun `the schedules card opens the batch's day, which is the one the grid has rows for`() {
        var openedToday = 0
        val openedDays = mutableListOf<String>()
        render(
            state = state(),
            onOpenLoading = { openedToday++ },
            onOpenLoadingDay = { openedDays += it },
        )

        card(copy(R.string.dashboard_active_schedule)).performClick()
        composeRule.waitForIdle()

        // El día que abre es el del LOTE y no el de carga: son días distintos -- el lote del viernes se
        // carga el lunes -- y el segundo lleva a una grilla sin filas, que es el defecto que la web ya
        // había cerrado y que esta tarjeta todavía tenía.
        assertEquals(0, openedToday)
        assertEquals(listOf(FakeSystemApi.ACTIVE_SCHEDULE_BATCH_DATE), openedDays)
    }

    @Test
    fun `the day being loaded does not decide which door the card opens, the batch date does`() {
        var openedToday = 0
        val openedDays = mutableListOf<String>()
        val today = saoPauloToday()
        render(
            state = state(FakeSystemApi.summary().copy(activeScheduleDate = today)),
            onOpenLoading = { openedToday++ },
            onOpenLoadingDay = { openedDays += it },
        )

        card(copy(R.string.dashboard_active_schedule)).performClick()
        composeRule.waitForIdle()

        // Que la fecha de arriba sea hoy no cambia nada: lo que decide es la fecha del lote.
        assertEquals(0, openedToday)
        assertEquals(listOf(FakeSystemApi.ACTIVE_SCHEDULE_BATCH_DATE), openedDays)
    }

    @Test
    fun `without a batch there is no day to open, so the card invites creating the schedule`() {
        var openedToday = 0
        val openedDays = mutableListOf<String>()
        render(
            state = state(FakeSystemApi.summary().copy(activeScheduleBatchDate = null)),
            onOpenLoading = { openedToday++ },
            onOpenLoadingDay = { openedDays += it },
        )

        card(copy(R.string.dashboard_active_schedule)).performClick()
        composeRule.waitForIdle()

        // Sin lote no se finge una puerta a un día que no tiene filas: se ofrece crear el de hoy.
        assertEquals(1, openedToday)
        assertEquals(emptyList<String>(), openedDays)
    }

    /**
     * The loading case of "there is no summary", and the claim is the one this lane was added for: the
     * screen must not draw a zero for a count nobody answered.
     *
     * The state is written out field by field rather than taken from the default constructor, so that what
     * is being rendered is visible in the test: loading, no summary. There is nothing else to set -- the
     * failure is the state that is neither loading nor has a summary, so it has no flag to clear here.
     */
    @Test
    fun `a state with no summary draws no zeroes`() {
        render(state = DashboardViewModel.UiState(loading = true, summary = null))

        composeRule.onNode(hasProgressBarRangeInfo(ProgressBarRangeInfo.Indeterminate)).assertIsDisplayed()

        composeRule.onNodeWithText("0").assertDoesNotExist()
        composeRule.onNodeWithText(copy(R.string.dashboard_higiene_count, 0)).assertDoesNotExist()
        composeRule.onNodeWithText(copy(R.string.dashboard_recepcion_count, 0)).assertDoesNotExist()
        composeRule.onNodeWithText(copy(R.string.dashboard_reports_today)).assertDoesNotExist()
    }

    @Test
    fun `a read that did not arrive says so and draws nothing else`() {
        // Not loading and no summary: that *is* the failure state, and it is the whole of it -- nothing
        // sets a flag, because there is none to set.
        render(state = DashboardViewModel.UiState(loading = false, summary = null))

        composeRule.onNodeWithText(copy(R.string.dashboard_unreachable)).assertIsDisplayed()

        // Nothing of a summary, because there is none: this is the state that must not read as a day in
        // which nothing happened, and it offers no retry control -- see the screen for why leaving the
        // tab and coming back is the retry.
        composeRule.onNodeWithText("0").assertDoesNotExist()
        composeRule.onNodeWithText(copy(R.string.dashboard_reports_today)).assertDoesNotExist()
    }

    /**
     * The grid's two changes, asserted on the screen rather than on the source: the stock history is no
     * longer a door here -- it is reached from the counter's own tab, where the work happens -- and
     * Compartilhar App took its place, right after the last calculator.
     */
    @Test
    fun `the stock history is no longer a door, and sharing the app follows the last calculator`() {
        var openedShare = 0
        render(state = state(), onOpenShare = { openedShare += 1 })

        composeRule.onNodeWithText(copy(R.string.nav_stock_history)).assertDoesNotExist()

        // Both positions are read after the scroll and in the same pass: scrolling one card into view moves
        // the other, so a position captured earlier says nothing about the order.
        composeRule.onNodeWithText(copy(R.string.nav_share)).performScrollTo()
        val assai = composeRule.onNodeWithText(copy(R.string.nav_assai)).getUnclippedBoundsInRoot()
        val share = composeRule.onNodeWithText(copy(R.string.nav_share)).getUnclippedBoundsInRoot()
        assertTrue(
            "Compartilhar App must sit below the last calculator, saw ${assai.bottom} then ${share.top}",
            share.top >= assai.bottom,
        )

        card(copy(R.string.nav_share)).performClick()
        assertEquals("The share card is a door to the tab, not a label", 1, openedShare)
    }

    @Test
    fun `dashboard cards fill full width and meet minimum touch target height of at least 48dp`() {
        render(state = state())

        for (id in listOf(
            R.string.dashboard_reports_today,
            R.string.dashboard_active_schedule,
        )) {
            val node = composeRule.onNodeWithText(copy(id)).performScrollTo()
            node.assertIsDisplayed()
            val bounds = node.getUnclippedBoundsInRoot()
            val width = bounds.right - bounds.left
            val height = bounds.bottom - bounds.top
            assertTrue("Card ${copy(id)} width ($width) must fill width >= 280dp", width >= 280.dp)
            assertTrue("Card ${copy(id)} height ($height) must be >= 48dp", height >= 48.dp)
        }
    }

    @Test
    fun `dashboard on narrow small screen scrolls without clipping all KPI cards and notice`() {
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(320.dp).height(480.dp)) {
                    DashboardScreen(
                        state = state(),
                        onOpenReport = {},
                        onOpenReports = {},
                        onOpenLoading = {},
                        onOpenLoadingDay = {},
                        onOpenStock = {},
                        onOpenAssai = {},
                        onOpenShare = {},
                        onShareActiveSchedule = {},
                    )
                }
            }
        }

        // Verify Overview title and all cards can be scrolled into view and displayed on small screen
        composeRule.onNodeWithText(copy(R.string.dashboard_overview)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.dashboard_reports_today)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.dashboard_active_schedule)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.dashboard_summary_title)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.dashboard_active_users)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.dashboard_reports_total)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.dashboard_schedules_total)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.dashboard_deferred_notice)).performScrollTo().assertIsDisplayed()
    }
}
