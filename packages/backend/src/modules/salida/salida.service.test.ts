import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { REFERENCE_DATASET, verifyReferencePrerequisites } from '../../db/reference-data.js';
import {
  MAX_SALIDA_PHOTOS,
  DEFAULT_SALIDA_PHOTO_RETENTION_DAYS,
  cleanupExpiredSalidaPhotos,
  countSalidaPhotos,
  createSalidaMovement,
  deleteSalidaPhoto,
  getSalidaPhotoById,
  getSalidaPhotoByPublicToken,
  listSalidaMovements,
  recordSalidaErpResult,
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

  describe('ERP verdict and transmission state', () => {
    it('sets erp to null on newly launched movement', () => {
      const movement = createSalidaMovement(db, {
        items: [{ code: '1474', quantity: 10 }],
        userId,
      });
      assert.equal(movement.erp, null);
    });

    it('records erp result with sent status', () => {
      const movement = createSalidaMovement(db, {
        items: [{ code: '1474', quantity: 5 }],
        userId,
      });
      const updated = recordSalidaErpResult(db, {
        movementId: movement.id,
        status: 'sent',
      });
      assert.ok(updated);
      assert.equal(updated.erp?.status, 'sent');
      assert.equal(updated.erp?.message, null);
      assert.ok(updated.erp?.sentAt);
    });

    it('records erp result with failed status and message', () => {
      const movement = createSalidaMovement(db, {
        items: [{ code: '1474', quantity: 5 }],
        userId,
      });
      const updated = recordSalidaErpResult(db, {
        movementId: movement.id,
        status: 'failed',
        message: 'AERO_BRIDGE_UNREADABLE',
      });
      assert.ok(updated);
      assert.equal(updated.erp?.status, 'failed');
      assert.equal(updated.erp?.message, 'AERO_BRIDGE_UNREADABLE');
      assert.ok(updated.erp?.sentAt);
    });

    it('overwrites the verdict on relaunch (idempotent)', () => {
      const movement = createSalidaMovement(db, {
        items: [{ code: '1474', quantity: 5 }],
        userId,
      });
      recordSalidaErpResult(db, {
        movementId: movement.id,
        status: 'failed',
        message: 'Network error',
      });
      const relaunched = recordSalidaErpResult(db, {
        movementId: movement.id,
        status: 'sent',
      });
      assert.ok(relaunched);
      assert.equal(relaunched.erp?.status, 'sent');
      assert.equal(relaunched.erp?.message, null);
    });

    it('returns null for an unknown movement id', () => {
      const result = recordSalidaErpResult(db, {
        movementId: 999999,
        status: 'sent',
      });
      assert.equal(result, null);
    });

    it('maps erp state in listSalidaMovements and salidaHistory', () => {
      const movement = createSalidaMovement(db, {
        items: [{ code: '1474', quantity: 3 }],
        userId,
        date: '2026-11-17',
      });
      recordSalidaErpResult(db, {
        movementId: movement.id,
        status: 'partial',
        message: 'partial sync',
      });

      const list = listSalidaMovements(db, { date: '2026-11-17' });
      const foundInList = list.find((m) => m.id === movement.id);
      assert.equal(foundInList?.erp?.status, 'partial');
      assert.equal(foundInList?.erp?.message, 'partial sync');

      const history = salidaHistory(db);
      const day = history.find((d) => d.date === '2026-11-17');
      const foundInHistory = day?.movements.find((m) => m.id === movement.id);
      assert.equal(foundInHistory?.erp?.status, 'partial');
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

    /**
     * A photo written `daysAgo` days back, with its bytes on disk in a directory of its own.
     *
     * The row is inserted directly because the age is the point: `saveSalidaPhoto` always stamps the present, and a
     * cleanup test that cannot go back in time can only assert that nothing ever happens.
     */
    const storePhoto = (daysAgo: number) => {
      const photosDir = join(tmpdir(), `trindade-salida-retention-${process.pid}-${daysAgo}-${Math.random()}`);
      mkdirSync(photosDir, { recursive: true });
      const movement = createSalidaMovement(db, {
        items: [{ code: '1900', quantity: 1 }],
        userId,
        date: '2026-09-01',
      });
      const storedName = `retention-${daysAgo}.jpg`;
      const filePath = join(photosDir, storedName);
      writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
      const inserted = db
        .prepare(
          `INSERT INTO salida_photos (movement_id, file_path, file_size, mime_type, public_token, created_at)
           VALUES (?, ?, ?, 'image/jpeg', ?, ?)`,
        )
        .run(movement.id, storedName, 4, `token-${Math.random()}`, createdAt);
      return { photoId: Number(inserted.lastInsertRowid), filePath, photosDir };
    };

    it('deletes a photo older than the window: row and file', () => {
      assert.equal(DEFAULT_SALIDA_PHOTO_RETENTION_DAYS, 90);
      const expired = storePhoto(DEFAULT_SALIDA_PHOTO_RETENTION_DAYS + 1);

      const cleanup = cleanupExpiredSalidaPhotos(db, expired.photosDir);

      assert.equal(cleanup.deleted, 1);
      assert.equal(cleanup.errors, 0);
      assert.equal(getSalidaPhotoById(db, expired.photoId), null);
      assert.equal(existsSync(expired.filePath), false);
    });

    it('leaves a photo inside the window untouched', () => {
      const fresh = storePhoto(DEFAULT_SALIDA_PHOTO_RETENTION_DAYS - 1);

      const cleanup = cleanupExpiredSalidaPhotos(db, fresh.photosDir);

      assert.equal(cleanup.deleted, 0);
      assert.equal(cleanup.errors, 0);
      assert.ok(getSalidaPhotoById(db, fresh.photoId));
      assert.equal(existsSync(fresh.filePath), true);
    });

    it('refuses a stored path that would escape the photos directory', () => {
      // The routes write a bare UUID name, but the row is data: a `..` in it would make the cleanup unlink a file the
      // module does not own. The row stays and the file outside is untouched, so a human can look at it.
      const expired = storePhoto(DEFAULT_SALIDA_PHOTO_RETENTION_DAYS + 1);
      const outside = join(expired.photosDir, '..', `escape-${Math.random()}.jpg`);
      writeFileSync(outside, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      const escaping = db
        .prepare(
          `INSERT INTO salida_photos (movement_id, file_path, file_size, mime_type, public_token, created_at)
           SELECT movement_id, ?, 4, 'image/jpeg', 'escape-token', created_at FROM salida_photos WHERE id = ?`,
        )
        .run(`../${outside.split('/').pop()}`, expired.photoId);

      const cleanup = cleanupExpiredSalidaPhotos(db, expired.photosDir);

      assert.equal(cleanup.errors, 1);
      assert.ok(getSalidaPhotoById(db, Number(escaping.lastInsertRowid)), 'the escaping row must survive');
      assert.equal(existsSync(outside), true, 'a file outside the photos directory must not be deleted');

      // The row survives by design, so the test removes its own fixture: this file shares one database, and a
      // surviving row would make the next cleanup look like it failed.
      db.prepare('DELETE FROM salida_photos WHERE id = ?').run(Number(escaping.lastInsertRowid));
    });

    it('is idempotent: a second run finds nothing left to delete', () => {
      const expired = storePhoto(DEFAULT_SALIDA_PHOTO_RETENTION_DAYS + 5);

      const first = cleanupExpiredSalidaPhotos(db, expired.photosDir);
      const second = cleanupExpiredSalidaPhotos(db, expired.photosDir);

      assert.deepEqual(first, { deleted: 1, errors: 0 });
      assert.deepEqual(second, { deleted: 0, errors: 0 });
      assert.equal(getSalidaPhotoById(db, expired.photoId), null);
      assert.equal(existsSync(expired.filePath), false);
    });
  });
});
