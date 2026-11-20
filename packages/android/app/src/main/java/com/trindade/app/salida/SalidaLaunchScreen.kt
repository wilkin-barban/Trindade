package com.trindade.app.salida

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.trindade.app.R
import com.trindade.app.ui.components.ActionResultDialog
import com.trindade.app.ui.components.HelpSection
import com.trindade.app.ui.components.ModuleHelpButton
import com.trindade.app.ui.components.ModuleHelpDialog
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.trindade.app.ui.components.ModuleHistoryButton

/**
 * Los nombres de los bloques, como los lee la planta.
 *
 * Eran un mapa en español dentro de una app en portugués; ahora son recursos, así que el idioma de la app y el
 * de la planta son el mismo en las dos lenguas que el módulo declara.
 */
@Composable
private fun salidaBlockLabel(block: String): String {
    val resource = when (block) {
        SalidaCatalog.BLOCK_EMBALAGENS -> R.string.salida_block_embalagens
        SalidaCatalog.BLOCK_BOBINAS -> R.string.salida_block_bobinas
        SalidaCatalog.BLOCK_MATERIA_PRIMA -> R.string.salida_block_materia_prima
        else -> null
    }
    return if (resource == null) block else stringResource(resource)
}

/**
 * La baja: el día de hoy, los productos con su cantidad y una barra que dice cuánto va a salir.
 *
 * La barra no es un adorno: es el total que el operario confirma en el diálogo, y sale de la misma selección que
 * viaja. El botón abre la confirmación y no manda nada.
 */
/**
 * The screen's head: the day it is about and the way to the history.
 *
 * It lives apart from the screen for one reason: the history pill is a shared component with a shared target
 * size, and a screen that can only be reached through a Hilt view model cannot be asked whether it still uses
 * it. Extracting the row makes that a test instead of a reading.
 */
/** El tag con el que un test encuentra el botón de lanzamiento, el mismo que usa la web. */
const val SALIDA_LAUNCH_BAR_TAG: String = "salida-launch"

/**
 * La barra pegada abajo: cuántos productos distintos van a salir, el total y el botón que abre la confirmación.
 *
 * El contador del botón es la cantidad de **productos distintos**, como en la web: lo que el operario confirma es
 * una lista de renglones, y el total de unidades ya está al lado. Se dice en el botón y no sólo en la barra porque
 * es el número que decide cuántas líneas va a repasar en el diálogo.
 *
 * Vive aparte de la pantalla por la misma razón que el encabezado: la regla del rótulo -- con cuántos productos se
 * escribe "(N)" y con ninguno no -- tiene que poder probarse sin levantar el ViewModel.
 */
@Composable
internal fun SalidaLaunchBar(
    products: Int,
    totalUnits: Int,
    submitting: Boolean,
    onLaunch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = stringResource(R.string.salida_products_count, products),
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = stringResource(R.string.salida_units_format, totalUnits),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
            Button(
                onClick = onLaunch,
                enabled = products > 0 && !submitting,
                modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag(SALIDA_LAUNCH_BAR_TAG),
            ) {
                Text(
                    when {
                        submitting -> stringResource(R.string.salida_launching)
                        products > 0 -> stringResource(R.string.salida_launch_with_count, products)
                        else -> stringResource(R.string.salida_launch)
                    },
                )
            }
        }
    }
}

@Composable
internal fun SalidaHeader(
    date: String,
    onOpenHistory: () -> Unit,
    modifier: Modifier = Modifier,
    onHelp: () -> Unit = {},
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(stringResource(R.string.salida_title), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(date, style = MaterialTheme.typography.bodySmall)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // La píldora canónica de los históricos: mismo alto, mismo target y mismo icono que Masas,
            // Cargamento, Reportes y Contagem. Un texto plano al lado del título no era el mismo botón.
            ModuleHistoryButton(onClick = onOpenHistory, label = stringResource(R.string.report_history))
            ModuleHelpButton(onClick = onHelp)
        }
    }
}

@Composable
fun SalidaLaunchScreen(
    viewModel: SalidaViewModel,
    username: String?,
    onOpenHistory: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    var showHelpDialog by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        SalidaHeader(
            date = state.date,
            onOpenHistory = onOpenHistory,
            onHelp = { showHelpDialog = true },
        )

        Spacer(Modifier.height(12.dp))

        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            SalidaCatalog.blocks.forEach { block ->
                val active = block in state.activeBlocks
                Card(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(salidaBlockLabel(block), fontWeight = FontWeight.SemiBold)
                            Switch(checked = active, onCheckedChange = { viewModel.toggleBlock(block) })
                        }
                        if (active) {
                            SalidaCatalog.inBlock(block).forEach { product ->
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        product.name,
                                        modifier = Modifier.weight(1f),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    OutlinedTextField(
                                        value = state.quantities[product.code].orEmpty(),
                                        onValueChange = { viewModel.setQuantity(product.code, it) },
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        modifier = Modifier.width(96.dp),
                                        textStyle = MaterialTheme.typography.bodyMedium.copy(textAlign = TextAlign.End),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        SalidaLaunchBar(
            products = state.selection.lines.size,
            totalUnits = state.selection.totalUnits,
            submitting = state.submitting,
            onLaunch = viewModel::requestLaunch,
        )
    }

    if (state.confirmOpen) {
        val selection = state.selection
        // La respuesta de una acción -- guardada y enviada, o rechazada -- se cierra en su ventana: la grilla de
        // abajo ya cambió y un cartel dentro de ella se lee como parte del estado que se está mirando.
        state.notice?.let { notice ->
            ActionResultDialog(
                message = notice.message,
                isSuccess = !notice.isError,
                onDismiss = viewModel::dismissNotice,
            )
        }

        AlertDialog(
            onDismissRequest = { viewModel.dismissConfirmation() },
            title = { Text(stringResource(R.string.salida_confirm_title)) },
            text = {
                Column {
                    Text(stringResource(R.string.salida_confirm_hint), style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    selection.lines.forEach { line ->
                        val product = SalidaCatalog.product(line.code)
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(product?.name ?: line.code, style = MaterialTheme.typography.bodyMedium)
                            Text(stringResource(R.string.salida_units_format, line.quantity), fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(R.string.salida_total), fontWeight = FontWeight.SemiBold)
                        Text(stringResource(R.string.salida_units_format, selection.totalUnits), fontWeight = FontWeight.Bold)
                    }
                }
            },
            confirmButton = {
                Button(onClick = { viewModel.confirmLaunch(username) }) { Text(stringResource(R.string.salida_confirm)) }
            },
            dismissButton = {
                OutlinedButton(onClick = { viewModel.dismissConfirmation() }) { Text(stringResource(R.string.salida_cancel)) }
            },
        )
    }

    if (showHelpDialog) {
        ModuleHelpDialog(
            title = stringResource(R.string.help_salida_title),
            description = stringResource(R.string.help_salida_desc),
            sections = listOf(
                HelpSection(
                    title = stringResource(R.string.help_salida_section1_title),
                    description = stringResource(R.string.help_salida_section1_desc),
                ),
                HelpSection(
                    title = stringResource(R.string.help_salida_section2_title),
                    description = stringResource(R.string.help_salida_section2_desc),
                ),
            ),
            onDismissRequest = { showHelpDialog = false },
        )
    }
}
