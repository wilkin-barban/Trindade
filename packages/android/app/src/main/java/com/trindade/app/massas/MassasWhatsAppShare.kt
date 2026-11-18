package com.trindade.app.massas

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.trindade.app.R
import com.trindade.app.ui.BrazilianPhoneVisualTransformation
import com.trindade.app.ui.filterPhoneDigits

/**
 * The day's WhatsApp block: the message, its live preview and the one action that sends it.
 *
 * It belongs to the history, not to the launch. The web moved it there for the same reason this file exists:
 * the operator reading a past day is the one who sends it, and the operator filling the grid has nothing to
 * send yet. `MassasLaunchScreen` mounts it only when the day was opened from the history.
 *
 * There is no copy button. The native sheet carries the text, and a second way to do the same thing was a
 * button the plant never asked for.
 */
@Composable
fun MassasWhatsAppShare(
    shareText: String,
    phone: String,
    onPhoneChange: (String) -> Unit,
    whatsappLink: String?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.massas_whatsapp_share),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
            )

            OutlinedTextField(
                value = phone,
                onValueChange = { onPhoneChange(filterPhoneDigits(it)) },
                visualTransformation = BrazilianPhoneVisualTransformation(),
                label = { Text(stringResource(R.string.whatsapp_phone_label)) },
                placeholder = { Text(stringResource(R.string.whatsapp_phone_placeholder)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = stringResource(R.string.share_preview_label),
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    // A day with nothing to say keeps the block visible and its preview empty: the operator
                    // reads that there is nothing to send instead of finding the section gone.
                    Text(
                        text = shareText.ifBlank { stringResource(R.string.massas_share_empty) },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            // The action follows the data and not the phone: with a message written, WhatsApp lets the
            // operator pick the chat; only an empty day disables it.
            Button(
                onClick = {
                    if (whatsappLink != null) {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(whatsappLink)))
                    }
                },
                enabled = shareText.isNotBlank() && whatsappLink != null,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp),
            ) {
                Text(
                    text = "WhatsApp",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                )
            }
        }
    }
}
