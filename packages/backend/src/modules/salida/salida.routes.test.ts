import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { buildTestApp, type TestFixtures } from '../../test-helper.js';
import { REFERENCE_DATASET } from '../../db/reference-data.js';
import { GUEST_USERNAME } from '../../guest-user.js';
import { getSaoPauloDateString } from '../../utils/date.js';

/**
 * The salida (baixa) endpoints over http.
 *
 * The rule of this module is a permission, not an arithmetic: the beta belongs to one account, and every
 * route that reads or writes a movement has to answer 403 to everybody else and 401 to nobody signed in.
 * What is asserted here is that boundary, the shape of the answer, and the photo edge — three, 5 MB, JPEG,
 * PNG or WebP by magic bytes and not by what the browser declares.
 */
describe('salida routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let db: Awaited<ReturnType<typeof buildTestApp>>['db'];
  let photosDir: string;
  let fixtures: TestFixtures;
  let wilkinToken: string;
  let workerToken: string;
  let guestToken: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const wilkin = () => auth(wilkinToken);

  const fakeJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
  ]);

  function multipartBody(mimeType: string, data: Buffer): { body: Buffer; boundary: string } {
    const boundary = `----SalidaBoundary${randomUUID()}`;
    const CRLF = '\r\n';
    return {
      body: Buffer.concat([
        Buffer.from(`--${boundary}${CRLF}`),
        Buffer.from(`Content-Disposition: form-data; name="file"; filename="photo.bin"${CRLF}`),
        Buffer.from(`Content-Type: ${mimeType}${CRLF}${CRLF}`),
        data,
        Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
      ]),
      boundary,
    };
  }

  async function launch(items: { code: string; quantity: number }[], token = wilkinToken) {
    return app.inject({
      method: 'POST',
      url: '/api/salida',
      headers: auth(token),
      payload: { items },
    });
  }

  async function launchOne(code = '1474', quantity = 10): Promise<number> {
    const response = await launch([{ code, quantity }]);
    assert.equal(response.statusCode, 201, response.body);
    return JSON.parse(response.body).movement.id as number;
  }

  async function uploadPhoto(movementId: number, mimeType = 'image/jpeg', data = fakeJpeg) {
    const { body, boundary } = multipartBody(mimeType, data);
    return app.inject({
      method: 'POST',
      url: `/api/salida/${movementId}/photos`,
      headers: { ...wilkin(), 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
  }

  before(async () => {
    const built = await buildTestApp();
    app = built.app;
    db = built.db;
    photosDir = built.photosDir;
    fixtures = built.fixtures;

    // El usuario de la beta se crea acá y no en el ayudante compartido: una fila más en `users` movería
    // los conteos de los tests que ya existen.
    const adminRoleId = REFERENCE_DATASET.roles.find((role) => role.name === 'Administrador')!.id;
    const inserted = db
      .prepare(
        `INSERT INTO users (username, password_hash, display_name, role_id, is_active, security_version)
         VALUES (?, ?, ?, ?, 1, 1)`,
      )
      .run('wilkin', await bcrypt.hash('wilkin-pass', 4), 'Wilkin Admin', adminRoleId);
    const wilkinId = Number(inserted.lastInsertRowid);

    const sign = (sub: number, username: string, role: string) =>
      jwt.sign({ sub, username, role, security_version: 1 }, fixtures.jwtSecret);

    wilkinToken = sign(wilkinId, 'wilkin', 'Administrador');
    workerToken = sign(fixtures.worker.id, fixtures.worker.username, 'Trabalhador');
    guestToken = sign(
      (db.prepare('SELECT id FROM users WHERE username = ?').get(GUEST_USERNAME) as { id: number }).id,
      GUEST_USERNAME,
      'Trabalhador',
    );
  });

  after(async () => {
    await app.close();
    db.close();
  });

  describe('catalog', () => {
    it('serves the fixed 21 products in the S1 order, split 13/3/5', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/salida/catalog', headers: wilkin() });
      assert.equal(response.statusCode, 200, response.body);

      const { products } = JSON.parse(response.body) as {
        products: { code: string; name: string; block: string }[];
      };
      assert.equal(products.length, 21);
      assert.deepEqual(
        {
          embalagens: products.filter((p) => p.block === 'embalagens').length,
          bobinas: products.filter((p) => p.block === 'bobinas').length,
          'materia-prima': products.filter((p) => p.block === 'materia-prima').length,
        },
        { embalagens: 13, bobinas: 3, 'materia-prima': 5 },
      );

      assert.equal(products[0].code, '1474');
      assert.equal(products[0].name, 'EMBALAG. NHOQUE 1kg');
      assert.equal(products[20].code, '1673');
    });

    it('leaves out the wrong list entry and lists 1673 once', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/salida/catalog', headers: wilkin() });
      const { products } = JSON.parse(response.body) as { products: { code: string }[] };
      assert.equal(products.filter((product) => product.code === '1040').length, 0);
      assert.equal(products.filter((product) => product.code === '1673').length, 1);
    });
  });

  describe('launching a movement', () => {
    it('persists the header and its ordered items and answers 201', async () => {
      const response = await launch([
        { code: '1474', quantity: 20 },
        { code: '1900', quantity: 3 },
        { code: '1673', quantity: 5 },
      ]);
      assert.equal(response.statusCode, 201, response.body);

      const { movement } = JSON.parse(response.body);
      assert.equal(movement.movement_date, getSaoPauloDateString());
      assert.equal(movement.username, 'wilkin');
      assert.equal(movement.display_name, 'Wilkin Admin');
      assert.equal(typeof movement.created_at, 'string');

      assert.deepEqual(
        movement.items.map((item: { product_code: string; position: number; quantity: number; block: string }) => [
          item.product_code,
          item.position,
          item.quantity,
          item.block,
        ]),
        [
          ['1474', 0, 20, 'embalagens'],
          ['1900', 1, 3, 'bobinas'],
          ['1673', 2, 5, 'materia-prima'],
        ],
      );
      assert.equal(movement.items[0].product_name, 'EMBALAG. NHOQUE 1kg');
      assert.equal(movement.total_units, 28);
      assert.deepEqual(movement.photos, []);
      assert.deepEqual(movement.reconciliation, { status: 'pending', ent_lans: [], matched_item_ids: [] });

      const stored = db
        .prepare('SELECT product_code, quantity, position FROM salida_movement_items WHERE movement_id = ? ORDER BY position')
        .all(movement.id);
      assert.deepEqual(
        stored.map((row) => Object.values(row as Record<string, unknown>)),
        [
          ['1474', 20, 0],
          ['1900', 3, 1],
          ['1673', 5, 2],
        ],
      );
    });

    it('refuses an empty list', async () => {
      const response = await launch([]);
      assert.equal(response.statusCode, 400);
      assert.equal(JSON.parse(response.body).code, 'SALIDA_INVALID_ITEMS');
    });

    it('refuses more than 21 items', async () => {
      const response = await launch(
        Array.from({ length: 22 }, () => ({ code: '1474', quantity: 1 })),
      );
      assert.equal(response.statusCode, 400);
    });

    it('refuses a duplicated code', async () => {
      const response = await launch([
        { code: '1474', quantity: 1 },
        { code: '1474', quantity: 2 },
      ]);
      assert.equal(response.statusCode, 400);
    });

    it('refuses a code the catalog does not offer', async () => {
      const response = await launch([{ code: '1040', quantity: 1 }]);
      assert.equal(response.statusCode, 400);
      assert.equal(JSON.parse(response.body).code, 'SALIDA_UNKNOWN_PRODUCT');
      assert.equal(
        (db.prepare('SELECT COUNT(*) AS n FROM salida_movement_items WHERE product_code = ?').get('1040') as { n: number }).n,
        0,
      );
    });

    const refusedQuantities: [string, unknown][] = [
      ['zero', 0],
      ['a negative number', -3],
      ['a fraction', 1.5],
      ['a string', '10'],
    ];
    for (const [what, quantity] of refusedQuantities) {
      it(`refuses a quantity of ${what}`, async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/salida',
          headers: wilkin(),
          payload: { items: [{ code: '1474', quantity }] },
        });
        assert.equal(response.statusCode, 400, response.body);
        assert.equal(JSON.parse(response.body).code, 'SALIDA_INVALID_ITEMS');
      });
    }
  });

  describe('reading the day and the history', () => {
    it('answers the movements of a day with their items, photos and reconciliation', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/salida?date=${getSaoPauloDateString()}`,
        headers: wilkin(),
      });
      assert.equal(response.statusCode, 200, response.body);

      const body = JSON.parse(response.body);
      assert.equal(body.date, getSaoPauloDateString());
      assert.ok(Array.isArray(body.movements) && body.movements.length > 0);
      const movement = body.movements[0];
      assert.deepEqual(
        Object.keys(movement).sort(),
        [
          'created_at',
          'display_name',
          'id',
          'items',
          'movement_date',
          'photos',
          'reconciliation',
          'total_units',
          'user_id',
          'username',
        ].sort(),
      );
      assert.deepEqual(Object.keys(movement.reconciliation).sort(), ['ent_lans', 'matched_item_ids', 'status']);
    });

    it('answers today when no date is asked for', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/salida', headers: wilkin() });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(JSON.parse(response.body).date, getSaoPauloDateString());
    });

    it('refuses a date that is not YYYY-MM-DD', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/salida?date=13/11/2026', headers: wilkin() });
      assert.equal(response.statusCode, 400);
      assert.equal(JSON.parse(response.body).code, 'SALIDA_INVALID_DATE_FORMAT');
    });

    it('lists the days newest first, each with its movements and total units', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/salida/history', headers: wilkin() });
      assert.equal(response.statusCode, 200, response.body);

      const { days } = JSON.parse(response.body) as {
        days: { date: string; total_units: number; movements: unknown[] }[];
      };
      assert.ok(days.length > 0);
      assert.equal(days[0].date, getSaoPauloDateString());
      assert.ok(days[0].total_units > 0);
      assert.ok(days[0].movements.length > 0);
      const dates = days.map((day) => day.date);
      assert.deepEqual(dates, [...dates].sort().reverse());
    });

    it('never mutates anything on a read', async () => {
      const snapshot = () =>
        JSON.stringify({
          movements: db.prepare('SELECT * FROM salida_movements ORDER BY id').all(),
          items: db.prepare('SELECT * FROM salida_movement_items ORDER BY id').all(),
          photos: db.prepare('SELECT * FROM salida_photos ORDER BY id').all(),
          seats: db.prepare('SELECT * FROM aero_movements ORDER BY id').all(),
        });

      const before = snapshot();
      await app.inject({ method: 'GET', url: '/api/salida', headers: wilkin() });
      await app.inject({ method: 'GET', url: '/api/salida/history', headers: wilkin() });
      await app.inject({ method: 'GET', url: '/api/salida/catalog', headers: wilkin() });
      assert.equal(snapshot(), before);
    });
  });

  describe('photos', () => {
    it('accepts three photos and refuses the fourth', async () => {
      const movementId = await launchOne('1357', 4);

      for (let index = 0; index < 3; index += 1) {
        const response = await uploadPhoto(movementId);
        assert.equal(response.statusCode, 201, response.body);
        const { photo } = JSON.parse(response.body);
        assert.equal(photo.mime_type, 'image/jpeg');
        assert.ok(photo.file_path.endsWith('.jpg'));
        assert.equal(photo.url, `/api/salida/photos/${photo.id}`);
        assert.ok(photo.publicUrl.startsWith('https://example.test/api/salida/photos/public/'));
        assert.ok(existsSync(join(photosDir, photo.file_path)), 'the bytes must be on disk');
      }

      const fourth = await uploadPhoto(movementId);
      assert.equal(fourth.statusCode, 409, fourth.body);

      const listed = await app.inject({
        method: 'GET',
        url: `/api/salida/${movementId}/photos`,
        headers: wilkin(),
      });
      assert.equal(listed.statusCode, 200, listed.body);
      assert.equal(JSON.parse(listed.body).photos.length, 3);
    });

    it('refuses a MIME type that is not an image', async () => {
      const movementId = await launchOne('1356', 4);
      const response = await uploadPhoto(movementId, 'application/pdf', Buffer.from('PDF content'));
      assert.equal(response.statusCode, 415, response.body);
    });

    it('refuses a declared image whose bytes are not one', async () => {
      const movementId = await launchOne('1355', 4);
      const response = await uploadPhoto(movementId, 'image/jpeg', Buffer.from('not an image at all'));
      assert.equal(response.statusCode, 415, response.body);
    });

    it('refuses more than 5 MB', async () => {
      const movementId = await launchOne('1358', 4);
      const big = Buffer.alloc(6 * 1024 * 1024, 0x41);
      big[0] = 0x89;
      big[1] = 0x50;
      big[2] = 0x4e;
      big[3] = 0x47;
      const response = await uploadPhoto(movementId, 'image/png', big);
      assert.equal(response.statusCode, 413, response.body);
    });

    it('deletes the row and the file', async () => {
      const movementId = await launchOne('1359', 2);
      const created = await uploadPhoto(movementId);
      const { photo } = JSON.parse(created.body);
      const filePath = join(photosDir, photo.file_path);
      assert.ok(existsSync(filePath));

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/salida/photos/${photo.id}`,
        headers: wilkin(),
      });
      assert.equal(deleted.statusCode, 200, deleted.body);
      assert.equal(
        (db.prepare('SELECT COUNT(*) AS n FROM salida_photos WHERE id = ?').get(photo.id) as { n: number }).n,
        0,
      );
      assert.equal(existsSync(filePath), false);
    });

    it('serves the bytes through the public token without a session', async () => {
      const movementId = await launchOne('1361', 2);
      const created = await uploadPhoto(movementId);
      const { photo } = JSON.parse(created.body);
      const token = (
        db.prepare('SELECT public_token FROM salida_photos WHERE id = ?').get(photo.id) as { public_token: string }
      ).public_token;

      const response = await app.inject({
        method: 'GET',
        url: `/api/salida/photos/public/${token}`,
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.headers['content-type'], 'image/jpeg');
      assert.deepEqual(response.rawPayload, fakeJpeg);
    });

    it('answers 404 for a token that belongs to no photo', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/salida/photos/public/0123456789abcdef0123456789abcdef',
      });
      assert.equal(response.statusCode, 404);
    });
  });

  describe('the beta guard', () => {
    const guarded: { method: 'GET' | 'POST' | 'DELETE'; url: string; payload?: Record<string, unknown> }[] = [
      { method: 'GET', url: '/api/salida/catalog' },
      { method: 'POST', url: '/api/salida', payload: { items: [{ code: '1474', quantity: 1 }] } },
      { method: 'GET', url: '/api/salida' },
      { method: 'GET', url: '/api/salida/history' },
      { method: 'POST', url: '/api/salida/1/photos' },
      { method: 'GET', url: '/api/salida/1/photos' },
      { method: 'GET', url: '/api/salida/photos/1' },
      { method: 'DELETE', url: '/api/salida/photos/1' },
    ];

    for (const route of guarded) {
      it(`${route.method} ${route.url} answers 401 without a session`, async () => {
        const response = await app.inject(route);
        assert.equal(response.statusCode, 401, response.body);
      });

      it(`${route.method} ${route.url} answers 403 to a worker`, async () => {
        const response = await app.inject({ ...route, headers: auth(workerToken) });
        assert.equal(response.statusCode, 403, response.body);
      });

      it(`${route.method} ${route.url} answers 403 to the guest`, async () => {
        const response = await app.inject({ ...route, headers: auth(guestToken) });
        assert.equal(response.statusCode, 403, response.body);
      });
    }

    it('answers 404 instead of 401 for a photo id that does not exist', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/salida/photos/999999', headers: wilkin() });
      assert.equal(response.statusCode, 404);
    });
  });
});
