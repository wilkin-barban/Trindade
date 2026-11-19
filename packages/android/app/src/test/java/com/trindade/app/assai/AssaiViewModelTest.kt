package com.trindade.app.assai

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What the order screen holds, tested without a screen and without a device.
 *
 * The ViewModel owns the moment -- which field was left, which one is being typed in -- and asks the pure
 * rule about the numbers. These cases pin the same behaviour the web pins: silence while a field is being
 * edited, a warning once it is left, and a total that only counts what can be served.
 */
class AssaiViewModelTest {

    @Test
    fun `typing does not accuse and leaving the field does`() {
        val vm = AssaiViewModel(TestAbbreviations())
        vm.onFocus("Nhoque 1kg")
        vm.onQuantityChange("Nhoque 1kg", "20")

        assertTrue("el pedido ya es inexacto", vm.hasError())
        assertEquals(emptyList<String>(), vm.visibleErrors())

        vm.onBlur("Nhoque 1kg")
        assertEquals(listOf("Nhoque 1kg"), vm.visibleErrors())
    }

    @Test
    fun `coming back into a field clears its warning`() {
        val vm = AssaiViewModel(TestAbbreviations())
        vm.onQuantityChange("Disco 200g", "20")
        vm.onBlur("Disco 200g")
        assertEquals(listOf("Disco 200g"), vm.visibleErrors())

        vm.onFocus("Disco 200g")
        assertEquals(emptyList<String>(), vm.visibleErrors())
        vm.onQuantityChange("Disco 200g", "160")
        assertEquals(emptyList<String>(), vm.visibleErrors())
        assertFalse(vm.hasError())
    }

    @Test
    fun `the total counts only the products that can be served`() {
        val vm = AssaiViewModel(TestAbbreviations())
        vm.onQuantityChange("Nhoque 1kg", "30")
        vm.onQuantityChange("Rolo 2kg", "20")
        vm.onQuantityChange("Disco 200g", "20")
        assertEquals(4, vm.totalBoxes())
    }

    @Test
    fun `an empty order says so instead of travelling empty`() {
        assertTrue(AssaiViewModel(TestAbbreviations()).message().contains("Nenhum produto"))
    }

    @Test
    fun `selecting a day updates the message header and toggling it clears it`() {
        val vm = AssaiViewModel(TestAbbreviations())
        vm.onQuantityChange("Nhoque 1kg", "30")
        assertTrue(vm.message().startsWith("🛒 Pedido Assaí\n"))

        vm.onDaySelect("Sexta-feira")
        assertEquals("Sexta-feira", vm.state.value.selectedDay)
        assertTrue(vm.message().startsWith("🛒 Pedido Assaí Sexta-feira\n"))

        // Toggling the same day clears it
        vm.onDaySelect("Sexta-feira")
        assertNull(vm.state.value.selectedDay)
        assertTrue(vm.message().startsWith("🛒 Pedido Assaí\n"))
    }

    @Test
    fun `the chat link needs a number that can carry one`() {
        val vm = AssaiViewModel(TestAbbreviations())
        vm.onQuantityChange("Nhoque 1kg", "30")
        assertNull("sin número no hay conversación", vm.whatsappLink())

        vm.onNumberChange("(11) 99999-8888")
        val link = vm.whatsappLink()
        assertTrue(link != null && link.startsWith("https://api.whatsapp.com/send?phone=5511999998888"))
    }
}

/**
 * La tabla del WhatsApp, sin Android de por medio.
 *
 * La fuente real lee un asset del APK; acá se construye desde el mismo JSON que viaja en el proyecto, así el
 * mensaje de Assaí se prueba con las abreviaturas que la planta va a leer.
 */
private class TestAbbreviations : com.trindade.app.massas.WhatsappAbbreviationsSource(null) {
    override val table: com.trindade.app.massas.WhatsappAbbreviations
        get() = com.trindade.app.massas.WhatsappAbbreviations.parse(
            """{"catalogueByCode":{},"catalogueByName":{},"erpByName":{}}""",
        )
}
