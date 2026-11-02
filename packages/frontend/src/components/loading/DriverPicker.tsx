import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import {
  batchRows,
  chooseVehicle,
  freeVehicles,
  refusalMessage,
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

export interface DriverPickerProps {
  timeSlot: string;
  date: string;
  drivers: readonly PickerDriver[];
  assignedIds: readonly number[];
  assignedVehicleIds?: readonly number[];
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

  const available = drivers.filter((driver) => !assignedIds.includes(driver.id));

  function pick(driver: PickerDriver) {
    setPicked((current) => togglePick(current, driver.id));
    setPlateMissing([]);
    setError('');
  }

  function pickVehicle(driverId: number, raw: string) {
    setPicked((current) => chooseVehicle(current, driverId, raw));
    setPlateMissing([]);
  }

  async function send(rows: ReturnType<typeof batchRows>) {
    setAssigning(true);
    setError('');

    let accepted = 0;
    let refusal = '';
    for (const row of rows) {
      try {
        await api.post('/loading/schedules', schedulePayload(date, timeSlot, row));
        accepted += 1;
      } catch (err) {
        // The first refusal is the one worth reading: the batch stops being a batch once part of it did not
        // land, and the sentence is about that row's own duplicate.
        refusal = refusal || refusalMessage(err, t);
      }
    }

    setAssigning(false);
    if (accepted > 0) onRefresh();
    if (refusal) {
      setError(refusal);
      return;
    }
    onClose();
  }

  function accept() {
    const rows = batchRows(picked, drivers);
    const withoutPlate = rowsWithoutPlate(rows);
    if (withoutPlate.length > 0) {
      setPlateMissing(withoutPlate.map((row) => row.name));
      return;
    }
    if (rows.length > 0) void send(rows);
  }

  function driverSaved(driver: { id: number }) {
    // A fletero registered here is one the operator wants on this slot: he is picked straight away and the
    // list behind the form reloads so his row is drawn like any other.
    setPicked((current) => new Map(current).set(driver.id, null));
    setShowForm(false);
    onRefresh();
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
      error={error}
      assigning={assigning}
      onAccept={accept}
      onClose={onClose}
    />
  );
}
