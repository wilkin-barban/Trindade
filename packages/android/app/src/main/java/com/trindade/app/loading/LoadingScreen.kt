package com.trindade.app.loading

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import com.trindade.app.R
import com.trindade.app.contract.models.DriversResponseDriversInner
import com.trindade.app.contract.models.SchedulesResponseSchedulesInner
import com.trindade.app.contract.models.VehiclesResponseVehiclesInner
import com.trindade.app.ui.cleanPhone
import com.trindade.app.ui.filterPhoneInput
import com.trindade.app.ui.components.AdminPrimaryButton
import com.trindade.app.ui.components.AdminSecondaryButton
import com.trindade.app.ui.components.HelpSection
import com.trindade.app.ui.components.ModuleHelpButton
import com.trindade.app.ui.components.ModuleHelpDialog
import com.trindade.app.ui.components.ModuleHistoryButton
import com.trindade.app.ui.components.NavigationActionButton

/**
 * The loading schedule for one day.
 *
 * Every slot of the day is drawn, including the empty ones, because the grid is what tells an operator
 * where an entry could go; the configured slots come from the server rather than from a list here, so a
 * slot added in settings shows up without a client change.
 *
 * The counter next to each slot is the three-fletero indication. It is a display: the server accepts a
 * fourth, so it never withholds anything, and when the window is exceeded the slot says so rather than
 * refusing.
 *
 * The export lives with the day's header rather than at the end of the grid. The grid is long enough to
 * scroll, and the action is about the whole day, so it would otherwise sit behind every slot it
 * describes.
 */
@Composable
fun LoadingScreen(
    state: LoadingViewModel.UiState,
    onBack: () -> Unit,
    // Sólo el día abierto desde el histórico es una subpantalla: la raíz del módulo no vuelve a ninguna
    // parte, así que no ofrece "Voltar" -- lo que la pestaña no puede hacer es mentir sobre dónde está.
    showBack: Boolean = false,
    onOpenHistory: () -> Unit,
    onStartAdding: (String) -> Unit,
    onCancelAdding: () -> Unit,
    onPickerTabSelected: (LoadingPickerTab) -> Unit,
    onFleteroPicked: (Int, Boolean) -> Unit,
    onCasaPicked: (Int, Boolean) -> Unit,
    onCasaVehiclePicked: (Int, Int) -> Unit,
    onConfirmAdd: () -> Unit,
    onDelete: (Int) -> Unit,
    onEditEntry: (Int, String) -> Unit,
    onLoadExport: () -> Unit,
    modifier: Modifier = Modifier,
    onShareText: () -> Unit = {},
    onSharePdf: () -> Unit = {},
    onOpenWhatsApp: (DriversResponseDriversInner) -> Unit = {},
    onCopyExport: (String) -> Unit = {},
    onQuickAdd: (String, String?, String?) -> Unit = { _, _, _ -> },
    onRetry: () -> Unit = {},
) {
    val clipboard = LocalClipboardManager.current
    var showHelpDialog by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        item {
            // La barra del módulo: el histórico en la esquina de arranque y la ayuda en la de cierre.
            // "Voltar" sólo aparece cuando hay a dónde volver, y se queda a la izquierda: es el orden en
            // que se lee una pantalla, salir primero y después lo que se puede hacer en ella.
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (showBack) {
                        NavigationActionButton(onClick = onBack, text = stringResource(R.string.report_back))
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    ModuleHistoryButton(onClick = onOpenHistory)
                    Spacer(modifier = Modifier.weight(1f))
                    ModuleHelpButton(onClick = { showHelpDialog = true })
                }
                // The module's line, below the actions instead of squeezed between them: the same place and
                // the same style the other modules give theirs.
                Text(
                    text = stringResource(R.string.loading_tagline),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = state.date, style = MaterialTheme.typography.bodyMedium)
                OutlinedButton(
                    onClick = onLoadExport,
                    enabled = !state.loadingExport,
                    modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp),
                ) {
                    if (state.loadingExport) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Text(stringResource(R.string.export_load), style = MaterialTheme.typography.labelLarge)
                        }
                    } else {
                        Text(stringResource(R.string.export_load), style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }

        if (state.readOnly) {
            item {
                // Two ways a day is read-only, and they are not the same sentence: a closed day is the
                // calendar's, and no one can reopen it; a deactivated batch is someone's decision, and the
                // history is where it is undone. The closed day wins when both hold, because it is the one
                // the operator can neither change nor wait out. Neither is an error -- nothing failed -- so
                // neither is painted in the error colour, and neither carries a retry: there is nothing to
                // ask again.
                Text(
                    text = stringResource(
                        if (state.closedDay) R.string.loading_closed_day else R.string.loading_batch_deactivated,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        state.message?.let { message ->
            item {
                // A failure the operator can only read is a dead end: the read that failed is the one
                // that fills the grid, so the message carries the way to ask again.
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    TextButton(
                        onClick = onRetry,
                        enabled = !state.loading,
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    ) {
                        Text(stringResource(R.string.loading_retry), style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }

        // The server's own text, shown verbatim and copied as it stands. It is the product's output, so
        // there is nothing here to assemble and nothing to reformat for a narrower screen.
        state.exportText?.let { text ->
            item {
                Text(text = text, style = MaterialTheme.typography.bodyMedium)
                FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AdminPrimaryButton(
                        onClick = {
                            clipboard.setText(AnnotatedString(text))
                            onCopyExport(text)
                        },
                        text = stringResource(R.string.export_copy),
                    )
                    AdminPrimaryButton(
                        onClick = onShareText,
                        text = stringResource(R.string.export_share_text),
                    )
                }
                // The one-on-one list sits with the day's own text, because what it sends IS that text: the
                // label names the person rather than the action, since which driver a message reaches is
                // the choice being made here, and only the drivers a chat can actually open are offered.
                state.fleterosWithPhone().let { fleteros ->
                    if (fleteros.isNotEmpty()) {
                        Text(
                            text = stringResource(R.string.export_send_to_fletero),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        // One row per name was a column of buttons that overlapped: the names come from the
                        // roster rather than from a fixed list, so the line each one took was borrowed from
                        // the one above it and two fleteros in a day could not be told apart or pressed.
                        // `FlowRow` is what fits them: as many as fit on a line, wrapped, with the same gap
                        // between neighbours on a line as between the lines themselves.
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            fleteros.forEach { driver ->
                                NavigationActionButton(
                                    onClick = { onOpenWhatsApp(driver) },
                                    text = driver.name,
                                )
                            }
                        }
                    }
                }
                OutlinedButton(
                    onClick = onSharePdf,
                    enabled = !state.exportingPdf,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                        .defaultMinSize(minHeight = 48.dp),
                ) {
                    if (state.exportingPdf) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Text(stringResource(R.string.export_share_pdf), style = MaterialTheme.typography.labelLarge)
                        }
                    } else {
                        Text(stringResource(R.string.export_share_pdf), style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }

        items(state.slots) { slot ->
            SlotBlock(
                slot = slot,
                entries = state.entriesIn(slot),
                fleteroCount = state.fleteroCountIn(slot),
                exceeded = state.isExceeded(slot),
                state = state,
                onStartAdding = onStartAdding,
                onDelete = onDelete,
                onEditEntry = onEditEntry,
            )
        }
    }

    // The picker is one dialog for the whole screen rather than one per slot: it is opened from a slot,
    // but it is drawn above the grid like every other dialog here, so it does not scroll away with the
    // row it was opened from.
    state.addingToSlot?.let { slot ->
        DriverPickerDialog(
            slot = slot,
            state = state,
            onTabSelected = onPickerTabSelected,
            onFleteroPicked = onFleteroPicked,
            onCasaPicked = onCasaPicked,
            onCasaVehiclePicked = onCasaVehiclePicked,
            onConfirm = onConfirmAdd,
            onCancel = onCancelAdding,
            onQuickAdd = onQuickAdd,
        )
    }

    if (showHelpDialog) {
        ModuleHelpDialog(
            title = stringResource(R.string.help_loading_title),
            description = stringResource(R.string.help_loading_desc),
            sections = listOf(
                HelpSection(
                    title = "Organização por Faixas Horárias",
                    description = "Consulte os motoristas e veículos alocados por horário. O painel indica a ocupação máxima por faixa horária.",
                ),
                HelpSection(
                    title = "Exportação e Comunicação",
                    description = "Exporte o cronograma completo para compartilhamento ou acione motoristas diretamente no WhatsApp.",
                ),
            ),
            onDismissRequest = { showHelpDialog = false },
        )
    }
}

@Composable
private fun SlotBlock(
    slot: String,
    entries: List<SchedulesResponseSchedulesInner>,
    fleteroCount: Int,
    exceeded: Boolean,
    state: LoadingViewModel.UiState,
    onStartAdding: (String) -> Unit,
    onDelete: (Int) -> Unit,
    onEditEntry: (Int, String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(text = slot, style = MaterialTheme.typography.titleMedium)

            val counter = stringResource(R.string.loading_fleteros, fleteroCount, FleteroQuota.LIMIT)
            Text(
                text = if (exceeded) "$counter ⚠" else counter,
                style = MaterialTheme.typography.bodyMedium,
                // Coloured rather than withheld: the limit is informative, so the slot still accepts
                // another driver and the operator is told the effect instead of being stopped by it.
                color = if (exceeded) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        entries.forEach { entry ->
            SlotTableRow(
                entry = entry,
                state = state,
                onDelete = onDelete,
                onEditEntry = onEditEntry,
            )
        }

        // Offered even when the window is exceeded. The limit is a display, and withholding this
        // would turn it into a rule the server does not enforce. It is withheld while the day is in the
        // air, because the slot belongs to the grid that is being replaced and the dialog it opens would
        // be filled against a day nobody has read yet -- and withheld on a deactivated day, where the
        // server refuses every write: an offer that can only be refused is not an offer.
        if (!state.readOnly) {
            AdminSecondaryButton(
                onClick = { onStartAdding(slot) },
                text = stringResource(R.string.loading_add_entry),
                enabled = !state.busy && !state.loading,
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            )
        }
        HorizontalDivider()
    }
}

/** The height a row's own actions keep whatever the font scale asks of the text beside them. */
private val SlotActionTarget = 48.dp

/**
 * One driver of a slot, as a row of the table the slot draws.
 *
 * The three facts of an assignment used to arrive as one sentence -- driver, vehicle and plate joined by
 * dots -- which put the same fact at a different x on every row and made a slot with two drivers of the
 * same fleet read as two paragraphs. Held in a column, the plate starts at the same x on every row of the
 * slot whatever the name beside it measures, and the removal is one small target at the row's end rather
 * than a word as wide as the row's own text.
 *
 * The plate shares the cell with the vehicle instead of claiming a column of its own: a plate is one
 * unbreakable word and, at 320dp with the font at twice its size, a column reserved for it would be
 * measured against the buttons beside it rather than against the plate. Stacked under the name, it still
 * lines up down the slot -- which is the alignment a table buys -- and the row cannot be squeezed narrower
 * than the words it holds. The plate comes first on that line because it is the part that has to align;
 * the vehicle follows it because it is what the plate is attached to.
 */
@Composable
private fun SlotTableRow(
    entry: SchedulesResponseSchedulesInner,
    state: LoadingViewModel.UiState,
    onDelete: (Int) -> Unit,
    onEditEntry: (Int, String) -> Unit,
) {
    // A row on a day that is off, or a row the server closed on a day that is not, is drawn dimmed
    // rather than hidden: it is part of what the day was. Dimming is the whole difference between "this
    // happened and cannot be touched" and "this is not here", and the actions above already tell the
    // second half of that sentence.
    val dimmed = state.readOnly || entry.isReadOnly()

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).alpha(if (dimmed) 0.55f else 1f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f).padding(horizontal = 4.dp)) {
            Text(
                text = entry.driverName ?: entry.licensePlate.orEmpty(),
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            // A fletero drives their own vehicle and a company driver drives the one assigned to them, so
            // the plate is read from the vehicle when there is one and from the driver's own record when
            // there is not. An em dash is drawn rather than nothing: an empty line reads as a plate nobody
            // got round to filling in, and this one is a plate that does not exist.
            val plate = entry.vehiclePlate ?: entry.licensePlate
            val vehicle = entry.vehicleDescription?.takeIf { it != plate }
            Text(
                text = listOfNotNull(plate, vehicle).joinToString(" · ").ifEmpty { "—" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // The way in, offered only where the server's own flags allow it. `isReadOnly()` is the
            // predicate the edit screen reads too -- one function in this package, so a row this grid
            // offers an edit for is never one that screen would draw with no save at all. A row the
            // server closed draws no action here rather than a disabled one, which is the reports'
            // rule: an action that is drawn but refuses is still an offer. The day travels with the id
            // because that screen reads the row out of its day (`GET /api/loading/schedules?date=`),
            // and the day this grid is showing is written down here and nowhere else.
            if (!state.readOnly && !entry.isReadOnly() && !state.loading) {
                TextButton(
                    onClick = { onEditEntry(entry.id, state.date) },
                    modifier = Modifier.heightIn(min = SlotActionTarget).widthIn(min = SlotActionTarget),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Text(
                        text = stringResource(R.string.report_edit),
                        style = MaterialTheme.typography.labelLarge,
                        maxLines = 1,
                    )
                }
            }
            // The removal keeps the 48dp a finger needs while drawing a 20dp glyph inside it: a word as
            // wide as the row's own text made the target of the row's smallest action the biggest thing
            // on it. Its name survives as the description a screen reader announces.
            if (!state.readOnly) {
                IconButton(
                    onClick = { onDelete(entry.id) },
                    modifier = Modifier.size(SlotActionTarget),
                    enabled = !state.busy && !state.loading,
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_delete),
                        contentDescription = stringResource(R.string.report_photo_remove),
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

/**
 * The driver picker for one slot.
 *
 * The form used to sit inside the slot and add one driver at a time: a slot that carries two fleteros took
 * two trips through it, and the plate a company driver needs had to be chosen from a list that only existed
 * while the form was open. The picker is a dialog because choosing who loads a slot is a decision about one
 * slot -- it belongs above the grid, not inside a row that scrolls away from it.
 *
 * The tabs are the fleet's own split, not a preference: a fletero brings their own vehicle, so the plate
 * has no meaning on that tab, and a company driver cannot be assigned without one, so it is asked for on the
 * row that needs it. Selections survive switching tabs, because the operator composing a slot with one of
 * each would otherwise lose the first half of the answer.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DriverPickerDialog(
    slot: String,
    state: LoadingViewModel.UiState,
    onTabSelected: (LoadingPickerTab) -> Unit,
    onFleteroPicked: (Int, Boolean) -> Unit,
    onCasaPicked: (Int, Boolean) -> Unit,
    onCasaVehiclePicked: (Int, Int) -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
    onQuickAdd: (String, String?, String?) -> Unit,
) {
    BasicAlertDialog(
        onDismissRequest = onCancel,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            shape = MaterialTheme.shapes.large,
            // The same height every other dialog in the app is drawn at: a tonal surface plus elevation
            // level 3 rather than plain white on a warm background, which reads as a hole in the screen.
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = stringResource(R.string.loading_picker_title, slot),
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = stringResource(R.string.loading_picker_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                val fleteros = state.pickerTab == LoadingPickerTab.FLETEROS
                PrimaryTabRow(selectedTabIndex = if (fleteros) 0 else 1) {
                    Tab(
                        selected = fleteros,
                        onClick = { onTabSelected(LoadingPickerTab.FLETEROS) },
                        text = { Text(stringResource(R.string.loading_picker_tab_fleteros)) },
                    )
                    Tab(
                        selected = !fleteros,
                        onClick = { onTabSelected(LoadingPickerTab.CASA) },
                        text = { Text(stringResource(R.string.loading_picker_tab_casa)) },
                    )
                }

                // The list scrolls inside the dialog so the actions stay reachable: a day with twenty
                // available fleteros is a real day, and a dialog that grew past the screen would put
                // "Aceitar" where the operator cannot press it.
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 300.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    if (fleteros) {
                        if (state.fleteroCandidates.isEmpty()) {
                            PickerEmptyLine()
                        }
                        state.fleteroCandidates.forEach { driver ->
                            CandidateRow(
                                name = driver.name,
                                picked = driver.id in state.pickedFleteros,
                                // The slot the server already has this driver in, or null. Drawn disabled
                                // with the hour rather than dropped: see `assignedSlotOf`.
                                busySlot = state.assignedSlotOf(driver.id),
                                onPickedChange = { picked -> onFleteroPicked(driver.id, picked) },
                            )
                        }
                        QuickAddFletero(state = state, onQuickAdd = onQuickAdd)
                    } else {
                        if (state.casaCandidates.isEmpty()) {
                            PickerEmptyLine()
                        }
                        state.casaCandidates.forEach { driver ->
                            val picked = driver.id in state.pickedCasa
                            CandidateRow(
                                name = driver.name,
                                picked = picked,
                                busySlot = state.assignedSlotOf(driver.id),
                                onPickedChange = { value -> onCasaPicked(driver.id, value) },
                            ) {
                                PlatePicker(
                                    // Free plates only: the day's, and this batch's, minus this row's own.
                                    vehicles = state.vehicleOptionsFor(driver.id),
                                    chosenVehicleId = state.pickedCasa[driver.id],
                                    // A plate belongs to a driver the operator picked: offering it on a row
                                    // nobody selected would set one the request would then ignore.
                                    enabled = picked,
                                    onPick = { vehicleId -> onCasaVehiclePicked(driver.id, vehicleId) },
                                )
                            }
                        }
                    }
                }

                // Named rather than counted: with several company drivers picked, "falta uma chapa" leaves
                // the operator hunting the list for the row that needs it.
                state.pickedCasaWithoutVehicle.takeIf { it.isNotEmpty() }?.let { missing ->
                    Text(
                        text = stringResource(
                            R.string.loading_picker_plate_missing,
                            missing.joinToString(", ") { it.name },
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = stringResource(R.string.loading_picker_selected, state.pickedCount),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    AdminSecondaryButton(onClick = onCancel, text = stringResource(R.string.loading_cancel))
                    AdminPrimaryButton(
                        onClick = onConfirm,
                        text = stringResource(R.string.loading_picker_accept),
                        // Withheld while the day is being read for the same reason the slot's own button is:
                        // the request would name a slot of a grid that is being replaced.
                        enabled = state.canConfirm && !state.loading,
                    )
                }
            }
        }
    }
}

@Composable
private fun PickerEmptyLine() {
    Text(
        text = stringResource(R.string.loading_picker_empty),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 8.dp),
    )
}

/**
 * One driver of the picker: a check box, the name, and whatever the row needs beside it.
 *
 * The whole row is the control, as in the report form's own checks: it is a 48 dp target tapped with
 * gloves on, the name toggles it too, and a row that carries its own name is the one shape a screen reader
 * can announce as a single named control. The check box is therefore drawn without a handler.
 */
@Composable
private fun CandidateRow(
    name: String,
    picked: Boolean,
    onPickedChange: (Boolean) -> Unit,
    busySlot: String? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    val occupied = busySlot != null
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            // Disabled rather than absent: the name stays on the list, and the sentence under it says when
            // and where the driver already is, which is the question a disappearance used to leave open.
            .toggleable(
                value = picked,
                role = Role.Checkbox,
                enabled = !occupied,
                onValueChange = onPickedChange,
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Checkbox(checked = picked, onCheckedChange = null, enabled = !occupied)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = name, style = MaterialTheme.typography.bodyLarge)
            busySlot?.let { slot ->
                Text(
                    text = stringResource(R.string.loading_picker_driver_busy, name, slot),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        trailing?.invoke()
    }
}

/**
 * The plate a company driver will drive, chosen from the day's own vehicles.
 *
 * A menu rather than a list of radio rows: a plate belongs to one driver of the slot, so the choice is a
 * value on this driver's row and not a slot-wide selection. It is offered the free plates and no more --
 * the fleet minus what the day already drives and what this batch already picked, keeping this row's own --
 * because a plate the server will refuse is not a choice. The button says "Chapa" until something is
 * chosen, because an empty value has to be visible as missing rather than as a blank.
 */
@Composable
private fun PlatePicker(
    vehicles: List<VehiclesResponseVehiclesInner>,
    chosenVehicleId: Int?,
    enabled: Boolean,
    onPick: (Int) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val chosen = vehicles.firstOrNull { it.id == chosenVehicleId }

    Box {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled) {
            Text(
                text = chosen?.licensePlate ?: stringResource(R.string.loading_picker_plate),
                style = MaterialTheme.typography.labelLarge,
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            vehicles.forEach { vehicle ->
                DropdownMenuItem(
                    text = { Text(vehicleChoiceLabel(vehicle)) },
                    onClick = {
                        onPick(vehicle.id)
                        expanded = false
                    },
                )
            }
        }
    }
}

/** What a vehicle reads as in the plate menu: its plate first, since the plate is what was asked for. */
internal fun vehicleChoiceLabel(vehicle: VehiclesResponseVehiclesInner): String {
    val description = vehicle.description.trim()
    return if (description.isEmpty()) vehicle.licensePlate else "${vehicle.licensePlate} · $description"
}

/**
 * The quick add for a fletero nobody has registered yet.
 *
 * It stays inside the picker because that is where the operator discovers the name is missing, and the
 * driver it creates is assigned to the open slot on the spot -- being sent back to the grid to pick them
 * again would be the same trip the picker exists to remove.
 */
@Composable
private fun QuickAddFletero(
    state: LoadingViewModel.UiState,
    onQuickAdd: (String, String?, String?) -> Unit,
) {
    var showForm by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var plate by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }

    if (!showForm) {
        TextButton(onClick = { showForm = true }, modifier = Modifier.defaultMinSize(minHeight = 48.dp)) {
            Text(text = "+ " + stringResource(R.string.loading_new_fletero))
        }
        return
    }

    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(stringResource(R.string.loading_new_fletero), style = MaterialTheme.typography.titleSmall)
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.loading_fletero_name)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = plate,
                onValueChange = { plate = it },
                label = { Text(stringResource(R.string.loading_fletero_plate)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = filterPhoneInput(it) },
                label = { Text(stringResource(R.string.drivers_phone)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AdminPrimaryButton(
                    onClick = {
                        if (name.isNotBlank()) {
                            onQuickAdd(
                                name.trim(),
                                plate.trim().ifBlank { null },
                                cleanPhone(phone).ifBlank { null },
                            )
                            showForm = false
                            name = ""
                            plate = ""
                            phone = ""
                        }
                    },
                    text = stringResource(R.string.loading_picker_save_fletero),
                    enabled = name.isNotBlank() && !state.busy,
                )
                AdminSecondaryButton(
                    onClick = {
                        showForm = false
                        name = ""
                        plate = ""
                        phone = ""
                    },
                    text = stringResource(R.string.loading_cancel),
                )
            }
        }
    }
}

/**
 * How an entry reads in the grid.
 *
 * A company driver is shown with the vehicle because that pairing is what identifies the row to an
 * operator; an external one is shown by name and plate, since the vehicle is theirs.
 *
 * Not private, because the edit screen draws the row it is editing with this same line: the row the
 * operator tapped and the row the next screen shows them are the same row, and two expressions for it
 * would be two answers to what an entry is called -- the drift a second copy eventually grows.
 */
internal fun describe(entry: SchedulesResponseSchedulesInner): String {
    val name = entry.driverName ?: entry.licensePlate ?: "—"
    val vehicle = entry.vehicleDescription
    val plate = entry.vehiclePlate ?: entry.licensePlate

    return listOfNotNull(name, vehicle, plate).joinToString(" · ")
}

@Composable
fun LoadingRoute(
    onBack: () -> Unit,
    onOpenHistory: () -> Unit,
    onEditEntry: (Int, String) -> Unit,
    date: String? = null,
    stale: Boolean = false,
    onStaleRead: () -> Unit = {},
    viewModel: LoadingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    /**
     * The grid's day, asked for through the view model's own `onDateChange` -- the method that has
     * existed since D4b with no caller, and this slice is where the history gives it one.
     *
     * With a date, that day is loaded, and the read is forced because a day the operator asked for is
     * what asking is for. The view model's constructor has already started a load of today by the time
     * this runs, so the two are briefly in the air together, and what makes the requested day win is
     * the request token inside the view model rather than an ordering guaranteed here.
     *
     * Without a date this is the loading tab, which means today -- and today is the one day the arrival
     * does not have to read, because the constructor's load is already that read; the return trip from
     * the history's day is covered by the arrival naming a different day, which is read.
     *
     * The one thing an arrival cannot decide for itself is a write. The editor that moves a row is
     * another view model on another copy of the day, so a save reaches this side of the app only as the
     * overlay flag `MainActivity` clears -- and nothing of it reaches the grid, which is then drawn
     * again on the day it was already showing with the day as it was *before* the edit: the row the
     * operator moved would come back in the slot they moved it out of. [stale] is that fact travelling
     * with the arrival, the read below is forced for it, and `onStaleRead` gives it back only after that
     * exact request wins and writes a non-null schedules answer. A failure or superseded request leaves
     * the fact with `MainActivity`, so the next arrival can retry it.
     *
     * Keyed on the day alone, and deliberately: taking the fact flips [stale] back to false in the same
     * composition, so an effect keyed on it would run a second time for a save the read already
     * answered.
     */
    LaunchedEffect(date) {
        val read = viewModel.onDateChange(
            date ?: saoPauloToday(),
            force = date != null || stale,
        )
        if (stale && read?.await() == true) onStaleRead()
    }

    LoadingScreen(
        state = state,
        onBack = onBack,
        showBack = date != null,
        onOpenHistory = onOpenHistory,
        onStartAdding = viewModel::startAdding,
        onCancelAdding = viewModel::cancelAdding,
        onPickerTabSelected = viewModel::selectPickerTab,
        onFleteroPicked = viewModel::toggleFletero,
        onCasaPicked = viewModel::toggleCasa,
        onCasaVehiclePicked = viewModel::pickCasaVehicle,
        onConfirmAdd = viewModel::confirmAdd,
        onDelete = viewModel::deleteEntry,
        onEditEntry = onEditEntry,
        onLoadExport = viewModel::loadExport,
        onShareText = viewModel::shareText,
        onSharePdf = viewModel::sharePdf,
        onOpenWhatsApp = viewModel::openWhatsAppFor,
        onQuickAdd = viewModel::quickAddDriver,
        onRetry = { viewModel.load() },
    )
}
