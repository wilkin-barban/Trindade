package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The shape a history is drawn with, pinned on the components rather than on each screen.
 *
 * The four histories were asked to look like the Massas one, and the Massas one was the only place that shape
 * existed. These tests state it where it now lives: the header carries the way out and what is in the page,
 * a record is a full width card with its action at the closing corner, and the pager never offers a page that
 * a read in flight would answer twice.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp")
class HistoryComponentsTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: android.content.Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int, vararg args: Any): String = context.getString(id, *args)

    @Test
    fun `the header carries the way out, the title and what is in the page`() {
        var backed = 0
        composeRule.setContent {
            TrindadeTheme {
                HistoryHeader(
                    title = "Histórico de Teste",
                    subtitle = "7 dias registrados",
                    onBack = { backed++ },
                )
            }
        }

        composeRule.onNodeWithText("Histórico de Teste").assertIsDisplayed()
        composeRule.onNodeWithText("7 dias registrados").assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.report_back)).performClick()

        assertEquals(1, backed)
    }

    @Test
    fun `help is drawn only where the screen has something to explain`() {
        composeRule.setContent {
            TrindadeTheme {
                HistoryHeader(title = "Histórico de Teste", onBack = {})
            }
        }

        composeRule.onNodeWithContentDescription(copy(R.string.help_button_label)).assertDoesNotExist()
    }

    @Test
    fun `a record is a full width card with its action at the closing corner`() {
        var opened = 0
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(411.dp)) {
                    HistoryRecordCard(
                        onClick = { opened++ },
                        action = "Abrir ›",
                        modifier = Modifier.testTag("record"),
                        lines = {
                            Text("📅 12/03/2026")
                            Text("120 caixas · 4200 unidades")
                        },
                    )
                }
            }
        }

        val card = composeRule.onNodeWithTag("record").getUnclippedBoundsInRoot()
        assertEquals(411f, card.right.value - card.left.value, 0.5f)

        val action = composeRule.onNodeWithText("Abrir ›", useUnmergedTree = true).getUnclippedBoundsInRoot()
        assertTrue("the action closes the row, at its right edge", action.right.value > card.right.value / 2f)
        assertTrue(action.right.value <= card.right.value)

        composeRule.onNodeWithText("120 caixas · 4200 unidades").performClick()
        assertEquals(1, opened)
    }

    @Test
    fun `a record's own decisions ride its closing line and add no height`() {
        composeRule.setContent {
            TrindadeTheme {
                Column(modifier = Modifier.fillMaxWidth()) {
                    HistoryRecordCard(
                        onClick = {},
                        modifier = Modifier.testTag("plain").fillMaxWidth(),
                        action = "Abrir ›",
                        lines = {
                            HistoryDateLabel(date = "18/09/2026")
                            Text("12 carregamentos")
                            Text("Carregado em 19/09/2026")
                        },
                    )
                    HistoryRecordCard(
                        onClick = {},
                        modifier = Modifier.testTag("acted").fillMaxWidth(),
                        action = "Abrir ›",
                        lines = {
                            HistoryDateLabel(date = "18/09/2026")
                            Text("12 carregamentos")
                            Text("Carregado em 19/09/2026")
                        },
                        actions = {
                            HistoryIconAction(
                                iconRes = R.drawable.ic_deactivate,
                                label = "Desativar",
                                onClick = {},
                            )
                            HistoryIconAction(
                                iconRes = R.drawable.ic_delete,
                                label = "Excluir",
                                onClick = {},
                                destructive = true,
                            )
                        },
                    )
                }
            }
        }

        val plain = composeRule.onNodeWithTag("plain").getUnclippedBoundsInRoot()
        val acted = composeRule.onNodeWithTag("acted").getUnclippedBoundsInRoot()

        // The claim the glyphs are drawn for: on a record that carries a date and two more lines -- the
        // shape both histories draw -- the decisions cost no height at all. The pills this replaces added a
        // row below those lines, and the text actions added it again at the height of a button.
        assertEquals(
            "a card with actions must not be taller than one without",
            plain.bottom.value - plain.top.value,
            acted.bottom.value - acted.top.value,
            0.5f,
        )

        // And they are on the closing line rather than on one of their own: level with the way in.
        // The second one, because both cards draw the same way in and only the acted card has the glyphs.
        val wayIn = composeRule.onAllNodesWithText("Abrir ›", useUnmergedTree = true)[1].getUnclippedBoundsInRoot()
        val delete = composeRule.onNodeWithContentDescription("Excluir").getUnclippedBoundsInRoot()
        val overlap = minOf(wayIn.bottom.value, delete.bottom.value) - maxOf(wayIn.top.value, delete.top.value)
        assertTrue("the decisions must share the way in's line, overlapped by $overlap dp", overlap > 0f)
    }

    @Test
    fun `a record's date is drawn with the app's own calendar and not a printed emoji date`() {
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(411.dp)) {
                    HistoryRecordCard(
                        onClick = {},
                        modifier = Modifier.testTag("record"),
                        lines = { HistoryDateLabel(date = "30/10/2026") },
                    )
                }
            }
        }

        // One date, and the one the record carries: the emoji this used to prefix drew a calendar page
        // printing "JUL 17", so every card showed a second, identical date that no record had.
        composeRule.onNodeWithText("30/10/2026", useUnmergedTree = true).assertIsDisplayed()
        composeRule.onNodeWithText("📅 30/10/2026", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `a record's decisions are glyphs that still reach 48dp`() {
        var deleted = 0
        var deactivated = 0
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(411.dp)) {
                    HistoryRecordCard(
                        onClick = {},
                        modifier = Modifier.testTag("record"),
                        lines = { Text("Horário de 12/03") },
                        actions = {
                            HistoryIconAction(
                                iconRes = R.drawable.ic_deactivate,
                                label = "Desativar",
                                onClick = { deactivated++ },
                            )
                            HistoryIconAction(
                                iconRes = R.drawable.ic_delete,
                                label = "Excluir",
                                onClick = { deleted++ },
                                destructive = true,
                            )
                        },
                    )
                }
            }
        }

        // Found by the name it announces, because a glyph is the whole of what it draws.
        composeRule.onNodeWithContentDescription("Excluir").performClick()
        composeRule.onNodeWithContentDescription("Desativar").performClick()
        assertEquals(1, deleted)
        assertEquals(1, deactivated)

        for (label in listOf("Desativar", "Excluir")) {
            val bounds = composeRule.onNodeWithContentDescription(label).getUnclippedBoundsInRoot()
            val height = bounds.bottom - bounds.top
            val width = bounds.right - bounds.left
            assertTrue("\"$label\" must stay reachable: $height is under the 48dp target", height >= 48.dp)
            assertTrue("\"$label\" must stay reachable: $width is under the 48dp target", width >= 48.dp)
        }
    }

    @Test
    fun `the pager says which page it is on and refuses one that is not there`() {
        composeRule.setContent {
            TrindadeTheme {
                HistoryPager(
                    page = 1,
                    totalPages = 0,
                    total = 0,
                    canGoPrevious = false,
                    canGoNext = false,
                    loading = false,
                    onPrevious = {},
                    onNext = {},
                )
            }
        }

        // The server answers zero pages for an empty history; "Página 1 de 0" would be arithmetic, not a page.
        composeRule.onNodeWithText(copy(R.string.history_pagination, 1, 1, 0)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.history_previous)).assertIsNotEnabled()
        composeRule.onNodeWithText(copy(R.string.history_next)).assertIsNotEnabled()
    }

    @Test
    fun `the pager keeps both buttons disabled while a page is in flight`() {
        composeRule.setContent {
            TrindadeTheme {
                HistoryPager(
                    page = 2,
                    totalPages = 3,
                    total = 25,
                    canGoPrevious = true,
                    canGoNext = true,
                    loading = true,
                    onPrevious = {},
                    onNext = {},
                )
            }
        }

        composeRule.onNodeWithText(copy(R.string.history_previous)).assertIsNotEnabled()
        composeRule.onNodeWithText(copy(R.string.history_next)).assertIsNotEnabled()
    }

    @Test
    fun `the pager offers the pages that exist`() {
        composeRule.setContent {
            TrindadeTheme {
                HistoryPager(
                    page = 2,
                    totalPages = 3,
                    total = 25,
                    canGoPrevious = true,
                    canGoNext = true,
                    loading = false,
                    onPrevious = {},
                    onNext = {},
                )
            }
        }

        composeRule.onNodeWithText(copy(R.string.history_previous)).assertIsEnabled()
        composeRule.onNodeWithText(copy(R.string.history_next)).assertIsEnabled()
    }

    @Test
    fun `an empty history states it and offers no retry`() {
        composeRule.setContent {
            TrindadeTheme {
                HistoryEmptyState(message = "Nenhum histórico encontrado.")
            }
        }

        composeRule.onNodeWithText("Nenhum histórico encontrado.").assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.report_retry)).assertDoesNotExist()
    }

    @Test
    fun `a failed read keeps its retry`() {
        var retried = 0
        composeRule.setContent {
            TrindadeTheme {
                HistoryErrorBanner(message = "⚠ Falha ao consultar", onRetry = { retried++ })
            }
        }

        composeRule.onNodeWithText("⚠ Falha ao consultar").assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.report_retry)).performClick()

        assertEquals(1, retried)
    }
}
