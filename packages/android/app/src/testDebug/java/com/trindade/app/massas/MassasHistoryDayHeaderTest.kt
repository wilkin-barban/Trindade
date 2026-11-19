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
 * Las fechas son las que el archivo del servidor reportó -- no cinco días de calendario --, así que la lista
 * de arriba es la del archivo: incluye hoy, salta los días que la planta no produjo y trae más de cinco.
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

    /** El archivo tal como lo devuelve `/massas-launch/history`: hoy y seis días más, con huecos. */
    private val archive = listOf(
        "2026-11-18", "2026-11-17", "2026-11-16", "2026-11-13",
        "2026-11-12", "2026-11-11", "2026-11-10", "2026-11-09",
    )

    /** Las cinco fechas anteriores de calendario, que son siempre las que la fila ofrece. */
    private val earlier = listOf("2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14", "2026-11-13")

    private fun render(
        selectedDate: String = today,
        historyDates: List<String> = archive,
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
                    historyDates = historyDates,
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
        for (date in earlier) {
            composeRule.onNodeWithTag(massasHistoryDayChipTag(date)).assertExists()
        }
        assertEquals(5, earlier.size)
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

    /**
     * Las cinco de la fila son las de calendario, aunque el archivo tenga huecos o días viejos.
     *
     * Con un archivo de 18, 17 y 02/10, la fila ofrece 17…13: el 15 y el 14 son las dos fechas pasadas más
     * recientes que faltan, y son las que el operario necesita para caminar hacia atrás desde hoy. El día viejo del
     * archivo no desaparece: vive en «Todas as datas», que es el archivo entero.
     */
    @Test
    fun `the five dates are the calendar's, and an old archive day stays behind Todas`() {
        render(historyDates = listOf(today, "2026-11-17", "2026-10-02"))

        for (date in earlier) {
            composeRule.onNodeWithTag(massasHistoryDayChipTag(date)).assertExists()
        }
        composeRule.onNodeWithTag(massasHistoryDayChipTag("2026-10-02")).assertDoesNotExist()
        composeRule.onNodeWithTag(MASSAS_HISTORY_DAY_ALL_TAG).assertExists()
    }

    /** Hoy se dibuja siempre, aunque el archivo todavía no lo haya devuelto. */
    @Test
    fun `today is offered even before the archive reports it`() {
        render(historyDates = emptyList())

        composeRule.onNodeWithTag(MASSAS_HISTORY_DAY_TODAY_TAG).assertIsDisplayed()
        composeRule.onNodeWithTag(MASSAS_HISTORY_DAY_ALL_TAG).assertExists()
    }

    /**
     * El ancho de la planta: 390 dp con las cinco fechas y el archivo, todas alcanzables.
     *
     * La fila scrollea, y eso es parte del requisito: en un teléfono no entran seis fechas, así que lo que se
     * afirma es que cada una existe, que se trae a la vista al tocarla y que abre el día que dice -- el día
     * pasado incluido, que es el uso real del archivo.
     */
    @Test
    @Config(qualifiers = "w390dp-h800dp-xhdpi")
    fun `at the plant's width the five past dates and the whole archive are all reachable`() {
        val picked = mutableListOf<String>()
        render(selectedDate = today, onSelectDate = { picked += it })

        for (date in earlier) {
            val chip = composeRule.onNodeWithTag(massasHistoryDayChipTag(date)).performScrollTo()
            chip.assertIsDisplayed()
            val bounds = chip.getUnclippedBoundsInRoot()
            assertTrue(
                "chip $date must keep 44dp at 390dp but was ${bounds.bottom - bounds.top}",
                bounds.bottom - bounds.top >= 44.dp,
            )
        }

        composeRule.onNodeWithTag(MASSAS_HISTORY_DAY_ALL_TAG).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithTag(massasHistoryDayChipTag("2026-11-16")).performScrollTo().performClick()
        composeRule.waitForIdle()

        assertEquals(listOf("2026-11-16"), picked)
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
