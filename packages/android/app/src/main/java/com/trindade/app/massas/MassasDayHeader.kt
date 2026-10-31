package com.trindade.app.massas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trindade.app.R

/** The day's single sync action, and the tag the screen tests look for. */
const val MASSAS_SYNC_TAG: String = "massas-sync-erp"

/** The header's spinner, so a test can tell "syncing" from "nothing happened". */
const val MASSAS_SYNC_SPINNER_TAG: String = "massas-sync-erp-progress"

/**
 * The production date, with the one action that refreshes it.
 *
 * There used to be two ways to refresh the same day: a button on this row and a whole card underneath, each
 * with its own labels, and between them they spent the vertical space a handset needs for the table. Since the
 * action and the date are the same subject, they share the header: the date on the left, the action on the
 * right, and the last time the day was read from the ERP right under them -- "já sincronizei" is only worth
 * reading if it can be checked, and it costs one line here instead of a card.
 */
@Composable
fun MassasDayHeader(
    date: String,
    syncedAt: String?,
    isSyncing: Boolean,
    onSync: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.massas_production_date, brazilianDate(date)),
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f, fill = false),
                )
                // Tonal, not outlined: it is the screen's one refresh, it sits next to the date it refreshes,
                // and it keeps the 48dp the rest of the module's actions use.
                FilledTonalButton(
                    onClick = onSync,
                    // Only the sync itself withholds the action: a bridge without settings is a reason the
                    // press explains in the result dialog, not a reason to remove the press.
                    enabled = !isSyncing,
                    modifier = Modifier
                        .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                        .testTag(MASSAS_SYNC_TAG),
                ) {
                    if (isSyncing) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(16.dp)
                                .testTag(MASSAS_SYNC_SPINNER_TAG),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.massas_sync_erp),
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }
            Text(
                text = syncedAt?.let { stringResource(R.string.massas_synced_at, it) }
                    ?: stringResource(R.string.massas_never_synced),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
