package com.trindade.app.salida

import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaHistoryResponseDaysInner
import com.trindade.app.contract.models.SalidaMovementReconciliation
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Tras confirmar la baja, la tarjeta sale del estado antes de que termine la recarga.
 *
 * La pantalla dibuja `history`/`day`: sin esta poda, `refresh()` era la única forma de quitarla y, mientras
 * viajaba -- o si fallaba --, la tarjeta seguía a la vista con una copia vieja. El modal de éxito se abre sobre la
 * lista que ya no la tiene.
 */
class SalidaOptimisticDeleteTest {
    private fun movement(id: Int, date: String = "2026-11-19") = SalidaCreateResponseMovement(
        id = id,
        movementDate = date,
        userId = 1,
        username = "wilkin",
        displayName = "Wilkin",
        createdAt = "${date}T09:00:00.000Z",
        items = emptyList(),
        photos = emptyList(),
        totalUnits = 1,
        reconciliation = SalidaMovementReconciliation(
            status = SalidaMovementReconciliation.Status.pending,
            entLans = emptyList(),
            matchedItemIds = emptyList(),
        ),
        erp = null,
    )

    private fun day(date: String, movements: List<SalidaCreateResponseMovement>) =
        SalidaHistoryResponseDaysInner(date = date, totalUnits = 1, movements = movements)

    @Test
    fun `removes the movement from the day and from every history entry`() {
        val state = SalidaUiState(
            date = "2026-11-19",
            day = listOf(movement(9), movement(10)),
            history = listOf(day("2026-11-19", listOf(movement(9), movement(10))), day("2026-11-18", listOf(movement(10)))),
        )

        val pruned = state.withoutMovement(10)

        assertEquals(listOf(9), pruned.day.map { it.id })
        assertEquals(listOf(9), pruned.history[0].movements.map { it.id })
        // El mismo id en otro día también sale: un borrado no es de una sola fecha.
        assertEquals(emptyList<Int>(), pruned.history[1].movements.map { it.id })
    }

    @Test
    fun `a state that never had the movement is left unchanged`() {
        val state = SalidaUiState(day = listOf(movement(9)), history = listOf(day("2026-11-19", listOf(movement(9)))))
        assertEquals(listOf(9), state.withoutMovement(999).day.map { it.id })
    }
}
