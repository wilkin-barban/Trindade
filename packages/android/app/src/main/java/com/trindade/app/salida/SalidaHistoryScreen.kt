package com.trindade.app.salida

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.Image
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.sync.withPermit
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.res.painterResource
import androidx.compose.material3.Icon
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
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
import com.trindade.app.ui.components.ActionResultDialog
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
    // Una tarjeta de estado vacío, no una frase suelta: icono en su círculo tonal, el título, la explicación y -- en
    // hoy -- la acción de lanzar, con el mismo alto que el resto de los botones.
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        modifier = modifier.fillMaxWidth().testTag("salida-history-empty"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_truck),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(22.dp),
                )
            }
            Text(
                text = stringResource(
                    if (isToday) R.string.salida_history_empty_today else R.string.salida_history_empty_past,
                ),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = stringResource(R.string.salida_history_empty_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (isToday) {
                Button(
                    onClick = onLaunch,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("salida-empty-cta"),
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_package_minus),
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.salida_history_launch), style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

private const val SALIDA_MAX_PHOTOS = 3

@Composable
fun SalidaHistoryScreen(
    viewModel: SalidaViewModel,
    /**
     * La cuenta que está mirando. Las fotos de un movimiento son de quien lo lanzó: las de otro operario -- o las
     * que vinieron del ERP -- se ven y no se tocan.
     */
    viewerUsername: String = "",
    /** El Administrador puede retirar el borrador de otro operario, como en Massas. */
    viewerIsAdmin: Boolean = false,
    onOpenWhatsApp: (String) -> Unit = {},
    /** La vuelta al lanzamiento desde el día vacío de hoy. */
    onLaunch: () -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
    var showHelpDialog by remember { mutableStateOf(false) }
    // Al entrar y al volver a la app se relee el archivo: lo que la web creó mientras esta pantalla estaba en el
    // fondo tiene que aparecer sin reiniciar la app.
    LaunchedEffect(Unit) { viewModel.refreshHistoryFromServer() }
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) viewModel.refreshHistoryFromServer()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    // La foto se elige del carrete y se sube comprimida al movimiento que la pidió: la cámara del teléfono ya
    // deja el archivo en el carrete de la planta, así que una sola puerta alcanza para las dos.
    var pendingPhotoMovement by remember { mutableStateOf<Int?>(null) }
    val context = androidx.compose.ui.platform.LocalContext.current
    // La captura directa es la puerta que la web ofrece con `capture="environment"`: el operario apunta al
    // producto y la foto entra al movimiento sin pasar por el carrete. El archivo se escribe en la caché y se
    // comparte por FileProvider, igual que en el detalle del Relatório.
    var pendingCapture by remember { mutableStateOf<java.io.File?>(null) }
    // Qué movimiento está eligiendo cómo agregar su foto: la cámara o el carrete.
    var addPhotoMovement by remember { mutableStateOf<Int?>(null) }
    val capturePhoto = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.TakePicture(),
    ) { saved ->
        val movementId = pendingPhotoMovement
        val file = pendingCapture
        pendingPhotoMovement = null
        pendingCapture = null
        // Una captura cancelada deja un archivo vacío: comprimirlo daría un error sobre la foto cuando lo que
        // pasó es que el operario cerró la cámara.
        if (!saved || movementId == null || file == null) return@rememberLauncherForActivityResult
        viewModel.attachPhotoFromPath(movementId, file.absolutePath)
    }
    val pickPhotos = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia(3),
    ) { uris ->
        val movementId = pendingPhotoMovement
        pendingPhotoMovement = null
        if (movementId == null || uris.isEmpty()) return@rememberLauncherForActivityResult
        val movement = viewModel.state.value.history
            .flatMap { it.movements }
            .firstOrNull { it.id == movementId }
        if (movement == null) {
            viewModel.photoMovementUnavailable()
            return@rememberLauncherForActivityResult
        }
        if (movement.photos.size + uris.size > SALIDA_MAX_PHOTOS) {
            viewModel.photoLimitExceeded()
            return@rememberLauncherForActivityResult
        }
        uris.forEach { uri ->
            val path = com.trindade.app.reports.stagePickedPhoto(context, uri, prefix = "salida-")
            if (path != null) {
                viewModel.attachPhotoFromPath(movementId, path)
            }
        }
    }

    // La segunda puerta del carrete, para el diálogo de agregar foto.
    fun chooseGallery(movementId: Int) {
        pendingPhotoMovement = movementId
        pickPhotos.launch(
            androidx.activity.result.PickVisualMediaRequest(
                androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly,
            ),
        )
    }

    val today = state.date
    val selected = state.historyDate ?: today
    val days = state.history
    val visibleDates = salidaHistoryVisibleDates(today, days.map { it.date }, state.historyAll)
    val summaryLabels = salidaSummaryLabels()
    val movements = days.firstOrNull { it.date == selected }?.movements.orEmpty()
    var block by remember { mutableStateOf<String?>(null) }
    val hasShareableData = salidaHasShareableData(movements.size, state.salidaDay?.operators.orEmpty())
    if (salidaHistoryShowsDayBody(selected, today)) {
        LaunchedEffect(selected) { viewModel.loadSalidaDay(selected) }
    }

    // Cada tarjeta es un item perezoso: al salir de pantalla se descarta junto con sus miniaturas.
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("salida-history-list"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
        // El mismo header que los demás históricos, sin contador: el número de días no es lo que el operario viene
        // a leer, y un contador arriba competía con el total del día que está adentro de cada tarjeta.
        HistoryHeader(
            title = stringResource(R.string.salida_history_title),
            onHelp = { showHelpDialog = true },
        )
        }
        item {
        SalidaHistoryChips(
            dates = visibleDates,
            selected = selected,
            today = today,
            all = state.historyAll,
            onSelect = viewModel::selectHistoryDate,
            onToggleAll = viewModel::toggleHistoryAll,
        )
        }

        if (salidaHistoryShowsDayBody(selected, today)) {
            item {
            // Hoy es el día que se consulta y se sincroniza. El pasado se queda con el share solo -- ni sync, ni
            // bloque del ERP, ni tarjetas --, que es la regla que el dueño pidió dos veces.
            SalidaErpBlock(
                isSyncing = state.erpSyncing,
                onSync = viewModel::syncSalidaDay,
                day = state.salidaDay,
                date = com.trindade.app.massas.brazilianDate(selected),
                syncedAt = state.lastSyncedAt?.substringAfter(' ')?.take(5),
                showEmptyText = false,
            )
            }
        }

        if (!salidaHistoryShowsDayBody(selected, today)) {
            item {
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
                    val sharedWithPhotos = viewModel.shareDayWithPhotos(summaryLabels)
                    if (!sharedWithPhotos) viewModel.historyWhatsAppLink(summaryLabels)?.let { onOpenWhatsApp(it) }
                },
            )
            }
        } else {

        // El día vacío se dibuja como en la web: su estado -- con la puerta al lanzamiento si es hoy -- y,
        // debajo, el bloque de compartir con la prévia vacía y el envío deshabilitado. Ocultarlo dejaba al
        // operario sin saber si el día no tenía nada o si la pantalla no había cargado.
        if (!hasShareableData) {
            item {
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
            }
        } else {
        val blocks = movements.flatMap { movement -> movement.items.map { it.block.value } }.distinct().sorted()
        if (blocks.size > 1) {
            item {
            Column {
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
            }
        }

        // Sin total suelto encima de las tarjetas: cada tarjeta ya dice sus unidades y su total, y el número
        // grande arriba -- «13 un» -- se leía como el total del día sin decir de qué.
        val visibleMovements = movements.filter { movement -> block == null || movement.items.any { it.block.value == block } }
        items(visibleMovements, key = { it.id }) { movement ->
                SalidaMovementCard(
                    movement = movement,
                    loadPhoto = viewModel::photoBytes,
                    // Las fotos son de hoy: el pasado es el registro de lo que se lanzó, y la web esconde el
                    // selector en un día cerrado. El share y el reenvío pendiente siguen disponibles.
                    // Sólo hoy y sólo si el movimiento es de esta cuenta: el de otro operario se lee, como el
                    // asiento que vino del ERP.
                    onAddPhoto = if (selected == today && movement.owns(viewerUsername) && movement.photos.size < SALIDA_MAX_PHOTOS) {
                        { addPhotoMovement = movement.id }
                    } else {
                        null
                    },
                    onDeletePhoto = if (selected == today && movement.owns(viewerUsername)) {
                        viewModel::deletePhoto
                    } else {
                        null
                    },
                    onShare = {
                        // La hoja del sistema lleva el texto y las fotos de esta baja; sin hoja, el enlace de siempre.
                        if (!viewModel.shareMovementWithPhotos(movement, summaryLabels)) {
                            onOpenWhatsApp(viewModel.movementShareLink(movement, summaryLabels))
                        }
                    },
                    onResend = if (salidaOffersResend(movement, viewerUsername, viewerIsAdmin, viewModel.isPending(movement))) {
                        { viewModel.resendPending(movement, viewerUsername, viewerIsAdmin) }
                    } else {
                        null
                    },
                    onDelete = if (salidaOffersDelete(movement, viewerUsername, viewerIsAdmin)) {
                        { viewModel.requestDeleteMovement(movement) }
                    } else {
                        null
                    },
                )
        }
        }

        // El compartir es del día entero y vive donde el día se lee: con el mensaje armado desde la tabla
        // de abreviaturas, la prévia a la vista y una sola acción. El día vacío monta su propio bloque, con la
        // prévia vacía y el envío deshabilitado, junto al estado que lo explica.
        if (hasShareableData) {
            item {
            SalidaWhatsAppShare(
                text = viewModel.dayShareText(summaryLabels),
                // Las fotos del día acompañan al mensaje: la miniatura dice qué viaja con el texto.
                photos = movements.flatMap { movement -> movement.photos.mapNotNull { it.publicUrl ?: it.url } },
                phone = state.historyPhone,
                onPhoneChange = viewModel::onHistoryPhoneChange,
                walletLink = viewModel.historyWhatsAppLink(summaryLabels),
                onOpenWhatsApp = {
                    // El general del día va con sus fotos en la hoja del sistema; si no hay fotos -- o no hay con
                    // qué bajarlas -- se abre el chat de siempre.
                    val sharedWithPhotos = viewModel.shareDayWithPhotos(summaryLabels)
                    if (!sharedWithPhotos) viewModel.historyWhatsAppLink(summaryLabels)?.let { onOpenWhatsApp(it) }
                },
            )
            }
        }
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

    // Agregar una foto tiene dos puertas, como la web: la cámara para apuntar al producto y el carrete para una
    // foto que ya existe. La captura escribe en la caché y se comparte por FileProvider.
    addPhotoMovement?.let { movementId ->
        com.trindade.app.reports.PhotoSourceChooserDialog(
            title = stringResource(R.string.salida_photo_title),
            prompt = stringResource(R.string.salida_photo_add),
            cameraButtonTag = "salida-photo-camera",
            galleryButtonTag = "salida-photo-gallery",
            onTakePhoto = {
                addPhotoMovement = null
                val file = com.trindade.app.reports.newCaptureFile(context)
                pendingCapture = file
                pendingPhotoMovement = movementId
                capturePhoto.launch(
                    androidx.core.content.FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        file,
                    ),
                )
            },
            onPickFromGallery = {
                addPhotoMovement = null
                chooseGallery(movementId)
            },
            onDismiss = { addPhotoMovement = null },
        )
    }

    // La confirmación del borrado: una acción que quita una baja se pregunta antes, y la frase dice qué se va.
    state.deleteCandidate?.let { movement ->
        AlertDialog(
            onDismissRequest = viewModel::cancelDeleteMovement,
            title = { Text(stringResource(R.string.salida_delete_confirm_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.salida_delete_confirm_body,
                        com.trindade.app.massas.brazilianDate(movement.movementDate),
                        movement.totalUnits,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = viewModel::confirmDeleteMovement,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag("salida-delete-confirm"),
                ) {
                    Text(stringResource(R.string.salida_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = viewModel::cancelDeleteMovement,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag("salida-delete-cancel"),
                ) {
                    Text(stringResource(R.string.salida_cancel))
                }
            },
        )
    }

    // Lo que una acción o el espejo respondieron se lee en una ventana con Cerrar: la tabla de abajo ya cambió y un
    // cartel dentro de ella se lee como parte del estado que se está mirando.
    if (state.notice != null && state.erpError == null) {
        val notice = state.notice!!
        SalidaNoticeDialog(notice.localizedMessage?.resolve() ?: notice.message, notice.isError, viewModel::dismissNotice)
    }
    state.erpError?.let { erpError ->
        SalidaNoticeDialog(erpError.resolve(), true, viewModel::dismissErpError)
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
/**
 * Si la tarjeta ofrece Excluir.
 *
 * La regla es del servidor y esto sólo evita ofrecer lo que va a rechazar: el dueño o el Administrador, y el ERP
 * sin confirmar. Un movimiento `sent` o `partial` es un hecho de la empresa; el resto -- nulo, `failed` -- es un
 * borrador que se puede retirar.
 */
internal fun salidaOffersDelete(
    movement: com.trindade.app.contract.models.SalidaCreateResponseMovement,
    viewerUsername: String,
    viewerIsAdmin: Boolean,
): Boolean {
    if (!viewerIsAdmin && !movement.owns(viewerUsername)) return false
    val status = movement.erp?.status?.value
    return status != "sent" && status != "partial"
}

/**
 * ¿Se le ofrece a esta cuenta reenviar el documento al ERP?
 *
 * Reenviar escribe en la empresa: la baja viaja a nombre del operario que la lanzó. Por eso la oferta es del
 * dueño del movimiento o de un administrador, y no de cualquiera que abra el histórico del día.
 */
internal fun salidaOffersResend(
    movement: com.trindade.app.contract.models.SalidaCreateResponseMovement,
    viewerUsername: String,
    viewerIsAdmin: Boolean,
    isPending: Boolean,
): Boolean = isPending && (viewerIsAdmin || movement.owns(viewerUsername))

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
    modifier: Modifier = Modifier,
    /** La fecha del día elegido, como la escribe la planta: la línea «Data de Produção» del header. */
    date: String,
    /** La hora de la última lectura del espejo, o null cuando nunca se leyó. */
    syncedAt: String? = null,
    /**
     * Si la tarjeta del ERP explica el día vacío. El histórico lo apaga: su propia tarjeta de estado vacío ya lo
     * dice, con la acción al lado.
     */
    showEmptyText: Boolean = true,
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
        SalidaReportCard(
            day = day,
            error = null,
            showEmptyText = showEmptyText,
            modifier = Modifier.testTag("salida-history-erp-block"),
        )
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
                label = { Text(if (date == today) stringResource(R.string.massas_history_today) else com.trindade.app.massas.brazilianDate(date)) },
                modifier = Modifier
                    .defaultMinSize(minHeight = 44.dp)
                    .testTag(if (date == today) "salida-history-today" else "salida-history-chip-$date"),
            )
        }
        FilterChip(
            selected = all,
            onClick = onToggleAll,
            label = { Text(stringResource(if (all) R.string.massas_history_recent_dates else R.string.massas_history_all_dates)) },
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

/** Una acción de la grilla 2×2 de la tarjeta: su etiqueta, su tag y si es destructiva. */
private data class SalidaCardAction(
    val testTag: String,
    val label: String,
    val onClick: () -> Unit,
    val destructive: Boolean = false,
)

/** Decodifica solo una versión muestreada: nunca reserva primero la imagen a resolución completa. */
internal fun decodeSalidaThumbnail(bytes: ByteArray): android.graphics.Bitmap? {
    if (bytes.isEmpty() || bytes.size > 5 * 1024 * 1024) return null
    return try {
        val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val longest = maxOf(bounds.outWidth, bounds.outHeight).toLong()
        var sample = 1
        while ((longest + sample - 1) / sample > 128L) sample *= 2
        val options = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
        val decodedLongest = maxOf(decoded.width, decoded.height)
        if (decodedLongest <= 128) return decoded
        val width = maxOf(1, (decoded.width.toLong() * 128 / decodedLongest).toInt())
        val height = maxOf(1, (decoded.height.toLong() * 128 / decodedLongest).toInt())
        try {
            android.graphics.Bitmap.createScaledBitmap(decoded, width, height, true)
        } finally {
            decoded.recycle()
        }
    } catch (_: RuntimeException) {
        null
    }
}

@Composable
private fun SalidaPhotoThumbnail(
    photoId: Int,
    position: Int,
    loadPhoto: (suspend (Int) -> ByteArray?)?,
) {
    var loading by remember(photoId) { mutableStateOf(true) }
    var bitmap by remember(photoId) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    LaunchedEffect(photoId) {
        var decoded: android.graphics.Bitmap? = null
        try {
            withContext(Dispatchers.IO) {
                val bytes = loadPhoto?.invoke(photoId)
                if (bytes != null) {
                    salidaThumbnailSemaphore.withPermit { decoded = decodeSalidaThumbnail(bytes) }
                }
            }
            bitmap = decoded?.asImageBitmap()
            loading = false
            // Mantener el bitmap solo mientras este item perezoso permanezca compuesto.
            awaitCancellation()
        } finally {
            bitmap = null
            decoded?.recycle()
        }
    }
    val image = bitmap
    when {
        image != null -> Image(
            bitmap = image,
            contentDescription = stringResource(R.string.salida_photo_number, position),
            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            modifier = Modifier.size(56.dp).padding(end = 8.dp),
        )
        loading -> CircularProgressIndicator(modifier = Modifier.size(32.dp).padding(end = 8.dp), strokeWidth = 2.dp)
        else -> Text(
            stringResource(R.string.salida_photo_unavailable),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(end = 8.dp),
        )
    }
}

@Composable
internal fun SalidaMovementCard(
    movement: SalidaCreateResponseMovement,
    onAddPhoto: (() -> Unit)? = null,
    onDeletePhoto: ((Int) -> Unit)? = null,
    onShare: (() -> Unit)? = null,
    onResend: (() -> Unit)? = null,
    /**
     * Retirar el borrador. La pantalla lo ofrece sólo cuando el servidor lo va a aceptar -- el propio operario o el
     * Administrador, y el ERP sin confirmar --; el servidor decide igual.
     */
    onDelete: (() -> Unit)? = null,
    loadPhoto: (suspend (Int) -> ByteArray?)? = null,
) {
    // La misma ficha que el histórico de Masas: superficie tonal, esquinas del tema, 16 dp por dentro y la
    // jerarquía fecha/operador/estado arriba, productos en el medio, total al pie. No es una caja blanca con
    // renglones: es la tarjeta de producto de la app.
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).testTag("salida-movement-${movement.id}"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = com.trindade.app.massas.brazilianDate(movement.movementDate) +
                            " · " + movement.createdAt.substringAfter('T').take(5),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = movement.displayName?.takeIf { it.isNotBlank() } ?: movement.username.uppercase(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                ) {
                    Text(
                        text = statusLabel(movement.erp?.status),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }
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
                movement.photos.forEachIndexed { index, photo ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        SalidaPhotoThumbnail(photo.id, index + 1, loadPhoto)
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
            // FlowRow y no Row: tres acciones con nombre no entran en 390 dp y «Reenviar ao ERP» se partía en una
            // columna de letras. Cada botón conserva sus 48 dp y baja a la línea siguiente cuando no entra.
            // Cuatro acciones en una grilla 2×2 de columnas iguales: dos filas con `weight(1f)`, no un FlowRow
            // de anchos intrínsecos, que dejaba "Adicionar foto"/"Reenviar ao ERP" más anchos que el resto. Orden:
            // foto | compartilhar, reenviar | excluir. Cada botón mide lo mismo: 48 dp y la misma tipografía.
            val actionRows = listOf(
                listOfNotNull(
                    onAddPhoto?.let { photo ->
                        SalidaCardAction(
                            testTag = "salida-photo-picker",
                            label = stringResource(R.string.salida_photo_add),
                            onClick = photo,
                        )
                    },
                    onShare?.let { share ->
                        SalidaCardAction(
                            testTag = "salida-share-${movement.id}",
                            label = stringResource(R.string.salida_share),
                            onClick = share,
                        )
                    },
                ),
                listOfNotNull(
                    onResend?.let { resend ->
                        SalidaCardAction(
                            testTag = "salida-resend-${movement.id}",
                            label = stringResource(R.string.salida_resend_short),
                            onClick = resend,
                        )
                    },
                    onDelete?.let { delete ->
                        SalidaCardAction(
                            testTag = "salida-delete-${movement.id}",
                            label = stringResource(R.string.salida_delete),
                            onClick = delete,
                            destructive = true,
                        )
                    },
                ),
            ).filter { it.isNotEmpty() }

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                actionRows.forEach { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        row.forEach { action ->
                            OutlinedButton(
                                onClick = action.onClick,
                                // El primario del tema es el rojo de la marca: usarlo acá pintaba de rojo las cuatro
                                // acciones. Sólo la destructiva es roja; las demás van en el tono neutro de la
                                // superficie, como los botones de las tarjetas de Masas.
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = salidaActionContentColor(
                                        destructive = action.destructive,
                                        colors = MaterialTheme.colorScheme,
                                    ),
                                ),
                                contentPadding = PaddingValues(horizontal = 8.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth()
                                    .defaultMinSize(minHeight = 48.dp)
                                    .testTag(action.testTag),
                            ) {
                                Text(
                                    text = action.label,
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                )
                            }
                        }
                        // Una fila con un solo botón conserva el medio ancho de la grilla: el par no se estira
                        // cuando falta la otra acción (un día de solo lectura, por ejemplo).
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }

    
}

/** El resultado de una acción del histórico, en la ventana que el resto de la app usa. */
@Composable
internal fun SalidaNoticeDialog(
    message: String,
    isError: Boolean,
    onDismiss: () -> Unit,
    title: String? = null,
) {
    ActionResultDialog(
        message = if (title.isNullOrBlank()) message else "$title\n\n$message",
        isSuccess = !isError,
        onDismiss = onDismiss,
    )
}

/**
 * El color del texto de una acción de la tarjeta.
 *
 * El rojo es del error y de nada más: el color primario de la app también es rojo, así que una acción normal no
 * puede tomarlo. Las tres acciones normales usan `onSurface`; Excluir, `error`.
 */
internal fun salidaActionContentColor(
    destructive: Boolean,
    colors: androidx.compose.material3.ColorScheme,
): androidx.compose.ui.graphics.Color = if (destructive) colors.error else colors.onSurface
