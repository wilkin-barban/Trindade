package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.res.painterResource
import androidx.compose.material3.Icon
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Button
import com.trindade.app.ui.components.NavigationActionButton
import androidx.compose.ui.platform.testTag
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
 * - Editar is drawn whenever [onEdit] is present, whatever the mode: whether a day can still be corrected is a
 *   fact about that day and that viewer -- today, and allowed by the server -- not about the door it was opened
 *   from. The caller is what knows it, so the caller supplies the callback or does not.
 * - [ShareCardMode.SAVED] closes with Cerrar; [ShareCardMode.SHARE] and [ShareCardMode.FROM_HISTORY] close with
 *   Volver, which is the door that opened them.
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
    /**
     * Las fotos que viajan con el mensaje, como miniaturas arriba del texto.
     *
     * Son de solo lectura: la tarjeta comparte y la galería de la pantalla es donde se borran. La app no trae una
     * librería de imágenes, así que la miniatura se decodifica con las APIs del sistema desde la URL pública.
     */
    photos: List<String> = emptyList(),
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // La vuelta va arriba a la izquierda, como en todos los módulos. Abajo quedaba al lado de
                // Compartir y del PDF, donde se lee como una cuarta acción del mensaje y no como la salida.
                if (mode != ShareCardMode.SAVED) {
                    NavigationActionButton(
                        onClick = onClose,
                        text = stringResource(R.string.share_card_back),
                        modifier = Modifier.testTag("share-card-back"),
                    )
                }
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
            }

            HorizontalDivider()

            PhotoThumbnails(
                photos = photos,
                modifier = Modifier.fillMaxWidth(),
                testTagPrefix = "share-card",
            )

            if (photos.isNotEmpty()) HorizontalDivider()

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

                // El mismo tratamiento que la web: verde de WhatsApp con su icono, a todo el ancho y 48 dp. Es la
                // acción primaria de la tarjeta, y el color la distingue de PDF y de las secundarias.
                Button(
                    onClick = onShare,
                    enabled = actionsEnabled,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = com.trindade.app.ui.theme.BrandWhatsApp,
                        contentColor = com.trindade.app.ui.theme.BrandOnPrimary,
                        disabledContainerColor = com.trindade.app.ui.theme.BrandWhatsApp.copy(alpha = 0.4f),
                        disabledContentColor = com.trindade.app.ui.theme.BrandOnPrimary.copy(alpha = 0.8f),
                    ),
                    modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp).testTag("share-card-whatsapp"),
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_chat),
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.share_card_share_whatsapp),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                AdminSecondaryButton(
                    onClick = onPdf,
                    text = stringResource(R.string.share_card_export_pdf),
                    enabled = actionsEnabled,
                    modifier = Modifier.fillMaxWidth(),
                )

                if (onEdit != null) {
                    AdminSecondaryButton(
                        onClick = onEdit,
                        text = stringResource(R.string.share_card_edit),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                if (mode == ShareCardMode.SAVED) {
                    AdminSecondaryButton(
                        onClick = onClose,
                        text = stringResource(R.string.share_card_close),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}
