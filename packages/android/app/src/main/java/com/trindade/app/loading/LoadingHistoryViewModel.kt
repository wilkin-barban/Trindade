package com.trindade.app.loading

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.contract.models.ScheduleHistoryResponseItemsInner
import com.trindade.app.ui.UiText
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The loading history: one page of batches at a time, filtered by a day, a month, or nothing.
 *
 * The filters, the paging, the request token and the step-back are the report history's, deliberately
 * and decision for decision:
 *
 * The two filters are mutually exclusive rather than additive, and choosing one clears the other. The
 * server would accept both in one request and match `date` with the month's first day, so a request
 * carrying the two would quietly answer a narrower question than the two controls on screen appear to
 * ask -- and the month button would be a control that does not do what it says.
 *
 * A filter that is not set is sent as null and never as the empty string. The server validates both
 * against a regex -- `^\d{4}-\d{2}-\d{2}$` for the day and `^\d{4}-\d{2}$` for the month -- so `date=`
 * is a 400 answering a client that meant "no filter". Retrofit omits a null query parameter, which is
 * the request the server reads as "the whole history".
 *
 * The page size is left to the server, which defaults to the 30 the SPA sends explicitly. A constant
 * here would be a second copy of a server rule that nothing on this client depends on, since the
 * pagination comes back in the answer either way.
 *
 * What differs from the report history is what a row *is*. The endpoint groups by `schedule_date`, so
 * one row is one batch -- every entry of one day -- and there is no per-entry truth in this answer at
 * all: the three action flags are the server's own projection for the batch, computed from its
 * earliest creator and the one-hour edit window, while the per-entry answer lives in that day's
 * schedules and is not in this response.
 *
 * Both dates are the server's and neither is recomputed here. `batch_date` is the `schedule_date` the
 * entries were created under and the key this endpoint groups by; `loading_date` is the batch date
 * itself when the batch falls on a Friday and the following day otherwise, which is a `CASE` in the
 * server's SQL. A second implementation of that rule here would be wrong every Friday, which is why
 * the row that opens the grid passes the batch date and never the loading date.
 */
@HiltViewModel
class LoadingHistoryViewModel @Inject constructor(
    private val repository: LoadingRepository,
) : ViewModel() {

    data class UiState(
        val loading: Boolean = true,
        val items: List<ScheduleHistoryResponseItemsInner> = emptyList(),
        val page: Int = FIRST_PAGE,
        val totalPages: Int = 0,
        val total: Int = 0,
        /** The day filter as `YYYY-MM-DD`, or null when the history is not filtered by a day. */
        val date: String? = null,
        /** The month filter as `YYYY-MM`, or null when the history is not filtered by a month. */
        val month: String? = null,
        /** True while a deactivation or a deletion is in flight, which withholds both from every row. */
        val busy: Boolean = false,
        /**
         * True once a page of the history has actually been read from the server.
         *
         * The page count and the footer are claims about a page that exists, and on a failed first read
         * there is no page: the counts are this state's defaults. Left as it was when a later read fails,
         * because the page still on screen is the one that was read.
         */
        val loaded: Boolean = false,
        val message: String? = null,
        /**
         * What an activation answered, drawn in a window the operator dismisses.
         *
         * A success has nowhere else to go on this screen: the error banner is a sentence about something
         * that failed, and the re-read that follows the activation redraws the card as active without
         * saying that anything happened. The window is the same one every other action in the app answers
         * through, so the operator reads "it worked" in the place they already look for it.
         */
        val resultMessage: UiText? = null,
    ) {
        /**
         * The pagination's own bounds, and nothing invented on top of them.
         *
         * The `!loading` half is deliberately not here: a page in flight is a rendering concern, and
         * the screen already has the flag. What this must not do is guess a bound the server did not
         * send -- there is no "page 1 of at least 1" here, only the page and the count it came with.
         */
        val canGoPrevious: Boolean get() = page > FIRST_PAGE

        /**
         * False on an empty history, where the server answers `totalPages` 0 and there is no page to
         * move to. Not clamped to 1 for the same reason as above: the only thing that reads this wants
         * to know whether another page exists, not to draw the count.
         */
        val canGoNext: Boolean get() = page < totalPages
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    /**
     * Identifies the newest page request, so a response to an older one cannot overwrite it.
     *
     * Two requests really can be in the air at once: the paging buttons are withheld during a load but
     * the filter buttons are not, so choosing a month while a page is arriving starts a second request.
     * Without this, whichever answer lands last wins, and the older one landing last would draw the
     * previous filter's page under the new filter's name -- which reads exactly like the server
     * answering with the wrong batches.
     */
    private var newestLoad = 0

    /**
     * The lifecycle call still owed, when the retry button should repeat a write rather than a read.
     *
     * Held as the call itself instead of the batch date and an enum: the route is the thing that has to
     * be repeated exactly, and a second description of it here would be a second place for the two to
     * disagree. Cleared as soon as the server agrees, because a write that landed is not owed again.
     */
    private var pendingWrite: (suspend () -> ScheduleLifecycleResult)? = null

    /** The sentence the owed write would print on success, kept beside it so a retry can still say it. */
    private var pendingSuccess: UiText? = null

    /**
     * Whether the last lifecycle call landed and only its reload failed.
     *
     * This is the whole difference between the two retries: repeating a deactivation that already
     * applied is a second write of the same action, and repeating a read is not.
     */
    private var lastWriteApplied = false

    init {
        load()
    }

    /** Filters by one day, which clears the month, and returns to the first page of the new answer. */
    fun onDateSelected(iso: String) {
        _state.update { it.copy(date = iso, month = null) }
        load(FIRST_PAGE)
    }

    /** Filters by one month, which clears the day, and returns to the first page of the new answer. */
    fun onMonthSelected(iso: String) {
        _state.update { it.copy(month = iso, date = null) }
        load(FIRST_PAGE)
    }

    fun clearFilters() {
        _state.update { it.copy(date = null, month = null) }
        load(FIRST_PAGE)
    }

    fun previous() {
        if (!state.value.canGoPrevious) return
        load(state.value.page - 1)
    }

    fun next() {
        if (!state.value.canGoNext) return
        load(state.value.page + 1)
    }

    /**
     * Loads one page with the filters currently set, the current page by default.
     *
     * The filters are read before the request is launched rather than from inside the coroutine, so the
     * page that arrives is always the page for the filter that was on screen when it was asked for.
     */
    fun load(page: Int = state.value.page) {
        val filters = state.value
        val load = ++newestLoad
        _state.update { it.copy(loading = true, message = null) }
        viewModelScope.launch { readPage(filters, page, load) }
    }

    /**
     * Repeats what failed, and only that.
     *
     * The banner offers one button and the operator has no way to tell the two failures apart, so the
     * view model is the one that remembers: a write that landed and whose reload failed is repeated as a
     * read, because repeating it as a write would deactivate a batch a second time; a write that never
     * landed is repeated as itself. See [pendingWrite] and [lastWriteApplied].
     */
    fun retry() {
        val write = pendingWrite
        when {
            lastWriteApplied -> load()
            write != null -> runLifecycle(pendingSuccess, write)
            else -> load()
        }
    }

    /**
     * Reads one page, under a token the caller already claimed, and answers whether it was the newest.
     *
     * The filters travel in rather than being read here: the answer is the answer to the filter that was
     * on screen when the read was asked for, and a filter chosen while it was in the air belongs to the
     * request that follows, not to this one.
     */
    private suspend fun readPage(filters: UiState, page: Int, load: Int): Boolean {
        val history = repository.history(
            date = filters.date,
            month = filters.month,
            page = page,
            pageSize = null,
        )

        // A superseded answer is dropped whole: not the items, not the page, not the message. Half of
        // it written over a newer answer would be worse than none, because the page and the list would
        // then describe different requests.
        if (load != newestLoad) return false

        if (history == null) {
            // Null is "the server did not answer", not "there are no batches". An empty list drawn
            // over a failed read would report a network fault as a fact about the history.
            _state.update { it.copy(loading = false, message = UNREACHABLE) }
            return false
        }

        // A page past the end answers an empty list with a well-formed pagination instead of an
        // error, and above the first page that means the page just lost its last row -- which is what
        // deleting a batch does. Stepping back one page is what keeps the operator off a blank screen
        // still labelled "Página 2 de 2"; one page at a time is enough, because that is as far as the
        // single deletion that caused it could have moved the end.
        if (history.items.isEmpty() && page > FIRST_PAGE) {
            return readPage(filters, page - 1, load)
        }

        _state.update {
            it.copy(
                loading = false,
                items = history.items,
                page = history.pagination.page,
                totalPages = history.pagination.totalPages,
                total = history.pagination.total,
                loaded = true,
            )
        }
        return true
    }

    /**
     * The row's own action: opens that batch's day in the schedule grid.
     *
     * The date is handed to [open] rather than acted on here, because this view model does not know how
     * to get anywhere -- and the one thing worth pinning in a test is which date it is. The grid reads
     * `/api/loading/schedules?date=`, which filters `schedule_date`, so the **batch** date is the day
     * that grid is about. Handing over `loadingDate` would open the day after the batch on every day
     * except a Friday, where the two coincide -- an empty grid that looks exactly like a day with no
     * entries, and wrong on five days out of seven.
     */
    fun openBatch(batch: ScheduleHistoryResponseItemsInner, open: (String) -> Unit) {
        open(batch.batchDate)
    }

    /** Deactivates a batch, keeping it in the history. See [lifecycle] for what may be refused. */
    fun deactivateBatch(batchDate: String) =
        lifecycle(batchDate, offered = ::offersDeactivate) { repository.deactivateBatch(batchDate) }

    /**
     * Brings a deactivated batch back, keeping it in the history.
     *
     * The offer is the item's own `canActivate`, decided by the server for this caller and this day, and
     * nothing else: reactivating a batch touches what every tablet draws, so it is not a decision this
     * screen can take on its own.
     */
    fun activateBatch(batchDate: String) = lifecycle(
        batchDate,
        offered = ::offersActivate,
        success = UiText.of(com.trindade.app.R.string.loading_history_activated),
    ) { repository.activateBatch(batchDate) }

    /** Closes the window that reported an activation. */
    fun dismissResult() {
        _state.update { it.copy(resultMessage = null) }
    }

    /** Deletes every entry of a batch. See [lifecycle] for what may be refused. */
    fun deleteBatch(batchDate: String) =
        lifecycle(batchDate, offered = ::offersDelete) { repository.deleteBatch(batchDate) }

    /**
     * Runs one lifecycle call, but only for a batch the server offered it for.
     *
     * The offer is the item's own flag, read as `== true` by [offersDeactivate] and [offersDelete] and
     * never as `!= false`. This contract declares the flags required, so today a `!= false` would mean
     * the same thing -- and that is exactly why it is written as `== true`: the day the server marks
     * one optional, as the report history's already are, `!= false` would silently turn an absent flag
     * into permission, and the screen would draw an action whose only possible answer is the 403 the
     * flag was there to report.
     *
     * Nothing else is refused here. Who may deactivate or delete is the server's decision, and the flag
     * is the server's own answer to it, which is why the gate is the flag and not a rule written here:
     * this client has no role of its own to weigh, and a second permission rule would be a second thing
     * to keep in agreement with the server's.
     *
     * The batch is looked up by its date, which is this endpoint's key -- there is no id in the answer.
     */
    private fun lifecycle(
        batchDate: String,
        offered: (ScheduleHistoryResponseItemsInner) -> Boolean,
        success: UiText? = null,
        call: suspend () -> ScheduleLifecycleResult,
    ) {
        if (state.value.busy) return
        val item = state.value.items.firstOrNull { it.batchDate == batchDate } ?: return
        if (!offered(item)) return

        runLifecycle(success, call)
    }

    /**
     * Runs one lifecycle call and keeps the screen honest about what it did.
     *
     * Busy is cleared at the end, after the reload and not before it: a second tap while the page is in
     * the air would otherwise start a second write of an action the server has already applied. The
     * sentence of the action is kept in `resultMessage`, which the reload does not touch, so a reload
     * that fails leaves both facts on screen -- the write landed, and the page could not be re-read --
     * instead of replacing the first with the second.
     */
    private fun runLifecycle(success: UiText?, call: suspend () -> ScheduleLifecycleResult) {
        if (state.value.busy) return

        _state.update { it.copy(busy = true, message = null) }
        pendingWrite = call
        pendingSuccess = success
        lastWriteApplied = false

        viewModelScope.launch {
            when (val result = call()) {
                ScheduleLifecycleResult.Changed -> {
                    // The write is no longer owed: it landed. What the retry owes now is the read.
                    pendingWrite = null
                    lastWriteApplied = true
                    _state.update { it.copy(resultMessage = success) }

                    // The page on screen rather than the first one: the row that changed is on it, and a
                    // jump to page one would move the operator away from where they were reading. If the
                    // change emptied the last page, [readPage] steps back to the page that still has rows.
                    val load = ++newestLoad
                    _state.update { it.copy(loading = true) }
                    readPage(state.value, state.value.page, load)
                    _state.update { it.copy(busy = false, loading = false) }
                }

                is ScheduleLifecycleResult.Refused ->
                    _state.update { it.copy(busy = false, message = refusalMessage(result.statusCode, result.code)) }

                ScheduleLifecycleResult.Unreachable ->
                    _state.update { it.copy(busy = false, message = UNREACHABLE) }
            }
        }
    }

    /**
     * What a refused lifecycle call says, by the reason the server named when it named one.
     *
     * The status is the frame and the code the fact: a 409 on these routes is a day that is closed to
     * writes, and the sentence has to say that rather than "it failed". A 5xx is the server answering at
     * all, which is not the same as no answer: telling the operator the connection is down would send
     * them to check a network that is fine.
     */
    private fun refusalMessage(statusCode: Int, code: String? = null): String = when (statusCode) {
        // The session is gone, not the network. The app's own sign-in is the way back.
        401 -> SESSION_EXPIRED
        // Both routes check for Administrador, and on the batch routes this is the pair where the
        // server's own flag overstates the caller: the history drew a delete action for a Trabalhador
        // because `canDelete` said so, and the route answers 403. Naming the role the server checks is
        // the honest thing to say -- the client cannot know the caller's role, only that it was refused
        // here.
        403 -> ADMIN_ONLY
        404 -> GONE
        // A day that is closed to writes: the massas history's own refusal, which these routes share.
        409 -> if (code == HISTORY_FROZEN) FROZEN else GENERIC
        in 500..599 -> SERVER_FAILED
        else -> GENERIC
    }

    companion object {
        const val UNREACHABLE = "Sem conexão com o servidor. Verifique a rede e tente de novo."
        const val GENERIC = "Não foi possível concluir. Tente de novo."
        const val ADMIN_ONLY = "Só um administrador pode fazer isso."
        const val GONE = "Esse carregamento não existe mais."
        const val SESSION_EXPIRED = "Sua sessão expirou. Entre de novo."
        const val SERVER_FAILED = "O servidor não conseguiu concluir. Tente de novo em instantes."

        /** The server's code for "this day is closed to writes", which a 409 also uses for other facts. */
        const val HISTORY_FROZEN = "LOADING_HISTORY_FROZEN"

        /** The sentence a closed day gets, verbatim from the server's own text for the same refusal. */
        const val FROZEN = "Este dia de carregamento já está fechado. Apenas consulta."
    }
}

/** The first page of the history, which is also what a missing `page` means to the server. */
private const val FIRST_PAGE = 1

/**
 * Whether the server offered to deactivate this batch.
 *
 * `== true` and never `!= false`: see [LoadingHistoryViewModel.lifecycle] for why a flag that is not
 * there is not a permission. Named here rather than written at each call site so the screen that draws
 * the action and the view model that guards it cannot disagree about when it is offered.
 */
internal fun offersDeactivate(item: ScheduleHistoryResponseItemsInner): Boolean = item.canDeactivate == true

/** Whether the server offered to delete this batch. See [offersDeactivate]. */
internal fun offersDelete(item: ScheduleHistoryResponseItemsInner): Boolean = item.canDelete == true

/**
 * Whether the server offered to reactivate this batch.
 *
 * The third of the same three, and the one that is only ever true on a batch that is *not* active: the
 * server answers it from the row's own state and the caller's role, so an active batch draws no action and
 * a Trabalhador sees none either. See [offersDeactivate] for why an absent flag is not a permission.
 */
internal fun offersActivate(item: ScheduleHistoryResponseItemsInner): Boolean = item.canActivate == true
