import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

import { buildTestApp } from '../../test-helper.js';
import { getSaoPauloDateString } from '../../utils/date.js';
import { saveAeroMovements } from './aero.movements.service.js';

/** A São Paulo date shifted by whole days, anchored at midday so a shift never crosses two boundaries. */
function dateIn(days: number): string {
  const anchor = new Date(`${getSaoPauloDateString()}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

const TODAY = dateIn(0);
const TOMORROW = dateIn(1);

const SEAT = {
  ent_lan: 10542,
  product_code: '001192',
  product_desc: 'MASSA QUADRADA',
  quantity: 90,
  entry_date: TODAY,
  operator_name: 'WILKIN',
  movement_type: 'E' as const,
};

describe('Aero movements storage', () => {
  let app: FastifyInstance;
  let db: Database.Database;

  before(async () => {
    ({ app, db } = await buildTestApp());
  });

  after(async () => {
    await app.close();
    db.close();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM aero_movements').run();
  });

  it('refuses a snapshot dated before today and writes nothing', () => {
    const refused = saveAeroMovements(db, { date: dateIn(-1), movements: [SEAT] });

    assert.deepEqual(refused, {
      code: 'MASSAS_HISTORY_FROZEN',
      error: 'O histórico de massas é somente leitura: dias passados não podem ser alterados',
    });
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM aero_movements').get() as { count: number }).count, 0);
  });

  it('still writes today, which is the day the plant is working on', () => {
    const saved = saveAeroMovements(db, { date: TODAY, movements: [SEAT] });

    assert.equal(saved, 1);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM aero_movements').get() as { count: number }).count, 1);
  });

  it('accepts tomorrow: only days the plant already closed are frozen', () => {
    const saved = saveAeroMovements(db, { date: TOMORROW, movements: [SEAT] });

    assert.equal(saved, 1);
  });
});
