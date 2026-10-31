package com.trindade.app.aero

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The connection test is a query to the ERP like any other, and the plant's log is where it has to appear.
 *
 * The builder is tested instead of the view model because the only thing that can go wrong here is the shape of
 * the line: which endpoint it names, what it says about the answer, and whether it identifies the client that
 * asked. The view model's part -- calling it once per attempt -- is one sentence over this function.
 */
class AeroTestAuditTest {

    private val ws = "http://192.168.25.250:1453/api"

    @Test
    fun `a connection test is one test line pointing at the erp login`() {
        val request = AeroAudit.testRequest(
            normalizedWsUrl = ws,
            elapsedMs = 1234,
            httpStatus = null,
            outcome = "sem-resposta",
            detail = "TIMEOUT",
        )

        // `/usuarios` without the trailing slash: the slash is the 301 that turns a POST into a GET.
        assertEquals("$ws/usuarios", request.destinationUrl)
        assertEquals("test", request.event)
        assertEquals("response", request.phase)
        assertNull(request.httpStatus)
        assertEquals(1234L, request.durationMs)
        assertTrue(request.note!!.endsWith("sem-resposta · TIMEOUT"))
    }

    @Test
    fun `every line the app writes names Android App over ERP`() {
        assertTrue(AeroAudit.PREFIX.contains("Android App / ERP"))
        assertEquals(AeroAudit.PREFIX, AeroAudit.note(null))
        assertTrue(AeroAudit.note("launch #7").startsWith("Android App / ERP"))
        // The machine-readable half stays, because the log is filtered by it.
        assertTrue(AeroAudit.note("launch #7").contains("client=android"))
    }

    @Test
    fun `an answered probe records the status the erp gave`() {
        val request = AeroAudit.testRequest(
            normalizedWsUrl = ws,
            elapsedMs = 87,
            httpStatus = 200,
            outcome = "ok",
            detail = "user=WILKIN",
        )

        assertEquals(200, request.httpStatus)
        assertTrue(request.note!!.endsWith("ok · user=WILKIN"))
    }

    @Test
    fun `the line cannot carry a credential because it is never given one`() {
        val request = AeroAudit.testRequest(
            normalizedWsUrl = ws,
            elapsedMs = 87,
            httpStatus = 200,
            outcome = "ok",
            detail = "user=WILKIN",
        )

        // Nothing shaped like the password or the basic-auth header can reach the note: the builder has no
        // parameter for either, and this asserts the consequence rather than the signature.
        assertFalse(request.note!!.contains("senha", ignoreCase = true))
        assertFalse(request.note!!.contains("basic", ignoreCase = true))
    }

    @Test
    fun `a failure with no detail still writes a line with the outcome`() {
        val request = AeroAudit.testRequest(
            normalizedWsUrl = ws,
            elapsedMs = 0,
            httpStatus = null,
            outcome = "nao-configurado",
            detail = null,
        )

        assertEquals(AeroAudit.note("nao-configurado"), request.note)
    }
}
