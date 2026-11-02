package com.trindade.app.aero

import com.trindade.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The single vocabulary a failed conversation with the plant is described in.
 *
 * The defect this covers is drift, and drift is invisible one screen at a time: each surface had its own
 * sentence for the same event, so the operator reading "Sem conexão com a rede da fábrica" on the table got
 * "Wi-Fi desconectado." in the panel, and a new surface added a third. What is asserted here is the table
 * itself -- one code, one resource, and the ERP's own sentence only where the ERP sent one.
 */
class AeroFailureTest {

    @Test
    fun `every network failure has one sentence, and no two codes share it`() {
        val networkCodes = listOf(
            AeroFailureCode.NOT_CONFIGURED,
            AeroFailureCode.DIFFERENT_NETWORK,
            AeroFailureCode.HOST_UNREACHABLE,
            AeroFailureCode.TIMEOUT,
            AeroFailureCode.NO_ROUTE,
            AeroFailureCode.REFUSED_CONNECTION,
            AeroFailureCode.NO_ANSWER,
            AeroFailureCode.SNAPSHOT_REFUSED,
            AeroFailureCode.BACKEND_DAY_CLOSED,
        )

        val resources = networkCodes.map { AeroFailure(it).describe().resId }

        assertEquals("una oración por código", networkCodes.size, resources.toSet().size)
        assertTrue("ninguna quedó sin oración", resources.none { it == 0 })
    }

    /**
     * A closed day is not a connection problem, and pressing again does not fix it.
     *
     * The queue reads this flag to decide whether an item waits for the next launch or is dropped, so a
     * retryable closed day would keep a yesterday's seat in the phone forever.
     */
    @Test
    fun `BACKEND_DAY_CLOSED is not retryable`() {
        val closed = AeroFailure(AeroFailureCode.BACKEND_DAY_CLOSED, serverCode = "MASSAS_HISTORY_FROZEN")

        assertEquals(false, closed.retryable)
        assertEquals("AERO_BACKEND_DAY_CLOSED", closed.code.auditCode)
        assertEquals(R.string.aero_failure_day_closed, closed.describe().resId)
        // Retryable and not retryable are decided per code, and every other code still says what it said.
        assertEquals(true, AeroFailure(AeroFailureCode.TIMEOUT).retryable)
        assertEquals(false, AeroFailure(AeroFailureCode.NOT_CONFIGURED).retryable)
    }

    @Test
    fun `the plant's own refusal is quoted inside the shared sentence`() {
        val refusal = AeroFailure(AeroFailureCode.ERP_REFUSED, "produto inexistente").describe()

        assertEquals(R.string.aero_failure_erp_refused, refusal.resId)
        assertEquals(listOf("produto inexistente"), refusal.args)
    }

    @Test
    fun `a refusal with no sentence is reported as no answer instead of as an empty quote`() {
        // The ERP answering nothing is not the ERP saying no: the seat was never created, and the operator's
        // move is retrying later rather than correcting a row.
        listOf(null, "", "   ").forEach { blank ->
            assertEquals(
                R.string.aero_failure_no_answer,
                AeroFailure(AeroFailureCode.ERP_REFUSED, blank).describe().resId,
            )
        }
    }

    @Test
    fun `a phone off the plant's Wi-Fi is its own failure, and it is not retryable by pressing again`() {
        val diagnosis = AeroDiagnosis(wifiConnected = false, hostReachable = null)

        val failure = diagnosis.failure()

        assertEquals(AeroFailureCode.DIFFERENT_NETWORK, failure?.code)
        assertEquals(R.string.aero_failure_different_network, failure?.describe()?.resId)
        // The fix is walking to the factory network, not tapping the button a second time in the same place.
        assertEquals(true, failure?.retryable)
    }

    @Test
    fun `the right network with nothing listening is told apart from the wrong network`() {
        val failure = AeroDiagnosis(wifiConnected = true, hostReachable = false).failure()

        assertEquals(AeroFailureCode.HOST_UNREACHABLE, failure?.code)
    }

    @Test
    fun `a reachable plant has no failure to report`() {
        assertNull(AeroDiagnosis(wifiConnected = true, hostReachable = true).failure())
        // A diagnosis that could not resolve the address says nothing about the network: the address is the
        // configuration's problem, and the request that follows has its own answer for it.
        assertNull(AeroDiagnosis(wifiConnected = true, hostReachable = null).failure())
    }

    @Test
    fun `a write the ERP never answered is a different code from one it refused`() {
        assertEquals(AeroFailureCode.NO_ANSWER, AeroWriteResult.Failed(null).failure.code)
        assertEquals(
            AeroFailureCode.ERP_REFUSED,
            AeroWriteResult.Failed("saldo insuficiente").failure.code,
        )
        assertEquals(AeroFailureCode.NO_ANSWER, AeroMovementsResult.Failed(null).failure.code)
        assertEquals(
            AeroFailureCode.ERP_REFUSED,
            AeroMovementsResult.Failed("data inválida").failure.code,
        )
    }

    @Test
    fun `the audit log keeps the codes it already had`() {
        // A filter over translated copy stops working the day a translator edits it; these strings do not move.
        assertEquals("AERO_ERP_UNREACHABLE", AeroFailureCode.NO_ANSWER.auditCode)
        assertEquals("AERO_ERP_UNREACHABLE", AeroFailureCode.HOST_UNREACHABLE.auditCode)
        assertEquals("AERO_ERP_REFUSED", AeroFailureCode.ERP_REFUSED.auditCode)
        assertEquals("AERO_NOT_CONFIGURED", AeroFailureCode.NOT_CONFIGURED.auditCode)
        assertEquals("AERO_NO_PLANT_WIFI", AeroFailureCode.DIFFERENT_NETWORK.auditCode)
    }

    @Test
    fun `every code has an audit code, so nothing reaches the log unnamed`() {
        AeroFailureCode.entries.forEach { code ->
            assertTrue("${code.name} sin código", code.auditCode.startsWith("AERO_"))
        }
    }
}
