package com.trindade.app.reports

import android.app.DatePickerDialog
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trindade.app.R
import com.trindade.app.contract.models.ReportsResponseReportsInner
import com.trindade.app.ui.components.AdminDestructiveConfirmButton
import com.trindade.app.ui.components.AdminSecondaryButton
import com.trindade.app.ui.components.HistoryEmptyState
import com.trindade.app.ui.components.HistoryErrorBanner
import com.trindade.app.ui.components.HistoryDateLabel
import com.trindade.app.ui.components.HistoryIconAction
import com.trindade.app.ui.components.HistoryFilterBar
import com.trindade.app.ui.components.HistoryHeader
import com.trindade.app.ui.components.HistoryLoading
import com.trindade.app.ui.components.HistoryPager
import com.trindade.app.ui.components.HistoryRecordCard
import com.trindade.app.ui.components.MonthPickerDialog
import com.trindade.app.ui.displayDate
import com.trindade.app.ui.displayMonth
import com.trindade.app.ui.notesPreview
import com.trindade.app.ui.saoPauloLocalDate
import java.time.LocalDate
import java.util.Locale

/**
 * The report history: one page of reports, filtered by a day or a month.
 *
 * Stateless like the other screens, with one exception: whether the month dialog is open is screen
 * state by nature -- nothing above it acts on that, and the choice it produces is handed straight to
 * the view model as an ISO string.
 *
 * The day filter is the platform's own `DatePickerDialog`, and the month filter is a list of the last
 * twelve months rather than the same picker. That distinction is deliberate: the platform picker
 * answers a day, so using it to choose a month would mean asking for a value and then ignoring it, and
 * a control whose answer has no effect is a control that lies about what it does.
 */@Composable
fun ReportsHistoryScreen(
    state: ReportsHistoryViewModel.UiState,
    onBack: () -> Unit,
    onOpenReport: (Int) -> Unit,
    onDateSelected: (String) -> Unit,
    onMonthSelected: (String) -> Unit,
    onClearFilters: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onRetry: () -> Unit,
    onDeactivate: (Int) -> Unit,
    onDelete: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var pickingMonth by remember { mutableStateOf(false) }

    /**
     * The report a delete is waiting to be confirmed for, or null when nothing is.
     *
     * The delete is irreversible on the server -- the row leaves the history for everyone, not just for
     * this screen -- and the button sits next to the deactivate one in a row an operator taps with gloves
     * on. A confirmation is the difference between a mis-tap and a lost report, and it is deliberately
     * the only action here that asks twice.
     */
    var confirmingDelete by remember { mutableStateOf<Int?>(null) }

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HistoryHeader(
                title = stringResource(R.string.history_title),
                // The active filter in words. A day reads as the operators write dates and a month by name,
                // because `2026-09` is the wire's spelling and not a label.
                subtitle = when {
                    state.date != null -> stringResource(R.string.history_filtered, displayDate(state.date))
                    state.month != null -> stringResource(R.string.history_filtered, displayMonth(state.month))
                    else -> stringResource(R.string.history_all_reports)
                },
                onBack = onBack,
            )
        }

        item {
            // One line for the date the history is filtered by: two chips that name it and the way to
            // drop it. The buttons this used to be took two rows of the tallest control on the screen,
            // which is why the first record started below the fold.
            HistoryFilterBar(
                dayLabel = state.date?.let { displayDate(it) } ?: stringResource(R.string.history_filter_day),
                daySelected = state.date != null,
                onPickDay = { openDayPicker(context, state.date, onDateSelected) },
                monthLabel = state.month?.let { displayMonth(it) } ?: stringResource(R.string.history_filter_month),
                monthSelected = state.month != null,
                onPickMonth = { pickingMonth = true },
                // Offered only when there is a filter to clear: a control that does nothing when tapped
                // is worse than one that is not there, because the operator cannot tell which it is.
                onClear = if (state.date != null || state.month != null) onClearFilters else null,
                clearLabel = stringResource(R.string.history_clear_filters),
            )
        }

        state.message?.let { message ->
            item { HistoryErrorBanner(message = message, onRetry = onRetry) }
        }

        if (state.loading) {
            item { HistoryLoading() }
        }

        // Only when a read answered. An empty list next to an error sentence would state a failed read
        // as a fact about the history, and "no reports for this period" is a different sentence from
        // "the server did not answer".
        if (state.loaded && state.items.isEmpty()) {
            item { HistoryEmptyState(message = stringResource(R.string.history_empty)) }
        }

        items(state.items, key = { it.id }) { report ->
            HistoryRecordCard(
                onClick = { onOpenReport(report.id) },
                enabled = !state.busy,
                actions = if (offersDeactivate(report) || offersDelete(report)) {
                    {
                        // Each action is drawn only where the server said it would be accepted, which is the
                        // `== true` inside those two predicates rather than a role decided here: this client
                        // does not know the caller's role, and the flag is the server's own answer to that.
                        if (offersDeactivate(report)) {
                            HistoryIconAction(
                                iconRes = R.drawable.ic_deactivate,
                                label = stringResource(R.string.history_deactivate),
                                onClick = { onDeactivate(report.id) },
                                enabled = !state.busy,
                            )
                        }
                        if (offersDelete(report)) {
                            HistoryIconAction(
                                iconRes = R.drawable.ic_delete,
                                label = stringResource(R.string.history_delete),
                                onClick = { confirmingDelete = report.id },
                                enabled = !state.busy,
                                destructive = true,
                            )
                        }
                    }
                } else {
                    null
                },
                lines = {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
                    ) {
                        HistoryDateLabel(date = displayDate(report.reportDate))
                        Text(text = turnoLabel(report.turno), style = MaterialTheme.typography.bodyMedium)
                        // `== false`, and not `!= true`: the badge is a claim that the report is inactive,
                        // and an absent flag is not a claim about anything. The five lifecycle flags are
                        // optional in the contract, so null is a state this screen has to survive without
                        // inventing a fact.
                        if (report.isActive == false) {
                            Text(
                                text = stringResource(R.string.history_inactive),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }

                    val notes = notesPreview(report.notes)
                    Text(
                        text = if (notes == null) {
                            report.user.displayName
                        } else {
                            "${report.user.displayName} — $notes"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                },
            )
        }

        // The footer is a claim about a page that exists, so it waits for a read to answer. On a failed
        // first read there is no page: the counts are the state's defaults, and "Página 1 de 1
        // (0 registros)" printed under an unreachable message would be the same mistake the sentence
        // above goes out of its way to avoid, one line further down.
        if (state.loaded) {
            item {
                HistoryPager(
                    page = state.page,
                    totalPages = state.totalPages,
                    total = state.total,
                    canGoPrevious = state.canGoPrevious,
                    canGoNext = state.canGoNext,
                    loading = state.loading,
                    onPrevious = onPrevious,
                    onNext = onNext,
                )
            }
        }
    }

    if (pickingMonth) {
        MonthPickerDialog(
            onDismiss = { pickingMonth = false },
            onPick = {
                pickingMonth = false
                onMonthSelected(it)
            },
        )
    }

    confirmingDelete?.let { reportId ->
        AlertDialog(
            onDismissRequest = { confirmingDelete = null },
            title = { Text(stringResource(R.string.history_delete_confirm_title)) },
            text = { Text(stringResource(R.string.history_delete_confirm_body)) },
            confirmButton = {
                AdminDestructiveConfirmButton(
                    onClick = {
                        // Closed first: the dialog is about the tap that is already being acted on, and
                        // leaving it open over a request in flight would invite a second one.
                        confirmingDelete = null
                        onDelete(reportId)
                    },
                    text = stringResource(R.string.history_delete),
                )
            },
            dismissButton = {
                AdminSecondaryButton(
                    onClick = { confirmingDelete = null },
                    text = stringResource(R.string.loading_cancel),
                )
            },
        )
    }
}

/**
 * Opens the platform's day picker, which is the OS control for a date and brings the platform's own
 * layout, locale and accessibility with it. See the screen's own note for why the month filter does not
 * use it.
 *
 * It opens on the day already chosen, so re-picking is a correction rather than a restart, and on today
 * when there is none.
 */
private fun openDayPicker(context: Context, selected: String?, onPick: (String) -> Unit) {
    val initial = selected?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: saoPauloLocalDate()

    DatePickerDialog(
        context,
        { _, year, month, day -> onPick(isoDay(year, month + 1, day)) },
        initial.year,
        // The dialog counts months from zero and the server's ISO string counts from one.
        initial.monthValue - 1,
        initial.dayOfMonth,
    ).show()
}

/**
 * The ISO `YYYY-MM-DD` the server validates, assembled rather than formatted through the device's
 * locale: an Arabic-locale phone would otherwise hand the picker's digits out in a numeral system the
 * server's `^\d{4}-\d{2}-\d{2}$` refuses with a 400.
 */
private fun isoDay(year: Int, month: Int, day: Int): String =
    String.format(Locale.ROOT, "%04d-%02d-%02d", year, month, day)

/** The shift as a word, from the generated enum: a third shift would fail to compile here instead. */
@Composable
private fun turnoLabel(turno: ReportsResponseReportsInner.Turno): String = when (turno) {
    // No emoji: the SPA decorates the same word with a sunrise and a moon, and that is the web page's
    // decoration rather than something this list has to carry.
    ReportsResponseReportsInner.Turno.tarde -> stringResource(R.string.history_turno_tarde)
    ReportsResponseReportsInner.Turno.noite -> stringResource(R.string.history_turno_noite)
}

/** The screen with its ViewModel attached. */
@Composable
fun ReportsHistoryRoute(
    onBack: () -> Unit,
    onOpenReport: (Int) -> Unit,
    viewModel: ReportsHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    ReportsHistoryScreen(
        state = state,
        onBack = onBack,
        onOpenReport = onOpenReport,
        onDateSelected = viewModel::onDateSelected,
        onMonthSelected = viewModel::onMonthSelected,
        onClearFilters = viewModel::clearFilters,
        onPrevious = viewModel::previous,
        onNext = viewModel::next,
        onDeactivate = viewModel::deactivate,
        onDelete = viewModel::delete,
        onRetry = { viewModel.load() },
    )
}
