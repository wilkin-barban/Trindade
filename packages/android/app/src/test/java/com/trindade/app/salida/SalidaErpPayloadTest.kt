package com.trindade.app.salida

import com.trindade.app.di.NetworkModule
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * El cuerpo que viaja a `POST /saidasitem`.
 *
 * Retrofit serializa el `@Body` en memoria antes de tocar la red: si el DTO no es `@Serializable`, el viaje
 * muere con `SerializationException` en pocos milisegundos y el log lo cuenta como ERP inalcanzable sin que el
 * ERP haya visto nada. Por eso lo que se sostiene acá es primero la anotación, y después las claves exactas que
 * el parser de Delphi lee: el WebService rechaza con 500 cualquier variación de nombres.
 */
class SalidaErpPayloadTest {

    // El mismo Json que Dagger le entrega al convertidor de Retrofit: una copia con otros ajustes acordaría con
    // el test en vez de con la app.
    private val json: Json = NetworkModule.provideJson()

    @Test
    fun `the exit body serializes without throwing and with the exact keys the erp reads`() {
        val payload = SalidaErpPayload.payload(SalidaLine("1357", 20), "2026-11-24", "wilkin")
            ?: error("the catalogue must know 1357")

        val encoded = json.encodeToString(SaidaItemPayload.serializer(), payload)
        val fields = Json.parseToJsonElement(encoded).jsonObject

        assertEquals(
            listOf(
                "PRO_COD",
                "PRO_DES",
                "PRO_QTD",
                "PED_DTA",
                "PED_USU",
                "PED_SER",
                "PED_DTANOT",
                "PED_OBS",
                "LOTES",
            ),
            fields.keys.toList(),
        )
        assertEquals("001357", fields.getValue("PRO_COD").jsonPrimitive.content)
        assertEquals("2000", fields.getValue("PRO_QTD").jsonPrimitive.content)
        assertEquals("APL", fields.getValue("PED_SER").jsonPrimitive.content)
        assertEquals("WILKIN", fields.getValue("PED_USU").jsonPrimitive.content)
        assertEquals("2026-11-24", fields.getValue("PED_DTA").jsonPrimitive.content)
    }

    @Test
    fun `LOTES travels even when it is empty, because the erp reads the key`() {
        val payload = SalidaErpPayload.payload(SalidaLine("1900", 3), "2026-11-24", "wilkin")!!

        val fields = Json.parseToJsonElement(json.encodeToString(SaidaItemPayload.serializer(), payload)).jsonObject

        // Sin `@EncodeDefault` el valor por defecto se omite y el ERP responde 500 por una clave que falta.
        assertEquals("[]", fields.getValue("LOTES").toString())
    }
}
