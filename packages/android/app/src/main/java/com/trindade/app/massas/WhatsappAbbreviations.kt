package com.trindade.app.massas

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.nio.ByteBuffer
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The longest name the group reads, in the report's own words.
 *
 * A name longer than this gets truncated by the group preview and reads as a different product, which is the
 * whole reason the table exists; keeping the cap next to the table keeps the two excuses from diverging.
 */
const val WHATSAPP_NAME_MAX = 20

/**
 * The approved WhatsApp table, loaded from the same JSON the backend and the browser ship.
 *
 * The three sections answer three different questions and the order matters: the name the plant typed into the
 * seat is the most specific thing we know about a product, so it is asked first; the catalogue by code is the
 * fallback because a code is always present and never ambiguous; and a name that neither section knows is
 * repaired and shortened rather than sent whole.
 */
class WhatsappAbbreviations private constructor(
    private val catalogueByCode: Map<String, String>,
    private val catalogueByName: Map<String, String>,
    private val erpByName: Map<String, String>,
) {

    /** Sin tabla no hay abreviaturas: el llamador conserva el nombre que trajo el servidor. */
    val isEmpty: Boolean
        get() = catalogueByCode.isEmpty() && catalogueByName.isEmpty() && erpByName.isEmpty()

    /** The approved short name for a line, never longer than [WHATSAPP_NAME_MAX]. */
    fun shortName(code: String, name: String): String {
        val repaired = repairErpEncoding(name).trim()
        val byName = repaired.takeIf { it.isNotEmpty() }?.uppercase(Locale.ROOT)
        val approved = byName?.let { catalogueByName[it] ?: erpByName[it] }
            ?: catalogueByCode[code.trim()]
        val base = approved ?: stripMassasPrefix(repaired).ifBlank { repaired }
        return base.take(WHATSAPP_NAME_MAX).trim()
    }

    companion object {

        /**
         * No table at all: the builder still produces a readable message.
         *
         * It is what a caller without a Context gets, and what a unit test that only cares about the shape uses.
         * The names come out stripped of the `MASSA` prefix instead of abbreviated, which is a longer line but
         * never a wrong product.
         */
        val EMPTY: WhatsappAbbreviations = WhatsappAbbreviations(emptyMap(), emptyMap(), emptyMap())

        /** Reads the table the app ships in its assets, or the file the tests point at. */
        fun parse(json: String): WhatsappAbbreviations {
            val root = runCatching { Json.parseToJsonElement(json).jsonObject }.getOrNull()
                ?: return EMPTY

            fun section(key: String): Map<String, String> =
                (root[key] as? JsonObject)
                    ?.mapValues { (_, value) -> runCatching { value.jsonPrimitive.content }.getOrDefault("") }
                    ?.filterValues { it.isNotBlank() }
                    ?: emptyMap()

            return WhatsappAbbreviations(
                catalogueByCode = section("catalogueByCode"),
                catalogueByName = section("catalogueByName"),
                erpByName = section("erpByName"),
            )
        }
    }
}

/**
 * The table as the app can actually reach it: the asset bundled with the APK.
 *
 * Loaded once and kept: the file is a few kilobytes and never changes at runtime, and the Massas screen asks for
 * a message on every keystroke of the phone field.
 */
@Singleton
open class WhatsappAbbreviationsSource @Inject constructor(
    @ApplicationContext private val context: Context?,
) {
    open val table: WhatsappAbbreviations by lazy {
        // Sin contexto no hay asset que leer: es el caso de una prueba, y la tabla vacía deja los mensajes con
        // el nombre que trajo el servidor.
        val assets = context?.assets ?: return@lazy WhatsappAbbreviations.EMPTY
        runCatching {
            assets.open(TABLE_ASSET)
                .bufferedReader()
                .use { it.readText() }
                .let(WhatsappAbbreviations::parse)
        }.getOrDefault(WhatsappAbbreviations.EMPTY)
    }

    private companion object {
        const val TABLE_ASSET = "whatsapp-abbreviations.table.json"
    }
}

private fun buildSingleByteTable(charsetName: String, includeC1: Boolean): Map<Char, Byte> {
    val decoder = Charset.forName(charsetName).newDecoder()
        .onMalformedInput(CodingErrorAction.REPLACE)
        .onUnmappableCharacter(CodingErrorAction.REPLACE)
    val map = HashMap<Char, Byte>(256)
    for (b in 0..255) {
        val decoded = decoder.decode(ByteBuffer.wrap(byteArrayOf(b.toByte())))
        if (decoded.hasRemaining()) {
            val ch = decoded.get()
            if (ch != '\uFFFD') map.putIfAbsent(ch, b.toByte())
        }
        decoder.reset()
    }
    if (includeC1) {
        for (b in 0x80..0x9F) {
            map.putIfAbsent(b.toChar(), b.toByte())
        }
    }
    return map
}

private val ISO_8859_2_BYTES: Map<Char, Byte> by lazy { buildSingleByteTable("ISO-8859-2", includeC1 = false) }
private val WIN_1252_AND_LATIN1_BYTES: Map<Char, Byte> by lazy { buildSingleByteTable("windows-1252", includeC1 = true) }

private fun tryDecodeWithTable(text: String, table: Map<Char, Byte>): String? {
    val bytes = ByteArray(text.length)
    for (index in text.indices) {
        val b = table[text[index]] ?: return null
        bytes[index] = b
    }
    val decoder = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
    val candidate = runCatching { decoder.decode(ByteBuffer.wrap(bytes)).toString() }.getOrNull() ?: return null
    return if (candidate.none { it.code in 0x7F..0x9F || it == '\uFFFD' }) candidate else null
}

private fun repairLoneTilde(text: String): String =
    if ('Ă' in text) text.replace('Ă', 'Ã') else text

private fun hasSuspiciousLatin1Pair(text: String): Boolean {
    for (i in 0 until text.length - 1) {
        val first = text[i]
        if ((first == 'Ã' || first == 'Â') && text[i + 1].code > 0x7F) return true
    }
    return false
}

/**
 * Repairs the letter the ERP sent broken, without touching what Trindade stored.
 *
 * Covers ISO-8859-2 C1 controls (`AĂ\u0087UCAR` -> `AÇUCAR`), Windows-1252 / ISO-8859-1 mojibake
 * (`AÃ\u0087UCAR` / `AÃ‡UCAR` -> `AÇUCAR`), and lone-byte `Ă` (`PĂO` -> `PÃO`).
 */
fun repairErpEncoding(text: String): String {
    val hasControl = text.any { it.code in 0x7F..0x9F }
    val hasSuspicious = hasSuspiciousLatin1Pair(text)
    if (hasControl || hasSuspicious) {
        val fromIso2 = if (hasControl) tryDecodeWithTable(text, ISO_8859_2_BYTES) else null
        if (fromIso2 != null) return repairLoneTilde(fromIso2)
        val fromLatin1 = tryDecodeWithTable(text, WIN_1252_AND_LATIN1_BYTES)
        if (fromLatin1 != null && fromLatin1 != text) return repairLoneTilde(fromLatin1)
    }
    return repairLoneTilde(text)
}
