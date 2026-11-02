package com.trindade.app.loading

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.contract.models.CreateScheduleRequest
import com.trindade.app.contract.models.DriversResponseDriversInner
import com.trindade.app.contract.models.SchedulesResponseSchedulesInner
import com.trindade.app.contract.models.VehiclesResponseVehiclesInner
import com.trindade.app.export.NoOpPdfGenerator
import com.trindade.app.export.NoOpShareManager
import com.trindade.app.export.PdfGenerator
import com.trindade.app.export.ShareManager
import com.trindade.app.ui.DayClock
import com.trindade.app.ui.waMeLink
import com.trindade.app.ui.waMeNumber
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class LoadingViewModel @Inject constructor(
    private val repository: LoadingRepository,
    private val pdfGenerator: PdfGenerator,
    private val shareManager: ShareManager,
    /**
     * Today in São Paulo, asked for rather than captured.
     *
     * A grid left open past midnight has to start treating yesterday as closed without being recreated,
     * and a test has to be able to name the day instead of being run on one. See [isClosedDay].
     */
    private val clock: DayClock,
) : ViewModel() {

    internal constructor(
        repository: LoadingRepository,
        today: () -> String = ::saoPauloToday,
    ) : this(repository, NoOpPdfGenerator, NoOpShareManager, DayClock(today))

    data class UiState(
        val date: String = saoPauloToday(),
        /** The day this state's [date] is read against. See [closedDay]. */
        val today: String = date,
        val loading: Boolean = true,
        val schedules: List<SchedulesResponseSchedulesInner> = emptyList(),
        /**
         * Whether the day still has at least one active entry, as the server reported it.
         *
         * True before the first answer, because a day nobody has described yet is not a day that was
         * switched off: opening the grid with the read-only banner on a day that turns out to be open
         * would accuse the operator's day of something it did not do. The answer settles it.
         */
        val dayActive: Boolean = true,
        val timeSlots: List<String> = emptyList(),
        val drivers: List<DriversResponseDriversInner> = emptyList(),
        val vehicles: List<VehiclesResponseVehiclesInner> = emptyList(),
        /** The slot whose driver picker is open, or null when none is. */
        val addingToSlot: String? = null,
        /** Which of the picker's two lists is on screen. Switching tabs keeps what the other one picked. */
        val pickerTab: LoadingPickerTab = LoadingPickerTab.FLETEROS,
        /** The external drivers picked for [addingToSlot], by id. */
        val pickedFleteros: Set<Int> = emptySet(),
        /**
         * The company drivers picked for [addingToSlot], each with the vehicle it drives.
         *
         * A null value is a driver the operator picked and has not given a plate to yet, which is why the
         * values are nullable instead of the map holding only complete picks: the missing plate is drawn on
         * that driver's own row, and dropping the pick would take the row -- and the correction -- away.
         */
        val pickedCasa: Map<Int, Int?> = emptyMap(),
        val busy: Boolean = false,
        val message: String? = null,
        /**
         * The WhatsApp text the server rendered for [date], or null when there is nothing to copy.
         *
         * Null covers both "not asked for yet" and "asked for and the server could not render it", and
         * that is deliberate: the operator sees the same thing either way -- the action, ready to be
         * tried -- while the reason lives in [message] for the second case. A separate flag would exist
         * only to distinguish two states nothing on the screen treats differently.
         */
        val exportText: String? = null,
        val loadingExport: Boolean = false,
        val exportingPdf: Boolean = false,
    ) {
        /**
         * Whether the day is in the past, which is when it stops accepting writes.
         *
         * Read from the calendar rather than from a flag: the server describes its rows one by one, not
         * the day as a whole, and the rule -- a day that has ended is history -- is the one its routes
         * apply when they refuse. A future day is a draft and stays writable, so `date != today` would
         * lock a day the server accepts. See [isClosedDay].
         */
        val closedDay: Boolean get() = isClosedDay(date, today)

        /**
         * True when nothing on this day can be written: no add, no edit, no removal.
         *
         * Two facts, one answer: the day is closed because it is not today, or because the batch that
         * holds it was deactivated. Both are derived rather than stored, because the rows keep their own
         * per-entry `readOnly` flag and the three must agree: a day that is off is off for every row on
         * it, and a second copy of either fact here is a second place for the two to disagree.
         */
        val readOnly: Boolean get() = !dayActive || closedDay

        /**
         * The slots to draw: the configured ones, plus any slot an entry already sits in.
         *
         * The union rather than the configured list alone, because a slot removed from settings after
         * entries were made would otherwise make those entries disappear from the screen while still
         * existing on the server -- the worst of both, since the operator cannot see or remove them.
         */
        val slots: List<String>
            get() = (timeSlots + schedules.map { it.timeSlot }).distinct().sorted()

        fun entriesIn(slot: String): List<SchedulesResponseSchedulesInner> =
            schedules.filter { it.timeSlot == slot }

        /** Driver IDs already assigned to any slot for this date. */
        val assignedDriverIds: Set<Int>
            get() = schedules.mapNotNull { it.driverId }.toSet()

        /** Drivers who have not been assigned to any slot for this date yet. */
        val availableDrivers: List<DriversResponseDriversInner>
            get() = drivers.filter { it.id !in assignedDriverIds }

        /** What the counter shows. A display: see [FleteroQuota] for why it may not refuse anything. */
        fun fleteroCountIn(slot: String): Int = FleteroQuota.countInWindow(schedules, slot)

        fun isExceeded(slot: String): Boolean = FleteroQuota.isExceeded(schedules, slot)

        /**
         * The day's own fleteros whose number is known, each one once, in the order the day draws them.
         *
         * Built from this day rather than from the fleet: a schedule sent to a driver who is not on it is
         * a message about a day that does not concern them. Which driver is a fletero on a given day is
         * the day's own row that says it -- the fleet record is where the number lives, not where the
         * day's use of them is decided -- and a driver whose number nobody has yet has no chat to open, so
         * they are not offered until that field is filled. The number is the one a link can actually use.
         */
        fun fleterosWithPhone(): List<DriversResponseDriversInner> {
            val byId = drivers.associateBy { it.id }
            return schedules
                .filter { it.driverType == SchedulesResponseSchedulesInner.DriverType.fletero }
                .mapNotNull { it.driverId }
                .distinct()
                .mapNotNull { byId[it] }
                .filter { waMeNumber(it.phone.orEmpty()).isNotEmpty() }
        }

        /** The drivers of the day the picker may still offer, split the way its two tabs are. */
        val fleteroCandidates: List<DriversResponseDriversInner>
            get() = availableDrivers.filter { it.driverType == DriversResponseDriversInner.DriverType.fletero }

        val casaCandidates: List<DriversResponseDriversInner>
            get() = availableDrivers.filter { it.driverType == DriversResponseDriversInner.DriverType.casa }

        val pickedCount: Int
            get() = pickedFleteros.size + pickedCasa.size

        /**
         * The company drivers picked without a plate, named so the picker can say which one is missing.
         *
         * A company driver must be paired with a vehicle -- an external one brings their own, and the
         * server rejects a `casa` assignment without one -- so the picker follows the same rule rather than
         * letting the operator discover it as a 400. It names the drivers instead of only counting them
         * because a list of five with one plate missing leaves the operator hunting for the row.
         */
        val pickedCasaWithoutVehicle: List<DriversResponseDriversInner>
            get() = pickedCasa.entries
                .filter { it.value == null }
                .mapNotNull { entry -> drivers.firstOrNull { it.id == entry.key } }

        val canConfirm: Boolean
            get() = !busy && pickedCount > 0 && pickedCasa.values.none { it == null }
    }

    private val _state = MutableStateFlow(UiState(date = clock.today(), today = clock.today()))
    val state: StateFlow<UiState> = _state.asStateFlow()

    /**
     * Identifies the newest load, so an answer to an older one cannot overwrite it.
     *
     * Two loads really can be in the air at once now that a day can be requested: the constructor's
     * own load of today starts before the requested day is applied, and both answer. Without this the
     * earlier answer landing last would draw today's entries under the requested day's name -- the
     * schedule of one day shown under the date of another, which reads exactly like the server
     * answering with the wrong rows. The same token the history screens use, for the same reason.
     */
    private var newestLoad = 0

    init {
        load()
    }

    /**
     * The arrival at the grid: it shows [date], reading the day unless that is the day already on
     * screen -- unless [force] says the copy in hand cannot be trusted.
     *
     * The skip is what keeps an ordinary arrival cheap, and it is not an optimisation for this screen:
     * the loading tab's grid is today, and the constructor has already started a read of today by the
     * time the route's arrival runs, so without it every entry to the tab would ask the server twice
     * for the same day. It is also the whole of the return trip -- this instance is scoped to the
     * activity's store, so coming back from the history after a batch's day leaves that day on screen,
     * and the arrival that means today names a different day and reads it.
     *
     * **What the skip cannot see is a write, and that is why [force] exists.** The editor that moves one
     * row is another view model on another copy of the day, so when the operator saves and the grid is
     * drawn again underneath it, the rows here are the day as it was *before* their own edit: the row
     * they just moved is drawn in the slot they moved it out of, which reads as the edit having done
     * nothing at all -- the operator's own work disappearing from the screen. Nothing on this side can
     * observe that write, because there is nothing here to look at but the day's own rows, so the
     * caller says so instead: the arrival that follows the save asks for the read it would otherwise be
     * answered from memory about, and that arrival is one of the two that force. The other is the one
     * that names a day the operator asked for, which forces for the plainer reason that asking for a
     * day is a request to read it.
     *
     * The shape is `ReportDetailViewModel.load(force)`'s, for the reason that class gives: a view model
     * scoped to the activity's store outlives the composition and survives a trip through the edit
     * surface, so what it is holding can be exactly what that surface has just changed.
     */
    fun onDateChange(date: String, force: Boolean = false): Deferred<Boolean>? {
        if (!force && date == state.value.date) return null

        // A day the operator names empties the grid before its own answer arrives. Rows, slots, drivers
        // and vehicles all belong to the read that named the previous day, and drawing them under the new
        // day's header -- even for the moment a read takes -- shows one day's schedule as if it were
        // another's, which is the failure this screen exists to avoid. The token in `load` is what keeps a
        // late answer to the old day from refilling what this clears.
        //
        // Only a day that actually changes clears: the arrival that follows a write names the day already
        // on screen, and clearing there would blank the grid the operator just edited for no reason.
        if (date != state.value.date) {
            _state.update {
                it.copy(
                    date = date,
                    // Re-read on every named day: a grid that sat open past midnight measures the new day
                    // against the calendar as it is now, not as it was when the screen was built.
                    today = clock.today(),
                    schedules = emptyList(),
                    timeSlots = emptyList(),
                    drivers = emptyList(),
                    vehicles = emptyList(),
                    addingToSlot = null,
                    pickedFleteros = emptySet(),
                    pickedCasa = emptyMap(),
                )
            }
        }
        return load()
    }

    /**
     * Starts one read and answers whether this exact request supplied the schedules now on screen.
     *
     * The deferred belongs to this load token. A failed schedules response answers false, as does a
     * superseded request even if its response was successful; true is returned only after the winning
     * token writes a non-null schedules answer. Callers that do not need completion may ignore it.
     */
    fun load(date: String = state.value.date): Deferred<Boolean> {
        // The export text is dropped on every reload, and that includes the one a successful mutation
        // triggers: the text describes the day's entries, so leaving it on screen after they changed
        // would hand the operator a message about a day that no longer exists. It is one tap away.
        val load = ++newestLoad
        _state.update { it.copy(date = date, loading = true, message = null, exportText = null) }

        return viewModelScope.async {
            val day = repository.schedules(date)
            val slots = repository.timeSlots()
            val drivers = repository.drivers()
            val vehicles = repository.vehicles()

            // A superseded answer is dropped whole: not the entries, not the date, not the message.
            // Half of it written over a newer answer would be worse than none, because the grid would
            // then describe one day under the header of another. Its own completion also answers false,
            // so a caller waiting on this token cannot mistake another request's success for its own.
            if (load != newestLoad) return@async false

            _state.update {
                it.copy(
                    loading = false,
                    schedules = day?.rows.orEmpty(),
                    dayActive = day?.active ?: true,
                    timeSlots = slots.orEmpty(),
                    drivers = drivers.orEmpty(),
                    vehicles = vehicles.orEmpty(),
                    // The schedules, the drivers and the vehicles all decide whether the operator can
                    // work: without the schedule the grid is empty, and without a vehicle a company
                    // driver cannot be added at all. The slot list is the exception the screen already
                    // handles -- a missing one still leaves the day's entries in their own slots -- and
                    // a failure that said nothing left the picker silently empty.
                    message = if (day == null || drivers == null || vehicles == null) UNREACHABLE else null,
                )
            }
            day != null
        }
    }

    fun startAdding(slot: String) {
        // The screen does not draw the action on a closed day, so this is the second lock rather than the
        // only one: a picker opened on a day the server refuses every write from would be a form that can
        // only end in a refusal.
        if (state.value.readOnly) return
        _state.update { it.copy(addingToSlot = slot, pickerTab = LoadingPickerTab.FLETEROS, message = null) }
    }

    fun cancelAdding() = _state.update {
        it.copy(
            addingToSlot = null,
            pickerTab = LoadingPickerTab.FLETEROS,
            pickedFleteros = emptySet(),
            pickedCasa = emptyMap(),
        )
    }

    fun selectPickerTab(tab: LoadingPickerTab) = _state.update { it.copy(pickerTab = tab) }

    /**
     * Picks or drops one external driver.
     *
     * There is no single selected driver any more: a slot carries one, two or several drivers, so the
     * picker keeps a set and the answer to a tap is that set with this driver in it or out of it.
     */
    fun toggleFletero(driverId: Int, picked: Boolean) = _state.update { current ->
        current.copy(
            pickedFleteros = if (picked) current.pickedFleteros + driverId else current.pickedFleteros - driverId,
        )
    }

    /** Picks or drops one company driver; dropping takes the plate that was given to it. */
    fun toggleCasa(driverId: Int, picked: Boolean) = _state.update { current ->
        current.copy(
            pickedCasa = if (picked) {
                // Re-selecting keeps the plate already chosen: the operator correcting a list must not lose
                // the work of a row they did not touch.
                current.pickedCasa + (driverId to current.pickedCasa[driverId])
            } else {
                current.pickedCasa - driverId
            },
        )
    }

    /** Gives one picked company driver its plate. A driver nobody picked cannot be given one. */
    fun pickCasaVehicle(driverId: Int, vehicleId: Int) = _state.update { current ->
        if (driverId !in current.pickedCasa) {
            current
        } else {
            current.copy(pickedCasa = current.pickedCasa + (driverId to vehicleId))
        }
    }

    /**
     * Adds one entry per picked driver to the slot the picker was opened for.
     *
     * The driver type comes from each driver rather than from a control, so a request cannot contradict the
     * driver it names. The date comes from the grid's own date, not from the picker.
     *
     * The rows are sent one at a time rather than in parallel: the server refuses a driver already on that
     * date, so two sends racing on the same driver would turn a duplicate the operator can see into a
     * conflict they cannot. A send that fails does not stop the rest -- the operator picked a list, and half
     * a list silently dropped is worse than a message naming what failed. What saved leaves the picker and
     * what failed stays in it, because offering a saved driver again is offering a conflict.
     */
    fun confirmAdd() {
        val current = state.value
        // No request leaves for a closed day: the server would refuse it (T1), and asking anyway spends a
        // round trip to learn what the calendar already says.
        if (current.readOnly) return
        val slot = current.addingToSlot ?: return
        if (!current.canConfirm) return

        val requests = current.pickedFleteros.mapNotNull { id -> current.drivers.firstOrNull { it.id == id } }
            .map { driver -> scheduleRequest(current.date, slot, driver, vehicleId = null) } +
            current.pickedCasa.entries.mapNotNull { (driverId, vehicleId) ->
                val driver = current.drivers.firstOrNull { it.id == driverId }
                if (driver == null || vehicleId == null) {
                    null
                } else {
                    scheduleRequest(current.date, slot, driver, vehicleId = vehicleId)
                }
            }
        if (requests.isEmpty()) return

        _state.update { it.copy(busy = true, message = null) }

        viewModelScope.launch {
            val failed = mutableListOf<CreateScheduleRequest>()
            var refused: ScheduleWriteResult.Refused? = null
            var unreachable = false

            for (request in requests) {
                when (val result = repository.createSchedule(request)) {
                    is ScheduleWriteResult.Saved -> Unit
                    is ScheduleWriteResult.Refused -> {
                        failed += request
                        if (refused == null) refused = result
                    }
                    ScheduleWriteResult.Unreachable -> {
                        failed += request
                        unreachable = true
                    }
                }
            }

            _state.update {
                it.copy(
                    busy = false,
                    // The refusal is proof the day is off, so the grid turns read-only here instead of
                    // asking the server what it has just been told. Reloading would also clear the
                    // sentence below, which is the one thing this answer exists to say.
                    dayActive = if (refused?.code == BATCH_DEACTIVATED) false else it.dayActive,
                    addingToSlot = if (failed.isEmpty()) null else it.addingToSlot,
                    pickedFleteros = failed
                        .filter { request -> request.driverType == CreateScheduleRequest.DriverType.fletero }
                        .map { request -> request.driverId }
                        .toSet(),
                    pickedCasa = failed
                        .filter { request -> request.driverType == CreateScheduleRequest.DriverType.casa }
                        .associate { request -> request.driverId to request.vehicleId },
                    message = when {
                        unreachable -> UNREACHABLE
                        refused != null -> refusalMessage(refused.statusCode, refused.code)
                        else -> null
                    },
                )
            }
            if (failed.size != requests.size) load()
        }
    }

    private fun scheduleRequest(
        date: String,
        slot: String,
        driver: DriversResponseDriversInner,
        vehicleId: Int?,
    ) = CreateScheduleRequest(
        scheduleDate = date,
        timeSlot = slot,
        driverType = requestDriverType(driver),
        driverId = driver.id,
        vehicleId = vehicleId,
    )

    fun deleteEntry(id: Int) {
        // Same lock as the add: a closed day has no removable rows, and the row's own `readOnly` flag is
        // the server's answer for it, which the screen already honours.
        if (state.value.readOnly) return
        _state.update { it.copy(busy = true, message = null) }

        viewModelScope.launch {
            when (val result = repository.deleteSchedule(id)) {
                ScheduleLifecycleResult.Changed -> {
                    _state.update { it.copy(busy = false) }
                    load()
                }
                is ScheduleLifecycleResult.Refused ->
                    _state.update { it.copy(busy = false, message = deleteRefusal(result.statusCode)) }
                ScheduleLifecycleResult.Unreachable ->
                    _state.update { it.copy(busy = false, message = UNREACHABLE) }
            }
        }
    }

    /**
     * Fetches the server-rendered WhatsApp text for the day on screen. Never assembled here.
     *
     * The date is the grid's own, not a second control, so the text and the entries below it cannot
     * describe different days. Fetched on demand rather than with the grid, because it is one more call
     * the operator may not want and the grid is the point of the screen.
     */
    fun loadExport() {
        if (state.value.loadingExport) return
        _state.update { it.copy(loadingExport = true, message = null) }

        viewModelScope.launch {
            val text = repository.exportText(state.value.date)
            _state.update {
                it.copy(
                    loadingExport = false,
                    exportText = text,
                    // 400 is the only refusal the server has here and it answers a malformed date, which
                    // this client cannot send; what is left is an absent answer, and saying so is honest.
                    message = if (text == null) EXPORT_FAILED else null,
                )
            }
        }
    }

    /** Shares the server export text via the platform chooser. */
    fun shareText() {
        val text = state.value.exportText ?: return
        shareManager.shareText(text)
    }

    /**
     * Opens the one-on-one chat for [driver], carrying this day's own export text.
     *
     * What goes out is the schedule the announcement sends, to the number the fleet has for that person,
     * and the device being unable to open it is reported rather than left to look sent.
     */
    fun openWhatsAppFor(driver: DriversResponseDriversInner) {
        val text = state.value.exportText ?: return
        val link = waMeLink(driver.phone.orEmpty(), text) ?: return
        if (!shareManager.openLink(link)) {
            _state.update { it.copy(message = SHARE_FAILED) }
        }
    }

    /**
     * Generates an A4 PDF named cronograma-<date>.pdf in cache and launches the platform chooser.
     */
    fun sharePdf() {
        val text = state.value.exportText ?: return
        val date = state.value.date
        if (state.value.exportingPdf) return

        _state.update { it.copy(exportingPdf = true, message = null) }

        viewModelScope.launch {
            try {
                val file = pdfGenerator.generate(text, "cronograma-$date.pdf")
                val shared = shareManager.sharePdf(file)
                if (!shared) {
                    _state.update { it.copy(message = SHARE_FAILED) }
                }
            } catch (_: Throwable) {
                _state.update { it.copy(message = PDF_FAILED) }
            } finally {
                _state.update { it.copy(exportingPdf = false) }
            }
        }
    }

    /** Quick-add for a driver who is not in the list yet. Always a `fletero`, per the contract. */
    fun quickAddDriver(name: String, licensePlate: String?, phone: String? = null, assignToSlot: Boolean = true) {
        val slot = state.value.addingToSlot
        if (state.value.readOnly || name.isBlank() || state.value.busy) return
        _state.update { it.copy(busy = true, message = null) }

        viewModelScope.launch {
            val driver = repository.createDriver(
                name = name.trim(),
                licensePlate = licensePlate?.trim()?.takeIf { it.isNotEmpty() },
                phone = phone?.trim()?.takeIf { it.isNotEmpty() },
            )
            if (driver == null) {
                _state.update { it.copy(busy = false, message = UNREACHABLE) }
                return@launch
            }

            if (assignToSlot && slot != null) {
                val request = CreateScheduleRequest(
                    scheduleDate = state.value.date,
                    timeSlot = slot,
                    driverType = CreateScheduleRequest.DriverType.fletero,
                    driverId = driver.id,
                    vehicleId = null,
                )
                when (val result = repository.createSchedule(request)) {
                    is ScheduleWriteResult.Saved -> {
                        _state.update {
                            it.copy(
                                busy = false,
                                addingToSlot = null,
                                pickedFleteros = emptySet(),
                                pickedCasa = emptyMap(),
                                drivers = it.drivers + driver,
                            )
                        }
                        load()
                    }
                    is ScheduleWriteResult.Refused ->
                        _state.update {
                            it.copy(
                                busy = false,
                                addingToSlot = null,
                                drivers = it.drivers + driver,
                                message = refusalMessage(result.statusCode),
                            )
                        }
                    ScheduleWriteResult.Unreachable ->
                        _state.update {
                            it.copy(
                                busy = false,
                                addingToSlot = null,
                                drivers = it.drivers + driver,
                                message = UNREACHABLE,
                            )
                        }
                }
            } else {
                _state.update {
                    it.copy(
                        busy = false,
                        drivers = it.drivers + driver,
                        pickedFleteros = it.pickedFleteros + driver.id,
                    )
                }
            }
        }
    }

    /**
     * The request's driver-type enum, matched by value.
     *
     * The generator emits a separate enum for every DTO that carries one, so the driver's own type and
     * the request's are different classes with the same values.
     */
    private fun requestDriverType(driver: DriversResponseDriversInner): CreateScheduleRequest.DriverType =
        CreateScheduleRequest.DriverType.entries.firstOrNull { it.value == driver.driverType.value }
            ?: CreateScheduleRequest.DriverType.fletero

    private fun refusalMessage(statusCode: Int, code: String? = null): String = when {
        // A 409 is one of two different facts, and only the code tells them apart: the whole day was
        // switched off, so nothing can be added until it is reactivated, or the driver or vehicle is
        // already in that slot. The first one names the way out; the second would be advice nobody asked for.
        code == BATCH_DEACTIVATED -> BATCH_DEACTIVATED_MESSAGE
        statusCode == 409 -> "Esse motorista ou veículo já está nessa data."
        // Validation: a casa driver without a vehicle, an inactive driver or vehicle, a missing date.
        statusCode == 400 -> "Verifique os dados e tente de novo."
        statusCode == 404 -> "O motorista ou o veículo não existe mais."
        else -> GENERIC
    }

    private fun deleteRefusal(statusCode: Int): String = when (statusCode) {
        // A Trabalhador may only remove their own entry.
        403 -> "Só é possível excluir os próprios lançamentos."
        404 -> "O lançamento não existe mais."
        else -> GENERIC
    }

    companion object {
        const val UNREACHABLE = "Sem conexão com o servidor. Verifique a rede e tente de novo."

        /** The server's code for "this day's batch is deactivated", as `POST /loading/schedules` reports it. */
        const val BATCH_DEACTIVATED = "LOADING_BATCH_DEACTIVATED"

        /** The sentence the deactivated batch gets, verbatim from S27: it names the way out, not the fault. */
        const val BATCH_DEACTIVATED_MESSAGE =
            "O lote deste dia está desativado. Reative-o no histórico para carregar de novo."
        const val GENERIC = "Não foi possível concluir. Tente de novo."
        const val EXPORT_FAILED = "Não foi possível gerar o texto agora. Tente de novo."
        const val SHARE_FAILED = "Não foi possível compartilhar. Tente de novo."
        const val PDF_FAILED = "Não foi possível gerar o PDF. Tente de novo."
    }
}

/**
 * The two lists the driver picker offers.
 *
 * The split is the fleet's own, not a preference: a `fletero` brings their own vehicle and a company driver
 * has to be given one, so the plate belongs on one tab and has no meaning on the other.
 */
enum class LoadingPickerTab { FLETEROS, CASA }
