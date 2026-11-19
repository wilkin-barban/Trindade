package com.trindade.app.massas

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The launch bar stays where the thumb left it.
 *
 * The module said "sticky" in its comments while the buttons travelled with the scroll: with ten products open
 * the operator had to reach the end of the screen to launch the day. What is asserted here is the only thing
 * that matters about a fixed bar -- that scrolling the body does not move it.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class MassasLaunchBarTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `the bar keeps its place while the body scrolls and its buttons still answer`() {
        var cleared = 0
        var launched = 0
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                Column(modifier = Modifier.fillMaxSize()) {
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState()),
                    ) {
                        repeat(30) { index -> Text("producto $index") }
                    }
                    MassasLaunchBar(
                        hasAnyQuantity = true,
                        isSubmitting = false,
                        onClear = { cleared += 1 },
                        onLaunch = { launched += 1 },
                    )
                }
            }
        }

        val bar = composeRule.onNodeWithTag(MASSAS_LAUNCH_BAR_TAG)
        val before = bar.getUnclippedBoundsInRoot()

        composeRule.onNodeWithText("producto 29").performScrollTo()

        val after = composeRule.onNodeWithTag(MASSAS_LAUNCH_BAR_TAG).getUnclippedBoundsInRoot()
        assertEquals("la barra no se mueve al scrollear el cuerpo", before.top, after.top)
        assertEquals("y conserva su alto", before.bottom, after.bottom)

        composeRule.onNodeWithText("Lançar").performClick()
        composeRule.onNodeWithText("Limpar").performClick()
        assertEquals(1, launched)
        assertEquals(1, cleared)
    }

    @Test
    fun `the launch action is disabled when the day has nothing`() {
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                MassasLaunchBar(
                    hasAnyQuantity = false,
                    isSubmitting = false,
                    onClear = {},
                    onLaunch = {},
                )
            }
        }

        composeRule.onNodeWithText("Lançar").assertIsNotEnabled()
        composeRule.onNodeWithText("Limpar").assertIsNotEnabled()
    }
}
