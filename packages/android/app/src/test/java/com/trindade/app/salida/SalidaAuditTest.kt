package com.trindade.app.salida

import com.trindade.app.aero.AeroWriteResult
import com.trindade.app.massas.FakeMirrorPort
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class SalidaAuditTest {
    @Test
    fun `records a request before the write and pairs the refusal`() = runTest {
        val mirror = FakeMirrorPort()
        val refused = AeroWriteResult.Failed(message = null, httpStatus = 503)
        val answer = SalidaAudit(mirror).recordWrite(12, "http://example.test/api") {
            assertEquals(listOf("requested"), mirror.logs.map { it.phase })
            refused
        }
        assertEquals(refused, answer)
        val (request, result) = mirror.logs
        assertEquals(listOf("requested", "result"), mirror.logs.map { it.phase })
        assertEquals("salida_sync", request.event)
        assertEquals("http://example.test/api/saidasitem", request.destinationUrl)
        assertNotNull(request.attemptId)
        assertEquals(request.attemptId, result.attemptId)
        assertEquals(503, result.httpStatus)
        assertNotNull(result.durationMs)
    }
}
