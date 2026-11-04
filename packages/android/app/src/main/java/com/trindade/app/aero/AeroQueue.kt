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

    /**
     * The queue cut into the trips it takes to empty it: twenty entries are 8 + 8 + 4.
     *
     * [takeBatch] answers one trip, which is right for a background retry that must not hold the screen. A
     * shift's leftovers deserve the whole road in one go, and the caller still walks the trips one at a time
     * so a failure in the second leaves the third saved instead of lost.
     */
    fun drainBatches(size: Int = AERO_QUEUE_BATCH): List<List<AeroQueueItem>> {
        val step = size.coerceAtLeast(1)
        return items.chunked(step)
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

/** Why a stored queue was dropped instead of sent. */
enum class AeroQueueRejection {
    /** Older than [AERO_QUEUE_TTL_MS]: it belongs to a shift nobody is standing in. */
    EXPIRED,

    /** A blob this build cannot read, or one whose every entry was unusable. */
    MALFORMED,
}

/** The stable audit codes for both rejections, so the log can be filtered without prose. */
const val AERO_QUEUE_EXPIRED_CODE: String = "AERO_QUEUE_EXPIRED"
const val AERO_QUEUE_MALFORMED_CODE: String = "AERO_QUEUE_MALFORMED"

/**
 * What a stored queue turned out to be.
 *
 * [Rejected] is not [Empty] on purpose: a queue that was dropped carried work the plant never saw, and the
 * caller has to be able to say so in the audit trail instead of reading a silent null as "nothing pending".
 */
sealed interface AeroQueueRead {
    data class Pending(val queue: AeroQueue) : AeroQueueRead

    data object Empty : AeroQueueRead

    data class Rejected(
        val reason: AeroQueueRejection,
        /** The day the dropped queue said it belonged to, when the blob was readable enough to carry it. */
        val date: String?,
        /** The launches that will never be sent, quoted so the trail names the boxes and not just a count. */
        val items: List<AeroQueueItem>,
    ) : AeroQueueRead
}

/**
 * Reads a stored queue and says what happened to it.
 *
 * A half-written queue is worse than none: it would send a product with the wrong quantity, or a launch of a
 * shift nobody is standing in any more. Anything unexpected is dropped instead of repaired -- and reported,
 * because dropping it used to be the same silent answer as having no work at all.
 */
fun readAeroQueueResult(raw: String?, now: Long = System.currentTimeMillis()): AeroQueueRead {
    if (raw.isNullOrBlank()) return AeroQueueRead.Empty

    val parsed = runCatching { queueJson.decodeFromString(AeroQueue.serializer(), raw) }.getOrNull()
        ?: return AeroQueueRead.Rejected(AeroQueueRejection.MALFORMED, date = null, items = emptyList())

    val age = now - parsed.createdAt
    if (age < 0 || age > AERO_QUEUE_TTL_MS) {
        return AeroQueueRead.Rejected(AeroQueueRejection.EXPIRED, parsed.date, parsed.items)
    }

    val items = parsed.items.filter(::isAeroQueueItem)
    if (items.isEmpty()) {
        return AeroQueueRead.Rejected(AeroQueueRejection.MALFORMED, parsed.date, parsed.items)
    }
    return AeroQueueRead.Pending(parsed.copy(items = items))
}

/**
 * Reads a stored queue, answering only the queue that is worth sending.
 *
 * Kept for the callers that only need the pending work; a caller that must leave a trail reads
 * [readAeroQueueResult] instead, because this one cannot tell "nothing pending" from "dropped".
 */
fun readAeroQueue(raw: String?, now: Long = System.currentTimeMillis()): AeroQueue? =
    (readAeroQueueResult(raw, now) as? AeroQueueRead.Pending)?.queue

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
