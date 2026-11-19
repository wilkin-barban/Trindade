package com.trindade.app.salida

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The head of Salida, and the pill that takes the operator to the history.
 *
 * The pill is the shared one: a plain text button beside the title was the odd one out among five histories.
 * What is asserted here is what makes it the same button -- the shared tag, the label and the 48 dp target.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class SalidaHeaderTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: android.content.Context
        get() = androidx.test.core.app.ApplicationProvider.getApplicationContext()

    @Test
    fun `the history action is the shared pill, with its label and its touch target`() {
        var opened = 0
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                SalidaHeader(date = "2026-11-18", onOpenHistory = { opened += 1 })
            }
        }

        composeRule.onNodeWithText(context.getString(com.trindade.app.R.string.salida_title)).assertIsDisplayed()
        composeRule.onNodeWithText("2026-11-18").assertIsDisplayed()

        // La píldora es la compartida: el nodo con el texto es el target, y mide lo que mide en Masas,
        // Cargamento, Reportes y Contagem (36 dp de píldora dentro de 48 dp de target).
        // La píldora compartida: el tag la identifica, el texto es el target de 48 dp y el toque abre el
        // histórico. El nodo del tag es la píldora de 36 dp, así que se mide en el árbol sin unir.
        val pill = composeRule.onNodeWithTag("module-history-pill", useUnmergedTree = true)
        pill.getUnclippedBoundsInRoot().let { bounds ->
            assertTrue(
                "la píldora del histórico se dibuja como la de los demás módulos: ${bounds.bottom - bounds.top}",
                (bounds.bottom - bounds.top) >= 30.dp,
            )
        }

        val target = composeRule.onNodeWithText("Histórico")
        val bounds = target.getUnclippedBoundsInRoot()
        assertTrue(
            "el target del histórico mide al menos 48 dp de alto, como los demás módulos: ${bounds.height}",
            bounds.height >= 48.dp,
        )

        target.performClick()
        assertEquals(1, opened)
    }
}
