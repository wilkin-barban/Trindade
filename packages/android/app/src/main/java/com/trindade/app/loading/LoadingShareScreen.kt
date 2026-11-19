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
         * The sentence a chat that could not be opened earns.
         *
         * Kept apart from [message] because that one replaces the day's text -- the card draws an error
         * *instead of* the message -- and a device unable to open WhatsApp has nothing to do with the
         * text the server rendered. The card still shows the schedule; this line only says the chat did
         * not open, so the operator can fix the number instead of believing it was sent.
         */
        val shareNote: UiText? = null,
    )

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
            val schedules = repository.schedules(date)?.rows.orEmpty()
            _state.update {
                it.copy(
                    loading = false,
                    exportText = text,
                    fleteros = fleterosWithPhone(schedules, drivers),
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
        // Los fleteros con teléfono del día van con el share general, y no en la grilla: es la misma lista
        // -- el texto que sale al grupo, uno a uno a quien lo carga -- y su lugar es la pantalla del día
        // ya cerrado, donde el envío es lo único que queda por hacer. Una lista vacía es un día sin
        // fleteros con número, no un fallo, y por eso no ocupa lugar. `FlowRow` y no una columna: los
        // nombres vienen del plantel y no de una lista fija, y dos fleteros tienen que poder distinguirse
        // sin robarse la línea.
        if (state.fleteros.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = stringResource(R.string.export_send_to_fletero),
                    style = MaterialTheme.typography.labelLarge,
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.fleteros.forEach { driver ->
                        NavigationActionButton(
                            onClick = { onOpenWhatsApp(driver) },
                            text = driver.name,
                        )
                    }
                }
                state.shareNote?.let { note ->
                    Text(
                        text = note.resolve(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
        ShareCard(
            title = stringResource(R.string.loading_title),
            // El día tal como lo escribe la planta, no el ISO del parámetro de navegación.
            subtitle = com.trindade.app.massas.brazilianDate(date),
            text = state.exportText,
            loading = state.loading,
            error = state.message,
            mode = mode,
            onShare = onShare,
            onPdf = onPdf,
            onEdit = onEdit,
            onClose = onBack,
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
