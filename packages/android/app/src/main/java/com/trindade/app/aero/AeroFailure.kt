package com.trindade.app.aero

import com.trindade.app.R
import com.trindade.app.ui.UiText
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.net.UnknownServiceException

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
/**
 * The backend's stable code for a write to a date that is already history.
 *
 * One spelling for both readers: the sync maps it to [AeroFailureCode.BACKEND_DAY_CLOSED] and the queue drops
 * what carries it. A literal in each place is how a rename in the backend becomes two silent mismatches.
 */
const val AERO_CLOSED_DAY_CODE = "MASSAS_HISTORY_FROZEN"

enum class AeroFailureCode {
    /** The integration has no address or credentials on this device yet. */
    NOT_CONFIGURED,

    /** There is no Wi-Fi, or it is not the factory's. */
    DIFFERENT_NETWORK,

    /** Wi-Fi, but the ERP host did not accept a connection. */
    HOST_UNREACHABLE,

    /** The address is HTTP and this APK's network security config does not allow cleartext to it. */
    CLEARTEXT_BLOCKED,

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

    /**
     * The backend could not be reached to store what the ERP answered.
     *
     * The read happened and the plant said yes; what failed is Trindade's own server. Reporting it as
     * [SNAPSHOT_REFUSED] sent the operator to look at the plant or at the day, when the only thing to fix is
     * the connection between the phone and the server -- and the log lost the difference too.
     */
    SNAPSHOT_BACKEND_UNREACHABLE,

    /**
     * The backend closed the day the phone tried to write.
     *
     * It is the mirror image of [SNAPSHOT_REFUSED]: there the server could not keep the read, here it refuses
     * on purpose because the day is history. Retrying cannot work until someone reopens the day, so the item
     * that produced it is dropped instead of being carried back to the next launch.
     */
    BACKEND_DAY_CLOSED,
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
    /** The HTTP status the backend answered with, when a refusal came from Trindade rather than the plant. */
    val serverStatus: Int? = null,
    /** The backend's own stable code for the refusal, so screens branch on it instead of on prose. */
    val serverCode: String? = null,
) {
    /** The one sentence this failure earns, in the operator's language. */
    fun describe(): UiText = when (code) {
        AeroFailureCode.NOT_CONFIGURED -> UiText.of(R.string.aero_failure_not_configured)
        AeroFailureCode.DIFFERENT_NETWORK -> UiText.of(R.string.aero_failure_different_network)
        AeroFailureCode.HOST_UNREACHABLE -> UiText.of(R.string.aero_failure_host_unreachable)
        AeroFailureCode.CLEARTEXT_BLOCKED -> UiText.of(R.string.aero_failure_cleartext_blocked)
        AeroFailureCode.TIMEOUT -> UiText.of(R.string.aero_failure_timeout)
        AeroFailureCode.NO_ROUTE -> UiText.of(R.string.aero_failure_no_route)
        AeroFailureCode.REFUSED_CONNECTION -> UiText.of(R.string.aero_failure_refused_connection)
        AeroFailureCode.NO_ANSWER -> UiText.of(R.string.aero_failure_no_answer)
        AeroFailureCode.SNAPSHOT_REFUSED -> UiText.of(R.string.aero_failure_snapshot_refused)
        AeroFailureCode.SNAPSHOT_BACKEND_UNREACHABLE -> UiText.of(R.string.aero_failure_snapshot_backend_unreachable)
        AeroFailureCode.BACKEND_DAY_CLOSED -> UiText.of(R.string.aero_failure_day_closed)
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
            AeroFailureCode.SNAPSHOT_BACKEND_UNREACHABLE,
            -> true
            AeroFailureCode.NOT_CONFIGURED,
            AeroFailureCode.CLEARTEXT_BLOCKED,
            AeroFailureCode.ERP_REFUSED,
            // The day is closed until a person reopens it: the same press would be refused again.
            AeroFailureCode.BACKEND_DAY_CLOSED,
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
        AeroFailureCode.CLEARTEXT_BLOCKED -> "AERO_CLEARTEXT_BLOCKED"
        AeroFailureCode.TIMEOUT -> "AERO_ERP_TIMEOUT"
        AeroFailureCode.NO_ROUTE -> "AERO_ERP_NO_ROUTE"
        AeroFailureCode.REFUSED_CONNECTION -> "AERO_ERP_CONNECTION_REFUSED"
        AeroFailureCode.NO_ANSWER -> "AERO_ERP_UNREACHABLE"
        AeroFailureCode.ERP_REFUSED -> "AERO_ERP_REFUSED"
        AeroFailureCode.SNAPSHOT_REFUSED -> "AERO_SNAPSHOT_REFUSED"
        AeroFailureCode.SNAPSHOT_BACKEND_UNREACHABLE -> "AERO_SNAPSHOT_BACKEND_UNREACHABLE"
        AeroFailureCode.BACKEND_DAY_CLOSED -> "AERO_BACKEND_DAY_CLOSED"
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
        code ?: if (message == null) AeroFailureCode.NO_ANSWER else AeroFailureCode.ERP_REFUSED,
        message,
        serverStatus = httpStatus,
    )

val AeroMovementsResult.Failed.failure: AeroFailure
    get() = AeroFailure(
        code ?: if (message == null) AeroFailureCode.NO_ANSWER else AeroFailureCode.ERP_REFUSED,
        message,
        serverStatus = httpStatus,
    )

/**
 * The transport code a launch or a day's read failed with.
 *
 * The two calls share this mapper instead of collapsing every exception into `NO_ANSWER`: a timeout, a
 * bad route and a cleartext policy refusal are different answers, both for the operator and for the log.
 */
fun Throwable.toAeroFailureCode(): AeroFailureCode = when (this) {
    is SocketTimeoutException -> AeroFailureCode.TIMEOUT
    is UnknownHostException, is NoRouteToHostException -> AeroFailureCode.NO_ROUTE
    is ConnectException -> AeroFailureCode.REFUSED_CONNECTION
    is UnknownServiceException ->
        if (message?.contains("CLEARTEXT", ignoreCase = true) == true) {
            AeroFailureCode.CLEARTEXT_BLOCKED
        } else {
            AeroFailureCode.NO_ANSWER
        }
    else -> AeroFailureCode.NO_ANSWER
}

/** The failure a probe's transport error explains, in the shared vocabulary. */
fun AeroErpClient.ProbeFailure.toFailure(): AeroFailure = AeroFailure(
    when (this) {
        AeroErpClient.ProbeFailure.TIMEOUT -> AeroFailureCode.TIMEOUT
        AeroErpClient.ProbeFailure.NO_ROUTE -> AeroFailureCode.NO_ROUTE
        AeroErpClient.ProbeFailure.REFUSED -> AeroFailureCode.REFUSED_CONNECTION
        AeroErpClient.ProbeFailure.CLEARTEXT -> AeroFailureCode.CLEARTEXT_BLOCKED
        AeroErpClient.ProbeFailure.UNKNOWN -> AeroFailureCode.NO_ANSWER
    },
)
