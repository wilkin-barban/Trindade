package com.trindade.app.salida

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Un día sin movimientos: en hoy ofrece lanzar la primera baja, en el pasado sólo la frase.
 *
 * La regla es del día, no del rol: no se lanza en el pasado, y por eso ahí no hay a dónde ir.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class SalidaHistoryEmptyTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `today offers the launch and the press reaches it`() {
        var launched = 0
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                SalidaHistoryEmpty(isToday = true, onLaunch = { launched += 1 })
            }
        }

        composeRule.onNodeWithText("Nenhuma saída registrada hoje").assertIsDisplayed()
        composeRule.onNodeWithTag("salida-empty-cta").assertIsDisplayed().performClick()
        assertEquals(1, launched)
    }

    @Test
    fun `a past day shows the sentence and no launch`() {
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                SalidaHistoryEmpty(isToday = false, onLaunch = {})
            }
        }

        composeRule.onNodeWithText("Nenhuma saída registrada").assertIsDisplayed()
        composeRule.onNodeWithTag("salida-empty-cta").assertDoesNotExist()
    }
}
