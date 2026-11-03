package com.trindade.app.aero

import com.trindade.app.network.AeroMovementsSaved

/**
 * The two trips to the plant, in the order they have to happen.
 *
 * A launch is stored in Trindade first and only then sent to the ERP, and the day's mirror is read from the ERP
 * before being stored back. Both orders look obvious written down and neither is obvious in a view model that
 * also edits rows, deletes launches and polls. So the sequence lives here, over ports, where a test can see the
 * calls in the order they were made.
 *
 * Nothing in this file touches Android, OkHttp or the database: [AeroErpPort] and [AeroMirrorPort] are the two
 * sides, and the real implementations are the thin adapters that wrap the clients.
 */
interface AeroErpPort {
    suspend fun postEntry(settings: AeroSettings, payload: AeroEntryPayload): AeroWriteResult

    suspend fun readMovements(settings: AeroSettings, date: String): AeroMovementsResult
}

interface AeroMirrorPort {
    /** Stores the whole day's snapshot on the backend and says what the backend did with it. */
    suspend fun saveMovements(date: String, movements: List<AeroErpMovement>): AeroSnapshotSave

    /** Reports one integration event to the shared audit log. Never throws: a lost log line is not a lost launch. */
    suspend fun log(request: com.trindade.app.network.AeroAuditLogRequest)

    /** Retries the lines the device kept when the audit endpoint was unreachable. */
    suspend fun flushAudit() {}
}

/**
 * What the backend did with a day's snapshot.
 *
 * Three outcomes, because the three have three different answers: stored, refused with a reason the operator
 * can act on, or never heard. Collapsing them into `null` -- as this port used to -- made a closed day look
 * like a lost network, and the screen offered a retry that could never work.
 */
sealed interface AeroSnapshotSave {
    data class Saved(val counts: AeroMovementsSaved) : AeroSnapshotSave

    /** The backend answered no: [code] is its own name for the reason, when it sent one. */
    data class Refused(val status: Int, val code: String?) : AeroSnapshotSave

    /** Nothing came back: the request never reached the backend or its answer never arrived. */
    data object Unreachable : AeroSnapshotSave
}

/**
 * One launch on its way to the ERP.
 *
 * Carried as data rather than as the launch row, because what the ERP records is units and the row's boxes
 * are only how the operator counted them. Naming the launch id keeps `ENT_OBS` traceable.
 */
data class AeroDispatchRequest(
    val launchId: Int,
    val productCode: String,
    val productName: String,
    val units: Double,
    val date: String,
    /**
     * The operator whose launch this is, written to the ERP as `ENT_USU`.
     *
     * Null keeps the configured user's code, which is what a row recorded before the operator travelled
     * still has. The phone is one person's device and the plant is everybody's work: the seat names the
     * worker who typed the boxes.
     */
    val operatorName: String? = null,
)

/** What a day's synchronization produced. */
sealed interface AeroSyncOutcome {
    data class Synced(val saved: AeroMovementsSaved) : AeroSyncOutcome

    /** Nothing was stored, and the previous snapshot stands. The reason says whose fault that was. */
    data class Failed(val failure: AeroFailure) : AeroSyncOutcome
}

class AeroDispatcher(
    private val erp: AeroErpPort,
    private val mirror: AeroMirrorPort,
    /**
     * The question asked before every trip: is this phone even on the plant's network?
     *
     * A port and not the Android class, because the rule it enforces -- a call from another network never had
     * a chance, so say that instead of the socket's exception -- is what the tests assert. In the app it is
     * [AeroReachability], wired in `AeroModule`.
     */
    private val reachability: AeroReachabilityPort,
) {

    /**
     * Sends one stored launch to the ERP.
     *
     * The launch already exists locally: this call is the second half, and the only thing at stake is whether
     * the row ends up reconciled or pending. A failure never undoes the local record, which is why this returns
     * an outcome instead of throwing.
     */
    suspend fun dispatch(
        settings: AeroSettings,
        request: AeroDispatchRequest,
    ): AeroDispatchOutcome {
        val normalized = settings.normalizedWsUrl
        val configured = normalized != null && settings.ready
        val destination = if (configured) aeroEndpoint(normalized!!, "entradasitem") else UNCONFIGURED
        val startedAt = System.currentTimeMillis()
        val attempt = AeroAuditAttempt(
            event = AeroAudit.Event.DISPATCH,
            destinationUrl = destination,
            launchId = request.launchId,
        )
        val requestedDetail = "launch #${request.launchId}"
        mirror.log(attempt.requested(requestedDetail))

        if (!configured) {
            // Nothing is sent to the plant, and the pair says so: a launch that stayed local and a launch
            // that was refused used to read the same in the log -- both silent -- and the operator had no
            // way to tell whether the phone ever tried. The destination is marked as unconfigured instead
            // of naming an endpoint that was never called.
            mirror.log(
                attempt.result(
                    detail = "$requestedDetail · integração não configurada",
                    durationMs = System.currentTimeMillis() - startedAt,
                    error = ERROR_NOT_CONFIGURED,
                ),
            )
            return AeroDispatchOutcome.Failed(AeroFailure.notConfigured)
        }

        // The plant is on the factory LAN. A phone on mobile data, or on the guest Wi-Fi, is not going to
        // reach it, and the useful sentence is about the network -- not the exception the socket threw.
        val preflight = reachability.diagnose(normalized).failure()
        if (preflight != null) {
            mirror.log(
                attempt.result(
                    detail = "$requestedDetail · ${preflight.code.name.lowercase()}",
                    durationMs = System.currentTimeMillis() - startedAt,
                    error = preflight.code.auditCode,
                ),
            )
            return AeroDispatchOutcome.Failed(preflight)
        }

        val payload = buildEntradaItemPayload(
            productCode = request.productCode,
            productName = request.productName,
            quantity = request.units,
            entryDate = request.date,
            // The launch's operator wins over the configured user: the seat has to name who did the work.
            userCode = request.operatorName?.takeIf { it.isNotBlank() } ?: settings.userCode,
            launchIds = listOf(request.launchId),
        )
        val result = erp.postEntry(settings, payload)
        val elapsed = System.currentTimeMillis() - startedAt

        return when (result) {
            is AeroWriteResult.Ok -> {
                mirror.log(
                    attempt.result(
                        detail = requestedDetail,
                        httpStatus = 200,
                        durationMs = elapsed,
                    ),
                )
                AeroDispatchOutcome.Sent
            }

            // A refusal with no sentence is a transport failure: the ERP never answered, so nothing was
            // recorded on its side and the row can be resent later. The failure carries the transport
            // code, and the HTTP status is kept when the ERP did answer.
            is AeroWriteResult.Failed -> {
                val readFailure = result.failure
                mirror.log(
                    attempt.result(
                        detail = "$requestedDetail · ${result.message ?: "sem resposta"}",
                        httpStatus = result.httpStatus,
                        durationMs = elapsed,
                        // A code, not the ERP's sentence: the log is filtered by it, and the sentence is
                        // already in the note above, where a person reads it.
                        error = readFailure.code.auditCode,
                    ),
                )
                AeroDispatchOutcome.Failed(readFailure)
            }
        }
    }

    /**
     * Reads the plant's day and stores it on the backend.
     *
     * The snapshot is written only when the ERP answered: a failed read must leave yesterday's stored day
     * untouched, because a mirror that empties itself on a network blip reads as "the plant produced nothing".
     */
    suspend fun syncDay(settings: AeroSettings, date: String): AeroSyncOutcome {
        val normalized = settings.normalizedWsUrl
        val configured = normalized != null && settings.ready
        val destination = if (configured) aeroMovementsUrl(normalized!!) else UNCONFIGURED
        val startedAt = System.currentTimeMillis()
        val attempt = AeroAuditAttempt(
            event = AeroAudit.Event.SYNC,
            destinationUrl = destination,
        )
        val requestedDetail = "date=$date"
        mirror.log(attempt.requested(requestedDetail))

        if (!configured) {
            mirror.log(
                attempt.result(
                    detail = "$requestedDetail · integração não configurada",
                    durationMs = System.currentTimeMillis() - startedAt,
                    error = ERROR_NOT_CONFIGURED,
                ),
            )
            return AeroSyncOutcome.Failed(AeroFailure.notConfigured)
        }

        // Same gate as a dispatch: a read from the wrong network costs the operator two seconds and answers
        // nothing, so the network is asked first and the ERP is left alone.
        val preflight = reachability.diagnose(normalized).failure()
        if (preflight != null) {
            mirror.log(
                attempt.result(
                    detail = "$requestedDetail · ${preflight.code.name.lowercase()}",
                    durationMs = System.currentTimeMillis() - startedAt,
                    error = preflight.code.auditCode,
                ),
            )
            return AeroSyncOutcome.Failed(preflight)
        }

        val read = erp.readMovements(settings, date)
        val elapsed = System.currentTimeMillis() - startedAt

        return when (read) {
            is AeroMovementsResult.Ok -> {
                val save = mirror.saveMovements(date, read.movements)
                val saved = (save as? AeroSnapshotSave.Saved)?.counts
                mirror.log(
                    attempt.result(
                        httpStatus = when (save) {
                            is AeroSnapshotSave.Saved -> 200
                            is AeroSnapshotSave.Refused -> save.status
                            AeroSnapshotSave.Unreachable -> null
                        },
                        durationMs = elapsed,
                        detail = "$requestedDetail · seats=${read.movements.size} · saved=${saved?.saved ?: 0}",
                        // The ERP answered but the backend would not store the snapshot: the day is read and
                        // lost, which is a different failure from an unreachable plant.
                        error = (save as? AeroSnapshotSave.Refused)?.code
                            ?: AeroFailureCode.SNAPSHOT_REFUSED.auditCode.takeIf { save !is AeroSnapshotSave.Saved },
                    ),
                )
                when (save) {
                    is AeroSnapshotSave.Saved -> AeroSyncOutcome.Synced(save.counts)
                    // A closed day is not a transport problem: the server understood the snapshot and refused
                    // it because that date is already history. Naming it apart is what lets the queue drop the
                    // item instead of carrying it back to the next launch forever.
                    is AeroSnapshotSave.Refused -> AeroSyncOutcome.Failed(
                        AeroFailure(
                            if (save.code == AERO_CLOSED_DAY_CODE) {
                                AeroFailureCode.BACKEND_DAY_CLOSED
                            } else {
                                AeroFailureCode.SNAPSHOT_REFUSED
                            },
                            serverStatus = save.status,
                            serverCode = save.code,
                        ),
                    )
                    AeroSnapshotSave.Unreachable -> AeroSyncOutcome.Failed(AeroFailure(AeroFailureCode.SNAPSHOT_REFUSED))
                }
            }

            is AeroMovementsResult.Failed -> {
                val readFailure = read.failure
                mirror.log(
                    attempt.result(
                        httpStatus = read.httpStatus,
                        durationMs = elapsed,
                        detail = "$requestedDetail · ${read.message ?: "sem resposta"}",
                        error = readFailure.code.auditCode,
                    ),
                )
                AeroSyncOutcome.Failed(readFailure)
            }
        }
    }

    /**
     * Records a seat that became a local launch, with no ERP call to observe.
     *
     * Importing writes to Trindade and never back to the company, so there is no answer from Aero32 and no
     * duration to report. What is worth keeping is which seat was taken, in how many boxes, and whether the
     * backend kept it -- `ent_lan` is the only field that pairs this launch with the company's own record.
     */
    /**
     * Records a queued item that will never be sent, and why.
     *
     * The queue used to keep whatever did not leave, which is the right answer for a plant that is down: the
     * work waits and the next launch tries again. It is the wrong answer for a day the backend has closed --
     * retrying is refused by definition, so the item would ride along forever and re-open the same 409 on
     * every launch. Dropping it is what makes the queue finite; the line is what makes the drop visible.
     */
    suspend fun logQueueRejected(date: String, launchIds: List<Int>, code: String) {
        mirror.log(
            AeroAudit.request(
                event = AeroAudit.Event.QUEUE_REJECTED,
                destinationUrl = IMPORT_DESTINATION,
                phase = "result",
                detail = "aero_queue_rejected · date=$date · launchIds=${launchIds.joinToString(",")} · code=$code",
                error = code,
            ),
        )
    }

    /** Retries the audit outbox without waiting for another ERP call. */
    suspend fun flushAudit() = mirror.flushAudit()

    suspend fun logImport(
        date: String,
        entLan: Int,
        productCode: String,
        boxes: Int,
        error: String? = null,
    ) {
        mirror.log(
            AeroAudit.request(
                event = AeroAudit.Event.IMPORT,
                destinationUrl = IMPORT_DESTINATION,
                phase = "response",
                detail = "date=$date · ent_lan=$entLan · product=$productCode · boxes=$boxes",
                error = error,
            ),
        )
    }

    private companion object {
        /** Where an import goes when the integration was never configured: our own API, not the plant. */
        const val UNCONFIGURED = "unconfigured"

        /** The local route an imported seat is written to. */
        const val IMPORT_DESTINATION = "/api/massas-launch"

        /** Kept as the constant the earlier log lines already wrote; the model owns every other code. */
        const val ERROR_NOT_CONFIGURED = "AERO_NOT_CONFIGURED"
    }
}
