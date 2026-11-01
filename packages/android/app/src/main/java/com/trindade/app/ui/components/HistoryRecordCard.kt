package com.trindade.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * One day, one report, one schedule, one count -- as the row a history is a list of.
 *
 * The Massas history is the reference the rest were asked to look like: a filled card, the record's own lines
 * stacked at the left with four dp between them, and the way in at the right, in the primary colour. The lines
 * are the caller's, because a report says its date and shift where a day says its boxes and its operators; what
 * this owns is the shape they are read in.
 *
 * [actions] is for a record's own decisions -- deactivating a report, deleting a schedule -- and sits on the
 * card's closing line, as glyphs beside the way in: a record that can be acted on is the height of its own
 * lines, which is what the pills and then the text actions it used to carry could not be.
 */
@Composable
fun HistoryRecordCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    action: String? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
    lines: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    content = lines,
                )
                // The way in and the record's own decisions share one line: the first is what the card is
                // for, the second are the two things done to it without opening it. A row here instead of a
                // row below is what keeps this card the height of its own lines, which is the height the
                // reference card has -- the pills this replaces set that height from a control.
                if (action != null || actions != null) {
                    Row(
                        modifier = Modifier.padding(start = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (action != null) {
                            Text(
                                text = action,
                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                        if (actions != null) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(0.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                content = actions,
                            )
                        }
                    }
                }
            }
        }
    }
}
