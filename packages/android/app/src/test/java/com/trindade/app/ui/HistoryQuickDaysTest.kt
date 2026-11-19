package com.trindade.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * Las cinco fechas rápidas de un histórico, cuando el archivo tiene menos de cinco.
 *
 * La verificación en planta mostró tres chips (16, 17 y 18/11) porque el archivo tenía tres días. El requisito es
 * que el operario tenga siempre cinco a mano: las del archivo primero, y el calendario completando lo que falta,
 * sin repetir y sin pasar de hoy. Un día sin lanzamientos abre su estado vacío; un día ausente no se puede pedir.
 */
class HistoryQuickDaysTest {

    private val today = "2026-11-19"

    @Test
    fun `three days of archive become five chips, filled with the nearest calendar days`() {
        assertEquals(
            listOf("2026-11-18", "2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14"),
            historyQuickDays(today, listOf("2026-11-18", "2026-11-17", "2026-11-16"), all = false),
        )
    }

    @Test
    fun `the archive's days keep their order and the filler never repeats one`() {
        // El servidor manda un 15/11 fuera de orden y el calendario no lo vuelve a ofrecer: la fila sale de la
        // más reciente a la más vieja, sin repetidos, y el relleno salta ese día.
        assertEquals(
            listOf("2026-11-18", "2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14"),
            historyQuickDays(today, listOf("2026-11-15", "2026-11-18", "2026-11-17", "2026-11-16"), all = false),
        )
        // Un día del archivo más viejo que los rellenos no se pierde: entra en la fila y se ordena con el resto.
        assertEquals(
            listOf("2026-11-18", "2026-11-17", "2026-11-16", "2026-11-15", "2026-10-02"),
            historyQuickDays(today, listOf("2026-11-17", "2026-10-02"), all = false),
        )
    }

    @Test
    fun `five or more archive days are shown as they came`() {
        val days = listOf("2026-11-18", "2026-11-17", "2026-11-16", "2026-11-13", "2026-11-12", "2026-11-11")
        assertEquals(days.take(5), historyQuickDays(today, days, all = false))
    }

    @Test
    fun `the whole archive is not padded, only the days that exist`() {
        assertEquals(
            listOf("2026-11-18", "2026-11-16"),
            historyQuickDays(today, listOf("2026-11-18", "2026-11-16"), all = true),
        )
    }

    @Test
    fun `an empty archive still offers five past days, and never today`() {
        val shown = historyQuickDays(today, emptyList(), all = false)
        assertEquals(5, shown.size)
        assertFalse(shown.contains(today))
        assertEquals(listOf("2026-11-18", "2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14"), shown)
    }

    @Test
    fun `a month boundary is walked, not skipped`() {
        assertEquals(
            listOf("2026-11-30", "2026-11-29", "2026-11-28", "2026-11-27", "2026-11-26"),
            historyQuickDays("2026-12-01", emptyList(), all = false),
        )
    }
}
