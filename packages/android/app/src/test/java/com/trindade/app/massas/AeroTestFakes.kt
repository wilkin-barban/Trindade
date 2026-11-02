package com.trindade.app.massas

import com.trindade.app.aero.AeroDiagnosis
import com.trindade.app.aero.AeroEntryPayload
import com.trindade.app.aero.AeroErpMovement
import com.trindade.app.aero.AeroErpPort
import com.trindade.app.aero.AeroMirrorPort
import com.trindade.app.aero.AeroMovementsResult
import com.trindade.app.aero.AeroQueue
import com.trindade.app.aero.AeroQueuePort
import com.trindade.app.aero.AeroReachabilityPort
import com.trindade.app.aero.AeroSettings
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.aero.AeroSnapshotSave
import com.trindade.app.aero.AeroWriteResult
import com.trindade.app.aero.TabletAckPort
import com.trindade.app.network.AeroAuditLogRequest
import com.trindade.app.network.AeroMovementsSaved

/**
 * The device-owned state of a launch screen, in memory.
 *
 * The two stores behind these ports need a Context and the Keystore; the view model's decisions do not, and
 * testing them should not require either. The real classes stay the only shipping implementations.
 */
class FakeSettingsPort(
    var settings: AeroSettings = AeroSettings(),
) : AeroSettingsPort {
    val syncedAt = mutableMapOf<String, String>()
    var savedCount = 0

    override fun load(): AeroSettings = settings

    override fun save(settings: AeroSettings) {
        this.settings = settings
        savedCount++
    }

    override fun isConfigured(): Boolean = settings.ready

    override fun syncedAt(date: String): String? = syncedAt[date]

    override fun markSynced(date: String, at: String) {
        syncedAt[date] = at
    }
}

/**
 * La cola en memoria, y con el mismo contrato que el archivo real.
 *
 * `seed` es lo que quedó guardado antes de que la app se cerrara: un test lo usa para abrir el día con un
 * pendiente de ayer y comprobar que la apertura lo reintenta sin que nadie toque un botón.
 */
class FakeQueuePort(seed: AeroQueue? = null) : AeroQueuePort {
    var stored: AeroQueue? = seed
    var writes = 0
    var clears = 0

    override fun read(now: Long): AeroQueue? = stored

    override fun write(queue: AeroQueue) {
        writes++
        stored = if (queue.isEmpty) null else queue
    }

    override fun clear() {
        clears++
        stored = null
    }
}

class FakeAckPort(initial: Set<Int> = emptySet()) : TabletAckPort {
    val acked = initial.toMutableSet()

    override fun ackedIds(): Set<Int> = acked.toSet()

    override fun ack(launchId: Int) {
        acked += launchId
    }

    override fun unack(launchId: Int) {
        acked -= launchId
    }
}

/**
 * The plant, answering whatever the test asks and recording what it was asked.
 *
 * `postEntry` records the payloads so a test can assert units rather than the boxes the table showed, which
 * is the whole reason the dispatcher converts before it writes.
 */
class FakeErpPort : AeroErpPort {
    var writeResult: AeroWriteResult = AeroWriteResult.Ok(null)

    /**
     * What the plant answers, one per call, when a test needs a batch that does not succeed as a block.
     *
     * Empty falls back to [writeResult]; a batch of three that answers two different ways is the only way to
     * reach the sentence that reports a partial batch.
     */
    val writeResults = ArrayDeque<AeroWriteResult>()
    var movementsResult: AeroMovementsResult = AeroMovementsResult.Ok(emptyList(), skipped = 0)
    val payloads = mutableListOf<AeroEntryPayload>()
    var readDates = mutableListOf<String>()

    override suspend fun postEntry(settings: AeroSettings, payload: AeroEntryPayload): AeroWriteResult {
        payloads += payload
        return writeResults.removeFirstOrNull() ?: writeResult
    }

    override suspend fun readMovements(settings: AeroSettings, date: String): AeroMovementsResult {
        readDates += date
        return movementsResult
    }
}

/** The backend's side of the same conversation: the shared log and the stored snapshot. */
class FakeMirrorPort : AeroMirrorPort {
    val logs = mutableListOf<AeroAuditLogRequest>()
    val snapshots = mutableListOf<Pair<String, List<AeroErpMovement>>>()
    var saved: AeroMovementsSaved = AeroMovementsSaved(saved = 0, massas = 0, insumos = 0)
    var failSnapshot = false
    var refusedSnapshot: AeroSnapshotSave.Refused? = null

    override suspend fun saveMovements(
        date: String,
        movements: List<AeroErpMovement>,
    ): AeroSnapshotSave {
        snapshots += date to movements
        return when {
            refusedSnapshot != null -> refusedSnapshot!!
            failSnapshot -> AeroSnapshotSave.Unreachable
            else -> AeroSnapshotSave.Saved(saved)
        }
    }

    override suspend fun log(request: AeroAuditLogRequest) {
        logs += request
    }
}

/**
 * The phone's network, as the gate asks it.
 *
 * On the plant Wi-Fi with the host answering is the ordinary case and the default, because a test that is not
 * about the network must not have to say so. A test that is about it flips one of the two and asserts the
 * sentence the operator reads.
 */
class FakeReachability(
    var wifiConnected: Boolean = true,
    var hostReachable: Boolean? = true,
) : AeroReachabilityPort {
    var calls = 0

    override suspend fun diagnose(wsUrl: String?, timeoutMillis: Int): AeroDiagnosis {
        calls++
        return AeroDiagnosis(wifiConnected = wifiConnected, hostReachable = hostReachable)
    }
}
