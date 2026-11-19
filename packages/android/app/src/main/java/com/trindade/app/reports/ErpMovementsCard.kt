package com.trindade.app.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.platform.testTag
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.Spacer
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trindade.app.R
import com.trindade.app.contract.models.MassasReportDayView
import com.trindade.app.contract.models.ReportReceipts
import java.math.BigDecimal

/**
 * Las dos lecturas del ERP en el Relatório, cada una en su tarjeta.
 *
 * Eran dos bloques dentro de una sola tarjeta, separados por una línea: dos listas con dos orígenes -- la
 * producción del día y los insumos recibidos -- presentadas como si fueran una. Ahora son dos tarjetas
 * independientes, con la forma de la del bloque de Salidas, y cada una lleva el encabezado de lo que muestra.
 *
 * La sincronización es una sola: el ERP se lee de una vez y llena las dos. Para no esconderla detrás de una de
 * las dos tarjetas, cada encabezado dibuja la misma acción sobre el mismo `onSync` -- una lógica, dos lugares
 * donde apretarla, como la web.
 */
@Composable
fun ErpMovementsCard(
    massasDay: MassasReportDayView?,
    receipts: ReportReceipts?,
    isSyncing: Boolean,
    onSync: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ErpSectionCard(
            title = stringResource(R.string.report_massas_day_title),
            isSyncing = isSyncing,
            onSync = onSync,
            contentTag = "report-massas-block",
        ) {
            MassasDayBody(massasDay)
        }
        ErpSectionCard(
            title = stringResource(R.string.report_receipts_title),
            subtitle = stringResource(R.string.report_receipts_subtitle),
            isSyncing = isSyncing,
            onSync = onSync,
            contentTag = "report-receipts-block",
        ) {
            ReceiptsBody(receipts)
        }
    }
}

/**
 * Una tarjeta del ERP: su título, el subtítulo cuando lo tiene y la acción de sincronizar.
 *
 * El encabezado se parte en dos renglones en un teléfono y se queda en uno en una tablet, decidido por el ancho
 * que la tarjeta recibe -- el mismo criterio que la tarjeta única usaba, con el mismo punto de corte.
 */
@Composable
private fun ErpSectionCard(
    title: String,
    isSyncing: Boolean,
    onSync: () -> Unit,
    contentTag: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    content: @Composable () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val stacked = maxWidth < HEADER_STACK_BREAKPOINT

                val heading: @Composable (Modifier) -> Unit = { headingModifier ->
                    Column(modifier = headingModifier) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        if (subtitle != null) {
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                val action: @Composable (Modifier) -> Unit = { actionModifier ->
                    // Tonal, que es el papel de esta acción: relee lo que la tarjeta muestra y no cambia nada.
                    FilledTonalButton(
                        onClick = onSync,
                        enabled = !isSyncing,
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                        modifier = actionModifier.heightIn(min = 48.dp),
                    ) {
                        if (isSyncing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onSecondaryContainer,
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Text(
                            text = stringResource(R.string.report_erp_sync),
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }

                if (stacked) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        heading(Modifier.fillMaxWidth())
                        action(Modifier.fillMaxWidth())
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        heading(Modifier.weight(1f).padding(end = 8.dp))
                        action(Modifier)
                    }
                }
            }

            HorizontalDivider()

            Column(
                modifier = Modifier.fillMaxWidth().testTag(contentTag),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                content()
            }
        }
    }
}

/** La producción del día tal como la registró el ERP: por operario y con el resumen colectivo. */
@Composable
private fun MassasDayBody(massasDay: MassasReportDayView?) {
    if (massasDay == null || massasDay.operators.isEmpty()) {
        Text(
            text = stringResource(R.string.report_massas_day_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    Text(
        text = stringResource(R.string.report_massas_day_operators, massasDay.operators.size),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    massasDay.operators.forEach { operator ->
        // Un bloque por operario con sus productos: el tag deja decir a quién pertenece cada línea cuando dos
        // operarios produjeron la misma massa, que es el caso normal de un turno.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .testTag("report-massas-operator-${operator.operatorKey}"),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = operator.displayName,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "${operator.boxes.stripZeros()} cx · ${operator.units.stripZeros()} un",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            operator.products.forEach { product ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = product.name,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = stringResource(R.string.report_receipts_units, product.units.stripZeros()),
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }

    // El cierre del día: lo que el turno produjo por massa, que es el Resumo coletivo de la web. Solo las massas
    // que se produjeron: un cero es ausencia, y una lista de todo el catálogo taparía las que importan.
    val dayProducts = massasDay.products.filter { it.totalUnits > 0 }
    if (dayProducts.isNotEmpty()) {
        HorizontalDivider()
        Column(
            modifier = Modifier.fillMaxWidth().testTag("report-massas-summary"),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = stringResource(R.string.report_massas_summary),
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.primary,
            )
            dayProducts.forEach { product ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = product.name,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = stringResource(
                            R.string.report_receipts_units,
                            product.totalUnits.toString(),
                        ),
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** Los insumos recibidos: todo lo que no es massa, tercerizados incluidos. */
@Composable
private fun ReceiptsBody(receipts: ReportReceipts?) {
    val receiptList = receipts?.receipts.orEmpty()
    if (receiptList.isEmpty()) {
        Text(
            text = stringResource(R.string.report_receipts_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    receiptList.forEach { receipt ->
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = receipt.productDesc.ifBlank { receipt.productCode },
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (receipt.operatorName.isNotBlank()) {
                    Text(
                        text = receipt.operatorName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Text(
                text = stringResource(R.string.report_receipts_units, receipt.quantity.stripZeros()),
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun BigDecimal.stripZeros(): String = stripTrailingZeros().toPlainString()

/**
 * Where the header stops being one row.
 *
 * 420dp is above the content width of every phone this app runs on (360dp and 375dp are the two the crew
 * carries) and below the width a tablet's card gets, so the two shapes are decided by the room the card has
 * rather than by which model is holding it. A tablet in split view can fall below it, which is the same
 * answer for the same reason.
 */
private val HEADER_STACK_BREAKPOINT = 420.dp
