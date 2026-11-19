package com.trindade.app

import com.trindade.app.massas.MassasOrigin
import com.trindade.app.massas.massasHistoryShowsDayBody
import com.trindade.app.salida.salidaHistoryShowsDayBody
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Qué se dibuja bajo las fechas de un histórico: el día entero o sólo el mensaje que se comparte.
 *
 * El requisito del dueño es tajante para el pasado: debajo del encabezado y sus chips queda únicamente el bloque de
 * WhatsApp. Un día pasado es el registro de lo que la planta hizo; producción, filas, tarjetas, fotos, filtros e
 * importar/editar/borrar son de hoy. Hoy conserva la vista completa.
 */
class HistoryPastViewTest {

    @Test
    fun `in Masas a past day shows only the share, and today shows the body`() {
        assertFalse(massasHistoryShowsDayBody(MassasOrigin.HISTORY, readOnly = true))
        assertTrue(massasHistoryShowsDayBody(MassasOrigin.HISTORY, readOnly = false))
        // El lanzamiento no monta el bloque del histórico: su cuerpo es su grilla.
        assertTrue(massasHistoryShowsDayBody(MassasOrigin.LAUNCH, readOnly = false))
    }

    @Test
    fun `in Salidas a past date shows only the share, and today shows the body`() {
        assertFalse(salidaHistoryShowsDayBody(selected = "2026-11-17", today = "2026-11-19"))
        assertTrue(salidaHistoryShowsDayBody(selected = "2026-11-19", today = "2026-11-19"))
    }
}
