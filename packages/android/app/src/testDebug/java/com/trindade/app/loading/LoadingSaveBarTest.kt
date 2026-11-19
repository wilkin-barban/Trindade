package com.trindade.app.loading

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
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
 * The loading day closes from a footer that does not scroll.
 *
 * The grid is long by nature -- a slot per half hour -- so the one action that ends the day cannot live at the
 * bottom of it. Same assertion as the other two bars: scroll the body, and the bar has not moved.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class LoadingSaveBarTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `the save bar keeps its place while the grid scrolls and closes the day`() {
        var saved = 0
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                Column(modifier = Modifier.fillMaxSize()) {
                    Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                        repeat(40) { index -> Text("turno $index") }
                    }
                    LoadingSaveBar(enabled = true, onSave = { saved += 1 })
                }
            }
        }

        val before = composeRule.onNodeWithTag(LOADING_SAVE_BAR_TAG).getUnclippedBoundsInRoot()
        composeRule.onNodeWithText("turno 39").performScrollTo()
        val after = composeRule.onNodeWithTag(LOADING_SAVE_BAR_TAG).getUnclippedBoundsInRoot()
        assertEquals("el pie del horario no se mueve", before.top, after.top)

        composeRule.onNodeWithText("Salvar Horário").assertIsDisplayed().performClick()
        assertEquals(1, saved)
    }

    @Test
    fun `a day with nothing to save keeps the action disabled`() {
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                LoadingSaveBar(enabled = false, onSave = {})
            }
        }

        composeRule.onNodeWithText("Salvar Horário").assertIsNotEnabled()
    }
}
