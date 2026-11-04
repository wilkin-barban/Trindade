import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { MASSAS, isMassa } from '../stock/stock.catalog.js';
import { erpCodeKey, movementLenses, supplyReceipts } from '../reports/receipts.service.js';
import type { AeroMovement } from '../integration/aero.movements.service.js';
import { massasReportDayView } from './massas-report.service.js';

/**
 * The line between a massa and a supply is one list of ten codes, and it is drawn once.
 *
 * These are invariants, not examples: whatever the day brings, a seat is a massa when its code is one of the
 * ten the plant produces and a supply otherwise. The description is a label the ERP prints, never the rule --
 * a supply called "MASSA P PIZZA KIT" is still a supply because its code is not one of the ten.
 */
describe('massas vs insumos — one code list, two disjoint lenses', () => {
  /** The ten codes the plant produces, in the order the catalogue declares them. */
  const CANONICAL = ['1045', '39', '60', '84', '91', '1192', '5000', '1047', '22', '1616'];

  /** Codes the plant does not produce, including the ones the audit named and an invented supply. */
  const NOT_MASSAS = ['107', '138', '1591', '1800', '9999'];

  const date = '2026-06-12';
  let db: Database.Database;

  function insertSeat(args: {
    entLan: number;
    code: string;
    description: string;
    quantity: number;
    type?: 'E' | 'S';
  }): void {
    db.prepare(
      `INSERT INTO aero_movements
         (movement_date, ent_lan, product_code, product_desc, quantity, entry_date, operator_name, movement_type, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-06-12T12:00:00.000Z')`,
    ).run(date, args.entLan, args.code, args.description, args.quantity, date, 'Jaime', args.type ?? 'E');
  }

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(readFileSync(join(import.meta.dirname, '../../db/schema.sql'), 'utf8'));
    db.exec(readFileSync(join(import.meta.dirname, '../../db/seed.sql'), 'utf8'));

    // The ten massas, padded the way the ERP sends them, plus one supply for every non-massa code and one
    // supply whose description starts with the word the classification must ignore.
    CANONICAL.forEach((code, index) => {
      insertSeat({
        entLan: 100 + index,
        code: code.padStart(6, '0'),
        description: `MASSA ${code}`,
        quantity: 5,
      });
    });
    NOT_MASSAS.forEach((code, index) => {
      insertSeat({
        entLan: 200 + index,
        code: code.padStart(6, '0'),
        description: `INSUMO ${code}`,
        quantity: 2,
      });
    });
    insertSeat({
      entLan: 300,
      code: '000777',
      description: 'MASSA P PIZZA KIT',
      quantity: 1,
    });
  });

  it('MASSAS holds exactly the ten canonical codes', () => {
    assert.deepEqual(
      MASSAS.map((product) => product.code),
      CANONICAL,
    );
  });

  it('isMassa normalizes the ERP padding and answers only for the ten', () => {
    for (const code of CANONICAL) {
      assert.equal(isMassa(code), true, `${code} is a massa`);
      assert.equal(isMassa(code.padStart(6, '0')), true, `${code} padded is still a massa`);
    }
    for (const code of NOT_MASSAS) {
      assert.equal(isMassa(code), false, `${code} is not a massa`);
      assert.equal(isMassa(code.padStart(6, '0')), false, `${code} padded is still not a massa`);
    }
    assert.equal(isMassa('000777'), false);
  });

  it('every massa code is counted in the massas block only', () => {
    const view = massasReportDayView(db, date);
    const counted = new Set(view.products.filter((product) => product.totalUnits > 0).map((product) => product.code));
    assert.deepEqual([...counted].sort(), [...CANONICAL].sort());

    const receiptCodes = new Set(supplyReceipts(db.prepare('SELECT * FROM aero_movements').all() as AeroMovement[]).map((line) => erpCodeKey(line.productCode)));
    for (const code of CANONICAL) {
      assert.equal(receiptCodes.has(code), false, `${code} must not be a receipt`);
    }
  });

  it('every code outside the ten shows up in insumos only', () => {
    const view = massasReportDayView(db, date);
    const massasCodes = new Set(view.products.map((product) => product.code));
    const receipts = supplyReceipts(db.prepare('SELECT * FROM aero_movements').all() as AeroMovement[]);

    for (const code of NOT_MASSAS) {
      assert.equal(massasCodes.has(code), false, `${code} must not be a massa`);
      assert.ok(
        receipts.some((line) => erpCodeKey(line.productCode) === code),
        `${code} must be a receipt`,
      );
    }
  });

  it('a description that starts with MASSA P PIZZA does not make a code a massa', () => {
    const view = massasReportDayView(db, date);
    const massasCodes = new Set(view.products.map((product) => product.code));
    assert.equal(massasCodes.has('777'), false);

    const receipts = supplyReceipts(db.prepare('SELECT * FROM aero_movements').all() as AeroMovement[]);
    const pizzaKit = receipts.find((line) => erpCodeKey(line.productCode) === '777');
    assert.equal(pizzaKit?.productDesc, 'MASSA P PIZZA KIT');
  });

  it('the two lenses do not intersect and together cover every entry seat', () => {
    const movements = db.prepare('SELECT * FROM aero_movements').all() as AeroMovement[];
    const entries = movements.filter((movement) => movement.movement_type === 'E');

    const massas = new Set<string>();
    const insumos = new Set<string>();
    for (const movement of entries) {
      if (isMassa(movement.product_code)) massas.add(erpCodeKey(movement.product_code));
      else insumos.add(erpCodeKey(movement.product_code));
    }

    const intersection = [...massas].filter((code) => insumos.has(code));
    assert.deepEqual(intersection, []);
    assert.equal(massas.size + insumos.size, 16, 'ten massas and six supplies cover the day');

    const lenses = movementLenses(entries);
    assert.deepEqual(lenses, { massas: 10, insumos: 6 });
  });
});
