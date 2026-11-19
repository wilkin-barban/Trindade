package com.trindade.app

import com.trindade.app.massas.MassasOrigin
import com.trindade.app.massas.offersErpSync
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Cuándo el día de Masas ofrece sincronizar el espejo del ERP.
 *
 * Se preguntaba sólo por el origen, y una fecha pasada abierta desde el histórico sigue viniendo del histórico: el
 * botón aparecía sobre un día que el servidor rechaza. La respuesta ahora son dos hechos, y el test fija los tres
 * casos que importan.
 */
class MassasOriginSyncTest {

    @Test
    fun `a day opened from the archive offers the sync only while it is open`() {
        assertTrue(offersErpSync(MassasOrigin.HISTORY, readOnly = false))
        assertFalse(offersErpSync(MassasOrigin.HISTORY, readOnly = true))
    }

    @Test
    fun `the launch never offers it, open or closed`() {
        assertFalse(offersErpSync(MassasOrigin.LAUNCH, readOnly = false))
        assertFalse(offersErpSync(MassasOrigin.LAUNCH, readOnly = true))
    }
}
