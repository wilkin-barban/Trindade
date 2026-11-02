import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

import { buildLoadingTestApp, type TestFixtures } from './loading-test-helper.js';
import { getSaoPauloDateString } from '../../utils/date.js';

/**
 * Dates relative to the operators' today.
 *
 * The fixtures below used to name fixed 2026 dates; once a past day became read-only, every one of
 * them would have asserted the calendar refusal instead of the route it was written to cover.
 */
function dateIn(days: number): string {
  const anchor = new Date(`${getSaoPauloDateString()}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

const TODAY = dateIn(0);
const TOMORROW = dateIn(1);
const YESTERDAY = dateIn(-1);

// Each lifecycle test owns a date of its own: the file shares one database, and a day that another
// test already filled is no longer "a day with only inactive rows".
const CLOSED_BATCH_DAY = dateIn(3);
const WHOLE_DAY = dateIn(4);
const DISCARD_DAY = dateIn(5);
const REACTIVATION_DAY = dateIn(6);
const PAST_REACTIVATION_DAY = dateIn(-3);

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

  it('DELETE /schedules/:id removes a schedule entry', async () => {
    const driverId = seedDriver(db, 'Fletero Delete', 'DEL0001');

    const createRes = await app.inject({
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
    const scheduleId = JSON.parse(createRes.body).schedule.id;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/loading/schedules/${scheduleId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(delRes.statusCode, 204);

    // Verify it's gone
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/loading/schedules?date=${TODAY}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const listBody = JSON.parse(listRes.body);
    assert.strictEqual(listBody.schedules.length, 0);
  });

  it('DELETE /schedules/:id releases casa and fletero drivers for another active slot', async () => {
    const fleteroId = seedDriver(db, 'Fletero Reassign', 'REA-FLT');
    const casaId = seedDriver(db, 'Casa Reassign', 'REA-CAS', 'casa');
    const date = TOMORROW;

    for (const [driverId, driverType, assignedVehicleId] of [
      [fleteroId, 'fletero', undefined],
      [casaId, 'casa', vehicleId],
    ] as const) {
      const created = await app.inject({
        method: 'POST',
        url: '/api/loading/schedules',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          schedule_date: date,
          time_slot: '04:00',
          driver_type: driverType,
          driver_id: driverId,
          ...(assignedVehicleId ? { vehicle_id: assignedVehicleId } : {}),
        },
      });
      assert.strictEqual(created.statusCode, 201);

      const scheduleId = JSON.parse(created.body).schedule.id;
      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/loading/schedules/${scheduleId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      assert.strictEqual(deleted.statusCode, 204);

      const reassigned = await app.inject({
        method: 'POST',
        url: '/api/loading/schedules',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          schedule_date: date,
          time_slot: '05:00',
          driver_type: driverType,
          driver_id: driverId,
          ...(assignedVehicleId ? { vehicle_id: assignedVehicleId } : {}),
        },
      });
      assert.strictEqual(reassigned.statusCode, 201);
    }
  });

  it('DELETE /schedules/:id returns 404 for non-existent entry', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/loading/schedules/99999',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(res.statusCode, 404);
  });

  // ---- Export ----

  it('PATCH /schedules/:id updates time_slot successfully', async () => {
    const driverId = seedDriver(db, 'Fletero Patch', 'PTCH001');
    const createRes = await app.inject({
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
    const scheduleId = JSON.parse(createRes.body).schedule.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/loading/schedules/${scheduleId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { time_slot: '06:00' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.schedule.time_slot, '06:00');
    assert.strictEqual(body.schedule.id, scheduleId);
    assert.strictEqual(body.schedule.driver_name, 'Fletero Patch');
  });

  it('PATCH /schedules/:id updates successfully even if it exceeds rolling quota', async () => {
    // Fill 04:30 slot with 3 fleteros on 2026-11-15
    const d1 = seedDriver(db, 'Fletero Rollback A', 'RBK001');
    const d2 = seedDriver(db, 'Fletero Rollback B', 'RBK002');
    const d3 = seedDriver(db, 'Fletero Rollback C', 'RBK003');
    const d4 = seedDriver(db, 'Fletero Target', 'RBK004');

    for (const did of [d1, d2, d3]) {
      await app.inject({
        method: 'POST',
        url: '/api/loading/schedules',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          schedule_date: TOMORROW,
          time_slot: '04:30',
          driver_type: 'fletero',
          driver_id: did,
        },
      });
    }

    // Create entry for d4 in a different slot (06:00)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: TOMORROW,
        time_slot: '06:00',
        driver_type: 'fletero',
        driver_id: d4,
      },
    });
    const scheduleId = JSON.parse(createRes.body).schedule.id;

    // Move d4 to 04:30 (exceeding the quota of 3 fleteros)
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/loading/schedules/${scheduleId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { time_slot: '04:30' },
    });

    assert.strictEqual(res.statusCode, 200, 'should allow updating slot even if exceeding quota');
    const body = JSON.parse(res.body);
    assert.strictEqual(body.schedule.time_slot, '04:30');

    // Verify d4 is successfully in 04:30
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/loading/schedules?date=${TOMORROW}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const list = JSON.parse(getRes.body);
    const entry = list.schedules.find((s: any) => s.id === scheduleId);
    assert.ok(entry, 'entry should still exist');
    assert.strictEqual(entry.time_slot, '04:30', 'time_slot should have changed');
  });

  it('PATCH /schedules/:id returns 404 for non-existent entry', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/loading/schedules/99999',
      headers: { authorization: `Bearer ${token}` },
      payload: { time_slot: '04:00' },
    });

    assert.strictEqual(res.statusCode, 404);
  });

  it('PATCH /schedules/:id returns 400 for invalid payload', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/loading/schedules/1',
      headers: { authorization: `Bearer ${token}` },
      payload: { time_slot: '' },
    });

    assert.strictEqual(res.statusCode, 400);
  });

  it('PATCH /schedules/:id returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/loading/schedules/1',
      payload: { time_slot: '04:00' },
    });

    assert.strictEqual(res.statusCode, 401);
  });

  it('admin can deactivate a past batch, but not delete it', async () => {
    const d1 = seedDriver(db, 'Batch Admin Driver A', 'BAD-1');
    const d2 = seedDriver(db, 'Batch Admin Driver B', 'BAD-2');
    db.prepare(`
      INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, created_at)
      VALUES (32000, '2026-06-19', '04:00', ?, 'fletero', NULL, datetime('now', '-30 minutes'))
    `).run(d1);
    db.prepare(`
      INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, created_at)
      VALUES (32001, '2026-06-19', '04:30', ?, 'fletero', NULL, datetime('now', '-29 minutes'))
    `).run(d2);

    const history = await app.inject({
      method: 'GET',
      url: '/api/loading/schedules/history?date=2026-06-19',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(history.statusCode, 200);
    const batch = JSON.parse(history.body).items[0];
    assert.strictEqual(batch.creator, null);
    assert.strictEqual(batch.readOnly, true);
    assert.strictEqual(batch.canDeactivate, true);
    assert.strictEqual(batch.canDelete, true);
    assert.strictEqual(batch.total_loadings, 2);

    const deactivated = await app.inject({
      method: 'PATCH',
      url: '/api/loading/schedules/batch/2026-06-19/deactivate',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(deactivated.statusCode, 200);
    assert.strictEqual((db.prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ? AND is_active = 0').get('2026-06-19') as any).count, 2);

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/loading/schedules/batch/2026-06-19',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(deleted.statusCode, 409, 'a closed day is deactivated, never erased');
    assert.strictEqual(JSON.parse(deleted.body).code, 'LOADING_HISTORY_FROZEN');
    assert.strictEqual((db.prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ?').get('2026-06-19') as any).count, 2);
  });

  it('deletes a future draft batch transactionally', async () => {
    const d1 = seedDriver(db, 'Batch Draft Driver A', 'BDD-1');
    db.prepare(`
      INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, created_at)
      VALUES (32010, ?, '04:00', ?, 'fletero', NULL, datetime('now'))
    `).run(DISCARD_DAY, d1);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/loading/schedules/batch/${DISCARD_DAY}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(deleted.statusCode, 204);
    assert.strictEqual((db.prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ?').get(DISCARD_DAY) as any).count, 0);
  });

  it('worker can delete only the records it owns, and only today', async () => {
    const workerToken = await loginAs(app, fixtures.worker.username, fixtures.worker.password);
    const driverId = seedDriver(db, 'Worker Delete Driver', 'WRK-1');
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id) VALUES (9203, ?, '05:00', ?, 'fletero', ?)`).run(TODAY, driverId, fixtures.admin.id);
    const res = await app.inject({ method: 'DELETE', url: '/api/loading/schedules/9203', headers: { authorization: `Bearer ${workerToken}` } });
    assert.strictEqual(res.statusCode, 403);
    db.prepare('UPDATE loading_schedules SET user_id = ? WHERE id = 9203').run(fixtures.worker.id);
    const ownRes = await app.inject({ method: 'DELETE', url: '/api/loading/schedules/9203', headers: { authorization: `Bearer ${workerToken}` } });
    assert.strictEqual(ownRes.statusCode, 204);
  });

  it('refuses every write dated before today with LOADING_HISTORY_FROZEN', async () => {
    const driverId = seedDriver(db, 'Past Day Driver', 'PST-1');
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id) VALUES (9204, ?, '04:00', ?, 'fletero', ?)`).run(YESTERDAY, driverId, fixtures.admin.id);

    for (const attempt of [
      app.inject({
        method: 'POST',
        url: '/api/loading/schedules',
        headers: { authorization: `Bearer ${token}` },
        payload: { schedule_date: YESTERDAY, time_slot: '05:00', driver_type: 'fletero', driver_id: driverId },
      }),
      app.inject({
        method: 'PATCH',
        url: '/api/loading/schedules/9204',
        headers: { authorization: `Bearer ${token}` },
        payload: { time_slot: '05:00' },
      }),
      app.inject({
        method: 'DELETE',
        url: '/api/loading/schedules/9204',
        headers: { authorization: `Bearer ${token}` },
      }),
    ]) {
      const response = await attempt;
      assert.strictEqual(response.statusCode, 409);
      assert.strictEqual(JSON.parse(response.body).code, 'LOADING_HISTORY_FROZEN');
    }

    const stored = db.prepare('SELECT time_slot FROM loading_schedules WHERE id = 9204').get() as { time_slot: string } | undefined;
    assert.strictEqual(stored?.time_slot, '04:00', 'a refused write leaves the row untouched');
  });

  it('answers LOADING_BATCH_DEACTIVATED instead of a duplicate when the day was closed', async () => {
    const driverId = seedDriver(db, 'Deactivated Day Driver', 'DEA-1');
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, is_active) VALUES (9205, ?, '04:00', ?, 'fletero', ?, 0)`).run(CLOSED_BATCH_DAY, driverId, fixtures.admin.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: { schedule_date: CLOSED_BATCH_DAY, time_slot: '05:00', driver_type: 'fletero', driver_id: driverId },
    });

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(JSON.parse(res.body).code, 'LOADING_BATCH_DEACTIVATED');
    assert.strictEqual((db.prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ?').get(CLOSED_BATCH_DAY) as any).count, 1);
  });

  it('reads a deactivated day whole only when includeInactive asks for it', async () => {
    const first = seedDriver(db, 'Whole Day First', 'WHD-1');
    const second = seedDriver(db, 'Whole Day Second', 'WHD-2');
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, is_active) VALUES (9206, ?, '04:00', ?, 'fletero', ?, 1)`).run(WHOLE_DAY, first, fixtures.admin.id);
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, is_active) VALUES (9207, ?, '04:30', ?, 'fletero', ?, 0)`).run(WHOLE_DAY, second, fixtures.admin.id);

    const active = await app.inject({
      method: 'GET',
      url: `/api/loading/schedules?date=${WHOLE_DAY}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(active.statusCode, 200);
    assert.strictEqual(JSON.parse(active.body).schedules.length, 1, 'the operational grid keeps hiding inactive rows');
    assert.strictEqual(JSON.parse(active.body).dayActive, true);

    const whole = await app.inject({
      method: 'GET',
      url: `/api/loading/schedules?date=${WHOLE_DAY}&includeInactive=1`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(whole.statusCode, 200);
    assert.strictEqual(JSON.parse(whole.body).schedules.length, 2);

    await app.inject({
      method: 'PATCH',
      url: `/api/loading/schedules/batch/${WHOLE_DAY}/deactivate`,
      headers: { authorization: `Bearer ${token}` },
    });
    const closed = await app.inject({
      method: 'GET',
      url: `/api/loading/schedules?date=${WHOLE_DAY}&includeInactive=1`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(JSON.parse(closed.body).schedules.length, 2, 'a closed day is still readable');
    assert.strictEqual(JSON.parse(closed.body).dayActive, false);
  });

  it('reactivates a deactivated batch and audits it once per action', async () => {
    const first = seedDriver(db, 'Reactivate A', 'REA-1');
    const second = seedDriver(db, 'Reactivate B', 'REA-2');
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, is_active) VALUES (33000, ?, '04:00', ?, 'fletero', ?, 0)`).run(REACTIVATION_DAY, first, fixtures.admin.id);
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, is_active) VALUES (33001, ?, '04:30', ?, 'fletero', ?, 0)`).run(REACTIVATION_DAY, second, fixtures.admin.id);
    const before = (db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'activate' AND entity_type = 'loading_batch'").get() as { count: number }).count;

    for (const attempt of [1, 2]) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/loading/schedules/batch/${REACTIVATION_DAY}/activate`,
        headers: { authorization: `Bearer ${token}` },
      });
      assert.strictEqual(response.statusCode, 200, `attempt ${attempt}: ${response.body}`);
      assert.deepStrictEqual(JSON.parse(response.body), { success: true });
    }

    assert.strictEqual((db.prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ? AND is_active = 1').get(REACTIVATION_DAY) as { count: number }).count, 2);
    const audits = db.prepare("SELECT details FROM audit_logs WHERE action = 'activate' AND entity_type = 'loading_batch' ORDER BY id").all() as { details: string }[];
    assert.strictEqual(audits.length - before, 2, 'each reactivation leaves one audit line');
    assert.strictEqual(JSON.parse(audits[audits.length - 1].details).scheduleDate, REACTIVATION_DAY);
  });

  it('reactivates a past batch, which the calendar freezes to content edits only', async () => {
    const driverId = seedDriver(db, 'Reactivate Past', 'REP-1');
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, is_active) VALUES (33002, ?, '04:00', ?, 'fletero', ?, 0)`).run(PAST_REACTIVATION_DAY, driverId, fixtures.admin.id);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/loading/schedules/batch/${PAST_REACTIVATION_DAY}/activate`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(response.statusCode, 200, response.body);
    assert.strictEqual((db.prepare('SELECT is_active FROM loading_schedules WHERE id = 33002').get() as { is_active: number }).is_active, 1);
  });

  it('denies reactivation to a worker and answers 404 for a day without rows', async () => {
    const driverId = seedDriver(db, 'Reactivate Denied', 'RED-1');
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, is_active) VALUES (33003, ?, '04:00', ?, 'fletero', ?, 0)`).run(DISCARD_DAY, driverId, fixtures.admin.id);
    const workerToken = await loginAs(app, fixtures.worker.username, fixtures.worker.password);

    const denied = await app.inject({
      method: 'PATCH',
      url: `/api/loading/schedules/batch/${DISCARD_DAY}/activate`,
      headers: { authorization: `Bearer ${workerToken}` },
    });
    assert.strictEqual(denied.statusCode, 403);
    assert.strictEqual((db.prepare('SELECT is_active FROM loading_schedules WHERE id = 33003').get() as { is_active: number }).is_active, 0, 'a denied reactivation leaves the row inactive');

    const missing = await app.inject({
      method: 'PATCH',
      url: `/api/loading/schedules/batch/${dateIn(90)}/activate`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(missing.statusCode, 404);
  });

  it('reactivates a single row by id and answers 400 or 404 for a bad target', async () => {
    const driverId = seedDriver(db, 'Reactivate Row', 'RER-1');
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, is_active) VALUES (33004, ?, '04:00', ?, 'fletero', ?, 0)`).run(REACTIVATION_DAY, driverId, fixtures.admin.id);

    const reactivated = await app.inject({
      method: 'PATCH',
      url: '/api/loading/schedules/33004/activate',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(reactivated.statusCode, 200, reactivated.body);
    assert.strictEqual((db.prepare('SELECT is_active FROM loading_schedules WHERE id = 33004').get() as { is_active: number }).is_active, 1);
    const audit = db.prepare("SELECT entity_id FROM audit_logs WHERE action = 'activate' AND entity_type = 'loading' ORDER BY id DESC").get() as { entity_id: number };
    assert.strictEqual(audit.entity_id, 33004);

    assert.strictEqual((await app.inject({ method: 'PATCH', url: '/api/loading/schedules/nope/activate', headers: { authorization: `Bearer ${token}` } })).statusCode, 400);
    assert.strictEqual((await app.inject({ method: 'PATCH', url: '/api/loading/schedules/99999/activate', headers: { authorization: `Bearer ${token}` } })).statusCode, 404);
  });

});
