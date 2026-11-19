package com.trindade.app.massas

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * El histórico de Masas ofrece cinco fechas anteriores, o todas cuando se piden.
 *
 * Hoy tiene su propio chip, así que no se repite en la lista; y la lista es la misma con recorte o sin él, no dos
 * pantallas distintas.
 */
class MassasHistoryWindowTest {

    private val today = "2026-11-18"
    private val days = listOf(
        "2026-11-18", "2026-11-17", "2026-11-16", "2026-11-13",
        "2026-11-12", "2026-11-11", "2026-11-10", "2026-11-09",
    )

    @Test
    fun `five earlier days, without today`() {
        assertEquals(
            listOf("2026-11-17", "2026-11-16", "2026-11-13", "2026-11-12", "2026-11-11"),
            massasHistoryShownDays(today, days, all = false),
        )
    }

    @Test
    fun `all the dates keeps every earlier day and still leaves today out`() {
        val shown = massasHistoryShownDays(today, days, all = true)
        assertEquals(7, shown.size)
        assertEquals(false, shown.contains(today))
        assertEquals(shown.distinct().size, shown.size)
    }

    @Test
    fun `a day without launches still offers five earlier dates, filled by the calendar`() {
        // El archivo vacío es un archivo joven, no un error: la fila completa con el calendario, y cada una de esas
        // fechas abre su día vacío en vez de no existir.
        assertEquals(
            listOf("2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14", "2026-11-13"),
            massasHistoryShownDays(today, listOf(today), all = false),
        )
    }

}
