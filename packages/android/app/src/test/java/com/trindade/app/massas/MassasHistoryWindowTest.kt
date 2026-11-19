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

    @Test
    fun `the day view walks back five calendar days from today, newest first`() {
        assertEquals(
            listOf("2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14", "2026-11-13"),
            massasHistoryCalendarDays(today),
        )
    }

    @Test
    fun `the day view never offers today among the earlier dates, and crosses a month without inventing one`() {
        // La vista de día no leyó el archivo, así que ofrece calendario: un fin de semana sin producción
        // aparece igual, y el día que sí abre es el que el operario pidió. Lo que no puede pasar es que hoy
        // se repita entre las fechas anteriores ni que el cruce de mes invente un día que no existe.
        assertEquals(
            listOf("2026-12-02", "2026-12-01", "2026-11-30", "2026-11-29", "2026-11-28"),
            massasHistoryCalendarDays("2026-12-03"),
        )
        assertEquals(false, massasHistoryCalendarDays(today).contains(today))
    }
}
