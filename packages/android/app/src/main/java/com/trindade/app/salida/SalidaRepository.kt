package com.trindade.app.salida

import okhttp3.RequestBody.Companion.toRequestBody

import okhttp3.MediaType.Companion.toMediaType

import okhttp3.MultipartBody

import com.trindade.app.aero.AeroAudit
import com.trindade.app.aero.AeroAuditAttempt
import com.trindade.app.aero.AeroFailureCode
import com.trindade.app.aero.AeroMirrorPort
import com.trindade.app.aero.aeroEndpoint
import com.trindade.app.aero.auditCode
import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroSettings
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.aero.AeroWriteResult
import com.trindade.app.aero.failure
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaHistoryResponseDaysInner
import com.trindade.app.contract.models.SalidaErpResultRequest
import com.trindade.app.contract.models.SalidaMovementErp
import com.trindade.app.network.SalidaApi
import com.trindade.app.network.toCreateRequest
import javax.inject.Inject
import com.trindade.app.di.NetworkModule.BackendClient
import com.trindade.app.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okio.Buffer
import okhttp3.Request
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

internal val salidaThumbnailSemaphore = Semaphore(3)

/** Cómo terminó el retiro de un borrador. La frase del 409 es del servidor, no de la pantalla. */
sealed interface SalidaPhotoOutcome {
    data object Saved : SalidaPhotoOutcome
    data object Limit : SalidaPhotoOutcome
    data object Failed : SalidaPhotoOutcome
}

sealed interface SalidaDeleteOutcome {
    data object Deleted : SalidaDeleteOutcome
    data class Failed(val message: String) : SalidaDeleteOutcome
}

/** El resultado de mandar una baza al ERP, tal como la pantalla lo cuenta. */
sealed interface SalidaErpOutcome {
    data class Complete(val documents: Int) : SalidaErpOutcome
    data class Partial(val sent: Int, val failed: Int, val message: String?) : SalidaErpOutcome
    data class Failed(val message: String?) : SalidaErpOutcome
    data object NotConfigured : SalidaErpOutcome
    data object Skipped : SalidaErpOutcome
}

/**
 * La baja: primero Trindade, después el ERP.
 *
 * El orden no es un detalle de implementación: el movimiento queda escrito en el servidor aunque el viaje al ERP
 * falle, y lo que quedó sin mandar espera en [SalidaOutboxStore]. Una baja que existe en Trindade y no en el ERP es
 * un pendiente que el operario puede reintentar; una que solo existe en el ERP no la puede corregir nadie.
 */
@Singleton
open class SalidaRepository @Inject constructor(
    private val api: SalidaApi,
    private val erpClient: AeroErpClient,
    private val settings: AeroSettingsPort,
    private val outbox: SalidaOutboxPort,
    private val audit: SalidaAudit,
    @BackendClient private val photoClient: OkHttpClient? = null,
) {

    open suspend fun catalog(): List<SalidaCatalog.Product> = withContext(Dispatchers.IO) {
        val response = api.catalog()
        if (response.isSuccessful) {
            response.body()?.products?.map { product ->
                SalidaCatalog.Product(
                    code = product.code,
                    name = product.name,
                    block = product.block.value,
                )
            } ?: SalidaCatalog.products
        } else {
            SalidaCatalog.products
        }
    }

    /** Escribe la baja en Trindade; el ERP se entera después. */
    open suspend fun create(selection: SalidaSelection): Result<SalidaCreateResponseMovement> =
        withContext(Dispatchers.IO) {
            runCatching {
                val response = api.create(selection.toCreateRequest())
                val movement = response.body()?.movement
                if (!response.isSuccessful || movement == null) {
                    error("HTTP ${response.code()}")
                }
                movement
            }
        }

    open fun hasPendingOutbox(movementId: Int): Boolean =
        outbox.loadFor(movementId)?.pendingTrips?.flatten()?.isNotEmpty() == true

    open fun pendingItemCount(movement: SalidaCreateResponseMovement?): Int {
        val fromOutbox = if (movement != null) outbox.loadFor(movement.id) else outbox.load()
        val queuedCount = fromOutbox?.pendingTrips?.sumOf { it.size } ?: 0
        return if (queuedCount > 0) queuedCount else (movement?.items?.size ?: 1).coerceAtLeast(1)
    }

    /**
     * Manda al ERP lo que la baja tiene para mandar, y deja en la cola lo que no salió.
     *
     * Persiste la cola antes del primer POST y descuenta cada payload confirmado conforme el ERP
     * responde, para que un corte por timeout o red nunca duplique ítems ni pierda el veredicto.
     */
    open suspend fun sendToErp(movement: SalidaCreateResponseMovement, username: String?): SalidaErpOutcome =
        withContext(Dispatchers.IO) {
            val lines = movement.items.map { SalidaLine(it.productCode, it.quantity) }
            val payloads = SalidaErpPayload.payloads(SalidaSelection(lines), movement.movementDate, username)
            if (payloads.isEmpty()) return@withContext SalidaErpOutcome.Skipped

            val credentials = credentials()
            if (credentials == null) {
                outbox.save(SalidaOutbox(movement.id, movement.movementDate, SalidaErpPayload.trips(payloads)))
                return@withContext finish(movement, SalidaErpOutcome.NotConfigured)
            }

            dispatchPayloads(
                movementId = movement.id,
                date = movement.movementDate,
                initialPayloads = payloads,
                credentials = credentials,
                priorPartial = false,
            )
        }

    /**
     * Retoma lo que quedó pendiente, si hay algo.
     *
     * La cola es la fuente principal, porque guarda los documentos armados con la fecha del día en que salieron.
     * Pero una cola puede faltar -- el teléfono se reinstaló, el archivo se perdió, el operario limpió los datos --
     * y el movimiento en Trindade queda clavado en `failed` sin nada que reintentar. Para ese caso el llamador
     * pasa el movimiento: si el servidor lo tiene en fallo, sus ítems alcanzan para rearmar los documentos, con
     * la fecha del movimiento y no la de hoy.
     */
    open suspend fun retryPending(
        movement: SalidaCreateResponseMovement? = null,
        username: String? = null,
    ): SalidaErpOutcome = withContext(Dispatchers.IO) {
        val pending = if (movement != null) {
            outbox.loadFor(movement.id) ?: rebuild(movement, username)
        } else {
            outbox.load()
        } ?: return@withContext SalidaErpOutcome.Skipped
        val credentials = credentials() ?: return@withContext SalidaErpOutcome.NotConfigured
        val priorPartial = movement?.erp?.status == SalidaMovementErp.Status.partial

        dispatchPayloads(
            movementId = pending.movementId,
            date = pending.date,
            initialPayloads = pending.pendingTrips.flatten(),
            credentials = credentials,
            priorPartial = priorPartial,
        )
    }

    private suspend fun dispatchPayloads(
        movementId: Int,
        date: String,
        initialPayloads: List<SaidaItemPayload>,
        credentials: AeroSettings,
        priorPartial: Boolean,
    ): SalidaErpOutcome {
        if (initialPayloads.isEmpty()) {
            outbox.clearFor(movementId)
            return SalidaErpOutcome.Skipped
        }
        val stillOwed = initialPayloads.toMutableList()
        // Save the full pending payload list before the first HTTP call so any timeout or crash leaves unsent rows recoverable.
        outbox.save(SalidaOutbox(movementId, date, SalidaErpPayload.trips(stillOwed)))

        var sent = 0
        var failed = 0
        var message: String? = null
        var completedNormally = false

        try {
            val snapshot = stillOwed.toList()
            for ((index, payload) in snapshot.withIndex()) {
                val result = audit.recordWrite(movementId, credentials.wsUrl) {
                    erpClient.postExit(credentials.wsUrl, credentials.username, credentials.password, payload)
                }
                when (result) {
                    is AeroWriteResult.Ok -> {
                        sent += 1
                        stillOwed.remove(payload)
                        persistRemainingOutbox(movementId, date, stillOwed)
                    }
                    is AeroWriteResult.Failed -> {
                        if (message == null) message = result.message ?: "HTTP ${result.httpStatus}"
                        if (result.failure.code != AeroFailureCode.ERP_REFUSED) {
                            failed += snapshot.size - index
                            break
                        }
                        failed += 1
                    }
                }
            }
            completedNormally = true
        } finally {
            if (!completedNormally) {
                withContext(NonCancellable) {
                    persistRemainingOutbox(movementId, date, stillOwed)
                    val interruptedStatus =
                        if (sent > 0 || priorPartial) SalidaErpResultRequest.Status.partial
                        else SalidaErpResultRequest.Status.failed
                    recordStatus(movementId, interruptedStatus)
                }
            }
        }

        val outcome = when {
            failed == 0 -> SalidaErpOutcome.Complete(sent)
            sent == 0 -> SalidaErpOutcome.Failed(message)
            else -> SalidaErpOutcome.Partial(sent, failed, message)
        }
        val status = when {
            failed == 0 -> SalidaErpResultRequest.Status.sent
            sent > 0 || priorPartial -> SalidaErpResultRequest.Status.partial
            else -> SalidaErpResultRequest.Status.failed
        }
        recordStatus(movementId, status)
        return outcome
    }

    private fun persistRemainingOutbox(
        movementId: Int,
        date: String,
        remaining: List<SaidaItemPayload>,
    ) {
        if (remaining.isEmpty()) {
            outbox.clearFor(movementId)
        } else {
            outbox.save(SalidaOutbox(movementId, date, SalidaErpPayload.trips(remaining)))
        }
    }

    /**
     * Rearma la cola desde los ítems del movimiento cuando no hay nada guardado.
     *
     * Solo para un movimiento que el servidor tiene sin confirmar o en fallo: rearmar uno conciliado o parcial
     * inventaría un segundo envío de algo que el ERP ya recibió.
     */
    private fun rebuild(
        movement: SalidaCreateResponseMovement?,
        username: String?,
    ): SalidaOutbox? {
        if (movement == null) return null
        val erpStatus = movement.erp?.status
        if (erpStatus != null && erpStatus != SalidaMovementErp.Status.failed) return null
        val lines = movement.items.map { SalidaLine(it.productCode, it.quantity) }
        val payloads = SalidaErpPayload.payloads(
            SalidaSelection(lines),
            movement.movementDate,
            username ?: movement.username,
        )
        if (payloads.isEmpty()) return null
        val rebuilt = SalidaOutbox(movement.id, movement.movementDate, SalidaErpPayload.trips(payloads))
        outbox.save(rebuilt)
        return rebuilt
    }

    /**
     * Los días del histórico, cada uno con sus movimientos y su total.
     *
     * Aplanarlos acá perdía la fecha y el total del día, que es justo lo que la pantalla necesita para mostrar
     * hoy, las cinco fechas anteriores y el resto: el contrato ya manda los días agrupados y el repositorio los
     * devuelve como llegan.
     */
    open suspend fun history(): List<SalidaHistoryResponseDaysInner> = withContext(Dispatchers.IO) {
        api.history().body()?.days ?: emptyList()
    }

    /**
     * Las fotos del movimiento, o null cuando el servidor no puede contestar.
     *
     * Una lista vacía es un movimiento sin evidencia; null es una lectura que falló, y la pantalla las distingue
     * porque no es lo mismo «no hay fotos» que «no se pudieron leer».
     */
    suspend fun photos(movementId: Int): List<com.trindade.app.contract.models.PhotosResponsePhotosInner>? =
        withContext(Dispatchers.IO) {
            val response = runCatching { api.photos(movementId) }.getOrNull() ?: return@withContext null
            if (!response.isSuccessful) return@withContext null
            response.body()?.photos
        }

    /** Sube una foto ya comprimida a JPEG; el tipo declarado tiene que coincidir con los bytes. */
    suspend fun attachPhoto(movementId: Int, jpeg: ByteArray): SalidaPhotoOutcome = withContext(Dispatchers.IO) {
        val part = MultipartBody.Part.createFormData(
            name = "file",
            filename = "photo.jpg",
            body = jpeg.toRequestBody("image/jpeg".toMediaType()),
        )
        val response = runCatching { api.uploadPhoto(movementId, part) }.getOrNull()
            ?: return@withContext SalidaPhotoOutcome.Failed
        if (response.isSuccessful) return@withContext SalidaPhotoOutcome.Saved
        val code = runCatching { org.json.JSONObject(response.errorBody()?.string().orEmpty()).optString("code") }.getOrNull()
        if (response.code() == 409 && code == "SALIDA_PHOTO_LIMIT") SalidaPhotoOutcome.Limit
        else SalidaPhotoOutcome.Failed
    }

    /** Solo una ruta construida por id hacia el backend propio recibe el cliente autenticado. */
    suspend fun photoBytes(photoId: Int): ByteArray? = withContext(Dispatchers.IO) {
        if (photoId <= 0) return@withContext null
        val client = photoClient ?: return@withContext null
        val base = BuildConfig.API_BASE_URL.toHttpUrlOrNull() ?: return@withContext null
        val normalized = base.newBuilder().encodedPath(base.encodedPath.trimEnd('/') + "/")
            .query(null).fragment(null).build()
        val url = normalized.resolve("api/salida/photos/$photoId") ?: return@withContext null
        // La misma cota cubre descargas y decodificaciones, también en reintentos sin redirecciones.
        val noRedirects = client.newBuilder().followRedirects(false).followSslRedirects(false).build()
        salidaThumbnailSemaphore.withPermit {
            runCatching {
                val request = Request.Builder().url(url).build()
                noRedirects.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@use null
                    val body = response.body ?: return@use null
                    val maxBytes = 5L * 1024 * 1024
                    if (body.contentLength() > maxBytes) return@use null
                    val source = body.source()
                    val buffer = Buffer()
                    var total = 0L
                    while (true) {
                        val read = source.read(buffer, minOf(8192L, maxBytes + 1 - total))
                        if (read == -1L) break
                        total += read
                        if (total > maxBytes) return@use null
                    }
                    buffer.readByteArray()
                }
            }.getOrNull()
        }
    }

    /**
     * Retira un movimiento que el ERP todavía no confirmó.
     *
     * El servidor manda: el dueño o el Administrador, y sólo mientras el veredicto sea nulo, `pending` o `failed`.
     * Un 409 trae la frase que explica por qué no se puede, y esa frase es la que la ventana muestra.
     */
    suspend fun deleteMovement(movementId: Int): SalidaDeleteOutcome = withContext(Dispatchers.IO) {
        val response = runCatching { api.deleteMovement(movementId) }.getOrNull()
            ?: return@withContext SalidaDeleteOutcome.Failed("No se pudo conectar con el servidor.")
        if (response.isSuccessful) return@withContext SalidaDeleteOutcome.Deleted
        val body = runCatching { response.errorBody()?.string() }.getOrNull()
        val message = body?.let { raw ->
            runCatching {
                org.json.JSONObject(raw).optString("error").takeIf { it.isNotBlank() }
            }.getOrNull()
        } ?: "No se pudo excluir el movimiento."
        SalidaDeleteOutcome.Failed(message)
    }

    /** Borra una foto del movimiento. */
    suspend fun deletePhoto(photoId: Int): Boolean = withContext(Dispatchers.IO) {
        val response = runCatching { api.deletePhoto(photoId) }.getOrNull() ?: return@withContext false
        response.isSuccessful
    }

    open suspend fun day(date: String): List<SalidaCreateResponseMovement> = withContext(Dispatchers.IO) {
        api.day(date).body()?.movements ?: emptyList()
    }

    private suspend fun finish(
        movement: SalidaCreateResponseMovement,
        outcome: SalidaErpOutcome,
    ): SalidaErpOutcome = recordVerdict(movement.id, outcome)

    /** Escribe en Trindade el veredicto del viaje: es lo que el histórico muestra como estado del documento. */
    private suspend fun recordVerdict(movementId: Int, outcome: SalidaErpOutcome): SalidaErpOutcome {
        val status = when (outcome) {
            is SalidaErpOutcome.Complete -> SalidaErpResultRequest.Status.sent
            is SalidaErpOutcome.Partial -> SalidaErpResultRequest.Status.partial
            is SalidaErpOutcome.Failed -> SalidaErpResultRequest.Status.failed
            else -> return outcome
        }
        recordStatus(movementId, status)
        return outcome
    }

    private suspend fun recordStatus(movementId: Int, status: SalidaErpResultRequest.Status) {
        // El servidor guarda el veredicto y la auditoría del viaje: es lo que el histórico muestra como estado.
        runCatching { api.recordErpResult(movementId, SalidaErpResultRequest(status = status)) }
    }

    private suspend fun credentials(): AeroSettings? {
        val current = settings.load()
        return current.takeIf { it.ready }
    }
}

/** La auditoría de la baja, con el mismo nombre de evento que la web. */
@Singleton
class SalidaAudit @Inject constructor(private val mirror: AeroMirrorPort) {
    suspend fun recordWrite(movementId: Int, wsUrl: String, write: suspend () -> AeroWriteResult): AeroWriteResult {
        val attempt = AeroAuditAttempt(AeroAudit.Event.SALIDA_SYNC, aeroEndpoint(wsUrl, "saidasitem"))
        val detail = "movement=$movementId"
        mirror.log(attempt.requested(detail = detail))
        val start = System.nanoTime()
        val result = write()
        val failure = result as? AeroWriteResult.Failed
        mirror.log(attempt.result(
            detail = detail,
            httpStatus = failure?.httpStatus,
            durationMs = (System.nanoTime() - start) / 1_000_000L,
            error = failure?.let { it.code?.auditCode ?: "erp_write_failed" },
        ))
        return result
    }
}
