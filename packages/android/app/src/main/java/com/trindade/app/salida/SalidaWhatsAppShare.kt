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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.massas.WhatsappAbbreviations
import com.trindade.app.massas.brazilianDate

/**
 * El resumen del día tal como se manda por WhatsApp.
 *
 * Es el día, no una salida: la planta comparte lo que salió junto, por operario y por bloque, con la tabla de
 * abreviaturas que comparten el Relatório y los demás históricos. Sin códigos de producto y sin la etiqueta del
 * ERP: lo que el grupo lee es qué salió y cuánto.
 */
fun salidaDaySummaryText(
    date: String,
    movements: List<SalidaCreateResponseMovement>,
    abbreviations: WhatsappAbbreviations = WhatsappAbbreviations.EMPTY,
): String {
    if (movements.isEmpty()) return ""

    val lines = mutableListOf<String>()
    lines.add("🚛 *Salidas del día — ${brazilianDate(date)}*")
    lines.add("Movimientos: ${movements.size}")

    for (movement in movements) {
        val operator = (movement.displayName.takeIf { it.isNotBlank() }
            ?: movement.username.takeIf { it.isNotBlank() }
            ?: "Operador").uppercase()
        lines.add("")
        lines.add("👤 *$operator*")

        val byBlock = movement.items.groupBy { it.block.value }
        for ((block, items) in byBlock) {
            lines.add("*${blockLabel(block)}*")
            for (item in items) {
                val name = abbreviations.shortName(item.productCode, item.productName)
                lines.add("• $name — ${item.quantity} un")
            }
        }
    }

    return lines.joinToString("\n")
}

private fun blockLabel(block: String): String = when (block) {
    SalidaCatalog.BLOCK_EMBALAGENS -> "📦 Embalajes"
    SalidaCatalog.BLOCK_BOBINAS -> "🧵 Bobinas"
    else -> "🧪 Matéria-Prima"
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
                text = "Compartilhar por WhatsApp",
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
                    Text("Pré-visualização", style = MaterialTheme.typography.labelMedium)
                    Text(
                        text = text.ifBlank { "Nenhuma saída registrada neste dia." },
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
