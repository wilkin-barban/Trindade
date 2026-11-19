package com.trindade.app.reports

import com.trindade.app.ui.components.ShareCardMode
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Cuándo la tarjeta de compartir de un informe ofrece Editar.
 *
 * La regla es la de la web y tiene dos mitades: el informe que se acaba de guardar se corrige siempre, y el que
 * se abre desde el historial sólo si es el día de hoy y el servidor sigue respondiendo `canEdit`. El pasado es
 * el registro de lo que la planta hizo; ofrecer corregirlo sería prometer un guardado que el servidor rechaza.
 */
class ReportShareEditTest {

    private val today = "2026-11-19"

    @Test
    fun `the report that was just saved is always editable`() {
        assertTrue(reportShareAllowsEdit(ShareCardMode.SAVED, canEdit = false, reportDate = null, today = today))
        assertTrue(
            reportShareAllowsEdit(
                ShareCardMode.SAVED,
                canEdit = false,
                reportDate = "2026-01-02",
                today = today,
            ),
        )
    }

    @Test
    fun `a report opened from the history is editable only today and only when the server still allows it`() {
        assertTrue(
            reportShareAllowsEdit(
                ShareCardMode.FROM_HISTORY,
                canEdit = true,
                reportDate = today,
                today = today,
            ),
        )
        assertFalse(
            "el pasado no se edita aunque el informe siga abierto",
            reportShareAllowsEdit(
                ShareCardMode.FROM_HISTORY,
                canEdit = true,
                reportDate = "2026-11-18",
                today = today,
            ),
        )
        assertFalse(
            "hoy, pero fuera de la ventana del servidor",
            reportShareAllowsEdit(
                ShareCardMode.FROM_HISTORY,
                canEdit = false,
                reportDate = today,
                today = today,
            ),
        )
        assertFalse(
            "un informe sin fecha no es de hoy",
            reportShareAllowsEdit(
                ShareCardMode.FROM_HISTORY,
                canEdit = true,
                reportDate = null,
                today = today,
            ),
        )
    }

    @Test
    fun `the plain detail card follows the same rule as the history one`() {
        assertTrue(reportShareAllowsEdit(ShareCardMode.SHARE, canEdit = true, reportDate = today, today = today))
        assertFalse(
            reportShareAllowsEdit(ShareCardMode.SHARE, canEdit = true, reportDate = "2026-11-01", today = today),
        )
    }
}
