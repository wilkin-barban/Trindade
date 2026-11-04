package com.trindade.app.loading

import android.app.DatePickerDialog
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trindade.app.R
import com.trindade.app.contract.models.ScheduleHistoryResponseItemsInner
import com.trindade.app.ui.components.ActionResultDialog
import com.trindade.app.ui.components.AdminDestructiveConfirmButton
import com.trindade.app.ui.components.AdminPrimaryButton
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
import com.trindade.app.ui.resolve
import com.trindade.app.ui.saoPauloLocalDate
import java.time.LocalDate
import java.util.Locale

/**
 * The loading history: one page of batches, filtered by a day or a month.
 *
 * Stateless like the other screens, with one exception: whether the month dialog is open is screen
 * state by nature -- nothing above it acts on that, and the choice it produces is handed straight to
 * the view model as an ISO string.
 *
 * The day filter is the platform's own `DatePickerDialog`, and the month filter is a list of the last
 * twelve months rather than the same picker. That distinction is deliberate: the platform picker
 * answers a day, so using it to choose a month would mean asking for a value and then ignoring it, and
 * a control whose answer has no effect is a control that lies about what it does.
 *
 * One row is one batch -- a day, not an entry. Both dates it carries are the server's and this screen
 * recomputes neither: `batch_date` is the day the entries were created under, and `loading_date` is the
 * day the load happens, which the server answers as the batch date plus one day except on a Friday,
 * where it answers the batch date itself. The row says which is which rather than showing one of them
 * and letting the operator guess, because the two differ on six days out of seven.
 */@Composable
fun LoadingHistoryScreen(
    state: LoadingHistoryViewModel.UiState,
    onBack: () -> Unit,
    onOpenBatch: (ScheduleHistoryResponseItemsInner) -> Unit,
    onDateSelected: (String) -> Unit,
    onMonthSelected: (String) -> Unit,
    onClearFilters: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onRetry: () -> Unit,
    onDeactivate: (String) -> Unit,
    onActivate: (String) -> Unit = {},
    onDelete: (String) -> Unit,
    onDismissResult: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var pickingMonth by remember { mutableStateOf(false) }

    /**
     * The batch a delete is waiting to be confirmed for, as its date, or null when nothing is.
     *
     * The delete is irreversible on the server, and it takes a whole day's entries rather than one row
     * -- which is the larger of the two mistakes this screen can make with a tap. The button sits next
     * to the deactivate one in a card an operator taps with gloves on, so the confirmation is the
     * difference between a mis-tap and a lost day, and it is deliberately the only action here that
     * asks twice.
     */
    var confirmingDelete by remember { mutableStateOf<String?>(null) }

    /**
     * The batch a reactivation is waiting to be confirmed for, as its date, or null when nothing is.
     *
     * Reactivating is the reverse of deactivating and lands in front of every tablet that opens the day, so
     * the tap asks before it acts -- the same reason the delete does, for an effect that is visible to the
     * whole shift rather than destructive.
     */
    var confirmingActivate by remember { mutableStateOf<String?>(null) }

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HistoryHeader(
                title = stringResource(R.string.loading_history_title),
                // The active filter in words. A day reads as the operators write dates and a month
                // by name, because `2026-09` is the wire's spelling and not a label.
                subtitle = when {
                    state.date != null -> stringResource(R.string.loading_history_filtered, displayDate(state.date))
                    state.month != null -> stringResource(R.string.loading_history_filtered, displayMonth(state.month))
                    else -> stringResource(R.string.loading_history_all)
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
        // as a fact about the history, and "no batches for this period" is a different sentence from
        // "the server did not answer".
        if (state.loaded && state.items.isEmpty()) {
            item { HistoryEmptyState(message = stringResource(R.string.loading_history_empty)) }
        }

        // Keyed by the batch date, which is the key this endpoint groups by and therefore unique in the
        // list; there is no id in this answer to key on.
        items(state.items, key = { it.batchDate }) { batch ->
            BatchCard(
                batch = batch,
                busy = state.busy,
                onOpen = { onOpenBatch(batch) },
                onDeactivate = { onDeactivate(batch.batchDate) },
                onActivate = { confirmingActivate = batch.batchDate },
                onDelete = { confirmingDelete = batch.batchDate },
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

    confirmingActivate?.let { batchDate ->
        AlertDialog(
            onDismissRequest = { confirmingActivate = null },
            title = { Text(stringResource(R.string.loading_history_activate_confirm_title, displayDate(batchDate))) },
            text = { Text(stringResource(R.string.loading_history_activate_confirm_body)) },
            confirmButton = {
                AdminPrimaryButton(
                    onClick = {
                        confirmingActivate = null
                        onActivate(batchDate)
                    },
                    text = stringResource(R.string.history_activate),
                )
            },
            dismissButton = {
                AdminSecondaryButton(onClick = { confirmingActivate = null }, text = stringResource(R.string.loading_cancel))
            },
        )
    }

    // The activation's own answer, in the window the rest of the app answers through. Drawn from the
    // state rather than remembered here, so a reload that redraws the card cannot swallow it.
    state.resultMessage?.let { result ->
        ActionResultDialog(
            message = result.resolve(),
            isSuccess = true,
            onDismiss = onDismissResult,
        )
    }

    confirmingDelete?.let { batchDate ->
        AlertDialog(
            onDismissRequest = { confirmingDelete = null },
            title = { Text(stringResource(R.string.loading_history_delete_confirm_title, displayDate(batchDate))) },
            text = { Text(stringResource(R.string.loading_history_delete_confirm_body)) },
            confirmButton = {
                AdminDestructiveConfirmButton(
                    onClick = {
                        // Closed first: the dialog is about the tap that is already being acted on, and
                        // leaving it open over a request in flight would invite a second one.
                        confirmingDelete = null
                        onDelete(batchDate)
                    },
                    text = stringResource(R.string.history_delete),
                )
            },
            dismissButton = {
                AdminSecondaryButton(onClick = { confirmingDelete = null }, text = stringResource(R.string.loading_cancel))
            },
        )
    }
}

/**
 * One batch in the list: the day the entries belong to, the day they load, how many there are, and
 * what may be done with the whole batch.
 *
 * The block that opens the grid is one tap target and the two lifecycle actions sit in the card's own
 * footer, so a thumb reaches them without covering the batch it changes -- the same shape the launch
 * and report histories use, because an operator reads the three lists the same way.
 */
@Composable
private fun BatchCard(
    batch: ScheduleHistoryResponseItemsInner,
    busy: Boolean,
    onOpen: () -> Unit,
    onDeactivate: () -> Unit,
    onActivate: () -> Unit,
    onDelete: () -> Unit,
) {
    HistoryRecordCard(
        onClick = onOpen,
        enabled = !busy,
        actions = if (offersDeactivate(batch) || offersActivate(batch) || offersDelete(batch)) {
            {
                // Each action is drawn only where the server said it would be accepted, which is the
                // `== true` inside those two predicates rather than a role decided here: this client does
                // not know the caller's role, and the flag is the server's own answer to that question.
                // The batch flag mirrors the administrator-only route, and the refusal keeps a sentence
                // of its own for a server that still overstates it or a role that changed mid-flight.
                if (offersDeactivate(batch)) {
                    HistoryIconAction(
                        iconRes = R.drawable.ic_deactivate,
                        label = stringResource(R.string.history_deactivate),
                        onClick = onDeactivate,
                        enabled = !busy,
                    )
                }
                if (offersActivate(batch)) {
                    HistoryIconAction(
                        iconRes = R.drawable.ic_activate,
                        label = stringResource(R.string.history_activate),
                        onClick = onActivate,
                        enabled = !busy,
                    )
                }
                if (offersDelete(batch)) {
                    HistoryIconAction(
                        iconRes = R.drawable.ic_delete,
                        label = stringResource(R.string.history_delete),
                        onClick = onDelete,
                        enabled = !busy,
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
                HistoryDateLabel(date = displayDate(batch.batchDate))
                Text(
                    text = pluralStringResource(
                        R.plurals.loading_history_loadings,
                        batch.totalLoadings,
                        batch.totalLoadings,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                )
                // Plain negation rather than the report history's `== false`: this contract declares
                // `isActive` required, so there is no absent flag to guard against, and `!x` says what
                // is meant without implying an optionality the server does not have.
                if (!batch.isActive) {
                    Text(
                        text = stringResource(R.string.history_inactive),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Text(
                // The loading date is labelled, because it is not the date above it on six days out of
                // seven and an unlabelled second date would read as a duplicate of the first.
                text = stringResource(R.string.loading_history_loading_date, displayDate(batch.loadingDate)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Drawn only when the server sent a creator. The SPA renders a translation key that reads
            // "Legado sem criador" in this slot, and an absent creator is not a product term: printing
            // one here would be inventing vocabulary the app does not have anywhere else.
            batch.creator?.let { creator ->
                Text(
                    text = creator.displayName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    )
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

/** The screen with its ViewModel attached. */
@Composable
fun LoadingHistoryRoute(
    onBack: () -> Unit,
    onOpenDay: (String) -> Unit,
    viewModel: LoadingHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LoadingHistoryScreen(
        state = state,
        onBack = onBack,
        // The view model picks the date out of the row and hands it back; the route passes it on to
        // whatever owns navigation, which is not this screen.
        onOpenBatch = { batch -> viewModel.openBatch(batch, onOpenDay) },
        onDateSelected = viewModel::onDateSelected,
        onMonthSelected = viewModel::onMonthSelected,
        onClearFilters = viewModel::clearFilters,
        onPrevious = viewModel::previous,
        onNext = viewModel::next,
        onDeactivate = viewModel::deactivateBatch,
        onActivate = viewModel::activateBatch,
        onDelete = viewModel::deleteBatch,
        onDismissResult = viewModel::dismissResult,
        onRetry = { viewModel.retry() },
    )
}
