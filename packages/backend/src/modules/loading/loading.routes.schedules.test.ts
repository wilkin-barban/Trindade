import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

import { buildLoadingTestApp, type TestFixtures } from './loading-test-helper.js';
import { getSaoPauloDateString } from '../../utils/date.js';

/**
 * A São Paulo date shifted by whole days.
 *
 * These fixtures used to name fixed 2026 dates. Once a past day became read-only, each of those
 * writes would have been refused by the calendar instead of exercising the rule it covers, so every
 * writing test now names a day the plant can still accept.
 */
function dateIn(days: number): string {
  const anchor = new Date(`${getSaoPauloDateString()}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

const TODAY = dateIn(0);
const LIST_DAY = dateIn(10);
const EMPTY_DAY = dateIn(11);
const QUOTA_DAY = dateIn(12);
const ROLLING_DAY = dateIn(13);
const CONSTRAINTS_DAY = dateIn(14);
const DUPLICATE_DAY = dateIn(15);
const DUPLICATE_CODE_DAY = dateIn(17);
const CLOSED_BATCH_DAY = dateIn(16);
const PAST_DAY = dateIn(-1);

/**
 * Helper: login as admin and return the JWT token.
 */
async function loginAs(
  app: FastifyInstance,
  username: string,
  password: string
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  return JSON.parse(res.body).token;
}

/**
 * Helper: seed a test fletero driver and return its id.
 */
function seedDriver(
  db: Database.Database,
  name: string,
  license_plate?: string,
  driver_type: 'casa' | 'fletero' = 'fletero'
): number {
  const result = db
    .prepare(`INSERT INTO drivers (name, license_plate, driver_type, is_active) VALUES (?, ?, ?, 1)`)
    .run(name, license_plate ?? null, driver_type);
  return result.lastInsertRowid as number;
}

describe('Loading Schedule Routes', () => {
  let app: FastifyInstance;
  let db: Database.Database;
  let token: string;
  let vehicleId: number;
  let fixtures: TestFixtures;

  before(async () => {
    const result = await buildLoadingTestApp();
    app = result.app;
    db = result.db;
    fixtures = result.fixtures;
    token = await loginAs(app, fixtures.admin.username, fixtures.admin.password);
    vehicleId = (db.prepare("SELECT id FROM vehicles WHERE license_plate = 'BDG'").get() as { id: number }).id;
  });

  after(async () => {
    await app.close();
    db.close();
  });

  // ---- Authentication ----

  it('POST /schedules creates a schedule entry and returns 201', async () => {
    const driverId = seedDriver(db, 'Fletero 1', 'AAA1111');

    const res = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: TODAY,
        time_slot: '04:00',
        driver_type: 'fletero',
        driver_id: driverId,
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.schedule, 'schedule should be present');
    assert.strictEqual(body.schedule.schedule_date, TODAY);
    assert.strictEqual(body.schedule.time_slot, '04:00');
    assert.strictEqual(body.schedule.driver_type, 'fletero');
    assert.strictEqual(body.schedule.driver_id, driverId);
    assert.strictEqual(body.schedule.driver_name, 'Fletero 1');
    assert.strictEqual(body.schedule.license_plate, 'AAA1111');
    assert.ok(body.schedule.id, 'schedule should have an id');
  });

  // ---- Schedules: List ----

  it('GET /schedules returns entries sorted by time_slot ascending', async () => {
    const d1 = seedDriver(db, 'Fletero Lista A', 'LST0001');
    const d2 = seedDriver(db, 'Fletero Lista B', 'LST0002');

    // Create entries in non-ascending order
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: LIST_DAY,
        time_slot: '06:00',
        driver_type: 'fletero',
        driver_id: d1,
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: LIST_DAY,
        time_slot: '04:00',
        driver_type: 'fletero',
        driver_id: d2,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/loading/schedules?date=${LIST_DAY}`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.schedules), 'schedules should be an array');
    assert.strictEqual(body.schedules.length, 2);

    // Ascending order check
    assert.strictEqual(body.schedules[0].time_slot, '04:00');
    assert.strictEqual(body.schedules[1].time_slot, '06:00');
  });

  it('GET /schedules returns empty array for date with no entries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/loading/schedules?date=${EMPTY_DAY}`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.schedules));
    assert.strictEqual(body.schedules.length, 0);
  });

  it('GET /schedules validates date format and returns 400 on bad input', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/loading/schedules?date=invalid',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(res.statusCode, 400);
  });

  // ---- Quota is indicative: the max of 3 fleteros is not enforced ----

  it('POST /schedules accepts the 3rd fletero (within quota)', async () => {
    const d1 = seedDriver(db, 'Fletero Quota A', 'QTA0001');
    const d2 = seedDriver(db, 'Fletero Quota B', 'QTA0002');
    const d3 = seedDriver(db, 'Fletero Quota C', 'QTA0003');

    // Slot: 04:30 on a dedicated day
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: QUOTA_DAY,
        time_slot: '04:30',
        driver_type: 'fletero',
        driver_id: d1,
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: QUOTA_DAY,
        time_slot: '04:30',
        driver_type: 'fletero',
        driver_id: d2,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: QUOTA_DAY,
        time_slot: '04:30',
        driver_type: 'fletero',
        driver_id: d3,
      },
    });

    assert.strictEqual(res.statusCode, 201, '3rd fletero should be accepted');
  });

  it('POST /schedules allows 4th fletero (informative limit)', async () => {
    const d4 = seedDriver(db, 'Fletero Quota D', 'QTA0004');

    const res = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: QUOTA_DAY,
        time_slot: '04:30',
        driver_type: 'fletero',
        driver_id: d4,
      },
    });

    assert.strictEqual(res.statusCode, 201, '4th fletero should be allowed');
  });

  it('POST /schedules allows scheduling even if rolling 60-minute window is overloaded', async () => {
    const d1 = seedDriver(db, 'Fletero Roll A', 'ROL0001');
    const d2 = seedDriver(db, 'Fletero Roll B', 'ROL0002');
    const d3 = seedDriver(db, 'Fletero Roll C', 'ROL0003');
    const d4 = seedDriver(db, 'Fletero Roll D', 'ROL0004');
    const d5 = seedDriver(db, 'Fletero Roll E', 'ROL0005');
    const d6 = seedDriver(db, 'Fletero Roll F', 'ROL0006');
    const d7 = seedDriver(db, 'Fletero Roll G', 'ROL0007');
    const d8 = seedDriver(db, 'Fletero Roll H', 'ROL0008');

    // 1. Schedule 3 fleteros at 04:00.
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: ROLLING_DAY, time_slot: '04:00', driver_type: 'fletero', driver_id: d1 },
    });
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: ROLLING_DAY, time_slot: '04:00', driver_type: 'fletero', driver_id: d2 },
    });
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: ROLLING_DAY, time_slot: '04:00', driver_type: 'fletero', driver_id: d3 },
    });

    // 2. Schedule a 4th fletero at 04:30 (should succeed, since it is now informative).
    const res4 = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: ROLLING_DAY, time_slot: '04:30', driver_type: 'fletero', driver_id: d4 },
    });
    assert.strictEqual(res4.statusCode, 201, '4th fletero at 04:30 should be allowed');

    // 3. 05:00 is exactly 60 minutes after 04:00, so it starts a new allowed window.
    const res5 = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: ROLLING_DAY, time_slot: '05:00', driver_type: 'fletero', driver_id: d5 },
    });
    assert.strictEqual(res5.statusCode, 201, '1st fletero at 05:00 should be accepted');

    const res6 = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: ROLLING_DAY, time_slot: '05:00', driver_type: 'fletero', driver_id: d6 },
    });
    assert.strictEqual(res6.statusCode, 201, '2nd fletero at 05:00 should be accepted');

    const res7 = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: ROLLING_DAY, time_slot: '05:00', driver_type: 'fletero', driver_id: d7 },
    });
    assert.strictEqual(res7.statusCode, 201, '3rd fletero at 05:00 should be accepted');

    const res8 = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: ROLLING_DAY, time_slot: '05:00', driver_type: 'fletero', driver_id: d8 },
    });
    assert.strictEqual(res8.statusCode, 201, '4th fletero at 05:00 should be accepted');
  });

  it('POST /schedules validates driver-vehicle constraints for casa and fletero drivers', async () => {
    const casaDriverId = seedDriver(db, 'Motorista Casa', 'CAS0001', 'casa');
    const fleteroDriverId = seedDriver(db, 'Motorista Terceiro', 'FLE0001', 'fletero');

    // 1. Casa driver without vehicle -> should fail with 400
    const resCasaNoVehicle = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: CONSTRAINTS_DAY,
        time_slot: '04:00',
        driver_type: 'casa',
        driver_id: casaDriverId,
      },
    });
    assert.strictEqual(resCasaNoVehicle.statusCode, 400);

    // 2. Casa driver with active vehicle -> should succeed with 201
    const resCasaWithVehicle = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: CONSTRAINTS_DAY,
        time_slot: '04:00',
        driver_type: 'casa',
        driver_id: casaDriverId,
        vehicle_id: vehicleId,
      },
    });
    assert.strictEqual(resCasaWithVehicle.statusCode, 201);

    // 3. Fletero driver with vehicle -> should fail with 400 (Zod refine blocks it)
    const resFleteroWithVehicle = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: CONSTRAINTS_DAY,
        time_slot: '04:30',
        driver_type: 'fletero',
        driver_id: fleteroDriverId,
        vehicle_id: vehicleId,
      },
    });
    assert.strictEqual(resFleteroWithVehicle.statusCode, 400);

    // 4. Fletero driver without vehicle -> should succeed with 201
    const resFleteroNoVehicle = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: CONSTRAINTS_DAY,
        time_slot: '04:30',
        driver_type: 'fletero',
        driver_id: fleteroDriverId,
      },
    });
    assert.strictEqual(resFleteroNoVehicle.statusCode, 201);
  });

  // ---- Duplicate Prevention ----

  it('POST /schedules rejects duplicate driver in another slot on the same batch date', async () => {
    const driverId = seedDriver(db, 'Fletero Dup', 'DUP0001');

    // First: succeed
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: DUPLICATE_DAY,
        time_slot: '05:00',
        driver_type: 'fletero',
        driver_id: driverId,
      },
    });

    // Second: duplicate
    const res = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: DUPLICATE_DAY,
        time_slot: '06:00',
        driver_type: 'fletero',
        driver_id: driverId,
      },
    });

    assert.strictEqual(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.ok(
      body.error.includes('agendado') || body.error.includes('Motorista'),
      'error should mention duplicate'
    );
  });

  it('POST /schedules answers DRIVER_ALREADY_SCHEDULED with the slot of the existing row', async () => {
    const driverId = seedDriver(db, 'Fletero Código', 'COD0001');
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: DUPLICATE_CODE_DAY, time_slot: '04:00', driver_type: 'fletero', driver_id: driverId },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: DUPLICATE_CODE_DAY, time_slot: '06:00', driver_type: 'fletero', driver_id: driverId },
    });

    assert.strictEqual(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.code, 'DRIVER_ALREADY_SCHEDULED');
    assert.strictEqual(body.field, 'driver_id');
    assert.deepStrictEqual(body.existing, { time_slot: '04:00' }, 'the client learns which slot already holds the driver');
    assert.ok(body.message.includes('Motorista'), 'the human message still travels');
  });

  it('POST /schedules answers VEHICLE_ALREADY_SCHEDULED with the slot of the existing row', async () => {
    const first = seedDriver(db, 'Casa Chapa A', 'CHP0001', 'casa');
    const second = seedDriver(db, 'Casa Chapa B', 'CHP0002', 'casa');
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: DUPLICATE_CODE_DAY, time_slot: '04:00', driver_type: 'casa', driver_id: first, vehicle_id: vehicleId },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: DUPLICATE_CODE_DAY, time_slot: '07:00', driver_type: 'casa', driver_id: second, vehicle_id: vehicleId },
    });

    assert.strictEqual(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.code, 'VEHICLE_ALREADY_SCHEDULED');
    assert.strictEqual(body.field, 'vehicle_id');
    assert.deepStrictEqual(body.existing, { time_slot: '04:00' });
  });

  it('POST /schedules keeps the duplicate message readable in Portuguese and Spanish', async () => {
    const driverId = seedDriver(db, 'Fletero Idioma', 'IDI0001');
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: DUPLICATE_CODE_DAY, time_slot: '08:00', driver_type: 'fletero', driver_id: driverId },
    });

    const payload = { schedule_date: DUPLICATE_CODE_DAY, time_slot: '09:00', driver_type: 'fletero', driver_id: driverId };
    const pt = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}`, 'accept-language': 'pt-BR' },
      payload,
    });
    const es = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}`, 'accept-language': 'es' },
      payload,
    });

    assert.strictEqual(JSON.parse(pt.body).error, 'Motorista já agendado neste lote de carregamento.');
    assert.strictEqual(JSON.parse(es.body).error, 'Motorista ya agendado en este lote de cargamento.');
    assert.strictEqual(JSON.parse(pt.body).code, 'DRIVER_ALREADY_SCHEDULED');
    assert.strictEqual(JSON.parse(es.body).code, 'DRIVER_ALREADY_SCHEDULED');
  });

  /**
   * A day the plant already deactivated answers with its own code, in the language of the request.
   *
   * The sentence is translated, so a client that reads only the text can recognize the refusal only by
   * matching prose -- and the old answer was the duplicate message, a 400, on a day whose real problem
   * was that it was closed. The code is stable across languages; the sentence is not.
   */
  it('POST /schedules names a deactivated day with its code, in both languages', async () => {
    const driverId = seedDriver(db, 'Fletero Cerrado', 'CER0001');
    const first = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: CLOSED_BATCH_DAY, time_slot: '05:00', driver_type: 'fletero', driver_id: driverId },
    });
    assert.strictEqual(first.statusCode, 201);
    // The day is closed: its entries stay, all inactive, and that is the day the history already holds.
    const closed = await app.inject({
      method: 'PATCH',
      url: `/api/loading/schedules/batch/${CLOSED_BATCH_DAY}/deactivate`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(closed.statusCode, 200, 'the day is closed');

    for (const lang of ['pt-BR', 'es']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/loading/schedules',
        headers: { authorization: `Bearer ${token}`, 'accept-language': lang },
        payload: { schedule_date: CLOSED_BATCH_DAY, time_slot: '07:00', driver_type: 'fletero', driver_id: driverId },
      });
      const body = JSON.parse(res.body);

      assert.strictEqual(res.statusCode, 409, `${lang}: refused`);
      assert.strictEqual(body.code, 'LOADING_BATCH_DEACTIVATED', `${lang}: names the code`);
      assert.ok(
        body.error.includes(lang === 'es' ? 'Reactivá' : 'Reative'),
        `${lang}: keeps the sentence in the language of the request`
      );
    }
  });

  it('POST /schedules names a past day with its code, in both languages', async () => {
    const driverId = seedDriver(db, 'Fletero Pasado', 'PAS0001');

    for (const lang of ['pt-BR', 'es']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/loading/schedules',
        headers: { authorization: `Bearer ${token}`, 'accept-language': lang },
        payload: { schedule_date: PAST_DAY, time_slot: '04:00', driver_type: 'fletero', driver_id: driverId },
      });
      const body = JSON.parse(res.body);

      assert.strictEqual(res.statusCode, 409, `${lang}: refused as a history matter, not as a bad body`);
      assert.strictEqual(body.code, 'LOADING_HISTORY_FROZEN', `${lang}: names the code`);
      assert.ok(
        body.error.includes(lang === 'es' ? 'cerrado' : 'fechado'),
        `${lang}: keeps the sentence in the language of the request`
      );
    }

    assert.strictEqual(
      (db.prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ?').get(PAST_DAY) as { count: number }).count,
      0,
      'a refused draft leaves no row behind'
    );
  });

  // ---- Schedules: Delete ----

});
