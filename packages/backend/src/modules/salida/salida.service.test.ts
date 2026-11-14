import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { REFERENCE_DATASET, verifyReferencePrerequisites } from '../../db/reference-data.js';
import {
  MAX_SALIDA_PHOTOS,
  countSalidaPhotos,
  createSalidaMovement,
  deleteSalidaPhoto,
  getSalidaPhotoById,
  getSalidaPhotoByPublicToken,
  listSalidaMovements,
  salidaHistory,
  saveSalidaPhoto,
} from './salida.service.js';
import {
  SALIDA_BLOCKS,
  SALIDA_PRODUCTS,
  MAX_SALIDA_ITEMS,
  findSalidaProduct,
  salidaErpProductCode,
} from './salida.catalog.js';

/**
 * The salida rules below the wire: the catalogue's invariants, the launch's transaction, the reconciliation
 * against real ERP seats, and the photo bookkeeping.
 *
 * The HTTP suite pins who may call and what a refusal looks like; this one pins what the module stores and
 * what it never rewrites. The seats are written straight into the mirror because that is the only place they
 * come from: the company's ERP, read by `/movimentoitem`.
 */
describe('salida service', () => {
  let db: Database.Database;
  let userId: number;

  const insertSeat = (seat: {
    movement_date: string;
    ent_lan: number;
    product_code: string;
    quantity: number;
    operator_name: string;
    movement_type: 'E' | 'S';
  }) =>
    db
      .prepare(
        `INSERT INTO aero_movements
           (movement_date, ent_lan, product_code, product_desc, quantity, entry_date, operator_name, movement_type, synced_at)
         VALUES (?, ?, ?, 'PRODUCT', ?, ?, ?, ?, ?)`,
      )
      .run(
        seat.movement_date,
        seat.ent_lan,
        seat.product_code,
        seat.quantity,
        seat.movement_date,
        seat.operator_name,
        seat.movement_type,
        new Date().toISOString(),
      );

  before(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(readFileSync(join(import.meta.dirname, '../../db/schema.sql'), 'utf8'));
    db.exec(readFileSync(join(import.meta.dirname, '../../db/seed.sql'), 'utf8'));
    verifyReferencePrerequisites(db);

    const inserted = db
      .prepare(
        'INSERT INTO users (username, password_hash, display_name, role_id, is_active) VALUES (?, ?, ?, ?, 1)',
      )
      .run(
        'wilkin',
        await bcrypt.hash('wilkin-pass', 4),
        'Wilkin Admin',
        REFERENCE_DATASET.roles.find((role) => role.name === 'Administrador')!.id,
      );
    userId = Number(inserted.lastInsertRowid);
  });

  after(() => db.close());

  describe('the fixed catalogue', () => {
    it('holds exactly 21 products, 13/3/5 per block, and is at most one movement long', () => {
      assert.equal(SALIDA_PRODUCTS.length, 21);
      assert.equal(MAX_SALIDA_ITEMS, 21);
      assert.deepEqual(
        SALIDA_BLOCKS.map((block) => SALIDA_PRODUCTS.filter((product) => product.block === block).length),
        [13, 3, 5],
      );
      assert.equal(new Set(SALIDA_PRODUCTS.map((product) => product.code)).size, 21);
    });

    it('leaves 1040 out and lists 1673 once', () => {
      assert.equal(findSalidaProduct('1040'), undefined);
      assert.equal(SALIDA_PRODUCTS.filter((product) => product.code === '1673').length, 1);
      assert.equal(findSalidaProduct('1673')?.name, 'GORDURA VEGETAL');
    });

    it('widens a code to the six digits the ERP writes', () => {
      assert.equal(salidaErpProductCode('1474'), '001474');
      assert.equal(salidaErpProductCode('1673'), '001673');
      assert.equal(salidaErpProductCode('001474'), '001474');
    });
  });

  describe('launching', () => {
    it('stores the header and its items in one transaction and reads them back ordered', () => {
      const movement = createSalidaMovement(db, {
        items: [
          { code: '1474', quantity: 20 },
          { code: '1012', quantity: 6 },
        ],
        userId,
        date: '2026-11-01',
      });

      assert.equal(movement.movement_date, '2026-11-01');
      assert.equal(movement.username, 'wilkin');
      assert.deepEqual(
        movement.items.map((item) => [item.product_code, item.position, item.quantity]),
        [
          ['1474', 0, 20],
          ['1012', 1, 6],
        ],
      );
      assert.equal(movement.total_units, 26);
      assert.deepEqual(movement.photos, []);
      assert.equal(movement.reconciliation.status, 'pending');
    });

    it('leaves no header behind when an item cannot be written', () => {
      const before = db.prepare('SELECT COUNT(*) AS n FROM salida_movements').pluck().get() as number;

      assert.throws(() =>
        createSalidaMovement(db, {
          items: [
            { code: '1474', quantity: 1 },
            // Not in the catalogue: the second insert fails, so the whole launch has to roll back.
            { code: '9999', quantity: 1 },
          ],
          userId,
          date: '2026-11-02',
        }),
      );

      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM salida_movements').pluck().get(), before);
      assert.equal(
        db.prepare('SELECT COUNT(*) AS n FROM salida_movement_items WHERE product_code = ?').pluck().get('1474'),
        1,
      );
    });
  });

  describe('reconciliation against the ERP seats', () => {
    it('settles a movement whose items the plant recorded as exits', () => {
      const movement = createSalidaMovement(db, {
        items: [
          { code: '1357', quantity: 12 },
          { code: '1356', quantity: 8 },
        ],
        userId,
        date: '2026-11-03',
      });

      // The ERP pads the code to six digits and writes the operator's name as typed on the tablet.
      insertSeat({ movement_date: '2026-11-03', ent_lan: 9001, product_code: '001357', quantity: 12, operator_name: 'wilkin', movement_type: 'S' });
      insertSeat({ movement_date: '2026-11-03', ent_lan: 9002, product_code: '001356', quantity: 8, operator_name: 'WILKIN', movement_type: 'S' });
      // A supplies entry of the same day never settles a baixa.
      insertSeat({ movement_date: '2026-11-03', ent_lan: 9003, product_code: '001357', quantity: 12, operator_name: 'wilkin', movement_type: 'E' });

      const [read] = listSalidaMovements(db, { date: '2026-11-03' });
      assert.equal(read.id, movement.id);
      assert.equal(read.reconciliation.status, 'reconciled');
      assert.deepEqual(read.reconciliation.ent_lans, [9001, 9002]);
      assert.deepEqual(
        read.reconciliation.matched_item_ids,
        read.items.map((item) => item.id),
      );
    });

    it('stays pending while the ERP has no exit for the day', () => {
      createSalidaMovement(db, { items: [{ code: '1898', quantity: 2 }], userId, date: '2026-11-04' });
      const [read] = listSalidaMovements(db, { date: '2026-11-04' });
      assert.equal(read.reconciliation.status, 'pending');
      assert.deepEqual(read.reconciliation.ent_lans, []);
    });
  });

  describe('the history', () => {
    it('lists days newest first with their total units, and never rewrites one', () => {
      const snapshot = () =>
        JSON.stringify({
          movements: db.prepare('SELECT * FROM salida_movements ORDER BY id').all(),
          items: db.prepare('SELECT * FROM salida_movement_items ORDER BY id').all(),
        });

      const beforeRead = snapshot();
      const days = salidaHistory(db);
      assert.equal(snapshot(), beforeRead);

      const dates = days.map((day) => day.date);
      assert.deepEqual(dates, [...dates].sort().reverse());
      const first = days.find((day) => day.date === '2026-11-03')!;
      assert.equal(first.total_units, 20);
      assert.equal(first.movements.length, 1);
    });
  });

  describe('photos', () => {
    it('keeps three per movement and mints a token the public route can use', () => {
      assert.equal(MAX_SALIDA_PHOTOS, 3);
      const movement = createSalidaMovement(db, { items: [{ code: '1900', quantity: 1 }], userId, date: '2026-11-05' });

      const saved = [0, 1, 2].map((index) =>
        saveSalidaPhoto(db, {
          movementId: movement.id,
          filePath: `photo-${index}.jpg`,
          fileSize: 128,
          mimeType: 'image/jpeg',
          publicBaseUrl: 'https://example.test',
        }),
      );

      assert.equal(countSalidaPhotos(db, movement.id), 3);
      assert.equal(saved[0].url, `/api/salida/photos/${saved[0].id}`);
      assert.ok(saved[0].publicUrl.startsWith('https://example.test/api/salida/photos/public/'));

      const stored = getSalidaPhotoById(db, saved[0].id);
      assert.ok(stored);
      assert.equal(stored.file_path, 'photo-0.jpg');
      assert.deepEqual(getSalidaPhotoByPublicToken(db, stored.public_token!), stored);

      const removed = deleteSalidaPhoto(db, saved[0].id);
      assert.equal(removed?.id, saved[0].id);
      assert.equal(countSalidaPhotos(db, movement.id), 2);
      assert.equal(getSalidaPhotoById(db, saved[0].id), null);
      assert.equal(deleteSalidaPhoto(db, saved[0].id), null);
    });
  });
});
