package com.trindade.app.aero

import com.trindade.app.network.AeroAuditLogRequest
import kotlinx.serialization.json.JsonPrimitive
import com.trindade.app.network.AeroMovementsSaved
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The order of the two trips to the plant.
 *
 * What is asserted here is not that a call happened but that it happened in this position: a dispatch that
 * reaches the ERP before the launch exists locally would leave a seat the app cannot reconcile, and a mirror
 * that stores an empty day after a failed read would make the plant look idle. The fakes record every call in
 * one list so the sequence is readable in the failure message.
 */
class AeroDispatcherTest {

    private val settings = AeroSettings(
        wsUrl = "http://192.168.25.250:1453/api",
        username = "wilkin",
        password = "s3cr3t",
        userCode = "7",
    )

    private val request = AeroDispatchRequest(
        launchId = 42,
        productCode = "1192",
        productName = "MASSA DE PASTEL 500G",
        units = 15.0,
        date = "2026-10-30",
    )

    private class Recorder {
        val calls = mutableListOf<String>()
        val logs = mutableListOf<AeroAuditLogRequest>()
        /** Every payload the app would have written, so `ENT_USU` can be read where the ERP reads it. */
        val payloads = mutableListOf<AeroEntryPayload>()
    }

    private class FakeErp(
        private val recorder: Recorder,
        private val entry: AeroWriteResult,
        private val movements: AeroMovementsResult,
    ) : AeroErpPort {
        override suspend fun postEntry(settings: AeroSettings, payload: AeroEntryPayload): AeroWriteResult {
            recorder.calls += "erp:entry:${payload.productCode}:${payload.quantity}:${payload.observation}"
            recorder.payloads += payload
            return entry
        }

        override suspend fun readMovements(settings: AeroSettings, date: String): AeroMovementsResult {
            recorder.calls += "erp:movements:$date"
            return movements
        }
    }

    private class FakeMirror(
        private val recorder: Recorder,
        private val saved: AeroMovementsSaved?,
        private val refusal: AeroSnapshotSave.Refused? = null,
    ) : AeroMirrorPort {
        override suspend fun saveMovements(date: String, movements: List<AeroErpMovement>): AeroSnapshotSave {
            recorder.calls += "mirror:save:$date:${movements.size}"
            refusal?.let { return it }
            return saved?.let { AeroSnapshotSave.Saved(it) } ?: AeroSnapshotSave.Unreachable
        }

        override suspend fun log(request: AeroAuditLogRequest) {
            recorder.calls += "mirror:log:${request.event}:${request.phase}"
            recorder.logs += request
        }
    }

    private fun dispatcher(
        recorder: Recorder,
        entry: AeroWriteResult = AeroWriteResult.Ok(null),
        movements: AeroMovementsResult = AeroMovementsResult.Ok(emptyList(), skipped = 0),
        saved: AeroMovementsSaved? = AeroMovementsSaved(saved = 0, massas = 0, insumos = 0),
        refusal: AeroSnapshotSave.Refused? = null,
        reachability: AeroDiagnosis = AeroDiagnosis(wifiConnected = true, hostReachable = true),
    ) = AeroDispatcher(
        erp = FakeErp(recorder, entry, movements),
        mirror = FakeMirror(recorder, saved, refusal),
        reachability = object : AeroReachabilityPort {
            override suspend fun diagnose(wsUrl: String?, timeoutMillis: Int) = reachability
        },
    )

    /**
     * The phone off the plant's Wi-Fi is told so, and the ERP is never called.
     *
     * The failure this covers is the ordinary one: an operator on mobile data taps "enviar ao ERP" and gets an
     * error from a request that never had a chance. Saying "no se pudo hablar con el ERP" sends them to check
     * the address; the truth is that they are on the wrong network, and the fix is a different one.
     */
    @Test
    fun `a phone off the plant's Wi-Fi is reported as a network problem and nothing is sent`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(recorder, reachability = AeroDiagnosis(wifiConnected = false, hostReachable = null))
            .dispatch(settings, request)

        assertEquals(
            AeroDispatchOutcome.Failed(AeroFailure(AeroFailureCode.DIFFERENT_NETWORK)),
            outcome,
        )
        assertTrue("no salió ningún asiento", recorder.payloads.isEmpty())
        assertFalse("la llamada al ERP no se hizo", recorder.calls.any { it.startsWith("erp:") })
        assertTrue("la línea del registro existe", recorder.logs.any { it.error == "AERO_NO_PLANT_WIFI" })
    }

    @Test
    fun `a day's read on the wrong network is not stored over the previous one`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(recorder, reachability = AeroDiagnosis(wifiConnected = true, hostReachable = false))
            .syncDay(settings, "2026-10-30")

        assertEquals(
            AeroSyncOutcome.Failed(AeroFailure(AeroFailureCode.HOST_UNREACHABLE)),
            outcome,
        )
        assertTrue("el snapshot anterior sigue en pie", recorder.calls.none { it.startsWith("mirror:save") })
    }

    @Test
    fun `a dispatch sends the units with the launch named in the observation`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(recorder).dispatch(settings, request)

        assertEquals(AeroDispatchOutcome.Sent, outcome)
        assertTrue(recorder.calls.contains("erp:entry:001192:1500:Trindade #42"))
        assertEquals(
            listOf("mirror:log:launch_sync:requested", "mirror:log:launch_sync:result"),
            recorder.calls.filter { it.startsWith("mirror:log") },
        )
        val pair = recorder.logs.filter { it.event == AeroAudit.Event.DISPATCH }
        assertEquals(2, pair.size)
        assertEquals("requested", pair[0].phase)
        assertEquals("result", pair[1].phase)
        assertEquals("the two lines are one attempt", pair[0].attemptId, pair[1].attemptId)
        assertEquals(42, pair[1].launchId)
        assertTrue("the APK version travels with the line", !pair[1].appVersion.isNullOrBlank())
        assertTrue("the build number travels with the line", (pair[1].buildNumber ?: 0) > 0)
    }

    @Test
    fun `the seat is signed with the launch's operator, not with the phone's configured user`() = runTest {
        val recorder = Recorder()

        // The phone belongs to Wilkin and the launch belongs to Jaime: the company records who typed the
        // boxes, in the uppercase the Delphi binary sends and the ERP accepts.
        dispatcher(recorder).dispatch(settings, request.copy(operatorName = "Jaime"))

        assertEquals(JsonPrimitive("JAIME"), recorder.payloads.single().userCode)
    }

    @Test
    fun `a launch with no operator keeps signing with the configured user`() = runTest {
        val recorder = Recorder()

        dispatcher(recorder).dispatch(settings, request.copy(operatorName = null))

        // `7` is the configured code, and it stays numeric: an old row must not invent a name.
        assertEquals(JsonPrimitive(7), recorder.payloads.single().userCode)
    }

    @Test
    fun `an ERP that never answers leaves the row pending and says so in the log`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(recorder, entry = AeroWriteResult.Failed(null)).dispatch(settings, request)

        assertEquals(AeroDispatchOutcome.Failed(AeroFailure(AeroFailureCode.NO_ANSWER)), outcome)
        val log = recorder.logs.last()
        assertEquals(AeroAudit.Event.DISPATCH, log.event)
        assertEquals("result", log.phase)
        assertNull("A transport failure has no status to report", log.httpStatus)
        assertTrue(log.note!!.startsWith(AeroAudit.PREFIX))
        assertTrue(log.note!!.contains("launch #42"))
    }

    @Test
    fun `an ERP that refuses keeps its own sentence`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(
            recorder,
            entry = AeroWriteResult.Failed(
                "produto inexistente",
                httpStatus = 200,
                code = AeroFailureCode.ERP_REFUSED,
            ),
        ).dispatch(settings, request)

        assertEquals(
            AeroDispatchOutcome.Failed(
                AeroFailure(
                    AeroFailureCode.ERP_REFUSED,
                    "produto inexistente",
                    serverStatus = 200,
                ),
            ),
            outcome,
        )
        assertEquals(200, recorder.logs.last().httpStatus)
    }

    @Test
    fun `an unconfigured integration calls nothing and writes the line that says so`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(recorder).dispatch(AeroSettings(), request)

        assertEquals(AeroDispatchOutcome.Failed(AeroFailure.notConfigured), outcome)
        // The ERP is never touched, and that is the point: no entry payload, no read, nothing against the plant.
        assertEquals(emptyList<String>(), recorder.payloads.map { it.productCode })
        // And it is no longer silent: the log keeps the attempt, the launch it was about and the reason.
        val line = recorder.logs.last()
        assertEquals(AeroAudit.Event.DISPATCH, line.event)
        assertEquals("AERO_NOT_CONFIGURED", line.error)
        assertEquals("unconfigured", line.destinationUrl)
        assertTrue(line.note!!.contains("#42"))
    }

    @Test
    fun `an unconfigured sync writes its own line and reads nothing`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(recorder).syncDay(AeroSettings(), "2026-10-30")

        assertEquals(AeroSyncOutcome.Failed(AeroFailure.notConfigured), outcome)
        assertEquals(emptyList<String>(), recorder.calls.filter { it.startsWith("erp:") })
        val line = recorder.logs.last()
        assertEquals(AeroAudit.Event.SYNC, line.event)
        assertEquals("AERO_NOT_CONFIGURED", line.error)
        assertTrue(line.note!!.contains("date=2026-10-30"))
    }

    @Test
    fun `an imported seat is recorded with the seat and the boxes it took`() = runTest {
        val recorder = Recorder()

        dispatcher(recorder).logImport(date = "2026-10-30", entLan = 3010, productCode = "001192", boxes = 4)

        val line = recorder.logs.single()
        assertEquals(AeroAudit.Event.IMPORT, line.event)
        // An import is an outcome, not a placeholder: it is written once, after the backend answered, so
        // its phase is the same `result` the web writes for the same event. `response` is the old spelling
        // the server still accepts, and a reader filtering by phase would put this line in the wrong half.
        assertEquals("result", line.phase)
        assertEquals("/api/massas-launch", line.destinationUrl)
        assertEquals(null, line.error)
        assertEquals("android", line.client)
        assertTrue(line.note!!.contains("ent_lan=3010"))
        assertTrue(line.note!!.contains("boxes=4"))
    }

    @Test
    fun `an import the backend refused keeps the code it answered`() = runTest {
        val recorder = Recorder()

        dispatcher(recorder).logImport(
            date = "2026-10-30",
            entLan = 3010,
            productCode = "001192",
            boxes = 4,
            error = "MASSAS_OPERATOR_INACTIVE",
        )

        assertEquals("MASSAS_OPERATOR_INACTIVE", recorder.logs.single().error)
    }

    @Test
    fun `a sync reads the plant before storing the snapshot`() = runTest {
        val recorder = Recorder()
        val seat = AeroErpMovement(
            entLan = 900,
            productCode = "001192",
            productDesc = "MASSA DE PASTEL 500G",
            quantity = 15.0,
            entryDate = "2026-10-30",
            operatorName = "WILKIN",
            movementType = "E",
        )

        val outcome = dispatcher(
            recorder,
            movements = AeroMovementsResult.Ok(listOf(seat), skipped = 0),
            saved = AeroMovementsSaved(saved = 1, massas = 1, insumos = 0),
        ).syncDay(settings, "2026-10-30")

        assertEquals(AeroSyncOutcome.Synced(AeroMovementsSaved(saved = 1, massas = 1, insumos = 0)), outcome)
        assertEquals(
            listOf(
                "mirror:log:read_history:requested",
                "erp:movements:2026-10-30",
                "mirror:save:2026-10-30:1",
                "mirror:log:read_history:result",
            ),
            recorder.calls,
        )
        assertTrue(recorder.logs.last().note!!.contains("saved=1"))
    }

    @Test
    fun `a failed read never stores an empty day`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(recorder, movements = AeroMovementsResult.Failed(null))
            .syncDay(settings, "2026-10-30")

        assertEquals(AeroSyncOutcome.Failed(AeroFailure(AeroFailureCode.NO_ANSWER)), outcome)
        assertEquals(
            "a network blip must leave yesterday's snapshot standing",
            false,
            recorder.calls.any { it.startsWith("mirror:save") },
        )
    }

    /**
     * A day the backend closed is named as such, and nothing about it invites a retry.
     *
     * The ERP read worked and the snapshot arrived; the server refused it because that date is already
     * history. Reporting the generic "the server did not keep the day" sends the operator to try again on a
     * write that cannot succeed until somebody reopens the day, so the closed-day code is its own failure and
     * is not retryable.
     */
    @Test
    fun `maps a closed-day snapshot to a non retryable failure`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(
            recorder,
            refusal = AeroSnapshotSave.Refused(status = 409, code = "MASSAS_HISTORY_FROZEN"),
        ).syncDay(settings, "2026-10-30")

        val failure = (outcome as AeroSyncOutcome.Failed).failure
        assertEquals(AeroFailureCode.BACKEND_DAY_CLOSED, failure.code)
        assertEquals(409, failure.serverStatus)
        assertEquals("MASSAS_HISTORY_FROZEN", failure.serverCode)
        assertEquals(false, failure.retryable)
        // The log line keeps the backend's own code, so the reason survives in the trail.
        assertEquals("MASSAS_HISTORY_FROZEN", recorder.logs.last().error)
    }

    @Test
    fun `a backend that never answers is reported as unreachable, not as a refusal`() = runTest {
        val recorder = Recorder()

        // The day was read from the plant and lost on the way home. Saying "refused" here would send the
        // operator to look at the plant or at the day, when the only thing that failed was Trindade's own
        // server: the plant never said anything about this read.
        val outcome = dispatcher(recorder, saved = null).syncDay(settings, "2026-10-30")

        val failure = (outcome as AeroSyncOutcome.Failed).failure
        assertEquals(AeroFailureCode.SNAPSHOT_BACKEND_UNREACHABLE, failure.code)
        assertEquals(true, failure.retryable)
        assertEquals("AERO_SNAPSHOT_BACKEND_UNREACHABLE", failure.code.auditCode)
        assertEquals("AERO_SNAPSHOT_BACKEND_UNREACHABLE", recorder.logs.last().error)
    }

    @Test
    fun `a backend that answers a refusal still reports the snapshot as refused`() = runTest {
        val recorder = Recorder()

        val outcome = dispatcher(
            recorder,
            refusal = AeroSnapshotSave.Refused(status = 500, code = "SNAPSHOT_WRITE_FAILED"),
        ).syncDay(settings, "2026-10-30")

        val failure = (outcome as AeroSyncOutcome.Failed).failure
        assertEquals(AeroFailureCode.SNAPSHOT_REFUSED, failure.code)
        assertEquals(500, failure.serverStatus)
        assertEquals("SNAPSHOT_WRITE_FAILED", failure.serverCode)
        assertEquals("SNAPSHOT_WRITE_FAILED", recorder.logs.last().error)
    }
}

/**
 * The note the plant's log will read.
 *
 * The prefix is how a line is attributed to this client, so the tests are about it surviving: the 256-character
 * column is trimmed from the end, never from the front.
 */
class AeroAuditTest {

    @Test
    fun `the prefix names the client and the transport`() {
        assertEquals("Android App / ERP · client=android · via=native", AeroAudit.PREFIX)
        assertEquals(AeroAudit.PREFIX, AeroAudit.note(null))
        assertEquals(AeroAudit.PREFIX, AeroAudit.note("   "))
    }

    @Test
    fun `a detail follows the prefix`() {
        assertEquals("${AeroAudit.PREFIX} · launch #7", AeroAudit.note("launch #7"))
    }

    @Test
    fun `a note never exceeds the column, and the prefix is what survives`() {
        val note = AeroAudit.note("x".repeat(400))

        assertEquals(AeroAudit.NOTE_MAX, note.length)
        assertTrue(note.startsWith(AeroAudit.PREFIX))
        assertTrue(note.endsWith("x"))
    }

    @Test
    fun `the request carries the prefixed note`() {
        val request = AeroAudit.request(
            event = AeroAudit.Event.DISPATCH,
            destinationUrl = "http://192.168.25.250:1453/api/entradasitem",
            phase = "result",
            httpStatus = 200,
            durationMs = 1840,
            detail = "launch #42",
        )

        assertEquals(AeroAudit.Event.DISPATCH, request.event)
        assertEquals("result", request.phase)
        assertEquals(200, request.httpStatus)
        assertEquals("${AeroAudit.PREFIX} · launch #42", request.note)
    }
}
