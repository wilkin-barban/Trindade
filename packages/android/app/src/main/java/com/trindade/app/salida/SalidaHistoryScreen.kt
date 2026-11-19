package com.trindade.app.salida

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.ui.platform.testTag
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import com.trindade.app.R
import com.trindade.app.ui.components.HelpSection
import com.trindade.app.ui.components.ModuleHelpDialog
import androidx.compose.runtime.setValue
import com.trindade.app.ui.components.HistoryHeader

/**
 * El histórico de la baja: lo que este operario lanzó, por día.
 *
 * Muestra lo que hay en Trindade y su estado contra el ERP. No lee el espejo ni ofrece conciliar: ese trabajo es
 * del Relatório, que es donde el día se sincroniza. Cada tarjeta dice el estado en una palabra.
 */
@Composable
fun SalidaHistoryScreen(
    viewModel: SalidaViewModel,
    onBack: () -> Unit,
    onOpenWhatsApp: (String) -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
    var showHelpDialog by remember { mutableStateOf(false) }
    // La foto se elige del carrete y se sube comprimida al movimiento que la pidió: la cámara del teléfono ya
    // deja el archivo en el carrete de la planta, así que una sola puerta alcanza para las dos.
    var pendingPhotoMovement by remember { mutableStateOf<Int?>(null) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val pickPhotos = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia(3),
    ) { uris ->
        val movementId = pendingPhotoMovement
        pendingPhotoMovement = null
        if (movementId == null) return@rememberLauncherForActivityResult
        uris.take(3).forEach { uri ->
            val target = java.io.File(context.cacheDir, "salida-${System.currentTimeMillis()}.jpg")
            runCatching {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    target.outputStream().use { output -> input.copyTo(output) }
                }
            }.getOrNull()
            viewModel.attachPhotoFromPath(movementId, target.absolutePath)
        }
    }

    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        // El mismo header que Masas, Cargamento, Reportes y Contagem: título, contador y Volver de 48 dp.
        HistoryHeader(
            title = "Histórico de Salidas",
            subtitle = state.history.size.toString(),
            onBack = onBack,
            onHelp = { showHelpDialog = true },
        )

        Spacer(Modifier.height(12.dp))

        state.notice?.let { notice ->
            Text(
                notice.message,
                style = MaterialTheme.typography.bodySmall,
                color = if (notice.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

        // Hoy siempre está, aunque el servidor todavía no lo haya devuelto: es el día que el operario viene a
        // mirar. Debajo, las cinco fechas anteriores más recientes -- o todas, si pidió todas.
        val today = state.date
        val selected = state.historyDate ?: today
        val days = state.history
        val visibleDates = salidaHistoryVisibleDates(today, days.map { it.date }, state.historyAll)

        SalidaHistoryChips(
            dates = visibleDates,
            selected = selected,
            today = today,
            all = state.historyAll,
            onSelect = viewModel::selectHistoryDate,
            onToggleAll = viewModel::toggleHistoryAll,
        )

        Spacer(Modifier.height(8.dp))

        if (selected != today) {
            // El pasado no se toca: el histórico muestra lo que se lanzó y su estado, y nada de eso se edita.
            Text(
                text = "Fecha pasada: solo lectura.",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(bottom = 8.dp)
                    .testTag("salida-history-readonly-note"),
            )
        }

        val day = days.firstOrNull { it.date == selected }
        if (day == null || day.movements.isEmpty()) {
            Text(
                if (selected == today) "Nenhuma saída registrada hoje." else "Nenhuma saída registrada.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 24.dp).testTag("salida-history-empty"),
            )
            return@Column
        }

        Text(
            text = "${day.totalUnits} un",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(bottom = 8.dp).testTag("salida-history-total"),
        )

        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            day.movements.forEach { movement ->
                SalidaMovementCard(
                    movement = movement,
                    onAddPhoto = { pendingPhotoMovement = movement.id },
                    onDeletePhoto = viewModel::deletePhoto,
                    onShare = { onOpenWhatsApp(viewModel.movementShareLink(movement)) },
                )
            }
            Spacer(Modifier.height(12.dp))
            // El compartir es del día entero y vive donde el día se lee: con el mensaje armado desde la tabla
            // de abreviaturas, la prévia a la vista y una sola acción.
            val phone = state.historyPhone
            SalidaWhatsAppShare(
                text = viewModel.dayShareText(),
                phone = phone,
                onPhoneChange = viewModel::onHistoryPhoneChange,
                walletLink = viewModel.historyWhatsAppLink(),
                onOpenWhatsApp = { viewModel.historyWhatsAppLink()?.let { onOpenWhatsApp(it) } },
            )
        }
    }

    if (showHelpDialog) {
        ModuleHelpDialog(
            title = stringResource(R.string.help_salida_history_title),
            description = stringResource(R.string.help_salida_history_desc),
            sections = listOf(
                HelpSection(
                    title = stringResource(R.string.help_salida_history_section1_title),
                    description = stringResource(R.string.help_salida_history_section1_desc),
                ),
            ),
            onDismissRequest = { showHelpDialog = false },
        )
    }
}

/**
 * Las fechas que el histórico ofrece: hoy primero, después las cinco anteriores más recientes.
 *
 * Hoy entra siempre, aunque el servidor todavía no lo haya devuelto: es el día que el operario viene a mirar, y
 * una pantalla que abre sin él lo hace dudar de si lanzó algo. Con [all] la lista entera pasa a estar disponible
 * desde el chip, que es lo que el botón «Todas las fechas» hace.
 */
fun salidaHistoryVisibleDates(today: String, dates: List<String>, all: Boolean): List<String> {
    val earlier = dates.filter { it != today }
    val shown = if (all) earlier else earlier.take(5)
    return (listOf(today) + shown).distinct()
}

/**
 * Las fechas del histórico: hoy, las cinco anteriores y la puerta a todas.
 *
 * La pantalla abría en una lista corrida de días sin decir cuál se estaba mirando. Hoy va primero aunque el
 * servidor todavía no lo haya devuelto, porque es el día que el operario viene a ver; las demás fechas son lo
 * que ya pasó, y se muestran como referencia.
 */
@Composable
internal fun SalidaHistoryChips(
    dates: List<String>,
    selected: String,
    today: String,
    all: Boolean,
    onSelect: (String) -> Unit,
    onToggleAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        dates.forEach { date ->
            FilterChip(
                selected = date == selected,
                onClick = { onSelect(date) },
                label = { Text(if (date == today) "Hoje" else com.trindade.app.massas.brazilianDate(date)) },
                modifier = Modifier
                    .defaultMinSize(minHeight = 44.dp)
                    .testTag(if (date == today) "salida-history-today" else "salida-history-chip-$date"),
            )
        }
        FilterChip(
            selected = all,
            onClick = onToggleAll,
            label = { Text(if (all) "Últimas datas" else "Todas as datas") },
            modifier = Modifier
                .defaultMinSize(minHeight = 44.dp)
                .testTag("salida-history-all"),
        )
    }
}

private fun statusLabel(status: com.trindade.app.contract.models.SalidaMovementErp.Status?): String = when (status?.value?.lowercase()) {
    "sent" -> "Enviado"
    "reconciled" -> "Conciliado"
    "partial" -> "Parcial"
    "failed" -> "Pendente"
    else -> "Pendente"
}

@Composable
internal fun SalidaMovementCard(
    movement: SalidaCreateResponseMovement,
    onAddPhoto: (() -> Unit)? = null,
    onDeletePhoto: (Int) -> Unit = {},
    onShare: (() -> Unit)? = null,
) {
    Card(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(movement.movementDate, fontWeight = FontWeight.SemiBold)
                    Text(
                        movement.username,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Text(
                    statusLabel(movement.erp?.status),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(Modifier.height(6.dp))
            movement.items.forEach { item ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(item.productName, style = MaterialTheme.typography.bodySmall)
                    Text("${item.quantity} un", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Total", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                Text("${movement.totalUnits} un", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
            }

            // Las fotos son la evidencia de la baja: viven en la tarjeta del movimiento, no en el día.
            if (movement.photos.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Fotos (${movement.photos.size})",
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.testTag("salida-photos-${movement.id}"),
                )
                movement.photos.forEach { photo ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = photo.filePath.substringAfterLast('/'),
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            modifier = Modifier.weight(1f).padding(end = 8.dp),
                        )
                        TextButton(
                            onClick = { onDeletePhoto(photo.id) },
                            modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                        ) {
                            Text("Borrar foto")
                        }
                    }
                }
            }

            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (onAddPhoto != null) {
                    OutlinedButton(
                        onClick = onAddPhoto,
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag("salida-photo-picker"),
                    ) {
                        Text("Agregar foto", style = MaterialTheme.typography.labelMedium)
                    }
                }
                if (onShare != null) {
                    OutlinedButton(
                        onClick = onShare,
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag("salida-share-${movement.id}"),
                    ) {
                        Text("Compartir", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }

    
}
