package com.trindade.app.stock

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StockCalculatorScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    private fun loadedViewModel(): StockViewModel {
        val day = StockDay(
            date = "2026-10-23",
            products = listOf(
                StockDayProductsInner(
                    code = "787",
                    name = "CANUDO",
                    category = "Terceirizados",
                    unitsPerBox = 30,
                    boxes = 5,
                    units = 150,
                ),
            ),
            totalBoxes = 5,
            totalUnits = 150,
        )
        val api = object : StockApi {
            override suspend fun day(date: String): Response<StockDay> = Response.success(day)
            override suspend fun addEntry(body: JsonObject): Response<StockProduct> = error("unused")
            override suspend fun resetProduct(body: JsonObject): Response<StockProduct> = error("unused")
            override suspend fun history(): Response<StockHistory> =
                Response.success(StockHistory(listOf(StockHistoryDaysInner("2026-10-23", 1, 5, 150))))
        }
        return StockViewModel(StockRepository(api)).apply {
            onNumberChange("11999998888")
        }
    }

    @Test
    fun `tapping whatsapp or email share never opens opening-app dialog`() {
        val vm = loadedViewModel()
        composeRule.setContent {
            TrindadeTheme { StockCalculatorScreen(role = "Administrador", viewModel = vm) }
        }
        composeRule.waitUntil(3_000) { !vm.state.value.loading }

        composeRule.onNodeWithText(copy(R.string.whatsapp_send_button)).performScrollTo().performClick()
        composeRule.onAllNodesWithText(copy(R.string.stock_whatsapp_opening)).assertCountEquals(0)
        composeRule.onNode(isDialog()).assertDoesNotExist()

        composeRule.onNodeWithText(copy(R.string.stock_send_email_button)).performScrollTo().performClick()
        composeRule.onAllNodesWithText(copy(R.string.stock_email_opening)).assertCountEquals(0)
        composeRule.onNode(isDialog()).assertDoesNotExist()
    }

    @Test
    fun `failing startActivity shows error ActionResultDialog on whatsapp and email share`() {
        val vm = loadedViewModel()
        val failingContext = object : ContextWrapper(context) {
            override fun startActivity(intent: Intent?) {
                throw ActivityNotFoundException("no handler")
            }
        }
        composeRule.setContent {
            CompositionLocalProvider(LocalContext provides failingContext) {
                TrindadeTheme { StockCalculatorScreen(role = "Administrador", viewModel = vm) }
            }
        }
        composeRule.waitUntil(3_000) { !vm.state.value.loading }

        composeRule.onNodeWithText(copy(R.string.whatsapp_send_button)).performScrollTo().performClick()
        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.action_result_error)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.open_app_failed)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.action_result_close)).performClick()

        composeRule.onNodeWithText(copy(R.string.stock_send_email_button)).performScrollTo().performClick()
        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.open_app_failed)).assertIsDisplayed()
    }
}
