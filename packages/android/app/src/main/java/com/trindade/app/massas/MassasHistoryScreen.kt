package com.trindade.app.massas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
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
import com.trindade.app.ui.historyQuickDays
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
/**
 * Las fechas que el histórico ofrece debajo de «Hoje»: cinco anteriores, o todas.
 *
 * Hoy tiene su propio chip y no se repite en la lista. Las que el servidor reportó van primero, en su orden; si el
 * archivo tiene menos de cinco -- y un archivo con dos días es un archivo joven, no un error -- las que faltan se
 * completan con el calendario, de la más reciente hacia atrás. El requisito es que el operario tenga siempre cinco
 * fechas a mano: una fecha sin lanzamientos abre su día vacío, que es una respuesta; una fecha que no está no se
 * puede ni pedir.
 *
 * Con «Todas as datas» no se completa: ahí se muestra lo que el archivo tiene, sin inventar días.
 */
fun massasHistoryShownDays(today: String, dates: List<String>, all: Boolean): List<String> =
    historyQuickDays(today, dates, all)

@Composable
fun MassasHistoryScreen(
    viewModel: MassasHistoryViewModel,
    onSelectDate: (String) -> Unit,
    modifier: Modifier = Modifier,
    /** El día de planta: es el que el chip «Hoje» ofrece aunque el servidor todavía no lo haya devuelto. */
    today: String = com.trindade.app.massas.MassasLaunchViewModel.saopauloToday(),
) {
    val state by viewModel.state.collectAsState()
    var showAll by remember { mutableStateOf(false) }

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
            // Sin «Voltar»: esta pantalla se abre desde la fila superior y desde el chip «Todas as datas», y
            // el camino de vuelta es el mismo que el de entrada. Duplicarlo aquí era un segundo botón para lo
            // que la barra ya hace.
            onHelp = { viewModel.toggleHelpDialog(true) },
        )

        if (state.errorMessage != null) {
            HistoryErrorBanner(
                message = "⚠ " + (state.errorMessage?.resolve() ?: ""),
                onRetry = { viewModel.loadHistory() },
            )
        }

        // Hoy primero, después las cinco anteriores: lo demás está detrás de «Todas as datas», que es el mismo
        // listado sin recorte y no una pantalla distinta.
        val shown = massasHistoryShownDays(today, state.days.map { it.date }, showAll)
            .mapNotNull { date -> state.days.firstOrNull { it.date == date } }

        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = false,
                onClick = { onSelectDate(today) },
                label = { Text(MASSAS_HISTORY_TODAY_LABEL) },
                modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag("massas-history-today"),
            )
            shown.forEach { day ->
                FilterChip(
                    selected = false,
                    onClick = { onSelectDate(day.date) },
                    label = { Text(brazilianDate(day.date)) },
                    modifier = Modifier
                        .defaultMinSize(minHeight = 44.dp)
                        .testTag("massas-history-chip-${day.date}"),
                )
            }
            FilterChip(
                selected = showAll,
                onClick = { showAll = !showAll },
                label = { Text(if (showAll) "Últimas datas" else MASSAS_HISTORY_ALL_LABEL) },
                modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag("massas-history-all"),
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
                items(shown, key = { it.date }) { day ->
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
