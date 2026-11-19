package com.trindade.app.loading

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import com.trindade.app.export.NoOpPdfGenerator
import com.trindade.app.export.NoOpShareManager
import com.trindade.app.export.PdfGenerator
import com.trindade.app.export.ShareManager
import com.trindade.app.ui.UiText
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
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun load(date: String) {
        if (_state.value.loading && _state.value.date == date) return
        _state.update { it.copy(date = date, loading = true, message = null) }
        viewModelScope.launch {
            val text = repository.exportText(date)
            _state.update {
                it.copy(
                    loading = false,
                    exportText = text,
                    message = if (text == null) UiText.of(R.string.report_error_generic) else null,
                )
            }
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
) {
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
        modifier = modifier.fillMaxSize().padding(16.dp),
    )
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
    )
}
