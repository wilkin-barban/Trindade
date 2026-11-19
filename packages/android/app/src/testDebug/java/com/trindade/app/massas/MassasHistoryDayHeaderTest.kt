package com.trindade.app.massas

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * El encabezado del día del Histórico de Masas: el nombre del archivo, el Voltar visible y sus fechas rápidas.
 *
 * El defecto que esto cierra es el de un día abierto desde el archivo que no decía dónde estaba ni cómo salir:
 * el "Voltar" sólo se dibujaba en un día pasado, así que con hoy la única salida era el botón físico del
 * teléfono y la lista quedaba detrás. Lo que se afirma, entonces, es el nombre, el Voltar en un día de hoy y
 * las fechas -- hoy, cinco anteriores y el archivo -- con el destino que cada toque reporta.
 *
 * La pieza se prueba sin `MassasLaunchViewModel`, como la barra de lanzamiento y el vacío de Salida: es una
 * decisión sobre qué se ve y a dónde lleva cada toque, y esa decisión no necesita el día leído para ser cierta.
 */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MassasHistoryDayHeaderTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    private val today = "2026-11-18"

    private fun render(
        selectedDate: String = today,
        onBack: () -> Unit = {},
        onSelectDate: (String) -> Unit = {},
        onOpenList: () -> Unit = {},
        onHelp: (() -> Unit)? = null,
    ) {
        composeRule.setContent {
            TrindadeTheme {
                MassasHistoryDayHeader(
                    today = today,
                    selectedDate = selectedDate,
                    onBack = onBack,
                    onSelectDate = onSelectDate,
                    onOpenList = onOpenList,
                    onHelp = onHelp,
                )
            }
        }
    }

    @Test
    fun `the day of the archive opens with its name, a visible way back and its quick dates`() {
        render()

        composeRule.onNodeWithText(copy(R.string.massas_history_title)).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.report_back)).assertIsDisplayed()
        composeRule.onNodeWithText(MASSAS_HISTORY_TODAY_LABEL).assertIsDisplayed()

        // Las cinco anteriores se dibujan aunque no entren en el ancho: la fila scrollea, y el archivo de un
        // día tiene que poder caminar hacia atrás desde acá sin volver primero a la lista.
        for (date in massasHistoryCalendarDays(today)) {
            composeRule.onNodeWithTag(massasHistoryDayChipTag(date)).assertExists()
        }
        composeRule.onNodeWithTag(MASSAS_HISTORY_DAY_ALL_TAG).assertExists()
    }

    @Test
    fun `every quick date reports the day it asks for, and the day on screen is the selected one`() {
        val picked = mutableListOf<String>()
        render(selectedDate = today, onSelectDate = { picked += it })

        composeRule.onNodeWithTag(MASSAS_HISTORY_DAY_TODAY_TAG).assertIsSelected()

        composeRule.onNodeWithTag(massasHistoryDayChipTag("2026-11-17")).performScrollTo().performClick()
        composeRule.onNodeWithTag(MASSAS_HISTORY_DAY_TODAY_TAG).performScrollTo().performClick()
        composeRule.waitForIdle()

        assertEquals(listOf("2026-11-17", today), picked)
    }

    @Test
    fun `the chip of the day being read is the selected one, and the others are not`() {
        render(selectedDate = "2026-11-16")

        composeRule.onNodeWithTag(massasHistoryDayChipTag("2026-11-16")).assertIsSelected()
        composeRule.onNodeWithTag(MASSAS_HISTORY_DAY_TODAY_TAG).assertIsNotSelected()
    }

    @Test
    fun `the way back and the whole archive report their own destination`() {
        var backed = 0
        var listed = 0
        render(onBack = { backed++ }, onOpenList = { listed++ })

        composeRule.onNodeWithText(copy(R.string.report_back)).performClick()
        composeRule.onNodeWithTag(MASSAS_HISTORY_DAY_ALL_TAG).performScrollTo().performClick()
        composeRule.waitForIdle()

        assertEquals(1, backed)
        assertEquals(1, listed)
    }

    @Test
    fun `the quick dates keep the 44dp a finger needs`() {
        render()

        for (tag in listOf(MASSAS_HISTORY_DAY_TODAY_TAG, MASSAS_HISTORY_DAY_ALL_TAG)) {
            // La fila scrollea: el chip que se mide se trae a la vista primero, o el ancho de la pantalla
            // decidiría la aserción en vez del tamaño del objetivo.
            val node = composeRule.onNodeWithTag(tag).performScrollTo()
            node.assertIsDisplayed()
            val bounds = node.getUnclippedBoundsInRoot()
            assertTrue(
                "Chip $tag must be at least 44dp tall but was ${bounds.bottom - bounds.top}",
                bounds.bottom - bounds.top >= 44.dp,
            )
        }
    }
}
