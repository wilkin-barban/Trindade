package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.IconButton
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
 * A record's own action, on the card's closing corner.
 *
 * Deactivating and deleting a record were drawn first as the filled pills the admin screens use, and then as
 * text actions: both made the record's smallest decision the element that set the card's height, and a list
 * of them read as a list of buttons. As a glyph the action keeps its meaning, its name -- announced through
 * [contentDescription] -- and its 48dp target, while taking the room of an icon; the destructive one is told
 * apart by its colour, not by its size.
 *
 * The handler is the button's own, so a tap on it acts on the record instead of opening it: the card behind
 * it is a door, and these are the two decisions taken without going through it.
 */
@Composable
fun HistoryIconAction(
    iconRes: Int,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    destructive: Boolean = false,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        // Sized rather than left to the button's own minimum: a glyph is 24dp in a 40dp container, and the
        // 48dp a glove needs is the target the operator actually lands on.
        modifier = modifier.size(48.dp),
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = label,
            tint = if (destructive) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.primary
            },
        )
    }
}
