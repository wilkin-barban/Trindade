/**
 * The rules of assigning a whole time slot at once.
 *
 * The picker holds more than one driver before sending anything, and that turns four small decisions into
 * rules: what a pick is, which rows are still owed a plate, what each row sends, and what a refusal says.
 * They live here, away from the dialog, because they are the half that can be wrong silently -- a batch that
 * sends a company driver without his plate, or one that forgets the row the server refused, looks exactly
 * like a batch that worked until somebody reads the day's grid.
 */

export type PickerTab = 'fleteros' | 'casa';

/** Driver id to the plate chosen for it. A fletero never carries one; see `schedulePayload`. */
export type PickedPlates = ReadonlyMap<number, number | null>;

export interface PickerDriver {
  id: number;
  name: string;
  driver_type: 'fletero' | 'casa';
  license_plate: string | null;
}

export interface PickerVehicle {
  id: number;
  description: string;
  license_plate: string;
}

/** One row of the batch: the driver, and the plate when the driver belongs to the company. */
export interface BatchRow {
  driverId: number;
  name: string;
  driverType: 'fletero' | 'casa';
  vehicleId: number | null;
}

export interface SchedulePayload {
  schedule_date: string;
  time_slot: string;
  driver_type: 'fletero' | 'casa';
  driver_id: number;
  vehicle_id: number | null;
}

/** The drivers of the slot that are not in the day yet. */
export function availableDrivers<T extends { id: number }>(
  drivers: readonly T[],
  assignedIds: readonly number[]
): T[] {
  return drivers.filter((driver) => !assignedIds.includes(driver.id));
}

/** The fleet plates nobody took on this date. */
export function freeVehicles<T extends { id: number }>(
  vehicles: readonly T[],
  assignedVehicleIds: readonly number[]
): T[] {
  return vehicles.filter((vehicle) => !assignedVehicleIds.includes(vehicle.id));
}

/** Picking a driver twice un-picks him: the same control does both, as a check box does. */
export function togglePick(picked: PickedPlates, driverId: number): Map<number, number | null> {
  const next = new Map(picked);
  if (next.has(driverId)) next.delete(driverId);
  else next.set(driverId, null);
  return next;
}

/**
 * The plate for one picked driver.
 *
 * The empty option maps to null rather than to 0: it is "nobody chose a plate yet", and the batch is withheld
 * until it stops being null. A driver who is not picked is set here too, but the batch only reads picked ids,
 * so a value set on a row nobody selected is never sent.
 */
export function chooseVehicle(picked: PickedPlates, driverId: number, raw: string): Map<number, number | null> {
  const next = new Map(picked);
  next.set(driverId, raw === '' ? null : Number(raw));
  return next;
}

/** The picks in the order they were made, with the plate each one carries. */
export function batchRows(
  picked: PickedPlates,
  drivers: readonly PickerDriver[]
): BatchRow[] {
  return [...picked.entries()].flatMap(([driverId, vehicleId]) => {
    const driver = drivers.find((candidate) => candidate.id === driverId);
    if (!driver) return [];
    return [
      { driverId, name: driver.name, driverType: driver.driver_type, vehicleId: vehicleId ?? null },
    ];
  });
}

/**
 * The rows the batch cannot send yet, because a company driver has no plate.
 *
 * The server refuses a company driver without a vehicle, so sending the batch would spend a request per row
 * to collect refusals the screen already knows about -- and the rows that would have landed would not, since
 * nothing is sent until the whole batch is answerable.
 */
export function rowsWithoutPlate(rows: readonly BatchRow[]): BatchRow[] {
  return rows.filter((row) => row.driverType === 'casa' && row.vehicleId === null);
}

/**
 * What one row sends.
 *
 * A fletero travels with `vehicle_id: null` and not with the key left out: the server refuses a fletero that
 * carries a vehicle, and the plate of his own truck lives on the driver, not on the day.
 */
export function schedulePayload(date: string, timeSlot: string, row: BatchRow): SchedulePayload {
  return {
    schedule_date: date,
    time_slot: timeSlot,
    driver_type: row.driverType,
    driver_id: row.driverId,
    vehicle_id: row.vehicleId,
  };
}

/** What a refused row says: the server's reason, in the operator's words. */
export function refusalMessage(err: unknown, t: (key: string) => string): string {
  const status = typeof (err as { status?: unknown })?.status === 'number'
    ? (err as { status: number }).status
    : null;
  const raw = typeof (err as { message?: unknown })?.message === 'string'
    ? (err as { message: string }).message
    : '';

  if (raw === 'scheduleAlreadyExists') return t('loading.scheduleAlreadyExists');
  if (status === 409) {
    // The 409 the server sends names no field, so the message is what tells the two duplicates apart: the
    // plate, or the driver.
    const text = raw.toLowerCase();
    const aboutVehicle = ['veículo', 'veiculo', 'vehículo', 'vehiculo', 'vehicle'].some((word) =>
      text.includes(word)
    );
    return aboutVehicle ? t('loading.vehicleAlreadyScheduled') : t('loading.driverAlreadyScheduled');
  }
  if (status === 0) return t('api.networkError');
  return raw || t('loading.saveError');
}
