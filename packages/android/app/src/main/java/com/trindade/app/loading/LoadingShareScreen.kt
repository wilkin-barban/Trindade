package com.trindade.app.loading

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.R
import com.trindade.app.contract.models.DriversResponseDriversInner
import com.trindade.app.contract.models.SchedulesResponseSchedulesInner
import com.trindade.app.export.NoOpPdfGenerator
import com.trindade.app.export.NoOpShareManager
import com.trindade.app.export.PdfGenerator
import com.trindade.app.export.ShareManager
import com.trindade.app.ui.UiText
import com.trindade.app.ui.resolve
import com.trindade.app.ui.waMeLink
import com.trindade.app.ui.waMeNumber
import com.trindade.app.ui.components.NavigationActionButton
import com.trindade.app.ui.components.ShareCard
import com.trindade.app.ui.components.ShareCardMode
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * ViewModel for the read-only loading schedule share view opened from history.
 */
@HiltViewModel
class LoadingShareViewModel @Inject constructor(
    private val repository: LoadingRepository,
    private val shareManager: ShareManager = NoOpShareManager,
    private val pdfGenerator: PdfGenerator = NoOpPdfGenerator,
) : ViewModel() {

    data class UiState(
        val date: String = "",
        val loading: Boolean = false,
        val exportText: String? = null,
        val exportingPdf: Boolean = false,
        val message: UiText? = null,
        /** The day's own fleteros a chat can reach, in the order the day draws them. */
        val fleteros: List<DriversResponseDriversInner> = emptyList(),
        /**
         * Whether this day can still be corrected from here.
         *
         * Hoy y sólo hoy -- el pasado es el registro de lo que la planta hizo -- y sólo si el día se pudo leer
         * y su lote sigue activo, que es la misma regla con la que la grilla decide si acepta escrituras. Un día
         * que no se pudo leer no ofrece corregirse: no se sabe qué hay adentro.
         */
        val canEdit: Boolean = false,
        /**
         * The sentence a chat that could not be opened earns.
         *
         * Kept apart from [message] because that one replaces the day's text -- the card draws an error
         * *instead of* the message -- and a device unable to open WhatsApp has nothing to do with the
         * text the server rendered. The card still shows the schedule; this line only says the chat did
         * not open, so the operator can fix the number instead of believing it was sent.
         */
        val shareNote: UiText? = null,
    )

    /**
     * Hoy en São Paulo, sustituible en las pruebas.
     *
     * El pasado no se edita, así que esta pantalla tiene una regla que depende del calendario; pedir el día en
     * vez de capturarlo es lo que permite probar "hoy" y "ayer" sin que la prueba dependa del día en que corre.
     */
    private var today: () -> String = ::saoPauloToday

    internal constructor(
        repository: LoadingRepository,
        today: () -> String,
    ) : this(repository) {
        this.today = today
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun load(date: String) {
        if (_state.value.loading && _state.value.date == date) return
        _state.update { it.copy(date = date, loading = true, message = null) }
        viewModelScope.launch {
            val text = repository.exportText(date)
            // The day and the fleet are read beside the text because this screen is where a schedule is
            // sent one to one: which fleteros a chat can reach is the day's own rows intersected with the
            // numbers the fleet has, and asking for them here keeps that question off the grid, which no
            // longer offers it. A failed side read costs the list, never the text: the card's job is the
            // message, and an error over it would hide the thing that did arrive.
            val drivers = repository.drivers().orEmpty()
            val day = repository.schedules(date)
            _state.update {
                it.copy(
                    loading = false,
                    exportText = text,
                    fleteros = fleterosWithPhone(day?.rows.orEmpty(), drivers),
                    canEdit = day != null && day.active && date == today(),
                    message = if (text == null) UiText.of(R.string.report_error_generic) else null,
                )
            }
        }
    }

    /**
     * Opens the one-on-one chat for [driver], carrying this day's own text.
     *
     * What goes out is the schedule the announcement sends, to the number the fleet has for that person.
     * The device being unable to open it is reported rather than left to look sent.
     */
    fun openWhatsAppFor(driver: DriversResponseDriversInner) {
        val text = state.value.exportText ?: return
        val link = waMeLink(driver.phone.orEmpty(), text) ?: return
        _state.update { it.copy(shareNote = null) }
        if (!shareManager.openLink(link)) {
            _state.update { it.copy(shareNote = UiText.of(R.string.loading_whatsapp_unavailable)) }
        }
    }

    fun shareExport() {
        val text = state.value.exportText ?: return
        shareManager.shareText(text)
    }

    fun sharePdf() {
        val text = state.value.exportText ?: return
        if (state.value.exportingPdf) return
        _state.update { it.copy(exportingPdf = true, message = null) }
        viewModelScope.launch {
            try {
                val file = pdfGenerator.generate(text, "horario-${state.value.date}.pdf")
                shareManager.sharePdf(file)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _state.update { it.copy(message = UiText.of(R.string.report_error_generic)) }
            } finally {
                _state.update { it.copy(exportingPdf = false) }
            }
        }
    }
}

/**
 * The day's own fleteros whose number is known, each one once, in the order the day draws them.
 *
 * Built from the day rather than from the fleet: a schedule sent to a driver who is not on it is a
 * message about a day that does not concern them. Which driver is a fletero on a given day is the day's
 * own row that says it -- the fleet record is where the number lives, not where the day's use of them is
 * decided -- and a driver whose number nobody has yet has no chat to open, so they are not offered until
 * that field is filled. The number is the one a link can actually use.
 *
 * It lives here rather than on the grid's state because this screen is where the list is drawn now: one
 * function for one question, so the card and the day can never disagree about who was offered.
 */
internal fun fleterosWithPhone(
    schedules: List<SchedulesResponseSchedulesInner>,
    drivers: List<DriversResponseDriversInner>,
): List<DriversResponseDriversInner> {
    val byId = drivers.associateBy { it.id }
    return schedules
        .filter { it.driverType == SchedulesResponseSchedulesInner.DriverType.fletero }
        .mapNotNull { it.driverId }
        .distinct()
        .mapNotNull { byId[it] }
        .filter { waMeNumber(it.phone.orEmpty()).isNotEmpty() }
}

/**
 * Read-only share view for a closed loading schedule day opened from history.
 */
@Composable
fun LoadingShareScreen(
    date: String,
    state: LoadingShareViewModel.UiState,
    onShare: () -> Unit,
    onPdf: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    /** El día que se acaba de cerrar ofrece Editar; el histórico de un día pasado, no. */
    mode: ShareCardMode = ShareCardMode.FROM_HISTORY,
    onEdit: (() -> Unit)? = null,
    onOpenWhatsApp: (DriversResponseDriversInner) -> Unit = {},
) {
    Column(
        modifier = modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // La vuelta es una barra de la pantalla, no una píldora dentro de la tarjeta: el título y la fecha del
        // mensaje quedan solos en su cabecera. El día recién guardado no la tiene: su salida es «Cerrar».
        if (mode != ShareCardMode.SAVED) {
            NavigationActionButton(
                onClick = onBack,
                text = stringResource(R.string.share_card_back),
                modifier = Modifier.testTag("loading-share-back"),
            )
        }

        // Los fleteros con teléfono, en su propia sección acotada: el mensaje y sus acciones siguen a la vista.
        LoadingFleterosSection(fleteros = state.fleteros, onOpenWhatsApp = onOpenWhatsApp)

        state.shareNote?.let { note ->
            Text(
                text = note.resolve(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        ShareCard(
            title = stringResource(R.string.loading_title),
            // El día que anuncia el texto, no el del lote: el export se pide por la fecha del lote y su primera
            // línea fecha el cargamento. Sin esto la tarjeta decía 18/11 arriba y 19/11 en el texto que muestra.
            subtitle = com.trindade.app.massas.brazilianDate(exportLoadingDay(date)),
            text = state.exportText,
            loading = state.loading,
            error = state.message,
            mode = mode,
            onShare = onShare,
            onPdf = onPdf,
            // El día recién cerrado siempre se corrige; el que se abrió del historial, sólo si es hoy y el día
            // sigue activo. Lo decide el ViewModel porque es un hecho del día, no de la tarjeta.
            onEdit = if (mode == ShareCardMode.SAVED || state.canEdit) onEdit else null,
            onClose = onBack,
            // La vuelta ya está arriba, en la barra de la pantalla.
            showHeaderBack = false,
            modifier = Modifier.fillMaxWidth().weight(1f, fill = false),
        )
    }
}

@Composable
fun LoadingShareRoute(
    date: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    mode: ShareCardMode = ShareCardMode.FROM_HISTORY,
    onEdit: (() -> Unit)? = null,
    viewModel: LoadingShareViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(date) {
        viewModel.load(date)
    }

    LoadingShareScreen(
        date = date,
        state = state,
        onShare = viewModel::shareExport,
        onPdf = viewModel::sharePdf,
        onBack = onBack,
        modifier = modifier,
        mode = mode,
        onEdit = onEdit,
        onOpenWhatsApp = viewModel::openWhatsAppFor,
    )
}
