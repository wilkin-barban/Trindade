package com.trindade.app.loading

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.contract.models.DriversResponseDriversInner
import com.trindade.app.export.PdfGenerator
import com.trindade.app.export.ShareManager
import com.trindade.app.ui.UiText
import com.trindade.app.ui.theme.TrindadeTheme
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "es-w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LoadingShareScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    @Test
    fun `loading share screen renders title, date subtitle, verbatim text, Volver, and no Editar or Copiar`() {
        var backed = 0
        var shared = 0
        var pdfed = 0

        val verbatimText = """
            CRONOGRAMA DE CARREGAMENTO - 18/11/2026
            08:00 - Motorista Carlos (ABC-1234)
            09:00 - Motorista João (XYZ-5678)
        """.trimIndent()

        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = verbatimText,
            message = null,
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = { shared++ },
                    onPdf = { pdfed++ },
                    onBack = { backed++ },
                )
            }
        }

        // Title and subtitle: el día del cargamento, como lo escribe la planta y como lo fecha el texto del
        // servidor -- no el ISO que lleva la navegación ni la fecha del lote.
        composeRule.onNodeWithText(copy(R.string.loading_title)).assertIsDisplayed()
        composeRule.onNodeWithText("19/11/2026", substring = true).assertIsDisplayed()

        // Verbatim text
        composeRule.onNodeWithText(verbatimText).assertIsDisplayed()
        composeRule.onNodeWithText(verbatimText).assertTextEquals(verbatimText)

        // Actions: Volver exists, no Editar or Copiar
        composeRule.onNodeWithText("Volver").assertIsDisplayed()
        composeRule.onNodeWithText("Editar").assertDoesNotExist()
        assertEquals(0, composeRule.onAllNodesWithText("Copiar", substring = true).fetchSemanticsNodes().size)

        // Callback invocation
        composeRule.onNodeWithText("Volver").performClick()
        assertEquals(1, backed)

        composeRule.onNodeWithText("Compartir por WhatsApp").performClick()
        assertEquals(1, shared)

        composeRule.onNodeWithText("Exportar PDF").performClick()
        assertEquals(1, pdfed)
    }

    @Test
    fun `touch targets for all actions meet 44dp minimum height`() {
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = "Texto",
            message = null,
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                )
            }
        }

        for (action in listOf("Compartir por WhatsApp", "Exportar PDF", "Volver")) {
            val node = composeRule.onNodeWithText(action)
            node.assertIsDisplayed()
            val bounds = node.getUnclippedBoundsInRoot()
            val height = bounds.bottom - bounds.top
            assertTrue("Action '$action' height ($height) must be >= 44dp", height >= 44.dp)
        }
    }

    @Test
    fun `error state shows error message instead of empty text`() {
        val errorSentence = "Falha ao carregar agendamento."
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = null,
            message = UiText.literal(errorSentence),
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                )
            }
        }

        composeRule.onNodeWithText(errorSentence).assertIsDisplayed()
    }

    /**
     * El subtítulo fecha el cargamento, no el lote: el mismo día que el texto que la tarjeta muestra.
     *
     * El export se pide por la fecha del lote y su primera línea fecha el cargamento (el día siguiente, o el lunes
     * si el lote es viernes). Con la fecha del lote arriba, la tarjeta decía 18/11/2026 en el subtítulo y
     * «Quinta-feira • 19/11/2026» en el texto, a dos centímetros de distancia.
     */
    @Test
    fun `the card dates the loading day the exported text announces`() {
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = "🚛 *HORÁRIO DE CARREGAMENTO*\n\n📅 Quinta-feira • 19/11/2026",
            message = null,
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                )
            }
        }

        // Dos veces: el subtítulo de la tarjeta y la línea de fecha del propio texto, que ahora coinciden.
        assertEquals(
            2,
            composeRule.onAllNodesWithText("19/11/2026", substring = true).fetchSemanticsNodes().size,
        )
        // Y la fecha del lote no queda como fecha de la tarjeta.
        composeRule.onNodeWithText("18/11/2026").assertDoesNotExist()
    }

    /**
     * El día de hoy abierto desde el historial ofrece Editar; el pasado no.
     *
     * La tarjeta no decide esto: lo decide el ViewModel, que es quien sabe si el día es hoy y si su lote sigue
     * activo. Lo que esta prueba fija es que la pantalla lo dibuja cuando se le dice que sí y lo esconde cuando
     * se le dice que no -- el caso que el dueño reportó era un día de hoy sin ninguna forma de corregirlo.
     */
    @Test
    fun `a day that can still be corrected shows Editar and reports it`() {
        var edited = 0
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            exportText = "CRONOGRAMA DE CARREGAMENTO",
            canEdit = true,
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                    onEdit = { edited++ },
                )
            }
        }

        composeRule.onNodeWithText("Editar").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Volver").assertIsDisplayed()
        composeRule.waitForIdle()

        assertEquals(1, edited)
    }

    @Test
    fun `a past day keeps the card read-only even when the caller hands a way in`() {
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            exportText = "CRONOGRAMA DE CARREGAMENTO",
            canEdit = false,
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                    onEdit = {},
                )
            }
        }

        composeRule.onNodeWithText("Editar").assertDoesNotExist()
        composeRule.onNodeWithText("Volver").assertIsDisplayed()
    }

    /**
     * Los fleteros con teléfono del día viven acá, junto al share general.
     *
     * La grilla los tenía al lado del texto exportado, y la web los tiene en la tarjeta del día cerrado:
     * la lista se mudó, no se perdió. Lo que se afirma es que llegó a esta pantalla y que cada nombre abre
     * el chat de esa persona -- no el de cualquiera -- mientras el texto del servidor sigue a la vista.
     */
    @Test
    fun `the fleteros with a number are offered beside the card and report the driver they open`() {
        val opened = mutableListOf<Int>()
        val ana = DriversResponseDriversInner(
            id = 7,
            name = "Ana",
            licensePlate = null,
            phone = "+55 (11) 98888-7777",
            driverType = DriversResponseDriversInner.DriverType.fletero,
        )
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = "CRONOGRAMA DE CARREGAMENTO",
            message = null,
            fleteros = listOf(ana),
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                    onOpenWhatsApp = { opened += it.id },
                )
            }
        }

        composeRule.onNodeWithText(copy(R.string.export_send_to_fletero)).assertIsDisplayed()
        composeRule.onNodeWithText("CRONOGRAMA DE CARREGAMENTO").assertIsDisplayed()
        // La fila dice quién y a qué número, no sólo el nombre.
        composeRule.onNodeWithText("Ana").assertIsDisplayed()
        composeRule.onNodeWithText("+55 (11) 98888-7777").assertIsDisplayed()
        composeRule.onNodeWithTag(loadingFleteroRowTag(7)).performClick()
        composeRule.waitForIdle()

        assertEquals(listOf(7), opened)
    }

    /** Un día sin fleteros con número no dibuja la sección: el lugar vacío no es un fallo. */

    /**
     * Con muchos fleteros, la sección no se come la pantalla.
     *
     * La lista tiene su propio scroll y alto acotado: el mensaje -- lo que se manda -- y la vuelta siguen a la
     * vista. Y la vuelta es de la pantalla, no una píldora al lado del título de la tarjeta.
     */
    @Test
    fun `twenty fleteros scroll inside their section and leave the message and the back in place`() {
        val drivers = (1..20).map { index ->
            DriversResponseDriversInner(
                id = index,
                name = "Fletero $index",
                licensePlate = null,
                phone = "+55 11 98888-${1000 + index}",
                driverType = DriversResponseDriversInner.DriverType.fletero,
            )
        }
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = "CRONOGRAMA DE CARREGAMENTO",
            message = null,
            fleteros = drivers,
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                )
            }
        }

        composeRule.onNodeWithTag("loading-fleteros-section").assertIsDisplayed()
        composeRule.onNodeWithText("Fletero 1").assertIsDisplayed()
        composeRule.onNodeWithText("+55 11 98888-1001").assertIsDisplayed()
        composeRule.onNodeWithText("CRONOGRAMA DE CARREGAMENTO").assertIsDisplayed()
        // La vuelta vive en la barra de la pantalla; la tarjeta no dibuja otra.
        composeRule.onNodeWithTag("loading-share-back").assertIsDisplayed()
        composeRule.onNodeWithTag("share-card-back").assertDoesNotExist()
    }

    @Test
    fun `a day with no fleteros who can be reached draws no fletero section`() {
        val state = LoadingShareViewModel.UiState(
            date = "2026-11-18",
            loading = false,
            exportText = "CRONOGRAMA DE CARREGAMENTO",
            message = null,
        )

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = "2026-11-18",
                    state = state,
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                )
            }
        }

        composeRule.onNodeWithTag("loading-fleteros-section").assertDoesNotExist()
        composeRule.onNodeWithText(copy(R.string.export_send_to_fletero)).assertDoesNotExist()
        // Sin la sección no queda un hueco: la tarjeta sube y su vuelta sigue en la barra.
        composeRule.onNodeWithTag("loading-share-back").assertIsDisplayed()
        composeRule.onNodeWithText("CRONOGRAMA DE CARREGAMENTO").assertIsDisplayed()
    }
}
