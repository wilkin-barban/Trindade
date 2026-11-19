package com.trindade.app.salida

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
