package com.trindade.app.aero

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The pending queue at rest on the device.
 *
 * A port for the same reason the settings have one: the view model's decisions are testable in a JVM, and the
 * only thing that needs a `Context` is [AeroQueueStore].
 *
 * Nothing here is encrypted, and that is deliberate. The queue holds product codes, quantities and launch ids
 * -- what the plant will read on the seat -- and no credential, no address and no operator password. Encrypting
 * it would buy nothing an attacker with access to the app's private storage could not also read from the day
 * the queue belongs to.
 */
interface AeroQueuePort {
    /** The fresh, well-formed queue, or null when there is nothing to send. */
    fun read(now: Long = System.currentTimeMillis()): AeroQueue?

    /**
     * The same read, saying whether the queue was dropped and why.
     *
     * Defaults to [read] for the fakes and for any port that only stores a live queue; the device store
     * overrides it because it is the one that deletes the blob.
     */
    fun readResult(now: Long = System.currentTimeMillis()): AeroQueueRead =
        read(now)?.let { AeroQueueRead.Pending(it) } ?: AeroQueueRead.Empty

    fun write(queue: AeroQueue)

    fun clear()
}

@Singleton
class AeroQueueStore @Inject constructor(
    @ApplicationContext context: Context,
) : AeroQueuePort {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /**
     * The queue, or null.
     *
     * A blob this build cannot read is removed instead of kept: it will never become readable, and leaving it
     * there would make every future read pay for the same failure.
     */
    override fun read(now: Long): AeroQueue? =
        (readResult(now) as? AeroQueueRead.Pending)?.queue

    /**
     * The queue, or what was dropped instead of it.
     *
     * A blob this build cannot read is removed here, once, and the answer says what it carried so the view
     * model can write the rejection down: deleting it in silence was the same answer as having nothing to send.
     */
    override fun readResult(now: Long): AeroQueueRead {
        val raw = prefs.getString(AERO_QUEUE_KEY, null) ?: return AeroQueueRead.Empty
        val result = readAeroQueueResult(raw, now)
        if (result !is AeroQueueRead.Pending) prefs.edit().remove(AERO_QUEUE_KEY).apply()
        return result
    }

    override fun write(queue: AeroQueue) {
        // An empty queue is not written: a stored envelope with nothing in it would be read back as work.
        if (queue.isEmpty) {
            clear()
            return
        }
        prefs.edit().putString(AERO_QUEUE_KEY, encodeAeroQueue(queue)).apply()
    }

    override fun clear() {
        prefs.edit().remove(AERO_QUEUE_KEY).apply()
    }

    private companion object {
        /** The same file the settings live in; one preference set for one integration. */
        const val PREFS_NAME = "trindade.aero"
    }
}
