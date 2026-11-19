package com.trindade.app.salida

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Las fechas que el histórico muestra: hoy, cinco anteriores, y todas cuando se piden.
 *
 * La regla vive acá y no en la pantalla porque es la que el operario nota: hoy siempre está, el pasado se ofrece
 * como referencia y «todas» no es una lista distinta sino la misma sin recorte.
 */
class SalidaHistoryDatesTest {

    private val today = "2026-11-18"
    private val days = listOf(
        "2026-11-18", "2026-11-17", "2026-11-16", "2026-11-13",
        "2026-11-12", "2026-11-11", "2026-11-10", "2026-11-09",
    )

    @Test
    fun `today comes first and only five earlier days are offered`() {
        val visible = salidaHistoryVisibleDates(today, days, all = false)
        assertEquals(today, visible.first())
        assertEquals(6, visible.size)
        assertEquals(listOf("2026-11-18", "2026-11-17", "2026-11-16", "2026-11-13", "2026-11-12", "2026-11-11"), visible)
    }

    @Test
    fun `today is offered even when the server did not return it`() {
        val visible = salidaHistoryVisibleDates(today, listOf("2026-11-17", "2026-11-16"), all = false)
        assertEquals(listOf(today, "2026-11-17", "2026-11-16"), visible)
    }

    @Test
    fun `all the dates keeps today first and does not repeat it`() {
        val visible = salidaHistoryVisibleDates(today, days, all = true)
        assertEquals(today, visible.first())
        assertEquals(days.size, visible.size)
        assertEquals(visible.distinct().size, visible.size)
    }
}
