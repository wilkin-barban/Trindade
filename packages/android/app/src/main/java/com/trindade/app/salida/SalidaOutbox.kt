package com.trindade.app.salida

import android.content.Context
import androidx.core.content.edit

/**
 * La baja que todavía no llegó al ERP.
 *
 * La regla de la planta es primero Trindade, después el ERP: el movimiento se escribe en el servidor y desde
 * ahí viaja. Cuando el viaje no sale -- sin Wi-Fi, sin bóveda, con el ERP caído -- lo que queda es esta cola,
 * que sobrevive al cierre de la app y se reintenta tal cual: los documentos ya están armados con la fecha del
 * día en que salieron y no se rearman después, porque una baja de ayer no puede viajar con la fecha de hoy.
 */
data class SalidaOutbox(
    val movementId: Int,
    val date: String,
    val trips: List<List<SaidaItemPayload>>,
    /** Los viajes ya confirmados, para no reenviarlos cuando la cola se retoma. */
    val done: Int = 0,
) {
    val pendingTrips: List<List<SaidaItemPayload>> get() = trips.drop(done)
    val isComplete: Boolean get() = done >= trips.size
}

/**
 * Lo que el repositorio necesita de la cola.
 *
 * Una interfaz y no la clase concreta porque el reenvío se prueba con una cola en memoria: el viaje al ERP y
 * el veredicto que se escribe en Trindade son la regla que hay que sostener, no las preferencias de Android.
 */
interface SalidaOutboxPort {
    fun save(outbox: SalidaOutbox)
    fun load(): SalidaOutbox?
    fun clear()
    fun advance(outbox: SalidaOutbox): SalidaOutbox?
}

/**
 * El almacén de la cola.
 *
 * Guarda el JSON en preferencias y lo lee con la misma forma: un archivo a medio escribir no puede dejar la app
 * con una cola que no se puede interpretar, así que una lectura fallida se trata como "no hay nada pendiente" y
 * el operario puede volver a lanzar.
 */
class SalidaOutboxStore(private val context: Context) : SalidaOutboxPort {

    override fun save(outbox: SalidaOutbox) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit { putString(KEY, encode(outbox)) }
    }

    override fun load(): SalidaOutbox? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
        return decode(raw)
    }

    override fun clear() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { remove(KEY) }
    }

    /** Marca un viaje como confirmado; si ya no queda ninguno, la cola se vacía. */
    override fun advance(outbox: SalidaOutbox): SalidaOutbox? {
        val next = outbox.copy(done = outbox.done + 1)
        return if (next.isComplete) {
            clear()
            null
        } else {
            save(next)
            next
        }
    }

    companion object {
        private const val PREFS = "trindade_salida_outbox"
        private const val KEY = "pending"

        fun encode(outbox: SalidaOutbox): String = buildString {
            append("{\"movementId\":").append(outbox.movementId)
            append(",\"date\":\"").append(outbox.date).append('"')
            append(",\"done\":").append(outbox.done)
            append(",\"trips\":[")
            outbox.trips.forEachIndexed { tripIndex, trip ->
                if (tripIndex > 0) append(',')
                append('[')
                trip.forEachIndexed { index, payload ->
                    if (index > 0) append(',')
                    append('{')
                    append("\"PRO_COD\":\"").append(payload.PRO_COD).append('"')
                    append(",\"PRO_DES\":\"").append(escape(payload.PRO_DES)).append('"')
                    append(",\"PRO_QTD\":").append(payload.PRO_QTD)
                    append(",\"PED_DTA\":\"").append(payload.PED_DTA).append('"')
                    append(",\"PED_USU\":\"").append(escape(payload.PED_USU)).append('"')
                    append(",\"PED_SER\":\"").append(payload.PED_SER).append('"')
                    append(",\"PED_DTANOT\":\"").append(payload.PED_DTANOT).append('"')
                    append(",\"PED_OBS\":\"").append(escape(payload.PED_OBS)).append('"')
                    append(",\"LOTES\":[]")
                    append('}')
                }
                append(']')
            }
            append("]}")
        }

        fun decode(raw: String): SalidaOutbox? = runCatching {
            val root = miniJson(raw) as? Map<*, *> ?: return null
            val movementId = (root["movementId"] as? Number)?.toInt() ?: return null
            val date = root["date"] as? String ?: return null
            val done = (root["done"] as? Number)?.toInt() ?: 0
            val trips = (root["trips"] as? List<*>)?.map { trip ->
                (trip as? List<*>)?.mapNotNull { entry ->
                    val item = entry as? Map<*, *> ?: return@mapNotNull null
                    SaidaItemPayload(
                        PRO_COD = item["PRO_COD"] as? String ?: return@mapNotNull null,
                        PRO_DES = item["PRO_DES"] as? String ?: "",
                        PRO_QTD = (item["PRO_QTD"] as? Number)?.toInt() ?: 0,
                        PED_DTA = item["PED_DTA"] as? String ?: date,
                        PED_USU = item["PED_USU"] as? String ?: SalidaErpPayload.FALLBACK_USER,
                        PED_SER = item["PED_SER"] as? String ?: SalidaErpPayload.EXIT_SERIES,
                        PED_DTANOT = item["PED_DTANOT"] as? String ?: date,
                        PED_OBS = item["PED_OBS"] as? String ?: SalidaErpPayload.OBSERVATION,
                    )
                } ?: emptyList()
            } ?: emptyList()
            SalidaOutbox(movementId = movementId, date = date, trips = trips, done = done)
        }.getOrNull()

        private fun escape(value: String) = value.replace("\\", "\\\\").replace("\"", "\\\"")

        /**
         * Un lector mínimo de JSON para esta forma.
         *
         * La cola es un objeto con números, listas y textos; traer una librería para eso sería otra dependencia en
         * el camino crítico de una baja que no llegó. El lector se limita a lo que [encode] escribe y devuelve
         * `null` ante cualquier otra cosa, que es la respuesta segura.
         */
        private fun miniJson(raw: String): Any? = runCatching { MiniJsonParser(raw).parse() }.getOrNull()

        private class MiniJsonParser(private val text: String) {
            private var index = 0

            fun parse(): Any? {
                val value = readValue()
                skipWhitespace()
                return value
            }

            private fun readValue(): Any? {
                skipWhitespace()
                if (index >= text.length) return null
                return when (text[index]) {
                    '{' -> readObject()
                    '[' -> readArray()
                    '"' -> readString()
                    't' -> readLiteral("true", true)
                    'f' -> readLiteral("false", false)
                    'n' -> readLiteral("null", null)
                    else -> readNumber()
                }
            }

            private fun readObject(): Map<String, Any?> {
                val map = LinkedHashMap<String, Any?>()
                expect('{')
                skipWhitespace()
                if (peek() == '}') { index++; return map }
                while (true) {
                    skipWhitespace()
                    val key = readString()
                    skipWhitespace()
                    expect(':')
                    map[key] = readValue()
                    skipWhitespace()
                    when (peek()) {
                        ',' -> { index++; continue }
                        '}' -> { index++; return map }
                        else -> error("unexpected")
                    }
                }
            }

            private fun readArray(): List<Any?> {
                val list = mutableListOf<Any?>()
                expect('[')
                skipWhitespace()
                if (peek() == ']') { index++; return list }
                while (true) {
                    list.add(readValue())
                    skipWhitespace()
                    when (peek()) {
                        ',' -> { index++; continue }
                        ']' -> { index++; return list }
                        else -> error("unexpected")
                    }
                }
            }

            private fun readString(): String {
                expect('"')
                val builder = StringBuilder()
                while (index < text.length) {
                    val char = text[index++]
                    when (char) {
                        '"' -> return builder.toString()
                        '\\' -> {
                            when (val escaped = text[index++]) {
                                'n' -> builder.append('\n')
                                't' -> builder.append('\t')
                                'r' -> builder.append('\r')
                                else -> builder.append(escaped)
                            }
                        }
                        else -> builder.append(char)
                    }
                }
                error("unterminated")
            }

            private fun readNumber(): Number {
                val start = index
                while (index < text.length && (text[index].isDigit() || text[index] == '-' || text[index] == '.')) {
                    index++
                }
                val literal = text.substring(start, index)
                return literal.toLongOrNull() ?: literal.toDoubleOrNull() ?: error("unexpected")
            }

            private fun readLiteral(literal: String, value: Any?): Any? {
                if (!text.startsWith(literal, index)) error("unexpected")
                index += literal.length
                return value
            }

            private fun skipWhitespace() {
                while (index < text.length && text[index].isWhitespace()) index++
            }

            private fun peek(): Char? = text.getOrNull(index)

            private fun expect(char: Char) {
                if (peek() != char) error("expected $char")
                index++
            }
        }
    }
}
