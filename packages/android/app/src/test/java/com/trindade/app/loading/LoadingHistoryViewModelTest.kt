package com.trindade.app.loading

import com.trindade.app.contract.models.ScheduleHistoryResponse
import com.trindade.app.contract.models.ScheduleHistoryResponseItemsInner
import com.trindade.app.contract.models.ScheduleHistoryResponsePagination
import com.trindade.app.contract.models.SuccessResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

/**
 * The loading history's state and, more importantly, the requests it makes.
 *
 * The assertions are the report history's, adapted to what a row is here: a batch rather than one
 * record, keyed by its date rather than by an id, and opened on the grid day rather than on a detail
 * screen. Most of them are about what the view model asked for rather than about what it shows, because
 * the mistakes worth catching here are invisible in the state: a filter tidied from null into the empty
 * string is a 400 the server answers for a client that meant "no filter", and a reload that asks for the
 * wrong page looks exactly like one that asked for the right one until the operator notices the rows are
 * not the ones they were reading. `FakeLoadingApi.historyQueries` records the sequence for that reason.
 *
 * `Dispatchers.setMain` is required because `viewModelScope` runs on Main, which a JVM test has no
 * implementation of until one is installed.
 */
class LoadingHistoryViewModelTest {

    private lateinit var api: FakeLoadingApi

    @Before
    fun installMainDispatcher() {
        // Unconfined so the coroutines run as they are launched and the assertions need no manual
        // advancing, which keeps the tests about the state rather than about the scheduler.
        Dispatchers.setMain(UnconfinedTestDispatcher())
        api = FakeLoadingApi()
    }

    @After
    fun restoreMainDispatcher() {
        Dispatchers.resetMain()
    }

    private fun viewModel(api: FakeLoadingApi = this.api) = LoadingHistoryViewModel(LoadingRepository(api))

    @Test
    fun `loads the first page with no filter set, and sends null rather than an empty string`() {
        viewModel()

        // Null and not `""`: the server validates both filters against a pattern, so `date=` is a 400
        // answering a client that meant "no filter" -- and Retrofit omits a null parameter, which is
        // the request that asks for the whole history.
        assertEquals(LoadingHistoryQuery(date = null, month = null, page = 1, pageSize = null), api.lastHistoryQuery)
    }

    @Test
    fun `picking a day clears the month and returns to the first page`() {
        val api = FakeLoadingApi(historyItemCount = 61)
        val model = viewModel(api)
        model.next()
        assertEquals(2, api.lastHistoryQuery?.page)

        model.onDateSelected("2026-09-18")

        assertEquals("2026-09-18", model.state.value.date)
        assertNull("the two filters are exclusive, so the month has to go", model.state.value.month)
        // Page one, not the page that was on screen: the filtered history is a different list, and
        // page 2 of it may not exist at all.
        assertEquals(LoadingHistoryQuery(date = "2026-09-18", month = null, page = 1, pageSize = null), api.lastHistoryQuery)
    }

    @Test
    fun `picking a month clears the day and returns to the first page`() {
        val api = FakeLoadingApi(historyItemCount = 61)
        val model = viewModel(api)
        model.onDateSelected("2026-09-18")
        model.next()

        model.onMonthSelected("2026-09")

        assertNull("the two filters are exclusive, so the day has to go", model.state.value.date)
        assertEquals("2026-09", model.state.value.month)
        assertEquals(LoadingHistoryQuery(date = null, month = "2026-09", page = 1, pageSize = null), api.lastHistoryQuery)
    }

    @Test
    fun `clearing the filters asks for no filter again, from the first page`() {
        val api = FakeLoadingApi(historyItemCount = 61)
        val model = viewModel(api)
        model.onMonthSelected("2026-09")
        model.next()

        model.clearFilters()

        assertNull(model.state.value.date)
        assertNull(model.state.value.month)
        assertEquals(LoadingHistoryQuery(date = null, month = null, page = 1, pageSize = null), api.lastHistoryQuery)
    }

    @Test
    fun `pages forward and back within what the server said there is`() {
        val api = FakeLoadingApi(historyItemCount = 61)
        val model = viewModel(api)

        assertEquals(1, model.state.value.page)
        assertEquals(3, model.state.value.totalPages)
        assertEquals(61, model.state.value.total)
        assertEquals(false, model.state.value.canGoPrevious)
        assertEquals(true, model.state.value.canGoNext)

        model.next()
        assertEquals(2, model.state.value.page)
        assertEquals(2, api.lastHistoryQuery?.page)
        assertEquals(true, model.state.value.canGoPrevious)
        assertEquals(true, model.state.value.canGoNext)

        model.previous()
        assertEquals(1, model.state.value.page)
        assertEquals(1, api.lastHistoryQuery?.page)
    }

    @Test
    fun `refuses to page below the first or past the last`() {
        val api = FakeLoadingApi(historyItemCount = 61)
        val model = viewModel(api)

        model.previous()
        assertEquals("page 1 has nothing behind it", 1, api.historyQueries.size)

        repeat(4) { model.next() }
        // Two pages exist above the first, so only two of those four were asked for.
        assertEquals(3, api.historyQueries.size)
        assertEquals(3, model.state.value.page)
        assertEquals(false, model.state.value.canGoNext)
    }

    @Test
    fun `an empty history is a single page with neither direction offered`() {
        val empty = ScheduleHistoryResponse(
            items = emptyList(),
            pagination = ScheduleHistoryResponsePagination(page = 1, pageSize = 30, total = 0, totalPages = 0),
        )

        val model = viewModel(FakeLoadingApi(historyToReturn = empty))

        // The server answers 0 pages when there is nothing, and 0 is not clamped to 1 here: the only
        // thing that reads it wants to know whether another page exists.
        assertEquals(0, model.state.value.totalPages)
        assertEquals(0, model.state.value.total)
        assertEquals(false, model.state.value.canGoPrevious)
        assertEquals(false, model.state.value.canGoNext)
    }

    @Test
    fun `a successful deletion reloads the page on screen rather than the first one`() {
        // Two pages, the second holding ten: deleting one of them leaves the page worth reading.
        val api = FakeLoadingApi(historyItemCount = 40)
        val model = viewModel(api)

        model.next()
        assertEquals(10, model.state.value.items.size)
        val victim = model.state.value.items.first().batchDate

        model.deleteBatch(victim)

        assertEquals(listOf(victim), api.deletedBatchDates)
        assertEquals("the page the operator was reading", 2, api.lastHistoryQuery?.page)
        assertEquals(2, model.state.value.page)
        assertEquals(9, model.state.value.items.size)
        assertEquals(false, model.state.value.busy)
    }

    @Test
    fun `a deletion that empties the last page steps back to the one that still has rows`() {
        // 31 batches: page 2 holds exactly one, so deleting it empties the page behind it.
        val api = FakeLoadingApi(historyItemCount = 31)
        val model = viewModel(api)

        model.next()
        val only = model.state.value.items.single().batchDate

        model.deleteBatch(only)

        // Asserted as the sequence of pages asked for, because the settled state alone cannot show that
        // the now-empty page was noticed at all: the first load, the move to page 2, the reload of page
        // 2 after the deletion, and the step back to page 1. A blank screen still labelled "Página 2 de
        // 2" is what this test exists to prevent.
        assertEquals(listOf(1, 2, 2, 1), api.historyQueries.map { it.page })
        assertEquals(1, model.state.value.page)
        assertEquals(30, model.state.value.items.size)
        assertEquals(false, model.state.value.loading)
    }

    @Test
    fun `walks back page by page when more than one page empties at once`() {
        // The step-back is recursive because a single deletion is not the only way a page empties:
        // another operator can empty two of them while this screen sits on the last one. Sixty-one
        // batches are three pages, so page 3 holds one row and page 2 holds thirty.
        val api = FakeLoadingApi(historyItemCount = 61)
        val model = viewModel(api)
        model.next()
        model.next()
        assertEquals(3, model.state.value.page)
        val last = model.state.value.items.single().batchDate

        // Everything above page one goes away between the read and the reload.
        api.remainingHistoryItems = 0
        model.deleteBatch(last)

        // The sequence is the assertion, and not the settled state: page 1 with an empty list looks
        // identical whether the walk happened or the code simply abandoned page 3, and the difference is
        // the two requests that prove the now-empty pages were noticed on the way down.
        assertEquals(listOf(1, 2, 3, 3, 2, 1), api.historyQueries.map { it.page })
        assertEquals(1, model.state.value.page)
        assertTrue(model.state.value.items.isEmpty())
        assertEquals(false, model.state.value.loading)
    }

    @Test
    fun `a superseded page does not overwrite the newer one`() {
        // Two requests really can be in the air at once: the paging buttons are withheld during a load
        // but the filter buttons are not, so choosing a month while a page is arriving starts a second
        // request. Without the token the older answer landing last draws the previous filter's rows under
        // the new filter's name, which reads exactly like the server answering with the wrong batches.
        //
        // The gate is what makes the race reachable at all: an immediate fake cannot produce it.
        val api = FakeLoadingApi(historyItemCount = 31, gateHistory = true)
        val model = viewModel(api)

        model.onMonthSelected("2026-08")
        assertEquals("one request per load", 2, api.historyGates.size)

        // The newer request answers first, and the superseded one answers after it with rows that are no
        // longer there for anybody.
        api.historyGates[1].complete(Unit)
        assertEquals(31, model.state.value.total)
        assertEquals(30, model.state.value.items.size)

        api.remainingHistoryItems = 0
        api.historyGates[0].complete(Unit)

        // Nothing of the stale answer: not the rows, not the count, not the loading flag.
        assertEquals(31, model.state.value.total)
        assertEquals(30, model.state.value.items.size)
        assertEquals("2026-08", model.state.value.month)
        assertEquals(false, model.state.value.loading)
    }

    @Test
    fun `a read that never answered claims no page`() {
        // The footer and the empty sentence are statements about a history that was read. On a first read
        // that failed there is no page: printing "Página 1 de 1 (0 registros)" under the unreachable
        // sentence would report a network fault as a fact about the batches, which is the mistake the
        // sentence itself exists to avoid.
        val model = viewModel(FakeLoadingApi(historyToReturn = null))

        assertEquals(false, model.state.value.loaded)
        assertEquals(0, model.state.value.total)
        assertTrue(model.state.value.items.isEmpty())
        assertNotEquals(null, model.state.value.message)
    }

    @Test
    fun `a deactivation reloads the page and leaves the batch in the history`() {
        val api = FakeLoadingApi(historyItemCount = 31)
        val model = viewModel(api)
        val batch = model.state.value.items.first().batchDate

        model.deactivateBatch(batch)

        assertEquals(listOf(batch), api.deactivatedBatchDates)
        assertEquals(listOf(1, 1), api.historyQueries.map { it.page })
        // Still a batch: a deactivated one stays in the history, which is the whole difference between
        // deactivating and deleting. The entries are what stops being active, and they are not in this
        // answer at all.
        assertEquals(31, model.state.value.total)
        assertEquals(false, model.state.value.busy)
    }

    @Test
    fun `an activation posts the batch and reports it in its own window`() {
        val row = FakeLoadingApi.historyItem(isActive = false).copy(canActivate = true, canDeactivate = false)
        val api = FakeLoadingApi(historyToReturn = oneRow(row))
        val model = viewModel(api)

        model.activateBatch("2026-09-18")

        assertEquals(listOf("2026-09-18"), api.activatedBatchDates)
        // The page on screen, not the first one: the card that changed is the one being read.
        assertEquals(listOf(1, 1), api.historyQueries.map { it.page })
        assertEquals(false, model.state.value.busy)
        // The re-read redraws the card as active, and a redraw alone does not say that the tap worked:
        // the sentence is the answer, and it is the window every other action in the app answers in.
        assertEquals(
            com.trindade.app.R.string.loading_history_activated,
            model.state.value.resultMessage?.resId,
        )
    }

    @Test
    fun `dismissing the activation answer leaves the history as it is`() {
        val row = FakeLoadingApi.historyItem(isActive = false).copy(canActivate = true, canDeactivate = false)
        val model = viewModel(FakeLoadingApi(historyToReturn = oneRow(row)))
        model.activateBatch("2026-09-18")

        model.dismissResult()

        assertNull(model.state.value.resultMessage)
        assertEquals(1, model.state.value.items.size)
    }

    @Test
    fun `does not offer activate on a batch the server did not offer it for`() {
        // An active batch is the case the server answers `canActivate` false for, and the flag is the
        // whole permission: a client-side "it is inactive, so it can come back" would draw the action on
        // a row this caller may not touch, and the only possible answer would be the 403 the flag was
        // there to report.
        val api = FakeLoadingApi(historyToReturn = oneRow(FakeLoadingApi.historyItem()))
        val model = viewModel(api)

        model.activateBatch("2026-09-18")

        assertTrue("nothing is posted", api.activatedBatchDates.isEmpty())
        assertNull(model.state.value.resultMessage)
    }

    @Test
    fun `a row opens the batch's own day, not the day the load happens on`() {
        // An ordinary pair: the batch is on the 27th and the load the server computed is on the 28th.
        // The grid reads `/api/loading/schedules?date=`, which filters `schedule_date`, so the batch date
        // is the only day that grid can have rows on. Handing over the loading date would open the day
        // after the batch -- an empty grid that looks exactly like a day with no entries -- and it would
        // be wrong on every day except a Friday, where the server answers the two as the same day.
        val row = FakeLoadingApi.historyItem(batchDate = "2026-09-27", loadingDate = "2026-09-28")
        val model = viewModel(FakeLoadingApi(historyToReturn = oneRow(row)))

        var opened: String? = null
        model.openBatch(model.state.value.items.single()) { opened = it }

        assertEquals("2026-09-27", opened)
    }

    @Test
    fun `offers nothing for a batch the server did not offer the actions on`() {
        // The flags are read as `== true` and never as `!= false`. This contract declares them
        // required, so the false case is the whole of what a test can pin here -- and it is the case
        // that matters: a rule written as "not forbidden" would draw an action whose only possible
        // answer is the refusal the flag was there to report.
        val api = FakeLoadingApi(historyToReturn = oneRow(FakeLoadingApi.historyItem().copy(canDeactivate = false, canDelete = false)))
        val model = viewModel(api)

        model.deactivateBatch("2026-09-18")
        model.deleteBatch("2026-09-18")

        assertEquals(emptyList<String>(), api.deactivatedBatchDates)
        assertEquals(emptyList<String>(), api.deletedBatchDates)
        assertEquals(false, model.state.value.busy)
    }

    @Test
    fun `withholds one action without withholding the other`() {
        // A refusal the server would not have given: `canDeactivate` false means an administrator-only
        // route this caller cannot use, and it says nothing about the deletion, which is offered on its
        // own flag.
        val api = FakeLoadingApi(historyToReturn = oneRow(FakeLoadingApi.historyItem().copy(canDeactivate = false, canDelete = true)))
        val model = viewModel(api)

        model.deactivateBatch("2026-09-18")
        model.deleteBatch("2026-09-18")

        assertEquals(emptyList<String>(), api.deactivatedBatchDates)
        assertEquals(listOf("2026-09-18"), api.deletedBatchDates)
    }

    @Test
    fun `says a 403 in its own words, and a 404 is not the same sentence`() {
        // The batch routes require Administrador, and `canDelete` overstates a Trabalhador there: the
        // history drew the action because the flag said so and the server answers 403. That is why this
        // refusal gets a sentence of its own instead of the generic one.
        val forbiddenApi = FakeLoadingApi(deactivateBatchResponse = Response.error(403, EMPTY_BODY))
        val forbidden = viewModel(forbiddenApi)
        forbidden.deactivateBatch("2026-09-18")

        val goneApi = FakeLoadingApi(deleteBatchResponse = Response.error(404, EMPTY_BODY))
        val gone = viewModel(goneApi)
        gone.deleteBatch("2026-09-18")

        val refused = forbidden.state.value.message
        val missing = gone.state.value.message

        assertNotEquals("a refusal and an absence are not the same problem", refused, missing)
        assertTrue("the server checks the role: $refused", refused!!.contains("administrador", ignoreCase = true))
        assertTrue("the batch is not there any more: $missing", missing!!.contains("existe", ignoreCase = true))

        // A refusal is an answer, not a failure: the list on screen is still what the server last said,
        // so neither call reloads it and neither leaves the rows half-disabled.
        assertEquals(1, forbiddenApi.historyQueries.size)
        assertEquals(1, goneApi.historyQueries.size)
        assertEquals(false, forbidden.state.value.busy)
        assertEquals(false, gone.state.value.busy)
        assertEquals(1, forbidden.state.value.items.size)
    }

    @Test
    fun `says the server was not reached rather than showing an empty history`() {
        val model = viewModel(FakeLoadingApi(historyToReturn = null))

        // The list is empty and that is the danger: an empty history drawn without a word about the
        // failed read would report a network fault as a fact about the batches.
        assertEquals(true, model.state.value.items.isEmpty())
        assertEquals(false, model.state.value.loading)
        assertEquals(LoadingHistoryViewModel.UNREACHABLE, model.state.value.message)
    }

    // ---- A refused action says which refusal it was ----

    @Test
    fun `names an expired session instead of a network fault`() {
        // A 401 is the server answering: the session is gone and the way back is the sign-in, which is
        // not what "check the network" tells the operator to do.
        api.deactivateBatchResponse = Response.error(401, EMPTY_BODY)
        val model = viewModel()
        model.deactivateBatch("2026-09-18")

        assertEquals(LoadingHistoryViewModel.SESSION_EXPIRED, model.state.value.message)
        assertNotEquals(LoadingHistoryViewModel.UNREACHABLE, model.state.value.message)
    }

    @Test
    fun `says the server failed rather than the network when it answers a 5xx`() {
        api.deactivateBatchResponse = Response.error(503, EMPTY_BODY)
        val model = viewModel()
        model.deactivateBatch("2026-09-18")

        assertEquals(LoadingHistoryViewModel.SERVER_FAILED, model.state.value.message)
    }

    @Test
    fun `names a closed day from the code a 409 carries`() {
        // A 409 is also how a duplicate answers, so the status alone cannot say which fact this is. The
        // code can, and the sentence the operator gets is the one for the day being closed.
        api.deactivateBatchResponse = Response.error(
            409,
            """{"error":"Este dia de carregamento já está fechado. Apenas consulta.","code":"LOADING_HISTORY_FROZEN"}"""
                .toResponseBody("application/json".toMediaType()),
        )
        val model = viewModel()
        model.deactivateBatch("2026-09-18")

        assertEquals(LoadingHistoryViewModel.FROZEN, model.state.value.message)
        assertNotEquals(LoadingHistoryViewModel.GENERIC, model.state.value.message)
    }

    // ---- An action is not overwritten by the reload ----

    @Test
    fun `keeps the success message when the reload fails`() {
        // The write landed and only the read that follows it failed. Replacing the success with the
        // network's sentence would report the write as lost when it was not, and the operator would
        // deactivate the batch again.
        // The row has to be an inactive batch the server offers activation for, or the action is cut
        // before it is sent and there is no sentence to keep.
        val api = FakeLoadingApi(historyToReturn = oneRow(ACTIVATABLE_ROW))
        // The first read is the one the screen loads with and has to answer; the second is the reload
        // that follows the action, and it is the one that fails.
        api.historyFailsFromRead = 2
        val model = viewModel(api)
        model.activateBatch("2026-09-18")

        assertTrue("the action's own sentence survives the failed reload", model.state.value.resultMessage != null)
        assertEquals(LoadingHistoryViewModel.UNREACHABLE, model.state.value.message)
    }

    @Test
    fun `keeps busy until the reload ends`() {
        // The reload is what redraws the row, so an operator still able to tap would be able to send the
        // same action twice while the first one is only half visible.
        api.gateHistoryFromRead = 2
        val model = viewModel()
        assertFalse("the constructor's own read is not gated", model.state.value.busy)

        model.deactivateBatch("2026-09-18")

        assertTrue("busy lasts through the reload", model.state.value.busy)
        assertEquals(1, api.deactivatedBatchDates.size)

        api.historyGates.last().complete(Unit)
    }

    @Test
    fun `does not repeat an applied write on retry`() {
        // The write landed; the retry is the read that failed, not a second deactivation.
        // The first read is the one the screen loads with and has to answer; the second is the reload
        // that follows the action, and it is the one that fails.
        api.historyFailsFromRead = 2
        val model = viewModel()
        model.deactivateBatch("2026-09-18")
        assertEquals(1, api.deactivatedBatchDates.size)

        val readsBefore = api.historyReads
        model.retry()

        assertEquals("the applied write is not sent again", 1, api.deactivatedBatchDates.size)
        assertTrue("the retry re-read the page", api.historyReads > readsBefore)
    }

    @Test
    fun `repeats a refused write on retry`() {
        // Nothing landed, so the retry is the action itself: a retry that only re-read would leave the
        // operator with a page that never changes.
        api.deactivateBatchResponse = Response.error(503, EMPTY_BODY)
        val model = viewModel()
        model.deactivateBatch("2026-09-18")
        assertEquals(1, api.deactivatedBatchDates.size)

        api.deactivateBatchResponse =
            Response.success(SuccessResponse(success = SuccessResponse.Success.entries.first()))
        model.retry()

        assertEquals("the refused write is sent again", 2, api.deactivatedBatchDates.size)
    }

    /** An inactive batch the server offers activation for, the only row an activation is sent from. */
    private val ACTIVATABLE_ROW: ScheduleHistoryResponseItemsInner
        get() = FakeLoadingApi.historyItem(isActive = false).copy(canDeactivate = false, canActivate = true)

    /** One batch, so a test can make a single row's flags the point of the test. */
    private fun oneRow(row: ScheduleHistoryResponseItemsInner) = ScheduleHistoryResponse(
        items = listOf(row),
        pagination = ScheduleHistoryResponsePagination(page = 1, pageSize = 30, total = 1, totalPages = 1),
    )
}

private val EMPTY_BODY: okhttp3.ResponseBody = "{}".toResponseBody("application/json".toMediaType())
