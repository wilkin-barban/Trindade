package com.trindade.app.salida

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaHistoryResponseDaysInner
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** El estado de la pantalla de baja. */
data class SalidaUiState(
    val date: String = "",
    val products: List<SalidaCatalog.Product> = SalidaCatalog.products,
    val quantities: Map<String, String> = emptyMap(),
    val activeBlocks: Set<String> = SalidaCatalog.blocks.toSet(),
    val confirmOpen: Boolean = false,
    val submitting: Boolean = false,
    val notice: SalidaNotice? = null,
    val day: List<SalidaCreateResponseMovement> = emptyList(),
    /** Los días del histórico, del más nuevo al más viejo, como los manda el servidor. */
    val history: List<SalidaHistoryResponseDaysInner> = emptyList(),
    /** La fecha elegida en el histórico; null es «hoy», que es donde la pantalla abre. */
    val historyDate: String? = null,
    /** Si el histórico muestra todas las fechas en vez de hoy más las cinco anteriores. */
    val historyAll: Boolean = false,
    /** El teléfono al que se manda el día; se recuerda mientras la pantalla vive. */
    val historyPhone: String = "",
    val loading: Boolean = true,
    /**
     * Las salidas que el ERP registró para el día elegido, como las muestra el Relatório: espejo más lanzamientos
     * locales, con el operario y su marca de `erpOnly`. Se lee del servidor; esta pantalla no lanza nada.
     */
    val salidaDay: com.trindade.app.contract.models.SalidaReportDayView? = null,
    /** Una sincronización del espejo en vuelo, para que el botón no se apriete dos veces. */
    val erpSyncing: Boolean = false,
    /** Lo que dijo el ERP o la falta de credenciales, para leerlo debajo del botón. */
    val erpError: com.trindade.app.ui.UiText? = null,
    /** La hora de la última lectura del espejo para el día elegido, como la muestra el archivo de Masas. */
    val lastSyncedAt: String? = null,
    /** El movimiento que espera la confirmación de borrado, o null cuando no hay nada que confirmar. */
    val deleteCandidate: SalidaCreateResponseMovement? = null,
    /** Si la cuenta puede retirar el borrador: el servidor lo vuelve a decidir, esto sólo evita ofrecer lo negado. */
    val canDeleteMovements: Boolean = false,
) {
    /** Lo que la baja va a mandar: sólo los productos de los bloques activos, con una cantidad válida. */
    val selection: SalidaSelection
        get() = SalidaSelection(
            products
                .filter { it.block in activeBlocks }
                .mapNotNull { product ->
                    val quantity = SalidaCatalog.quantity(quantities[product.code].orEmpty())
                    if (quantity > 0) SalidaLine(product.code, quantity) else null
                },
        )

    val hasShareableData: Boolean get() = day.isNotEmpty()
}

/** Un aviso para el operario: lo que pasó, sin códigos. */
data class SalidaNotice(val message: String, val isError: Boolean)

/**
 * La baja, como la entiende la pantalla.
 *
 * La selección se deriva del estado -- cantidades, bloques activos y catálogo -- en vez de guardarse aparte: dos
 * fuentes para lo mismo es cómo la barra de abajo termina diciendo un total que el envío no manda.
 */
@HiltViewModel
class SalidaViewModel @Inject constructor(
    private val repository: SalidaRepository,
    // El bloque de salidas del día vive en el Relatório, y su lectura y su sync son los mismos de esta pantalla.
    private val reportsRepository: com.trindade.app.reports.ReportsRepository? = null,
    private val aeroDispatcher: com.trindade.app.aero.AeroDispatcher? = null,
    private val aeroSettingsStore: com.trindade.app.aero.AeroSettingsPort? = null,
    // La tabla aprobada del WhatsApp viaja con el mensaje: un share con nombres completos sería otro mensaje.
    private val abbreviationsSource: com.trindade.app.massas.WhatsappAbbreviationsSource? = null,
    // La compresión es la misma del Relatório: una foto de cámara no viaja a tamaño completo por la red de planta.
    private val compressor: com.trindade.app.reports.PhotoCompressor? = null,
    // El share general lleva las fotos: la hoja del sistema puede adjuntarlas, y la web ya lo hace. Sin esta
    // costura no se bajan y el mensaje sale solo, como antes.
    private val shareManager: com.trindade.app.export.ShareManager? = null,
    private val photoFiles: com.trindade.app.reports.ReportPhotoFiles? = null,
) : ViewModel() {

    private val _state = MutableStateFlow(SalidaUiState(date = saoPauloDate()))
    val state: StateFlow<SalidaUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            val products = repository.catalog()
            val day = runCatching { repository.day(_state.value.date) }.getOrDefault(_state.value.day)
            val history = runCatching { repository.history() }.getOrDefault(_state.value.history)
            _state.value = _state.value.copy(
                products = products,
                day = day,
                history = history,
                loading = false,
            )
        }
    }

    fun setQuantity(code: String, raw: String) {
        // Sólo dígitos: el campo acepta lo que el operario escribe y esta es la puerta que lo hace una cantidad.
        val digits = raw.filter { it.isDigit() }.take(4)
        _state.value = _state.value.copy(
            quantities = _state.value.quantities + (code to digits),
            notice = null,
        )
    }

    fun toggleBlock(block: String) {
        val active = _state.value.activeBlocks
        _state.value = _state.value.copy(
            activeBlocks = if (block in active) active - block else active + block,
            notice = null,
        )
    }

    /** Abrir la confirmación es el primer paso; nada sale hasta que el operario confirma. */
    fun requestLaunch() {
        val selection = _state.value.selection
        if (selection.isEmpty) {
            _state.value = _state.value.copy(
                notice = SalidaNotice("Agregá al menos un producto con cantidad.", isError = true),
            )
            return
        }
        _state.value = _state.value.copy(confirmOpen = true, notice = null)
    }

    fun dismissConfirmation() {
        _state.value = _state.value.copy(confirmOpen = false)
    }

    /** Confirmar: primero Trindade, después el ERP. */
    fun confirmLaunch(username: String?) {
        val selection = _state.value.selection
        _state.value = _state.value.copy(confirmOpen = false, submitting = true, notice = null)
        viewModelScope.launch {
            val created = repository.create(selection)
            val movement = created.getOrNull()
            if (movement == null) {
                _state.value = _state.value.copy(
                    submitting = false,
                    notice = SalidaNotice("No se pudo registrar la baja. Probá de nuevo.", isError = true),
                )
                return@launch
            }

            // El viaje al ERP tiene tiempo máximo y la pantalla se libera siempre: el movimiento ya está en
            // Trindade, así que lo que se pierde es el viaje, no la baja.
            try {
                when (val trip = com.trindade.app.aero.withErpTimeout { repository.sendToErp(movement, username) }) {
                    is com.trindade.app.aero.ErpTrip.Done -> {
                        val outcome = trip.value
                        _state.value = _state.value.copy(
                            quantities = emptyMap(),
                            notice = SalidaNotice(outcome.message(), isError = !salidaErpOutcomeSucceeded(outcome)),
                        )
                    }
                    com.trindade.app.aero.ErpTrip.TimedOut ->
                        _state.value = _state.value.copy(
                            quantities = emptyMap(),
                            notice = SalidaNotice(
                                "El ERP no respondió a tiempo. La salida quedó registrada en Trindade y pendiente para reenvío.",
                                isError = true,
                            ),
                        )
                    is com.trindade.app.aero.ErpTrip.Failed ->
                        _state.value = _state.value.copy(
                            quantities = emptyMap(),
                            notice = SalidaNotice(
                                "El ERP no respondió a tiempo. La salida quedó registrada en Trindade y pendiente para reenvío.",
                                isError = true,
                            ),
                        )
                }
            } finally {
                _state.value = _state.value.copy(
                    submitting = false,
                    day = runCatching { repository.day(_state.value.date) }.getOrDefault(_state.value.day),
                    history = runCatching { repository.history() }.getOrDefault(_state.value.history),
                )
            }
        }
    }

    fun retryPending(username: String?) {
        viewModelScope.launch {
            val outcome = repository.retryPending()
            _state.value = _state.value.copy(
                history = runCatching { repository.history() }.getOrDefault(_state.value.history),
                notice = SalidaNotice(outcome.message(), isError = !salidaErpOutcomeSucceeded(outcome)),
            )
        }
    }

    private fun SalidaErpOutcome.message(): String = when (this) {
        is SalidaErpOutcome.Complete -> "Baja registrada y enviada al ERP ($documents productos)."
        is SalidaErpOutcome.Partial -> "Baja registrada. El ERP recibió $sent y rechazó $failed."
        is SalidaErpOutcome.Failed -> "Baja registrada en Trindade. El ERP no la recibió: queda pendiente."
        SalidaErpOutcome.NotConfigured -> "Baja registrada en Trindade. Falta el acceso al ERP para enviarla."
        SalidaErpOutcome.Skipped -> "Baja registrada en Trindade."
    }

    companion object {
        /** La fecha de planta: São Paulo, nunca la del teléfono. */
        fun saoPauloDate(now: Date = Date()): String {
            val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            format.timeZone = TimeZone.getTimeZone("America/Sao_Paulo")
            return format.format(now)
        }
    }

    /**
     * Sube una foto a un movimiento y refresca el histórico.
     *
     * La foto se comprime antes de llegar acá, y el histórico se vuelve a leer después: la tarjeta muestra lo que
     * el servidor guardó, no lo que la pantalla creía que había guardado.
     */
    fun attachPhoto(movementId: Int, jpeg: ByteArray) {
        viewModelScope.launch {
            val saved = repository.attachPhoto(movementId, jpeg)
            _state.value = _state.value.copy(
                notice = if (saved) {
                    SalidaNotice("Foto guardada.", isError = false)
                } else {
                    SalidaNotice("No se pudo guardar la foto.", isError = true)
                },
            )
            if (saved) refreshHistory()
        }
    }

    /** Comprime y sube una foto elegida en la galería, por su ruta local. */
    fun attachPhotoFromPath(movementId: Int, path: String) {
        val engine = compressor ?: return
        viewModelScope.launch {
            val jpeg = engine.compressToJpeg(path) ?: run {
                _state.value = _state.value.copy(notice = SalidaNotice("No se pudo leer la foto.", isError = true))
                return@launch
            }
            attachPhoto(movementId, jpeg)
        }
    }

    /** Borra una foto del movimiento. */
    fun deletePhoto(photoId: Int) {
        viewModelScope.launch {
            val removed = repository.deletePhoto(photoId)
            if (removed) refreshHistory()
            else _state.value = _state.value.copy(notice = SalidaNotice("No se pudo borrar la foto.", isError = true))
        }
    }

    private suspend fun refreshHistory() {
        val days = runCatching { repository.history() }.getOrDefault(_state.value.history)
        _state.value = _state.value.copy(history = days)
    }

    /**
     * El texto del día elegido, listo para el share. Vacío cuando el día no tiene movimientos.
     *
     * Las etiquetas llegan de la pantalla -- es quien sabe en qué idioma está la app -- y por defecto son las del
     * portugués, que es la tabla de la web.
     */
    fun dayShareText(labels: SalidaSummaryLabels = SalidaSummaryLabels()): String {
        val chosen = _state.value.historyDate ?: _state.value.date
        val day = _state.value.history.firstOrNull { it.date == chosen }
        // El día del archivo puede faltar y el ERP tener asientos igual: se arma el texto con lo que haya.
        val erp = _state.value.salidaDay?.takeIf { _state.value.salidaDay?.date == chosen }?.operators.orEmpty()
        if (day == null && erp.none { operator -> operator.products.any { it.units > 0 } }) return ""
        return salidaDaySummaryText(
            date = day?.date ?: chosen,
            movements = day?.movements.orEmpty(),
            abbreviations = abbreviationsSource?.table ?: com.trindade.app.massas.WhatsappAbbreviations.EMPTY,
            labels = labels,
            erpOperators = erp,
        )
    }

    /**
     * Lee del servidor las salidas del día elegido, sin tocar Trindade ni el ERP.
     *
     * Es la misma lectura que alimenta el bloque de Salidas del Relatório (`reportsRepository.salidaDay`), y trae
     * lo que el ERP registró más lo que se lanzó aquí. Se llama al abrir el día de hoy.
     */
    fun loadSalidaDay(date: String) {
        val reports = reportsRepository ?: return
        viewModelScope.launch {
            val day = runCatching { reports.salidaDay(date) }.getOrNull()
            _state.value = _state.value.copy(
                // Una lectura que falla no borra el día que ya estaba en pantalla, y no reclama un error si hay
                // datos válidos: el operario sigue leyendo lo que tenía y el fallo es de la última lectura.
                salidaDay = day ?: _state.value.salidaDay,
                erpError = if (day == null && _state.value.salidaDay == null) {
                    com.trindade.app.ui.UiText.of(com.trindade.app.R.string.report_salida_read_error)
                } else {
                    null
                },
                lastSyncedAt = aeroSettingsStore?.syncedAt(date) ?: _state.value.lastSyncedAt,
            )
        }
    }

    /**
     * Trae del ERP los movimientos de salida del día, incluidos los que lanzaron otros usuarios.
     *
     * Es el mismo viaje del Relatório: `syncDay(..., includeExits = true)` lee los dos lados del día y deja el
     * espejo listo; después se relee el bloque del servidor. No escribe nada en Trindade -- sólo el espejo y la
     * marca de última sincronización, como la lectura del Relatório.
     */
    fun syncSalidaDay() {
        if (_state.value.erpSyncing) return
        val dispatcher = aeroDispatcher
        val store = aeroSettingsStore
        val reports = reportsRepository
        val date = _state.value.historyDate ?: _state.value.date
        if (dispatcher == null || store == null || reports == null) {
            _state.value = _state.value.copy(erpError = com.trindade.app.ui.UiText.of(com.trindade.app.R.string.report_erp_not_configured))
            return
        }
        viewModelScope.launch {
            val settings = store.load()
            if (!settings.ready) {
                _state.value = _state.value.copy(erpError = com.trindade.app.ui.UiText.of(com.trindade.app.R.string.report_erp_not_configured))
                return@launch
            }
            _state.value = _state.value.copy(erpSyncing = true, erpError = null)
            when (val outcome = dispatcher.syncDay(settings, date, includeExits = true)) {
                is com.trindade.app.aero.AeroSyncOutcome.Synced -> {
                    store.markSynced(date, com.trindade.app.massas.MassasLaunchViewModel.nowLabel())
                    val day = runCatching { reports.salidaDay(date) }.getOrNull()
                    _state.value = _state.value.copy(
                        erpSyncing = false,
                        lastSyncedAt = store.syncedAt(date),
                        salidaDay = day ?: _state.value.salidaDay,
                        erpError = if (day == null) {
                            com.trindade.app.ui.UiText.of(com.trindade.app.R.string.report_salida_read_error)
                        } else {
                            null
                        },
                    )
                }
                is com.trindade.app.aero.AeroSyncOutcome.Failed ->
                    _state.value = _state.value.copy(erpSyncing = false, erpError = outcome.failure.describe())
            }
        }
    }

    fun onHistoryPhoneChange(phone: String) {
        _state.value = _state.value.copy(historyPhone = phone)
    }

    /** El enlace del día elegido: con teléfono abre ese chat; sin teléfono deja elegir el chat. */
    fun historyWhatsAppLink(labels: SalidaSummaryLabels = SalidaSummaryLabels()): String? {
        val text = dayShareText(labels)
        if (text.isBlank()) return null
        return com.trindade.app.ui.waMeLink(_state.value.historyPhone, text)
            ?: com.trindade.app.ui.whatsAppShareLink(text)
    }

    /**
     * Un movimiento está pendiente cuando el ERP no lo aceptó: o nunca se intentó, o el viaje falló.
     *
     * Reconciliado y parcial no se reenvían: el asiento ya existe en la empresa y reintentar duplicaría la baja.
     */
    fun isPending(movement: com.trindade.app.contract.models.SalidaCreateResponseMovement): Boolean {
        val erp = movement.erp?.status?.value?.lowercase()
        val reconciliation = movement.reconciliation.status.value.lowercase()
        if (reconciliation == "reconciled" || reconciliation == "partial") return false
        return erp == null || erp == "failed"
    }

    /** Los pendientes del día elegido, que es lo que la cabecera cuenta. */
    fun pendingCount(): Int {
        val chosen = _state.value.historyDate ?: _state.value.date
        val day = _state.value.history.firstOrNull { it.date == chosen } ?: return 0
        return day.movements.count { isPending(it) }
    }

    /** Reenvía la cola al ERP con el mismo cliente que usa el lanzamiento. */
    /** Lo que el operario acaba de leer: se cierra solo cuando él lo cierra. */
    fun dismissNotice() {
        _state.value = _state.value.copy(notice = null)
    }

    /** El error del espejo también es una ventana: se explica una vez, no debajo de un botón. */
    fun dismissErpError() {
        _state.value = _state.value.copy(erpError = null)
    }

    /** Pide confirmación para retirar un borrador; el servidor decide si se puede. */
    fun requestDeleteMovement(movement: SalidaCreateResponseMovement) {
        _state.value = _state.value.copy(deleteCandidate = movement, notice = null)
    }

    fun cancelDeleteMovement() {
        _state.value = _state.value.copy(deleteCandidate = null)
    }

    /**
     * Retira el borrador confirmado y vuelve a leer el día.
     *
     * La tarjeta se va sola porque el día se recarga; el mensaje -- el del servidor cuando rechaza, el propio
     * cuando borra -- se dice en una ventana, no en un cartel dentro de la lista.
     */
    fun confirmDeleteMovement() {
        val movement = _state.value.deleteCandidate ?: return
        _state.value = _state.value.copy(deleteCandidate = null)
        viewModelScope.launch {
            when (val outcome = repository.deleteMovement(movement.id)) {
                is SalidaDeleteOutcome.Deleted -> {
                    // La baja es optimista: la tarjeta sale del estado antes de la recarga, para que el modal de
                    // éxito se lea sobre la lista que ya no la tiene. Si la recarga falla, la eliminación se
                    // conserva (refresh ya no reemplaza con una lista vacía).
                    _state.value = _state.value.withoutMovement(movement.id).copy(
                        notice = SalidaNotice("Movimento excluído.", isError = false),
                    )
                    refresh()
                }
                is SalidaDeleteOutcome.Failed ->
                    _state.value = _state.value.copy(notice = SalidaNotice(outcome.message, isError = true))
            }
        }
    }

    fun resendPending() {
        viewModelScope.launch {
            val outcome = repository.retryPending()
            _state.value = _state.value.copy(
                notice = SalidaNotice(
                    if (outcome is SalidaErpOutcome.Failed) "Reenvío con fallas: ${outcome.message}" else "Reenvío completado.",
                    isError = outcome is SalidaErpOutcome.Failed,
                ),
            )
            refreshHistory()
        }
    }

    /** Las fotos del día elegido, con la misma regla que la miniatura: `publicUrl` y si no `url`. */
    fun daySharePhotoUrls(): List<String> {
        val chosen = _state.value.historyDate ?: _state.value.date
        return salidaSharePhotoUrls(_state.value.history.firstOrNull { it.date == chosen })
    }

    /**
     * Comparte el día con sus fotos en la hoja del sistema.
     *
     * Devuelve false cuando no hay fotos o no hay con qué bajarlas: la pantalla cae entonces al enlace de siempre.
     */
    fun shareDayWithPhotos(labels: SalidaSummaryLabels = SalidaSummaryLabels()): Boolean {
        val text = dayShareText(labels)
        val urls = daySharePhotoUrls()
        val manager = shareManager ?: return false
        val downloader = photoFiles ?: return false
        if (text.isBlank() || urls.isEmpty()) return false
        viewModelScope.launch { shareSalidaWithPhotos(text, urls, manager, downloader) }
        return true
    }

    /** El enlace de WhatsApp de un movimiento suelto: su texto, con o sin teléfono. */
    fun movementShareLink(
        movement: com.trindade.app.contract.models.SalidaCreateResponseMovement,
        labels: SalidaSummaryLabels = SalidaSummaryLabels(),
    ): String {
        val text = salidaDaySummaryText(
            date = movement.movementDate,
            movements = listOf(movement),
            abbreviations = abbreviationsSource?.table ?: com.trindade.app.massas.WhatsappAbbreviations.EMPTY,
            labels = labels,
        )
        return com.trindade.app.ui.waMeLink(_state.value.historyPhone, text)
            ?: com.trindade.app.ui.whatsAppShareLink(text)
            ?: ""
    }

    /**
     * Elige el día que el histórico muestra; null es hoy.
     *
     * Cambiar de día relee el archivo en vez de confiar en la copia en memoria: lo que la web (u otro teléfono)
     * lanzó mientras esta pantalla estaba abierta tiene que aparecer al elegir la fecha.
     */
    fun selectHistoryDate(date: String?) {
        _state.value = _state.value.copy(historyDate = date)
        refreshHistoryFromServer()
    }

    /**
     * Relee el archivo del servidor, conservando lo que ya se ve si la lectura falla.
     *
     * Al entrar al histórico y al volver a la app: una lectura de la apertura dejaba el archivo congelado y una
     * salida creada desde la web sólo aparecía tras reiniciar la app.
     */
    fun refreshHistoryFromServer() {
        viewModelScope.launch { refreshHistory() }
    }

    /** Pasa de «hoy más cinco» a todas las fechas, y vuelve. */
    fun toggleHistoryAll() {
        _state.value = _state.value.copy(historyAll = !_state.value.historyAll)
    }
}

/** Sin el movimiento en ningún día: lo que la pantalla dibuja después de una baja confirmada. */
internal fun SalidaUiState.withoutMovement(movementId: Int): SalidaUiState = copy(
    day = day.filterNot { it.id == movementId },
    history = history.map { day -> day.copy(movements = day.movements.filterNot { it.id == movementId }) },
)

/**
 * Si el viaje al ERP terminó bien.
 *
 * Sólo `Complete` lo es. Que la baja se haya guardado en Trindade no convierte en éxito un envío que no ocurrió:
 * `NotConfigured` y `Skipped` son un pendiente -- el ERP nunca lo recibió -- y `Partial` dejó productos afuera. El
 * tono de la ventana cuenta lo que pasó con la planta, no lo que pasó con el teléfono.
 */
internal fun salidaErpOutcomeSucceeded(outcome: SalidaErpOutcome): Boolean = outcome is SalidaErpOutcome.Complete

/** Las fotos que acompañan al mensaje del día, con la regla de la miniatura: `publicUrl` y si no `url`. */
internal fun salidaSharePhotoUrls(
    day: com.trindade.app.contract.models.SalidaHistoryResponseDaysInner?,
): List<String> = day?.movements.orEmpty()
    .flatMap { movement -> movement.photos }
    .mapNotNull { photo -> photo.publicUrl ?: photo.url }
    .filter { it.isNotBlank() }

/**
 * Baja las fotos y abre la hoja del sistema con el texto.
 *
 * Si ninguna llegó, el mensaje sale solo: la acción no se pierde por una foto que el servidor no entregó. Devuelve
 * true cuando la hoja recibió archivos.
 */
internal suspend fun shareSalidaWithPhotos(
    text: String,
    urls: List<String>,
    shareManager: com.trindade.app.export.ShareManager,
    photoFiles: com.trindade.app.reports.ReportPhotoFiles,
): Boolean {
    if (text.isBlank() || urls.isEmpty()) return false
    val files = photoFiles.download(urls)
    return if (files.isEmpty()) {
        shareManager.shareText(text)
        false
    } else {
        shareManager.shareTextWithPhotos(text, files)
        true
    }
}
