package com.trindade.app.admin

import android.content.Context
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
 * The integration the panel asks for, what it answers, and only that.
 *
 * The web has always asked for the address, the user and the password; the phone also asked for an "operator
 * code" the ERP uses as a seat fallback. Two screens describing one integration have to describe the same one,
 * so these tests pin the three fields and the absence of the fourth. The second one pins where an answer goes:
 * the card is the one screen that explains an integration failure, and a sentence that grows it moves the
 * fields the operator is about to correct.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w375dp-h800dp")
class AdminIntegrationCardTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun state(
        message: UiText? = null,
        messageIsError: Boolean = false,
    ) = IntegrationSettingsViewModel.UiState(
        wsUrl = "http://10.0.0.10:8080",
        username = "WILKIN",
        password = "pw",
        userCode = "1",
        message = message,
        messageIsError = messageIsError,
    )

    private fun render(
        state: IntegrationSettingsViewModel.UiState = state(),
        onDismissMessage: () -> Unit = {},
        onSave: () -> Unit = {},
    ) {
        composeRule.setContent {
            TrindadeTheme {
                AdminIntegrationCard(
                    state = state,
                    onWsUrlChange = {},
                    onUsernameChange = {},
                    onPasswordChange = {},
                    onTest = {},
                    onSave = onSave,
                    onDismissMessage = onDismissMessage,
                )
            }
        }
    }

    @Test
    fun `the integration asks for the address, the user and the password, and nothing else`() {
        render()

        composeRule.onNodeWithText(string(R.string.admin_integration_username)).assertIsDisplayed()
        composeRule.onNodeWithText(string(R.string.admin_integration_password)).assertIsDisplayed()
        composeRule.onNodeWithText(string(R.string.admin_integration_ws_url)).assertIsDisplayed()
        // The fourth field is the one the web never had: "Código do usuário" in Portuguese, "Código del
        // usuario" in Spanish, so the check is on the prefix both share.
        assertEquals(
            0,
            composeRule.onAllNodesWithText("Código d", substring = true).fetchSemanticsNodes().size,
        )
    }

    @Test
    fun `an answer from the plant is a dialog with a way out`() {
        var dismissed = 0
        render(
            state(
                message = UiText.of(R.string.admin_integration_probe_ok, "WILKIN"),
                messageIsError = false,
            ),
            onDismissMessage = { dismissed++ },
        )

        composeRule.onNode(isDialog()).assertExists()
        composeRule.onNodeWithText(string(R.string.admin_integration_probe_ok, "WILKIN")).assertIsDisplayed()
        // And exactly once: the dialog replaced the line under the buttons rather than joining it.
        composeRule.onAllNodesWithText(string(R.string.admin_integration_probe_ok, "WILKIN"))
            .assertCountEquals(1)

        composeRule.onNodeWithText(string(R.string.action_result_close)).performClick()
        assertEquals(1, dismissed)
    }

    @Test
    fun `a refusal is told apart from an answer`() {
        render(state(message = UiText.of(R.string.admin_integration_no_wifi), messageIsError = true))

        composeRule.onNodeWithText(string(R.string.action_result_error)).assertIsDisplayed()
    }

    @Test
    fun `the save press says it is saving and cannot be pressed twice`() {
        var saves = 0
        render(
            state().copy(isSaving = true),
            onSave = { saves++ },
        )

        composeRule.onNodeWithText(string(R.string.admin_integration_saving)).assertIsDisplayed()
        composeRule.onNodeWithText(string(R.string.admin_integration_saving)).performClick()
        assertEquals("el segundo toque no llega", 0, saves)
    }

    private fun string(resId: Int, vararg args: Any): String = context.getString(resId, *args)
}
