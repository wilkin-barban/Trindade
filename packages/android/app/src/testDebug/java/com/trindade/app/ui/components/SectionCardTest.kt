package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
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
 * What a screen's block is allowed to be narrower than.
 *
 * The complaint was about Compartilhar App, where the WhatsApp block and the message preview each drew
 * themselves as wide as their words, with a margin on the right that belonged to nobody. The cause is the
 * component, so the rule is stated on the component: a section is the width it is given, at the widths these
 * phones and the plant's tablet actually have.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w800dp-h1000dp")
class SectionCardTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun drawSectionIn(width: Int, text: String = "one short line") {
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(width.dp)) {
                    SectionCard(modifier = Modifier.testTag("section")) {
                        Text(text)
                    }
                }
            }
        }
    }

    @Test
    fun `a section is as wide as the space it is given`() {
        val widths = listOf(320, 360, 411, 800)
        composeRule.setContent {
            TrindadeTheme {
                Column {
                    widths.forEach { width ->
                        Box(modifier = Modifier.width(width.dp)) {
                            SectionCard(modifier = Modifier.testTag("section-$width")) {
                                Text("one short line")
                            }
                        }
                    }
                }
            }
        }

        widths.forEach { width ->
            val bounds = composeRule.onNodeWithTag("section-$width").getUnclippedBoundsInRoot()
            assertEquals(
                "a $width dp box must draw the section $width dp wide, not at its content's width",
                width.toFloat(),
                bounds.right.value - bounds.left.value,
                0.5f,
            )
        }
    }

    @Test
    fun `a section keeps the same width whatever it holds`() {
        // The defect in one picture: one short line drew a narrow block beside a wide one.
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(360.dp)) {
                    Column {
                        SectionCard(modifier = Modifier.testTag("short")) {
                            Text("ok")
                        }
                        SectionCard(modifier = Modifier.testTag("long")) {
                            Text("A much longer line that would have made the card wide on its own")
                        }
                    }
                }
            }
        }

        val short = composeRule.onNodeWithTag("short").getUnclippedBoundsInRoot()
        val long = composeRule.onNodeWithTag("long").getUnclippedBoundsInRoot()

        assertEquals(short.left.value, long.left.value, 0f)
        assertEquals(short.right.value, long.right.value, 0f)
    }

    @Test
    fun `the content sits inside the card rather than against its edge`() {
        drawSectionIn(411)

        val card = composeRule.onNodeWithTag("section").getUnclippedBoundsInRoot()
        val text = composeRule.onNodeWithText("one short line").getUnclippedBoundsInRoot()

        assertTrue("the first word must start after the card's own padding", text.left > card.left)
        assertTrue("and stop before its edge", text.right <= card.right)
    }
}
