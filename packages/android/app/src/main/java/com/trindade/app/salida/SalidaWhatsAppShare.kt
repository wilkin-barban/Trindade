package com.trindade.app.salida

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
import androidx.compose.ui.platform.testTag
import com.trindade.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.massas.WhatsappAbbreviations
import com.trindade.app.massas.brazilianDate

/**
 * Las etiquetas del mensaje, resueltas por quien dibuja la pantalla.
 *
 * Los valores por defecto son los del portugués, que es el idioma de la planta: la tabla de la web
 * (`lib/salida.ts`) con los mismos nombres y el mismo emoji por bloque. Un locale distinto los sustituye con los
 * suyos sin que el constructor del texto sepa de idiomas.
 */
data class SalidaSummaryLabels(
    val title: String = "Saídas do dia",
    val movements: String = "Movimentos",
    val blocks: Map<String, String> = SALIDA_BLOCK_LABELS_PT,
)

/** Los nombres de bloque del mensaje, como los publica la web para el portugués. */
val SALIDA_BLOCK_LABELS_PT: Map<String, String> = mapOf(
    SalidaCatalog.BLOCK_EMBALAGENS to "Embalagens",
    SalidaCatalog.BLOCK_BOBINAS to "Bobinas",
    SalidaCatalog.BLOCK_MATERIA_PRIMA to "Matéria-Prima",
)

/** Un emoji por bloque, como la web: el mensaje los lleva delante del nombre, no en lugar de él. */
private val salidaBlockEmojis: Map<String, String> = mapOf(
    SalidaCatalog.BLOCK_EMBALAGENS to "📦",
    SalidaCatalog.BLOCK_BOBINAS to "🧵",
    SalidaCatalog.BLOCK_MATERIA_PRIMA to "🌾",
)

/**
 * El resumen del día tal como se manda por WhatsApp, **exactamente** como lo arma la web.
 *
 * Es el día, no una salida: la planta comparte lo que salió junto, por operario y por bloque, con la tabla de
 * abreviaturas que comparten el Relatório y los demás históricos. Sin códigos de producto y sin la etiqueta del
 * ERP: lo que el grupo lee es qué salió y cuánto.
 *
 * La forma es la de `salidaDaySummaryText` en `packages/frontend/src/lib/salida.ts`, y no una variante: el
 * operario va en mayúsculas y **sin negrita**, con dos puntos; sus líneas empiezan con `- ` y separan nombre y
 * cantidad con dos puntos; los bloques salen en el orden del catálogo (no en el que llegaron) y sólo si tienen
 * algo; y entre un operario y el siguiente va una línea en blanco. Un mensaje que se desviara en cualquiera de
 * esas marcas sería el mismo mensaje en dos versiones, que es lo que el grupo terminaría notando.
 *
 * El operario es `username`, no el nombre visible: es la identidad con la que la planta firmó el movimiento y la
 * que la web escribe.
 */
fun salidaDaySummaryText(
    date: String,
    movements: List<SalidaCreateResponseMovement>,
    abbreviations: WhatsappAbbreviations = WhatsappAbbreviations.EMPTY,
    labels: SalidaSummaryLabels = SalidaSummaryLabels(),
): String {
    if (movements.isEmpty()) return ""

    val lines = mutableListOf<String>()
    lines.add("🚛 *${labels.title} — ${brazilianDate(date)}*")
    lines.add("${labels.movements}: ${movements.size}")
    lines.add("")

    movements.forEachIndexed { index, movement ->
        if (index > 0) lines.add("")
        lines.add("👤 ${movement.username.uppercase()}:")
        for (block in SalidaCatalog.blocks) {
            val items = movement.items.filter { it.block.value == block }
            if (items.isEmpty()) continue
            lines.add("*${salidaBlockEmojis[block]} ${labels.blocks[block]}*")
            for (item in items) {
                val name = abbreviations.shortName(item.productCode, item.productName)
                lines.add("- $name: ${item.quantity} un")
            }
        }
    }

    return lines.joinToString("\n").trimEnd()
}

/**
 * El bloque de compartir del día: teléfono, prévia del mensaje y la acción de WhatsApp.
 *
 * Sin botón de copiar: la hoja nativa ya lleva el texto. Con el día vacío el bloque queda con su prévia vacía y
 * la acción deshabilitada, que es como el histórico dice que ese día no tiene nada que mandar.
 */
@Composable
fun SalidaWhatsAppShare(
    text: String,
    phone: String,
    onPhoneChange: (String) -> Unit,
    walletLink: String?,
    onOpenWhatsApp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth().testTag("salida-whatsapp-share-card"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.salida_share_title),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            )
            OutlinedTextField(
                value = phone,
                onValueChange = { onPhoneChange(com.trindade.app.ui.filterPhoneDigits(it)) },
                visualTransformation = com.trindade.app.ui.BrazilianPhoneVisualTransformation(),
                label = { Text("WhatsApp") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                    Text(stringResource(R.string.salida_share_preview), style = MaterialTheme.typography.labelMedium)
                    Text(
                        text = text.ifBlank { stringResource(R.string.salida_none_this_day) },
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.testTag("salida-preview-message"),
                    )
                }
            }
            Button(
                onClick = onOpenWhatsApp,
                enabled = text.isNotBlank() && walletLink != null,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag("salida-share-day"),
            ) {
                Text("WhatsApp", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
            }
        }
    }
}
