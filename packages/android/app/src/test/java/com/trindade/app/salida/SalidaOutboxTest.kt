package com.trindade.app.salida

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La cola de la baja que todavía no llegó al ERP.
 *
 * Lo que se guarda y lo que se lee tiene que ser lo mismo: los documentos viajan con la fecha del día en que
 * salieron, y una baja de ayer no puede viajar con la fecha de hoy solo porque el teléfono se reinició.
 */
class SalidaOutboxTest {

    private fun payload(code: String, quantity: Int, date: String = "2026-11-18") =
        SalidaErpPayload.payload(SalidaLine(code, quantity), date, "wilkin")!!

    @Test
    fun `the queue survives a round trip with its documents and its date`() {
        val outbox = SalidaOutbox(
            movementId = 42,
            date = "2026-11-18",
            trips = listOf(
                listOf(payload("1357", 20), payload("1900", 3)),
                listOf(payload("1673", 5)),
            ),
        )

        val decoded = SalidaOutboxStore.decode(SalidaOutboxStore.encode(outbox))

        assertEquals(outbox, decoded)
        assertEquals("2026-11-18", decoded?.date)
        assertEquals(2000, decoded?.trips?.first()?.first()?.PRO_QTD)
    }

    @Test
    fun `text with quotes and accents comes back untouched`() {
        val outbox = SalidaOutbox(
            movementId = 7,
            date = "2026-11-18",
            trips = listOf(listOf(payload("1074", 6).copy(PED_OBS = "Saida \"especial\" de AÇÚCAR"))),
        )

        val decoded = SalidaOutboxStore.decode(SalidaOutboxStore.encode(outbox))

        assertEquals("Saida \"especial\" de AÇÚCAR", decoded?.trips?.first()?.first()?.PED_OBS)
    }

    @Test
    fun `a corrupt queue reads as nothing pending instead of breaking the launch`() {
        assertNull(SalidaOutboxStore.decode("{not json"))
        assertNull(SalidaOutboxStore.decode(""))
        assertNull(SalidaOutboxStore.decode("{\"movementId\": null}"))
    }

    @Test
    fun `advancing a trip leaves the rest queued and empties the queue at the end`() {
        val first = SalidaOutbox(
            movementId = 9,
            date = "2026-11-18",
            trips = listOf(listOf(payload("1357", 1)), listOf(payload("1900", 1))),
        )

        val second = first.copy(done = first.done + 1)
        assertEquals(1, second.pendingTrips.size)
        assertTrue(!second.isComplete)

        val third = second.copy(done = second.done + 1)
        assertTrue(third.isComplete)
        assertEquals(0, third.pendingTrips.size)
    }
}
