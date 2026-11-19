package com.trindade.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * Las cinco fechas rápidas de un histórico: siempre las cinco de calendario anteriores a hoy.
 *
 * La verificación en planta mostró el defecto de la regla anterior: con un archivo de 18, 17, 16, 13 y 12/11,
 * tomar las cinco primeras del archivo devolvía justamente esas y se saltaba el 15 y el 14 -- las dos fechas
 * pasadas más recientes que faltaban --. Lo que el operario espera de una fila que dice «fechas anteriores» es
 * poder caminar hacia atrás desde hoy, no recorrer los huecos del archivo. El archivo entero vive detrás de
 * «Todas as datas».
 */
class HistoryQuickDaysTest {

    private val today = "2026-11-19"

    @Test
    fun `the five are always the five calendar days before today, whatever the archive holds`() {
        assertEquals(
            listOf("2026-11-18", "2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14"),
            historyQuickDays(today, listOf("2026-11-18", "2026-11-17", "2026-11-16"), all = false),
        )
    }

    @Test
    fun `an archive with gaps does not skip the two nearest missing days`() {
        // El caso del reporte: 18, 17, 16, 13 y 12. La regla vieja daba esos cinco; la correcta da el 15 y el 14.
        assertEquals(
            listOf("2026-11-18", "2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14"),
            historyQuickDays(
                today,
                listOf("2026-11-18", "2026-11-17", "2026-11-16", "2026-11-13", "2026-11-12"),
                all = false,
            ),
        )
    }

    @Test
    fun `an archive day outside the window is not one of the five, it lives in the whole archive`() {
        val shown = historyQuickDays(today, listOf("2026-10-02"), all = false)
        assertFalse("el chip de octubre no entra en los cinco", shown.contains("2026-10-02"))
        assertEquals(listOf("2026-10-02"), historyQuickDays(today, listOf("2026-10-02"), all = true))
    }

    @Test
    fun `the whole archive is the server's days, without today and without filler`() {
        assertEquals(
            listOf("2026-11-18", "2026-11-16", "2026-10-02"),
            historyQuickDays(today, listOf("2026-11-18", "2026-11-16", "2026-10-02", "2026-11-19"), all = true),
        )
    }

    @Test
    fun `an empty archive still offers the five calendar days, and never today`() {
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
