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
import com.trindade.app.ui.components.HelpSection
import com.trindade.app.ui.components.ModuleHelpButton
import com.trindade.app.ui.components.ModuleHelpDialog
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.trindade.app.ui.components.ModuleHistoryButton

/** Los nombres de los bloques, como los lee la planta. */
private val blockLabels = mapOf(
    SalidaCatalog.BLOCK_EMBALAGENS to "Embalagens",
    SalidaCatalog.BLOCK_BOBINAS to "Bobinas",
    SalidaCatalog.BLOCK_MATERIA_PRIMA to "Matéria-prima",
)

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
            Text("Salida / Baixa", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(date, style = MaterialTheme.typography.bodySmall)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // La píldora canónica de los históricos: mismo alto, mismo target y mismo icono que Masas,
            // Cargamento, Reportes y Contagem. Un texto plano al lado del título no era el mismo botón.
            ModuleHistoryButton(onClick = onOpenHistory, label = "Histórico")
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

        state.notice?.let { notice ->
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (notice.isError) MaterialTheme.colorScheme.errorContainer
                    else MaterialTheme.colorScheme.secondaryContainer,
                ),
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            ) {
                Text(notice.message, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
            }
        }

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
                            Text(blockLabels[block] ?: block, fontWeight = FontWeight.SemiBold)
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

        // La barra pegada abajo: el total que se confirma y el botón que abre la confirmación.
        Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("${state.selection.lines.size} productos", style = MaterialTheme.typography.bodySmall)
                    Text(
                        "${state.selection.totalUnits} un",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Button(
                    onClick = { viewModel.requestLaunch() },
                    enabled = !state.selection.isEmpty && !state.submitting,
                    modifier = Modifier.defaultMinSize(minHeight = 44.dp),
                ) {
                    Text(if (state.submitting) "Enviando…" else "Lanzar salida")
                }
            }
        }
    }

    if (state.confirmOpen) {
        val selection = state.selection
        AlertDialog(
            onDismissRequest = { viewModel.dismissConfirmation() },
            title = { Text("Confirmar salida") },
            text = {
                Column {
                    Text("Revisá los productos y las cantidades antes de confirmar:", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    selection.lines.forEach { line ->
                        val product = SalidaCatalog.product(line.code)
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(product?.name ?: line.code, style = MaterialTheme.typography.bodyMedium)
                            Text("${line.quantity} un", fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total", fontWeight = FontWeight.SemiBold)
                        Text("${selection.totalUnits} un", fontWeight = FontWeight.Bold)
                    }
                }
            },
            confirmButton = {
                Button(onClick = { viewModel.confirmLaunch(username) }) { Text("Confirmar") }
            },
            dismissButton = {
                OutlinedButton(onClick = { viewModel.dismissConfirmation() }) { Text("Cancelar") }
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
