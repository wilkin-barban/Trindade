import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  batchRows,
  chooseVehicle,
  freeVehicles,
  availableDrivers,
  refusalMessage,
  rowsWithoutPlate,
  schedulePayload,
  togglePick,
  type PickerDriver,
} from './loading-picker';

/**
 * The rules a picker that sends more than one driver at a time has to hold.
 *
 * Each one fails quietly: a batch that sends a fletero with a plate, or one that sends a company driver
 * without his, is refused by the server row by row and half a slot lands; a batch that forgets a picked row
 * leaves a driver out of the day with nothing on screen saying so.
 */
const t = (key: string) => key;

const FLETERO: PickerDriver = { id: 1, name: 'Carlos', driver_type: 'fletero', license_plate: 'ABC-1D23' };
const CASA: PickerDriver = { id: 4, name: 'Silvana', driver_type: 'casa', license_plate: null };
const DRIVERS = [FLETERO, CASA];

describe('the picks', () => {
  it('takes a driver on the first press and leaves him on the second', () => {
    const once = togglePick(new Map(), 4);
    assert.deepEqual([...once.entries()], [[4, null]]);

    const twice = togglePick(once, 4);
    assert.deepEqual([...twice.entries()], []);
  });

  it('keeps the plate under the driver it belongs to, and reads the empty option as no plate', () => {
    const withPlate = chooseVehicle(chooseVehicle(new Map(), 4, '11'), 4, '');
    assert.equal(withPlate.get(4), null);

    const chosen = chooseVehicle(new Map(), 4, '11');
    assert.equal(chosen.get(4), 11);
  });

  it('hides the drivers the day already has, and the plates it already took', () => {
    assert.deepEqual(availableDrivers(DRIVERS, [1]).map((driver) => driver.id), [4]);
    assert.deepEqual(
      freeVehicles([{ id: 11 }, { id: 12 }], [12]).map((vehicle) => vehicle.id),
      [11]
    );
  });
});

describe('the batch', () => {
  it('reads one row per pick, in the order they were made, with the plate each carries', () => {
    const picked = chooseVehicle(togglePick(togglePick(new Map(), 1), 4), 4, '11');

    assert.deepEqual(batchRows(picked, DRIVERS), [
      { driverId: 1, name: 'Carlos', driverType: 'fletero', vehicleId: null },
      { driverId: 4, name: 'Silvana', driverType: 'casa', vehicleId: 11 },
    ]);
  });

  it('names the company drivers the batch cannot send without a plate', () => {
    const picked = togglePick(togglePick(new Map(), 1), 4);
    const rows = batchRows(picked, DRIVERS);

    // The fletero needs nothing: only the company driver's row is owed a plate.
    assert.deepEqual(rowsWithoutPlate(rows).map((row) => row.name), ['Silvana']);

    const answered = chooseVehicle(picked, 4, '11');
    assert.deepEqual(rowsWithoutPlate(batchRows(answered, DRIVERS)), []);
  });

  it('sends a fletero with a null vehicle rather than with a plate of his own', () => {
    const [fletero, casa] = batchRows(
      chooseVehicle(togglePick(togglePick(new Map(), 1), 4), 4, '11'),
      DRIVERS
    );

    assert.deepEqual(schedulePayload('2026-02-10', '04:00', fletero), {
      schedule_date: '2026-02-10',
      time_slot: '04:00',
      driver_type: 'fletero',
      driver_id: 1,
      vehicle_id: null,
    });
    assert.deepEqual(schedulePayload('2026-02-10', '04:00', casa), {
      schedule_date: '2026-02-10',
      time_slot: '04:00',
      driver_type: 'casa',
      driver_id: 4,
      vehicle_id: 11,
    });
  });
});

describe('what a refusal says', () => {
  it('tells the two duplicates apart, which is the only place the server names them', () => {
    const vehicle = Object.assign(new Error('Veículo já agendado nesta data.'), { status: 409 });
    const driver = Object.assign(new Error('Motorista já agendado neste lote de carregamento.'), {
      status: 409,
    });

    assert.equal(refusalMessage(vehicle, t), 'loading.vehicleAlreadyScheduled');
    assert.equal(refusalMessage(driver, t), 'loading.driverAlreadyScheduled');
  });

  it('keeps the batch-level refusal, the network, and whatever the server said', () => {
    assert.equal(
      refusalMessage(new Error('scheduleAlreadyExists'), t),
      'loading.scheduleAlreadyExists'
    );
    assert.equal(refusalMessage(Object.assign(new Error(''), { status: 0 }), t), 'api.networkError');
    assert.equal(
      refusalMessage(Object.assign(new Error('Motorista inativo ou não encontrado.'), { status: 400 }), t),
      'Motorista inativo ou não encontrado.'
    );
    assert.equal(refusalMessage('not an error', t), 'loading.saveError');
  });
});
