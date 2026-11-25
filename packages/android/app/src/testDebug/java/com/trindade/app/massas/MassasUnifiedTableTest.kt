package com.trindade.app.massas

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.aero.AeroErpMovement
import com.trindade.app.network.MassaIndividualLaunch
import com.trindade.app.network.MassaProductTotal
import com.trindade.app.network.MassasLaunchDayView
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Qué dice la tabla cuando una fila no se puede importar, y cómo se deshace un ack.
 *
 * Las dos cosas son la misma queja desde la planta: una fila que existe, que pide una acción y que no explica
 * nada. El asiento del ERP sin cajas enteras quedaba mudo, y el ack de "ya está en la tablet" no tenía vuelta.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w375dp-h800dp")
class MassasUnifiedTableTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val products = listOf(MassaProductTotal(code = "1192", name = "MASSA PASTEL", unitsPerBox = 10, totalBoxes = 0, totalUnits = 0))

    private fun day(launches: List<MassaIndividualLaunch> = emptyList()) = MassasLaunchDayView(
        date = "2026-10-30",
        products = products,
        launches = launches,
        totalBoxes = launches.sumOf { it.boxes },
        totalUnits = launches.sumOf { it.units },
    )

    /** Un administrador mira la tabla salvo que el test diga otra cosa: es quien ve todas las filas. */
    private val admin = com.trindade.app.contract.models.ProfileResponseUser(
        id = 1,
        username = "wilkin",
        displayName = "Wilkin",
        role = "Administrador",
    )

    private fun draw(
        state: MassasLaunchViewModel.UiState,
        viewer: com.trindade.app.contract.models.ProfileResponseUser? = admin,
        onAcknowledge: (MassasUnifiedRow) -> Unit = {},
        onUndoAcknowledge: (MassasUnifiedRow) -> Unit = {},
    ) {
        composeRule.setContent {
            TrindadeTheme {
                MassasUnifiedTable(
                    state = state.copy(currentUser = viewer),
                    onSend = {},
                    onAcknowledge = onAcknowledge,
                    onUndoAcknowledge = onUndoAcknowledge,
                    onImport = {},
                )
            }
        }
    }

    @Test
    fun `un asiento que no cierra cajas enteras muestra el dato compacto, no la explicacion`() {
        val seat = AeroErpMovement(
            entLan = 35940,
            productCode = "1192",
            productDesc = "MASSA PASTEL",
            quantity = 15.0,
            entryDate = "2026-10-30",
            operatorName = "JEFFERSON",
            movementType = "E",
            ownerUserId = 12,
            ownerStatus = "active",
        )
        draw(MassasLaunchViewModel.UiState(dayView = day(), aeroMirror = listOf(seat)))

        composeRule
            .onNodeWithText(string(R.string.massas_open_box_compact, 5))
            .assertIsDisplayed()
        composeRule
            .onNodeWithText("não fecham caixas inteiras", substring = true)
            .assertDoesNotExist()
    }

    @Test
    fun `una fila ya marcada ofrece deshacer y lo hace`() {
        val launch = MassaIndividualLaunch(
            id = 5,
            launchDate = "2026-10-30",
            date = "2026-10-30",
            productCode = "1192",
            productName = "MASSA PASTEL",
            boxes = 2,
            units = 20,
            userId = 1,
            username = "jefferson",
            displayName = "Jefferson",
        )
        var undone: MassasUnifiedRow? = null
        draw(
            state = MassasLaunchViewModel.UiState(dayView = day(listOf(launch)), ackedLaunchIds = setOf(5)),
            onUndoAcknowledge = { undone = it },
        )

        // La fila marcada ya no ofrece volver a marcarla: ofrece deshacer, que es la única acción que le queda.
        composeRule.onNodeWithText(string(R.string.massas_action_undo_on_tablet)).performClick()

        assertEquals(listOf(5), undone?.launchIds)
    }

    @Test
    fun `una fila sin marcar sigue ofreciendo decir que esta en la tablet`() {
        val launch = MassaIndividualLaunch(
            id = 6,
            launchDate = "2026-10-30",
            date = "2026-10-30",
            productCode = "1192",
            productName = "MASSA PASTEL",
            boxes = 2,
            units = 20,
            userId = 1,
            username = "jefferson",
            displayName = "Jefferson",
        )
        var acked: MassasUnifiedRow? = null
        draw(
            state = MassasLaunchViewModel.UiState(dayView = day(listOf(launch))),
            onAcknowledge = { acked = it },
        )

        composeRule.onNodeWithText(string(R.string.massas_action_on_tablet)).performClick()

        assertEquals(listOf(6), acked?.launchIds)
    }

    /** El bloqueo pertenece al lanzamiento, no a toda la tabla ni al índice visual de la fila. */
    @Test
    fun `en vuelo y despachado deshabilitan solo la fila correspondiente y fallo permite reintentar`() {
        val first = MassaIndividualLaunch(
            id = 21, launchDate = "2026-10-30", date = "2026-10-30", productCode = "1192",
            productName = "MASSA PASTEL", boxes = 2, units = 20, userId = 1,
            username = "ana", displayName = "Ana",
        )
        val second = first.copy(id = 22, userId = 2, username = "bia", displayName = "Bia")
        val state = androidx.compose.runtime.mutableStateOf(
            MassasLaunchViewModel.UiState(
                dayView = day(listOf(first, second)),
                sendingLaunchIds = setOf(21),
                currentUser = admin,
            ),
        )
        composeRule.setContent {
            TrindadeTheme {
                MassasUnifiedTable(
                    state = state.value, onSend = {}, onAcknowledge = {}, onImport = {},
                )
            }
        }
        fun sendButtons() = composeRule.onAllNodesWithText(string(R.string.massas_action_send))

        sendButtons()[0].assertIsNotEnabled()
        sendButtons()[1].assertIsEnabled()

        composeRule.runOnIdle { state.value = state.value.copy(sendingLaunchIds = emptySet(), dispatchedLaunchIds = setOf(21)) }
        sendButtons()[0].assertIsNotEnabled()
        sendButtons()[1].assertIsEnabled()

        // Un fallo no es un despacho: al terminar el intento la misma fila vuelve a aceptar el reenvío.
        composeRule.runOnIdle { state.value = state.value.copy(dispatchedLaunchIds = emptySet()) }
        sendButtons()[0].assertIsEnabled()
        sendButtons()[1].assertIsEnabled()
    }

    private fun string(resId: Int, vararg args: Any): String =
        androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
            .getString(resId, *args)
}
