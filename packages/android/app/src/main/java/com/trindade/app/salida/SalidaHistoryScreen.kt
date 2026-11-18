package com.trindade.app.salida

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trindade.app.contract.models.SalidaCreateResponseMovement

/**
 * El histórico de la baja: lo que este operario lanzó, por día.
 *
 * Muestra lo que hay en Trindade y su estado contra el ERP. No lee el espejo ni ofrece conciliar: ese trabajo es
 * del Relatório, que es donde el día se sincroniza. Cada tarjeta dice el estado en una palabra.
 */
@Composable
fun SalidaHistoryScreen(
    viewModel: SalidaViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Histórico de Salidas", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            TextButton(onClick = onBack, modifier = Modifier.defaultMinSize(minHeight = 44.dp)) {
                Text("Volver")
            }
        }

        Spacer(Modifier.height(12.dp))

        state.notice?.let { notice ->
            Text(
                notice.message,
                style = MaterialTheme.typography.bodySmall,
                color = if (notice.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

        if (state.history.isEmpty()) {
            Text(
                "Nenhuma saída registrada.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 24.dp),
            )
            return@Column
        }

        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            state.history.forEach { movement ->
                SalidaMovementCard(movement)
            }
        }
    }
}

private fun statusLabel(status: com.trindade.app.contract.models.SalidaMovementErp.Status?): String = when (status?.value?.lowercase()) {
    "sent" -> "Enviado"
    "reconciled" -> "Conciliado"
    "partial" -> "Parcial"
    "failed" -> "Pendente"
    else -> "Pendente"
}

@Composable
private fun SalidaMovementCard(movement: SalidaCreateResponseMovement) {
    Card(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(movement.movementDate, fontWeight = FontWeight.SemiBold)
                    Text(
                        movement.username,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Text(
                    statusLabel(movement.erp?.status),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(Modifier.height(6.dp))
            movement.items.forEach { item ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(item.productName, style = MaterialTheme.typography.bodySmall)
                    Text("${item.quantity} un", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Total", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                Text("${movement.totalUnits} un", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
            }
        }
    }
}
