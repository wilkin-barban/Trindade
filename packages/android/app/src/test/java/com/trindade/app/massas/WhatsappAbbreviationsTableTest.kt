package com.trindade.app.massas

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * La tabla del WhatsApp es una sola, y Android lee la misma.
 *
 * El mensaje que la planta manda al grupo lo escribe el backend en el Relatório, el navegador en los históricos de
 * Masas y Salidas, y el teléfono en el módulo de Masas. Tres escritores con dos tablas se separan en una semana: la
 * copia que viaja en los assets se compara acá, fila por fila, contra el archivo que sirve la web.
 */
class WhatsappAbbreviationsTableTest {

    private val repositoryRoot = File(System.getProperty("user.dir")).let { dir ->
        // Gradle corre en `packages/android/app`; el archivo de la web está cuatro niveles arriba.
        generateSequence(dir) { it.parentFile }.first { File(it, "packages/frontend").isDirectory }
    }

    private val webTable = File(
        repositoryRoot,
        "packages/frontend/src/lib/whatsapp-abbreviations.table.json",
    )

    private val androidTable = File(
        repositoryRoot,
        "packages/android/app/src/main/assets/whatsapp-abbreviations.table.json",
    )

    @Test
    fun `the asset is the same file the web ships`() {
        assertTrue("falta el archivo de la web: $webTable", webTable.isFile)
        assertTrue("falta el asset de Android: $androidTable", androidTable.isFile)

        val json = Json { ignoreUnknownKeys = true }
        val web = json.parseToJsonElement(webTable.readText()).jsonObject
        val android = json.parseToJsonElement(androidTable.readText()).jsonObject

        val sections = listOf("catalogueByCode", "catalogueByName", "erpByName", "taskByName")
        var rows = 0
        for (section in sections) {
            val expected = web[section]?.jsonObject ?: error("la web no tiene la sección $section")
            val actual = android[section]?.jsonObject ?: error("Android no tiene la sección $section")
            assertEquals("$section: mismo número de filas", expected.size, actual.size)
            for ((key, value) in expected) {
                assertEquals("$section: $key", value.jsonPrimitive.content, actual[key]?.jsonPrimitive?.content)
                rows += 1
            }
        }

        // La tabla aprobada tiene más de cien filas: si el archivo se truncara, el conteo lo delata.
        assertTrue("se compararon $rows filas", rows >= 100)
    }

    @Test
    fun `the abbreviations the message uses are the approved ones`() {
        val json = Json { ignoreUnknownKeys = true }
        val table: JsonObject = json.parseToJsonElement(androidTable.readText()).jsonObject

        fun value(section: String, key: String): String =
            table[section]?.jsonObject?.get(key)?.jsonPrimitive?.content
                ?: error("$section no tiene $key")

        assertEquals("DISCO 200g", value("catalogueByCode", "1357"))
        assertEquals("AÇÚCAR 5kg", value("catalogueByCode", "1074"))
        assertEquals("CASEIRA 1kg", value("erpByName", "MASSA PARA PASTEL TRINDADE CASEIRA 1 KG"))
        assertEquals("PÃO ALHO 320g", value("erpByName", "320 G PÃO DE ALHO TRINDADE TRADICIONAL"))
        assertEquals("Org. área farinha", value("taskByName", "ORGANIZAÇÃO DA ÁREA DA FARINHA"))
    }
}
