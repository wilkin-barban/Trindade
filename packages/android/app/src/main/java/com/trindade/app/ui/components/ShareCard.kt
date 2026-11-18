package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trindade.app.R
import com.trindade.app.ui.UiText
import com.trindade.app.ui.resolve

/**
 * Navigation mode for [ShareCard], corresponding to web's `?saved=1`, `?share=1`, and `from=history`.
 */
enum class ShareCardMode {
    SAVED,
    SHARE,
    FROM_HISTORY,
}

/**
 * Reusable read-only share card for export messages (reports and schedule loading).
 *
 * Displays the server's text verbatim, handles sharing via WhatsApp and PDF export,
 * and provides navigation according to [mode]:
 * - [ShareCardMode.SAVED]: offers edit (if [onEdit] is present) and close.
 * - [ShareCardMode.SHARE] and [ShareCardMode.FROM_HISTORY]: offers a single back action and no edit.
 *
 * Never renders a copy button. All actions are full-width and maintain >= 44dp touch targets.
 */
@Composable
fun ShareCard(
    title: String,
    subtitle: String?,
    text: String?,
    loading: Boolean,
    error: UiText?,
    mode: ShareCardMode,
    onShare: () -> Unit,
    onPdf: () -> Unit,
    onEdit: (() -> Unit)?,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            HorizontalDivider()

            if (loading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            } else if (error != null) {
                Text(
                    text = error.resolve(),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            } else if (text != null) {
                Text(
                    text = text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            HorizontalDivider()

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val actionsEnabled = !loading && error == null && !text.isNullOrBlank()

                AdminPrimaryButton(
                    onClick = onShare,
                    text = stringResource(R.string.share_card_share_whatsapp),
                    enabled = actionsEnabled,
                    modifier = Modifier.fillMaxWidth(),
                )

                AdminSecondaryButton(
                    onClick = onPdf,
                    text = stringResource(R.string.share_card_export_pdf),
                    enabled = actionsEnabled,
                    modifier = Modifier.fillMaxWidth(),
                )

                when (mode) {
                    ShareCardMode.SAVED -> {
                        if (onEdit != null) {
                            AdminSecondaryButton(
                                onClick = onEdit,
                                text = stringResource(R.string.share_card_edit),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        AdminSecondaryButton(
                            onClick = onClose,
                            text = stringResource(R.string.share_card_close),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    ShareCardMode.SHARE,
                    ShareCardMode.FROM_HISTORY -> {
                        AdminSecondaryButton(
                            onClick = onClose,
                            text = stringResource(R.string.share_card_back),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}
