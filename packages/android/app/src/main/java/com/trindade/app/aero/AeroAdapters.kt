package com.trindade.app.aero

import android.util.Log
import com.trindade.app.network.AeroAuditLogRequest
import com.trindade.app.network.AeroMovementsSaved
import com.trindade.app.network.AeroMovementsSnapshotRequest
import com.trindade.app.network.AeroStoredMovement
import com.trindade.app.network.MassasApi
import com.trindade.app.network.runCatchingCancellable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The two ends of a dispatch, wired to the clients that actually speak.
 *
 * Thin on purpose: every decision lives in [AeroDispatcher] and every byte on the wire lives in the clients.
 * This file only exists so the sequence can be tested without Android, and so Hilt has something to build.
 */
@Singleton
class AeroErpAdapter @Inject constructor(
    private val client: AeroErpClient,
) : AeroErpPort {
    override suspend fun postEntry(settings: AeroSettings, payload: AeroEntryPayload): AeroWriteResult {
        val url = settings.normalizedWsUrl ?: return AeroWriteResult.Failed(null)
        return client.postEntry(url, settings.username, settings.password, payload)
    }

    override suspend fun readMovements(settings: AeroSettings, date: String): AeroMovementsResult {
        val url = settings.normalizedWsUrl ?: return AeroMovementsResult.Failed(null)
        return client.readMovements(url, settings.username, settings.password, date)
    }
}

/**
 * The backend's copy of the plant day, plus the shared audit log.
 *
 * Both calls are best-effort by design: a snapshot that fails to store leaves the previous one standing, and a
 * log line that fails to travel must never turn a launch into an error the operator will retry.
 */
@Singleton
class AeroMirrorAdapter @Inject constructor(
    private val api: MassasApi,
) : AeroMirrorPort {

    override suspend fun saveMovements(date: String, movements: List<AeroErpMovement>): AeroSnapshotSave {
        val body = AeroMovementsSnapshotRequest(
            date = date,
            movements = movements.map { it.toStored() },
        )
        // A refused day is an answer, not a lost request. Keeping the status and the backend's own code is
        // what lets the screen say "the plant already closed this day" instead of offering a retry forever.
        val response = runCatchingCancellable { api.saveMovements(body) }.getOrNull()
            ?: return AeroSnapshotSave.Unreachable
        if (!response.isSuccessful) {
            val code = response.errorBody()?.string()?.let(::serverCodeOf)
            return AeroSnapshotSave.Refused(response.code(), code)
        }
        val saved = response.body() ?: return AeroSnapshotSave.Unreachable
        return AeroSnapshotSave.Saved(saved)
    }

    /**
     * Appends one line and, when the backend refuses it, says so locally.
     *
     * The call was already best-effort, and it stays best-effort: a refused log line must not fail a launch
     * that reached the plant. What it must not do is vanish. The refusal is written to logcat with the status
     * and the backend's own code, so the next person to read the trail can tell a lost line from a line nobody
     * wrote, and from a line the server would not take because of one field.
     */
    override suspend fun log(request: AeroAuditLogRequest) {
        val response = runCatchingCancellable { api.logEvent(request) }.getOrNull()
        if (response == null || !response.isSuccessful) {
            Log.w(LOG_TAG, AeroAudit.rejection(response?.code(), response?.errorBody()?.string()))
        }
    }

    /**
     * The backend's `code` from an error body, without pulling a JSON parser into the adapter.
     *
     * The body is a small envelope (`error`, `code`, optional `details`), and the only field wanted here is
     * the stable upper-case code. A body that does not carry one answers null and the caller keeps the status.
     */
    private fun serverCodeOf(body: String): String? =
        SERVER_CODE.find(body)?.groupValues?.getOrNull(1)

    fun AeroErpMovement.toStored() = AeroStoredMovement(
        entLan = entLan,
        productCode = productCode,
        productDesc = productDesc,
        quantity = quantity,
        entryDate = entryDate,
        operatorName = operatorName,
        movementType = movementType,
        ownerStatus = ownerStatus,
    )

    private companion object {
        const val LOG_TAG = "AeroAudit"
        val SERVER_CODE = Regex("\"code\"\\s*:\\s*\"([A-Z0-9_]+)\"")
    }
}

/**
 * The stored snapshot read back as the domain's day.
 *
 * The backend keeps the ERP's own column names; the screen reasons in the names the web already uses. The
 * mapping lives here so neither side has to know the other's spelling.
 */
fun AeroStoredMovement.toLogic(): AeroErpMovement = AeroErpMovement(
    entLan = entLan,
    productCode = productCode,
    productDesc = productDesc,
    quantity = quantity,
    entryDate = entryDate,
    operatorName = operatorName,
    movementType = movementType,
    ownerUserId = ownerUserId,
    ownerStatus = ownerStatus,
)
