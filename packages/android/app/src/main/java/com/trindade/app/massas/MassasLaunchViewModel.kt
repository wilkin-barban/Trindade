package com.trindade.app.massas

import androidx.annotation.StringRes
import com.trindade.app.R
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.aero.AERO_CLOSED_DAY_CODE
import com.trindade.app.aero.AERO_QUEUE_EXPIRED_CODE
import com.trindade.app.aero.AERO_QUEUE_MALFORMED_CODE
import com.trindade.app.aero.AeroQueueRead
import com.trindade.app.aero.AeroQueueRejection
import com.trindade.app.aero.AeroDispatchOutcome
import com.trindade.app.aero.AeroFailure
import com.trindade.app.aero.AeroDispatchRequest
import com.trindade.app.aero.AeroDispatcher
import com.trindade.app.aero.AeroErpMovement
import com.trindade.app.aero.AeroQueue
import com.trindade.app.aero.AeroQueueItem
import com.trindade.app.aero.AeroQueuePort
import com.trindade.app.aero.AeroSettings
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.aero.AeroSyncOutcome
import com.trindade.app.aero.TabletAckPort
import com.trindade.app.aero.toLogic
import com.trindade.app.admin.UsersRepository
import com.trindade.app.admin.UserWriteResult
import com.trindade.app.auth.AuthRepository
import com.trindade.app.contract.models.CreateAdminUserRequest
import com.trindade.app.contract.models.ProfileResponseUser
import com.trindade.app.network.CreateMassasLaunchItem
import com.trindade.app.network.MassaIndividualLaunch
import com.trindade.app.network.MassasLaunchDayView
import com.trindade.app.share.deriveUsername
import com.trindade.app.share.quickWorkerPassword
import com.trindade.app.ui.UiText
import com.trindade.app.ui.filterPhoneDigits
import com.trindade.app.ui.waMeLink
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class MassaConfirmItem(
    val productCode: String,
    val productName: String?,
    val boxes: Int,
    val units: Int,
)

@HiltViewModel
class MassasLaunchViewModel @Inject constructor(
    private val repository: MassasRepository,
    private val authRepository: AuthRepository,
    private val aeroSettingsStore: AeroSettingsPort,
    private val aeroQueueStore: AeroQueuePort,
    private val aeroDispatcher: AeroDispatcher,
    private val tabletAckStore: TabletAckPort,
    private val usersRepository: UsersRepository? = null,
) : ViewModel() {

    companion object {
        /** The wall clock the operator reads on the sync line, in the plant's own timezone. */
        fun nowLabel(): String {
            val format = SimpleDateFormat("HH:mm", Locale.US)
            format.timeZone = TimeZone.getTimeZone("America/Sao_Paulo")
            return format.format(java.util.Date())
        }

        fun saopauloToday(): String {
            val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            format.timeZone = TimeZone.getTimeZone("America/Sao_Paulo")
            return format.format(java.util.Date())
        }
    }

    data class UiState(
        val date: String = saopauloToday(),
        val dayView: MassasLaunchDayView? = null,
        val quantities: Map<String, String> = emptyMap(),
        val isLoading: Boolean = false,
        val isSubmitting: Boolean = false,
        val isPollingActive: Boolean = false,
        val editingLaunchId: Int? = null,
        val editingBoxes: String = "",
        val deleteConfirmLaunchId: Int? = null,
        val currentUser: ProfileResponseUser? = null,
        val phone: String = "",
        val noticeMessage: UiText? = null,
        val errorMessage: UiText? = null,
        val showHelpDialog: Boolean = false,
        val showConfirmLaunchDialog: Boolean = false,
        val confirmItems: List<MassaConfirmItem> = emptyList(),
        val resultDialogMessage: UiText? = null,
        val resultDialogIsSuccess: Boolean = false,
        val selectedOperatorId: Int? = null,
        val isReadOnly: Boolean = false,
        /** The integration as this device holds it; blank credentials mean "not configured yet". */
        val aeroSettings: AeroSettings = AeroSettings(),
        /** The plant's day, as the last sync stored it on the backend. */
        val aeroMirror: List<AeroErpMovement> = emptyList(),
        /** Local time of the last successful sync, or null when this day was never synced. */
        val aeroSyncedAt: String? = null,
        val isSyncingAero: Boolean = false,
        /** The universal filter over the unified table: an operator key, empty for everyone. */
        val operatorFilter: String = "",
        /** The search box: a product code, a name or an operator, matched on both sides. */
        val unifiedQuery: String = "",
        /** Launch ids this device already marked as loaded on the company tablet. */
        val ackedLaunchIds: Set<Int> = emptySet(),
        /** Operators whose seats were rejected because the account is inactive. */
        val inactiveOperators: Set<String> = emptySet(),
        /** How many launches are still waiting in the persisted queue, for the retry button to say. */
        val queuedLaunches: Int = 0,
    ) {
        /** True when a launch can be sent to the plant without asking the operator anything else. */
        val aeroReady: Boolean get() = aeroSettings.ready

        /** The day in one table, with the three states the plant actually has. */
        val unifiedRows: List<MassasUnifiedRow>
            get() = massasUnifiedRows(
                input = MassasUnifiedInput(
                    launches = dayView?.launches.orEmpty(),
                    movements = aeroMirror,
                    products = dayView?.products.orEmpty().map {
                        AeroImportProduct(code = it.code, name = it.name, unitsPerBox = it.unitsPerBox)
                    },
                    ackedLaunchIds = ackedLaunchIds,
                ),
                operatorFilter = operatorFilter,
            ).filter { row ->
                val query = unifiedQuery.trim().lowercase()
                query.isEmpty() ||
                    row.productCode.lowercase().contains(query) ||
                    row.productName.lowercase().contains(query) ||
                    row.operatorKey.contains(query)
            }

        val unifiedBalance: MassasBalance get() = massasBalance(unifiedRows)
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var pollingJob: Job? = null
    private var isScreenActive: Boolean = false

    /**
     * Una lectura del día en vuelo, venga del botón o del camino automático.
     *
     * No es `isSyncingAero`: aquel dibuja el indicador del botón, y la lectura que sigue a un lanzamiento no
     * tiene un botón esperando. Este sólo impide que dos lecturas se pisen; el indicador queda para la prensa.
     */
    private var readInFlight = false

    /**
     * La única salida al ERP, de a una.
     *
     * El lote, el reintento de una fila y el drenaje de la cola escriben la misma cola persistida: leerla en
     * dos corrutinas y escribir cada una su copia deja el trabajo de la primera borrado por la segunda, y el
     * mismo `launchId` puede viajar dos veces. El mutex cubre la lectura de la cola, el despacho y su
     * escritura, que es la unidad que tiene que ser atómica.
     */
    private val erpDispatchMutex = Mutex()

    /**
     * Asientos que esta sesión ya entregó al ERP.
     *
     * El espejo tarda en reflejarlos, y en esa ventana la fila todavía se dibuja pendiente: sin esta marca, un
     * segundo toque reenviaría lo que el primero acaba de mandar.
     */
    private val dispatchedLaunchIds = mutableSetOf<Int>()

    init {
        loadCurrentUser()
        loadAeroSettings()
        loadDay(state.value.date)
    }

    /**
     * Reads the integration and the stored mirror for the current day.
     *
     * The mirror is kept on the backend rather than on the phone, so two tablets looking at the same morning
     * see the same seats; this device only remembers when it last asked.
     */
    private fun loadAeroSettings() {
        viewModelScope.launch {
            val settings = aeroSettingsStore.load()
            _state.value = _state.value.copy(
                aeroSettings = settings,
                aeroSyncedAt = aeroSettingsStore.syncedAt(state.value.date),
                ackedLaunchIds = tabletAckStore.ackedIds(),
            )
            // The stored mirror is Trindade's, not this phone's: it is read whether or not the device holds
            // ERP credentials, because a tablet someone else configured still has to see the plant's seats.
            refreshMirror(state.value.date)
        }
    }
    /**
     * Fills the mirror with what Trindade stored for [date], unless the operator already moved on.
     *
     * The read is a round trip and the date can change inside it: opening 30/10 and jumping to 31/10 used to
     * paint the first answer over the second day, which reads as the ERP having seats for a day it never saw.
     * The date is the token -- an answer for a day that is no longer on screen is dropped, not merged.
     */
    private suspend fun refreshMirror(date: String) {
        val stored = repository.storedAeroMovements(date) ?: return
        if (state.value.date != date) return
        _state.value = _state.value.copy(
            aeroMirror = stored.movements.map { it.toLogic() },
            aeroSyncedAt = stored.syncedAt ?: state.value.aeroSyncedAt,
        )
    }

    private fun loadCurrentUser() {
        viewModelScope.launch {
            val profile = authRepository.profile()
            _state.value = _state.value.copy(currentUser = profile)
        }
    }

    fun onScreenActive(active: Boolean) {
        isScreenActive = active
        val isToday = state.value.date == saopauloToday()
        if (active && isToday) {
            if (pollingJob == null || pollingJob?.isActive != true) {
                startPolling()
            }
        } else {
            pollingJob?.cancel()
            pollingJob = null
        }
    }

    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (isActive) {
                delay(POLL_INTERVAL_MS)
                val currentState = _state.value
                val isEditing = currentState.editingLaunchId != null
                val isSubmitting = currentState.isSubmitting
                val isToday = currentState.date == saopauloToday()
                if (shouldPollMassas(isScreenActive, isEditing, isSubmitting, isToday)) {
                    silentRefresh()
                }
            }
        }
    }

    fun loadDay(date: String) {
        val isToday = date == saopauloToday()
        val isReadOnly = !isToday
        if (isReadOnly) {
            pollingJob?.cancel()
            pollingJob = null
        } else if (isScreenActive && (pollingJob == null || pollingJob?.isActive != true)) {
            startPolling()
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(
                isLoading = true,
                errorMessage = null,
                date = date,
                isReadOnly = isReadOnly,
                editingLaunchId = null,
                editingBoxes = "",
                deleteConfirmLaunchId = null,
                // The boxes typed for the previous day are not this day's: carrying them over would let a
                // closed day look launchable, and an open one launch what the operator meant for yesterday.
                quantities = emptyMap(),
                showConfirmLaunchDialog = false,
                // The mirror belongs to the day like the boxes do. A seat left over from yesterday drawn over
                // today is worse than no seat: the operator reads it as this morning's and credits it to the
                // wrong shift. `refreshMirror` then fills it with whatever Trindade stored for this date.
                aeroMirror = emptyList(),
                aeroSyncedAt = aeroSettingsStore.syncedAt(date),
            )
            val result = repository.day(date)
            _state.value = _state.value.copy(
                isLoading = false,
                dayView = result,
                errorMessage = if (result == null) UiText.of(R.string.massas_error_load) else null,
            )
            // Always, and regardless of this phone's ERP credentials: the day the plant lived is already in
            // Trindade's database, and opening it is a read of that, not a trip to the factory.
            refreshMirror(date)
            // Una línea de auditoría que no llegó al backend se reintenta al abrir el día; el lanzamiento
            // nunca depende de este intento.
            aeroDispatcher.flushAudit()
            // Con el espejo del día ya leído, la cola sabe qué quedó pendiente en un turno anterior y puede
            // preguntar por lo que la planta todavía no tiene. Va después del espejo a propósito: la guarda de
            // un asiento ya registrado se lee de ahí y no del reloj del teléfono.
            flushPendingQueue()
            refreshQueuedCount()
        }
    }

    fun refresh() {
        loadDay(state.value.date)
    }

    private suspend fun silentRefresh() {
        val result = repository.day(state.value.date)
        if (result != null) {
            _state.value = _state.value.copy(dayView = result)
        }
    }

    fun onQuantityChange(productCode: String, value: String) {
        if (state.value.isReadOnly) return
        val filtered = value.filter { it in '0'..'9' }
        val newQuantities = _state.value.quantities.toMutableMap()
        if (filtered.isEmpty() || filtered == "0") {
            newQuantities.remove(productCode)
        } else {
            newQuantities[productCode] = filtered
        }
        _state.value = _state.value.copy(quantities = newQuantities, noticeMessage = null)
    }

    fun clearQuantities() {
        _state.value = _state.value.copy(quantities = emptyMap(), noticeMessage = null)
    }

    /**
     * Turns a refusal into the sentence the operator reads.
     *
     * The code decides when this build knows it, whatever language the sentence arrived in; otherwise the
     * server's own text stands, and the status code is the last resort for a body nobody could read.
     */
    private fun refusalMessage(
        result: MassasWriteResult.Refused,
        @StringRes fallbackRes: Int = R.string.massas_error_create_refused,
    ): UiText = when (result.errorCode) {
        "MASSAS_HISTORY_FROZEN" -> UiText.of(R.string.massas_error_history_frozen)
        "MASSAS_FORBIDDEN" -> UiText.of(R.string.massas_error_forbidden)
        "MASSAS_ALREADY_IMPORTED" -> UiText.of(R.string.massas_error_already_imported)
        "MASSAS_NOT_FOUND" -> UiText.of(R.string.massas_error_not_found)
        "MASSAS_RECONCILED" -> UiText.of(R.string.massas_error_reconciled)
        "MASSAS_INVALID_BOXES" -> UiText.of(R.string.massas_error_invalid_boxes)
        "MASSAS_FUTURE_DATE" -> UiText.of(R.string.massas_error_future_date)
        "MASSAS_OPERATOR_NOT_LINKED" -> UiText.of(R.string.massas_error_operator_not_linked)
        "MASSAS_OPERATOR_INACTIVE" -> UiText.of(R.string.massas_error_operator_inactive)
        else -> result.message
            ?.takeIf { it.isNotBlank() }
            ?.let { UiText.literal(it) }
            ?: UiText.of(fallbackRes, result.statusCode)
    }

    fun selectOperator(operatorId: Int?) {
        _state.value = _state.value.copy(selectedOperatorId = operatorId)
    }

    /**
     * The boxes on screen, with the name and the unit count the ERP needs.
     *
     * The catalogue is asked first and the built-in standard second: a product that disappeared from the API
     * yesterday still has a box size today, and a launch that divided by an invented one would post the wrong
     * quantity to the plant.
     */
    private fun confirmItems(quantities: Map<String, String>): List<MassaConfirmItem> {
        val dayProducts = _state.value.dayView?.products?.associateBy { it.code } ?: emptyMap()
        val standardMap = STANDARD_MASSAS.associateBy { it.code }
        return quantities.mapNotNull { (code, boxStr) ->
            val boxes = boxStr.toIntOrNull()
            if (boxes != null && boxes > 0) {
                val name = dayProducts[code]?.name ?: standardMap[code]?.name
                val unitsPerBox = dayProducts[code]?.unitsPerBox ?: standardMap[code]?.unitsPerBox ?: 10
                MassaConfirmItem(
                    productCode = code,
                    productName = name,
                    boxes = boxes,
                    units = boxes * unitsPerBox,
                )
            } else {
                null
            }
        }.sortedBy { it.productCode }
    }

    fun requestLaunchConfirmation() {
        if (state.value.isReadOnly) return
        val items = confirmItems(_state.value.quantities)
        if (items.isEmpty()) return
        _state.value = _state.value.copy(
            showConfirmLaunchDialog = true,
            confirmItems = items,
        )
    }

    fun dismissConfirmLaunch() {
        _state.value = _state.value.copy(
            showConfirmLaunchDialog = false,
            confirmItems = emptyList(),
        )
    }

    fun confirmLaunch() {
        if (state.value.isReadOnly) return
        val items = _state.value.confirmItems
        if (items.isEmpty()) return
        val apiItems = items.map { CreateMassasLaunchItem(it.productCode, it.boxes) }

        viewModelScope.launch {
            _state.value = _state.value.copy(
                isSubmitting = true,
                showConfirmLaunchDialog = false,
                confirmItems = emptyList(),
                errorMessage = null,
                noticeMessage = null,
            )
            when (val result = repository.createLaunch(state.value.date, apiItems)) {
                is MassasWriteResult.Saved -> {
                    _state.value = _state.value.copy(
                        dayView = result.view,
                        quantities = emptyMap(),
                        resultDialogMessage = UiText.of(R.string.massas_success),
                        resultDialogIsSuccess = true,
                    )
                    // El estado dura hasta que el lote termina de viajar: liberarlo con la escritura local
                    // hecha dejaba la pantalla aceptando un segundo toque con las mismas cajas en vuelo.
                    try {
                        erpDispatchMutex.withLock { dispatchToErp(result.created, items) }
                    } finally {
                        _state.value = _state.value.copy(isSubmitting = false)
                    }
                }
                is MassasWriteResult.Refused -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        resultDialogMessage = refusalMessage(result),
                        resultDialogIsSuccess = false,
                    )
                }
                is MassasWriteResult.Unreachable -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        resultDialogMessage = UiText.of(R.string.massas_error_offline),
                        resultDialogIsSuccess = false,
                    )
                }
            }
        }
    }

    /**
     * Sends the rows that were just stored to the plant.
     *
     * Called after the local write has already succeeded and never instead of it: a phone that loses the
     * factory Wi-Fi still records the launch, and the row stays `pending` until someone sends it again from
     * the table. The dialog is already on screen for the save, so this replaces its sentence with the one the
     * whole batch earned rather than opening a second window over it.
     */
    private suspend fun dispatchToErp(created: List<MassaIndividualLaunch>, items: List<MassaConfirmItem>) {
        val settings = state.value.aeroSettings
        if (created.isEmpty()) return
        if (!settings.ready) {
            // The rows are stored and the dialog has already said so; what it must not leave unsaid is that the
            // company never saw them. A launch that stayed on the phone looked exactly like one the ERP took.
            _state.value = _state.value.copy(
                resultDialogMessage = UiText.of(R.string.massas_aero_dispatch_local_only),
                resultDialogIsSuccess = false,
            )
            return
        }

        val unitsByCode = items.associate { it.productCode to it.units }
        val namesByCode = items.associate { it.productCode to it.productName }
        var sent = 0
        // The batch keeps the first failure instead of counting kinds: the dialog says the rest of the answer,
        // and one sentence about the network is worth more than a tally of codes nobody asked for.
        var firstFailure: AeroFailure? = null
        // La cola se lee una vez y se escribe con cada envío: releerla por fila convertiría una lista de cuatro
        // productos en cuatro lecturas de preferencias, y la última escribiría encima de lo que la anterior
        // acababa de liquidar.
        var queueSnapshot = aeroQueueStore.read()
            ?: AeroQueue(createdAt = System.currentTimeMillis(), date = state.value.date)

        for (launch in created) {
            val request = AeroDispatchRequest(
                launchId = launch.id,
                productCode = launch.productCode,
                productName = namesByCode[launch.productCode] ?: launch.productCode,
                // The row carries units already; the confirm items carry units too, and the fallback keeps
                // a row whose product vanished from the catalogue from dividing by an unknown box size.
                units = (unitsByCode[launch.productCode] ?: launch.units).toDouble(),
                date = state.value.date,
                // Each row of the batch is signed by the worker who typed it, from the row the server just
                // created. Without this the whole batch leaves as the phone's configured user, and the plant
                // credits one person for everybody's work.
                operatorName = launch.displayName.ifBlank { launch.username },
            )
            // El pendiente queda guardado antes de salir: lo que el teléfono no alcanzó a mandar sigue ahí
            // aunque la app se cierre a mitad del lote, y lo que la planta tomó se saca enseguida.
            queueSnapshot = queueSnapshot.enqueue(queueItemFor(request))
            aeroQueueStore.write(queueSnapshot)

            when (val outcome = aeroDispatcher.dispatch(settings, request)) {
                is AeroDispatchOutcome.Sent -> {
                    sent++
                    dispatchedLaunchIds += request.launchId
                    queueSnapshot = queueSnapshot.settle(listOf(request.launchId))
                    aeroQueueStore.write(queueSnapshot)
                }
                is AeroDispatchOutcome.Failed -> if (firstFailure == null) firstFailure = outcome.failure
            }
        }
        // Lo que quedó en la cola después del lote es lo que el botón de reintento tiene para ofrecer.
        refreshQueuedCount()

        // One answer for the batch, not one per row: the dialog is already open, and three outcomes replacing
        // each other would leave the operator reading whichever arrived last.
        val failed = created.size - sent
        val answer = when {
            firstFailure == null -> UiText.of(R.string.massas_aero_batch_sent, sent)
            // Nothing arrived: the reason is the whole answer, and it is the same sentence the single-row send
            // produces for the same network problem.
            sent == 0 -> firstFailure!!.describe()
            else -> UiText.of(R.string.massas_aero_batch_partial, sent, created.size, failed)
        }
        _state.value = _state.value.copy(
            resultDialogMessage = answer,
            resultDialogIsSuccess = failed == 0,
        )
        if (failed > 0) {
            _state.value = _state.value.copy(noticeMessage = UiText.of(R.string.massas_aero_pending_hint, failed))
        }
        val refreshed = repository.day(state.value.date)
        if (refreshed != null) _state.value = _state.value.copy(dayView = refreshed)

        // El envío ya está contestado: una sola lectura del día deja el asiento conciliado sin otro toque.
        // Un fallo de lectura no cambia el veredicto; se dice aparte y la fila queda pendiente con su motivo.
        if (sent > 0) {
            val failure = readAeroDayAfterLaunch(state.value.date)
            if (failure != null) _state.value = _state.value.copy(noticeMessage = failure.describe())
        }
    }

    /**
     * Reads the plant's day and stores it on the backend, without touching the verdict dialog.
     *
     * Returns null when nothing was attempted: another read is in flight, or this device holds no credentials.
     * The caller decides how to tell a failure, because the button replaces the dialog and the automatic path
     * must leave it alone.
     */
    private suspend fun readAeroDay(date: String): AeroSyncOutcome? {
        if (readInFlight) return null
        val settings = state.value.aeroSettings
        if (!settings.ready) return null
        readInFlight = true
        return try {
            val outcome = aeroDispatcher.syncDay(settings, date)
            if (outcome is AeroSyncOutcome.Synced) {
                // El backend guardó el día: la hora del teléfono y el espejo recién guardado son la prueba.
                aeroSettingsStore.markSynced(date, nowLabel())
                refreshMirror(date)
                if (state.value.date == date) {
                    _state.value = _state.value.copy(aeroSyncedAt = nowLabel())
                }
            }
            outcome
        } finally {
            readInFlight = false
        }
    }

    /**
     * The one read after a launch, for the day on screen and only when it is today.
     *
     * Never writes the verdict: the batch already answered, and a second sentence over it would leave the
     * operator reading whichever arrived last. Returns the failure so each caller says it in its own place.
     */
    private suspend fun readAeroDayAfterLaunch(date: String): AeroFailure? {
        if (date != saopauloToday() || state.value.date != date) return null
        return when (val outcome = readAeroDay(date)) {
            is AeroSyncOutcome.Synced -> {
                // El espejo cambió: el día se relee para que la tabla tenga las dos mitades frescas.
                val refreshed = repository.day(date)
                if (refreshed != null && state.value.date == date) {
                    _state.value = _state.value.copy(dayView = refreshed)
                }
                null
            }
            is AeroSyncOutcome.Failed -> outcome.failure
            // Otra lectura está en vuelo: esa va a dejar el espejo al día y no hay error que mostrar.
            null -> null
        }
    }

    /** Reads the plant's day and stores it on the backend, then reloads what was stored. */
    fun syncAeroDay() {
        val current = state.value
        if (current.isSyncingAero || readInFlight) return
        val settings = current.aeroSettings
        if (!settings.ready) {
            // The bridge has no settings yet: the press is what says so, because a disabled button over a
            // sentence nobody has read is the same experience as a button that does nothing.
            _state.value = _state.value.copy(
                resultDialogMessage = UiText.of(R.string.massas_aero_not_configured),
                resultDialogIsSuccess = false,
            )
            return
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(
                isSyncingAero = true,
                // The answer of the last press is a dialog the operator has already closed or is about to:
                // a new press replaces it instead of leaving the previous outcome behind the running spinner.
                resultDialogMessage = null,
                resultDialogIsSuccess = false,
                errorMessage = null,
                noticeMessage = null,
            )
            when (val outcome = readAeroDay(current.date)) {
                is AeroSyncOutcome.Synced -> {
                    _state.value = _state.value.copy(
                        isSyncingAero = false,
                        resultDialogMessage = UiText.of(R.string.massas_aero_sync_done, outcome.saved.saved),
                        resultDialogIsSuccess = true,
                    )
                }
                is AeroSyncOutcome.Failed -> {
                    // The previous snapshot stands, and the reason is the shared sentence for it: no plant
                    // Wi-Fi, the host not answering, or the ERP refusing all read the same here as anywhere.
                    _state.value = _state.value.copy(
                        isSyncingAero = false,
                        resultDialogMessage = outcome.failure.describe(),
                        resultDialogIsSuccess = false,
                    )
                }
                // Otra lectura estaba en vuelo: la prensa no tiene una segunda respuesta que dar.
                null -> _state.value = _state.value.copy(isSyncingAero = false)
            }
        }
    }

    /**
     * Resends one pending row to the plant.
     *
     * The row already exists locally; what is at stake is only whether it becomes reconciled. The day is
     * reloaded afterwards because the state lives in the ERP, not in this table.
     */
    fun sendPendingLaunch(row: MassasUnifiedRow) {
        val settings = state.value.aeroSettings
        if (!settings.ready) {
            _state.value = _state.value.copy(errorMessage = UiText.of(R.string.massas_aero_not_configured))
            return
        }
        val launch = state.value.dayView?.launches?.firstOrNull { it.id in row.launchIds }
        if (launch == null) {
            _state.value = _state.value.copy(errorMessage = UiText.of(R.string.massas_aero_launch_missing))
            return
        }
        // La planta ya tiene este asiento. Volver a mandarlo es la forma más fácil de duplicar una caja, y la
        // fila no debería haber ofrecido el botón: si llegó acá es porque el espejo cambió entre el toque y la
        // respuesta, y lo que se contesta es que ya está, no un error de red.
        if (launch.id in settledLaunchIds()) {
            _state.value = _state.value.copy(errorMessage = UiText.of(R.string.massas_error_reconciled))
            return
        }

        viewModelScope.launch {
            erpDispatchMutex.withLock { sendPendingRow(row, launch, settings) }
        }
    }

    /**
     * El viaje de una fila pendiente, ya dentro del turno de salida.
     *
     * Separado para que el mutex cubra el viaje completo sin envolver el cuerpo en un bloque: la cola se
     * lee, se encola el pendiente, se despacha y se liquida como una sola operación.
     */
    private suspend fun sendPendingRow(
        row: MassasUnifiedRow,
        launch: MassaIndividualLaunch,
        settings: AeroSettings,
    ) {
        _state.value = _state.value.copy(noticeMessage = null, errorMessage = null)
        // La fila se revalida dentro del turno: entre el toque y este punto pudo terminar el envío que
        // estaba en vuelo, y repetirlo es exactamente la caja duplicada que esta salida serializada evita.
        if (launch.id in settledLaunchIds()) {
            _state.value = _state.value.copy(errorMessage = UiText.of(R.string.massas_error_reconciled))
            return
        }
        val request = AeroDispatchRequest(
            launchId = launch.id,
            productCode = launch.productCode,
            productName = row.productName,
            units = row.units.toDouble(),
            date = state.value.date,
            // The row carries who the launch belongs to; the launch answers it when the owner is a
            // resolved account. Either way `ENT_USU` names the operator and not the phone's user.
            operatorName = row.operatorName.ifBlank { launch.displayName.ifBlank { launch.username } },
        )
        // El reintento de una fila pasa por la misma cola que el lote: si se cae la conexión a mitad del
        // viaje, el pendiente ya está guardado y la próxima apertura del día lo vuelve a intentar.
        var queue = aeroQueueStore.read()
            ?: AeroQueue(createdAt = System.currentTimeMillis(), date = request.date)
        queue = queue.enqueue(queueItemFor(request))
        aeroQueueStore.write(queue)

        when (val outcome = aeroDispatcher.dispatch(settings, request)) {
            is AeroDispatchOutcome.Sent -> {
                dispatchedLaunchIds += request.launchId
                aeroQueueStore.write(queue.settle(listOf(request.launchId)))
                // El asiento recién enviado se busca en el mismo viaje que el lote: una lectura, y la
                // fila deja de estar pendiente sin que el operario toque «Sincronizar con ERP».
                val failure = readAeroDayAfterLaunch(state.value.date)
                _state.value = _state.value.copy(
                    noticeMessage = failure?.describe() ?: UiText.of(R.string.massas_aero_sent),
                )
            }
            is AeroDispatchOutcome.Failed ->
                _state.value = _state.value.copy(errorMessage = outcome.failure.describe())
        }
        refreshQueuedCount()
    }

    // ---- La cola de lo que la planta todavía no tiene (T23) ----

    /**
     * Deja en el registro la cola que se descartó, con el motivo y los asientos que llevaba.
     *
     * El evento es `queue_rejected`, el mismo que el día cerrado usa: quien diagnostica filtra por evento y
     * lee el código para saber si fue un día que ya pasó, una cola vencida o un blob que este build no pudo
     * leer. Sin esta línea, el teléfono olvidaba trabajo y nadie podía enterarse.
     */
    private suspend fun logRejectedQueue(read: AeroQueueRead.Rejected) {
        val code = when (read.reason) {
            AeroQueueRejection.EXPIRED -> AERO_QUEUE_EXPIRED_CODE
            AeroQueueRejection.MALFORMED -> AERO_QUEUE_MALFORMED_CODE
        }
        aeroDispatcher.logQueueRejected(
            date = read.date ?: state.value.date,
            launchIds = read.items.flatMap { it.launchIds },
            code = code,
        )
    }

    /**
     * El pendiente de un envío, con la forma con la que se guarda.
     *
     * Se encola *antes* de despachar y no después de fallar: si el teléfono se queda sin batería justo cuando
     * la petición salía, nadie sabe si el ERP la tomó, y una entrada guardada de más se descarta sola cuando el
     * espejo muestra el asiento conciliado. Una entrada guardada de menos es una caja que la fábrica nunca ve.
     */
    private fun queueItemFor(request: AeroDispatchRequest): AeroQueueItem = AeroQueueItem(
        productCode = request.productCode,
        productName = request.productName,
        quantity = request.units,
        operatorName = request.operatorName,
        launchIds = listOf(request.launchId),
        date = request.date,
    )

    /**
     * Vacía lo que quedó pendiente de un turno anterior.
     *
     * Corre al abrir el día, cuando el espejo ya se leyó: un asiento que la planta tiene se saca de la cola sin
     * volver a mandarlo, que es la mitad del problema del doble asiento. Lo que falla se queda guardado para la
     * próxima vez, y no se avisa: la pantalla ya muestra las filas pendientes, y una queja por una cola que se
     * reintenta sola en cada apertura sería una alarma que el operario no puede apagar.
     */
    private suspend fun flushPendingQueue() {
        // La cola comparte archivo con el lote y con el reintento de una fila: drenarla fuera del mutex
        // reenviaba lo que el lote tenía en vuelo y escribía encima de su liquidación.
        erpDispatchMutex.withLock { drainQueueLocked() }
    }

    /** El drenaje, ya dentro del turno de salida: se lee la cola, se despacha y se escribe como una unidad. */
    private suspend fun drainQueueLocked() {
        val settings = state.value.aeroSettings
        if (!settings.ready) return
        // La cola se lee diciendo qué pasó con ella: una vencida o rota se descarta, pero deja su línea con
        // los lanzamientos que se pierden. Antes el store la borraba y devolvía null, que se leía como "no hay
        // nada pendiente" y mandaba la caja que la planta nunca vio al olvido sin rastro.
        val stored = when (val read = aeroQueueStore.readResult()) {
            is AeroQueueRead.Pending -> read.queue
            is AeroQueueRead.Rejected -> {
                logRejectedQueue(read)
                refreshQueuedCount()
                return
            }
            AeroQueueRead.Empty -> return
        }
        val today = saopauloToday()

        // Lo que la planta ya registró no se vuelve a mandar, y la única forma de saberlo es leer el día
        // antes de liquidar. Una lectura por apertura con pendientes de hoy, no una por fila; la cola de una
        // fecha que ya pasó no se lee porque no hay nada nuevo que la planta pueda decir de ella.
        if (stored.items.any { it.date == today }) readAeroDay(today)

        var queue = stored.settle(settledLaunchIds())

        // Un día cerrado no se reintenta: lo que quedó de una fecha que ya no es hoy se descarta aquí, con su
        // línea en el registro. Dejarlo en la cola sería reabrir el mismo 409 en cada apertura, y el operario
        // vería una fila pendiente que ningún toque puede vaciar.
        val closed = queue.items.filter { it.date != today }
        for (item in closed) {
            queue = queue.settle(item.launchIds)
            aeroDispatcher.logQueueRejected(item.date, item.launchIds, AERO_CLOSED_DAY_CODE)
        }

        if (queue.isEmpty) {
            aeroQueueStore.clear()
            refreshQueuedCount()
            return
        }

        var sent = 0
        // Toda la cola, en tandas de ocho. Antes se mandaba una sola tanda y el resto esperaba a la próxima
        // apertura: veinte cajas pendientes eran tres turnos para lo que la planta hace en un minuto. Se corta
        // en el primer fallo porque los siguientes viajarían al mismo ERP que acaba de no contestar.
        for (batch in queue.drainBatches()) {
            var failed = false
            for (item in batch) {
                val request = AeroDispatchRequest(
                    launchId = item.launchIds.first(),
                    productCode = item.productCode,
                    productName = item.productName,
                    units = item.quantity,
                    date = item.date,
                    operatorName = item.operatorName,
                )
                when (aeroDispatcher.dispatch(settings, request)) {
                    is AeroDispatchOutcome.Sent -> {
                        sent++
                        dispatchedLaunchIds += item.launchIds
                        queue = queue.settle(item.launchIds)
                    }
                    // El motivo no se guarda: lo que la cola conserva es el trabajo, no el diagnóstico. La
                    // próxima apertura lo vuelve a intentar y, si el problema sigue, la fila ya lo explica.
                    is AeroDispatchOutcome.Failed -> failed = true
                }
                if (failed) break
            }
            if (failed) break
        }
        aeroQueueStore.write(queue)

        if (sent > 0) {
            // Una lectura de confirmación después de la tanda: el asiento puede haberse publicado mientras
            // viajaba. Lo que la planta ya tiene se saca de la cola aquí, no en la próxima apertura.
            val failure = readAeroDayAfterLaunch(today)
            val settled = queue.settle(settledLaunchIds())
            if (settled.isEmpty) aeroQueueStore.clear() else aeroQueueStore.write(settled)
            _state.value = _state.value.copy(
                noticeMessage = failure?.describe() ?: UiText.of(R.string.massas_aero_sent),
            )
        }
        refreshQueuedCount()
    }

    /**
     * Records that this row is already loaded on the company tablet.
     *
     * Kept on the device on purpose: it is what the operator standing next to the tablet knows, and it is not
     * something the ERP can tell us. It silences the button for this device without touching the row.
     */
    fun acknowledgeLaunch(row: MassasUnifiedRow) {
        val id = row.launchIds.firstOrNull() ?: return
        tabletAckStore.ack(id)
        // The rows are derived from the state, and the ack is part of that derivation: the copy is what
        // removes the button from this row without touching the launch itself.
        _state.value = _state.value.copy(ackedLaunchIds = _state.value.ackedLaunchIds + id)
    }

    /**
     * Takes back the acknowledgement of a row, so the button comes back.
     *
     * The ack is a person's word about a paper tablet, and a person can point at the wrong line. Without this
     * the row stayed silent for the rest of the device's life and the only way out was clearing the app.
     */
    fun undoAcknowledgeLaunch(row: MassasUnifiedRow) {
        val id = row.launchIds.firstOrNull() ?: return
        tabletAckStore.unack(id)
        _state.value = _state.value.copy(ackedLaunchIds = _state.value.ackedLaunchIds - id)
    }

    /**
     * Sends what is still waiting in the queue, right now.
     *
     * The queue retries on its own when the day is opened, and that is the wrong moment for the operator who
     * has just walked back into the plant's Wi-Fi and is looking at a row that says pending. The answer is the
     * same one the open does, so there is no second set of rules.
     */
    fun retryPendingLaunches() {
        if (state.value.isSubmitting) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, errorMessage = null, noticeMessage = null)
            flushPendingQueue()
            val refreshed = repository.day(state.value.date)
            if (refreshed != null) _state.value = _state.value.copy(dayView = refreshed)
            _state.value = _state.value.copy(isSubmitting = false)
            refreshQueuedCount()
        }
    }

    /**
     * Imports a seat the tablet recorded, as a launch of this app.
     *
     * Only whole boxes arrive here: [aeroImportPlan] returns null for a quantity that does not fit the
     * catalogue's box size, and the row would not have offered the action.
     */
    fun importErpSeat(row: MassasUnifiedRow) {
        if (state.value.isReadOnly) return
        val known = state.value.unifiedRows.firstOrNull { it.key == row.key } ?: return
        val seat = state.value.aeroMirror.firstOrNull { it.entLan in known.entLans } ?: return
        val plan = aeroImportPlanFor(row) ?: return

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, errorMessage = null, noticeMessage = null)
            val result = repository.createLaunch(
                date = state.value.date,
                items = listOf(CreateMassasLaunchItem(plan.productCode, plan.boxes)),
                // El asiento y el operario de la tableta viajan con las cajas: sin ellos el lanzamiento queda
                // a nombre de quien apretó el botón y sólo se puede emparejar por nombre.
                entLan = seat.entLan,
                operatorName = seat.operatorName,
            )
            // The seat and the boxes travel to the log with the same values the request carried: an import
            // that failed is the row an operator will retry, and without the line nobody knows it was tried.
            suspend fun audit(error: String?) {
                aeroDispatcher.logImport(
                    date = state.value.date,
                    entLan = seat.entLan,
                    productCode = plan.productCode,
                    boxes = plan.boxes,
                    error = error,
                )
            }
            when (result) {
                is MassasWriteResult.Saved -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        dayView = result.view,
                        noticeMessage = UiText.of(R.string.massas_aero_imported),
                    )
                    audit(null)
                }
                is MassasWriteResult.Refused -> {
                    val isInactive = result.errorCode == "MASSAS_OPERATOR_INACTIVE"
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        errorMessage = refusalMessage(result, R.string.massas_error_create_refused),
                        inactiveOperators = if (isInactive) _state.value.inactiveOperators + row.operatorName else _state.value.inactiveOperators,
                    )
                    audit(result.errorCode ?: "AERO_IMPORT_REFUSED")
                }
                is MassasWriteResult.Unreachable -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        errorMessage = UiText.of(R.string.massas_error_offline),
                    )
                    audit("AERO_IMPORT_UNREACHABLE")
                }
            }
        }
    }

    /** The import plan for a row, rebuilt from the seat it came from. */
    private fun aeroImportPlanFor(row: MassasUnifiedRow): AeroImportPlan? {
        val products = state.value.dayView?.products.orEmpty().map {
            AeroImportProduct(code = it.code, name = it.name, unitsPerBox = it.unitsPerBox)
        }
        val seat = state.value.aeroMirror.firstOrNull { it.entLan in row.entLans } ?: return null
        return aeroImportPlan(seat, products)
    }

    /**
     * Creates an operator account from an unlinked ERP seat in 1 click (S16-S19).
     *
     * Derives login without dots, display name and deterministic password, assigns role 2 (Trabalhador),
     * and refreshes the mirror immediately so the row transforms into [ Importar ].
     */
    fun createOperatorFromSeat(row: MassasUnifiedRow) {
        val usersRepo = usersRepository ?: return
        val rawName = row.operatorName
        val username = deriveUsername(rawName)
        val displayName = deriveDisplayName(rawName)
        val password = quickWorkerPassword(username)

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, errorMessage = null, noticeMessage = null)
            val result = usersRepo.create(
                CreateAdminUserRequest(
                    username = username,
                    password = password,
                    displayName = displayName,
                    roleId = CreateAdminUserRequest.RoleId._2,
                ),
            )
            when (result) {
                is UserWriteResult.Saved -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        noticeMessage = UiText.of(R.string.massas_operator_created, displayName),
                    )
                    silentRefresh()
                    refreshMirror(state.value.date)
                }
                is UserWriteResult.Refused -> {
                    if (result.status == 409) {
                        _state.value = _state.value.copy(
                            isSubmitting = false,
                            errorMessage = UiText.of(R.string.massas_error_operator_inactive),
                            inactiveOperators = _state.value.inactiveOperators + rawName,
                        )
                    } else {
                        _state.value = _state.value.copy(
                            isSubmitting = false,
                            errorMessage = UiText.of(R.string.share_create_refused),
                        )
                    }
                }
                UserWriteResult.Unreachable -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        errorMessage = UiText.of(R.string.massas_error_offline),
                    )
                }
            }
        }
    }

    /** The universal filter: an operator key, or empty for the whole plant. */
    fun setOperatorFilter(operatorKey: String) {
        _state.value = _state.value.copy(operatorFilter = operatorKey)
    }

    fun setUnifiedQuery(query: String) {
        _state.value = _state.value.copy(unifiedQuery = query)
    }

    /** Loads a stored day's mirror without touching the ERP. */
    fun reloadMirror(date: String) {
        viewModelScope.launch { refreshMirror(date) }
    }

    fun dismissResultDialog() {
        _state.value = _state.value.copy(
            resultDialogMessage = null,
            resultDialogIsSuccess = false,
        )
    }

    fun submitLaunch() {
        val items = confirmItems(_state.value.quantities)
        if (items.isEmpty()) return
        val body = items.map { CreateMassasLaunchItem(productCode = it.productCode, boxes = it.boxes) }

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, errorMessage = null, noticeMessage = null)
            when (val result = repository.createLaunch(state.value.date, body)) {
                is MassasWriteResult.Saved -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        dayView = result.view,
                        quantities = emptyMap(),
                        noticeMessage = UiText.of(R.string.massas_success),
                    )
                    dispatchToErp(result.created, items)
                }
                is MassasWriteResult.Refused -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        errorMessage = refusalMessage(result, R.string.massas_error_create_refused),
                    )
                }
                is MassasWriteResult.Unreachable -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        errorMessage = UiText.of(R.string.massas_error_offline),
                    )
                }
            }
        }
    }

    /** Los lanzamientos que el ERP ya asentó, tal como los ve la tabla del día. */
    private fun settledLaunchIds(): Set<Int> =
        reconciledLaunchIds(state.value.unifiedRows) + dispatchedLaunchIds

    /**
     * Reads how much work the queue is holding.
     *
     * The queue is the authority and the screen is a copy: counting the items on every write keeps the button
     * from promising zero pending launches while a restart is still owed three.
     */
    private fun refreshQueuedCount() {
        val queued = aeroQueueStore.read()?.items?.size ?: 0
        if (queued != state.value.queuedLaunches) {
            _state.value = _state.value.copy(queuedLaunches = queued)
        }
    }

    fun canEdit(launch: MassaIndividualLaunch): Boolean {
        if (state.value.isReadOnly) return false
        val user = state.value.currentUser ?: return false
        return canEditOrDeleteLaunch(
            launchUserId = launch.userId,
            currentUserId = user.id,
            isToday = !state.value.isReadOnly,
            isReconciled = launch.id in settledLaunchIds(),
        )
    }

    fun startEdit(launch: MassaIndividualLaunch) {
        if (state.value.isReadOnly) return
        // La pantalla ya no dibuja el botón, pero el camino sigue cerrado acá: un lanzamiento conciliado está
        // en el ERP y moverle las cajas dejaría los dos registros del día en desacuerdo.
        if (launch.id in settledLaunchIds()) return
        _state.value = _state.value.copy(
            editingLaunchId = launch.id,
            editingBoxes = launch.boxes.toString(),
            noticeMessage = null,
        )
    }

    fun cancelEdit() {
        _state.value = _state.value.copy(
            editingLaunchId = null,
            editingBoxes = "",
        )
    }

    fun onEditingBoxesChange(value: String) {
        val filtered = value.filter { it in '0'..'9' }
        _state.value = _state.value.copy(editingBoxes = filtered)
    }

    fun saveEdit() {
        if (state.value.isReadOnly) return
        val launchId = _state.value.editingLaunchId ?: return
        if (launchId in settledLaunchIds()) return
        val boxes = _state.value.editingBoxes.toIntOrNull() ?: return
        if (boxes <= 0) return

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, errorMessage = null, noticeMessage = null)
            when (val result = repository.updateLaunch(launchId, boxes, state.value.date)) {
                is MassasWriteResult.Saved -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        dayView = result.view,
                        editingLaunchId = null,
                        editingBoxes = "",
                        noticeMessage = UiText.of(R.string.massas_notice_updated),
                    )
                }
                is MassasWriteResult.Refused -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        errorMessage = refusalMessage(result, R.string.massas_error_update),
                    )
                }
                is MassasWriteResult.Unreachable -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        errorMessage = UiText.of(R.string.massas_error_offline),
                    )
                }
            }
        }
    }

    fun promptDelete(launchId: Int) {
        if (state.value.isReadOnly) return
        if (launchId in settledLaunchIds()) return
        _state.value = _state.value.copy(deleteConfirmLaunchId = launchId)
    }

    fun dismissDelete() {
        _state.value = _state.value.copy(deleteConfirmLaunchId = null)
    }

    fun deleteLaunch() {
        if (state.value.isReadOnly) return
        val launchId = _state.value.deleteConfirmLaunchId ?: return
        if (launchId in settledLaunchIds()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(
                isSubmitting = true,
                deleteConfirmLaunchId = null,
                errorMessage = null,
                noticeMessage = null,
            )
            when (val result = repository.deleteLaunch(launchId, state.value.date)) {
                is MassasWriteResult.Saved -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        dayView = result.view,
                        noticeMessage = UiText.of(R.string.massas_notice_deleted),
                    )
                }
                is MassasWriteResult.Refused -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        errorMessage = refusalMessage(result, R.string.massas_error_delete),
                    )
                }
                is MassasWriteResult.Unreachable -> {
                    _state.value = _state.value.copy(
                        isSubmitting = false,
                        errorMessage = UiText.of(R.string.massas_error_offline),
                    )
                }
            }
        }
    }

    fun onPhoneChange(phone: String) {
        _state.value = _state.value.copy(phone = filterPhoneDigits(phone))
    }

    fun getWhatsAppLink(): String? {
        val view = _state.value.dayView ?: return null
        val message = formatMassasWhatsAppMessage(view)
        return waMeLink(_state.value.phone, message)
    }

    fun getShareText(): String {
        val view = _state.value.dayView ?: return ""
        return formatMassasWhatsAppMessage(view)
    }

    fun toggleHelpDialog(show: Boolean) {
        _state.value = _state.value.copy(showHelpDialog = show)
    }

    fun clearNotice() {
        _state.value = _state.value.copy(noticeMessage = null)
    }

    fun clearError() {
        _state.value = _state.value.copy(errorMessage = null)
    }

    override fun onCleared() {
        super.onCleared()
        pollingJob?.cancel()
    }
}
