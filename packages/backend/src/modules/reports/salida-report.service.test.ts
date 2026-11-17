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
  it('adds the exits the company recorded that Trindade never saw, marked as such', () => {
    // The company's book is not Trindade's: an exit typed in the ERP, or posted before this module, exists only
    // there. The report states the day, so it has to show it -- and mark it, because nobody launched it here.
    db.exec('DELETE FROM salida_movement_items');
    db.exec('DELETE FROM salida_movements');
    db.exec('DELETE FROM aero_movements');
    db.exec(`
      INSERT INTO salida_movements (id, movement_date, user_id, created_at)
      VALUES (9201, '2026-11-18', 10, '2026-11-18T09:00:00.000Z')
    `);
    db.exec(`
      INSERT INTO salida_movement_items (movement_id, product_code, product_name, block, quantity, position)
      VALUES (9201, '1357', 'EMBALAG. DISCO 200g', 'embalagens', 20, 0)
    `);
    db.exec(`
      INSERT INTO aero_movements
        (movement_date, ent_lan, product_code, product_desc, quantity, entry_date, operator_name, movement_type, synced_at)
      VALUES
        -- the same exit Trindade already counted, written the way the ERP writes it (padding, upper case)
        ('2026-11-18', 5001, '001357', 'EMBALAG. DISCO 200g', 20, '2026-11-18', 'OPERADOR1', 'S', '2026-11-18T10:00:00.000Z'),
        -- an exit the company recorded at the counter, with no launch here
        ('2026-11-18', 5002, '001900', 'BOBINA ROLO', 13, '2026-11-18', 'JOSIANE', 'S', '2026-11-18T10:05:00.000Z')
    `);

    const day = salidaReportDayView(db, '2026-11-18');

    const local = day.operators.find((operator) => !operator.erpOnly);
    assert.ok(local, 'the launch Trindade recorded is still there');
    assert.equal(local!.units, 20, 'the matching seat did not count the same exit twice');

    const fromErp = day.operators.find((operator) => operator.username === 'JOSIANE');
    assert.ok(fromErp, 'the seat nobody launched here appears');
    assert.equal(fromErp!.erpOnly, true, 'and it says where it comes from');
    assert.equal(fromErp!.products[0].units, 13);

    assert.equal(day.totalUnits, 33, 'the day is the sum of both sides, each exit once');
  });

});
