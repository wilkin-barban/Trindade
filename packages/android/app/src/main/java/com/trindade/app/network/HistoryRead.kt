package com.trindade.app.network

import kotlinx.coroutines.CancellationException
import retrofit2.Response

/**
 * The answer to a history read, with the two ways it can fail kept apart.
 *
 * Both of them used to arrive as `null`, and the screens had one sentence for the pair: "Sem conexão
 * com o servidor. Verifique a rede e tente de novo." That sentence is true of a phone without signal
 * and false of a session that expired, a caller whose role may not read this route, or a server that
 * answered 500 -- and it sends the operator to fix a network that is working. `null` could not carry
 * the difference, so the read does not use it any more.
 *
 * A refusal is not a failure to reach the server: it is the server answering, in the vocabulary the
 * lifecycle calls already use for their own refusals ([com.trindade.app.loading.ScheduleLifecycleResult]).
 */
sealed interface HistoryRead<out T> {
    /** The server answered with the payload. An empty list is a fact about the history, not an error. */
    data class Loaded<T>(val value: T) : HistoryRead<T>

    /**
     * The server answered and said no, with the status it framed the answer with.
     *
     * 401 is a session that is gone, 403 a caller the route does not accept, 404 a resource that no
     * longer exists, 500 and up a server that could not finish. Only the screen knows which sentence
     * each deserves; what this type guarantees is that none of them is reported as a network fault.
     */
    data class Refused(val statusCode: Int) : HistoryRead<Nothing>

    /** No answer at all: no connection, a timeout, a DNS failure, a socket cut mid-request. */
    data object Unreachable : HistoryRead<Nothing>
}

/**
 * Runs one history call and classifies its outcome.
 *
 * The body is only read on a successful answer, so a refusal never decodes a payload it does not have;
 * a 2xx with an unreadable body is an unreachable-shaped failure of the server's contract, and it is
 * reported as [HistoryRead.Unreachable] rather than as a refusal the caller could act on.
 *
 * Cancellation is rethrown: a read superseded by a newer one has to stay cancelled, or the view model's
 * "drop the whole superseded answer" rule would see a fake refusal written over a live screen.
 */
suspend fun <T> readHistory(call: suspend () -> Response<T>): HistoryRead<T> {
    val response = try {
        call()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Throwable) {
        return HistoryRead.Unreachable
    }

    if (!response.isSuccessful) return HistoryRead.Refused(response.code())
    val body = response.body() ?: return HistoryRead.Unreachable
    return HistoryRead.Loaded(body)
}
