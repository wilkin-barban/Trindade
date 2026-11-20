package com.trindade.app.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.trindade.app.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trindade.app.contract.models.SalidaReportDayView

/**
 * El bloque `SAÍDAS / BAIXA` del Relatório.
 *
 * Lo que salió del día, agrupado por el operario que lo registró: la misma lectura que la web, que une el espejo
 * del ERP con los lanzamientos locales y descarta cualquier nombre que no sea una cuenta de Trindade. Un día sin
 * salidas no es una tarjeta vacía: dice que no hubo, que es distinto de no haber podido leer.
 */
@Composable
fun SalidaReportCard(
    day: SalidaReportDayView?,
    error: String?,
    modifier: Modifier = Modifier,
    /**
     * Si el día vacío se explica acá.
     *
     * La tarjeta lo dice por su cuenta cuando se monta sola; una pantalla que ya tiene su propia tarjeta de estado
     * vacío -- el histórico -- lo apaga, para no contar lo mismo dos veces con una acción al lado.
     */
    showEmptyText: Boolean = true,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("SAÍDAS / BAIXA", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                day?.let {
                    // El total de la tarjeta, no el del mensaje: el texto dejó de llevar "Total" y acá se nombra, sin el
                    // emoji que el grupo leía en el mensaje.
                    Text("Total: ${it.totalUnits} un", style = MaterialTheme.typography.labelLarge)
                }
            }

            when {
                error != null -> Text(
                    "Não foi possível ler as saídas do dia.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )

                day == null -> Text("Lendo as saídas do dia…", style = MaterialTheme.typography.bodySmall)

                day.operators.isEmpty() -> if (showEmptyText) Text(
                    stringResource(R.string.salida_none_this_day),
                    style = MaterialTheme.typography.bodySmall,
                )

                else -> day.operators.forEach { operator ->
                    HorizontalDivider()
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            "👤 ${operator.username}" + if (operator.erpOnly) " (só ERP)" else "",
                            fontWeight = FontWeight.SemiBold,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text("${operator.units} un", style = MaterialTheme.typography.bodySmall)
                    }
                    operator.products.forEach { product ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            // El nombre corto es el del catálogo, que es el que la planta usa en el mensaje.
                            Text("- ${product.name}", style = MaterialTheme.typography.bodySmall)
                            Text("${product.units} un", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
