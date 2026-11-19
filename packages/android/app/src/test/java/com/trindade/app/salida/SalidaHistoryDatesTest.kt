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
    fun `today comes first and the five earlier days are the calendar's five`() {
        val visible = salidaHistoryVisibleDates(today, days, all = false)
        assertEquals(today, visible.first())
        assertEquals(6, visible.size)
        assertEquals(
            listOf(today, "2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14", "2026-11-13"),
            visible,
        )
    }

    @Test
    fun `today plus five earlier days, filled by the calendar when the archive is short`() {
        // Verificado en planta: con tres días de archivo sólo había tres chips. El requisito son cinco, y el
        // calendario los completa sin repetir ninguno.
        val visible = salidaHistoryVisibleDates(today, listOf("2026-11-17", "2026-11-16"), all = false)
        assertEquals(
            listOf(today, "2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14", "2026-11-13"),
            visible,
        )
    }

    @Test
    fun `all the dates keeps today first and does not repeat it`() {
        val visible = salidaHistoryVisibleDates(today, days, all = true)
        assertEquals(today, visible.first())
        assertEquals(days.size, visible.size)
        assertEquals(visible.distinct().size, visible.size)
    }
}
