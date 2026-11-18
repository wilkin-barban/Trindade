import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { buildTestApp, type TestFixtures } from '../../test-helper.js';
import { REFERENCE_DATASET } from '../../db/reference-data.js';
import { GUEST_USERNAME } from '../../guest-user.js';
import { hashBridgeTicket } from './aero.tickets.service.js';

/**
 * The `saida` action of the one-use bridge, next to the four that already existed.
 *
 * The point of this file is the pair: the new action has to behave like a batch (1..8 payloads, `bodies` when
 * there is more than one, `saidasitem` as the endpoint) *and* the four existing actions have to keep the
 * counts, the endpoints and the envelope they had before it arrived. A regression here is a phone in the
 * plant that can no longer record an entry.
 *
 * Who may ask is asserted from the same place: the beta is over, so `saida` issues its ticket for any
 * authenticated account -- another admin, a worker, the guest -- and anonymity is the only refusal.
 */
describe('the saida bridge action', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let db: Awaited<ReturnType<typeof buildTestApp>>['db'];
  let fixtures: TestFixtures;
  let wilkinToken: string;
  let otherAdminToken: string;
  let workerToken: string;
  let guestToken: string;

  const ORIGIN = 'https://salida.test';
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function issue(token: string, action: string, payloads: unknown[]) {
    return app.inject({
      method: 'POST',
      url: '/api/integration/aero/bridge-tickets',
      headers: auth(token),
      payload: { action, payloads },
    });
  }

  async function redeem(ticket: string) {
    return app.inject({
      method: 'POST',
      url: '/api/integration/aero/bridge-tickets/redeem',
      headers: { 'x-trindade-ticket': ticket },
    });
  }

  function ticketRow(ticket: string) {
    return db
      .prepare(`SELECT action, endpoint, body, bodies FROM aero_bridge_tickets WHERE token_hash = ?`)
      .get(hashBridgeTicket(ticket)) as
      | { action: string; endpoint: string; body: string; bodies: string | null }
      | undefined;
  }

  before(async () => {
    process.env.PUBLIC_APP_URL = ORIGIN;
    const built = await buildTestApp();
    app = built.app;
    db = built.db;
    fixtures = built.fixtures;

    const adminRoleId = REFERENCE_DATASET.roles.find((role) => role.name === 'Administrador')!.id;
    const inserted = db
      .prepare(
        `INSERT INTO users (username, password_hash, display_name, role_id, is_active, security_version)
         VALUES (?, ?, ?, ?, 1, 1)`,
      )
      .run('wilkin', await bcrypt.hash('wilkin-pass', 4), 'Wilkin Admin', adminRoleId);
    const wilkinId = Number(inserted.lastInsertRowid);

    const sign = (sub: number, username: string) =>
      jwt.sign({ sub, username, role: 'Administrador', security_version: 1 }, fixtures.jwtSecret);

    wilkinToken = sign(wilkinId, 'wilkin');
    otherAdminToken = sign(fixtures.admin.id, fixtures.admin.username);
    workerToken = sign(fixtures.worker.id, fixtures.worker.username);

    // El invitado existe en los datos de referencia: es la cuenta de solo lectura que el servidor ya conoce.
    const guest = db.prepare('SELECT id, username FROM users WHERE username = ?').get(GUEST_USERNAME) as
      | { id: number; username: string }
      | undefined;
    assert.ok(guest, 'the reference dataset carries the guest account');
    guestToken = jwt.sign({ sub: guest.id, username: guest.username, role: 'Trabalhador', security_version: 1 }, fixtures.jwtSecret);

    // The vault every issued ticket reads its envelope from.
    for (const token of [wilkinToken, otherAdminToken, workerToken]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/integration/aero/settings',
        headers: auth(token),
        payload: { wsUrl: 'http://192.168.25.250:1453/api', username: 'WILKIN', password: 'senha-do-erp' },
      });
      assert.equal(response.statusCode, 200, response.body);
    }

  });

  after(async () => {
    await app.close();
    db.close();
  });

  describe('the new action', () => {
    it('stores a single payload without bodies and redeems to saidasitem', async () => {
      const payload = {
        PRO_COD: '001474',
        PRO_DES: 'EMBALAG. NHOQUE 1kg',
        PRO_QTD: 2000,
        PED_DTA: '2026-11-13',
        PED_USU: 'WILKIN',
        PED_SER: 'APL',
        PED_DTANOT: '2026-11-13',
        PED_OBS: 'Saida de insumos via Trindade',
        LOTES: [],
      };

      const issued = await issue(wilkinToken, 'saida', [payload]);
      assert.equal(issued.statusCode, 201, issued.body);

      const stored = ticketRow((issued.json() as { ticket: string }).ticket);
      assert.equal(stored?.action, 'saida', 'the SQLite CHECK has to accept the action');
      assert.equal(stored?.endpoint, 'saidasitem');
      assert.equal(stored?.bodies, null);

      const redeemed = await redeem((issued.json() as { ticket: string }).ticket);
      assert.equal(redeemed.statusCode, 200, redeemed.body);
      const envelope = redeemed.json() as { url: string; body: string; bodies?: string[] };
      assert.equal(envelope.url, 'http://192.168.25.250:1453/api/saidasitem');
      assert.deepEqual(JSON.parse(envelope.body), payload);
      assert.equal(envelope.bodies, undefined);
      assert.equal(
        envelope.body.includes('PRO_CST'),
        false,
        'a baixa never reuses the entry payload',
      );
    });

    it('stores every body of a batch and answers them in order', async () => {
      const payloads = Array.from({ length: 3 }, (_, index) => ({ PRO_COD: `00147${index}`, PRO_QTD: 100 * index }));

      const issued = await issue(wilkinToken, 'saida', payloads);
      assert.equal(issued.statusCode, 201, issued.body);

      const stored = ticketRow((issued.json() as { ticket: string }).ticket);
      assert.deepEqual((JSON.parse(stored!.bodies!) as string[]).map((entry) => JSON.parse(entry)), payloads);

      const envelope = (await redeem((issued.json() as { ticket: string }).ticket)).json() as {
        url: string;
        bodies: string[];
      };
      assert.equal(envelope.url, 'http://192.168.25.250:1453/api/saidasitem');
      assert.deepEqual(envelope.bodies.map((entry) => JSON.parse(entry)), payloads);
    });

    it('accepts the whole batch and refuses one over it', async () => {
      assert.equal((await issue(wilkinToken, 'saida', Array.from({ length: 8 }, () => ({})))).statusCode, 201);
      const tooMany = await issue(wilkinToken, 'saida', Array.from({ length: 9 }, () => ({})));
      assert.equal(tooMany.statusCode, 400, tooMany.body);
      assert.equal((await issue(wilkinToken, 'saida', [])).statusCode, 400);
    });

    it('issues the ticket for any account with a session, and never without one', async () => {
      const saidaTickets = () =>
        (db.prepare("SELECT COUNT(*) AS n FROM aero_bridge_tickets WHERE action = 'saida'").get() as { n: number }).n;

      // La beta terminó: otro administrador y un trabajador piden su ticket como el dueño del módulo.
      for (const [who, token] of [
        ['another admin', otherAdminToken],
        ['a worker', workerToken],
      ] as [string, string][]) {
        const before = saidaTickets();
        const issued = await issue(token, 'saida', [{ PRO_COD: '001474' }]);
        assert.equal(issued.statusCode, 201, `${who}: ${issued.body}`);
        assert.equal(saidaTickets(), before + 1, `${who}: the ticket is written down`);
      }

      // El invitado no es un caso de la beta: la cuenta es de solo lectura en todo el servidor, así que su negativa
      // viene de esa regla y no de esta acción. Se deja dicho acá para que nadie la confunda con un guard viejo.
      const guest = await issue(guestToken, 'saida', [{ PRO_COD: '001474' }]);
      assert.equal(guest.statusCode, 403, guest.body);
      assert.match(guest.body, /cadastrar um usuário|solo lectura|somente leitura/i);

      // Anonymity is the only thing the bridge still refuses.
      const anonymous = await app.inject({
        method: 'POST',
        url: '/api/integration/aero/bridge-tickets',
        headers: { 'content-type': 'application/json' },
        payload: { action: 'saida', payloads: [{ PRO_COD: '001474' }] },
      });
      assert.equal(anonymous.statusCode, 401, anonymous.body);

      // Y la entrada sigue igual para esa misma cuenta.
      const entrada = await issue(otherAdminToken, 'entrada', [{ PRO_COD: '000022' }]);
      assert.equal(entrada.statusCode, 201, entrada.body);
    });
  });

  describe('the actions that already existed', () => {
    it('keeps one payload for entrada and test, and two for the day read', async () => {
      for (const action of ['entrada', 'test']) {
        assert.equal((await issue(wilkinToken, action, [{}])).statusCode, 201, `${action} accepts one payload`);
        assert.equal((await issue(wilkinToken, action, [])).statusCode, 400, `${action} refuses none`);
        assert.equal(
          (await issue(wilkinToken, action, [{ a: 1 }, { b: 2 }])).statusCode,
          400,
          `${action} refuses two`,
        );
      }

      // `movimentos` lleva los dos lados del día: entradas y salidas, una petición cada una.
      assert.equal((await issue(wilkinToken, 'movimentos', [{}])).statusCode, 201);
      assert.equal((await issue(wilkinToken, 'movimentos', [])).statusCode, 400);
      assert.equal((await issue(wilkinToken, 'movimentos', [{ a: 1 }, { b: 2 }])).statusCode, 201);
      assert.equal(
        (await issue(wilkinToken, 'movimentos', [{ a: 1 }, { b: 2 }, { c: 3 }])).statusCode,
        400,
      );
    });

    it('keeps two to eight payloads for entrada_lote', async () => {
      assert.equal((await issue(wilkinToken, 'entrada_lote', [{}])).statusCode, 400);
      assert.equal((await issue(wilkinToken, 'entrada_lote', [{ a: 1 }, { b: 2 }])).statusCode, 201);
      assert.equal(
        (await issue(wilkinToken, 'entrada_lote', Array.from({ length: 8 }, () => ({})))).statusCode,
        201,
      );
      assert.equal(
        (await issue(wilkinToken, 'entrada_lote', Array.from({ length: 9 }, () => ({})))).statusCode,
        400,
      );
    });

    it('keeps the endpoint map and the envelope of the existing actions', async () => {
      const cases: { action: string; payloads: unknown[]; endpoint: string; expectsBodies: boolean }[] = [
        { action: 'entrada', payloads: [{ PRO_COD: '000022' }], endpoint: 'entradasitem', expectsBodies: false },
        {
          action: 'entrada_lote',
          payloads: [{ PRO_COD: '000022' }, { PRO_COD: '000023' }],
          endpoint: 'entradasitem',
          expectsBodies: true,
        },
        { action: 'movimentos', payloads: [{ ENTSAI: 'E' }], endpoint: 'movimentoitem?_method=PATCH', expectsBodies: false },
        { action: 'test', payloads: [{}], endpoint: 'usuarios', expectsBodies: false },
      ];

      for (const testCase of cases) {
        const issued = await issue(wilkinToken, testCase.action, testCase.payloads);
        assert.equal(issued.statusCode, 201, `${testCase.action}: ${issued.body}`);
        const envelope = (await redeem((issued.json() as { ticket: string }).ticket)).json() as {
          url: string;
          method: string;
          headers: Record<string, string>;
          callback: string;
          bodies?: string[];
        };
        assert.equal(envelope.url, `http://192.168.25.250:1453/api/${testCase.endpoint}`);
        assert.equal(envelope.method, 'POST');
        assert.equal(typeof envelope.headers.Authorization, 'string');
        assert.equal(envelope.callback.includes(`aero_action=${testCase.action}`), true);
        assert.equal(envelope.bodies !== undefined, testCase.expectsBodies, `${testCase.action} bodies`);
      }
    });
  });
});
