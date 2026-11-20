package com.trindade.app.salida

import okhttp3.RequestBody.Companion.toRequestBody

import okhttp3.MediaType.Companion.toMediaType

import okhttp3.MultipartBody

import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroSettings
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.aero.AeroWriteResult
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaHistoryResponseDaysInner
import com.trindade.app.contract.models.SalidaErpResultRequest
import com.trindade.app.network.SalidaApi
import com.trindade.app.network.toCreateRequest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Cómo terminó el retiro de un borrador. La frase del 409 es del servidor, no de la pantalla. */
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
class SalidaRepository @Inject constructor(
    private val api: SalidaApi,
    private val erpClient: AeroErpClient,
    private val settings: AeroSettingsPort,
    private val outbox: SalidaOutboxStore,
    private val audit: SalidaAudit,
) {

    suspend fun catalog(): List<SalidaCatalog.Product> = withContext(Dispatchers.IO) {
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
    suspend fun create(selection: SalidaSelection): Result<SalidaCreateResponseMovement> =
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

    /**
     * Manda al ERP lo que la baja tiene para mandar, y deja en la cola lo que no salió.
     *
     * Tres documentos por viaje como máximo, y cada viaje con su resultado: el que entró se marca, y el que no
     * deja la cola como estaba para el próximo intento.
     */
    suspend fun sendToErp(movement: SalidaCreateResponseMovement, username: String?): SalidaErpOutcome =
        withContext(Dispatchers.IO) {
            val lines = movement.items.map { SalidaLine(it.productCode, it.quantity) }
            val payloads = SalidaErpPayload.payloads(SalidaSelection(lines), movement.movementDate, username)
            if (payloads.isEmpty()) return@withContext SalidaErpOutcome.Skipped

            val credentials = credentials()
                ?: return@withContext finish(movement, SalidaErpOutcome.NotConfigured)

            var sent = 0
            var failed = 0
            var message: String? = null
            val trips = SalidaErpPayload.trips(payloads)
            var queue = SalidaOutbox(movement.id, movement.movementDate, trips)

            for (trip in trips) {
                queue = queue.copy(trips = trips)
                var tripOk = true
                for (payload in trip) {
                    val result = erpClient.postExit(credentials.wsUrl, credentials.username, credentials.password, payload)
                    when (result) {
                        is AeroWriteResult.Ok -> sent += 1
                        is AeroWriteResult.Failed -> {
                            tripOk = false
                            failed += 1
                            message = result.message ?: "HTTP ${result.httpStatus}"
                        }
                    }
                }
                if (!tripOk) {
                    // La cola guarda los viajes que faltan desde este, con sus documentos intactos.
                    outbox.save(queue.copy(done = trips.indexOf(trip)))
                    break
                }
                queue = outbox.advance(queue) ?: queue.copy(done = trips.size)
            }

            val outcome = when {
                failed == 0 -> SalidaErpOutcome.Complete(sent)
                sent == 0 -> SalidaErpOutcome.Failed(message)
                else -> SalidaErpOutcome.Partial(sent, failed, message)
            }
            finish(movement, outcome)
        }

    /** Retoma lo que quedó pendiente, si hay algo. */
    suspend fun retryPending(): SalidaErpOutcome = withContext(Dispatchers.IO) {
        val pending = outbox.load() ?: return@withContext SalidaErpOutcome.Skipped
        val credentials = credentials() ?: return@withContext SalidaErpOutcome.NotConfigured
        var sent = 0
        var failed = 0
        var message: String? = null
        var queue = pending
        for (trip in pending.pendingTrips) {
            var tripOk = true
            for (payload in trip) {
                when (val result = erpClient.postExit(credentials.wsUrl, credentials.username, credentials.password, payload)) {
                    is AeroWriteResult.Ok -> sent += 1
                    is AeroWriteResult.Failed -> {
                        tripOk = false
                        failed += 1
                        message = result.message ?: "HTTP ${result.httpStatus}"
                    }
                }
            }
            if (!tripOk) {
                outbox.save(queue.copy(done = queue.trips.indexOf(trip)))
                break
            }
            queue = outbox.advance(queue) ?: queue.copy(done = queue.trips.size)
        }
        when {
            failed == 0 -> SalidaErpOutcome.Complete(sent)
            sent == 0 -> SalidaErpOutcome.Failed(message)
            else -> SalidaErpOutcome.Partial(sent, failed, message)
        }
    }

    /**
     * Los días del histórico, cada uno con sus movimientos y su total.
     *
     * Aplanarlos acá perdía la fecha y el total del día, que es justo lo que la pantalla necesita para mostrar
     * hoy, las cinco fechas anteriores y el resto: el contrato ya manda los días agrupados y el repositorio los
     * devuelve como llegan.
     */
    suspend fun history(): List<SalidaHistoryResponseDaysInner> = withContext(Dispatchers.IO) {
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
    suspend fun attachPhoto(movementId: Int, jpeg: ByteArray): Boolean = withContext(Dispatchers.IO) {
        val part = MultipartBody.Part.createFormData(
            name = "file",
            filename = "photo.jpg",
            body = jpeg.toRequestBody("image/jpeg".toMediaType()),
        )
        val response = runCatching { api.uploadPhoto(movementId, part) }.getOrNull() ?: return@withContext false
        response.isSuccessful
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

    suspend fun day(date: String): List<SalidaCreateResponseMovement> = withContext(Dispatchers.IO) {
        api.day(date).body()?.movements ?: emptyList()
    }

    private suspend fun finish(
        movement: SalidaCreateResponseMovement,
        outcome: SalidaErpOutcome,
    ): SalidaErpOutcome {
        val status = when (outcome) {
            is SalidaErpOutcome.Complete -> SalidaErpResultRequest.Status.sent
            is SalidaErpOutcome.Partial -> SalidaErpResultRequest.Status.partial
            is SalidaErpOutcome.Failed -> SalidaErpResultRequest.Status.failed
            else -> return outcome
        }
        // El servidor guarda el veredicto y la auditoría del viaje: es lo que el histórico muestra como estado.
        runCatching { api.recordErpResult(movement.id, SalidaErpResultRequest(status = status)) }
        audit.sync(movement.id, status.value, outcome)
        return outcome
    }

    private suspend fun credentials(): AeroSettings? {
        val current = settings.load()
        return current.takeIf { it.ready }
    }
}

/** La auditoría de la baja, con el mismo nombre de evento que la web. */
@Singleton
class SalidaAudit @Inject constructor() {
    fun sync(movementId: Int, status: String, outcome: SalidaErpOutcome) = Unit
}
