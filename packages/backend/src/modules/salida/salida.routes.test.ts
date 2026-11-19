import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
 * The rule of this module is a permission, not an arithmetic: the beta is over, so every route that reads or
 * writes a movement answers any signed-in account and 401 to nobody signed in. What is asserted here is that
 * boundary, the shape of the answer, and the photo edge — three, 5 MB, JPEG, PNG or WebP by magic bytes and not by
 * what the browser declares.
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

  /**
   * An iPhone still in its container form: `ftyp` at bytes 4..8 and the brand at bytes 8..12.
   *
   * That is the whole of what the server may trust — a HEIC and a HEIF differ only in the brand, and neither can
   * be told apart from a JPEG without reading the bytes.
   */
  function isoBmffStill(brand: string): Buffer {
    return Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftyp', 'ascii'),
      Buffer.from(brand, 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('mif1heic', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
    ]);
  }

  const fakeHeic = isoBmffStill('heic');
  const fakePng = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
  ]);
  const fakeWebp = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBPVP8 ', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
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

  async function launchOne(code = '1357', quantity = 10): Promise<number> {
    const response = await launch([{ code, quantity }]);
    assert.equal(response.statusCode, 201, response.body);
    return JSON.parse(response.body).movement.id as number;
  }

  async function uploadPhoto(movementId: number, mimeType = 'image/jpeg', data: Buffer = fakeJpeg) {
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
    it('serves the fixed 19 products in the S1 order, split 11/3/5', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/salida/catalog', headers: wilkin() });
      assert.equal(response.statusCode, 200, response.body);

      const { products } = JSON.parse(response.body) as {
        products: { code: string; name: string; block: string }[];
      };
      assert.equal(products.length, 19);
      assert.deepEqual(
        {
          embalagens: products.filter((p) => p.block === 'embalagens').length,
          bobinas: products.filter((p) => p.block === 'bobinas').length,
          'materia-prima': products.filter((p) => p.block === 'materia-prima').length,
        },
        { embalagens: 11, bobinas: 3, 'materia-prima': 5 },
      );

      assert.equal(products[0].code, '1357');
      assert.equal(products[0].name, 'EMBALAG. DISCO 200g');
      assert.equal(products[18].code, '1673');
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
        { code: '1357', quantity: 20 },
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
          ['1357', 0, 20, 'embalagens'],
          ['1900', 1, 3, 'bobinas'],
          ['1673', 2, 5, 'materia-prima'],
        ],
      );
      assert.equal(movement.items[0].product_name, 'EMBALAG. DISCO 200g');
      assert.equal(movement.total_units, 28);
      assert.deepEqual(movement.photos, []);
      assert.deepEqual(movement.reconciliation, { status: 'pending', ent_lans: [], matched_item_ids: [] });

      const stored = db
        .prepare('SELECT product_code, quantity, position FROM salida_movement_items WHERE movement_id = ? ORDER BY position')
        .all(movement.id);
      assert.deepEqual(
        stored.map((row) => Object.values(row as Record<string, unknown>)),
        [
          ['1357', 20, 0],
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

    it('refuses more than 19 items', async () => {
      const response = await launch(
        Array.from({ length: 20 }, () => ({ code: '1357', quantity: 1 })),
      );
      assert.equal(response.statusCode, 400);
    });

    it('refuses a duplicated code', async () => {
      const response = await launch([
        { code: '1357', quantity: 1 },
        { code: '1357', quantity: 2 },
      ]);
      assert.equal(response.statusCode, 400);
    });

    it('refuses codes the catalog does not offer, including 1040, 1474 and 1473', async () => {
      for (const unknownCode of ['1040', '1474', '1473']) {
        const response = await launch([{ code: unknownCode, quantity: 1 }]);
        assert.equal(response.statusCode, 400);
        assert.equal(JSON.parse(response.body).code, 'SALIDA_UNKNOWN_PRODUCT');
        assert.equal(
          (db.prepare('SELECT COUNT(*) AS n FROM salida_movement_items WHERE product_code = ?').get(unknownCode) as { n: number }).n,
          0,
        );
      }
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
          payload: { items: [{ code: '1357', quantity }] },
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
          'erp',
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
    /**
     * Las fotos son de quien lanzó el movimiento.
     *
     * Un asiento de otro operario -- o el que vino del ERP -- se lee y no se toca: ni una foto se le puede anexar
     * ni se puede borrar la que ya tiene. El cliente esconde los controles; esto es la mitad que manda.
     */
    it('refuses a photo uploaded by an operator who did not launch the movement', async () => {
      const movementId = await launchOne('1357', 4);

      const { body, boundary } = multipartBody('image/jpeg', fakeJpeg);
      const response = await app.inject({
        method: 'POST',
        url: `/api/salida/${movementId}/photos`,
        headers: { ...auth(workerToken), 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });

      assert.equal(response.statusCode, 403, response.body);
      assert.equal(JSON.parse(response.body).code, 'SALIDA_NOT_OWNER');
      const count = db
        .prepare('SELECT COUNT(*) AS total FROM salida_photos WHERE movement_id = ?')
        .get(movementId) as { total: number };
      assert.equal(count.total, 0);
    });

    it('refuses the owner of another movement deleting a photo that is not theirs', async () => {
      const movementId = await launchOne('1357', 4);
      const uploaded = await uploadPhoto(movementId);
      assert.equal(uploaded.statusCode, 201, uploaded.body);
      const photoId = JSON.parse(uploaded.body).photo.id as number;

      const refused = await app.inject({
        method: 'DELETE',
        url: `/api/salida/photos/${photoId}`,
        headers: auth(workerToken),
      });

      assert.equal(refused.statusCode, 403, refused.body);
      assert.equal(JSON.parse(refused.body).code, 'SALIDA_NOT_OWNER');
      const still = db.prepare('SELECT COUNT(*) AS total FROM salida_photos WHERE id = ?').get(photoId) as {
        total: number;
      };
      assert.equal(still.total, 1);
    });

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

    it('accepts an iPhone HEIC, stores `.heic` and serves the bytes back', async () => {
      const movementId = await launchOne('1307', 3);
      const created = await uploadPhoto(movementId, 'image/heic', fakeHeic);
      assert.equal(created.statusCode, 201, created.body);

      const { photo } = JSON.parse(created.body);
      assert.equal(photo.mime_type, 'image/heic');
      assert.ok(photo.file_path.endsWith('.heic'), `file_path should end with .heic, got ${photo.file_path}`);
      assert.ok(existsSync(join(photosDir, photo.file_path)), 'the bytes must be on disk');

      const served = await app.inject({
        method: 'GET',
        url: `/api/salida/photos/${photo.id}`,
        headers: wilkin(),
      });
      assert.equal(served.statusCode, 200, served.body);
      assert.equal(served.headers['content-type'], 'image/heic');
      assert.deepEqual(served.rawPayload, fakeHeic);
    });

    it('maps the HEIF family of the same header to `image/heif` and `.heif`', async () => {
      const movementId = await launchOne('1625', 2);
      const created = await uploadPhoto(movementId, 'image/heif', isoBmffStill('mif1'));
      assert.equal(created.statusCode, 201, created.body);

      const { photo } = JSON.parse(created.body);
      assert.equal(photo.mime_type, 'image/heif');
      assert.ok(photo.file_path.endsWith('.heif'), `file_path should end with .heif, got ${photo.file_path}`);
    });

    it('keeps accepting JPEG, PNG and WebP and keeps their extensions', async () => {
      const movementId = await launchOne('1354', 1);
      const cases: { mime: string; data: Buffer; ext: string }[] = [
        { mime: 'image/jpeg', data: fakeJpeg, ext: '.jpg' },
        { mime: 'image/png', data: fakePng, ext: '.png' },
        { mime: 'image/webp', data: fakeWebp, ext: '.webp' },
      ];

      for (const item of cases) {
        const response = await uploadPhoto(movementId, item.mime, item.data);
        assert.equal(response.statusCode, 201, `${item.mime}: ${response.body}`);
        const { photo } = JSON.parse(response.body);
        assert.equal(photo.mime_type, item.mime);
        assert.ok(photo.file_path.endsWith(item.ext), `${item.mime} should store ${item.ext}`);
      }
    });

    it('refuses a declared HEIC whose bytes are not an ISO-BMFF container', async () => {
      const movementId = await launchOne('1528', 4);
      const response = await uploadPhoto(movementId, 'image/heic', Buffer.from('not a heic at all'));
      assert.equal(response.statusCode, 415, response.body);
    });

    it('refuses a HEIC file declared as `image/jpeg`', async () => {
      const movementId = await launchOne('1781', 5);
      const response = await uploadPhoto(movementId, 'image/jpeg', fakeHeic);
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

  describe('who may call the module', () => {
    const routes: { method: 'GET' | 'POST' | 'DELETE'; url: string; payload?: Record<string, unknown> }[] = [
      { method: 'GET', url: '/api/salida/catalog' },
      { method: 'POST', url: '/api/salida', payload: { items: [{ code: '1357', quantity: 1 }] } },
      { method: 'GET', url: '/api/salida' },
      { method: 'GET', url: '/api/salida/history' },
      { method: 'POST', url: '/api/salida/1/erp-result', payload: { status: 'sent' } },
      { method: 'POST', url: '/api/salida/1/photos' },
      { method: 'GET', url: '/api/salida/1/photos' },
      { method: 'GET', url: '/api/salida/photos/1' },
      { method: 'DELETE', url: '/api/salida/photos/1' },
    ];

    for (const route of routes) {
      it(`${route.method} ${route.url} answers 401 without a session`, async () => {
        const response = await app.inject(route);
        assert.equal(response.statusCode, 401, response.body);
      });
    }

    // La beta terminó: un trabajador y el invitado ya no reciben 403. Lo que cambia es el permiso, no la regla del
    // recurso, así que cada ruta contesta lo suyo -- 200 en las lecturas, 400 en un alta inválida, 404 donde el id
    // no existe.
    it('gives a worker the catalogue and the history', async () => {
      const catalog = await app.inject({ method: 'GET', url: '/api/salida/catalog', headers: auth(workerToken) });
      assert.equal(catalog.statusCode, 200, catalog.body);
      assert.equal((JSON.parse(catalog.body) as { products: unknown[] }).products.length, 19);

      const history = await app.inject({ method: 'GET', url: '/api/salida/history', headers: auth(workerToken) });
      assert.equal(history.statusCode, 200, history.body);
    });

    it('gives the guest the catalogue and the history', async () => {
      const catalog = await app.inject({ method: 'GET', url: '/api/salida/catalog', headers: auth(guestToken) });
      assert.equal(catalog.statusCode, 200, catalog.body);

      const history = await app.inject({ method: 'GET', url: '/api/salida/history', headers: auth(guestToken) });
      assert.equal(history.statusCode, 200, history.body);
    });

    it('lets a worker launch a movement and read the day back', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/salida',
        headers: { ...auth(workerToken), 'content-type': 'application/json' },
        payload: { items: [{ code: '1357', quantity: 4 }] },
      });
      assert.equal(created.statusCode, 201, created.body);

      const day = await app.inject({
        method: 'GET',
        url: `/api/salida?date=${getSaoPauloDateString()}`,
        headers: auth(workerToken),
      });
      assert.equal(day.statusCode, 200, day.body);
      assert.equal((JSON.parse(day.body) as { movements: unknown[] }).movements.length >= 1, true);
    });

    it('still refuses what the rules refuse', async () => {
      // El alta vacía es inválida para un trabajador: abrir la beta no cambia la validación.
      const empty = await app.inject({
        method: 'POST',
        url: '/api/salida',
        headers: { ...auth(workerToken), 'content-type': 'application/json' },
        payload: { items: [] },
      });
      assert.equal(empty.statusCode, 400, empty.body);

      // El invitado sigue siendo de solo lectura: no es la beta de Salida, es la regla de la cuenta.
      const guestWrite = await app.inject({
        method: 'POST',
        url: '/api/salida',
        headers: { ...auth(guestToken), 'content-type': 'application/json' },
        payload: { items: [{ code: '1357', quantity: 1 }] },
      });
      assert.equal(guestWrite.statusCode, 403, guestWrite.body);
    });

    it('answers 404 instead of 401 for a photo id that does not exist', async () => {
      for (const token of [wilkinToken, workerToken, guestToken]) {
        const response = await app.inject({ method: 'GET', url: '/api/salida/photos/999999', headers: auth(token) });
        assert.equal(response.statusCode, 404, response.body);
      }
    });
  });

  describe('recording ERP result: POST /api/salida/:id/erp-result', () => {
    it('answers 404 for an unknown movement', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/salida/999999/erp-result',
        headers: wilkin(),
        payload: { status: 'sent' },
      });
      assert.equal(response.statusCode, 404, response.body);
    });

    it('answers 400 for an invalid id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/salida/not-an-id/erp-result',
        headers: wilkin(),
        payload: { status: 'sent' },
      });
      assert.equal(response.statusCode, 400, response.body);
    });

    it('answers 400 for an invalid body: missing status', async () => {
      const movementId = await launchOne('1357', 5);
      const response = await app.inject({
        method: 'POST',
        url: `/api/salida/${movementId}/erp-result`,
        headers: wilkin(),
        payload: {},
      });
      assert.equal(response.statusCode, 400, response.body);
    });

    it('answers 400 for an invalid body: unknown status', async () => {
      const movementId = await launchOne('1357', 5);
      const response = await app.inject({
        method: 'POST',
        url: `/api/salida/${movementId}/erp-result`,
        headers: wilkin(),
        payload: { status: 'bogus' },
      });
      assert.equal(response.statusCode, 400, response.body);
    });

    it('answers 400 for an invalid body: extra properties (strict)', async () => {
      const movementId = await launchOne('1357', 5);
      const response = await app.inject({
        method: 'POST',
        url: `/api/salida/${movementId}/erp-result`,
        headers: wilkin(),
        payload: { status: 'sent', extra: 'forbidden' },
      });
      assert.equal(response.statusCode, 400, response.body);
    });

    it('answers 400 for an invalid body: message exceeds 512 characters', async () => {
      const movementId = await launchOne('1357', 5);
      const response = await app.inject({
        method: 'POST',
        url: `/api/salida/${movementId}/erp-result`,
        headers: wilkin(),
        payload: { status: 'failed', message: 'e'.repeat(513) },
      });
      assert.equal(response.statusCode, 400, response.body);
    });

    it('records sent verdict and reflects it in list and history', async () => {
      const movementId = await launchOne('1357', 5);
      const response = await app.inject({
        method: 'POST',
        url: `/api/salida/${movementId}/erp-result`,
        headers: wilkin(),
        payload: { status: 'sent' },
      });
      assert.equal(response.statusCode, 200, response.body);
      const { movement } = JSON.parse(response.body);
      assert.equal(movement.id, movementId);
      assert.deepEqual(movement.erp, {
        status: 'sent',
        message: null,
        sentAt: movement.erp.sentAt,
      });
      assert.ok(movement.erp.sentAt);

      // Shows in GET /api/salida
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/salida',
        headers: wilkin(),
      });
      assert.equal(listRes.statusCode, 200);
      const { movements } = JSON.parse(listRes.body);
      const foundInList = movements.find((m: { id: number }) => m.id === movementId);
      assert.equal(foundInList.erp.status, 'sent');

      // Shows in GET /api/salida/history
      const historyRes = await app.inject({
        method: 'GET',
        url: '/api/salida/history',
        headers: wilkin(),
      });
      assert.equal(historyRes.statusCode, 200);
      const { days } = JSON.parse(historyRes.body);
      const allHistoryMovements = days.flatMap((d: { movements: any[] }) => d.movements);
      const foundInHistory = allHistoryMovements.find((m: { id: number }) => m.id === movementId);
      assert.equal(foundInHistory.erp.status, 'sent');
    });

    it('records failed verdict with message', async () => {
      const movementId = await launchOne('1357', 8);
      const response = await app.inject({
        method: 'POST',
        url: `/api/salida/${movementId}/erp-result`,
        headers: wilkin(),
        payload: { status: 'failed', message: 'AERO_BRIDGE_UNREADABLE' },
      });
      assert.equal(response.statusCode, 200, response.body);
      const { movement } = JSON.parse(response.body);
      assert.equal(movement.erp.status, 'failed');
      assert.equal(movement.erp.message, 'AERO_BRIDGE_UNREADABLE');
    });

    it('overwrites on relaunch (idempotent)', async () => {
      const movementId = await launchOne('1357', 12);
      const first = await app.inject({
        method: 'POST',
        url: `/api/salida/${movementId}/erp-result`,
        headers: wilkin(),
        payload: { status: 'failed', message: 'Host unreachable' },
      });
      assert.equal(first.statusCode, 200);
      assert.equal(JSON.parse(first.body).movement.erp.status, 'failed');

      const second = await app.inject({
        method: 'POST',
        url: `/api/salida/${movementId}/erp-result`,
        headers: wilkin(),
        payload: { status: 'sent' },
      });
      assert.equal(second.statusCode, 200);
      const { movement } = JSON.parse(second.body);
      assert.equal(movement.erp.status, 'sent');
      assert.equal(movement.erp.message, null);
    });
  });

  /**
   * The local audit trail of the baixa.
   *
   * `aero-integration.log` was, until now, only a record of what left the plant towards the ERP. These lines are
   * the other half: what the plant kept. The point of asserting them over http instead of calling the emitter is
   * that the ordering is the rule -- a line written before the row would claim a movement that a refusal never
   * stored.
   */
  describe('the local audit line', () => {
    interface LocalLine {
      event: string;
      user: string;
      role: string;
      destinationUrl: string;
      phase: string | null;
      httpStatus: number | null;
      response: string | null;
      error: string | null;
      launchId: number | null;
      note: string;
      payload: Record<string, unknown>;
    }

    const logFile = () => join(logDir, 'aero-integration.log');
    const readLog = (): LocalLine[] =>
      readFileSync(logFile(), 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as LocalLine);

    let logDir: string;

    beforeEach(() => {
      logDir = mkdtempSync(join(tmpdir(), 'salida-audit-'));
      process.env.AERO_LOG_DIR = logDir;
    });

    afterEach(() => {
      delete process.env.AERO_LOG_DIR;
      rmSync(logDir, { recursive: true, force: true });
    });

    it('records salida_create with the movement it stored, and no credentials', async () => {
      const response = await launch([
        { code: '1357', quantity: 20 },
        { code: '1900', quantity: 3 },
      ]);
      assert.equal(response.statusCode, 201, response.body);
      const { movement } = JSON.parse(response.body) as {
        movement: { id: number; movement_date: string; items: { block: string }[] };
      };

      const lines = readLog();
      assert.equal(lines.length, 1);
      const [line] = lines;
      assert.equal(line.event, 'salida_create');
      assert.equal(line.user, 'wilkin');
      assert.equal(line.role, 'Administrador');
      assert.equal(line.destinationUrl, 'local://salida');
      assert.equal(line.note, 'local=salida · action=create');
      // A local write has no phase and no HTTP status: it is not an attempt against anybody.
      assert.equal(line.phase, null);
      assert.equal(line.httpStatus, null);
      assert.equal(line.response, null);
      assert.equal(line.error, null);
      assert.equal(line.launchId, null);

      assert.equal(line.payload.movementId, movement.id);
      assert.equal(line.payload.movementDate, movement.movement_date);
      assert.equal(line.payload.itemCount, 2);
      assert.equal(line.payload.totalUnits, 23);
      assert.deepEqual(
        line.payload.blocks,
        [...new Set(movement.items.map((item) => item.block))],
      );

      const text = JSON.stringify(line).toLowerCase();
      for (const forbidden of ['authorization', 'password', 'senha', 'credential', 'basic ']) {
        assert.equal(text.includes(forbidden), false, `the line carries ${forbidden}`);
      }
    });

    it('records salida_photo with the photo it stored', async () => {
      const movementId = await launchOne('1357', 7);
      const upload = await uploadPhoto(movementId);
      assert.equal(upload.statusCode, 201, upload.body);
      const { photo } = JSON.parse(upload.body) as { photo: { id: number; file_size: number } };

      const lines = readLog().filter((line) => line.event === 'salida_photo');
      assert.equal(lines.length, 1);
      const [line] = lines;
      assert.equal(line.user, 'wilkin');
      assert.equal(line.role, 'Administrador');
      assert.equal(line.destinationUrl, 'local://salida');
      assert.equal(line.note, 'local=salida · action=photo');
      assert.equal(line.phase, null);
      assert.equal(line.payload.movementId, movementId);
      assert.equal(line.payload.photoId, photo.id);
      assert.equal(line.payload.fileSize, photo.file_size);
      assert.equal(line.payload.mimeType, 'image/jpeg');
    });

    it('writes nothing when the launch is refused', async () => {
      // The line records a fact, so a 400 has nothing to record: a log that mentioned the refused attempt would
      // make a refused quantity look like a movement somebody has to reconcile.
      const refused = await launch([{ code: '1357', quantity: 0 }]);
      assert.equal(refused.statusCode, 400, refused.body);
      assert.equal(existsSync(logFile()), false);
    });

    it('answers 201 when the audit file cannot be written, because the movement is already stored', async () => {
      // The log is a witness, not the transaction. A read-only or full volume has to degrade to a warning: a 500
      // here would tell the operator the baixa failed and invite a second, duplicated movement.
      const unwritable = join(logDir, 'not-a-directory');
      writeFileSync(unwritable, 'this path is a file, so the log directory cannot be created');
      process.env.AERO_LOG_DIR = unwritable;

      const response = await launch([{ code: '1357', quantity: 4 }]);
      assert.equal(response.statusCode, 201, response.body);
      const movementId = (JSON.parse(response.body) as { movement: { id: number } }).movement.id;
      const stored = db.prepare('SELECT COUNT(*) AS count FROM salida_movements WHERE id = ?').get(movementId) as {
        count: number;
      };
      assert.equal(stored.count, 1);
    });
  });
});
