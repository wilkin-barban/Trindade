package com.trindade.app.aero

import com.trindade.app.BuildConfig
import com.trindade.app.network.AeroAuditLogRequest

/**
 * One integration attempt, as the shared log will read it.
 *
 * The web reports what it does through the same route, and the plant's log is read over SSH by a person
 * looking at several clients at once. The prefix is the whole point of it: `Android App / ERP` is what a reader
 * recognizes at a glance, and `client=android · via=native` is the same fact in the shape a filter can be
 * written against. Both are there so neither the person nor the grep has to guess from the event name.
 *
 * The note is trimmed from the **end** when it does not fit: the prefix is the part that identifies the client,
 * and a log line that loses it is a line that cannot be attributed. It is never trimmed from the front.
 */
object AeroAudit {

    const val PREFIX = "Android App / ERP · client=android · via=native"

    /** The backend column holds 256 characters; the prefix and its separator take part of them. */
    const val NOTE_MAX = 256

    /** The backend column holds 1024 characters and refuses a longer value instead of trimming it. */
    const val ERROR_MAX = 1024

    /** The app the log line belongs to. The field is structured so the column can be filtered by it. */
    const val CLIENT = "android"

    fun note(detail: String?): String {
        val text = detail?.trim().orEmpty()
        if (text.isEmpty()) return PREFIX
        val room = NOTE_MAX - PREFIX.length - SEPARATOR.length
        val tail = if (text.length <= room) text else text.take(room)
        return "$PREFIX$SEPARATOR$tail"
    }

    /**
     * The events this app reports.
     *
     * The same names the web uses, because the log is one table and a screen filtering by event must not have
     * to know which client wrote the line.
     */
    object Event {
        const val DISPATCH = "dispatch"
        const val SYNC = "sync"
        const val TEST = "test"
        const val IMPORT = "import"
    }

    fun request(
        event: String,
        destinationUrl: String,
        phase: String? = null,
        httpStatus: Int? = null,
        durationMs: Long? = null,
        detail: String? = null,
        error: String? = null,
        attemptId: String = newAttemptId(),
    ): AeroAuditLogRequest = AeroAuditLogRequest(
        event = event,
        destinationUrl = destinationUrl,
        phase = phase,
        httpStatus = httpStatus,
        durationMs = durationMs,
        note = note(detail),
        client = CLIENT,
        attemptId = attemptId,
        error = error?.take(ERROR_MAX),
    )

    /**
     * One identifier per attempt.
     *
     * Generated here rather than at the call site so no event can leave without one: an unattributed line is a
     * line nobody can pair with its result. The server column holds 64 characters and a UUID fits in 36.
     */
    fun newAttemptId(): String = java.util.UUID.randomUUID().toString()

    /**
     * What the local log says when the audit endpoint refuses a line.
     *
     * The body carries the backend's own code (`INVALID_AERO_LOG`), and reading it is the difference between
     * "the log lost a line" and knowing which field the server would not take.
     */
    fun rejection(status: Int?, body: String?): String {
        val code = body?.let { CODE_IN_BODY.find(it)?.groupValues?.get(1) }
        return when {
            status == null -> "audit log unreachable: the event was not recorded"
            code != null -> "audit log refused: HTTP $status $code"
            else -> "audit log refused: HTTP $status"
        }
    }

    private val CODE_IN_BODY = Regex("\"code\"\\s*:\\s*\"([^\"]+)\"")

    /**
     * The line the panel's connection test leaves.
     *
     * A probe is a query to the ERP with the operator's own credentials, and it was the one query this app made
     * that the log never saw: a launch and a day's read were written down, and the answer to "can this phone
     * talk to the plant, and with which user" was only on the screen that asked. It points at the login route
     * because that is what it calls, and it carries an [outcome] rather than a sentence: this file holds no copy,
     * and the log is read by whoever is diagnosing the plant, not only by a Portuguese-speaking operator.
     *
     * There is deliberately no parameter for the password or the authorization header. The line cannot leak what
     * it was never given.
     */
    fun testRequest(
        normalizedWsUrl: String,
        elapsedMs: Long,
        httpStatus: Int?,
        outcome: String,
        detail: String? = null,
    ): AeroAuditLogRequest = request(
        event = Event.TEST,
        destinationUrl = aeroEndpoint(normalizedWsUrl, "usuarios"),
        phase = "response",
        httpStatus = httpStatus,
        durationMs = elapsedMs,
        detail = listOfNotNull(outcome, detail?.trim()?.takeIf { it.isNotEmpty() }).joinToString(SEPARATOR),
    )

    private const val SEPARATOR = " · "
}

/**
 * Why an attempt ended, in the three answers the operator can act on.
 *
 * The distinction matters more than the message: `Unreachable` is the factory network and invites a retry
 * later, `Refused` is the ERP saying no to this payload and invites a correction.
 */
sealed interface AeroDispatchOutcome {
    data object Sent : AeroDispatchOutcome
    data object Unreachable : AeroDispatchOutcome
    data class Refused(val reason: String?) : AeroDispatchOutcome
}

/** The User-Agent this app sends, so the plant's log can attribute a request to the APK that made it. */
val AERO_USER_AGENT: String get() = "Trindade-Android/${BuildConfig.APP_VERSION_NAME}"
