package com.trindade.app.massas

import com.trindade.app.network.MassaIndividualLaunch
import com.trindade.app.network.MassaProductTotal
import com.trindade.app.network.MassasLaunchDayView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The Masas day message, against the text the plant approved for the report.
 *
 * The group reads one message per day and it is the same message in the Relatório, in Salidas and in Masas: the
 * approved abbreviation per product, `- nombre: N un`, `👤` per worker, `📦` in the summary and the exact
 * quantities. Masas adds its boxes, which is the only difference this module owns.
 *
 * The table is the real file the APK ships, so a row that drifts in `packages/frontend` breaks this test too.
 */
class MassasWhatsappGoldenTest {

    private val repositoryRoot = File(System.getProperty("user.dir")).let { dir ->
        generateSequence(dir) { it.parentFile }.first { File(it, "packages/frontend").isDirectory }
    }

    private val table: WhatsappAbbreviations = WhatsappAbbreviations.parse(
        File(
            repositoryRoot,
            "packages/android/app/src/main/assets/whatsapp-abbreviations.table.json",
        ).readText(),
    )

    /** The catalogue in the order the floor reads it, which is also the order of the message. */
    private val catalog = listOf(
        MassaProductTotal("1045", "MASSA CASEIRA", 10, 0, 0),
        MassaProductTotal("39", "MASSA DISCO 200G", 10, 0, 0),
        MassaProductTotal("60", "MASSA DISCO 400G", 20, 0, 0),
        MassaProductTotal("84", "MASSA DISCO 500G", 20, 0, 0),
        MassaProductTotal("91", "MASSA LASANHA 500G", 20, 0, 0),
        MassaProductTotal("1192", "MASSA QUADRADA", 15, 0, 0),
        MassaProductTotal("5000", "MASSA ROLO 1KG", 10, 0, 0),
        MassaProductTotal("1047", "MASSA ROLO 2KG", 6, 0, 0),
        MassaProductTotal("22", "MASSA ROLO 500G", 15, 0, 0),
        MassaProductTotal("1616", "MASSA TOKO", 10, 0, 0),
    )

    private fun launch(
        id: Int,
        userId: Int,
        name: String,
        code: String,
        productName: String,
        units: Int,
        boxes: Int,
    ) = MassaIndividualLaunch(
        id = id,
        productCode = code,
        productName = productName,
        boxes = boxes,
        units = units,
        userId = userId,
        username = name.lowercase(),
        displayName = name,
    )

    /** The 17/11 day: three workers, one of them only through the plant's tablet. */
    private fun dayView(): MassasLaunchDayView {
        val launches = listOf(
            launch(1, 2, "Jaime", "60", "MASSA DISCO 400G", 780, 39),
            launch(2, 2, "Jaime", "84", "MASSA DISCO 500G", 1660, 83),
            launch(3, 2, "Jaime", "1192", "MASSA QUADRADA", 135, 9),
            launch(4, 1, "Wilkin", "60", "MASSA DISCO 400G", 700, 35),
            launch(5, 1, "Wilkin", "1192", "MASSA QUADRADA", 270, 18),
            launch(6, 1, "Wilkin", "22", "MASSA ROLO 500G", 15, 1),
            launch(7, 3, "GUSTAVO H", "1047", "MASSA ROLO 2KG", 732, 122),
        )
        val totals = catalog.map { product ->
            val own = launches.filter { it.productCode == product.code }
            if (own.isEmpty()) {
                product
            } else {
                product.copy(
                    totalBoxes = own.sumOf { it.boxes },
                    totalUnits = own.sumOf { it.units },
                )
            }
        }
        return MassasLaunchDayView(
            date = "2026-11-17",
            products = totals,
            launches = launches,
            totalBoxes = launches.sumOf { it.boxes },
            totalUnits = launches.sumOf { it.units },
        )
    }

    @Test
    fun `the day reads exactly like the report, with the approved names and the boxes`() {
        val expected = listOf(
            "🍝 *Lançamento de Massas — 17/11/2026*",
            "",
            "👤 GUSTAVO H:",
            "- ROLO 2kg: 732 un (122 cx)",
            "",
            "👤 Jaime:",
            "- DISCO 400g: 780 un (39 cx)",
            "- DISCO 500g: 1660 un (83 cx)",
            "- QUADRADA: 135 un (9 cx)",
            "",
            "👤 Wilkin:",
            "- DISCO 400g: 700 un (35 cx)",
            "- QUADRADA: 270 un (18 cx)",
            "- ROLO 500g: 15 un (1 cx)",
            "",
            "Resumo Coletivo:",
            "📦 DISCO 400g: 1480 un (74 cx)",
            "📦 DISCO 500g: 1660 un (83 cx)",
            "📦 QUADRADA: 405 un (27 cx)",
            "📦 ROLO 2kg: 732 un (122 cx)",
            "📦 ROLO 500g: 15 un (1 cx)",
        ).joinToString("\n")

        assertEquals(expected, formatMassasWhatsAppMessage(dayView(), abbreviations = table))
    }

    @Test
    fun `no code, no full catalogue name and no old bullet survives the message`() {
        val message = formatMassasWhatsAppMessage(dayView(), abbreviations = table)

        // Lo que el grupo lee es el nombre corto; el nombre completo del catálogo no aparece.
        assertTrue(message.contains("- DISCO 400g: 780 un (39 cx)"))
        assertTrue("el nombre completo se coló", !message.contains("MASSA DISCO"))
        assertTrue("quedó una viñeta vieja", !message.contains("•"))
        assertTrue("quedó el encabezado viejo", !message.contains("Por Trabalhador"))
        assertTrue("un código de producto se coló", !message.contains("1192"))
        assertTrue("se perdió la caja de la línea", message.contains("(39 cx)"))
        // Cada operario aparece una sola vez, en su encabezado.
        assertEquals(1, message.split("👤 Jaime:").size - 1)
    }

    @Test
    fun `a day without launches says nothing instead of an empty message`() {
        val empty = MassasLaunchDayView(date = "2026-11-17", products = emptyList(), launches = emptyList())

        // Ni el encabezado solo: el día vacío no tiene mensaje y la pantalla muestra su propia prévia vacía.
        assertEquals("", formatMassasWhatsAppMessage(empty, abbreviations = table))
    }

    @Test
    fun `the table names the product, the code is only the fallback and a broken letter is repaired`() {
        // El nombre que la planta escribió manda: el catálogo por nombre lo resuelve.
        assertEquals("DISCO 400g", table.shortName("60", "MASSA DISCO 400G"))
        // Un nombre que la tabla no conoce cae al código.
        assertEquals("CASEIRA", table.shortName("1045", "PRODUCTO DESCONOCIDO"))
        // Sin nombre ni código conocidos, se recorta el prefijo y se respeta el tope de 20.
        assertEquals("ALGO MUY LARGO PARA", table.shortName("999999", "MASSA DE ALGO MUY LARGO PARA LEER"))
        // El nombre roto del espejo se repara al leerlo, y el mensaje nunca lleva la letra rota.
        // El espejo guarda la Ç como Ă más el byte de control que quedó al leer UTF-8 como ISO-8859-2.
        val repaired = table.shortName("1236", "320 G PĂ\u0083O DE ALHO TRINDADE  TR")
        assertTrue("la letra rota llegó al mensaje", !repaired.contains('Ă'))
        assertTrue(repaired.length <= WHATSAPP_NAME_MAX)
        // La reparación no toca el texto sano, que es el que se guarda.
        assertEquals("AÇÚCAR 5kg", repairErpEncoding("AÇÚCAR 5kg"))
        assertEquals("AÇUCAR 5 KG", repairErpEncoding("AĂ\u0087UCAR 5 KG"))
        assertEquals("AÇUCAR 5 KG", repairErpEncoding("AÃ\u0087UCAR 5 KG"))
        assertEquals("AÇUCAR 5 KG", repairErpEncoding("AÃ‡UCAR 5 KG"))
        assertEquals("320 G PÃO DE ALHO", repairErpEncoding("320 G PĂO DE ALHO"))
    }
}
