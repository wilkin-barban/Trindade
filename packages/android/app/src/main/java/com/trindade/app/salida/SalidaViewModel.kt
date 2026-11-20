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
            val day = runCatching { repository.day(_state.value.date) }.getOrDefault(emptyList())
            val history = runCatching { repository.history() }.getOrDefault(emptyList())
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

            val outcome = repository.sendToErp(movement, username)
            _state.value = _state.value.copy(
                submitting = false,
                quantities = emptyMap(),
                day = runCatching { repository.day(_state.value.date) }.getOrDefault(_state.value.day),
                history = runCatching { repository.history() }.getOrDefault(_state.value.history),
                notice = SalidaNotice(outcome.message(), isError = outcome is SalidaErpOutcome.Failed),
            )
        }
    }

    fun retryPending(username: String?) {
        viewModelScope.launch {
            val outcome = repository.retryPending()
            _state.value = _state.value.copy(
                history = runCatching { repository.history() }.getOrDefault(_state.value.history),
                notice = SalidaNotice(outcome.message(), isError = outcome is SalidaErpOutcome.Failed),
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

    /** Elige el día que el histórico muestra; null es hoy. */
    fun selectHistoryDate(date: String?) {
        _state.value = _state.value.copy(historyDate = date)
    }

    /** Pasa de «hoy más cinco» a todas las fechas, y vuelve. */
    fun toggleHistoryAll() {
        _state.value = _state.value.copy(historyAll = !_state.value.historyAll)
    }
}
