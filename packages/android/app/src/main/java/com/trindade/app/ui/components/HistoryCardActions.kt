package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import com.trindade.app.R

/**
 * The date a history card is about, as the card's own heading.
 *
 * The cards used to prefix their dates with the calendar emoji, which the platform's emoji font draws as a
 * page printing "JUL 17" -- so every card carried the same small July date next to dates that differed, and
 * the one part of the line that was supposed to be decoration became the part that was read as a fact. An
 * owned icon cannot print a date: it is the project's own calendar, tinted like the rest of the app, and the
 * only date in the line is the one the record carries.
 *
 * The style is the caller's, because a day's date is the card's title where a schedule's date shares its line
 * with a count; what is shared is the pairing and the gap between the two.
 */
@Composable
fun HistoryDateLabel(
    date: String,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.titleMedium,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_calendar),
            // The date beside it is the fact; announcing "calendar" before it would name the decoration.
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
        Text(text = date, style = style)
    }
}

/**
 * A record's own action, at the end of its card.
 *
 * Deactivating and deleting a record were drawn with the same filled pills the admin screens use for their
 * primary actions, so the smallest decision on a card — retracting one schedule — was the largest thing on it,
 * and a list of cards read as a list of buttons. As a text action it keeps the reference card's language: the
 * label is the whole target, the touch area still reaches 48dp, and the destructive one is told apart by its
 * colour rather than by its size.
 */
@Composable
fun HistoryActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    destructive: Boolean = false,
) {
    TextButton(
        onClick = onClick,
        modifier = modifier.heightIn(min = 48.dp),
        enabled = enabled,
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = if (destructive) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.primary
            },
            maxLines = 1,
            modifier = Modifier.padding(0.dp),
        )
    }
}
