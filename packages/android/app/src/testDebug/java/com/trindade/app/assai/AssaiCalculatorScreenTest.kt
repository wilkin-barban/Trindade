package com.trindade.app.assai

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
import com.trindade.app.massas.WhatsappAbbreviations
import com.trindade.app.massas.WhatsappAbbreviationsSource
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AssaiCalculatorScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    private fun preparedViewModel(): AssaiViewModel {
        val abbreviations = object : WhatsappAbbreviationsSource(null) {
            override val table: WhatsappAbbreviations
                get() = WhatsappAbbreviations.parse("""{"catalogueByCode":{},"catalogueByName":{},"erpByName":{}}""")
        }
        return AssaiViewModel(abbreviations).apply {
            onQuantityChange("Nhoque 1kg", "30")
            onNumberChange("11999998888")
        }
    }

    @Test
    fun `tapping whatsapp share never displays opening conversation text below button`() {
        val vm = preparedViewModel()
        composeRule.setContent {
            TrindadeTheme { AssaiCalculatorScreen(viewModel = vm) }
        }

        composeRule.onNodeWithText(copy(R.string.whatsapp_send_button)).performScrollTo().performClick()

        composeRule.onAllNodesWithText(copy(R.string.stock_whatsapp_opening)).assertCountEquals(0)
        composeRule.onNode(isDialog()).assertDoesNotExist()
    }

    @Test
    fun `failing startActivity shows error ActionResultDialog without inline note`() {
        val vm = preparedViewModel()
        val failingContext = object : ContextWrapper(context) {
            override fun startActivity(intent: Intent?) {
                throw ActivityNotFoundException("no handler")
            }
        }
        composeRule.setContent {
            CompositionLocalProvider(LocalContext provides failingContext) {
                TrindadeTheme { AssaiCalculatorScreen(viewModel = vm) }
            }
        }

        composeRule.onNodeWithText(copy(R.string.whatsapp_send_button)).performScrollTo().performClick()

        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.action_result_error)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.open_app_failed)).assertIsDisplayed()
    }
}
