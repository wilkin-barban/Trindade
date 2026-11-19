package com.trindade.app.loading

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
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
import com.trindade.app.contract.models.DriversResponseDriversInner
import com.trindade.app.ui.components.ShareCardMode
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * El día del Horario, de punta a punta y en el ancho de la planta (390 dp): se cierra con Salvar y se manda desde
 * la tarjeta.
 *
 * Lo que se fija acá es el contrato del flujo y no una pantalla suelta. La grilla ya no tiene el bloque de exportar
 * -- texto, copiar, compartir, PDF y fleteros --, así que su única acción es **Salvar Horário**, y ese toque lleva a
 * la tarjeta con **Compartir**, **PDF**, **Editar** y **Cerrar**. Los fleteros que están en el horario y tienen
 * número se ofrecen en la tarjeta, uno a uno, con el texto del servidor.
 *
 * Salvar no escribe: cada asignación ya se guardó al confirmarse en el selector (POST/PUT/DELETE por fila, ver
 * `LoadingViewModel.confirmAdd` y sus pruebas). Por eso lo que este test exige del pie es que **reporte el día** y
 * nada más; una escritura nueva ahí sería un segundo camino para el mismo estado.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LoadingDayFlowTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int, vararg args: Any): String = context.getString(id, *args)

    private val day = LoadingViewModel.UiState(
        date = "2026-11-19",
        today = "2026-11-19",
        loading = false,
        schedules = listOf(FakeLoadingApi.entry(7, "04:00").copy(driverName = "Ana")),
        timeSlots = listOf("04:00"),
    )

    private fun fletero(id: Int, name: String) = DriversResponseDriversInner(
        id = id,
        name = name,
        licensePlate = null,
        phone = "+55 (11) 98888-7777",
        driverType = DriversResponseDriversInner.DriverType.fletero,
    )

    private fun shareState(canEdit: Boolean) = LoadingShareViewModel.UiState(
        date = "2026-11-19",
        loading = false,
        exportText = "CRONOGRAMA DE CARREGAMENTO\n04:00 - Ana (ABC-1234)",
        message = null,
        fleteros = listOf(fletero(7, "Ana")),
        canEdit = canEdit,
    )

    @Test
    fun `the grid ends the day with Salvar and reports which day it closes`() {
        var saved: String? = null
        composeRule.setContent {
            TrindadeTheme {
                LoadingScreen(
                    state = day,
                    onBack = {},
                    onOpenHistory = {},
                    onStartAdding = {},
                    onCancelAdding = {},
                    onPickerTabSelected = {},
                    onFleteroPicked = { _, _ -> },
                    onCasaPicked = { _, _ -> },
                    onCasaVehiclePicked = { _, _ -> },
                    onConfirmAdd = {},
                    onDelete = {},
                    onEditEntry = { _, _ -> },
                    onSaveDay = { saved = it },
                )
            }
        }

        composeRule.onNodeWithText(copy(R.string.loading_save)).assertIsDisplayed().performClick()
        composeRule.waitForIdle()

        assertEquals(day.date, saved)
        // Y nada del flujo viejo: la grilla no genera, copia, comparte ni exporta.
        for (gone in listOf(
            R.string.export_load,
            R.string.export_copy,
            R.string.export_share_text,
            R.string.export_share_pdf,
            R.string.export_send_to_fletero,
        )) {
            composeRule.onNodeWithText(copy(gone)).assertDoesNotExist()
        }
    }

    @Test
    fun `the card that the closed day opens carries Compartir, PDF, Editar and Cerrar`() {
        var shared = 0
        var pdfed = 0
        var edited = 0
        var closed = 0

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = shareState(canEdit = true).date,
                    state = shareState(canEdit = true),
                    onShare = { shared++ },
                    onPdf = { pdfed++ },
                    onBack = { closed++ },
                    mode = ShareCardMode.SAVED,
                    onEdit = { edited++ },
                )
            }
        }

        val actions = listOf(
            copy(R.string.share_card_share_whatsapp),
            copy(R.string.share_card_export_pdf),
            copy(R.string.share_card_edit),
            copy(R.string.share_card_close),
        )
        for (action in actions) {
            val node = composeRule.onNodeWithText(action).performScrollTo()
            node.assertIsDisplayed()
            val bounds = node.getUnclippedBoundsInRoot()
            assertTrue(
                "'$action' must stay at least 44dp tall at 390dp but was ${bounds.bottom - bounds.top}",
                bounds.bottom - bounds.top >= 44.dp,
            )
        }

        composeRule.onNodeWithText(copy(R.string.share_card_share_whatsapp)).performClick()
        composeRule.onNodeWithText(copy(R.string.share_card_export_pdf)).performScrollTo().performClick()
        composeRule.onNodeWithText(copy(R.string.share_card_edit)).performScrollTo().performClick()
        composeRule.onNodeWithText(copy(R.string.share_card_close)).performScrollTo().performClick()
        composeRule.waitForIdle()

        assertEquals(1, shared)
        assertEquals(1, pdfed)
        assertEquals(1, edited)
        assertEquals(1, closed)
    }

    @Test
    fun `the fleteros on the schedule with a number are sent the server text one by one`() {
        val opened = mutableListOf<Int>()
        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = shareState(canEdit = true).date,
                    state = shareState(canEdit = true),
                    onShare = {},
                    onPdf = {},
                    onBack = {},
                    mode = ShareCardMode.SAVED,
                    onEdit = {},
                    onOpenWhatsApp = { opened += it.id },
                )
            }
        }

        // El texto es el del servidor, a la vista; el nombre del fletero es el botón del envío uno a uno.
        composeRule.onNodeWithText(shareState(canEdit = true).exportText!!).assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.export_send_to_fletero)).assertIsDisplayed()
        composeRule.onNodeWithText("Ana").assertIsDisplayed().performClick()
        composeRule.waitForIdle()

        assertEquals(listOf(7), opened)
    }

    @Test
    fun `a day that is no longer today keeps the card read-only and leaves through Volver`() {
        var edited = 0
        var closed = 0

        composeRule.setContent {
            TrindadeTheme {
                LoadingShareScreen(
                    date = shareState(canEdit = false).date,
                    state = shareState(canEdit = false),
                    onShare = {},
                    onPdf = {},
                    onBack = { closed++ },
                    mode = ShareCardMode.FROM_HISTORY,
                    onEdit = { edited++ },
                )
            }
        }

        composeRule.onNodeWithText(copy(R.string.share_card_edit)).assertDoesNotExist()
        composeRule.onNodeWithText(copy(R.string.share_card_back)).assertIsDisplayed().performClick()
        composeRule.waitForIdle()

        assertEquals(0, edited)
        assertEquals(1, closed)
    }
}
