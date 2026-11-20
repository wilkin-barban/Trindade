package com.trindade.app.aero

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

/** Cuánto se espera al host de la empresa antes de darlo por inalcanzable. */
const val ERP_DISPATCH_TIMEOUT_MS: Long = 25_000L

/** Cómo terminó un viaje al ERP: contestó, se quedó sin tiempo, o falló por otra razón. */
sealed interface ErpTrip<out T> {
    data class Done<T>(val value: T) : ErpTrip<T>
    data object TimedOut : ErpTrip<Nothing>
    data class Failed(val error: Throwable) : ErpTrip<Nothing>
}

/**
 * Un viaje al ERP con tiempo máximo.
 *
 * El host de la planta puede colgarse sin cerrar la conexión: sin un límite, la escritura local ya hecha quedaba con
 * el botón deshabilitado para siempre y el operario sin saber qué pasó. El timeout es del viaje, no del guardado:
 * cancelar la pantalla -- el ViewModel muere -- sigue siendo una cancelación y se propaga como tal, para no
 * convertirla en un error de red.
 */
suspend fun <T> withErpTimeout(
    timeoutMs: Long = ERP_DISPATCH_TIMEOUT_MS,
    block: suspend () -> T,
): ErpTrip<T> = try {
    ErpTrip.Done(withTimeout(timeoutMs) { block() })
} catch (_: TimeoutCancellationException) {
    ErpTrip.TimedOut
} catch (cancellation: CancellationException) {
    throw cancellation
} catch (error: Throwable) {
    ErpTrip.Failed(error)
}
