import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

import { buildTestApp } from '../../test-helper.js';
import { getSaoPauloDateString } from '../../utils/date.js';
import { listAeroMovements, saveAeroMovements } from './aero.movements.service.js';

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

  it('repairs mojibake product_desc and operator_name on ingest and when listing pre-existing rows', () => {
    db.prepare(
      `INSERT INTO aero_movements
         (movement_date, ent_lan, product_code, product_desc, quantity, entry_date, operator_name, movement_type, synced_at)
       VALUES (?, 90001, '001074', 'AĂ\u0087UCAR 5 KG', 162, ?, 'JOĂ\u0083O', 'E', '2026-11-26T10:00:00.000Z')`,
    ).run(TODAY, TODAY);

    const saved = saveAeroMovements(db, {
      date: TODAY,
      movements: [
        {
          ent_lan: 90002,
          product_code: '001236',
          product_desc: '320 G PĂO DE ALHO TR',
          quantity: 20,
          entry_date: TODAY,
          operator_name: 'SĂ\u0089RGIO',
          movement_type: 'E',
        },
        {
          ent_lan: 90003,
          product_code: '001074',
          product_desc: 'AÃ\u0087UCAR 5 KG',
          quantity: 5,
          entry_date: TODAY,
          operator_name: 'AÃ‡UCAR',
          movement_type: 'S',
        },
      ],
    });
    assert.equal(saved, 2);

    const listed = listAeroMovements(db, TODAY);
    assert.deepEqual(
      listed.map((row) => [row.ent_lan, row.product_desc, row.operator_name]),
      [
        [90001, 'AÇUCAR 5 KG', 'JOÃO'],
        [90002, '320 G PÃO DE ALHO TR', 'SÉRGIO'],
        [90003, 'AÇUCAR 5 KG', 'AÇUCAR'],
      ],
    );

    const stored = db
      .prepare('SELECT ent_lan, product_desc, operator_name FROM aero_movements WHERE movement_date = ? AND ent_lan = 90002')
      .get(TODAY) as { ent_lan: number; product_desc: string; operator_name: string };
    assert.equal(stored.product_desc, '320 G PÃO DE ALHO TR');
    assert.equal(stored.operator_name, 'SÉRGIO');
  });
});
