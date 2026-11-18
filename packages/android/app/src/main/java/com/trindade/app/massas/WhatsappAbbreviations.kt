package com.trindade.app.massas

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.nio.charset.Charset
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
class WhatsappAbbreviationsSource @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val table: WhatsappAbbreviations by lazy {
        runCatching {
            context.assets.open(TABLE_ASSET)
                .bufferedReader()
                .use { it.readText() }
                .let(WhatsappAbbreviations::parse)
        }.getOrDefault(WhatsappAbbreviations.EMPTY)
    }

    private companion object {
        const val TABLE_ASSET = "whatsapp-abbreviations.table.json"
    }
}

/**
 * Repairs the letter the ERP sent broken, without touching what Trindade stored.
 *
 * The company's WebService does not declare a charset, and when the bridge guesses ISO-8859-2 the UTF-8 bytes of
 * `Ç` arrive as `Ă` plus a control character. Encoding each character back to its ISO-8859-2 byte and decoding
 * those bytes as UTF-8 recovers the word, and the result is only accepted when no control character is left --
 * otherwise the original text travels unchanged, which is ugly but true.
 */
fun repairErpEncoding(text: String): String {
    if (text.none { it.code in 0x7F..0x9F }) return text
    return runCatching {
        val bytes = text.toByteArray(Charset.forName("ISO-8859-2"))
        val candidate = String(bytes, Charsets.UTF_8)
        if (candidate.none { it.code in 0x7F..0x9F || it == '\uFFFD' }) candidate else text
    }.getOrDefault(text)
}
