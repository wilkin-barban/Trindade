import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { salidaReportDayView } from './salida-report.service.js';

function setupDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  const schemaPath = join(import.meta.dirname, '../../db/schema.sql');
  const seedPath = join(import.meta.dirname, '../../db/seed.sql');
  db.exec(readFileSync(schemaPath, 'utf-8'));
  db.exec(readFileSync(seedPath, 'utf-8'));

  db.exec(`
    INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role_id, is_active)
    VALUES
      (10, 'operador1', 'hash', 'Carlos Silva', 2, 1),
      (11, 'operador2', 'hash', 'Ana Souza', 2, 1)
  `);

  return db;
}

describe('salidaReportDayView', () => {
  let db: Database.Database;

  before(() => {
    db = setupDb();
  });

  after(() => {
    db.close();
  });

  it('returns an empty view for a day with no salidas', () => {
    const view = salidaReportDayView(db, '2026-11-13');
    assert.deepEqual(view, {
      date: '2026-11-13',
      operators: [],
      totalUnits: 0,
      movementCount: 0,
    });
  });

  it('groups movements by operator, sums units, orders operators by name, preserves product names without truncation', () => {
    // Movement 1 by Carlos (user 10)
    db.prepare(`
      INSERT INTO salida_movements (id, movement_date, user_id, created_at)
      VALUES (1, '2026-11-14', 10, '2026-11-14 09:00:00')
    `).run();
    db.prepare(`
      INSERT INTO salida_movement_items (movement_id, product_code, product_name, block, quantity, position)
      VALUES
        (1, '1357', 'EMBALAG. DISCO 200g', 'embalagens', 10, 1),
        (1, '1900', 'BOBINA ROLO', 'bobinas', 5, 2)
    `).run();

    // Movement 2 by Carlos (user 10) - same product 1357 should aggregate
    db.prepare(`
      INSERT INTO salida_movements (id, movement_date, user_id, created_at)
      VALUES (2, '2026-11-14', 10, '2026-11-14 11:00:00')
    `).run();
    db.prepare(`
      INSERT INTO salida_movement_items (movement_id, product_code, product_name, block, quantity, position)
      VALUES
        (2, '1357', 'EMBALAG. DISCO 200g', 'embalagens', 15, 1)
    `).run();

    // Movement 3 by Ana (user 11)
    db.prepare(`
      INSERT INTO salida_movements (id, movement_date, user_id, created_at)
      VALUES (3, '2026-11-14', 11, '2026-11-14 10:00:00')
    `).run();
    db.prepare(`
      INSERT INTO salida_movement_items (movement_id, product_code, product_name, block, quantity, position)
      VALUES
        (3, '1012', 'SORBATO', 'materia-prima', 8, 1)
    `).run();

    const view = salidaReportDayView(db, '2026-11-14');

    assert.equal(view.date, '2026-11-14');
    assert.equal(view.movementCount, 3);
    assert.equal(view.totalUnits, 38); // 10 + 5 + 15 + 8 = 38
    assert.equal(view.operators.length, 2);

    // Ana Souza comes before Carlos Silva (alphabetical order by name)
    const [ana, carlos] = view.operators;

    assert.equal(ana.name, 'Ana Souza');
    assert.equal(ana.username, 'operador2');
    assert.equal(ana.units, 8);
    assert.deepEqual(ana.products, [
      { code: '1012', name: 'SORBATO', block: 'materia-prima', units: 8 },
    ]);

    assert.equal(carlos.name, 'Carlos Silva');
    assert.equal(carlos.username, 'operador1');
    assert.equal(carlos.units, 30);
    assert.deepEqual(carlos.products, [
      { code: '1357', name: 'EMBALAG. DISCO 200g', block: 'embalagens', units: 25 },
      { code: '1900', name: 'BOBINA ROLO', block: 'bobinas', units: 5 },
    ]);
  });
});
