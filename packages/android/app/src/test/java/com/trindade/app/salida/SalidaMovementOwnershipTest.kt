package com.trindade.app.salida

import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaMovementReconciliation
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Las fotos de un movimiento son de quien lo lanzó.
 *
 * El histórico muestra los movimientos de todos los operarios, y también los que llegaron del ERP. Anexar o
 * borrar una foto de un asiento ajeno es tocar el registro de otra persona: la pantalla esconde los controles y
 * el servidor rechaza el intento (403 `SALIDA_NOT_OWNER`), que es la mitad que manda.
 */
class SalidaMovementOwnershipTest {

    private fun movement(username: String) = SalidaCreateResponseMovement(
        id = 1,
        movementDate = "2026-11-19",
        userId = 7,
        username = username,
        displayName = "Wilkin",
        createdAt = "2026-11-19T09:00:00.000Z",
        items = emptyList(),
        photos = emptyList(),
        totalUnits = 0,
        reconciliation = SalidaMovementReconciliation(
            status = SalidaMovementReconciliation.Status.pending,
            entLans = emptyList(),
            matchedItemIds = emptyList(),
        ),
        erp = null,
    )

    @Test
    fun `the movement belongs to the account that signed it`() {
        assertTrue(movement("wilkin").owns("wilkin"))
        // La sesión puede traer otro casing: el nombre es el mismo.
        assertTrue(movement("Wilkin").owns("wilkin"))
    }

    @Test
    fun `another operator, or a session without a name, owns nothing`() {
        assertFalse(movement("wilkin").owns("ana"))
        assertFalse(movement("wilkin").owns(""))
        // Un asiento sin firma no le pertenece a nadie que esté mirando.
        assertFalse(movement("").owns(""))
    }

    /**
     * Reenviar escribe en la empresa, no sólo lee: la oferta es del dueño o de un administrador.
     *
     * Antes la pantalla ofrecía el botón a cualquiera con el movimiento a la vista, así que un trabajador podía
     * despachar la baja de otro operario al ERP y firmarla con el nombre del dueño.
     */
    @Test
    fun `only the owner or an administrator is offered the resend`() {
        val mine = movement("wilkin")

        assertTrue(salidaOffersResend(mine, "wilkin", viewerIsAdmin = false, isPending = true))
        assertTrue(salidaOffersResend(mine, "ana", viewerIsAdmin = true, isPending = true))
        assertFalse(salidaOffersResend(mine, "ana", viewerIsAdmin = false, isPending = true))
    }

    @Test
    fun `a movement that is not pending is never offered, not even to its owner`() {
        val mine = movement("wilkin")

        assertFalse(salidaOffersResend(mine, "wilkin", viewerIsAdmin = false, isPending = false))
        assertFalse(salidaOffersResend(mine, "wilkin", viewerIsAdmin = true, isPending = false))
    }
}
