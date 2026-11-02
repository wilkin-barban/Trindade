package com.trindade.app.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.contract.models.CategoriesResponseCategoriesInner
import com.trindade.app.contract.models.CreateReportRequest
import com.trindade.app.contract.models.ProductsResponse
import com.trindade.app.contract.models.ReportCategoryTasksInner
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import com.trindade.app.R
import com.trindade.app.aero.AeroDispatcher
import com.trindade.app.aero.AeroFailure
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.aero.AeroSyncOutcome
import com.trindade.app.ui.UiText
import com.trindade.app.contract.models.MassasReportDayView
import com.trindade.app.contract.models.ReportReceipts
import com.trindade.app.massas.MassasDaySource
import com.trindade.app.massas.MassasLaunchViewModel
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The report generator's form.
 *
 * The state is one map per element type rather than a list of item objects, because the four types
 * hold different shapes and a single item type would have to make every field optional to cover them:
 * a check is a boolean, a product check is a set of names, and a temperature task is a fixed number of
 * readings. Keeping them apart means a check cannot accidentally carry a temperature.
 *
 * Everything loads together on open, because the screen is unusable until it has all three: the
 * categories to know what to ask, the offers to render the two product types, and the shift because
 * the server detects it and the form must not guess.
 */
@HiltViewModel
class ReportGeneratorViewModel @Inject constructor(
    private val repository: ReportsRepository,
    // Optional, like the detail screen's: a test about the form needs no second source, and a build
    // without one draws the form without the day's count.
    private val massasDaySource: MassasDaySource? = null,
    // The ERP bridge, optional for the same reason: without it the card draws the day it read and offers no
    // sync, which is what a test about the form asks for.
    private val aeroDispatcher: AeroDispatcher? = null,
    private val aeroSettingsStore: AeroSettingsPort? = null,
) : ViewModel() {

    /** The three things the server supplies before this form can be answered at all. */
    enum class Prerequisite { SHIFT, CATEGORIES, OFFERS }

    /**
     * The shape of the generator, decided by its prerequisites and not by how many of them came back.
     *
     * [FAILED] is the state that refuses the form outright: without the shift the report would be filed
     * against a guessed one, and without categories there is nothing to answer. [INCOMPLETE] draws the
     * form the server did supply and says what is missing, which is the product lists' case -- the sections
     * are answerable except for the product tasks, and the operator can see that much while deciding
     * whether to retry.
     */
    enum class Stage { LOADING, READY, INCOMPLETE, FAILED }

    data class UiState(
        val loading: Boolean = true,
        val categories: List<CategoriesResponseCategoriesInner> = emptyList(),
        val offers: ProductsResponse? = null,
        val turno: String? = null,
        /**
         * What the last read could not supply, named rather than left as an empty collection.
         *
         * An empty collection is what made this screen look like a day with no tasks instead of a read
         * that never arrived: the form drew the nothing it was handed and the operator had no sentence to
         * read and nothing to press.
         */
        val missing: List<Prerequisite> = emptyList(),
        /** One boolean per `check`, `check_assai` and `check_normal` task. */
        val checks: Map<Int, Boolean> = emptyMap(),
        /** One entry per `temperature` task, holding exactly `temperatureReadings` readings. */
        val temperatures: Map<Int, List<String>> = emptyMap(),
        /**
         * The box types the operator switched off, by their category's id.
         *
         * Absent means on, so a report that already recorded both types opens with both of them
         * switchable rather than with one of them silently missing.
         */
        val disabledBoxTypeIds: Set<Int> = emptySet(),
        /** The names selected per product-check task. */
        val selectedProducts: Map<Int, Set<String>> = emptyMap(),
        /**
         * Lo que el operador escribió sobre el turno. La pantalla de edición ya lo tenía; el generador
         * no, así que al crear un reporte no había dónde escribirlo y el atributo llegaba siempre nulo.
         */
        val notes: String = "",
        val submitting: Boolean = false,
        /** The report the server created, which is what the next screen needs. */
        val createdReportId: Int? = null,
        /** What the last action answered, shown in a dialog; null when nothing has been answered yet. */
        val message: UiText? = null,
        /** Whether that answer is a refusal, which is what the dialog's tone is drawn from. */
        val messageIsError: Boolean = false,
        val showValidation: Boolean = false,
        /** The day's massas, under the temperatures the operator has just read. */
        val massasDay: MassasReportDayView? = null,
        /** The incoming supplies the ERP registered for that same day. */
        val receipts: ReportReceipts? = null,
        /** Whether an ERP sync via bridge is currently in progress. */
        val isSyncingErp: Boolean = false,
        /**
         * The day this report belongs to.
         *
         * The generator writes today's report and nothing else -- the screen has no date field, and the server
         * stamps the record with the day it arrives. It is in the state because the day decides how the form is
         * drawn: Recebimento stopped being a checklist on a date, and a report of that day must not ask for it.
         */
        val date: String = MassasLaunchViewModel.saopauloToday(),
    ) {
        val stage: Stage
            get() = when {
                loading -> Stage.LOADING
                // The shift and the categories are the two the form cannot be drawn without, so their
                // absence refuses it instead of drawing a version of it that cannot be answered.
                missing.any { it == Prerequisite.SHIFT || it == Prerequisite.CATEGORIES } -> Stage.FAILED
                missing.isNotEmpty() -> Stage.INCOMPLETE
                else -> Stage.READY
            }

        val ready: Boolean get() = stage == Stage.READY && categories.isNotEmpty()

        /** The categories the form is drawn from, validated and submitted, which the day can shorten. */
        val formCategories: List<CategoriesResponseCategoriesInner>
            get() = reportFormCategories(categories, date)

        /**
         * The readings the form still owes, one slot per declared reading it has no number for.
         *
         * Empty is the whole of "complete", and it is the same answer the form marks its fields from: the
         * screen draws a red field for every slot below and withholds the save, so the operator reads what
         * is missing instead of meeting the server's refusal. The rule itself is
         * [missingTemperatureReadings]'s, beside the body builders both surfaces submit through -- what is
         * here is only the question, asked of this state's own categories and answers.
         */
        val missingReadings: Set<TemperatureSlot>
            get() = missingTemperatureReadings(formCategories.flatMap { it.tasks }, temperatures, String::toReading)

        /**
         * Whether the report may be sent, which now includes whether it can be built at all.
         *
         * The server refuses a body that does not carry every reading the active temperature tasks
         * declare, so a form with one blank reading has nothing to send: [missingReadings] empty is the
         * other half of this flag, and the screen's message is what turns a withheld save into a sentence
         * the operator can act on rather than a dead button.
         */
        val canSubmit: Boolean get() = ready && !submitting && createdReportId == null && missingReadings.isEmpty()
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, message = null, messageIsError = false) }
        loadMassasDay()
        loadReceipts()
        viewModelScope.launch {
            val categories = repository.categories()
            val offers = repository.productOffers()
            val turno = repository.detectedTurno()

            // What the read could not supply is named, in the order the screen reads it, and the shift
            // stays the one absence that refuses the form outright: a form that opened without it would
            // have to guess which shift the report belongs to, and the server is the only party that
            // detects it, so a wrong guess produces a report filed against the wrong shift.
            val missing = buildList {
                if (turno == null) add(Prerequisite.SHIFT)
                if (categories == null) add(Prerequisite.CATEGORIES)
                if (offers == null) add(Prerequisite.OFFERS)
            }

            _state.update { current ->
                current.copy(
                    loading = false,
                    categories = categories.orEmpty(),
                    offers = offers,
                    turno = turno,
                    missing = missing,
                    // The operator's own answers win over the seed: a retry is about the read and not about
                    // their work, and putting the seed's fresh, empty lists last would wipe a temperature they
                    // had already typed for a task the read happened to list again.
                    temperatures = initialReadings(categories.orEmpty()) + current.temperatures,
                    message = null,
                )
            }
        }
    }

    /** The way out of a read that could not supply what the form needs. */
    fun retry() = load()

    fun selectTurno(turno: String) {
        _state.update { current ->
            current.copy(
                turno = turno,
                missing = current.missing - Prerequisite.SHIFT,
            )
        }
    }

    fun selectTurno(turno: CreateReportRequest.Turno) = selectTurno(turno.value)

    /**
     * The next report starts as a new form, switches included.
     *
     * "Not mounted" is a statement about one day's report and nothing else: it is session state, never
     * persisted (D2, S13) -- there is no column and no flag for it on the server. Keeping it here after a save
     * would open the next report with a type of box silently switched off, and its tasks would be missing from
     * a form the operator believes is complete; the boxes of the day would go unrecorded without anybody
     * pressing anything.
     */
    fun onReportCreatedHandled() {
        _state.update { current ->
            current.copy(
                createdReportId = null,
                notes = "",
                checks = emptyMap(),
                temperatures = initialReadings(current.formCategories),
                selectedProducts = emptyMap(),
                disabledBoxTypeIds = emptySet(),
                showValidation = false,
                message = null,
            )
        }
    }

    /**
     * The way out of a dialog the operator has read.
     *
     * A dialog that answered a save also carries the id of the report it created: acknowledging it is what
     * closes the form and lets the next screen open, so the record is read before the screen moves on.
     */
    fun dismissResult() {
        val created = state.value.createdReportId
        if (created != null) {
            onReportCreatedHandled()
        } else {
            _state.update { it.copy(message = null, messageIsError = false) }
        }
    }

    fun onNotesChange(notes: String) = _state.update { it.copy(notes = notes) }

    /**
     * Reads today's massas for the card.
     *
     * The generator files its report against the server's own date, so "today" is the only day this screen can
     * be about; asking for another one would draw a count the operator cannot file.
     */
    private fun loadMassasDay() {
        val source = massasDaySource ?: return
        viewModelScope.launch {
            val day = source.reportDay(MassasLaunchViewModel.saopauloToday())
            if (day != null) _state.update { it.copy(massasDay = day) }
        }
    }

    /**
     * Reads the ERP's own receipts for today, the other half of the same card.
     *
     * The generator's day is the server's today (see [loadMassasDay]), so both halves of the card are about
     * the day the report will be filed against rather than about a date the operator picked.
     */
    private fun loadReceipts() {
        viewModelScope.launch {
            val receipts = repository.receipts(MassasLaunchViewModel.saopauloToday())
            _state.update { it.copy(receipts = receipts) }
        }
    }

    /**
     * Reads the plant's day from the ERP via bridge and refreshes both halves of the card.
     *
     * The same sequence the report's detail screen runs, and deliberately the same rules: a bridge that is
     * not configured is a sentence rather than a silent no-op, because a button that does nothing is
     * indistinguishable from one that is broken.
     */
    fun syncErp() {
        if (state.value.isSyncingErp) return
        val dispatcher = aeroDispatcher
        val store = aeroSettingsStore
        if (dispatcher == null || store == null) {
            _state.update { it.copy(message = AeroFailure.notConfigured.describe(), messageIsError = true) }
            return
        }
        val date = MassasLaunchViewModel.saopauloToday()

        viewModelScope.launch {
            val settings = store.load()
            if (!settings.ready) {
                _state.update { it.copy(message = AeroFailure.notConfigured.describe(), messageIsError = true) }
                return@launch
            }
            _state.update { it.copy(isSyncingErp = true, message = null, messageIsError = false) }
            when (val outcome = dispatcher.syncDay(settings, date)) {
                is AeroSyncOutcome.Synced -> {
                    store.markSynced(date, MassasLaunchViewModel.nowLabel())
                    val massas = massasDaySource?.reportDay(date)
                    val receipts = repository.receipts(date)
                    _state.update {
                        it.copy(
                            isSyncingErp = false,
                            massasDay = massas ?: it.massasDay,
                            receipts = receipts ?: it.receipts,
                            message = UiText.of(R.string.report_erp_sync_success),
                            messageIsError = false,
                        )
                    }
                }
                is AeroSyncOutcome.Failed ->
                    _state.update {
                        it.copy(
                            isSyncingErp = false,
                            // The same sentence the table shows for the same problem: no plant Wi-Fi, the host
                            // not answering and the ERP refusing all read here exactly as they read there.
                            message = outcome.failure.describe(),
                            messageIsError = true,
                        )
                    }
            }
        }
    }

    /**
     * Switches one type of box off, dropping what the form had answered for it.
     *
     * The answers go with the switch rather than staying behind a disabled block: the body this form
     * builds sends one `items` entry per task, so a type left off with its products still selected would
     * be sent as if it had been marked, and the saved report would claim boxes the operator said were not
     * mounted. Switching it back on returns an empty block, which is what "this type was not used in this
     * report" has to look like on the way out.
     *
     * The category's own tasks are the ones dropped, found by `categoryId` on the task rather than by
     * position in the list, because a reload can serve the same categories in another order.
     */
    fun onBoxTypeChange(categoryId: Int, enabled: Boolean) =
        _state.update { current ->
            if (enabled) {
                current.copy(disabledBoxTypeIds = current.disabledBoxTypeIds - categoryId)
            } else {
                val dropped = current.formCategories
                    .asSequence()
                    .filter { it.id == categoryId }
                    .flatMap { it.tasks }
                    .map { it.id }
                    .toSet()
                current.copy(
                    disabledBoxTypeIds = current.disabledBoxTypeIds + categoryId,
                    checks = current.checks - dropped,
                    selectedProducts = current.selectedProducts - dropped,
                    temperatures = current.temperatures - dropped,
                )
            }
        }

    fun onCheckChange(taskId: Int, checked: Boolean) =
        _state.update { it.copy(checks = it.checks + (taskId to checked)) }

    fun onProductToggle(taskId: Int, product: String, selected: Boolean) =
        _state.update { current ->
            val currentSet = current.selectedProducts[taskId].orEmpty()
            val updated = if (selected) currentSet + product else currentSet - product
            current.copy(selectedProducts = current.selectedProducts + (taskId to updated))
        }

    fun onTemperatureChange(taskId: Int, index: Int, value: String) =
        _state.update { current ->
            val readings = current.temperatures[taskId].orEmpty().toMutableList()
            while (readings.size <= index) readings.add("")
            readings[index] = value
            current.copy(temperatures = current.temperatures + (taskId to readings))
        }

    /**
     * Sends the report.
     *
     * The body itself is built by [reportItems] and [reportTemperatures], which the report's edit screen
     * submits through as well: the server validates both bodies against one schema, so the rules that
     * turn a filled form into the wire shape have one home and not two. What stays here is what the two
     * surfaces do not share: the refusal sentences of this route and the id of the report it produced.
     *
     * Whether the readings are complete is decided before this function runs, by [UiState.canSubmit] and
     * through [missingTemperatureReadings]: the server refuses a body that does not carry every declared
     * reading, so the form cannot send one, and the sentence the operator reads about it is the screen's
     * rather than a 400 that came back after a request nobody could have answered. The rule is the
     * payload's own and not a second copy of it here, which is what keeps the client's idea of a complete
     * report and the body it builds from being two different things.
     */
    fun submit() {
        val current = state.value
        if (!current.ready || current.submitting) return
        if (current.missingReadings.isNotEmpty()) {
            _state.update { it.copy(showValidation = true) }
            return
        }
        _state.update { it.copy(submitting = true, message = null) }

        viewModelScope.launch {
            val tasksById = current.formCategories.flatMap { it.tasks }.associateBy { it.id }

            val result = repository.create(
                CreateReportRequest(
                    turno = current.turno?.let(::requestTurno),
                    // La misma expresión que la web y que la pantalla de edición: `notes.trim() || null`. Una
                    // nota que sólo tiene espacios va como null y no como cadena vacía, porque para el
                    // servidor no son lo mismo -- una cadena vacía es una nota cuyo texto está vacío, y null
                    // es no tener nota --, y guardar "" dejaría el reporte como si se hubiera respondido.
                    notes = current.notes.trim().ifEmpty { null },
                    items = reportItems(tasksById.values, current.checks, current.selectedProducts)
                        .takeIf { it.isNotEmpty() },
                    temperatures = reportTemperatures(tasksById.values, current.temperatures, String::toReading)
                        .takeIf { it.isNotEmpty() },
                ),
            )

            _state.update { previous ->
                when (result) {
                    is ReportWriteResult.Saved -> previous.copy(submitting = false, createdReportId = result.report.id)
                    is ReportWriteResult.Refused -> previous.copy(
                        submitting = false,
                        message = refusalMessage(result.statusCode, result.serverMessage),
                        messageIsError = true,
                    )
                    ReportWriteResult.Unreachable ->
                        previous.copy(
                            submitting = false,
                            message = UiText.of(R.string.report_error_offline),
                            messageIsError = true,
                        )
                }
            }
        }
    }

    /**
     * The request's turno enum, matched by its value.
     *
     * The generator emits a separate enum for every DTO that carries one, so the detected shift and
     * the request's own type are different classes with the same values and have to be mapped.
     */
    private fun requestTurno(detected: String): CreateReportRequest.Turno? =
        CreateReportRequest.Turno.entries.firstOrNull { it.value == detected }

    /**
     * What to say about a refusal: the server's own sentence when it sent one, and only otherwise this
     * client's reading of the status code.
     *
     * The order is the fix of a real misreporting. A 400 on this route is the payload being refused, and the
     * payload has more than one way to be refused -- a report already filed for that shift and day, a reading
     * set the server counted as incomplete, a constraint the transaction refused -- while this form used to
     * answer all of them with "fill in the temperatures", which it had itself checked before sending. The
     * server resolves its codes into the operator's language before answering, so a body with a sentence is
     * the truth and the reading below is only what is left when no sentence arrived.
     */
    private fun refusalMessage(statusCode: Int, serverMessage: String?): UiText = when {
        !serverMessage.isNullOrBlank() -> UiText.literal(serverMessage)
        // A report for that shift and day already exists; the server refuses a second one. The wording is the
        // server's own -- and the web's -- for the case where the refusal arrived with no body to read.
        statusCode == 409 -> UiText.of(R.string.report_error_already_exists)
        // The body failed validation and said nothing about it, which leaves the one part of the payload this
        // client builds and checks: a reading set it would not have sent without every reading.
        statusCode == 400 -> UiText.of(R.string.report_error_incomplete)
        else -> UiText.of(R.string.report_error_save_failed)
    }

    /**
     * A temperature task gets its slots up front, empty, so the form always shows as many inputs as
     * the task declares. Growing them as the operator types would let a partly filled form look
     * complete, which is the state an export refuses for a missing reading.
     */
    private fun initialReadings(categories: List<CategoriesResponseCategoriesInner>): Map<Int, List<String>> =
        categories
            .flatMap { it.tasks }
            .filter { it.taskType == ReportCategoryTasksInner.TaskType.temperature }
            .associate { task -> task.id to List(task.temperatureReadings) { "" } }
}
