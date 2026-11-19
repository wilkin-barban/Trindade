package com.trindade.app.stock

import com.trindade.app.contract.models.StockDay
import com.trindade.app.contract.models.StockDayProductsInner
import com.trindade.app.massas.WhatsappAbbreviations
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La contagem usa la tabla aprobada, y sin tabla conserva el nombre.
 *
 * La misma tabla que el Relatório: lo que el grupo lee es el nombre corto. Cuando la tabla no tiene una fila para
 * el producto, el mensaje no recorta nada por su cuenta.
 */
class StockMessageAbbreviationsTest {

    private val table = WhatsappAbbreviations.parse(
        """{"catalogueByCode":{"1356":"DISCO 400g"},"catalogueByName":{},"erpByName":{}}""",
    )

    private fun day(vararg products: StockDayProductsInner) = StockDay(
        date = "2026-11-18",
        products = products.toList(),
        totalBoxes = 1,
        totalUnits = products.sumOf { it.units },
    )

    private fun product(code: String, name: String) = StockDayProductsInner(
        code = code,
        name = name,
        category = "Massas",
        unitsPerBox = 10,
        boxes = 1,
        units = 10,
    )

    @Test
    fun `the message uses the approved short name when the table knows the product`() {
        val text = stockMessage(day(product("1356", "EMBALAG. DISCO 400g")), table)
        assertTrue(text, text.contains("DISCO 400g"))
        assertTrue("el nombre largo no debería viajar", !text.contains("EMBALAG."))
    }

    @Test
    fun `without a table the name travels as it came`() {
        val text = stockMessage(day(product("1356", "EMBALAG. DISCO 400g")), WhatsappAbbreviations.EMPTY)
        assertTrue(text, text.contains("EMBALAG. DISCO 400g"))
    }
}
