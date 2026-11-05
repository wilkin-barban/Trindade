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
import androidx.compose.material3.Surface
import androidx.compose.foundation.shape.RoundedCornerShape
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
 * Unified ERP movements card: Massas and Recebimento (S5, S6, S7).
 *
 * Combines both blocks under a single card:
 * 1. Massas do dia: total produced in ERP and breakdown per operator (clean, no local comparison balance bar).
 * 2. Recebimento de Insumos: incoming supplies registered in ERP.
 *
 * A single sync button in the header triggers reading from the ERP via bridge and refreshes both blocks at once.
 */
@Composable
fun ErpMovementsCard(
    massasDay: MassasReportDayView?,
    receipts: ReportReceipts?,
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Header: unified title and the single [ 🔄 Sincronizar com ERP ] action.
            //
            // Side by side the button takes the width it needs and leaves the title with whatever is left,
            // which on a handset is four words to a line -- "Movimentações do ERP (Massas e Recebimento)"
            // became a cramped stack of four lines, and the workspace was the phone's. So the row is a
            // decision, taken from the width this card is actually given rather than from the device: below
            // the breakpoint the title gets the full measure and the action becomes a full-width target
            // underneath it, which is also where a thumb reaches on a handset.
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val stacked = maxWidth < HEADER_STACK_BREAKPOINT

                val title: @Composable () -> Unit = {
                    Text(
                        text = stringResource(R.string.report_erp_movements_title),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }

                val action: @Composable (Modifier) -> Unit = { actionModifier ->
                    // A tonal button, which is the role the card's refresh has: it reloads what the card shows
                    // and changes nothing else, so it is neither the filled primary of a commit nor the outline
                    // of a dismissal. 48dp is the target the rest of the app keeps, and it is written here
                    // rather than left to the theme because a handset is where this is pressed.
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
                        title()
                        action(Modifier.fillMaxWidth())
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Box(modifier = Modifier.weight(1f).padding(end = 8.dp)) { title() }
                        action(Modifier)
                    }
                }
            }

            HorizontalDivider()

            // Two blocks, two lists. Sharing one card is a matter of one sync action, not of one list:
            // the massas block reads `massasDay` and the insumos block reads `receipts`, and neither one
            // renders the other's rows.
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("report-massas-block")
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = stringResource(R.string.report_massas_day_title),
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.primary,
                    )

                    if (massasDay == null || massasDay.operators.isEmpty()) {
                        Text(
                            text = stringResource(R.string.report_massas_day_empty),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.report_massas_day_operators, massasDay.operators.size),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )

                        massasDay.operators.forEach { operator ->
                            // One block per operator, and its own products inside it. The tag is what lets a
                            // reader -- and a test -- say which operator a line belongs to when two of them
                            // produced the same massa, which is the ordinary case on a shift.
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
                                // What the operator produced, product by product, which is what the web draws
                                // under each name: a total alone cannot tell a massa from another, and Relatório
                                // is read to compare them.
                                operator.products.forEach { product ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(start = 12.dp),
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
                                                product.units.stripZeros(),
                                            ),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }

                        // The day's own closing line: what the whole shift produced per massa, which is the
                        // section the web calls Resumo coletivo. Only the massas that were actually produced are
                        // listed -- a zero is absence, and a list of every code in the catalogue would bury the
                        // ones that matter.
                        val dayProducts = massasDay.products.filter { it.totalUnits > 0 }
                        if (dayProducts.isNotEmpty()) {
                            HorizontalDivider()
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("report-massas-summary"),
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
                }
            }

            HorizontalDivider()

            // Block 2: Insumos. The subtitle says what the block holds in words, so the operator does not
            // read a third-party product as production: everything that is not one of the ten massa codes.
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.18f),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("report-receipts-block")
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = stringResource(R.string.report_receipts_title),
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = stringResource(R.string.report_receipts_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    val receiptList = receipts?.receipts.orEmpty()
                    if (receiptList.isEmpty()) {
                        Text(
                            text = stringResource(R.string.report_receipts_empty),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
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
                }
            }
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
