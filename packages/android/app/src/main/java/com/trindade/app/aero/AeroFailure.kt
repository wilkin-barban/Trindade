package com.trindade.app.aero

import com.trindade.app.R
import com.trindade.app.ui.UiText

/**
 * Why a conversation with the plant did not produce what it was asked for, in one vocabulary.
 *
 * The app talks to the ERP from four different places -- the admin probe, the launch, the day's sync and the
 * report's sync -- and each of them used to invent its own words for the same event. An operator who read
 * "Sem conexão com a rede da fábrica" on the table and "Wi-Fi desconectado." in the admin panel was being told
 * two different things about one phone on one network, and the ESP/PT pair drifted further apart with every
 * screen that added a sentence.
 *
 * So a failure is data first: a code the code can branch on, and the ERP's own sentence only when the ERP sent
 * one. [describe] is the single place a code turns into words, and the only place that knows a resource id.
 *
 * The codes are the answers an operator can act on, not HTTP statuses:
 *
 * - [AeroFailureCode.DIFFERENT_NETWORK] is the phone in the wrong place, and the fix is walking to the plant's
 *   Wi-Fi. It exists because the ERP is on the factory LAN: a request from mobile data never had a chance, and
 *   reporting the socket's exception for it hides the only thing worth saying.
 * - [AeroFailureCode.HOST_UNREACHABLE] is the right network with nothing listening: the address is wrong or the
 *   WebService is down.
 * - [AeroFailureCode.ERP_REFUSED] is the plant answering no to this payload, and the fix is correcting the row.
 * - [AeroFailureCode.NO_ANSWER] is a transport failure with no sentence: nothing was recorded on the ERP side.
 */
enum class AeroFailureCode {
    /** The integration has no address or credentials on this device yet. */
    NOT_CONFIGURED,

    /** There is no Wi-Fi, or it is not the factory's. */
    DIFFERENT_NETWORK,

    /** Wi-Fi, but the ERP host did not accept a connection. */
    HOST_UNREACHABLE,

    /** The host accepted and never answered within the client's budget. */
    TIMEOUT,

    /** The address does not resolve, or there is no route to it. */
    NO_ROUTE,

    /** The host answered by refusing the connection. */
    REFUSED_CONNECTION,

    /** The request produced no answer the client could read, and the ERP never said anything. */
    NO_ANSWER,

    /** The ERP answered and refused; [AeroFailure.detail] carries its own sentence when it sent one. */
    ERP_REFUSED,

    /** The ERP answered, but the backend would not store what was read. */
    SNAPSHOT_REFUSED,
}

/**
 * One failure: what happened, and whatever the plant said about it.
 *
 * [detail] is never translated here. It is the ERP's sentence, kept verbatim because it names the field that
 * was rejected, and replacing it with a generic line would throw away the only explanation the operator has.
 */
data class AeroFailure(
    val code: AeroFailureCode,
    val detail: String? = null,
) {
    /** The one sentence this failure earns, in the operator's language. */
    fun describe(): UiText = when (code) {
        AeroFailureCode.NOT_CONFIGURED -> UiText.of(R.string.aero_failure_not_configured)
        AeroFailureCode.DIFFERENT_NETWORK -> UiText.of(R.string.aero_failure_different_network)
        AeroFailureCode.HOST_UNREACHABLE -> UiText.of(R.string.aero_failure_host_unreachable)
        AeroFailureCode.TIMEOUT -> UiText.of(R.string.aero_failure_timeout)
        AeroFailureCode.NO_ROUTE -> UiText.of(R.string.aero_failure_no_route)
        AeroFailureCode.REFUSED_CONNECTION -> UiText.of(R.string.aero_failure_refused_connection)
        AeroFailureCode.NO_ANSWER -> UiText.of(R.string.aero_failure_no_answer)
        AeroFailureCode.SNAPSHOT_REFUSED -> UiText.of(R.string.aero_failure_snapshot_refused)
        // The plant's own sentence is the whole message; without one, the generic refusal is all that is left.
        AeroFailureCode.ERP_REFUSED -> detail?.trim()?.takeIf { it.isNotEmpty() }
            ?.let { UiText.of(R.string.aero_failure_erp_refused, it) }
            ?: UiText.of(R.string.aero_failure_no_answer)
    }

    /** Whether retrying later could work, as opposed to correcting the row first. */
    val retryable: Boolean
        get() = when (code) {
            AeroFailureCode.DIFFERENT_NETWORK,
            AeroFailureCode.HOST_UNREACHABLE,
            AeroFailureCode.TIMEOUT,
            AeroFailureCode.NO_ROUTE,
            AeroFailureCode.REFUSED_CONNECTION,
            AeroFailureCode.NO_ANSWER,
            AeroFailureCode.SNAPSHOT_REFUSED,
            -> true
            AeroFailureCode.NOT_CONFIGURED,
            AeroFailureCode.ERP_REFUSED,
            -> false
        }

    companion object {
        /** The one failure a settings state produces, wherever it is noticed. */
        val notConfigured: AeroFailure = AeroFailure(AeroFailureCode.NOT_CONFIGURED)
    }
}

/**
 * The stable code the audit log is filtered by.
 *
 * Not the sentence: the log is read by whoever diagnoses the plant, in whatever language, and a filter over
 * translated copy stops working the day a translator improves it. These strings are written down once and read
 * from there -- `AERO_ERP_UNREACHABLE` and `AERO_ERP_REFUSED` are the two the log already carried.
 */
val AeroFailureCode.auditCode: String
    get() = when (this) {
        AeroFailureCode.NOT_CONFIGURED -> "AERO_NOT_CONFIGURED"
        AeroFailureCode.DIFFERENT_NETWORK -> "AERO_NO_PLANT_WIFI"
        AeroFailureCode.HOST_UNREACHABLE -> "AERO_ERP_UNREACHABLE"
        AeroFailureCode.TIMEOUT -> "AERO_ERP_TIMEOUT"
        AeroFailureCode.NO_ROUTE -> "AERO_ERP_NO_ROUTE"
        AeroFailureCode.REFUSED_CONNECTION -> "AERO_ERP_CONNECTION_REFUSED"
        AeroFailureCode.NO_ANSWER -> "AERO_ERP_UNREACHABLE"
        AeroFailureCode.ERP_REFUSED -> "AERO_ERP_REFUSED"
        AeroFailureCode.SNAPSHOT_REFUSED -> "AERO_SNAPSHOT_REFUSED"
    }

/**
 * What the phone's network looks like from here, as data.
 *
 * Pure on purpose: the probe needs a `Context` and this does not, so the rule "no factory Wi-Fi means the call
 * never had a chance" is testable in a JVM unit test with no emulator.
 */
data class AeroDiagnosis(
    val wifiConnected: Boolean,
    /** Null when the address is unusable, which is a configuration problem and not a network one. */
    val hostReachable: Boolean?,
) {
    /** Reachable only when both halves hold; an unusable address is never reachable. */
    val plantReachable: Boolean get() = wifiConnected && hostReachable == true

    /** The failure this diagnosis explains, or null when the plant can be talked to. */
    fun failure(): AeroFailure? = when {
        !wifiConnected -> AeroFailure(AeroFailureCode.DIFFERENT_NETWORK)
        hostReachable == false -> AeroFailure(AeroFailureCode.HOST_UNREACHABLE)
        else -> null
    }

    companion object {
        /** What a caller with no probe available assumes: nothing known, nothing claimed. */
        val unknown: AeroDiagnosis = AeroDiagnosis(wifiConnected = true, hostReachable = null)
    }
}

/**
 * A failed write or read, read into the shared vocabulary.
 *
 * The ERP's sentence, when it sent one, is a refusal of this payload; without one the request never got an
 * answer, and that is a different thing to tell the operator.
 */
val AeroWriteResult.Failed.failure: AeroFailure
    get() = AeroFailure(
        if (message == null) AeroFailureCode.NO_ANSWER else AeroFailureCode.ERP_REFUSED,
        message,
    )

val AeroMovementsResult.Failed.failure: AeroFailure
    get() = AeroFailure(
        if (message == null) AeroFailureCode.NO_ANSWER else AeroFailureCode.ERP_REFUSED,
        message,
    )

/** The failure a probe's transport error explains, in the shared vocabulary. */
fun AeroErpClient.ProbeFailure.toFailure(): AeroFailure = AeroFailure(
    when (this) {
        AeroErpClient.ProbeFailure.TIMEOUT -> AeroFailureCode.TIMEOUT
        AeroErpClient.ProbeFailure.NO_ROUTE -> AeroFailureCode.NO_ROUTE
        AeroErpClient.ProbeFailure.REFUSED -> AeroFailureCode.REFUSED_CONNECTION
        AeroErpClient.ProbeFailure.UNKNOWN -> AeroFailureCode.NO_ANSWER
    },
)
