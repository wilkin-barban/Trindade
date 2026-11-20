package com.trindade.app.salida

import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaMovementErp
import com.trindade.app.contract.models.SalidaMovementReconciliation
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Excluir un borrador es del dueño o del Administrador, y sólo mientras el ERP no lo confirmó.
 *
 * Es la regla del servidor; la tarjeta la usa para no ofrecer una acción que va a terminar en 403 o en 409.
 */
class SalidaDeleteOfferTest {
    private fun movement(owner: String, status: SalidaMovementErp.Status?) = SalidaCreateResponseMovement(
        id = 1,
        movementDate = "2026-11-19",
        userId = 1,
        username = owner,
        displayName = owner,
        createdAt = "2026-11-19T09:00:00.000Z",
        items = emptyList(),
        photos = emptyList(),
        totalUnits = 0,
        reconciliation = SalidaMovementReconciliation(
            status = SalidaMovementReconciliation.Status.pending,
            entLans = emptyList(),
            matchedItemIds = emptyList(),
        ),
        erp = status?.let { SalidaMovementErp(status = it, message = "x", sentAt = "2026-11-19T10:00:00.000Z") },
    )

    @Test
    fun `the owner can withdraw it while the ERP has not confirmed it`() {
        assertTrue(salidaOffersDelete(movement("ana", null), "ana", viewerIsAdmin = false))
        assertTrue(salidaOffersDelete(movement("ana", SalidaMovementErp.Status.failed), "ana", viewerIsAdmin = false))
    }

    @Test
    fun `another operator cannot, unless it is the Administrador`() {
        assertFalse(salidaOffersDelete(movement("ana", null), "wilkin", viewerIsAdmin = false))
        assertTrue(salidaOffersDelete(movement("ana", null), "wilkin", viewerIsAdmin = true))
    }

    @Test
    fun `a confirmed movement never offers it`() {
        assertFalse(salidaOffersDelete(movement("ana", SalidaMovementErp.Status.sent), "ana", viewerIsAdmin = true))
        assertFalse(salidaOffersDelete(movement("ana", SalidaMovementErp.Status.partial), "ana", viewerIsAdmin = true))
    }
}
