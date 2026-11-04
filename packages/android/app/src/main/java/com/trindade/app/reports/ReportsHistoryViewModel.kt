package com.trindade.app.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.contract.models.ReportsResponseReportsInner
import com.trindade.app.ui.UiText
import com.trindade.app.network.HistoryRead
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The report history: one page at a time, filtered by a day, a month, or nothing.
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
 */
@HiltViewModel
class ReportsHistoryViewModel @Inject constructor(
    private val repository: ReportsRepository,
) : ViewModel() {

    data class UiState(
        val loading: Boolean = true,
        val items: List<ReportsResponseReportsInner> = emptyList(),
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
        /** What an activation answered, drawn in a window the operator dismisses. See [activate]. */
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
     * answering with the wrong rows. The fake answers immediately, so no test saw it; a device on a slow
     * network is where it would have been seen first.
     */
    private var newestLoad = 0

    /** The lifecycle call still owed, when the retry should repeat a write rather than a read. */
    private var pendingWrite: (suspend () -> ReportLifecycleResult)? = null

    /** The sentence the owed write would print on success, kept beside it so a retry can still say it. */
    private var pendingSuccess: UiText? = null

    /** Whether the last lifecycle call landed and only its reload failed. See the loading history. */
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
     * Repeats what failed, and only that. See the loading history for the full reasoning: a write that
     * landed and whose reload failed is repeated as a read, because repeating it as a write would
     * deactivate a report a second time.
     */
    fun retry() {
        val write = pendingWrite
        when {
            lastWriteApplied -> load()
            write != null -> runLifecycle(pendingSuccess, write)
            else -> load()
        }
    }

    /** Reads one page under a token the caller already claimed; see the loading history for why. */
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

        // Three answers, three sentences. A refusal is the server talking -- an expired session, a
        // caller this route does not accept, a server that could not finish -- and answering it with
        // "check the network" sends the operator to fix something that works. Only a read that got no
        // answer at all is a connection problem.
        if (history is HistoryRead.Refused) {
            _state.update { it.copy(loading = false, message = refusalMessage(history.statusCode)) }
            return false
        }
        if (history is HistoryRead.Unreachable) {
            // No answer is not "there are no reports". An empty list drawn over a failed read would
            // report a network fault as a fact about the history.
            _state.update { it.copy(loading = false, message = UNREACHABLE) }
            return false
        }
        val loaded = (history as HistoryRead.Loaded).value

        // A page past the end answers an empty list with a well-formed pagination instead of an
        // error, and above the first page that means the page just lost its last row -- which is
        // what a deletion does. Stepping back one page is what keeps the operator off a blank
        // screen still labelled "Página 2 de 2"; one page at a time is enough, because that is as
        // far as the single deletion that caused it could have moved the end.
        if (loaded.items.isEmpty() && page > FIRST_PAGE) {
            return readPage(filters, page - 1, load)
        }

        _state.update {
            it.copy(
                loading = false,
                items = loaded.items,
                page = loaded.pagination.page,
                totalPages = loaded.pagination.totalPages,
                total = loaded.pagination.total,
                loaded = true,
            )
        }
        return true
    }

    /** Deactivates a report, keeping it in the history. See [lifecycle] for what may be refused. */
    fun deactivate(id: Int) = lifecycle(id, offered = ::offersDeactivate) { repository.deactivate(id) }

    /**
     * Brings a deactivated report back.
     *
     * Offered from the report's own `canActivate`, which the server computes per caller and per report, and
     * reported through the same window every other action answers in: the reload that follows redraws the
     * card as active, and a redraw alone does not tell the operator that the tap did something.
     */
    fun activate(id: Int) = lifecycle(
        id,
        offered = ::offersActivate,
        success = UiText.of(com.trindade.app.R.string.history_activated),
    ) { repository.activate(id) }

    /** Closes the window that reported an activation. */
    fun dismissResult() {
        _state.update { it.copy(resultMessage = null) }
    }

    /** Deletes a report. See [lifecycle] for what may be refused. */
    fun delete(id: Int) = lifecycle(id, offered = ::offersDelete) { repository.delete(id) }

    /**
     * Runs one lifecycle call, but only for a row the server offered it for.
     *
     * The offer is the item's own flag, read as `== true` by [offersDeactivate], [offersActivate] and
     * [offersDelete] and
     * never as `!= false`. The contract marks all five lifecycle flags optional even though the server
     * always emits them, so the generated type carries them as `Boolean? = null`, and `!= false` would
     * read an absent flag as permission -- drawing an action whose only possible answer is the 403 the
     * flag was there to report.
     *
     * Nothing else is refused here. Who may deactivate or delete is the server's decision, and the flag
     * is the server's own answer to it, which is why the gate is the flag and not a rule written here:
     * this client has no role of its own to weigh, and a second permission rule would be a second thing
     * to keep in agreement with the server's.
     */
    private fun lifecycle(
        id: Int,
        offered: (ReportsResponseReportsInner) -> Boolean,
        success: UiText? = null,
        call: suspend () -> ReportLifecycleResult,
    ) {
        if (state.value.busy) return
        val item = state.value.items.firstOrNull { it.id == id } ?: return
        if (!offered(item)) return

        runLifecycle(success, call)
    }

    /**
     * Runs one lifecycle call and keeps the screen honest about what it did.
     *
     * Busy is cleared after the reload, not before it, and the action's own sentence lives in
     * `resultMessage`, which the reload does not touch: a reload that fails leaves both facts on screen
     * instead of replacing the first with the second.
     */
    private fun runLifecycle(success: UiText?, call: suspend () -> ReportLifecycleResult) {
        if (state.value.busy) return

        _state.update { it.copy(busy = true, message = null) }
        pendingWrite = call
        pendingSuccess = success
        lastWriteApplied = false

        viewModelScope.launch {
            when (val result = call()) {
                ReportLifecycleResult.Changed -> {
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

                is ReportLifecycleResult.Refused ->
                    _state.update { it.copy(busy = false, message = refusalMessage(result.statusCode, result.code)) }

                ReportLifecycleResult.Unreachable ->
                    _state.update { it.copy(busy = false, message = UNREACHABLE) }
            }
        }
    }

    /**
     * What a refused lifecycle call says, by the reason the server named when it named one. A 5xx is the
     * server answering at all, which is not the same as no answer: telling the operator the connection is
     * down would send them to check a network that is fine.
     */
    private fun refusalMessage(statusCode: Int, code: String? = null): String = when (statusCode) {
        // The session is gone, not the network. The app's own sign-in is the way back.
        401 -> SESSION_EXPIRED
        // Deactivate is administrator-only and delete follows authorship, both decided by the same
        // projection the card drew from. A 403 here is a role that changed mid-flight or a server that
        // has not adopted that projection; naming the role is still the honest thing to say, because
        // the client cannot know the caller's role, only that it was refused here.
        403 -> ADMIN_ONLY
        404 -> GONE
        // A report that moved out from under the operator: the day was closed, or someone else closed it.
        409 -> if (code == HISTORY_FROZEN) FROZEN else GENERIC
        in 500..599 -> SERVER_FAILED
        else -> GENERIC
    }

    companion object {
        const val UNREACHABLE = "Sem conexão com o servidor. Verifique a rede e tente de novo."
        const val GENERIC = "Não foi possível concluir. Tente de novo."
        const val ADMIN_ONLY = "Só um administrador pode fazer isso."
        const val GONE = "Este relatório não existe mais."
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
 * Whether the server offered to deactivate this report.
 *
 * `== true` and never `!= false`: see [ReportsHistoryViewModel.lifecycle] for why an absent flag is
 * not a permission. Named here rather than written at each call site so the screen that draws the
 * action and the view model that guards it cannot disagree about when it is offered.
 */
internal fun offersDeactivate(item: ReportsResponseReportsInner): Boolean = item.canDeactivate == true

/** Whether the server offered to delete this report. See [offersDeactivate]. */
internal fun offersDelete(item: ReportsResponseReportsInner): Boolean = item.canDelete == true

/**
 * Whether the server offered to reactivate this report.
 *
 * False on an active report by construction, because that is what the server answers, so the card of a live
 * report draws no activate action at all. See [offersDeactivate] for why an absent flag is not a permission.
 */
internal fun offersActivate(item: ReportsResponseReportsInner): Boolean = item.canActivate == true
