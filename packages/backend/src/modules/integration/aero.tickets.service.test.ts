import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { buildTestApp, TEST_VAULT_KEY, type TestFixtures } from '../../test-helper.js';
import { saveAeroVaultSettings } from './aero.settings.service.js';
import {
  issueBridgeTicket,
  redeemBridgeTicket,
  storeBridgeTicketResult,
  readLastBridgeTicketResult,
} from './aero.tickets.service.js';

describe('aero bridge tickets service', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  let db: Database.Database;
  let fixtures: TestFixtures;
  const vaultKey = Buffer.from(TEST_VAULT_KEY, 'base64');

  before(async () => {
    const built = await buildTestApp();
    app = built.app;
    db = built.db;
    fixtures = built.fixtures;

    saveAeroVaultSettings(
      db,
      fixtures.admin.id,
      { wsUrl: 'http://192.168.25.250:1453/api', username: 'ADMIN', password: 'erp-password' },
      vaultKey,
    );
    saveAeroVaultSettings(
      db,
      fixtures.worker.id,
      { wsUrl: 'http://192.168.25.250:1453/api', username: 'WORKER', password: 'worker-password' },
      vaultKey,
    );
  });

  after(async () => {
    await app.close();
    db.close();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM aero_bridge_tickets').run();
  });

  it('redeem envelope carries resultUrl: /api/integration/aero/bridge-tickets/result', () => {
    const issued = issueBridgeTicket(db, {
      userId: fixtures.admin.id,
      action: 'test',
      payloads: [{}],
      callbackUrl: 'https://example.test/massas-launch?aero_action=test&aero_data=',
      publicAppUrl: 'https://example.test',
    });

    const redeemed = redeemBridgeTicket(db, issued.ticket, vaultKey);
    assert.equal(redeemed.ok, true);
    if (!redeemed.ok) return;
    assert.equal(redeemed.envelope.resultUrl, '/api/integration/aero/bridge-tickets/result');
  });

  it('stores a result for an already consumed ticket', () => {
    const issued = issueBridgeTicket(db, {
      userId: fixtures.admin.id,
      action: 'entrada',
      payloads: [{ PRO_COD: '000001' }],
      callbackUrl: 'https://example.test/massas-launch?aero_action=entrada&aero_data=',
      publicAppUrl: 'https://example.test',
    });

    const redeemed = redeemBridgeTicket(db, issued.ticket, vaultKey);
    assert.equal(redeemed.ok, true);

    const stored = storeBridgeTicketResult(db, issued.ticket, { status: 'OK', id: 123 });
    assert.deepEqual(stored, { ok: true });

    const row = db
      .prepare('SELECT result, result_at FROM aero_bridge_tickets WHERE token_hash = ?')
      .get((db.prepare('SELECT token_hash FROM aero_bridge_tickets').get() as { token_hash: string }).token_hash) as {
      result: string;
      result_at: string;
    };
    assert.deepEqual(JSON.parse(row.result), { status: 'OK', id: 123 });
    assert.ok(row.result_at, 'result_at must be populated');
  });

  it('idempotently overwrites previous result and keeps the latest', () => {
    const issued = issueBridgeTicket(db, {
      userId: fixtures.admin.id,
      action: 'movimentos',
      payloads: [{ ENTSAI: 'E' }],
      callbackUrl: 'https://example.test/massas-launch?aero_action=movimentos&aero_data=',
      publicAppUrl: 'https://example.test',
    });

    redeemBridgeTicket(db, issued.ticket, vaultKey);

    const first = storeBridgeTicketResult(db, issued.ticket, { attempt: 1 });
    assert.deepEqual(first, { ok: true });

    const second = storeBridgeTicketResult(db, issued.ticket, { attempt: 2, final: true });
    assert.deepEqual(second, { ok: true });

    const read = readLastBridgeTicketResult(db, fixtures.admin.id, 'movimentos');
    assert.deepEqual(read, { ok: true, data: { attempt: 2, final: true } });
  });

  it('storeBridgeTicketResult returns not found for an unknown token', () => {
    const stored = storeBridgeTicketResult(db, 'nonexistent-token', { test: true });
    assert.deepEqual(stored, { ok: false, code: 'AERO_TICKET_NOT_FOUND' });
  });

  it('readLastBridgeTicketResult returns only the caller result inside the 10-minute window and 404 outside it', () => {
    const issued = issueBridgeTicket(db, {
      userId: fixtures.admin.id,
      action: 'saida',
      payloads: [{ PRO_COD: '000002' }],
      callbackUrl: 'https://example.test/massas-launch?aero_action=saida&aero_data=',
      publicAppUrl: 'https://example.test',
    });

    redeemBridgeTicket(db, issued.ticket, vaultKey);
    storeBridgeTicketResult(db, issued.ticket, { exitNumber: 99 });

    // Inside the 10-minute window
    const inside = readLastBridgeTicketResult(db, fixtures.admin.id, 'saida');
    assert.deepEqual(inside, { ok: true, data: { exitNumber: 99 } });

    // Outside the 10-minute window
    db.prepare("UPDATE aero_bridge_tickets SET result_at = datetime('now', '-11 minutes')").run();
    const outside = readLastBridgeTicketResult(db, fixtures.admin.id, 'saida');
    assert.deepEqual(outside, { ok: false, code: 'AERO_TICKET_RESULT_NOT_FOUND' });
  });

  it('readLastBridgeTicketResult never returns another user result', () => {
    const issuedWorker = issueBridgeTicket(db, {
      userId: fixtures.worker.id,
      action: 'entrada',
      payloads: [{ PRO_COD: '000003' }],
      callbackUrl: 'https://example.test/massas-launch?aero_action=entrada&aero_data=',
      publicAppUrl: 'https://example.test',
    });

    redeemBridgeTicket(db, issuedWorker.ticket, vaultKey);
    storeBridgeTicketResult(db, issuedWorker.ticket, { workerData: true });

    // Worker can read their result
    const workerResult = readLastBridgeTicketResult(db, fixtures.worker.id, 'entrada');
    assert.deepEqual(workerResult, { ok: true, data: { workerData: true } });

    // Admin cannot read worker's result
    const adminResult = readLastBridgeTicketResult(db, fixtures.admin.id, 'entrada');
    assert.deepEqual(adminResult, { ok: false, code: 'AERO_TICKET_RESULT_NOT_FOUND' });
  });
});
