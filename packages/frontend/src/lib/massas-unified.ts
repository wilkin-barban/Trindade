import { aeroImportPlan, aeroMirrorSeats, type AeroImportProduct } from './aero-mirror';
import { reconcileAeroMovements, type AeroErpMovementItem, type SeatOwnerStatus } from './aero-integration';
import { compareWorkerNames, boxesForUnits, openBoxUnits, type MassaIndividualLaunch } from './massas';

/** The three things a row can be, and the only three. */
export type MassasRowState = 'reconciled' | 'pendingErp' | 'erpOnly';

/** One line of the plant's day, no matter which screen wrote it. */
export interface MassasUnifiedRow {
  /** Stable across reloads: the launch id when there is one, the seat's `ENT_LAN` when there is not. */
  key: string;
  state: MassasRowState;
  operatorName: string;
  /** Lowercased, so the worker filter and the grouping agree. */
  operatorKey: string;
  productCode: string;
  productName: string;
  /** The boxes the units occupy, rounded up; never a decimal and never a truncated zero. */
  boxes: number;
  units: number;
  /** Units per box of the catalogue entry, so every screen derives the same number. */
  unitsPerBox: number;
  /** Units left in the open box of this line, or zero when the line closes every box. */
  openBoxUnits: number;
  launchIds: number[];
  entLans: number[];
  /** True only for `erpOnly` seats that fit whole boxes; the import action exists for these. */
  importable: boolean;
  /** True when the day and the device already said "carregado na tablet" for a pending row. */
  tabletAcked: boolean;
  /**
   * The account the line belongs to, or `null` when nobody here owns it.
   *
   * A seat takes this from the mirrored ERP row and a launch from its author, so the screens can ask one
   * question -- may this person import this? -- without resolving names client-side. `null` is "unknown",
   * and unknown is never the worker's to import.
   */
  ownerUserId: number | null;
  /**
   * Why the seat has no owner, when the mirror said it: an account that was deactivated, or a name nobody
   * here answers to.
   *
   * The difference decides the only useful action on the row -- reactivate or create -- and offering the
   * wrong one wastes the administrator's attempt on a login the database will refuse.
   */
  ownerStatus?: SeatOwnerStatus;
}

/**
 * The launches the ERP already has.
 *
 * A reconciled launch is settled: Delphi holds the seat, so editing its boxes or deleting it here would leave
 * the plant's day and the company's book telling different numbers with no screen able to say which is right.
 * The table asks this before drawing any control, which is the only place the rule can hold for both screens.
 */
export function reconciledLaunchIds(rows: readonly MassasUnifiedRow[] | undefined | null): Set<number> {
  const ids = new Set<number>();
  for (const row of rows ?? []) {
    if (row.state !== 'reconciled') continue;
    for (const id of row.launchIds) ids.add(id);
  }
  return ids;
}

/**
 * Whether this viewer may import this seat.
 *
 * S14: If `row.ownerUserId === null`, nobody can import it yet (not even an administrator):
 * the seat must have a linked Trindade operator first. If `row.ownerUserId !== null`, an administrator
 * can import it or the worker who owns it can import it.
 */
export function canImportRow(
  row: Pick<MassasUnifiedRow, 'state' | 'importable' | 'ownerUserId'>,
  viewer: { userId?: number | null; isAdmin?: boolean },
): boolean {
  if (row.state !== 'erpOnly' || !row.importable) return false;
  if (row.ownerUserId === null) return false;
  if (viewer.isAdmin) return true;
  if (viewer.userId === null || viewer.userId === undefined) return false;
  return row.ownerUserId === viewer.userId;
}

/**
 * Whether the viewer is offered the inline button to create the operator from the seat (S16, S19).
 *
 * Only an administrator, and only for an `erpOnly` seat whose operator is not linked yet (`ownerUserId === null`).
 */
export function canCreateOperatorRow(
  row: Pick<MassasUnifiedRow, 'state' | 'ownerUserId' | 'ownerStatus'>,
  viewer: { isAdmin?: boolean },
): boolean {
  return Boolean(viewer.isAdmin) && row.state === 'erpOnly' && seatOwnerStatus(row) === 'missing';
}

/**
 * What the mirror knows about the person on a row.
 *
 * An owned row is `active` by definition: only an active account can own a seat or author a launch. An
 * unowned one falls back to what the mirror said, and an older snapshot that says nothing reads as
 * `missing`, which is the answer that still offers a way forward.
 */
export function seatOwnerStatus(row: Pick<MassasUnifiedRow, 'ownerUserId' | 'ownerStatus'>): SeatOwnerStatus {
  if (row.ownerUserId !== null && row.ownerUserId !== undefined) return 'active';
  return row.ownerStatus === 'inactive' ? 'inactive' : 'missing';
}

/**
 * Whether the seat waits on a reactivation instead of an alta.
 *
 * A deactivated operator cannot import and cannot be created again: the administrator reactivates the
 * account in Admin › Operários, and the seat becomes importable on its own.
 */
export function seatNeedsReactivation(row: Pick<MassasUnifiedRow, 'ownerUserId' | 'ownerStatus'>): boolean {
  return seatOwnerStatus(row) === 'inactive';
}

/**
 * Formats an uppercase operator name from ERP into a clean display name (e.g. "JEFFERSON" -> "Jefferson", "JOAO H" -> "Joao H").
 */
export function deriveDisplayName(operatorName: string): string {
  const trimmed = String(operatorName ?? '').trim();
  if (!trimmed) return 'Operário';
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface MassasUnifiedInput {
  launches: readonly MassaIndividualLaunch[];
  /** The ERP's day, exactly as the bridge stored it. */
  movements: readonly AeroErpMovementItem[];
  /** The plant's catalogue, used both to filter supplies out and to know `unitsPerBox`. */
  products: readonly AeroImportProduct[];
  /** Launch ids already acknowledged on this device for this day. */
  ackedLaunchIds?: readonly number[];
}

/** What importing a seat sends: the seat, its product, the whole boxes it fits and the day it belongs to. */
export interface AeroImportRequest {
  entLan: number;
  /** The operator the tablet wrote on the seat; the import belongs to them, not to whoever pressed. */
  operatorName: string;
  productCode: string;
  boxes: number;
  date: string;
}

/** The names an operator answers to, lowercased for a filter a person types. */
function operatorNames(launch: MassaIndividualLaunch): string[] {
  return [launch.display_name, launch.username]
    .map((name) => String(name ?? '').trim().toLowerCase())
    .filter(Boolean);
}

/** The box size of a line: the catalogue's, or what the launch itself implies when the catalogue lacks it. */
function unitsPerBoxFor(
  products: readonly AeroImportProduct[],
  code: string,
  boxes: number,
  units: number,
): number {
  const product = productFor(products, code);
  if (product && product.unitsPerBox > 0) return product.unitsPerBox;
  return boxes > 0 && units > 0 ? Math.round(units / boxes) : 0;
}

/** The catalogue entry for a code, tolerating the padding both sides use differently. */
function productFor(products: readonly AeroImportProduct[], code: string): AeroImportProduct | null {
  const digits = String(code).trim().replace(/^0+/, '') || '0';
  return (
    products.find((product) => (String(product.code).trim().replace(/^0+/, '') || '0') === digits) ?? null
  );
}

const STATE_ORDER: Record<MassasRowState, number> = {
  // What the plant still owes Delphi comes first: it is the only state that asks for an action here.
  pendingErp: 0,
  erpOnly: 1,
  reconciled: 2,
};

/**
 * The plant's day as one table.
 *
 * Two screens record the same boxes, and the table cannot show both lists: a box launched here and recorded
 * on the tablet would appear twice and the operator would not know which line to trust. So the day is
 * reconciled once and each box is one row with its real state:
 *
 * - `reconciled`: launched here and already in the ERP.
 * - `pendingErp`: launched here and not in the ERP yet.
 * - `erpOnly`: recorded on the company tablet and never launched here; importable when it fits whole boxes.
 *
 * A stock exit never becomes a row: it is product leaving the plant, not production.
 */
export function massasUnifiedRows(
  input: MassasUnifiedInput,
  operatorFilter = '',
): MassasUnifiedRow[] {
  const { launches, movements, products, ackedLaunchIds = [] } = input;
  const seats = aeroMirrorSeats(movements, products);
  const reconciliation = reconcileAeroMovements(seats, launches);
  const matchedLaunchIds = new Set(reconciliation.matchedLaunchIds);
  const reconciledEntLans = new Set(reconciliation.reconciled);
  const acked = new Set(ackedLaunchIds);
  const filter = operatorFilter.trim().toLowerCase();

  const rows: MassasUnifiedRow[] = [];

  for (const launch of launches) {
    if (launch.boxes <= 0) continue;
    const names = operatorNames(launch);
    // The filter is universal: it looks at every name the operator uses, on both sides of the day.
    if (filter && !names.some((name) => name.includes(filter))) continue;
    const reconciled = matchedLaunchIds.has(launch.id);
    // A launch stores whole boxes, but it still reads through the same rule: the units are the measurement.
    const unitsPerBox = unitsPerBoxFor(products, launch.product_code, launch.boxes, launch.units);
    rows.push({
      key: `launch-${launch.id}`,
      state: reconciled ? 'reconciled' : 'pendingErp',
      operatorName: (launch.display_name || launch.username || 'Operador').trim(),
      operatorKey: (launch.display_name || launch.username || 'operador').trim().toLowerCase(),
      productCode: launch.product_code,
      productName: launch.product_name,
      boxes: boxesForUnits(launch.units, unitsPerBox),
      units: launch.units,
      unitsPerBox,
      openBoxUnits: openBoxUnits(launch.units, unitsPerBox),
      launchIds: [launch.id],
      // The reconciliation matches counts, not pairs: two identical seats are interchangeable, so naming one
      // as this launch's seat would be a guess. The row says it is paired and leaves the id to the ERP side.
      entLans: [],
      importable: false,
      tabletAcked: !reconciled && acked.has(launch.id),
      ownerUserId: launch.user_id ?? null,
    });
  }

  for (const seat of seats) {
    if (reconciledEntLans.has(seat.entLan)) continue;
    if (seat.movementType !== 'E') continue;
    const product = productFor(products, seat.productCode);
    if (!product) continue;
    const operator = seat.operatorName.trim();
    if (filter && !operator.toLowerCase().includes(filter)) continue;
    const plan = aeroImportPlan(seat, products);
    rows.push({
      key: `seat-${seat.entLan}`,
      state: 'erpOnly',
      operatorName: operator,
      operatorKey: operator.toLowerCase(),
      productCode: product.code,
      productName: product.name,
      boxes: boxesForUnits(seat.quantity, product.unitsPerBox),
      units: seat.quantity,
      unitsPerBox: product.unitsPerBox,
      openBoxUnits: openBoxUnits(seat.quantity, product.unitsPerBox),
      launchIds: [],
      entLans: [seat.entLan],
      importable: plan !== null,
      tabletAcked: false,
      ownerUserId: seat.ownerUserId ?? null,
      ownerStatus: seat.ownerStatus,
    });
  }

  return rows.sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      a.operatorName.localeCompare(b.operatorName, 'pt-BR') ||
      a.productName.localeCompare(b.productName, 'pt-BR'),
  );
}

/**
 * The day in two numbers, for the bar at the top.
 *
 * Produced is every box somebody counted, whichever screen counted it. Registered is what the company already
 * has, so a reconciled launch and its seat count once: the seat is the registration and the launch is the work,
 * never two boxes. The difference therefore reads as "what the company does not know yet", and only a pending
 * launch can make it negative.
 */
export interface MassasBalance {
  produced: number;
  registered: number;
  difference: number;
}

export function massasBalance(rows: MassasUnifiedRow[]): MassasBalance {
  let produced = 0;
  let registered = 0;
  for (const row of rows) {
    produced += row.units;
    if (row.state !== 'pendingErp') registered += row.units;
  }
  return { produced, registered, difference: registered - produced };
}

/**
 * The launch ids this phone already carried to the tablet on that day.
 *
 * The mark is per device on purpose: it says "I loaded these boxes", not "the ERP has them". It dies with the
 * day, because a new shift carries new boxes, and it is stored outside the database so acknowledging never
 * looks like a launch.
 */
export function ackedLaunchIdsKey(date: string): string {
  return `aero_tablet_acked_${date}`;
}

export function loadAckedLaunchIds(date: string): number[] {
  try {
    const raw = window.localStorage.getItem(ackedLaunchIdsKey(date));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

/** Adds or removes one id and returns the new list, so the caller can render without re-reading. */
export function toggleAckedLaunchId(date: string, launchId: number): number[] {
  const current = loadAckedLaunchIds(date);
  const next = current.includes(launchId) ? current.filter((id) => id !== launchId) : [...current, launchId];
  try {
    window.localStorage.setItem(ackedLaunchIdsKey(date), JSON.stringify(next));
  } catch {
    // A phone with storage disabled still gets the answer for this render; only the memory is lost.
  }
  return next;
}

/** One worker of the unified day, as the filter and the subtotal need them. */
export interface MassasUnifiedOperator {
  /** Stable across both sides of the day: the normalised name, never a user id. */
  key: string;
  name: string;
  /** Units the worker's rows occupy, added product by product. */
  boxes: number;
  units: number;
}

/**
 * Every worker the unified day names, including the ones who exist only in the ERP.
 *
 * The old filter was built from `user_id`, which a mirrored seat does not have: a worker who only typed on
 * the company tablet was absent from the chips and their boxes were invisible in the lower sections. The key
 * is the normalised name so a launch and a seat of the same person land on one chip.
 */
export function massasUnifiedOperators(rows: readonly MassasUnifiedRow[]): MassasUnifiedOperator[] {
  const byKey = new Map<string, { name: string; units: Map<string, number>; unitsPerBox: Map<string, number> }>();
  for (const row of rows) {
    const entry = byKey.get(row.operatorKey) ?? { name: row.operatorName, units: new Map(), unitsPerBox: new Map() };
    entry.units.set(row.productCode, (entry.units.get(row.productCode) ?? 0) + row.units);
    entry.unitsPerBox.set(row.productCode, row.unitsPerBox);
    byKey.set(row.operatorKey, entry);
  }

  return Array.from(byKey.entries())
    .map(([key, entry]) => ({
      key,
      name: entry.name,
      // Each product has its own box size, so the worker's boxes are the sum of the products' boxes.
      boxes: Array.from(entry.units.entries()).reduce(
        (sum, [code, units]) => sum + boxesForUnits(units, entry.unitsPerBox.get(code) ?? 0),
        0,
      ),
      units: Array.from(entry.units.values()).reduce((sum, units) => sum + units, 0),
    }))
    .sort((left, right) => compareWorkerNames(left.name, right.name));
}

export interface MassasUnifiedSummaryProduct {
  code: string;
  name: string;
  unitsPerBox: number;
  totalBoxes: number;
  totalUnits: number;
  openBoxUnits: number;
}

export interface MassasUnifiedSummaryWorker {
  key: string;
  name: string;
  boxes: number;
  units: number;
  /** Units the worker left in open boxes, added product by product. */
  openBoxUnits: number;
}

export interface MassasUnifiedSummary {
  /** One entry per product, rounded up once from every unit the day counted for it. */
  products: MassasUnifiedSummaryProduct[];
  workers: MassasUnifiedSummaryWorker[];
  /** The workers who touched each product, for the collective table's name line. */
  workerNamesByProduct: Map<string, string[]>;
}

/**
 * The collective summary of the rows the section is showing.
 *
 * The rule is one rounding per product, from the exact units: two rows of three units in a ten-unit box are
 * one open box, not two. A worker's total adds the boxes of their products because the products have
 * different box sizes; dividing mixed units by one box size would answer a question nobody asked.
 */
export function massasUnifiedSummary(rows: readonly MassasUnifiedRow[]): MassasUnifiedSummary {
  const products = new Map<string, { name: string; unitsPerBox: number; totalUnits: number }>();
  const workers = new Map<
    string,
    { name: string; units: Map<string, number>; unitsPerBox: Map<string, number> }
  >();
  const namesByProduct = new Map<string, Set<string>>();

  for (const row of rows) {
    const product = products.get(row.productCode) ?? {
      name: row.productName,
      unitsPerBox: row.unitsPerBox,
      totalUnits: 0,
    };
    product.totalUnits += row.units;
    if (product.unitsPerBox <= 0 && row.unitsPerBox > 0) product.unitsPerBox = row.unitsPerBox;
    products.set(row.productCode, product);

    const worker = workers.get(row.operatorKey) ?? { name: row.operatorName, units: new Map(), unitsPerBox: new Map() };
    worker.units.set(row.productCode, (worker.units.get(row.productCode) ?? 0) + row.units);
    worker.unitsPerBox.set(row.productCode, row.unitsPerBox);
    workers.set(row.operatorKey, worker);

    const names = namesByProduct.get(row.productCode) ?? new Set<string>();
    names.add(row.operatorName);
    namesByProduct.set(row.productCode, names);
  }

  return {
    products: Array.from(products.entries()).map(([code, product]) => {
      const totalUnits = product.totalUnits;
      return {
        code,
        name: product.name,
        unitsPerBox: product.unitsPerBox,
        totalBoxes: boxesForUnits(totalUnits, product.unitsPerBox),
        totalUnits,
        openBoxUnits: openBoxUnits(totalUnits, product.unitsPerBox),
      };
    }),
    workers: Array.from(workers.entries()).map(([key, worker]) => ({
      key,
      name: worker.name,
      boxes: Array.from(worker.units.entries()).reduce(
        (sum, [code, units]) => sum + boxesForUnits(units, worker.unitsPerBox.get(code) ?? 0),
        0,
      ),
      units: Array.from(worker.units.values()).reduce((sum, units) => sum + units, 0),
      openBoxUnits: Array.from(worker.units.entries()).reduce(
        (sum, [code, units]) => sum + openBoxUnits(units, worker.unitsPerBox.get(code) ?? 0),
        0,
      ),
    })),
    workerNamesByProduct: new Map(
      Array.from(namesByProduct.entries()).map(([code, names]) => [
        code,
        Array.from(names).sort(compareWorkerNames),
      ]),
    ),
  };
}
