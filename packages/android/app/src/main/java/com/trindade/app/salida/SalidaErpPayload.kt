package com.trindade.app.salida

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.Serializable

/** Una línea de la baja, como se escribe en la pantalla: código del catálogo y unidades enteras. */
data class SalidaLine(val code: String, val quantity: Int)

/** La baja armada: las líneas que salen y el total de unidades. */
data class SalidaSelection(val lines: List<SalidaLine>) {
    val totalUnits: Int = lines.sumOf { it.quantity }

    val isEmpty: Boolean = lines.isEmpty()
}

/**
 * El cuerpo certificado que el ERP recibe en `POST saidasitem`.
 *
 * Los nombres y el orden de los campos son los del contrato que la web usa desde la primera versión: el
 * WebService rechaza con 500 cualquier variación, así que esto no se "mejora".
 *
 * Lleva `@Serializable` porque Retrofit serializa el `@Body` en memoria antes de tocar la red: sin la
 * anotación el viaje muere como `SerializationException` y el log lo cuenta como `AERO_ERP_UNREACHABLE`
 * en pocos milisegundos, sin que el ERP llegue a ver el request.
 */
@Serializable
data class SaidaItemPayload(
    val PRO_COD: String,
    val PRO_DES: String,
    val PRO_QTD: Int,
    val PED_DTA: String,
    val PED_USU: String,
    val PED_SER: String,
    val PED_DTANOT: String,
    val PED_OBS: String,
    // Siempre presente: el parser del ERP lee la clave aunque venga vacía, y omitirla devuelve 500.
    @EncodeDefault val LOTES: List<String> = emptyList(),
)

object SalidaErpPayload {

    /** La serie del alta de la web: la baja siempre la lleva. */
    const val EXIT_SERIES = "APL"

    /** La observación por defecto, la misma de la web. */
    const val OBSERVATION = "Saida de massas via Trindade"

    /** El operario que el ERP no conoce cae en este código, como en la web. */
    const val FALLBACK_USER = "1"

    /** El ERP no acepta más de ocho documentos por viaje. */
    const val BATCH_MAX = 8

    /**
     * Una baja por producto, con el código a seis dígitos y la cantidad por cien.
     *
     * Un código que el catálogo no tiene se descarta: el ERP no puede lanzar algo que la planta no ofrece, y
     * mandarlo solo consigue un rechazo que se lee como si el operario hubiera hecho algo mal.
     */
    fun payload(
        line: SalidaLine,
        date: String,
        username: String?,
        observation: String = OBSERVATION,
    ): SaidaItemPayload? {
        val product = SalidaCatalog.product(line.code) ?: return null
        if (line.quantity <= 0) return null
        val user = username?.trim()?.uppercase()?.takeIf { it.isNotEmpty() } ?: FALLBACK_USER
        return SaidaItemPayload(
            PRO_COD = SalidaCatalog.erpCode(product.code),
            PRO_DES = product.name,
            PRO_QTD = SalidaCatalog.erpQuantity(line.quantity),
            PED_DTA = date,
            PED_USU = user,
            PED_SER = EXIT_SERIES,
            PED_DTANOT = date,
            PED_OBS = observation.trim().ifEmpty { OBSERVATION },
        )
    }

    /** Todos los documentos de una selección, en el orden del catálogo y sin repetir producto. */
    fun payloads(selection: SalidaSelection, date: String, username: String?): List<SaidaItemPayload> {
        val seen = mutableSetOf<String>()
        return SalidaCatalog.products
            .filter { product -> selection.lines.any { it.code == product.code } }
            .mapNotNull { product ->
                val quantity = selection.lines.firstOrNull { it.code == product.code }?.quantity ?: return@mapNotNull null
                if (!seen.add(product.code)) return@mapNotNull null
                payload(product.copy(), quantity, date, username)
            }
    }

    private fun payload(product: SalidaCatalog.Product, quantity: Int, date: String, username: String?) =
        payload(SalidaLine(product.code, quantity), date, username)

    /** Los viajes de a ocho: el ERP corta ahí y un viaje más grande vuelve con error de tamaño. */
    fun trips(payloads: List<SaidaItemPayload>): List<List<SaidaItemPayload>> = payloads.chunked(BATCH_MAX)
}
