package com.trindade.app.salida

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El tono de la ventana dice qué pasó con la planta.
 *
 * Sin host configurado el resultado es `NotConfigured`, y antes no era `Failed`: la ventana mostraba el texto
 * correcto con ✅ y "Tudo certo". Sólo `Complete` es éxito; lo demás dejó la baja pendiente.
 */
class SalidaOutcomeToneTest {
    @Test
    fun `only a complete trip is a success`() {
        assertTrue(salidaErpOutcomeSucceeded(SalidaErpOutcome.Complete(documents = 1)))
    }

    @Test
    fun `partial, failed, not configured and skipped are not`() {
        assertFalse(salidaErpOutcomeSucceeded(SalidaErpOutcome.Partial(sent = 1, failed = 1, message = null)))
        assertFalse(salidaErpOutcomeSucceeded(SalidaErpOutcome.Failed(message = "offline")))
        assertFalse(salidaErpOutcomeSucceeded(SalidaErpOutcome.NotConfigured))
        assertFalse(salidaErpOutcomeSucceeded(SalidaErpOutcome.Skipped))
    }
}
