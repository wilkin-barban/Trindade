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
    fun `a day without launches shows no earlier dates but the chip is still drawn by the screen`() {
        assertEquals(emptyList<String>(), massasHistoryShownDays(today, listOf(today), all = false))
    }
}
