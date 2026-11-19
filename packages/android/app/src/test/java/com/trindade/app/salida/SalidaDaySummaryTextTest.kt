package com.trindade.app.salida

import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaMovementErp
import com.trindade.app.contract.models.SalidaMovementItemsInner
import com.trindade.app.contract.models.SalidaMovementPhotosInner
import com.trindade.app.contract.models.SalidaMovementReconciliation
import com.trindade.app.massas.WhatsappAbbreviations
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El mensaje del día de Salida, con la tabla de abreviaturas.
 *
 * La planta lee qué salió y cuánto, por operario y por bloque: sin códigos de producto, sin etiquetas de estado
 * del ERP y con el nombre corto que la tabla aprobó. Un día vacío no arma mensaje.
 */
class SalidaDaySummaryTextTest {

    private val table = WhatsappAbbreviations.parse(
        """
        {
          "catalogueByCode": { "1356": "DISCO 400g", "1900": "BOBINA ROLO" },
          "catalogueByName": {},
          "erpByName": {}
        }
        """.trimIndent(),
    )

    private fun item(code: String, name: String, block: String, quantity: Int) = SalidaMovementItemsInner(
        id = code.toIntOrNull() ?: 0,
        productCode = code,
        productName = name,
        block = SalidaMovementItemsInner.Block.valueOf(block),
        quantity = quantity,
        position = 0,
    )

    private fun movement(
        id: Int,
        user: String,
        display: String,
        items: List<SalidaMovementItemsInner>,
    ) = SalidaCreateResponseMovement(
        id = id,
        movementDate = "2026-11-18",
        userId = id,
        username = user,
        displayName = display,
        createdAt = "2026-11-18T09:00:00.000Z",
        items = items,
        photos = emptyList<SalidaMovementPhotosInner>(),
        totalUnits = items.sumOf { it.quantity },
        reconciliation = SalidaMovementReconciliation(
            status = SalidaMovementReconciliation.Status.pending,
            entLans = emptyList(),
            matchedItemIds = emptyList(),
        ),
        erp = null as SalidaMovementErp?,
    )

    @Test
    fun `the day reads by operator and block with the approved short names`() {
        val text = salidaDaySummaryText(
            date = "2026-11-18",
            movements = listOf(
                movement(
                    1,
                    "wilkin",
                    "Wilkin",
                    listOf(
                        item("1356", "EMBALAG. DISCO 400g", "embalagens", 6000),
                        item("1900", "BOBINA ROLO", "bobinas", 13),
                    ),
                ),
            ),
            abbreviations = table,
        )

        assertTrue(text.startsWith("🚛 *Salidas del día — 18/11/2026*"))
        assertTrue(text.contains("Movimientos: 1"))
        assertTrue(text.contains("👤 *WILKIN*"))
        assertTrue(text.contains("📦 Embalajes"))
        assertTrue(text.contains("• DISCO 400g — 6000 un"))
        assertTrue(text.contains("🧵 Bobinas"))
        assertTrue(text.contains("• BOBINA ROLO — 13 un"))
        // Sin códigos, sin estados del ERP y con el nombre corto, no el del catálogo largo.
        assertFalse(text.contains("1356"))
        assertFalse(text.contains("EMBALAG."))
        assertFalse(text.contains("Enviado"))
    }

    @Test
    fun `a day without movements produces no message`() {
        assertEquals("", salidaDaySummaryText("2026-11-18", emptyList(), table))
    }
}
