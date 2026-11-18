package com.trindade.app.salida

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.contract.models.SalidaCreateResponseMovement
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
    val history: List<SalidaCreateResponseMovement> = emptyList(),
    val loading: Boolean = true,
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
}
