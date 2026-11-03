package com.trindade.app.loading

import com.trindade.app.contract.models.CreateDriverRequest
import com.trindade.app.contract.models.CreateScheduleRequest
import com.trindade.app.contract.models.DriversResponseDriversInner
import com.trindade.app.contract.models.ErrorEnvelope
import com.trindade.app.contract.models.ScheduleHistoryResponse
import com.trindade.app.contract.models.SchedulesResponseSchedulesInner
import com.trindade.app.contract.models.UpdateScheduleRequest
import com.trindade.app.contract.models.VehiclesResponseVehiclesInner
import com.trindade.app.network.HistoryRead
import com.trindade.app.network.LoadingApi
import com.trindade.app.network.readHistory
import com.trindade.app.network.runCatchingCancellable
import kotlinx.serialization.json.Json
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The loading schedule data layer.
 *
 * Reads answer null and writes answer a result, the same split as the reports layer and for the same
 * reason: a refusal on a write is a business answer the screen has to explain, while an absent read is
 * something the screen can retry or report.
 *
 * Nothing here enforces the three-fletero limit. That limit is informative by an explicit business
 * decision -- the server accepts a fourth assignment and the counter is a display -- so a client that
 * refused it would be inventing a rule the product deliberately does not have. The counter belongs in
 * the screen, as an indication.
 */
@Singleton
class LoadingRepository @Inject constructor(
    private val api: LoadingApi,
) {

    /**
     * One day of the grid: its rows and whether the day itself is still active.
     *
     * The envelope is kept rather than unwrapped into a list because `dayActive` is half the answer. A
     * deactivated day read without it is indistinguishable from a day nobody scheduled anything on, and
     * the two need different screens: one is read-only with a way back, the other invites a first entry.
     *
     * The rows are asked for with `includeInactive=1` always. The grid is the whole day by definition --
     * a deactivated entry is still part of what happened -- and asking conditionally would mean asking
     * twice for the case this read exists to show.
     */
    suspend fun schedules(date: String): LoadingDay? =
        runCatchingCancellable { api.schedules(date, includeInactive = true) }.getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.let { LoadingDay(rows = it.schedules, active = it.dayActive) }

    /**
     * One page of the loading history, or null when the server cannot be asked.
     *
     * The envelope rather than an unwrapped list like the reads above, because the pagination is half
     * the answer. A list alone leaves the screen unable to tell a full page from the last one, so it
     * cannot know whether to offer another page, and it cannot show a total. `date` and `month` are
     * nullable on purpose and pass through as they arrived: null means the caller asked for no filter
     * and the empty string means the caller asked for the empty value, which the server refuses with
     * a 400. A null `page` or `pageSize` takes the server's default.
     *
     * Each item's `loadingDate` is the server's own computation and is passed on untouched; this
     * layer does not re-derive it from `batchDate`, because the rule belongs to the server and a
     * second implementation here would be a second thing to keep in agreement with the first.
     */
    suspend fun history(
        date: String?,
        month: String?,
        page: Int?,
        pageSize: Int?,
    ): HistoryRead<ScheduleHistoryResponse> =
        readHistory { api.history(date = date, month = month, page = page, pageSize = pageSize) }

    suspend fun timeSlots(): List<String>? =
        runCatchingCancellable { api.timeSlots() }.getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.timeSlots

    suspend fun drivers(): List<DriversResponseDriversInner>? =
        runCatchingCancellable { api.drivers() }.getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.drivers

    suspend fun vehicles(): List<VehiclesResponseVehiclesInner>? =
        runCatchingCancellable { api.vehicles() }.getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.vehicles

    suspend fun createSchedule(body: CreateScheduleRequest): ScheduleWriteResult =
        scheduleWrite { api.createSchedule(body) }

    suspend fun updateSchedule(id: Int, body: UpdateScheduleRequest): ScheduleWriteResult =
        scheduleWrite { api.updateSchedule(id, body) }

    /**
     * Removes one entry. A 403 here means the caller may only delete their own, which the screen must
     * say rather than report as a general failure.
     */
    suspend fun deleteSchedule(id: Int): ScheduleLifecycleResult = lifecycle { api.deleteSchedule(id) }

    /**
     * Deactivates one entry.
     *
     * Answers a SuccessResponse rather than a schedule, so there is nothing to return but whether the
     * server agreed; the screen reloads the date either way and the reload is the real confirmation.
     */
    suspend fun deactivateSchedule(id: Int): Boolean =
        runCatchingCancellable { api.deactivateSchedule(id) }.getOrNull()?.isSuccessful == true

    /**
     * Deactivates every entry of one batch, which is the day the history groups by.
     *
     * The refusal is a business answer here, not a network fault: 403 is the administrator-only route
     * and 404 is a batch that is already gone, and the history screen says each in its own words. The
     * boolean this used to answer could not carry that, which is why the two batch calls and the
     * single-entry delete now share one result type.
     */
    suspend fun deactivateBatch(date: String): ScheduleLifecycleResult = lifecycle { api.deactivateBatch(date) }

    /** Brings a deactivated batch back. See [deactivateBatch] for the refusal split. */
    suspend fun activateBatch(date: String): ScheduleLifecycleResult = lifecycle { api.activateBatch(date) }

    /** Removes every entry of one batch. See [deactivateBatch] for the refusal split. */
    suspend fun deleteBatch(date: String): ScheduleLifecycleResult = lifecycle { api.deleteBatch(date) }

    /**
     * The single reading of the three calls that change a schedule's life.
     *
     * Deactivating answers 200 with a `SuccessResponse` and deleting answers 204 with no body at all,
     * and none of those bodies is read here. They are one answer to the caller's only question -- did
     * the server agree -- and the difference between a flag and an empty body is not a distinction any
     * screen can act on: there is nothing to show and nothing to do differently.
     */
    private suspend fun lifecycle(call: suspend () -> retrofit2.Response<*>): ScheduleLifecycleResult {
        val response = runCatchingCancellable { call() }.getOrNull() ?: return ScheduleLifecycleResult.Unreachable
        return if (response.isSuccessful) {
            ScheduleLifecycleResult.Changed
        } else {
            ScheduleLifecycleResult.Refused(response.code(), refusalCode(response))
        }
    }

    /** The WhatsApp text for one date, or null when the server cannot render it. */
    suspend fun exportText(date: String): String? =
        runCatchingCancellable { api.export(date) }.getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.text

    /** Quick-add, which always makes a `fletero`: company drivers come from the admin surface. */
    suspend fun createDriver(name: String, licensePlate: String?, phone: String? = null): DriversResponseDriversInner? =
        runCatchingCancellable {
            api.createDriver(CreateDriverRequest(name = name, licensePlate = licensePlate, phone = phone))
        }.getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.driver

    private suspend fun scheduleWrite(
        call: suspend () -> retrofit2.Response<com.trindade.app.contract.models.ScheduleResponse>,
    ): ScheduleWriteResult {
        val response = runCatchingCancellable { call() }.getOrNull() ?: return ScheduleWriteResult.Unreachable
        val schedule = response.body()?.schedule
        if (response.isSuccessful && schedule != null) return ScheduleWriteResult.Saved(schedule)
        val envelope = errorEnvelope(response)
        return ScheduleWriteResult.Refused(
            statusCode = response.code(),
            code = envelope?.code,
            // The slot the value already occupies, which is what turns "já existe" into a sentence the
            // operator can act on: the row is named and so is the hour it is already in.
            occupiedSlot = envelope?.existing?.timeSlot,
        )
    }

    /** The envelope a refusal answered with, or null when the body is not one. */
    private fun errorEnvelope(response: Response<*>): ErrorEnvelope? =
        runCatching {
            response.errorBody()?.string()
                ?.takeIf { it.isNotBlank() }
                ?.let { body -> errorJson.decodeFromString<ErrorEnvelope>(body) }
        }.getOrNull()

    /**
     * The machine-readable reason a write was refused, when the server named one.
     *
     * A 409 covers two facts that read the same to the operator and need different sentences: the driver
     * is already in the slot, or the whole day was deactivated and has to be reactivated first. The status
     * code cannot tell them apart and the prose can, but prose is what changes; the code is the contract.
     * Null when the body is not the envelope -- an old server, or a proxy's own error page.
     */
    private fun refusalCode(response: Response<*>): String? =
        runCatching {
            response.errorBody()?.string()
                ?.takeIf { it.isNotBlank() }
                ?.let { body -> errorJson.decodeFromString<ErrorEnvelope>(body).code }
        }.getOrNull()
}

/**
 * One day of the grid: its rows and whether the day itself still has an active entry.
 *
 * A deactivated day keeps its rows -- they are what happened -- so the two facts travel together rather
 * than being asked for separately, where a read that answered one and not the other could draw a full
 * day as an empty one.
 */
data class LoadingDay(
    val rows: List<SchedulesResponseSchedulesInner>,
    val active: Boolean,
)

sealed interface ScheduleWriteResult {
    data class Saved(val schedule: SchedulesResponseSchedulesInner) : ScheduleWriteResult

    /**
     * The server said no, and said as much of why as the envelope carries.
     *
     * `occupiedSlot` is the hour the duplicate already sits in: the 409 names the code and the field, and
     * the slot is what lets a refusal read as "Fletero já está nas 04:00." instead of "already exists".
     */
    data class Refused(
        val statusCode: Int,
        val code: String? = null,
        val occupiedSlot: String? = null,
    ) : ScheduleWriteResult

    data object Unreachable : ScheduleWriteResult
}

/**
 * What a call that changes a schedule's life produced: one entry deleted, or a whole batch
 * deactivated or deleted.
 *
 * One type for all three because they are one question to a caller -- did the server agree, and if
 * not, why -- and `Changed` covers every success because the difference between a 200 carrying a flag
 * and a 204 carrying nothing is not something any screen can act on. The status is carried for the
 * same reason [ScheduleWriteResult] carries it: the two refusals need different words from the
 * operator, and "it failed" would leave both without anything to do.
 *
 * A 403 on the single-entry route means a Trabalhador tried to delete an entry that is not their own;
 * on the batch routes it means the administrator-only check, and `canDelete` overstates a Trabalhador
 * there, so the history draws an action whose answer is this 403. 404 is a batch that is already gone.
 */
sealed interface ScheduleLifecycleResult {
    data object Changed : ScheduleLifecycleResult

    /**
     * The server answered and said no, with the reason it named when it named one.
     *
     * The status code says how the answer was framed -- unauthorized, forbidden, not there, in conflict --
     * and the code says which fact it is when the status covers more than one. A client that read only the
     * status would have to guess between a duplicate and a frozen day, and the two sentences it could
     * print are not interchangeable.
     */
    data class Refused(val statusCode: Int, val code: String? = null) : ScheduleLifecycleResult
    data object Unreachable : ScheduleLifecycleResult
}

/**
 * The envelope's parser, built once.
 *
 * Unknown keys are ignored because the envelope is additive by contract: a server that learns a new field
 * for a refusal must not stop this client from reading the code that was already there.
 */
private val errorJson = Json { ignoreUnknownKeys = true }
