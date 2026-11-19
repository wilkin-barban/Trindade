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
/** Las etiquetas del mensaje del día, en el idioma de la app. */
@Composable
private fun salidaSummaryLabels(): SalidaSummaryLabels = SalidaSummaryLabels(
    title = stringResource(R.string.salida_day_share_title),
    movements = stringResource(R.string.salida_day_share_movements),
    blocks = mapOf(
        SalidaCatalog.BLOCK_EMBALAGENS to stringResource(R.string.salida_block_embalagens),
        SalidaCatalog.BLOCK_BOBINAS to stringResource(R.string.salida_block_bobinas),
        SalidaCatalog.BLOCK_MATERIA_PRIMA to stringResource(R.string.salida_block_materia_prima),
    ),
)

/**
 * El día sin movimientos: una frase y, sólo si es hoy, la puerta al lanzamiento.
 *
 * En el pasado no se lanza nada, así que ahí la frase va sola. Está aparte de la pantalla porque es lo único
 * que se puede probar sin levantar el ViewModel, y es justo la regla que se quiere fijar.
 */
/**
 * El día sin movimientos, completo: la frase, la puerta al lanzamiento si es hoy y el bloque de WhatsApp.
 *
 * La web monta las dos cosas -- el estado vacío y `SalidaWhatsAppShare` deshabilitado -- porque un bloque que
 * desaparece deja al operario sin saber si el día no tuvo salidas o si la pantalla no cargó. Sin movimientos no
 * hay texto que mandar, así que la prévia lleva la frase del día vacío y el botón queda apagado; la acción de
 * lanzar, cuando el día es hoy, es la que sigue viva. Se prueba junto y sin ViewModel: es una composición, no un
 * estado.
 */
@Composable
internal fun SalidaHistoryEmptyDay(
    isToday: Boolean,
    onLaunch: () -> Unit,
    shareText: String,
    phone: String,
    onPhoneChange: (String) -> Unit,
    walletLink: String?,
    onOpenWhatsApp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        SalidaHistoryEmpty(isToday = isToday, onLaunch = onLaunch)
        Spacer(Modifier.height(12.dp))
        SalidaWhatsAppShare(
            text = shareText,
            phone = phone,
            onPhoneChange = onPhoneChange,
            walletLink = walletLink,
            onOpenWhatsApp = onOpenWhatsApp,
        )
    }
}

@Composable
internal fun SalidaHistoryEmpty(
    isToday: Boolean,
    onLaunch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Text(
            if (isToday) stringResource(R.string.salida_history_empty_today) else stringResource(R.string.salida_history_empty_past),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 24.dp).testTag("salida-history-empty"),
        )
        if (isToday) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = onLaunch,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag("salida-empty-cta"),
            ) {
                Text(stringResource(R.string.salida_history_launch))
            }
        }
    }
}

@Composable
fun SalidaHistoryScreen(
    viewModel: SalidaViewModel,
    onBack: () -> Unit,
    onOpenWhatsApp: (String) -> Unit = {},
    /** La vuelta al lanzamiento desde el día vacío de hoy. */
    onLaunch: () -> Unit = {},
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
            title = stringResource(R.string.salida_history_title),
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

        // Los pendientes que esperan viaje al ERP se cuentan en la cabecera del día, no en cada tarjeta: es la
        // pregunta que el operario hace al abrir el histórico por la mañana.
        val pending = viewModel.pendingCount()
        if (pending > 0) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.salida_history_pending, pending),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("salida-pending-count"),
                )
                TextButton(
                    onClick = viewModel::resendPending,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag("salida-resend-pending"),
                ) {
                    Text(stringResource(R.string.salida_history_resend_pending))
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        if (selected != today) {
            // El pasado no se toca: el histórico muestra lo que se lanzó y su estado, y nada de eso se edita.
            Text(
                text = stringResource(R.string.salida_history_past_readonly),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(bottom = 8.dp)
                    .testTag("salida-history-readonly-note"),
            )
        }

        // Las etiquetas del mensaje, resueltas acá: el operario que comparte y el que lee la prévia ven el mismo
        // texto, en el idioma de la app.
        val summaryLabels = salidaSummaryLabels()

        val day = days.firstOrNull { it.date == selected }
        val movements = day?.movements.orEmpty()

        // El filtro por bloque es de la pantalla y no del servidor: los movimientos del día ya están acá.
        var block by remember { mutableStateOf<String?>(null) }

        // El día vacío se dibuja como en la web: su estado -- con la puerta al lanzamiento si es hoy -- y,
        // debajo, el bloque de compartir con la prévia vacía y el envío deshabilitado. Ocultarlo dejaba al
        // operario sin saber si el día no tenía nada o si la pantalla no había cargado.
        if (movements.isEmpty()) {
            SalidaHistoryEmptyDay(
                isToday = selected == today,
                onLaunch = onLaunch,
                shareText = viewModel.dayShareText(summaryLabels),
                phone = state.historyPhone,
                onPhoneChange = viewModel::onHistoryPhoneChange,
                walletLink = null,
                onOpenWhatsApp = {
                    viewModel.historyWhatsAppLink(summaryLabels)?.let { onOpenWhatsApp(it) }
                },
            )
        } else {
        val blocks = movements.flatMap { movement -> movement.items.map { it.block.value } }.distinct().sorted()
        if (blocks.size > 1) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = block == null,
                    onClick = { block = null },
                    label = { Text("Todos") },
                    modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag("salida-history-block-all"),
                )
                blocks.forEach { candidate ->
                    FilterChip(
                        selected = block == candidate,
                        onClick = { block = if (block == candidate) null else candidate },
                        label = { Text(candidate) },
                        modifier = Modifier
                            .defaultMinSize(minHeight = 44.dp)
                            .testTag("salida-history-block-$candidate"),
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        Text(
            text = stringResource(R.string.salida_units_format, day?.totalUnits ?: 0),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(bottom = 8.dp).testTag("salida-history-total"),
        )

        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            movements
                .filter { movement -> block == null || movement.items.any { it.block.value == block } }
                .forEach { movement ->
                SalidaMovementCard(
                    movement = movement,
                    onAddPhoto = { pendingPhotoMovement = movement.id },
                    onDeletePhoto = viewModel::deletePhoto,
                    onShare = { onOpenWhatsApp(viewModel.movementShareLink(movement, summaryLabels)) },
                    onResend = if (viewModel.isPending(movement)) viewModel::resendPending else null,
                )
            }
            Spacer(Modifier.height(12.dp))
        }
        }

        // El compartir es del día entero y vive donde el día se lee: con el mensaje armado desde la tabla
        // de abreviaturas, la prévia a la vista y una sola acción. El día vacío monta su propio bloque, con la
        // prévia vacía y el envío deshabilitado, junto al estado que lo explica.
        if (movements.isNotEmpty()) {
            SalidaWhatsAppShare(
                text = viewModel.dayShareText(summaryLabels),
                phone = state.historyPhone,
                onPhoneChange = viewModel::onHistoryPhoneChange,
                walletLink = viewModel.historyWhatsAppLink(summaryLabels),
                onOpenWhatsApp = {
                    viewModel.historyWhatsAppLink(summaryLabels)?.let { onOpenWhatsApp(it) }
                },
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

@Composable
private fun statusLabel(status: com.trindade.app.contract.models.SalidaMovementErp.Status?): String = when (status?.value?.lowercase()) {
    "sent" -> stringResource(R.string.salida_status_sent)
    "reconciled" -> stringResource(R.string.salida_status_reconciled)
    "partial" -> stringResource(R.string.salida_status_partial)
    "failed" -> stringResource(R.string.salida_status_pending)
    else -> stringResource(R.string.salida_status_pending)
}

@Composable
internal fun SalidaMovementCard(
    movement: SalidaCreateResponseMovement,
    onAddPhoto: (() -> Unit)? = null,
    onDeletePhoto: (Int) -> Unit = {},
    onShare: (() -> Unit)? = null,
    onResend: (() -> Unit)? = null,
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
                    Text(
                        stringResource(R.string.salida_units_format, item.quantity),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    stringResource(R.string.salida_total),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    stringResource(R.string.salida_units_format, movement.totalUnits),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                )
            }

            // Las fotos son la evidencia de la baja: viven en la tarjeta del movimiento, no en el día.
            if (movement.photos.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = stringResource(R.string.salida_photos_count, movement.photos.size),
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
                            Text(stringResource(R.string.salida_photo_delete))
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
                        Text(stringResource(R.string.salida_photo_add), style = MaterialTheme.typography.labelMedium)
                    }
                }
                if (onShare != null) {
                    OutlinedButton(
                        onClick = onShare,
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag("salida-share-${movement.id}"),
                    ) {
                        Text(stringResource(R.string.salida_share), style = MaterialTheme.typography.labelMedium)
                    }
                }
                if (onResend != null) {
                    OutlinedButton(
                        onClick = onResend,
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag("salida-resend-${movement.id}"),
                    ) {
                        Text(stringResource(R.string.salida_resend), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }

    
}
