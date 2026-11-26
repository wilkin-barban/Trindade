package com.trindade.app.aero

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El viaje al ERP tiene tiempo máximo.
 *
 * Un host que acepta la conexión y no contesta dejaba el botón deshabilitado para siempre y el lanzamiento sin
 * veredicto. La cancelación de la pantalla no es un timeout: si el ViewModel muere, el viaje se cancela y no se
 * inventa un error de red.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ErpTimeoutTest {
    @Test
    fun `answers when the host replies in time`() = runTest {
        val trip = withErpTimeout(1_000) { "ok" }
        assertTrue(trip is ErpTrip.Done)
        assertEquals("ok", (trip as ErpTrip.Done).value)
    }

    @Test
    fun `gives up when the host never answers`() = runTest {
        val trip = withErpTimeout(1_000) {
            delay(60_000)
            "never"
        }
        assertEquals(ErpTrip.TimedOut, trip)
    }

    @Test
    fun `propagates cancellation instead of reporting a network error`() = runTest {
        var cancelled = false
        val job = launch {
            try {
                withErpTimeout(60_000) { delay(120_000) }
            } catch (_: CancellationException) {
                cancelled = true
                throw CancellationException("screen left")
            }
        }
        advanceTimeBy(1)
        job.cancel()
        advanceUntilIdle()
        assertTrue("la cancelación de la pantalla no es un timeout", cancelled)
    }

    @Test
    fun `a real failure is reported as failed`() = runTest {
        val trip = withErpTimeout(1_000) { error("host refused") }
        assertTrue(trip is ErpTrip.Failed)
    }

    @Test
    fun `erpBatchTimeoutMs scales monotonically with batch size and keeps 25s floor`() {
        assertEquals(ERP_DISPATCH_TIMEOUT_MS, erpBatchTimeoutMs(0))
        assertEquals(ERP_DISPATCH_TIMEOUT_MS, erpBatchTimeoutMs(1))
        val twoItems = erpBatchTimeoutMs(2)
        val fourItems = erpBatchTimeoutMs(4)
        val hugeBatch = erpBatchTimeoutMs(50)
        assertTrue(twoItems > ERP_DISPATCH_TIMEOUT_MS)
        assertTrue(fourItems > twoItems)
        assertTrue(hugeBatch >= fourItems)
    }

    @Test
    fun `erpBatchTimeoutMs boundary values respect 25s floor, 10s per extra item, and 180s cap`() {
        assertEquals(ERP_DISPATCH_TIMEOUT_MS, erpBatchTimeoutMs(-10))
        assertEquals(ERP_DISPATCH_TIMEOUT_MS, erpBatchTimeoutMs(0))
        assertEquals(ERP_DISPATCH_TIMEOUT_MS, erpBatchTimeoutMs(1))
        assertEquals(35_000L, erpBatchTimeoutMs(2))
        assertEquals(95_000L, erpBatchTimeoutMs(8))
        assertEquals(175_000L, erpBatchTimeoutMs(16))
        assertEquals(180_000L, erpBatchTimeoutMs(17))
        assertEquals(180_000L, erpBatchTimeoutMs(100))
    }
}
