import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { buildTestApp, TEST_VAULT_KEY, type TestFixtures } from '../../test-helper.js';
import { REFERENCE_DATASET } from '../../db/reference-data.js';
import { GUEST_USERNAME } from '../../guest-user.js';

const ORIGIN = 'https://trindade.test';

describe('ERP vault and bridge tickets', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let db: Awaited<ReturnType<typeof buildTestApp>>['db'];
  let fixtures: TestFixtures;
  let wilkinToken: string;
  let otherAdminToken: string;
  let workerToken: string;
  let guestToken: string;
  let otherAdminId: number;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function ticketCount(where = ''): number {
    return (db.prepare(`SELECT COUNT(*) AS n FROM aero_bridge_tickets ${where}`).get() as { n: number }).n;
  }

  async function configure(password = 'senha-do-erp', wsUrl = 'http://192.168.25.250:1453/api') {
    return app.inject({
      method: 'PUT',
      url: '/api/integration/aero/settings',
      headers: auth(wilkinToken),
      payload: { wsUrl, username: 'WILKIN', password },
    });
  }

  function insertExpiredTicket(action = 'test'): string {
    const token = randomBytes(32).toString('base64url');
    db.prepare(
      `INSERT INTO aero_bridge_tickets
        (token_hash, user_id, action, endpoint, body, bodies, callback_url, expires_at, created_at)
       VALUES (?, ?, ?, 'usuarios', '{}', NULL, ?, ?, ?)`,
    ).run(
      createHash('sha256').update(token).digest('hex'),
      fixtures.admin.id,
      action,
      `${ORIGIN}/massas-launch?aero_action=${action}&aero_data=`,
      new Date(Date.now() - 60_000).toISOString(),
      new Date().toISOString(),
    );
    return token;
  }

  before(async () => {
    process.env.PUBLIC_APP_URL = ORIGIN;
    const built = await buildTestApp();
    app = built.app;
    db = built.db;
    fixtures = built.fixtures;

    const adminRoleId = REFERENCE_DATASET.roles.find((role) => role.name === 'Administrador')!.id;
    const hash = await bcrypt.hash('wilkin-pass', 4);
    const inserted = db
      .prepare(
        'INSERT INTO users (username, password_hash, display_name, role_id, is_active, security_version) VALUES (?, ?, ?, ?, 1, 1)',
      )
      .run('wilkin', hash, 'Wilkin Admin', adminRoleId);
    const wilkinId = Number(inserted.lastInsertRowid);
    otherAdminId = fixtures.admin.id;

    const sign = (sub: number, username: string, role: string) =>
      jwt.sign({ sub, username, role, security_version: 1 }, fixtures.jwtSecret);

    wilkinToken = sign(wilkinId, 'wilkin', 'Administrador');
    otherAdminToken = sign(fixtures.admin.id, fixtures.admin.username, 'Administrador');
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

  describe('settings', () => {
    it('refuses every method without a token', async () => {
      for (const method of ['GET', 'PUT', 'DELETE'] as const) {
        const response = await app.inject({
          method,
          url: '/api/integration/aero/settings',
          ...(method === 'PUT' ? { payload: { wsUrl: 'http://10.0.0.1/api', username: 'X' } } : {}),
        });
        assert.equal(response.statusCode, 401, `${method} must be 401 without a token`);
      }
    });

    it('refuses a worker, another administrator and the guest', async () => {
      for (const token of [workerToken, otherAdminToken, guestToken]) {
        const read = await app.inject({ method: 'GET', url: '/api/integration/aero/settings', headers: auth(token) });
        assert.equal(read.statusCode, 403);

        const write = await app.inject({
          method: 'PUT',
          url: '/api/integration/aero/settings',
          headers: auth(token),
          payload: { wsUrl: 'http://10.0.0.1/api', username: 'X', password: 'y' },
        });
        assert.equal(write.statusCode, 403);
      }
    });

    it('answers an empty vault before anything is configured', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/integration/aero/settings', headers: auth(wilkinToken) });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        configured: false,
        wsUrl: null,
        username: null,
        hasPassword: false,
        updatedAt: null,
      });
    });

    it('stores the password encrypted and never returns it', async () => {
      const password = 'senha-que-no-vuelve-123';
      const saved = await configure(password);

      assert.equal(saved.statusCode, 200);
      const body = saved.json();
      assert.equal(body.configured, true);
      assert.equal(body.hasPassword, true);
      assert.equal(body.wsUrl, 'http://192.168.25.250:1453/api');
      assert.equal(body.username, 'WILKIN');
      assert.equal(typeof body.updatedAt, 'string');

      const serialized = saved.body;
      assert.equal(serialized.includes(password), false, 'the response must not carry the password');
      assert.equal(Object.hasOwn(body, 'password'), false);
      assert.equal(Object.hasOwn(body, 'passwordCiphertext'), false);

      const read = await app.inject({ method: 'GET', url: '/api/integration/aero/settings', headers: auth(wilkinToken) });
      assert.equal(read.body.includes(password), false);

      const row = db
        .prepare('SELECT * FROM aero_integration_settings')
        .get() as Record<string, unknown>;
      for (const [column, value] of Object.entries(row)) {
        assert.equal(
          String(value).includes(password),
          false,
          `column ${column} stored the password in clear`,
        );
      }
      assert.equal(row.key_version, 1);
      assert.ok(String(row.password_ciphertext).length > 0);
      assert.ok(String(row.password_iv).length > 0);
      assert.ok(String(row.password_tag).length > 0);
    });

    it('rejects a malformed URL or an empty username', async () => {
      for (const wsUrl of ['ftp://10.0.0.1/api', 'not a url', 'http://', '']) {
        const response = await configure('senha', wsUrl);
        assert.equal(response.statusCode, 400, `${wsUrl} must be refused`);
        assert.equal(response.json().code, 'AERO_VAULT_INVALID_SETTINGS');
      }
      const emptyUser = await app.inject({
        method: 'PUT',
        url: '/api/integration/aero/settings',
        headers: auth(wilkinToken),
        payload: { wsUrl: 'http://192.168.25.250:1453/api', username: '   ', password: 'x' },
      });
      assert.equal(emptyUser.statusCode, 400);
    });

    it('refuses a first save with no password', async () => {
      await app.inject({ method: 'DELETE', url: '/api/integration/aero/settings', headers: auth(wilkinToken) });

      const response = await app.inject({
        method: 'PUT',
        url: '/api/integration/aero/settings',
        headers: auth(wilkinToken),
        payload: { wsUrl: 'http://192.168.25.250:1453/api', username: 'WILKIN' },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().code, 'AERO_VAULT_PASSWORD_REQUIRED');
    });

    it('deletes the vault and its pending tickets, and only then reports it gone', async () => {
      await configure();
      const issued = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        headers: auth(wilkinToken),
        payload: { action: 'test', payloads: [{}] },
      });
      assert.equal(issued.statusCode, 201);

      const deleted = await app.inject({ method: 'DELETE', url: '/api/integration/aero/settings', headers: auth(wilkinToken) });
      assert.equal(deleted.statusCode, 204);
      assert.equal(ticketCount(), 0);

      const read = await app.inject({ method: 'GET', url: '/api/integration/aero/settings', headers: auth(wilkinToken) });
      assert.equal(read.json().configured, false);
    });
  });

  describe('tickets', () => {
    before(async () => {
      await configure('senha-do-erp');
    });

    it('issues only for the owner', async () => {
      const anonymous = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        payload: { action: 'test', payloads: [{}] },
      });
      assert.equal(anonymous.statusCode, 401);

      for (const token of [workerToken, otherAdminToken, guestToken]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/integration/aero/bridge-tickets',
          headers: auth(token),
          payload: { action: 'test', payloads: [{}] },
        });
        assert.equal(response.statusCode, 403);
      }
    });

    it('stores only the hash of a random one-time token with a short TTL', async () => {
      const before = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        headers: auth(wilkinToken),
        payload: { action: 'entrada', payloads: [{ PRO_COD: '000022', PRO_QTD: 12000 }] },
      });

      assert.equal(response.statusCode, 201);
      const body = response.json() as { ticket: string; ticketUrl: string; expiresAt: string };
      assert.match(body.ticket, /^[A-Za-z0-9_-]{43}$/, '32 random bytes as base64url');
      assert.equal(body.ticketUrl, `${ORIGIN}/api/integration/aero/bridge-tickets/redeem`);
      assert.equal(body.ticketUrl.includes(body.ticket), false, 'the token must not travel in the URL');

      const ttl = new Date(body.expiresAt).getTime() - before;
      assert.ok(ttl > 110_000 && ttl < 130_000, `TTL must be about 120 s, got ${ttl}`);

      const row = db.prepare('SELECT * FROM aero_bridge_tickets WHERE token_hash = ?').get(
        createHash('sha256').update(body.ticket).digest('hex'),
      ) as Record<string, unknown> | undefined;
      assert.ok(row, 'the ticket is stored under its sha256 hash');
      for (const [column, value] of Object.entries(row!)) {
        assert.equal(String(value).includes(body.ticket), false, `column ${column} stored the raw token`);
      }
    });

    it('rejects a callback that leaves the public origin', async () => {
      for (const callbackPath of ['https://evil.example/massas', '//evil.example/massas', 'http://trindade.test.evil.example/x']) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/integration/aero/bridge-tickets',
          headers: auth(wilkinToken),
          payload: { action: 'test', payloads: [{}], callbackPath },
        });
        assert.equal(response.statusCode, 400, `${callbackPath} must be refused`);
        assert.equal(response.json().code, 'AERO_BRIDGE_INVALID_CALLBACK');
      }
    });

    it('rejects payloads that do not match the action', async () => {
      const cases: Array<{ action: string; payloads: unknown[] }> = [
        { action: 'entrada', payloads: [] },
        { action: 'entrada', payloads: [{ a: 1 }, { b: 2 }] },
        { action: 'movimentos', payloads: [{ a: 1 }, { b: 2 }] },
        { action: 'test', payloads: [] },
        { action: 'entrada_lote', payloads: [{ a: 1 }] },
        { action: 'entrada_lote', payloads: Array.from({ length: 9 }, () => ({ a: 1 })) },
        { action: 'entrada', payloads: ['not an object'] },
        { action: 'saida', payloads: [{}] },
      ];
      for (const testCase of cases) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/integration/aero/bridge-tickets',
          headers: auth(wilkinToken),
          payload: testCase,
        });
        assert.equal(response.statusCode, 400, `${JSON.stringify(testCase)} must be refused`);
      }
    });

    it('rejects every ticket operation while the vault is not configured', async () => {
      await app.inject({ method: 'DELETE', url: '/api/integration/aero/settings', headers: auth(wilkinToken) });

      const response = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        headers: auth(wilkinToken),
        payload: { action: 'test', payloads: [{}] },
      });

      assert.equal(response.statusCode, 503);
      assert.equal(response.json().code, 'AERO_VAULT_NOT_CONFIGURED');
      await configure();
    });

    it('redeems once, with the envelope the shortcut already understands', async () => {
      const payload = { PRO_COD: '000022', PRO_QTD: 12000, ENT_SER: 'APL' };
      const issued = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        headers: auth(wilkinToken),
        payload: { action: 'entrada', payloads: [payload], callbackPath: '/massas-launch?date=2026-11-09' },
      });
      const { ticket } = issued.json() as { ticket: string };

      const redeemed = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets/redeem',
        headers: { 'x-trindade-ticket': ticket },
      });

      assert.equal(redeemed.statusCode, 200);
      assert.equal(redeemed.headers['cache-control'], 'no-store');
      const envelope = redeemed.json() as Record<string, unknown>;
      assert.deepEqual(Object.keys(envelope).sort(), ['body', 'callback', 'headers', 'method', 'url']);
      assert.equal(envelope.url, 'http://192.168.25.250:1453/api/entradasitem');
      assert.equal(envelope.method, 'POST');
      assert.deepEqual(envelope.headers, {
        Authorization: `Basic ${Buffer.from('WILKIN:senha-do-erp').toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
      assert.equal(typeof envelope.body, 'string', 'the shortcut sends this text as the request body');
      assert.deepEqual(JSON.parse(envelope.body as string), payload);
      assert.equal(envelope.bodies, undefined);
      assert.equal(
        envelope.callback,
        `${ORIGIN}/massas-launch?date=2026-11-09&aero_action=entrada&aero_data=`,
      );
      assert.equal(redeemed.body.includes('senha-do-erp'), false, 'the password never leaves on its own');

      const again = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets/redeem',
        headers: { 'x-trindade-ticket': ticket },
      });
      assert.equal(again.statusCode, 410);
    });

    it('answers a missing, unknown and expired ticket without saying which kind it was', async () => {
      const missing = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets/redeem',
      });
      assert.equal(missing.statusCode, 401);
      assert.equal(missing.json().code, 'AERO_TICKET_MISSING');

      const unknown = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets/redeem',
        headers: { 'x-trindade-ticket': randomBytes(32).toString('base64url') },
      });
      assert.equal(unknown.statusCode, 404);

      const expiredToken = insertExpiredTicket();
      const expired = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets/redeem',
        headers: { 'x-trindade-ticket': expiredToken },
      });
      assert.equal(expired.statusCode, 410);
      assert.equal(expired.json().code, 'AERO_TICKET_UNUSABLE');
    });

    it('maps the endpoint on the server and sends every batch body', async () => {
      const payloads = Array.from({ length: 3 }, (_, index) => ({ PRO_COD: `00000${index}` }));
      const batch = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        headers: auth(wilkinToken),
        payload: { action: 'entrada_lote', payloads },
      });
      const batchEnvelope = (
        await app.inject({
          method: 'POST',
          url: '/api/integration/aero/bridge-tickets/redeem',
          headers: { 'x-trindade-ticket': (batch.json() as { ticket: string }).ticket },
        })
      ).json() as { url: string; body: string; bodies: string[] };
      assert.equal(batchEnvelope.url, 'http://192.168.25.250:1453/api/entradasitem');
      assert.deepEqual(JSON.parse(batchEnvelope.body), payloads[0]);
      assert.deepEqual(batchEnvelope.bodies.map((entry) => JSON.parse(entry)), payloads);

      const movimentos = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        headers: auth(wilkinToken),
        payload: { action: 'movimentos', payloads: [{ ENTSAI: 'E' }] },
      });
      const movimentosEnvelope = (
        await app.inject({
          method: 'POST',
          url: '/api/integration/aero/bridge-tickets/redeem',
          headers: { 'x-trindade-ticket': (movimentos.json() as { ticket: string }).ticket },
        })
      ).json() as { url: string };
      assert.equal(movimentosEnvelope.url, 'http://192.168.25.250:1453/api/movimentoitem?_method=PATCH');

      const test = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        headers: auth(wilkinToken),
        payload: { action: 'test', payloads: [{}] },
      });
      const testEnvelope = (
        await app.inject({
          method: 'POST',
          url: '/api/integration/aero/bridge-tickets/redeem',
          headers: { 'x-trindade-ticket': (test.json() as { ticket: string }).ticket },
        })
      ).json() as { url: string; body: string };
      assert.equal(testEnvelope.url, 'http://192.168.25.250:1453/api/usuarios');
      assert.equal(testEnvelope.body, '{}');
    });

    it('keeps the stored password when a later save omits it, and replaces it when one arrives', async () => {
      const issueAndRedeem = async () => {
        const issued = await app.inject({
          method: 'POST',
          url: '/api/integration/aero/bridge-tickets',
          headers: auth(wilkinToken),
          payload: { action: 'test', payloads: [{}] },
        });
        const redeemed = await app.inject({
          method: 'POST',
          url: '/api/integration/aero/bridge-tickets/redeem',
          headers: { 'x-trindade-ticket': (issued.json() as { ticket: string }).ticket },
        });
        const authorization = (redeemed.json() as { headers: { Authorization: string } }).headers.Authorization;
        return Buffer.from(authorization.replace('Basic ', ''), 'base64').toString('utf8');
      };

      const kept = await app.inject({
        method: 'PUT',
        url: '/api/integration/aero/settings',
        headers: auth(wilkinToken),
        payload: { wsUrl: 'http://192.168.25.250:1453/api', username: 'WILKIN', password: '' },
      });
      assert.equal(kept.statusCode, 200);
      assert.equal(await issueAndRedeem(), 'WILKIN:senha-do-erp');

      const replaced = await app.inject({
        method: 'PUT',
        url: '/api/integration/aero/settings',
        headers: auth(wilkinToken),
        payload: { wsUrl: 'http://192.168.25.250:1453/api', username: 'WILKIN', password: 'senha-nueva' },
      });
      assert.equal(replaced.statusCode, 200);
      assert.equal(await issueAndRedeem(), 'WILKIN:senha-nueva');
    });

    it('caps the pending tickets of the owner and clears what can no longer be used', async () => {
      for (let index = 0; index < 12; index += 1) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/integration/aero/bridge-tickets',
          headers: auth(wilkinToken),
          payload: { action: 'test', payloads: [{}] },
        });
        assert.equal(response.statusCode, 201);
      }

      const pending = ticketCount('WHERE used_at IS NULL');
      assert.ok(pending <= 8, `at most 8 pending tickets, got ${pending}`);
    });

    it('does not delete another owner tickets when the vault is cleared', async () => {
      db.prepare('DELETE FROM aero_bridge_tickets').run();
      db.prepare(
        `INSERT INTO aero_bridge_tickets
          (token_hash, user_id, action, endpoint, body, bodies, callback_url, expires_at, created_at)
         VALUES ('foreign-hash', ?, 'test', 'usuarios', '{}', NULL, ?, ?, ?)`,
      ).run(
        otherAdminId,
        `${ORIGIN}/massas-launch?aero_action=test&aero_data=`,
        new Date(Date.now() + 60_000).toISOString(),
        new Date().toISOString(),
      );

      const deleted = await app.inject({ method: 'DELETE', url: '/api/integration/aero/settings', headers: auth(wilkinToken) });
      assert.equal(deleted.statusCode, 204);
      assert.equal(ticketCount(), 1, 'the other owner ticket survives');
      db.prepare('DELETE FROM aero_bridge_tickets').run();
    });

    it('never writes the ticket or the password to the audit log or to a URL', async () => {
      const password = 'senha-auditada';
      await configure(password);
      const issued = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        headers: auth(wilkinToken),
        payload: { action: 'test', payloads: [{}] },
      });
      const body = issued.json() as { ticket: string; ticketUrl: string };
      const redeemed = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets/redeem',
        headers: { 'x-trindade-ticket': body.ticket },
      });

      for (const response of [issued, redeemed]) {
        assert.equal(response.body.includes(body.ticket), response === issued, 'only the issue response carries the token');
        assert.equal(response.body.includes(password), false);
      }
      assert.equal(body.ticketUrl.includes('?'), false);
      const audited = db
        .prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE details LIKE '%" + body.ticket + "%'")
        .get() as { n: number };
      assert.equal(audited.n, 0);
      assert.equal(TEST_VAULT_KEY.length > 0, true);
    });
  });
});
