package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.trindade.app.R

/**
 * The date a history is filtered by, as one line of chips instead of a pair of buttons.
 *
 * The two pickers were drawn as full-width filled buttons, one per row, so a filter that is usually left
 * alone took two of the screen's tallest controls and pushed the first record below the fold; on a phone the
 * three actions wrapped onto a third row as well. A chip is the same decision in the shape the rest of the
 * filters use: it says which date it holds, it fills when it holds one, and the row it lives in also carries
 * the way to drop the filter.
 *
 * Each chip keeps the platform's 48dp touch target while drawing at chip height, which is what lets the three
 * of them sit on one line. The labels are the dates themselves once a filter is set -- the heading above
 * already names the day, so a chip repeating "Dia:" would only cost the width the row has.
 */
@Composable
fun HistoryFilterBar(
    dayLabel: String,
    daySelected: Boolean,
    onPickDay: () -> Unit,
    monthLabel: String,
    monthSelected: Boolean,
    onPickMonth: () -> Unit,
    modifier: Modifier = Modifier,
    onClear: (() -> Unit)? = null,
    clearLabel: String = "",
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HistoryFilterChip(
            iconRes = R.drawable.ic_calendar,
            label = dayLabel,
            selected = daySelected,
            onClick = onPickDay,
            modifier = Modifier.weight(1f),
        )
        HistoryFilterChip(
            iconRes = R.drawable.ic_date_range,
            label = monthLabel,
            selected = monthSelected,
            onClick = onPickMonth,
            modifier = Modifier.weight(1f),
        )
        if (onClear != null) {
            IconButton(onClick = onClear, modifier = Modifier.size(48.dp)) {
                Icon(
                    painter = painterResource(R.drawable.ic_close),
                    contentDescription = clearLabel,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        } else {
            // The row keeps its two equal halves and its own height when nothing is filtered, so the chips
            // do not jump the moment one of them is set: the space the clear action will take is reserved.
            Spacer(modifier = Modifier.size(48.dp))
        }
    }
}

/**
 * One date picker of [HistoryFilterBar].
 *
 * Selected and unselected differ in fill and in weight of the label, never in height: the row is one line
 * whatever it holds, and a filter that is set is visible without reading the date.
 */
@Composable
private fun HistoryFilterChip(
    iconRes: Int,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        modifier = modifier,
        label = {
            Text(
                text = label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelLarge,
            )
        },
        leadingIcon = {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
        },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
            selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
            selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ),
    )
}
