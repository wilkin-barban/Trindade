package com.trindade.app.salida

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * La barra del lanzamiento de Salida: el botón cuenta **productos distintos** y no unidades.
 *
 * La web escribe `Lançar saída (N)` con la cantidad de renglones que el diálogo va a repasar, y sin sufijo cuando
 * no hay ninguno. El total de unidades vive al lado, en la barra, así que un botón que contara unidades diría dos
 * veces lo mismo y esconderría lo que el operario necesita saber: cuántas líneas va a confirmar.
 *
 * Se prueba sin el ViewModel, como la barra de Masas y el vacío del histórico: es una regla de rótulo y de
 * habilitación, y no necesita la selección leída para ser cierta.
 */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SalidaLaunchBarTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int, vararg args: Any): String = context.getString(id, *args)

    private fun bar(
        products: Int,
        totalUnits: Int = 0,
        submitting: Boolean = false,
        onLaunch: () -> Unit = {},
    ) {
        composeRule.setContent {
            TrindadeTheme {
                SalidaLaunchBar(
                    products = products,
                    totalUnits = totalUnits,
                    submitting = submitting,
                    onLaunch = onLaunch,
                )
            }
        }
    }

    @Test
    fun `the button names how many distinct products are going out`() {
        bar(products = 2, totalUnits = 120)

        composeRule.onNodeWithText(copy(R.string.salida_launch_with_count, 2)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.salida_units_format, 120)).assertIsDisplayed()
        // El contador de la barra y el del botón son el mismo número: dos renglones distintos.
        composeRule.onNodeWithText(copy(R.string.salida_products_count, 2)).assertIsDisplayed()
    }

    @Test
    fun `without products the button says the plain launch and refuses`() {
        var launched = 0
        bar(products = 0, onLaunch = { launched++ })

        composeRule.onNodeWithText(copy(R.string.salida_launch)).assertIsDisplayed()
        composeRule.onNodeWithTag(SALIDA_LAUNCH_BAR_TAG).assertIsNotEnabled().performClick()
        composeRule.waitForIdle()

        assertEquals(0, launched)
    }

    @Test
    fun `while the launch is in the air the button says what it is doing and refuses a second press`() {
        var launched = 0
        bar(products = 1, totalUnits = 6, submitting = true, onLaunch = { launched++ })

        composeRule.onNodeWithText(copy(R.string.salida_launching)).assertIsDisplayed()
        composeRule.onNodeWithTag(SALIDA_LAUNCH_BAR_TAG).assertIsNotEnabled().performClick()
        composeRule.waitForIdle()

        assertEquals(0, launched)
    }

    @Test
    fun `the ready button opens the confirmation`() {
        var launched = 0
        bar(products = 1, totalUnits = 6, onLaunch = { launched++ })

        composeRule.onNodeWithTag(SALIDA_LAUNCH_BAR_TAG).performClick()
        composeRule.waitForIdle()

        assertEquals(1, launched)
    }
}
