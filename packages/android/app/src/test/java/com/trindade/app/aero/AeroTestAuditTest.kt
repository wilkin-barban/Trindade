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

    /**
     * The server's contract test pins the same row in TypeScript. The duplication is deliberate: it is what
     * makes a rename on either side fail a test instead of reaching the plant's log as a line nobody keeps.
     */
    @Test
    fun `the launch line is the dispatch row the backend contract pins`() {
        val request = AeroAudit.request(
            event = AeroAudit.Event.DISPATCH,
            destinationUrl = "http://192.168.25.250:1453/api/entradasitem",
            phase = "response",
            httpStatus = 200,
            durationMs = 1840,
            detail = "launch #42",
        )

        assertEquals("dispatch", request.event)
        assertEquals("response", request.phase)
        assertEquals("http://192.168.25.250:1453/api/entradasitem", request.destinationUrl)
        assertEquals(200, request.httpStatus)
        assertEquals(1840L, request.durationMs)
        assertTrue(request.note.orEmpty().startsWith(AeroAudit.PREFIX))
    }

    @Test
    fun `every event name this app writes is one the backend accepts`() {
        // Written out as literals on purpose: comparing the constants to themselves would pin nothing.
        assertEquals(
            listOf("dispatch", "sync", "test", "import"),
            listOf(AeroAudit.Event.DISPATCH, AeroAudit.Event.SYNC, AeroAudit.Event.TEST, AeroAudit.Event.IMPORT),
        )
    }

    /**
     * Every line names the app and belongs to one attempt, without the call site having to remember either.
     *
     * The server column holds 64 characters; a UUID fits and is generated here so a caller cannot forget it.
     */
    @Test
    fun `every line names android and carries its own attempt id`() {
        val first = AeroAudit.request(
            event = AeroAudit.Event.DISPATCH,
            destinationUrl = "http://192.168.25.250:1453/api/entradasitem",
        )
        val second = AeroAudit.request(
            event = AeroAudit.Event.DISPATCH,
            destinationUrl = "http://192.168.25.250:1453/api/entradasitem",
        )

        assertEquals("android", first.client)
        assertTrue(first.attemptId!!.isNotBlank())
        assertTrue(first.attemptId!!.length <= 64)
        assertTrue("two attempts are not the same attempt", first.attemptId != second.attemptId)
    }

    @Test
    fun `a caller can correlate a requested and a result line through the same attempt id`() {
        val attempt = AeroAudit.newAttemptId()

        val requested = AeroAudit.request(
            event = AeroAudit.Event.DISPATCH,
            destinationUrl = "http://192.168.25.250:1453/api/entradasitem",
            attemptId = attempt,
        )
        val result = AeroAudit.request(
            event = AeroAudit.Event.DISPATCH,
            destinationUrl = "http://192.168.25.250:1453/api/entradasitem",
            attemptId = attempt,
        )

        assertEquals(requested.attemptId, result.attemptId)
    }

    @Test
    fun `a long failure is trimmed to the column instead of being refused`() {
        val request = AeroAudit.request(
            event = AeroAudit.Event.DISPATCH,
            destinationUrl = "http://192.168.25.250:1453/api/entradasitem",
            error = "E".repeat(3000),
            detail = "d".repeat(400),
        )

        assertEquals(AeroAudit.ERROR_MAX, request.error!!.length)
        assertEquals(AeroAudit.NOTE_MAX, request.note!!.length)
    }

    @Test
    fun `a refusal of the audit endpoint is reported with the backend code`() {
        assertEquals(
            "audit log refused: HTTP 400 INVALID_AERO_LOG",
            AeroAudit.rejection(400, """{"error":"Evento de integração inválido","code":"INVALID_AERO_LOG"}"""),
        )
        assertEquals("audit log refused: HTTP 503", AeroAudit.rejection(503, "<html>"))
        assertEquals(
            "audit log unreachable: the event was not recorded",
            AeroAudit.rejection(null, null),
        )
    }
}
