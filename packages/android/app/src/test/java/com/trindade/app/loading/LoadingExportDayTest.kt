package com.trindade.app.loading

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * El día que anuncia el texto del Horario, que no es el día del lote.
 *
 * `nextLoadingDateString` en `loading.export.service.ts` fecha el mensaje con el cargamento: el siguiente día, o el
 * lunes cuando el lote es de un viernes. La tarjeta tiene que decir el mismo día que el texto que muestra, y por eso
 * la regla se replica acá con los siete días fijados.
 */
class LoadingExportDayTest {

    @Test
    fun `the reported pair is the one that started this, not two dates`() {
        assertEquals("2026-11-19", exportLoadingDay("2026-11-18"))
    }

    @Test
    fun `every weekday moves one day, and a Friday batch loads on Monday`() {
        assertEquals("2026-11-23", exportLoadingDay("2026-11-22")) // domingo
        assertEquals("2026-11-24", exportLoadingDay("2026-11-23")) // lunes
        assertEquals("2026-11-25", exportLoadingDay("2026-11-24")) // martes
        assertEquals("2026-11-26", exportLoadingDay("2026-11-25")) // miércoles
        assertEquals("2026-11-27", exportLoadingDay("2026-11-26")) // jueves
        assertEquals("2026-11-30", exportLoadingDay("2026-11-27")) // viernes -> lunes
        assertEquals("2026-11-29", exportLoadingDay("2026-11-28")) // sábado
    }

    @Test
    fun `the crossing of a month and a year is the calendar's, not a subtraction`() {
        assertEquals("2026-12-01", exportLoadingDay("2026-11-30"))
        assertEquals("2027-01-01", exportLoadingDay("2026-12-31"))
    }
}
