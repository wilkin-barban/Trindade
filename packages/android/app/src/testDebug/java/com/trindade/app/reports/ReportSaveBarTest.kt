package com.trindade.app.reports

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The report's save stays at the foot of the screen.
 *
 * A report is thirty checkboxes and five temperatures; a save that travels with them is only reachable by
 * scrolling to the end of a form the operator is still filling. The same assertion as the Masas bar: scroll the
 * body, and the bar has not moved.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class ReportSaveBarTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `the save bar keeps its place while the form scrolls, and still saves`() {
        var saved = 0
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                Column(modifier = Modifier.fillMaxSize()) {
                    Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                        repeat(40) { index -> Text("tarea $index") }
                    }
                    ReportSaveBar(
                        enabled = true,
                        loading = false,
                        label = "Salvar",
                        onSubmit = { saved += 1 },
                    )
                }
            }
        }

        val before = composeRule.onNodeWithTag(REPORT_SAVE_BAR_TAG).getUnclippedBoundsInRoot()
        composeRule.onNodeWithText("tarea 39").performScrollTo()
        val after = composeRule.onNodeWithTag(REPORT_SAVE_BAR_TAG).getUnclippedBoundsInRoot()
        assertEquals("el pie de guardado no se mueve", before.top, after.top)

        composeRule.onNodeWithText("Salvar").assertIsDisplayed().performClick()
        assertEquals(1, saved)
    }

    @Test
    fun `a form that cannot be saved shows the action disabled`() {
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                ReportSaveBar(enabled = false, loading = false, label = "Salvar", onSubmit = {})
            }
        }

        composeRule.onNodeWithText("Salvar").assertIsNotEnabled()
    }
}
