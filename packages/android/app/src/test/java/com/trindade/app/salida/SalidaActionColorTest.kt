package com.trindade.app.salida

import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * Sólo Excluir va en rojo.
 *
 * El primario del tema es rojo, así que usar `primary` como contentColor pintaba de error las cuatro acciones. La
 * regla es explícita: destructiva → `error`; el resto → `onSurface`, el tono neutro de las tarjetas de Masas.
 */
class SalidaActionColorTest {
    private val scheme = lightColorScheme(
        primary = Color(0xFFB42025),
        error = Color(0xFFBA1A1A),
        onSurface = Color(0xFF221919),
    )

    @Test
    fun `delete uses the error colour`() {
        assertEquals(scheme.error, salidaActionContentColor(destructive = true, colors = scheme))
    }

    @Test
    fun `the other three use the neutral surface colour, never the brand red`() {
        val neutral = salidaActionContentColor(destructive = false, colors = scheme)
        assertEquals(scheme.onSurface, neutral)
        assertNotEquals(scheme.primary, neutral)
        assertNotEquals(scheme.error, neutral)
    }
}
