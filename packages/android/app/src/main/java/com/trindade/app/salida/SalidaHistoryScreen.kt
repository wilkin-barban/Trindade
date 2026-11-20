package com.trindade.app.salida

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
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
import com.trindade.app.ui.resolve
import com.trindade.app.reports.SalidaReportCard
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.pluralStringResource
import com.trindade.app.R
import com.trindade.app.massas.MassasDayHeader
import com.trindade.app.ui.historyQuickDays
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
    /** Las fotos del movimiento vacío no existen; el parámetro deja la firma igual a la del día con datos. */
    photos: List<String> = emptyList(),
) {
    Column(modifier = modifier) {
        SalidaHistoryEmpty(isToday = isToday, onLaunch = onLaunch)
        Spacer(Modifier.height(12.dp))
        SalidaWhatsAppShare(
            text = shareText,
            photos = photos,
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
    /**
     * La cuenta que está mirando. Las fotos de un movimiento son de quien lo lanzó: las de otro operario -- o las
     * que vinieron del ERP -- se ven y no se tocan.
     */
    viewerUsername: String = "",
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

    // Un solo scroll para el día entero: el encabezado, el estado, las tarjetas de movimientos y, al final, el
    // bloque de WhatsApp. Antes las tarjetas vivían dentro de su propio `Column(weight)` en un contenedor sin
    // altura acotada -- la columna se colapsaba y el mensaje quedaba arriba, con el día invisible --.
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        // El mismo header que los demás históricos, sin contador: el número de días no es lo que el operario viene
        // a leer, y un contador arriba competía con el total del día que está adentro de cada tarjeta.
        HistoryHeader(
            title = stringResource(R.string.salida_history_title),
            // Sin «Voltar»: la barra superior tiene Lanzamiento al lado y el atrás físico cierra el archivo.
            onHelp = { showHelpDialog = true },
        )

        Spacer(Modifier.height(12.dp))

        // El día que el operario viene a mirar. Los chips son la única navegación que queda arriba, y en el
        // pasado lo único que se muestra debajo es el bloque de WhatsApp: el resto es información de un día que
        // ya se lanzó y no se toca.
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

        val summaryLabels = salidaSummaryLabels()

        if (salidaHistoryShowsDayBody(selected, today)) {
            // Hoy es el día que se consulta y se sincroniza. El pasado se queda con el share solo -- ni sync, ni
            // bloque del ERP, ni tarjetas --, que es la regla que el dueño pidió dos veces.
            SalidaErpBlock(
                isSyncing = state.erpSyncing,
                onSync = viewModel::syncSalidaDay,
                day = state.salidaDay,
                error = state.erpError,
                date = com.trindade.app.massas.brazilianDate(selected),
                syncedAt = state.lastSyncedAt?.substringAfter(' ')?.take(5),
            )
            LaunchedEffect(selected) { viewModel.loadSalidaDay(selected) }
        }

        if (!salidaHistoryShowsDayBody(selected, today)) {
            // Pasado: sólo el bloque de compartir, con el texto del servidor o la prévia vacía si ese día no tuvo
            // salidas. Sin tarjetas, sin fotos, sin filtros, sin pendientes y sin nota de solo lectura.
            SalidaWhatsAppShare(
                text = viewModel.dayShareText(summaryLabels),
                photos = days.firstOrNull { it.date == selected }?.movements.orEmpty()
                    .flatMap { movement -> movement.photos.mapNotNull { it.publicUrl ?: it.url } },
                phone = state.historyPhone,
                onPhoneChange = viewModel::onHistoryPhoneChange,
                walletLink = viewModel.historyWhatsAppLink(summaryLabels),
                onOpenWhatsApp = {
                    viewModel.historyWhatsAppLink(summaryLabels)?.let { onOpenWhatsApp(it) }
                },
            )
            return@Column
        }

        state.notice?.let { notice ->
            Text(
                notice.message,
                style = MaterialTheme.typography.bodySmall,
                color = if (notice.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

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

        val movements = days.firstOrNull { it.date == selected }?.movements.orEmpty()

        // El filtro por bloque es de la pantalla y no del servidor: los movimientos del día ya están acá.
        var block by remember { mutableStateOf<String?>(null) }

        // El día puede tener datos sólo del ERP: el mensaje se arma con los dos, y el vacío es para el día sin nada.
        val hasShareableData = salidaHasShareableData(movements.size, state.salidaDay?.operators.orEmpty())

        // El día vacío se dibuja como en la web: su estado -- con la puerta al lanzamiento si es hoy -- y,
        // debajo, el bloque de compartir con la prévia vacía y el envío deshabilitado. Ocultarlo dejaba al
        // operario sin saber si el día no tenía nada o si la pantalla no había cargado.
        if (!hasShareableData) {
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

        // Sin total suelto encima de las tarjetas: cada tarjeta ya dice sus unidades y su total, y el número
        // grande arriba -- «13 un» -- se leía como el total del día sin decir de qué.
        Column(modifier = Modifier.fillMaxWidth()) {
            movements
                .filter { movement -> block == null || movement.items.any { it.block.value == block } }
                .forEach { movement ->
                SalidaMovementCard(
                    movement = movement,
                    // Las fotos son de hoy: el pasado es el registro de lo que se lanzó, y la web esconde el
                    // selector en un día cerrado. El share y el reenvío pendiente siguen disponibles.
                    // Sólo hoy y sólo si el movimiento es de esta cuenta: el de otro operario se lee, como el
                    // asiento que vino del ERP.
                    onAddPhoto = if (selected == today && movement.owns(viewerUsername)) {
                        { pendingPhotoMovement = movement.id }
                    } else {
                        null
                    },
                    onDeletePhoto = if (selected == today && movement.owns(viewerUsername)) {
                        viewModel::deletePhoto
                    } else {
                        null
                    },
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
        if (hasShareableData) {
            SalidaWhatsAppShare(
                text = viewModel.dayShareText(summaryLabels),
                // Las fotos del día acompañan al mensaje: la miniatura dice qué viaja con el texto.
                photos = movements.flatMap { movement -> movement.photos.mapNotNull { it.publicUrl ?: it.url } },
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
fun salidaHistoryVisibleDates(today: String, dates: List<String>, all: Boolean): List<String> =
    (listOf(today) + historyQuickDays(today, dates, all)).distinct()

/**
 * Si el movimiento es de la cuenta que está mirando.
 *
 * La comparación es por `username` y sin mayúsculas: es la identidad con la que el movimiento se firmó, y es la
 * misma que el servidor guarda como dueño. Un nombre vacío -- una sesión sin nombre, un invitado -- no es dueño de
 * nada, y entonces sólo lee.
 */
internal fun SalidaCreateResponseMovement.owns(viewerUsername: String): Boolean =
    viewerUsername.isNotBlank() && username.equals(viewerUsername, ignoreCase = true)

/** El tag con el que un test encuentra la sincronización del espejo en este histórico. */
const val SALIDA_HISTORY_ERP_SYNC_TAG: String = "salida-history-erp-sync"

/** El spinner del botón, para que un test distinga «sincronizando» de «no pasó nada». */
const val SALIDA_HISTORY_ERP_SYNC_SPINNER_TAG: String = "salida-history-erp-sync-progress"

/**
 * Las salidas del ERP del día, con la acción que las trae. Sólo se dibuja en el día de hoy.
 *
 * Es el mismo bloque del Relatório (`SalidaReportCard`): la lectura es `reportsRepository.salidaDay` y el viaje es
 * `syncDay(..., includeExits = true)`, así que no hay una segunda forma de traerlas ni de nombrarlas. El botón no
 * escribe en Trindade: refresca el espejo y vuelve a leer, y su error -- sin credenciales, sin red, el ERP
 * rechazando -- se lee debajo, con la misma frase que el resto de la app.
 */
@Composable
internal fun SalidaErpBlock(
    isSyncing: Boolean,
    onSync: () -> Unit,
    day: com.trindade.app.contract.models.SalidaReportDayView?,
    error: com.trindade.app.ui.UiText?,
    modifier: Modifier = Modifier,
    /** La fecha del día elegido, como la escribe la planta: la línea «Data de Produção» del header. */
    date: String,
    /** La hora de la última lectura del espejo, o null cuando nunca se leyó. */
    syncedAt: String? = null,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // El mismo panel del archivo de Masas -- fecha, última lectura y la píldora tonal -- en vez de un botón
        // ámbar propio: una sola forma de sincronizar el espejo en toda la app. El tag se conserva para esta
        // pantalla a través del header.
        MassasDayHeader(
            date = date,
            syncedAt = syncedAt,
            isSyncing = isSyncing,
            onSync = onSync,
            readOnly = false,
            syncTestTag = SALIDA_HISTORY_ERP_SYNC_TAG,
            syncSpinnerTestTag = SALIDA_HISTORY_ERP_SYNC_SPINNER_TAG,
        )
        error?.let {
            Text(
                text = it.resolve(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        SalidaReportCard(day = day, error = null, modifier = Modifier.testTag("salida-history-erp-block"))
    }
}

/**
 * Si el día tiene algo que compartir: movimientos de Trindade o productos del ERP con unidades.
 *
 * Es la regla de la web, y la que decide si se dibuja la tarjeta del día vacío: un día con asientos del ERP a la
 * vista no está vacío, y su mensaje se arma con las dos fuentes.
 */
internal fun salidaHasShareableData(
    movements: Int,
    erpOperators: List<com.trindade.app.contract.models.SalidaReportDayViewOperatorsInner>,
): Boolean = movements > 0 || erpOperators.any { operator -> operator.products.any { it.units > 0 } }

/**
 * Si esta fecha muestra el día completo o sólo el bloque de WhatsApp.
 *
 * Hoy es el día que se lee y se opera, así que conserva producción, filtros, tarjetas, fotos y pendientes. Una
 * fecha pasada es el registro de lo que se lanzó: debajo de los chips queda únicamente el mensaje del servidor con
 * su acción, y nada más -- ni tarjetas, ni fotos, ni filtros, ni la nota de solo lectura.
 */
internal fun salidaHistoryShowsDayBody(selected: String, today: String): Boolean = selected == today

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
    onDeletePhoto: ((Int) -> Unit)? = null,
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
                        // Sin `onDeletePhoto` la foto se muestra y no se toca: es lo que un día cerrado permite.
                        onDeletePhoto?.let { delete ->
                            TextButton(
                                onClick = { delete(photo.id) },
                                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                            ) {
                                Text(stringResource(R.string.salida_photo_delete))
                            }
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
