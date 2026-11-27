package com.trindade.app.massas

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MassasWhatsAppShareTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    @Test
    fun `failing startActivity shows error ActionResultDialog instead of crashing`() {
        val failingContext = object : ContextWrapper(context) {
            override fun startActivity(intent: Intent?) {
                throw ActivityNotFoundException("no handler")
            }
        }
        composeRule.setContent {
            CompositionLocalProvider(LocalContext provides failingContext) {
                TrindadeTheme {
                    MassasWhatsAppShare(
                        shareText = "Resumo de massas",
                        phone = "11999998888",
                        onPhoneChange = {},
                        whatsappLink = "https://api.whatsapp.com/send?phone=5511999998888&text=ok",
                    )
                }
            }
        }

        composeRule.onNodeWithText("WhatsApp").performClick()

        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.action_result_error)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.open_app_failed)).assertIsDisplayed()

        composeRule.onNodeWithText(copy(R.string.action_result_close)).performClick()
        composeRule.onNode(isDialog()).assertDoesNotExist()
    }
}
