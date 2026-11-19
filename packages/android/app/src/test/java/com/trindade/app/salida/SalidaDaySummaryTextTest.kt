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
 * El mensaje del día de Salida es **el mismo texto que manda la web**.
 *
 * La forma se copió de `salidaDaySummaryText` en `packages/frontend/src/lib/salida.ts` y se fija acá como golden:
 * el operario en mayúsculas y sin negrita, con dos puntos; una línea por producto con `- ` y `: N un`; los bloques
 * en el orden del catálogo y sólo si tienen algo; una línea en blanco entre un operario y el siguiente; y el nombre
 * corto de la tabla aprobada, sin códigos. Cualquier marca que se mueva acá es el mismo mensaje saliendo en dos
 * versiones distintas, que es exactamente lo que el grupo terminaría notando.
 */
class SalidaDaySummaryTextTest {

    private val table = WhatsappAbbreviations.parse(
        """
        {
          "catalogueByCode": { "1356": "DISCO 400g", "1357": "DISCO 200g", "1900": "BOBINA ROLO" },
          "catalogueByName": {},
          "erpByName": {}
        }
        """.trimIndent(),
    )

    private fun item(code: String, name: String, block: String, quantity: Int) = SalidaMovementItemsInner(
        id = code.toIntOrNull() ?: 0,
        productCode = code,
        productName = name,
        // El generador del contrato nombra el bloque de materia prima con `Minus` en el identificador.
        block = if (block == "materia-prima") {
            SalidaMovementItemsInner.Block.materiaMinusPrima
        } else {
            SalidaMovementItemsInner.Block.valueOf(block)
        },
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

    private fun erpProduct(code: String, name: String, block: String, units: Int) =
        com.trindade.app.contract.models.SalidaReportOperatorProductsInner(
            code = code,
            name = name,
            block = com.trindade.app.contract.models.SalidaReportOperatorProductsInner.Block.valueOf(block),
            units = units,
        )

    private fun erpOperator(
        username: String,
        products: List<com.trindade.app.contract.models.SalidaReportOperatorProductsInner>,
    ) = com.trindade.app.contract.models.SalidaReportDayViewOperatorsInner(
        name = username.replaceFirstChar { it.uppercase() },
        username = username,
        units = products.sumOf { it.units },
        products = products,
        erpOnly = true,
    )

    @Test
    fun `the day is exactly the web's message`() {
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

        assertEquals(
            """
            🚛 *Saídas do dia — 18/11/2026*
            Movimentos: 1

            👤 WILKIN:
            *📦 Embalagens*
            - DISCO 400g: 6000 un
            *🧵 Bobinas*
            - BOBINA ROLO: 13 un
            """.trimIndent(),
            text,
        )
    }

    @Test
    fun `several movements are separated by a blank line and each keeps its own blocks`() {
        val text = salidaDaySummaryText(
            date = "2026-11-18",
            movements = listOf(
                movement(1, "wilkin", "Wilkin", listOf(item("1356", "EMBALAG. DISCO 400g", "embalagens", 6000))),
                movement(2, "ana", "Ana Paula", listOf(item("1900", "BOBINA ROLO", "bobinas", 13))),
            ),
            abbreviations = table,
        )

        assertEquals(
            """
            🚛 *Saídas do dia — 18/11/2026*
            Movimentos: 2

            👤 WILKIN:
            *📦 Embalagens*
            - DISCO 400g: 6000 un

            👤 ANA:
            *🧵 Bobinas*
            - BOBINA ROLO: 13 un
            """.trimIndent(),
            text,
        )
    }

    @Test
    fun `the blocks keep the catalogue's order, not the order the items arrived in`() {
        val text = salidaDaySummaryText(
            date = "2026-11-18",
            movements = listOf(
                movement(
                    1,
                    "wilkin",
                    "Wilkin",
                    listOf(
                        item("2500", "SAL REFINADO", "materia-prima", 4),
                        item("1356", "EMBALAG. DISCO 400g", "embalagens", 6000),
                    ),
                ),
            ),
            abbreviations = table,
        )

        // Embalagens antes de matéria-prima, como en el catálogo y como en la web; y el emoji de la web (🌾).
        assertEquals(
            """
            🚛 *Saídas do dia — 18/11/2026*
            Movimentos: 1

            👤 WILKIN:
            *📦 Embalagens*
            - DISCO 400g: 6000 un
            *🌾 Matéria-Prima*
            - SAL REFINADO: 4 un
            """.trimIndent(),
            text,
        )
    }

    @Test
    fun `the message signs with the username, never with the display name`() {
        val text = salidaDaySummaryText(
            date = "2026-11-18",
            movements = listOf(
                movement(1, "wilkin", "Wilkin Test", listOf(item("1356", "EMBALAG. DISCO 400g", "embalagens", 6000))),
            ),
            abbreviations = table,
        )

        assertTrue(text.contains("👤 WILKIN:"))
        assertFalse(text.contains("Wilkin Test"))
        assertFalse(text.contains("WILKIN*"))
    }

    @Test
    fun `another locale relabels the same message without touching its shape`() {
        val labels = SalidaSummaryLabels(
            title = "Salidas del día",
            movements = "Movimientos",
            blocks = mapOf(
                SalidaCatalog.BLOCK_EMBALAGENS to "Embalajes",
                SalidaCatalog.BLOCK_BOBINAS to "Bobinas",
                SalidaCatalog.BLOCK_MATERIA_PRIMA to "Materia Prima",
            ),
        )

        val text = salidaDaySummaryText(
            date = "2026-11-18",
            movements = listOf(
                movement(1, "wilkin", "Wilkin", listOf(item("1356", "EMBALAG. DISCO 400g", "embalagens", 6000))),
            ),
            abbreviations = table,
            labels = labels,
        )

        assertEquals(
            """
            🚛 *Salidas del día — 18/11/2026*
            Movimientos: 1

            👤 WILKIN:
            *📦 Embalajes*
            - DISCO 400g: 6000 un
            """.trimIndent(),
            text,
        )
        // El nombre del catálogo que la tabla no conoce y el código no salen nunca.
        assertFalse(text.contains("EMBALAG."))
        assertFalse(text.contains("1356"))
    }

    /**
     * Lo que el ERP registró de otros operarios también va en el mensaje.
     *
     * El histórico arma el texto con los movimientos de Trindade; los asientos que sólo existen en el ERP -- o un
     * producto de un operario del día que no salió acá -- se suman con el mismo formato y la misma tabla, sin
     * repetir a nadie. Sin ERP, el texto es exactamente el de antes.
     */
    @Test
    fun `erp-only operators join the message, merged without repeating`() {
        val erpOperators = listOf(
            erpOperator(
                username = "ana",
                products = listOf(
                    erpProduct("1357", "EMBALAG. DISCO 200g", "embalagens", 4),
                    erpProduct("1900", "BOBINA ROLO", "bobinas", 2),
                ),
            ),
        )

        val text = salidaDaySummaryText(
            date = "2026-11-18",
            movements = listOf(movement(1, "wilkin", "Wilkin", listOf(item("1356", "EMBALAG. DISCO 400g", "embalagens", 6000)))),
            abbreviations = table,
            erpOperators = erpOperators,
        )

        assertEquals(
            """
            🚛 *Saídas do dia — 18/11/2026*
            Movimentos: 1

            👤 WILKIN:
            *📦 Embalagens*
            - DISCO 400g: 6000 un

            👤 ANA:
            *📦 Embalagens*
            - DISCO 200g: 4 un
            *🧵 Bobinas*
            - BOBINA ROLO: 2 un
            """.trimIndent(),
            text,
        )
    }

    @Test
    fun `a product the archive already carries is not repeated from the erp`() {
        val text = salidaDaySummaryText(
            date = "2026-11-18",
            movements = listOf(movement(1, "wilkin", "Wilkin", listOf(item("1356", "EMBALAG. DISCO 400g", "embalagens", 6000)))),
            abbreviations = table,
            erpOperators = listOf(
                erpOperator(
                    username = "WILKIN",
                    products = listOf(
                        erpProduct("1356", "EMBALAG. DISCO 400g", "embalagens", 6000),
                        erpProduct("1900", "BOBINA ROLO", "bobinas", 1),
                    ),
                ),
            ),
        )

        // El operario se dibuja una vez; el producto ya presente no se repite y el nuevo entra en su bloque.
        assertEquals(text, 1, Regex("👤 WILKIN:").findAll(text).count())
        assertEquals(text, 1, Regex("DISCO 400g").findAll(text).count())
        assertTrue(text.contains("- BOBINA ROLO: 1 un"))
    }

    @Test
    fun `a day without movements produces no message`() {
        assertEquals("", salidaDaySummaryText("2026-11-18", emptyList(), table))
    }
}
