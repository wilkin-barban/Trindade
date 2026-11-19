package com.trindade.app.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.trindade.app.R
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

/**
 * Las fotos que el reporte va a llevar, elegidas antes de guardarlo.
 *
 * La web las pide en la creación y en la edición; en el teléfono no existían y la evidencia había que subirla
 * después, desde el detalle, con el reporte ya firmado. Acá se eligen, se comprimen y quedan esperando el
 * `reportId` que las recibe.
 */
@Composable
fun ReportPhotosSection(
    pendingCount: Int,
    maxPhotos: Int = MAX_PENDING_PHOTOS,
    onAddPhotos: () -> Unit,
    onRemovePhoto: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = stringResource(R.string.report_photos_pending_count, pendingCount, maxPhotos),
                style = MaterialTheme.typography.titleMedium,
            )
            OutlinedButton(
                onClick = onAddPhotos,
                enabled = pendingCount < maxPhotos,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag("report-photo-input"),
            ) {
                Text(stringResource(R.string.report_photos_add), style = MaterialTheme.typography.labelLarge)
            }
            for (index in 0 until pendingCount) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.report_photo_number, index + 1), style = MaterialTheme.typography.bodySmall)
                    TextButton(
                        onClick = { onRemovePhoto(index) },
                        modifier = Modifier
                            .defaultMinSize(minHeight = 48.dp)
                            .testTag("remove-pending-photo-btn"),
                    ) {
                        Text(stringResource(R.string.report_photo_remove))
                    }
                }
            }
        }
    }
}
