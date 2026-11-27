package com.trindade.app.stock

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.contract.models.StockDay
import com.trindade.app.contract.models.StockDayProductsInner
import com.trindade.app.contract.models.StockHistory
import com.trindade.app.contract.models.StockHistoryDaysInner
import com.trindade.app.contract.models.StockProduct
import com.trindade.app.network.StockApi
import com.trindade.app.ui.theme.TrindadeTheme
import kotlinx.serialization.json.JsonObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import retrofit2.Response

/**
 * The past day as a reading, drawn rather than described.
 *
 * The rule this file exists for is an absence: the history reports the day and does not edit it, so the
 * quantity field, "Adicionar" and "Zerar" cannot be on it. Testing that a screen stopped offering something
 * is the only way to keep it from quietly coming back with the next refactor -- a test that only asserted the
 * summary would pass just as well with a second calculator bolted underneath it.
 */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StockHistoryScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int, vararg args: Any): String = context.getString(id, *args)

    private val canudo = StockDayProductsInner(
        code = "787", name = "CANUDO", category = "Terceirizados", unitsPerBox = 30, boxes = 5, units = 150
    )
    private val massa = StockDayProductsInner(
        code = "1047", name = "MASSA ROLO 2KG", category = "Massas", unitsPerBox = 6, boxes = 2, units = 12
    )

    private fun day() = StockDay(
        date = "2026-10-23",
        products = listOf(canudo, massa),
        totalBoxes = 7,
        totalUnits = 162,
    )

    private fun render(
        state: StockHistoryViewModel.UiState,
        onPickDate: () -> Unit = {},
        onDaySelected: (String) -> Unit = {},
        onRetry: () -> Unit = {},
    ) {
        composeRule.setContent {
            TrindadeTheme {
                StockHistoryContent(
                    state = state,
                    onBack = {},
                    onPickDate = onPickDate,
                    onDaySelected = onDaySelected,
                    onNumberChange = {},
                    onWhatsApp = {},
                    onEmail = {},
                    onRetry = onRetry,
                )
            }
        }
    }

    /**
     * La ayuda vive en el encabezado y dice la verdad de esta pantalla: un día se lee, no se corrige.
     *
     * El texto nombre las tres cosas que hay -- el día del calendario, los totales del servidor y el envío del
     * resumen -- y la que no hay: la corrección, que se hace en la calculadora.
     */
    @Test
    fun `the header offers the help, and it says the day is a reading`() {
        render(StockHistoryViewModel.UiState(date = "2026-10-23", day = day()))

        composeRule.onNodeWithText(copy(R.string.help_button_label)).performClick()
        composeRule.onNodeWithText(copy(R.string.stock_history_help_title)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.stock_history_help_readonly_desc)).assertExists()
        composeRule.onNodeWithText(copy(R.string.stock_history_help_share_desc)).assertExists()

        composeRule.onNodeWithText(copy(R.string.help_dialog_understood)).performClick()
        composeRule.onNodeWithText(copy(R.string.stock_history_help_title)).assertDoesNotExist()
    }

    @Test
    fun `the day reads as the collective summary with the server totals`() {
        render(StockHistoryViewModel.UiState(date = "2026-10-23", day = day()))

        composeRule.onNodeWithText(copy(R.string.stock_collective_summary)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("CANUDO").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.stock_summary_boxes, 5)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("MASSA ROLO 2KG").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.stock_day_total)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.stock_day_total_format, 7, 162)).assertIsDisplayed()
    }

    @Test
    fun `the history offers no calculator to correct the day with`() {
        render(StockHistoryViewModel.UiState(date = "2026-10-23", day = day()))

        composeRule.onAllNodesWithText(copy(R.string.stock_add_button)).assertCountEquals(0)
        composeRule.onAllNodesWithText(copy(R.string.stock_reset_button)).assertCountEquals(0)
        composeRule.onNodeWithText(copy(R.string.stock_history_subtitle_readonly)).assertIsDisplayed()
    }

    @Test
    fun `sending the day out stays one tap away`() {
        render(StockHistoryViewModel.UiState(date = "2026-10-23", day = day()))

        composeRule.onNodeWithText(copy(R.string.whatsapp_send_button)).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.stock_send_email_button)).performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `a failed read keeps its retry beside the sentence`() {
        var retried = 0
        render(StockHistoryViewModel.UiState(date = "2026-10-23", failed = true), onRetry = { retried++ })

        composeRule.onNodeWithText(copy(R.string.stock_failed_to_load_count_day)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.report_retry)).performScrollTo().performClick()

        org.junit.Assert.assertEquals(1, retried)
    }

    @Test
    fun `the date opens the calendar instead of being typed`() {
        var picked = 0
        render(StockHistoryViewModel.UiState(date = "2026-10-23", day = day()), onPickDate = { picked++ })

        // The day is what the field shows and what is tapped: one panel, and tapping the day it already
        // holds opens the calendar again rather than opening a keyboard.
        composeRule.onNodeWithContentDescription(copy(R.string.stock_pick_date)).performClick()
        composeRule.onNodeWithText("23/10/2026").performClick()
        org.junit.Assert.assertEquals(2, picked)
    }

    @Test
    fun `the day field names itself above a day large enough to read`() {
        render(StockHistoryViewModel.UiState(date = "2026-10-23", day = day()))

        // Unmerged: the panel is one clickable surface, so in the merged tree both texts answer as the
        // panel itself and a comparison between them would be a comparison of a thing with itself.
        val name = composeRule.onNodeWithText(copy(R.string.stock_count_day), useUnmergedTree = true)
            .assertIsDisplayed().getUnclippedBoundsInRoot()
        val day = composeRule.onNodeWithText("23/10/2026", useUnmergedTree = true)
            .assertIsDisplayed().getUnclippedBoundsInRoot()

        // The complaint this replaces: a field long enough for ten characters drew them at the size of a
        // sentence, so the widest control on the screen held the smallest text in it. The day is now the
        // field's largest line and its name sits over it at label size.
        org.junit.Assert.assertTrue(
            "the field's own name must sit above the day it holds",
            name.bottom.value <= day.top.value + 0.5f,
        )
        org.junit.Assert.assertTrue(
            "the day must be the largest text of the field: ${day.bottom - day.top} vs ${name.bottom - name.top}",
            (day.bottom.value - day.top.value) > (name.bottom.value - name.top.value),
        )
    }

    private fun loadedHistoryViewModel(): StockHistoryViewModel {
        val loadedDay = day()
        val api = object : StockApi {
            override suspend fun day(date: String): Response<StockDay> = Response.success(loadedDay)
            override suspend fun addEntry(body: JsonObject): Response<StockProduct> = error("unused")
            override suspend fun resetProduct(body: JsonObject): Response<StockProduct> = error("unused")
            override suspend fun history(): Response<StockHistory> =
                Response.success(StockHistory(listOf(StockHistoryDaysInner("2026-10-23", 2, 7, 162))))
        }
        return StockHistoryViewModel(StockRepository(api)).apply {
            onNumberChange("11999998888")
        }
    }

    @Test
    fun `tapping whatsapp or email in StockHistoryScreen never renders opening-app inline note`() {
        val vm = loadedHistoryViewModel()
        composeRule.setContent {
            TrindadeTheme { StockHistoryScreen(viewModel = vm) }
        }
        composeRule.waitUntil(3_000) { !vm.state.value.loading }

        composeRule.onNodeWithText(copy(R.string.whatsapp_send_button)).performScrollTo().performClick()
        composeRule.onAllNodesWithText(copy(R.string.stock_whatsapp_opening)).assertCountEquals(0)

        composeRule.onNodeWithText(copy(R.string.stock_send_email_button)).performScrollTo().performClick()
        composeRule.onAllNodesWithText(copy(R.string.stock_email_opening)).assertCountEquals(0)
        composeRule.onNode(isDialog()).assertDoesNotExist()
    }

    @Test
    fun `failing startActivity in StockHistoryScreen opens error ActionResultDialog`() {
        val vm = loadedHistoryViewModel()
        val failingContext = object : ContextWrapper(context) {
            override fun startActivity(intent: Intent?) {
                throw ActivityNotFoundException("no handler")
            }
        }
        composeRule.setContent {
            CompositionLocalProvider(LocalContext provides failingContext) {
                TrindadeTheme { StockHistoryScreen(viewModel = vm) }
            }
        }
        composeRule.waitUntil(3_000) { !vm.state.value.loading }

        composeRule.onNodeWithText(copy(R.string.whatsapp_send_button)).performScrollTo().performClick()
        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.open_app_failed)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.action_result_close)).performClick()

        composeRule.onNodeWithText(copy(R.string.stock_send_email_button)).performScrollTo().performClick()
        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.open_app_failed)).assertIsDisplayed()
    }
}
