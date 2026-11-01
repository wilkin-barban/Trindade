package com.trindade.app.massas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trindade.app.R
import com.trindade.app.ui.components.HelpSection
import com.trindade.app.ui.components.HistoryEmptyState
import com.trindade.app.ui.components.HistoryErrorBanner
import com.trindade.app.ui.components.HistoryDateLabel
import com.trindade.app.ui.components.HistoryHeader
import com.trindade.app.ui.components.HistoryLoading
import com.trindade.app.ui.components.HistoryRecordCard
import com.trindade.app.ui.components.ModuleHelpDialog
import com.trindade.app.ui.resolve

/**
 * The days the plant produced, as the list the other three histories are measured against.
 *
 * Its shape is the app's answer to "what does a history look like here": the header with the way out and the
 * count, one filled card per day, the day's own lines at the left and the way in at the right. That shape used
 * to live only in this file; it lives in `ui/components` now, and this screen draws itself from there so the
 * reference and the copies cannot drift.
 */
@Composable
fun MassasHistoryScreen(
    viewModel: MassasHistoryViewModel,
    onBack: () -> Unit,
    onSelectDate: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsState()

    val helpSections = listOf(
        HelpSection(
            title = "Consulta por Data",
            description = "Toque em qualquer dia da lista para visualizar a discriminação completa de caixas, unidades e operadores.",
        ),
        HelpSection(
            title = "Totais Consolidados",
            description = "Cada cartão exibe a soma de caixas e unidades produzidas na fábrica naquele dia.",
        ),
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // No "Atualizar": this history rereads itself on entry -- and when the chosen day changes -- so a
        // button to force the same read would be a second road to the same place, on a screen that already
        // says it is loading, and one that can fail on its own.
        HistoryHeader(
            title = stringResource(R.string.massas_history_title),
            subtitle = pluralStringResource(R.plurals.massas_history_days_count, state.days.size, state.days.size),
            onBack = onBack,
            onHelp = { viewModel.toggleHelpDialog(true) },
        )

        if (state.errorMessage != null) {
            HistoryErrorBanner(
                message = "⚠ " + (state.errorMessage?.resolve() ?: ""),
                onRetry = { viewModel.loadHistory() },
            )
        }

        when {
            state.isLoading -> HistoryLoading(modifier = Modifier.weight(1f))
            state.days.isEmpty() -> HistoryEmptyState(
                message = "Nenhum histórico de massas encontrado.",
                modifier = Modifier.weight(1f),
            )
            else -> LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.days, key = { it.date }) { day ->
                    HistoryRecordCard(
                        onClick = { onSelectDate(day.date) },
                        action = "Abrir ›",
                        lines = {
                            HistoryDateLabel(
                                date = brazilianDate(day.date),
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            )
                            Text(
                                text = listOf(
                                    pluralStringResource(
                                        R.plurals.massas_history_boxes,
                                        day.totalBoxes,
                                        day.totalBoxes,
                                    ),
                                    pluralStringResource(
                                        R.plurals.massas_history_units,
                                        day.totalUnits,
                                        day.totalUnits,
                                    ),
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text(
                                text = listOf(
                                    pluralStringResource(
                                        R.plurals.massas_history_products,
                                        day.productsCount,
                                        day.productsCount,
                                    ),
                                    pluralStringResource(
                                        R.plurals.massas_history_operators,
                                        day.operatorsCount,
                                        day.operatorsCount,
                                    ),
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                    )
                }
            }
        }
    }

    if (state.showHelpDialog) {
        ModuleHelpDialog(
            title = stringResource(R.string.help_massas_history_title),
            description = stringResource(R.string.help_massas_history_desc),
            sections = helpSections,
            onDismissRequest = { viewModel.toggleHelpDialog(false) },
        )
    }
}
