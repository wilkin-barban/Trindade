package com.trindade.app.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.platform.testTag
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trindade.app.R
import com.trindade.app.ui.components.ActionResultDialog
import com.trindade.app.ui.resolve
import com.trindade.app.contract.models.UpdateReportRequest
import com.trindade.app.ui.components.AdminPrimaryButton
import com.trindade.app.ui.components.NavigationActionButton
import kotlinx.coroutines.flow.first

/**
 * The report edit screen, stateless.
 *
 * The form is not drawn here: it is `CategoryForm`, in `ReportForm.kt`, because the generator draws the
 * same form and the two would drift. That is not a cosmetic risk on this surface -- the save sends the
 * whole `items` array back, so a task this screen did not draw is a task the next save deletes. What
 * stays here is what the edit surface owns and the generator does not have: the shift and the notes,
 * which are fields of a stored report rather than answers the create asks for, plus the way back and the
 * save action.
 *
 * **Nothing here decides whether the report may be edited.** `state.readOnly` arrives already computed
 * by `ReportEditViewModel` from the report's own `readOnly` and `canEdit`, both of which are the
 * server's; the window (which day, which creator) lives in the backend, and a screen that recomputed it
 * would be a second implementation of a business rule -- the one a phone's clock and timezone get wrong.
 *
 * The scroll container is the screen's own, for the reason the form lane gives: this surface is taller
 * than a phone, and a node nobody can reach is not a control.
 */
@Composable
fun ReportEditScreen(
    state: ReportEditViewModel.UiState,
    onTurnoChange: (String) -> Unit,
    onNotesChange: (String) -> Unit,
    onCheckChange: (Int, Boolean) -> Unit,
    onProductToggle: (Int, String, Boolean) -> Unit,
    onTemperatureChange: (Int, Int, String) -> Unit,
    onBoxTypeChange: (Int, Boolean) -> Unit,
    onSubmit: () -> Unit,
    onAddPhotos: () -> Unit = {},
    onRemovePendingPhoto: (Int) -> Unit = {},
    onBack: () -> Unit,
    onDismissResult: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    // Built once, outside the category loop, for the reason the generator's own copy gives: the form
    // state is one value for the whole screen, and building it per category would hand each root a
    // different object for the same answers. The missing readings travel with it, so the temperature
    // block marks the fields the sentence below the form is about.
    val form = ReportFormState(
        checks = state.checks,
        temperatures = state.temperatures,
        selectedProducts = state.selectedProducts,
        offers = state.offers,
        disabledBoxTypeIds = state.disabledBoxTypeIds,
        missingReadings = state.missingReadings,
    )

    // El formulario scrollea y el guardado no: el mismo pie que el alta, para que Actualizar esté donde el
    // operario lo dejó aunque la lista de tareas sea larga.
    Column(modifier = modifier.fillMaxSize()) {
    Column(
        modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // The same way out the detail draws, with this screen's own title beside it: the two are one
        // row because back belongs to the screen whose heading it sits with.
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            NavigationActionButton(onClick = onBack, text = stringResource(R.string.report_back))
            Text(text = stringResource(R.string.report_edit), style = MaterialTheme.typography.titleLarge)
        }

        // The shift, as two chips. Exactly one of them is selected because the state holds one value:
        // `turno` is an enum on the wire and the view model seeds it from the report, so there is no
        // third answer and no "none" for this screen to draw. The values handed to `onTurnoChange` are
        // the request enum's own, which is also what the view model matches the body against -- the
        // report's enum is a second type for the same two shifts, and passing a value across from the
        // wrong one would leave the body without a `turno` at all.
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = state.turno == UpdateReportRequest.Turno.tarde.value,
                onClick = { onTurnoChange(UpdateReportRequest.Turno.tarde.value) },
                label = { Text(stringResource(R.string.history_turno_tarde)) },
                enabled = !state.readOnly,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            )
            FilterChip(
                selected = state.turno == UpdateReportRequest.Turno.noite.value,
                onClick = { onTurnoChange(UpdateReportRequest.Turno.noite.value) },
                label = { Text(stringResource(R.string.history_turno_noite)) },
                enabled = !state.readOnly,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            )
        }

        // Several lines because this is where an operator says what happened in prose, and a single line
        // would hide all but the first clause of it while they type.
        OutlinedTextField(
            value = state.notes,
            onValueChange = onNotesChange,
            label = { Text(stringResource(R.string.report_notes)) },
            minLines = 3,
            enabled = !state.readOnly,
            modifier = Modifier.fillMaxWidth(),
        )

        // Las fotos que el reporte va a llevar: la edición las pide igual que la creación.
        if (!state.readOnly) {
            ReportPhotosSection(
                pendingCount = state.pendingPhotos.size,
                onAddPhotos = onAddPhotos,
                onRemovePhoto = onRemovePendingPhoto,
            )
        }

        // Las salidas del día del reporte, con la misma tarjeta que el alta y el detalle.
        if (state.salidaDay != null) Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = stringResource(R.string.salida_report_block),
                style = MaterialTheme.typography.titleLarge,
            )
            SalidaReportCard(
                day = state.salidaDay,
                error = null,
                modifier = Modifier.testTag("report-salida-block"),
            )
        }

        // One form per root category, with its children filtered out of the same list the generator
        // serves them from: the endpoint sends one level, ordered `COALESCE(parent_category_id, id),
        // sort_order, id`, so a child belongs to the root whose id it names.
        state.categories.filter { it.parentCategoryId == null }.forEach { category ->
            CategoryForm(
                category = category,
                children = state.categories.filter { it.parentCategoryId == category.id },
                form = form,
                readOnly = state.readOnly,
                onCheckChange = onCheckChange,
                onProductToggle = onProductToggle,
                onTemperatureChange = onTemperatureChange,
                onBoxTypeChange = onBoxTypeChange,
            )
        }


        // D6, rendered: when the server says this report cannot be edited, the save is not drawn at all
        // -- not drawn disabled. A disabled action is still an offer, and it reads as one with a reason
        // to find; here there is nothing for the operator to find and nothing to fix, because the
        // boundary is the server's window and no edit from this screen can cross it. So the screen says
        // it by withholding the action, and the sentence explaining the window is the server's to send
        // through `state.message` if it ever wants to -- which is also why nothing here is a string.
        // The controls above are drawn disabled rather than left live, as the web draws its own
        // (`readOnly` reaches every input there too): a live field would collect an edit this screen has
        // no action to send.
        // Lo que falta para guardar no se escribe acá: se responde en la ventana de abajo, con las casillas
        // marcadas por su lado. Una frase dentro del formulario se pierde entre treinta controles.
    }

    if (!state.readOnly) {
        ReportSaveBar(
            // Se puede tocar con una lectura faltante: la pantalla contesta con su ventana qué falta, en vez de
            // dejar un botón apagado sobre un formulario incompleto.
            enabled = state.ready && !state.readOnly && !state.submitting && !state.saved,
            loading = state.submitting,
            label = stringResource(R.string.report_update),
            onSubmit = onSubmit,
        )
    }

        // La misma ventana que usa el Relatório nuevo: lo que el servidor responde y lo que esta pantalla ya sabe.
        val answer = state.message ?: state.validation?.resolve()
        if (answer != null) {
            ActionResultDialog(
                message = answer,
                isSuccess = false,
                onDismiss = onDismissResult,
            )
        }
    }
}

/**
 * The screen with its ViewModel attached.
 *
 * The load is keyed on the report, so arriving at one always reads it -- once per arrival, and not once
 * per recomposition.
 *
 * The save is reported by waiting for it rather than by keying an effect on the flag, and the reason is
 * this view model's scope: it is scoped to the activity's store, so it outlives this composition. A
 * `saved` flag left true by a previous visit would be read by the first composition of the next one, and
 * an effect keyed on it would close the screen before the load this arrival just asked for ever landed.
 * Waiting on the flow is what makes "a save" mean the write *this* arrival sent -- `load` clears the flag
 * for the same reason -- and it needs no assumption about the order two effects start in.
 */
@Composable
fun ReportEditRoute(
    reportId: Int,
    onBack: () -> Unit,
    onSaved: () -> Unit,
    viewModel: ReportEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val compressor = androidx.compose.runtime.remember { AndroidPhotoCompressor() }
    val pickPhotos = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia(MAX_PENDING_PHOTOS),
    ) { uris ->
        uris.take(MAX_PENDING_PHOTOS).forEach { uri ->
            scope.launch {
                val staged = stagePickedPhoto(context, uri)
                val jpeg = staged?.let { compressor.compressToJpeg(it) }
                if (jpeg != null) viewModel.addPendingPhoto(jpeg)
            }
        }
    }

    LaunchedEffect(reportId) {
        viewModel.load(reportId)
        viewModel.state.first { it.saved }
        onSaved()
    }

    ReportEditScreen(
        state = state,
        onTurnoChange = viewModel::onTurnoChange,
        onNotesChange = viewModel::onNotesChange,
        onCheckChange = viewModel::onCheckChange,
        onProductToggle = viewModel::onProductToggle,
        onTemperatureChange = viewModel::onTemperatureChange,
        onBoxTypeChange = viewModel::onBoxTypeChange,
        onSubmit = viewModel::submit,
        onDismissResult = viewModel::dismissMessage,
        onAddPhotos = {
            pickPhotos.launch(
                androidx.activity.result.PickVisualMediaRequest(
                    androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly,
                ),
            )
        },
        onRemovePendingPhoto = viewModel::removePendingPhoto,
        onBack = onBack,
    )
}
