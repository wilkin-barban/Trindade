package com.trindade.app.massas

import com.trindade.app.R
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trindade.app.network.MassaHistoryDay
import com.trindade.app.ui.UiText
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class MassasHistoryViewModel @Inject constructor(
    private val repository: MassasRepository,
) : ViewModel() {

    data class UiState(
        val days: List<MassaHistoryDay> = emptyList(),
        val isLoading: Boolean = false,
        val errorMessage: UiText? = null,
        val showHelpDialog: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        loadHistory()
    }

    fun loadHistory() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            val result = repository.history()
            // `update` and not `_state.value = _state.value.copy(...)`: the read and the write are one
            // atomic step, so a toggle that lands while this load is in flight is not overwritten by a
            // snapshot taken before it. The two fields belong to different events and must compose.
            _state.update {
                it.copy(
                    isLoading = false,
                    days = result ?: emptyList(),
                    errorMessage = if (result == null) UiText.of(R.string.massas_history_error_load) else null,
                )
            }
        }
    }

    fun toggleHelpDialog(show: Boolean) {
        _state.update { it.copy(showHelpDialog = show) }
    }
}
