import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

import { buildLoadingTestApp, type TestFixtures } from './loading-test-helper.js';
import { getSaoPauloDateString } from '../../utils/date.js';

/**
 * A São Paulo date shifted by whole days.
 *
 * These fixtures used to name fixed 2026 dates, and the export layout they assert depends on the
 * weekday. Once a past day became read-only, the writes had to move to days the plant can still
 * accept, so each fixture now computes its own day and the expected weekday text from the same value.
 */
function shift(date: string, days: number): string {
  const anchor = new Date(`${date}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

function dateIn(days: number): string {
  return shift(getSaoPauloDateString(), days);
}

/** The next future date that falls on `weekday` (0 = Sunday), never today. */
function nextWeekday(weekday: number): string {
  const today = getSaoPauloDateString();
  const delta = (weekday - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7 || 7;
  return shift(today, delta);
}

function ptWeekday(date: string): string {
  const name = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function ptDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

const WEDNESDAY = nextWeekday(3);
const FRIDAY = nextWeekday(5);

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

  it('GET /export returns the next-day PT-BR WhatsApp layout, casa vehicle plate, and total count', async () => {
    const casaDriverId = seedDriver(db, 'Edinaldo', 'DRV-CASA', 'casa');
    const fleteroDriverId = seedDriver(db, 'Diego', 'DRV-FLET', 'fletero');

    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: WEDNESDAY,
        time_slot: '05:00',
        driver_type: 'casa',
        driver_id: casaDriverId,
        vehicle_id: vehicleId,
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: WEDNESDAY,
        time_slot: '04:00',
        driver_type: 'fletero',
        driver_id: fleteroDriverId,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/loading/export?date=${WEDNESDAY}`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const text: string = JSON.parse(res.body).text;

    assert.ok(text.startsWith('🚛 *CRONOGRAMA DE CARREGAMENTO*'));
    assert.ok(text.includes(`📅 ${ptWeekday(shift(WEDNESDAY, 1))} • ${ptDate(shift(WEDNESDAY, 1))}`));
    assert.ok(text.includes('━━━━━━━━━━━━━━'));
    assert.ok(text.includes('🕓 04:00  │ Diego'));
    const vehiclePlate = (db.prepare('SELECT license_plate FROM vehicles WHERE id = ?').get(vehicleId) as { license_plate: string }).license_plate;
    assert.ok(text.includes(`🕔 05:00  │ Edinaldo 🚚 ${vehiclePlate}`));
    assert.ok(text.includes('📌 Total de carregamentos: *2*'));
    assert.ok(text.includes('✅ Bom trabalho a todos!'));
    assert.ok(text.includes('🏭 Trindade Massas — Sistema de Carregamento'));
    assert.ok(text.indexOf('04:00') < text.indexOf('05:00'), '04:00 should appear before 05:00');
  });

  it('GET /export returns no-loadings message for empty schedule', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/loading/export?date=${dateIn(40)}`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.text.includes('Nenhum carregamento agendado'));
  });

  it('GET /export validates date format and returns 400 on bad input', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/loading/export?date=not-a-date',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(res.statusCode, 400);
  });

  it('GET /export fails explicitly when a required loading reference is missing', async () => {
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, vehicle_id, driver_type, user_id) VALUES (9990, ?, '04:00', 9999, NULL, 'fletero', ?)").run(dateIn(41), fixtures.admin.id);
    const response = await app.inject({ method: 'GET', url: `/api/loading/export?date=${dateIn(41)}`, headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.statusCode, 500);
    db.prepare('DELETE FROM loading_schedules WHERE id = 9990').run();
    db.pragma('foreign_keys = ON');
  });

  // ---- Input Validation ----

  it('GET /schedules/history returns one batch item with total count and creator flags', async () => {
    const d1 = seedDriver(db, 'History Driver A', 'HIS-1');
    const d2 = seedDriver(db, 'History Driver B', 'HIS-2');
    const historyDay = dateIn(20);
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, created_at) VALUES (9201, ?, '04:00', ?, 'fletero', 1, datetime('now', '-30 minutes'))`).run(historyDay, d1);
    db.prepare(`INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, created_at) VALUES (9202, ?, '04:30', ?, 'fletero', NULL, datetime('now', '-25 minutes'))`).run(historyDay, d2);

    const res = await app.inject({ method: 'GET', url: `/api/loading/schedules/history?date=${historyDay}`, headers: { authorization: `Bearer ${token}` } });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.pagination.total, 1);
    assert.strictEqual(body.items.length, 1);
    assert.strictEqual(body.items[0].batch_date, historyDay);
    assert.strictEqual(body.items[0].loading_date, shift(historyDay, 1));
    assert.strictEqual(body.items[0].total_loadings, 2);
    assert.strictEqual(body.items[0].creator.id, 1);
    assert.strictEqual(body.items[0].canEdit, true);
  });

  it('GET /schedules/history paginates batches and combines month/user filters', async () => {
    const insertDriver = db.prepare(`INSERT INTO drivers (id, name, license_plate, driver_type, is_active) VALUES (?, ?, ?, 'fletero', 1)`);
    const insertSchedule = db.prepare(`
      INSERT INTO loading_schedules (id, schedule_date, time_slot, driver_id, driver_type, user_id, created_at)
      VALUES (?, ?, ?, ?, 'fletero', ?, ?)
    `);

    for (let i = 0; i < 35; i += 1) {
      const day = String(i + 1).padStart(2, '0');
      const driverId = 31000 + i;
      insertDriver.run(driverId, `History Page Driver ${i}`, `HPD-${i}`);
      insertSchedule.run(31000 + i, `2026-04-${day}`, '04:00', driverId, 1, `2026-04-${day} 08:00:00`);
    }
    for (let i = 0; i < 5; i += 1) {
      const otherUserDriverId = 31100 + i;
      const otherMonthDriverId = 31200 + i;
      insertDriver.run(otherUserDriverId, `Other User Driver ${i}`, `OUD-${i}`);
      insertDriver.run(otherMonthDriverId, `Other Month Driver ${i}`, `OMD-${i}`);
      insertSchedule.run(31100 + i, `2026-04-${String(i + 1).padStart(2, '0')}`, '05:00', otherUserDriverId, 2, `2026-04-20 09:${String(i).padStart(2, '0')}:00`);
      insertSchedule.run(31200 + i, `2026-05-${String(i + 1).padStart(2, '0')}`, '06:00', otherMonthDriverId, 1, `2026-05-20 09:${String(i).padStart(2, '0')}:00`);
    }

    const firstPage = await app.inject({
      method: 'GET',
      url: '/api/loading/schedules/history?month=2026-04&userId=1&page=1&pageSize=30',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(firstPage.statusCode, 200);
    const pageOne = JSON.parse(firstPage.body);
    assert.strictEqual(pageOne.pagination.total, 35);
    assert.strictEqual(pageOne.pagination.totalPages, 2);
    assert.strictEqual(pageOne.items.length, 30);
    assert.ok(pageOne.items.every((item: any) => item.creator?.id === 1));
    assert.ok(pageOne.items.every((item: any) => item.batch_date.startsWith('2026-04')));

    const secondPage = await app.inject({
      method: 'GET',
      url: '/api/loading/schedules/history?month=2026-04&userId=1&page=2&pageSize=30',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(secondPage.statusCode, 200);
    const pageTwo = JSON.parse(secondPage.body);
    assert.strictEqual(pageTwo.items.length, 5);
    assert.deepStrictEqual(pageTwo.items.map((item: any) => item.batch_date), ['2026-04-05', '2026-04-04', '2026-04-03', '2026-04-02', '2026-04-01']);
  });

  it('GET /export for Friday schedule shifts date to next Monday and includes creator display_name', async () => {
    const driverId = seedDriver(db, 'Casa Driver Fri', undefined, 'casa');

    // A Friday: its export is dated the next Monday.
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: FRIDAY,
        time_slot: '04:00',
        driver_type: 'casa',
        driver_id: driverId,
        vehicle_id: vehicleId,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/loading/export?date=${FRIDAY}`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const text: string = JSON.parse(res.body).text;

    // A Friday export is dated the following Monday.
    assert.ok(text.includes(`📅 ${ptWeekday(shift(FRIDAY, 3))} • ${ptDate(shift(FRIDAY, 3))}`));
    // Should display the responsible name
    assert.ok(text.includes('👤 *Responsável:* '));
  });

  it('GET /schedules/history for Friday schedule keeps Friday date as loading_date', async () => {
    const driverId = seedDriver(db, 'Casa Driver Fri 2', undefined, 'casa');

    // A Friday schedule keeps its own date, instead of jumping to Saturday.
    await app.inject({
      method: 'POST',
      url: '/api/loading/schedules',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schedule_date: FRIDAY,
        time_slot: '04:00',
        driver_type: 'casa',
        driver_id: driverId,
        vehicle_id: vehicleId,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/loading/schedules/history?date=${FRIDAY}`,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.items[0].batch_date, FRIDAY);
    // loading_date in history must be Friday itself instead of Saturday
    assert.strictEqual(body.items[0].loading_date, FRIDAY);
  });

});
