package com.trindade.app.aero

import android.content.Context
import com.trindade.app.network.AeroAuditLogRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * One audit line waiting for the backend.
 *
 * The queue is per device, like the launch queue: a phone that walked out of Wi-Fi still has to be able to
 * say what it tried when it comes back. The timestamp is what lets a stale line be dropped instead of being
 * replayed against a log context nobody is looking at any more.
 */
@Serializable
data class QueuedAeroAudit(
    val request: AeroAuditLogRequest,
    val queuedAt: Long,
)

interface AeroAuditOutboxPort {
    fun enqueue(request: AeroAuditLogRequest)
    fun pending(): List<QueuedAeroAudit>
    fun remove(items: Collection<QueuedAeroAudit>)
}

/** A no-op used where a caller explicitly wants no persistence. */
object NoopAeroAuditOutbox : AeroAuditOutboxPort {
    override fun enqueue(request: AeroAuditLogRequest) = Unit
    override fun pending(): List<QueuedAeroAudit> = emptyList()
    override fun remove(items: Collection<QueuedAeroAudit>) = Unit
}

/** An in-memory outbox for the wire tests, so `log` still performs its POST without Android storage. */
class InMemoryAeroAuditOutbox : AeroAuditOutboxPort {
    private val items = mutableListOf<QueuedAeroAudit>()

    override fun enqueue(request: AeroAuditLogRequest) {
        items.removeAll { it.request.attemptId == request.attemptId && it.request.phase == request.phase }
        items += QueuedAeroAudit(request, queuedAt = System.currentTimeMillis())
    }

    override fun pending(): List<QueuedAeroAudit> = items.toList()

    override fun remove(items: Collection<QueuedAeroAudit>) {
        this.items.removeAll(items.toSet())
    }
}

/**
 * The audit lines still owed to the backend, kept across process death.
 *
 * The audit endpoint is best-effort by product rule: a lost line must never turn a launch into an error.
 * It does not have to be lossy, though. A line is written here before the POST and removed only after a
 * successful one, so the next launch, sync or screen open can retry it.
 *
 * Bounded on purpose: audit is useful, unbounded audit is a storage leak. Old lines and malformed blobs are
 * discarded, never guessed at.
 */
@Singleton
class AeroAuditOutbox @Inject constructor(
    @ApplicationContext context: Context,
) : AeroAuditOutboxPort {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    @Synchronized
    override fun enqueue(request: AeroAuditLogRequest) {
        val now = System.currentTimeMillis()
        val key = keyOf(request)
        val kept = read()
            .filter { now - it.queuedAt in 0..TTL_MS }
            .filterNot { keyOf(it.request) == key }
        write((kept + QueuedAeroAudit(request, now)).takeLast(MAX_LINES))
    }

    @Synchronized
    override fun pending(): List<QueuedAeroAudit> {
        val now = System.currentTimeMillis()
        val stored = read()
        val live = stored.filter { now - it.queuedAt in 0..TTL_MS }
        if (live.size != stored.size) write(live)
        return live
    }

    @Synchronized
    override fun remove(items: Collection<QueuedAeroAudit>) {
        if (items.isEmpty()) return
        val keys = items.map { keyOf(it.request) }.toSet()
        write(read().filterNot { keyOf(it.request) in keys })
    }

    private fun read(): List<QueuedAeroAudit> {
        val raw = prefs.getString(KEY_QUEUE, null) ?: return emptyList()
        return runCatching {
            json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(QueuedAeroAudit.serializer()), raw)
        }.getOrDefault(emptyList())
    }

    private fun write(items: List<QueuedAeroAudit>) {
        if (items.isEmpty()) {
            prefs.edit().remove(KEY_QUEUE).apply()
        } else {
            prefs.edit().putString(
                KEY_QUEUE,
                json.encodeToString(kotlinx.serialization.builtins.ListSerializer(QueuedAeroAudit.serializer()), items),
            ).apply()
        }
    }

    private fun keyOf(request: AeroAuditLogRequest): String =
        listOf(
            request.attemptId.orEmpty(),
            request.phase.orEmpty(),
            request.event,
            request.destinationUrl,
        ).joinToString("|")

    private companion object {
        const val PREFS_NAME = "trindade.aero.audit"
        const val KEY_QUEUE = "outbox"
        const val MAX_LINES = 200
        const val TTL_MS = 7L * 24 * 60 * 60 * 1000
    }
}
