package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.trindade.app.R

/**
 * Where a history says which page it is on and offers the two ways to another one.
 *
 * Reports and schedules both page on the server and both drew the same sentence with the same two buttons, so
 * it is one piece now. The maximum is the larger of the answer and one: the server reports zero pages for an
 * empty history, and "Página 1 de 0" is a sentence about arithmetic rather than about the records. The two
 * buttons are disabled while a page is in flight, so a second tap cannot ask for a page relative to an answer
 * that has not arrived.
 */
@Composable
fun HistoryPager(
    page: Int,
    totalPages: Int,
    total: Int,
    canGoPrevious: Boolean,
    canGoNext: Boolean,
    loading: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
    ) {
        Text(
            text = stringResource(R.string.history_pagination, page, maxOf(1, totalPages), total),
            style = MaterialTheme.typography.bodyMedium,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AdminSecondaryButton(
                onClick = onPrevious,
                enabled = canGoPrevious && !loading,
                text = stringResource(R.string.history_previous),
            )
            AdminSecondaryButton(
                onClick = onNext,
                enabled = canGoNext && !loading,
                text = stringResource(R.string.history_next),
            )
        }
    }
}
