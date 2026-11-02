import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import {
  batchRows,
  chooseVehicle,
  freeVehicles,
  onlyRefused,
  refusalMessage,
  rowsWithRepeatedPlate,
  rowsWithoutPlate,
  schedulePayload,
  togglePick,
  type PickedPlates,
  type PickerDriver,
  type PickerTab,
  type PickerVehicle,
} from '../../lib/loading-picker';
import { DriverForm } from './DriverForm';
import { DriverPickerDialog } from './DriverPickerDialog';

/** One row the batch could not send: the driver, and the sentence the server gave for that row. */
interface Refused {
  driverId: number;
  name: string;
  message: string;
}

export interface DriverPickerProps {
  timeSlot: string;
  date: string;
  drivers: readonly PickerDriver[];
  assignedIds: readonly number[];
  assignedVehicleIds?: readonly number[];
  /** The drivers of this day that are already in a slot, with the hour they are in. */
  busy?: readonly { driverId: number; timeSlot: string }[];
  /** Reloads the day so the grid behind the modal already shows what was accepted. */
  onRefresh: () => void;
  onClose: () => void;
}

/**
 * One time slot's drivers, sent as one batch.
 *
 * The fleet and the picks are read here; the surface that draws them is `DriverPickerDialog` and the rules
 * the batch obeys are in `lib/loading-picker`. What is left in this container is the order things happen in:
 * the fleet is read when the modal opens, the batch is written row by row, and a refusal leaves the modal
 * open because a slot where part of the drivers did not land is not a finished slot.
 */
export function DriverPicker({
  timeSlot,
  date,
  drivers,
  assignedIds,
  assignedVehicleIds = [],
  busy = [],
  onRefresh,
  onClose,
}: DriverPickerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PickerTab>('fleteros');
  const [showForm, setShowForm] = useState(false);
  const [picked, setPicked] = useState<PickedPlates>(new Map());
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  const [plateMissing, setPlateMissing] = useState<string[]>([]);
  const [plateRepeated, setPlateRepeated] = useState<string[]>([]);
  const [failures, setFailures] = useState<Refused[]>([]);
  // A fletero registered from inside the modal. The day is not reloaded for him: that would replace the grid
  // the modal is drawn over and close it, and the only thing that changed is one row of this list.
  const [registered, setRegistered] = useState<PickerDriver[]>([]);
  const [vehicles, setVehicles] = useState<PickerVehicle[]>([]);
  const [vehiclesError, setVehiclesError] = useState(false);

  // A fleet that failed to load leaves the plate selector empty, which reads as "there are none". The failure
  // is kept and shown with a retry instead of being swallowed into the console.
  const loadVehicles = useCallback(() => {
    setVehiclesError(false);
    api
      .get<{ vehicles: PickerVehicle[] }>('/loading/vehicles')
      .then((data) => setVehicles(data.vehicles))
      .catch(() => setVehiclesError(true));
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  // The day's drivers plus the ones registered from inside the modal. One list for both uses: the rows that
  // are drawn and the rows the batch is built from -- reading only the props for the batch is what left a
  // freshly registered fletero picked, listed and never sent.
  const pool = [
    ...drivers,
    ...registered.filter((fresh) => !drivers.some((driver) => driver.id === fresh.id)),
  ];
  const available = pool.filter((driver) => !assignedIds.includes(driver.id));
  // The ones already in the day, by name: the pool is where their name lives, and an id alone would draw a
  // sentence the operator cannot read.
  const alreadyThere = busy.flatMap((entry) => {
    const driver = pool.find((candidate) => candidate.id === entry.driverId);
    return driver ? [{ id: driver.id, name: driver.name, timeSlot: entry.timeSlot }] : [];
  });

  function pick(driver: PickerDriver) {
    setPicked((current) => togglePick(current, driver.id));
    setPlateMissing([]);
    setPlateRepeated([]);
    setError('');
  }

  function pickVehicle(driverId: number, raw: string) {
    setPicked((current) => chooseVehicle(current, driverId, raw));
    setPlateMissing([]);
    setPlateRepeated([]);
  }

  async function send(rows: ReturnType<typeof batchRows>) {
    setAssigning(true);
    setError('');
    setFailures([]);

    const refused: Refused[] = [];
    let accepted = 0;
    for (const row of rows) {
      try {
        await api.post('/loading/schedules', schedulePayload(date, timeSlot, row));
        accepted += 1;
      } catch (err) {
        refused.push({ driverId: row.driverId, name: row.name, message: refusalMessage(err, t) });
      }
    }

    setAssigning(false);
    if (accepted > 0) onRefresh();

    if (refused.length === 0) {
      onClose();
      return;
    }

    // What landed is in the grid and needs no pick; what was refused stays selected, which is what makes the
    // next accept a retry of the rows still owed instead of a second batch.
    setFailures(refused);
    setPicked((current) => onlyRefused(current, refused));
  }

  function retry() {
    void send(batchRows(picked, pool));
  }

  function accept() {
    const rows = batchRows(picked, pool);
    const withoutPlate = rowsWithoutPlate(rows);
    if (withoutPlate.length > 0) {
      setPlateMissing(withoutPlate.map((row) => row.name));
      return;
    }
    // Two rows cannot travel with the same plate: the server refuses the second one and the batch lands half
    // done. The screen knows it before sending, so it says it here instead of spending a request to hear it.
    const repeated = rowsWithRepeatedPlate(rows).map(
      (row) => vehicles.find((vehicle) => vehicle.id === row.vehicleId)?.license_plate ?? ''
    );
    if (repeated.length > 0) {
      setPlateRepeated(repeated);
      return;
    }
    if (rows.length > 0) void send(rows);
  }

  function driverSaved(driver: { id: number; name: string; license_plate: string | null }) {
    // A fletero registered here is one the operator wants on this slot: he joins the list and is picked
    // straight away, so registering him is one step of the same batch instead of a detour.
    setRegistered((current) => [...current, { ...driver, driver_type: 'fletero' }]);
    setPicked((current) => new Map(current).set(driver.id, null));
    setShowForm(false);
  }

  const quickAdd = showForm ? (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{t('loading.newFletero')}</p>
      <DriverForm onSaved={driverSaved} onCancel={() => setShowForm(false)} />
      <button
        type="button"
        onClick={() => setShowForm(false)}
        className="text-xs text-blue-600 hover:underline mt-2 inline-block"
        disabled={assigning}
      >
        {t('loading.backToList')}
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setShowForm(true)}
      disabled={assigning}
      className="text-sm text-blue-600 hover:underline font-medium mt-1 mb-2"
      data-testid="add-new-fletero-btn"
    >
      + {t('loading.newFletero')}
    </button>
  );

  return (
    <DriverPickerDialog
      slot={timeSlot}
      tab={tab}
      onTabChange={setTab}
      drivers={available}
      vehicles={freeVehicles(vehicles, assignedVehicleIds)}
      picked={picked}
      onToggle={pick}
      onVehicle={pickVehicle}
      quickAdd={quickAdd}
      vehiclesError={vehiclesError}
      onRetryVehicles={loadVehicles}
      plateMissing={plateMissing}
      plateRepeated={plateRepeated}
      busy={alreadyThere}
      fleetSize={vehicles.length}
      error={error}
      failures={failures}
      onRetry={retry}
      assigning={assigning}
      onAccept={accept}
      onClose={onClose}
    />
  );
}
