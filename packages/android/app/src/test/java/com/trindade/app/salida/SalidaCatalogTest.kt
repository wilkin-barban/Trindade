package com.trindade.app.salida

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El catálogo y lo que viaja al ERP.
 *
 * El número de productos, el orden de los bloques y la forma de los documentos son un contrato con la
 * planta: la web los manda así desde la primera baja y el ERP rechaza cualquier variación. Un cambio acá
 * sin cambiar la web deja a los dos clientes contando cosas distintas.
 */
class SalidaCatalogTest {

    @Test
    fun `the catalogue is the nineteen products, eleven three five`() {
        assertEquals(19, SalidaCatalog.products.size)
        assertEquals(11, SalidaCatalog.inBlock(SalidaCatalog.BLOCK_EMBALAGENS).size)
        assertEquals(3, SalidaCatalog.inBlock(SalidaCatalog.BLOCK_BOBINAS).size)
        assertEquals(5, SalidaCatalog.inBlock(SalidaCatalog.BLOCK_MATERIA_PRIMA).size)

        // El orden que dibuja la pantalla: el primero y el último son los de la web.
        assertEquals("1357", SalidaCatalog.products.first().code)
        assertEquals("1673", SalidaCatalog.products.last().code)
        // La lista de la web excluye 1040, 1474 y 1473, y 1673 aparece una sola vez.
        for (excluded in listOf("1040", "1474", "1473")) {
            assertNull(SalidaCatalog.product(excluded))
        }
        assertEquals(1, SalidaCatalog.products.count { it.code == "1673" })
    }

    @Test
    fun `four digits on screen, six towards the ERP`() {
        assertEquals("1357", SalidaCatalog.displayCode("1357"))
        assertEquals("001357", SalidaCatalog.erpCode("1357"))
        assertEquals("000039", SalidaCatalog.erpCode("39"))
        // La cantidad se escribe en unidades y viaja por cien.
        assertEquals(20, SalidaCatalog.quantity(" 20 "))
        assertEquals(0, SalidaCatalog.quantity("0"))
        assertEquals(0, SalidaCatalog.quantity("-3"))
        assertEquals(0, SalidaCatalog.quantity("2.5"))
        assertEquals(0, SalidaCatalog.quantity("abc"))
        assertEquals(2000, SalidaCatalog.erpQuantity(20))
    }

    @Test
    fun `one document per product, with the certified fields`() {
        val selection = SalidaSelection(
            listOf(
                SalidaLine("1357", 20),
                SalidaLine("1900", 3),
                SalidaLine("1673", 5),
            ),
        )

        val payloads = SalidaErpPayload.payloads(selection, "2026-11-18", "wilkin")

        assertEquals(3, payloads.size)
        val first = payloads.first()
        assertEquals("001357", first.PRO_COD)
        assertEquals("EMBALAG. DISCO 200g", first.PRO_DES)
        assertEquals(2000, first.PRO_QTD)
        assertEquals("2026-11-18", first.PED_DTA)
        assertEquals("WILKIN", first.PED_USU)
        assertEquals("APL", first.PED_SER)
        assertEquals("2026-11-18", first.PED_DTANOT)
        assertEquals("Saida de massas via Trindade", first.PED_OBS)
        assertTrue(first.LOTES.isEmpty())
        assertEquals(28, selection.totalUnits)
    }

    @Test
    fun `a code the catalogue does not have never becomes a document`() {
        val payload = SalidaErpPayload.payload(SalidaLine("9999", 3), "2026-11-18", "wilkin")
        assertNull(payload)
        // Y una cantidad que no es una cantidad tampoco.
        assertNull(SalidaErpPayload.payload(SalidaLine("1357", 0), "2026-11-18", "wilkin"))
    }

    @Test
    fun `the operator falls back to the code the ERP knows`() {
        assertEquals("1", SalidaErpPayload.payload(SalidaLine("1357", 1), "2026-11-18", null)?.PED_USU)
        assertEquals("1", SalidaErpPayload.payload(SalidaLine("1357", 1), "2026-11-18", "  ")?.PED_USU)
    }

    @Test
    fun `a trip carries eight documents at most`() {
        val selection = SalidaSelection(SalidaCatalog.products.map { SalidaLine(it.code, 1) })
        val payloads = SalidaErpPayload.payloads(selection, "2026-11-18", "wilkin")

        assertEquals(19, payloads.size)
        val trips = SalidaErpPayload.trips(payloads)
        assertEquals(3, trips.size)
        assertEquals(listOf(8, 8, 3), trips.map { it.size })
    }
}
