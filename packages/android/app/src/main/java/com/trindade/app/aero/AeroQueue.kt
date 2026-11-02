package com.trindade.app.aero

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The launches that still owe the plant a seat, kept across restarts.
 *
 * A launch is written to Trindade first and sent to the ERP second, and the second half is the one that can
 * fail: the phone walked out of the plant's Wi-Fi, the WebService was restarting, the operator closed the app
 * with three rows pending. Until now that queue lived only in the screen's memory, so closing the app threw it
 * away and the rows became something nobody had to remember to resend.
 *
 * This file is the pure half of the queue: what an item is, when a stored queue is too old to fire, how many
 * travel per trip. The Android half is [AeroQueueStore], and the rules are the ones
 * `packages/frontend/src/lib/aero-queue.ts` already follows on the web, so both clients lose the same pending
 * work at the same point and neither sends yesterday's shift.
 */
@Serializable
data class AeroQueueItem(
    @SerialName("product_code") val productCode: String,
    @SerialName("product_name") val productName: String,
    /** In units, human: the ERP records what left the plant, not how it was counted. */
    val quantity: Double,
    /** The operator whose launch this is, carried to the ERP as `ENT_USU`. */
    @SerialName("operator_name") val operatorName: String? = null,
    /** The local launches behind this entry, quoted so a doubtful seat can be traced back. */
    @SerialName("launch_ids") val launchIds: List<Int> = emptyList(),
    /** The day the launch belongs to; the entry's date is read from here and never from the phone's clock. */
    val date: String,
)

/**
 * The queue as it is stored: when it was opened, and what is still waiting.
 *
 * `createdAt` is epoch milliseconds and not a formatted timestamp, because it is compared and not printed.
 */
@Serializable
data class AeroQueue(
    @SerialName("created_at") val createdAt: Long,
    /** The oldest day any item in the queue belongs to, kept for the log and for the operator's reading. */
    val date: String,
    val items: List<AeroQueueItem> = emptyList(),
) {
    val isEmpty: Boolean get() = items.isEmpty()

    /**
     * Adds an item at the end, replacing the entry for the same launches so a retry does not double it.
     *
     * An item that could not be sent is not stored either: `NaN` or a zero quantity is not a small pending
     * work, it is a payload the plant cannot reconcile, and storing it would make the next read fail for
     * everybody instead of dropping the one entry that was already broken.
     */
    fun enqueue(item: AeroQueueItem, now: Long = createdAt): AeroQueue {
        if (!isAeroQueueItem(item)) return this
        val kept = items.filterNot { existing -> existing.launchIds.any { it in item.launchIds } }
        return copy(createdAt = now, items = kept + item)
    }

    /** Removes what the plant already took. */
    fun settle(launchIds: Collection<Int>): AeroQueue =
        copy(items = items.filterNot { item -> item.launchIds.any { it in launchIds } })

    /** The next trip's items, oldest first, and what stays waiting. */
    fun takeBatch(size: Int = AERO_QUEUE_BATCH): Pair<List<AeroQueueItem>, AeroQueue> {
        val batch = items.take(size.coerceAtLeast(0))
        return batch to copy(items = items.drop(batch.size))
    }
}

/** Long enough for a shift, short enough that yesterday's leftovers never fire. */
const val AERO_QUEUE_TTL_MS: Long = 8 * 60 * 60 * 1000

/**
 * How many entries travel in one trip.
 *
 * Not a limit on the queue: a long day is several trips of this size, and a shorter batch is what keeps one
 * dead address from costing the operator the whole shift in a single wait.
 */
const val AERO_QUEUE_BATCH: Int = 8

/** The key the queue is stored under, in the app's preferences and in the web's local storage alike. */
const val AERO_QUEUE_KEY: String = "trindade.aero.queue.v1"

private val queueJson = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }

/** The stored form of the queue, or null when the caller has nothing to store yet. */
fun encodeAeroQueue(queue: AeroQueue): String = queueJson.encodeToString(AeroQueue.serializer(), queue)

/**
 * Reads a stored queue, discarding anything that is not a fresh, well-formed one.
 *
 * A half-written queue is worse than none: it would send a product with the wrong quantity, or a launch of a
 * shift nobody is standing in any more. Anything unexpected clears itself instead of being repaired, and the
 * caller treats null as "there is nothing pending", which is the truth a broken blob can offer.
 */
fun readAeroQueue(raw: String?, now: Long = System.currentTimeMillis()): AeroQueue? {
    if (raw.isNullOrBlank()) return null

    val parsed = runCatching { queueJson.decodeFromString(AeroQueue.serializer(), raw) }.getOrNull()
        ?: return null

    val age = now - parsed.createdAt
    if (age < 0 || age > AERO_QUEUE_TTL_MS) return null

    val items = parsed.items.filter(::isAeroQueueItem)
    if (items.isEmpty()) return null
    return parsed.copy(items = items)
}

/**
 * Whether one entry is worth sending.
 *
 * Strict on purpose, like the stored snapshot: a product with a made-up quantity becomes a stock entry the
 * plant cannot reconcile, and the queue is not the place to guess.
 */
private fun isAeroQueueItem(item: AeroQueueItem): Boolean {
    if (item.productCode.isBlank()) return false
    if (!item.quantity.isFinite() || item.quantity <= 0) return false
    if (item.date.isBlank()) return false
    return item.launchIds.isNotEmpty()
}
