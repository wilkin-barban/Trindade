package com.trindade.app.massas

import com.trindade.app.aero.AeroErpMovement
import com.trindade.app.network.MassaIndividualLaunch

/**
 * The plant's day as one table.
 *
 * Two screens record the same boxes, and the table cannot show both lists: a box launched here and recorded
 * on the tablet would appear twice and the operator would not know which line to trust. So the day is
 * reconciled once and each box is one row with its real state.
 *
 * This is a port of `packages/frontend/src/lib/massas-unified.ts`, rule by rule. The reconciliation and the
 * seat filters live here rather than in the screen for the same reason they live in a module on the web: a
 * state that is computed once cannot disagree with itself in three places.
 */

/** The three things a row can be, and the only three. */
enum class MassasRowState {
    /** Launched here and already in the ERP. */
    RECONCILED,

    /** Launched here and not in the ERP yet. The only state that asks for an action here. */
    PENDING_ERP,

    /** Recorded on the company tablet and never launched here; importable when it fits whole boxes. */
    ERP_ONLY,
}

/** One line of the plant's day, no matter which screen wrote it. */
data class MassasUnifiedRow(
    /** Stable across reloads: the launch id when there is one, the seat's `ENT_LAN` when there is not. */
    val key: String,
    val state: MassasRowState,
    val operatorName: String,
    /** Lowercased, so the worker filter and the grouping agree. */
    val operatorKey: String,
    val productCode: String,
    val productName: String,
    val boxes: Int,
    val units: Int,
    val launchIds: List<Int>,
    val entLans: List<Int>,
    /** True only for `ERP_ONLY` seats that fit whole boxes; the import action exists for these. */
    val importable: Boolean,
    /** True when the operator already said this pending launch is loaded on the tablet. */
    val tabletAcked: Boolean,
    /**
     * The account the line belongs to, or null when nobody here owns it.
     *
     * A seat takes it from the stored ERP row and a launch from its author, so the screen asks one
     * question -- may this person import this? -- instead of resolving names on the phone. Null is
     * "unknown", and unknown is never the worker's.
     */
    val ownerUserId: Int? = null,
    /** `active`, `inactive` or `missing`, when the backend resolved the owner of this seat. */
    val ownerStatus: String? = null,
    /** Units in one box for this product, so a row that cannot be imported can say the size it misses. */
    val unitsPerBox: Int = 0,
    /** Units left in the last, open box; zero when the last box is full or the size is unknown. */
    val openBoxUnits: Int = 0,
)

/**
 * Why an ERP seat cannot become a launch, when it cannot.
 *
 * The row is already on the screen: the plant recorded it and Trindade did not. Hiding it would be worse, and
 * leaving it without a word is what made the operator ask the office. These are the three reasons the answer
 * can wait on, and each has its own sentence.
 */
enum class MassasImportHint {
    /** The quantity does not fill whole boxes, which is the only unit a launch here counts. */
    NOT_WHOLE_BOXES,

    /** The plant has no catalogue entry for the code, so the boxes cannot be computed at all. */
    UNKNOWN_PRODUCT,

    /** A stock exit: product leaving the plant, not production. */
    NOT_AN_ENTRY,
}

/** The reason this seat has no import action, or null when it has one. */
fun massasImportHint(row: MassasUnifiedRow, products: List<AeroImportProduct>): MassasImportHint? {
    if (row.state != MassasRowState.ERP_ONLY || row.importable) return null
    val product = productFor(products, row.productCode) ?: return MassasImportHint.UNKNOWN_PRODUCT
    if (product.unitsPerBox <= 0) return MassasImportHint.UNKNOWN_PRODUCT
    if (row.units <= 0) return MassasImportHint.NOT_AN_ENTRY
    return MassasImportHint.NOT_WHOLE_BOXES
}

/**
 * Whether this viewer may import this seat.
 *
 * The backend refuses a seat that belongs to somebody else, and this is the same rule asked one step
 * earlier, on the row: a button a worker can only fail with is worse than no button.
 * A seat with no ownerUserId cannot be imported by anyone until the operator is linked.
 */
fun canImportRow(row: MassasUnifiedRow, viewerId: Int?, isAdmin: Boolean): Boolean {
    if (row.state != MassasRowState.ERP_ONLY || !row.importable) return false
    val owner = row.ownerUserId ?: return false
    if (isAdmin) return true
    return owner == viewerId
}

/**
 * Whether an administrator can create the operator directly from the unlinked ERP seat (S16, S19).
 *
 * An unlinked seat has `ownerUserId == null`. An inactive operator requires reactivation rather than creation.
 */
fun canCreateOperatorRow(
    row: MassasUnifiedRow,
    isAdmin: Boolean,
    isInactive: Boolean = false,
): Boolean {
    // The seat's own `owner_status` is the authority: the link table may still be locally empty while the
    // backend already knows this name belongs to an inactive worker, and offering to create that account is
    // offering to fail.
    val inactive = isInactive || row.ownerStatus == "inactive"
    return isAdmin && row.state == MassasRowState.ERP_ONLY && row.ownerUserId == null && !inactive
}

/**
 * Formats an uppercase operator name from ERP into a clean display name (e.g. "JEFFERSON" -> "Jefferson").
 */
fun deriveDisplayName(operatorName: String): String {
    val trimmed = operatorName.trim()
    if (trimmed.isEmpty()) return "Operador"
    return trimmed
        .lowercase()
        .split(Regex("\\s+"))
        .filter { it.isNotEmpty() }
        .joinToString(" ") { word -> word.replaceFirstChar { it.uppercase() } }
}

/**
 * The launches the ERP already has.
 *
 * A reconciled launch is settled: Delphi holds the seat, so editing its boxes or deleting it here would leave
 * the plant's day and the company's book telling different numbers. The screen asks this before drawing a
 * control, and the view model asks it again before acting.
 */
fun reconciledLaunchIds(rows: List<MassasUnifiedRow>?): Set<Int> {
    val ids = mutableSetOf<Int>()
    for (row in rows.orEmpty()) {
        if (row.state != MassasRowState.RECONCILED) continue
        ids.addAll(row.launchIds)
    }
    return ids
}

data class MassasUnifiedInput(
    val launches: List<MassaIndividualLaunch>,
    /** The ERP's day, exactly as the sync stored it. */
    val movements: List<AeroErpMovement>,
    /** The plant's catalogue, used both to filter supplies out and to know `unitsPerBox`. */
    val products: List<AeroImportProduct>,
    /** Launch ids already acknowledged on this device for this day. */
    val ackedLaunchIds: Set<Int> = emptySet(),
)

/** The catalogue entry a launch is recorded against, as the screen already holds it. */
data class AeroImportProduct(
    val code: String,
    val name: String,
    val unitsPerBox: Int,
)

/** What an import would send, before the screen posts it. */
data class AeroImportPlan(
    /** The plant's own code, which is the one a local launch records. */
    val productCode: String,
    val boxes: Int,
)

/** What importing a seat sends: the seat, its product, the whole boxes it fits and the day it belongs to. */
data class AeroImportRequest(
    val entLan: Int,
    val productCode: String,
    val boxes: Int,
    val date: String,
)

/** Both sides write the same code with different padding. */
private fun importCodeKey(code: String): String = code.trim().trimStart('0').ifEmpty { "0" }

/** The catalogue entry for a code, tolerating the padding both sides use differently. */
private fun productFor(products: List<AeroImportProduct>, code: String): AeroImportProduct? {
    val digits = importCodeKey(code)
    return products.firstOrNull { importCodeKey(it.code) == digits }
}

/**
 * The seats this table is about.
 *
 * The ERP is asked for the whole day, and the day carries more than what the plant produced: a box of
 * packaging, bags of flour and straws arrive through the same endpoint. Those are supplies, they belong to
 * Recebimento, and a screen that shows them without an import button is telling the operator about a problem
 * it cannot solve. The catalogue is the filter, not the direction.
 */
fun aeroMirrorSeats(
    movements: List<AeroErpMovement>,
    products: List<AeroImportProduct>,
): List<AeroErpMovement> {
    val codes = products.map { importCodeKey(it.code) }.toSet()
    if (codes.isEmpty()) return emptyList()
    return movements.filter { importCodeKey(it.productCode) in codes }
}

/**
 * Decides whether an ERP seat can become a Trindade launch, and in what boxes.
 *
 * "Import" always means a new local launch, never an edit of the company's record. Three things must hold:
 * the seat is an entry (a stock exit is not production), the plant has the product, and the units fit whole
 * boxes -- a launch here is counted in boxes, and inventing a fraction would record something the factory
 * never counted.
 */
fun aeroImportPlan(movement: AeroErpMovement, products: List<AeroImportProduct>): AeroImportPlan? {
    if (movement.movementType != "E") return null

    val product = products.firstOrNull { importCodeKey(it.code) == importCodeKey(movement.productCode) }
        ?: return null
    if (product.unitsPerBox <= 0) return null

    val quantity = movement.quantity
    if (quantity <= 0 || quantity % 1.0 != 0.0) return null
    if (quantity.toInt() % product.unitsPerBox != 0) return null

    return AeroImportPlan(productCode = product.code, boxes = quantity.toInt() / product.unitsPerBox)
}

/**
 * The plant's day as one table, reconciled.
 *
 * `state` for each row is decided once, here, so the badges, the filter and the balance cannot disagree:
 *
 * - `RECONCILED`: launched here and already in the ERP.
 * - `PENDING_ERP`: launched here and not in the ERP yet.
 * - `ERP_ONLY`: recorded on the company tablet and never launched here; importable when it fits whole boxes.
 *
 * A stock exit never becomes a row: it is product leaving the plant, not production.
 *
 * The operator filter is universal -- it looks at every name the operator uses, on both sides of the day --
 * because a filter that only hides half the rows is a filter that lies about the total.
 */
fun massasUnifiedRows(input: MassasUnifiedInput, operatorFilter: String = ""): List<MassasUnifiedRow> {
    val seats = aeroMirrorSeats(input.movements, input.products)
    val reconciliation = com.trindade.app.aero.reconcileAeroMovements(
        movements = seats,
        launches = input.launches.map { launch ->
            com.trindade.app.aero.AeroLocalLaunch(
                id = launch.id,
                launchDate = launch.launchDate.ifEmpty { launch.date },
                productCode = launch.productCode,
                units = launch.units.toDouble(),
                username = launch.username,
                entLan = launch.entLan,
            )
        },
    )
    val matchedLaunchIds = reconciliation.matchedLaunchIds.toSet()
    val reconciledEntLans = reconciliation.reconciled.toSet()
    val filter = operatorFilter.trim().lowercase()

    val rows = mutableListOf<MassasUnifiedRow>()

    for (launch in input.launches) {
        if (launch.boxes <= 0) continue
        val names = operatorNames(launch)
        // The filter is universal: it looks at every name the operator uses, on both sides of the day.
        if (filter.isNotEmpty() && names.none { it.contains(filter) }) continue

        val reconciled = launch.id in matchedLaunchIds
        val unitsPerBox = productFor(input.products, launch.productCode)?.unitsPerBox ?: 0
        rows.add(
            MassasUnifiedRow(
                key = "launch-${launch.id}",
                state = if (reconciled) MassasRowState.RECONCILED else MassasRowState.PENDING_ERP,
                operatorName = operatorName(launch),
                operatorKey = operatorKey(launch),
                productCode = launch.productCode,
                productName = launch.productName,
                boxes = launch.boxes,
                units = launch.units,
                launchIds = listOf(launch.id),
                // The reconciliation matches counts, not pairs: two identical seats are interchangeable, so
                // naming one as this launch's seat would be a guess. The row says it is paired, and leaves
                // the id to the ERP side.
                entLans = emptyList(),
                importable = false,
                tabletAcked = !reconciled && launch.id in input.ackedLaunchIds,
                ownerUserId = launch.userId,
                unitsPerBox = unitsPerBox,
                openBoxUnits = openUnitsInBox(launch.units, unitsPerBox),
            ),
        )
    }

    for (seat in seats) {
        if (seat.entLan in reconciledEntLans) continue
        if (seat.movementType != "E") continue
        val product = productFor(input.products, seat.productCode) ?: continue
        val operator = seat.operatorName.trim()
        if (filter.isNotEmpty() && !operator.lowercase().contains(filter)) continue

        val plan = aeroImportPlan(seat, input.products)
        val units = seat.quantity.toInt()
        rows.add(
            MassasUnifiedRow(
                key = "seat-${seat.entLan}",
                state = MassasRowState.ERP_ONLY,
                operatorName = operator,
                operatorKey = operator.lowercase(),
                productCode = product.code,
                productName = product.name,
                // The boxes are what the plant loads, so they round up; the units stay exactly as the ERP
                // recorded them, and the row says how many travel in the open box.
                boxes = boxesForUnits(units, product.unitsPerBox),
                units = units,
                launchIds = emptyList(),
                entLans = listOf(seat.entLan),
                importable = plan != null,
                tabletAcked = false,
                ownerUserId = seat.ownerUserId,
                ownerStatus = seat.ownerStatus,
                unitsPerBox = product.unitsPerBox,
                openBoxUnits = openUnitsInBox(units, product.unitsPerBox),
            ),
        )
    }

    return rows.sortedWith(stateOrder)
}


/**
 * The boxes a quantity occupies, rounded up: the plant loads a box as soon as it puts one unit in it.
 *
 * The web made this a module of its own because the same rounding was written twice with two answers. The
 * rule is: add the units of a product first, round once afterwards. A rounding per line inflates the day.
 */
fun boxesForUnits(units: Int, unitsPerBox: Int): Int {
    if (units <= 0 || unitsPerBox <= 0) return 0
    return (units + unitsPerBox - 1) / unitsPerBox
}

/** The units the last box carries, or zero when it is full. */
fun openUnitsInBox(units: Int, unitsPerBox: Int): Int {
    if (units <= 0 || unitsPerBox <= 0) return 0
    return units % unitsPerBox
}

/** One worker in the day, with the exact units and the boxes those units occupy. */
data class MassaUnifiedOperator(
    /** Lowercased name: the only identity an operator who exists only in the ERP has. */
    val key: String,
    val name: String,
    val boxes: Int,
    val units: Int,
)

/** A product's total for the day, rounded once over the units of every row. */
data class MassaUnifiedProduct(
    val code: String,
    val name: String,
    val unitsPerBox: Int,
    val totalBoxes: Int,
    val totalUnits: Int,
    val openBoxUnits: Int,
)

/** What one worker did on the day, across products. */
data class MassaUnifiedWorker(
    val key: String,
    val name: String,
    val boxes: Int,
    val units: Int,
    val openBoxUnits: Int,
)

/** The two lower sections of the day, computed once so they cannot disagree. */
data class MassaUnifiedSummary(
    val products: List<MassaUnifiedProduct>,
    val workers: List<MassaUnifiedWorker>,
    /** The workers who touched each product, by product code, for the "who made this" line. */
    val workerNamesByProduct: Map<String, List<String>>,
)

/**
 * The workers of the day, read from the rows instead of from the local accounts.
 *
 * A seat recorded on the company tablet belongs to a name that may have no account here. Building the filter
 * from `launches` hid that worker and, with him, his boxes.
 */
fun massasUnifiedOperators(rows: List<MassasUnifiedRow>): List<MassaUnifiedOperator> {
    data class Accumulator(
        var name: String,
        val units: LinkedHashMap<String, Int>,
        val unitsPerBox: MutableMap<String, Int>,
    )

    val byKey = linkedMapOf<String, Accumulator>()
    for (row in rows) {
        val accumulator = byKey.getOrPut(row.operatorKey) {
            Accumulator(row.operatorName, linkedMapOf(), mutableMapOf())
        }
        accumulator.units[row.productCode] = (accumulator.units[row.productCode] ?: 0) + row.units
        accumulator.unitsPerBox[row.productCode] = row.unitsPerBox
    }

    return byKey.map { (key, accumulator) ->
        MassaUnifiedOperator(
            key = key,
            name = accumulator.name,
            // Each product has its own box size, so the worker's boxes are the sum of the products' boxes.
            boxes = accumulator.units.entries.sumOf { (code, units) ->
                boxesForUnits(units, accumulator.unitsPerBox[code] ?: 0)
            },
            units = accumulator.units.values.sum(),
        )
    }.sortedWith(compareBy({ it.name.lowercase() }, { it.key }))
}

/**
 * The collective summary of what is on screen.
 *
 * The defect this closes: four products with remainders showed four open boxes per row, and the day looked
 * like it had more boxes than the plant loaded. Units are added, rounding happens once per product.
 */
fun massasUnifiedSummary(rows: List<MassasUnifiedRow>): MassaUnifiedSummary {
    data class ProductAccumulator(var name: String, var unitsPerBox: Int, var totalUnits: Int)
    data class WorkerAccumulator(
        var name: String,
        val units: LinkedHashMap<String, Int>,
        val unitsPerBox: MutableMap<String, Int>,
    )

    val products = linkedMapOf<String, ProductAccumulator>()
    val workers = linkedMapOf<String, WorkerAccumulator>()
    val namesByProduct = linkedMapOf<String, LinkedHashSet<String>>()

    for (row in rows) {
        val product = products.getOrPut(row.productCode) {
            ProductAccumulator(row.productName, row.unitsPerBox, 0)
        }
        product.totalUnits += row.units
        if (product.unitsPerBox <= 0 && row.unitsPerBox > 0) product.unitsPerBox = row.unitsPerBox

        val worker = workers.getOrPut(row.operatorKey) {
            WorkerAccumulator(row.operatorName, linkedMapOf(), mutableMapOf())
        }
        worker.units[row.productCode] = (worker.units[row.productCode] ?: 0) + row.units
        worker.unitsPerBox[row.productCode] = row.unitsPerBox

        namesByProduct.getOrPut(row.productCode) { linkedSetOf() }.add(row.operatorName)
    }

    return MassaUnifiedSummary(
        products = products.map { (code, product) ->
            MassaUnifiedProduct(
                code = code,
                name = product.name,
                unitsPerBox = product.unitsPerBox,
                totalBoxes = boxesForUnits(product.totalUnits, product.unitsPerBox),
                totalUnits = product.totalUnits,
                openBoxUnits = openUnitsInBox(product.totalUnits, product.unitsPerBox),
            )
        },
        workers = workers.map { (key, worker) ->
            MassaUnifiedWorker(
                key = key,
                name = worker.name,
                boxes = worker.units.entries.sumOf { (code, units) ->
                    boxesForUnits(units, worker.unitsPerBox[code] ?: 0)
                },
                units = worker.units.values.sum(),
                openBoxUnits = worker.units.entries.sumOf { (code, units) ->
                    openUnitsInBox(units, worker.unitsPerBox[code] ?: 0)
                },
            )
        }.sortedWith(compareBy({ it.name.lowercase() }, { it.key })),
        workerNamesByProduct = namesByProduct.mapValues { (_, names) ->
            names.sortedWith(compareBy { it.lowercase() })
        },
    )
}

/** Pending first: it is the only state that asks for an action here. */
private val stateOrder: Comparator<MassasUnifiedRow> =
    compareBy<MassasUnifiedRow> {
        when (it.state) {
            MassasRowState.PENDING_ERP -> 0
            MassasRowState.ERP_ONLY -> 1
            MassasRowState.RECONCILED -> 2
        }
    }
        .thenBy { it.operatorName.lowercase() }
        .thenBy { it.productName.lowercase() }

private fun operatorNames(launch: MassaIndividualLaunch): List<String> =
    listOf(launch.displayName, launch.username)
        .map { it.trim().lowercase() }
        .filter { it.isNotEmpty() }

private fun operatorName(launch: MassaIndividualLaunch): String =
    launch.displayName.ifBlank { launch.username }.ifBlank { "Operador" }.trim()

private fun operatorKey(launch: MassaIndividualLaunch): String = operatorName(launch).lowercase()

/** The day in two numbers, for the bar at the top. */
data class MassasBalance(
    /** Every box somebody counted, whichever screen counted it. */
    val produced: Int,
    /** What the company already has: a reconciled launch and its seat count once. */
    val registered: Int,
    /** Negative only when something was produced that the ERP does not know yet. */
    val difference: Int,
)

/**
 * The balance of the visible day.
 *
 * Produced is every box in the rows. Registered is what the company already has, so a reconciled launch and
 * its seat count once: the seat is the registration and the launch is the work, never two boxes. The
 * difference therefore reads as "what the company does not know yet".
 */
fun massasBalance(rows: List<MassasUnifiedRow>): MassasBalance {
    var produced = 0
    var registered = 0
    for (row in rows) {
        produced += row.units
        if (row.state != MassasRowState.PENDING_ERP) registered += row.units
    }
    return MassasBalance(produced = produced, registered = registered, difference = registered - produced)
}
