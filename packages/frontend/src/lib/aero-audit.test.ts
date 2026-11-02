import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

globalThis.localStorage = new MockStorage();
globalThis.sessionStorage = new MockStorage();
globalThis.window = {
  location: { pathname: '/massas-launch', href: '/massas-launch' },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
} as any;

const {
  aeroErrorCode,
  aeroImportAuditEvent,
  aeroReceiptsAuditEvent,
  aeroSyncRefusedEvent,
  postAeroAuditEvent,
} = await import('./aero-audit');

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(answer: Response | Error): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    if (answer instanceof Error) throw answer;
    return answer;
  }) as unknown as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

describe('postAeroAuditEvent', () => {
  test('names the client, correlates the attempt and posts to the integration log route', async () => {
    const stub = stubFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    try {
      const kept = await postAeroAuditEvent({
        event: 'launch_sync',
        phase: 'requested',
        destinationUrl: 'http://192.168.1.50:8000/api/entradasitem',
        httpStatus: null,
        payload: { PRO_COD: '5000', PRO_QTD: 20 },
        attemptId: 'attempt-1',
      });

      assert.equal(kept, true);
      assert.equal(stub.calls.length, 1);
      assert.equal(stub.calls[0]!.url, '/api/integration/aero/log');
      assert.equal(stub.calls[0]!.init.method, 'POST');
      const sent = JSON.parse(String(stub.calls[0]!.init.body));
      assert.equal(sent.event, 'launch_sync');
      assert.equal(sent.phase, 'requested');
      assert.equal(sent.destinationUrl, 'http://192.168.1.50:8000/api/entradasitem');
      assert.equal(sent.httpStatus, null);
      assert.deepEqual(sent.payload, { PRO_COD: '5000', PRO_QTD: 20 });
      // The three fields the server needs to attribute and correlate the line are not the caller's job.
      assert.equal(sent.client, 'web');
      assert.equal(sent.attemptId, 'attempt-1');
      assert.equal(typeof sent.durationMs, 'number');
    } finally {
      stub.restore();
    }
  });

  test('measures the duration from the attempt start and never sends the start itself', async () => {
    const stub = stubFetch(new Response('{}', { status: 200 }));
    try {
      await postAeroAuditEvent({
        event: 'launch_sync',
        phase: 'result',
        destinationUrl: 'http://192.168.1.50:8000/api/entradasitem',
        startedAt: Date.now() - 1234,
      });

      const sent = JSON.parse(String(stub.calls[0]!.init.body));
      assert.ok(sent.durationMs >= 1234, `expected >= 1234, got ${sent.durationMs}`);
      assert.equal('startedAt' in sent, false, 'startedAt is a client concern, not a column');
    } finally {
      stub.restore();
    }
  });

  test('trims the note to the column the server enforces instead of being refused', async () => {
    const stub = stubFetch(new Response('{}', { status: 200 }));
    try {
      await postAeroAuditEvent({
        event: 'launch_sync',
        phase: 'requested',
        destinationUrl: 'http://192.168.1.50:8000/api/entradasitem',
        note: 'n'.repeat(400),
      });

      const sent = JSON.parse(String(stub.calls[0]!.init.body));
      assert.equal(sent.note.length, 256);
    } finally {
      stub.restore();
    }
  });

  test('sends the failure as a stable AERO_ code and keeps the ERP sentence after it', async () => {
    const stub = stubFetch(new Response('{}', { status: 200 }));
    try {
      await postAeroAuditEvent({
        event: 'launch_sync',
        phase: 'result',
        destinationUrl: 'http://192.168.1.50:8000/api/entradasitem',
        error: 'Usuário ou senha inválidos no ERP',
      });

      const sent = JSON.parse(String(stub.calls[0]!.init.body));
      assert.ok(sent.error.startsWith('AERO_'), sent.error);
      assert.ok(sent.error.includes('Usuário ou senha inválidos'), 'the detail a person needs survives');
    } finally {
      stub.restore();
    }
  });

  test('caps a long failure at 1024 characters, code first', async () => {
    const stub = stubFetch(new Response('{}', { status: 200 }));
    try {
      await postAeroAuditEvent({
        event: 'launch_sync',
        phase: 'result',
        destinationUrl: 'http://192.168.1.50:8000/api/entradasitem',
        error: 'x'.repeat(3000),
      });

      const sent = JSON.parse(String(stub.calls[0]!.init.body));
      assert.equal(sent.error.length, 1024);
      assert.ok(sent.error.startsWith('AERO_'));
    } finally {
      stub.restore();
    }
  });

  test('answers false instead of throwing when the audit trail is unavailable', async () => {
    const stub = stubFetch(new TypeError('Failed to fetch'));
    try {
      const kept = await postAeroAuditEvent({
        event: 'test_connection',
        destinationUrl: 'http://192.168.1.50:8000/api/usuarios/',
        error: 'blocked: mixed_content',
      });

      assert.equal(kept, false, 'a launch must never fail because the audit trail failed');
    } finally {
      stub.restore();
    }
  });
});

describe('aeroErrorCode', () => {
  test('keeps an already-prefixed code and prefixes a token-shaped one', () => {
    assert.equal(aeroErrorCode('AERO_TIMEOUT'), 'AERO_TIMEOUT');
    assert.equal(aeroErrorCode('movements_unreadable'), 'AERO_MOVEMENTS_UNREADABLE');
    assert.equal(aeroErrorCode('batch_item_failed'), 'AERO_BATCH_ITEM_FAILED');
  });

  test('classifies the sentences the ERP and the browser actually produce', () => {
    assert.equal(aeroErrorCode('Failed to fetch'), 'AERO_UNREACHABLE');
    assert.equal(aeroErrorCode('Usuário ou senha inválidos'), 'AERO_UNAUTHORIZED');
    assert.equal(aeroErrorCode('timeout de 30s'), 'AERO_TIMEOUT');
    assert.equal(aeroErrorCode('blocked: mixed_content'), 'AERO_BLOCKED_MIXED_CONTENT');
    assert.equal(aeroErrorCode('Erro 502 no ERP'), 'AERO_ERP_ERROR');
    assert.equal(aeroErrorCode('qualquer outra coisa'), 'AERO_CLIENT_ERROR');
  });

  test('answers null for no failure at all', () => {
    assert.equal(aeroErrorCode(null), null);
    assert.equal(aeroErrorCode('   '), null);
  });
});

describe('the paths that were operating without a trace', () => {
  test('a receipts read names its lens so it is not confused with the launch screen read', () => {
    const ok = aeroReceiptsAuditEvent({ date: '2026-10-28', insumos: 3, destinationUrl: 'http://erp/movimentoitem' });
    assert.equal(ok.event, 'read_history');
    assert.equal(ok.phase, 'result');
    assert.equal(ok.error, null);
    assert.ok(ok.note?.includes('lens=recebimento'));
    assert.ok(ok.note?.includes('insumos=3'));
  });

  test('a snapshot the backend refused keeps the row and names the code', () => {
    const refused = aeroReceiptsAuditEvent({
      date: '2026-10-28',
      insumos: 0,
      destinationUrl: 'http://erp/movimentoitem',
      error: 'AERO_SNAPSHOT_REFUSED',
    });
    assert.equal(refused.error, 'AERO_SNAPSHOT_REFUSED');
    assert.equal(refused.note?.includes('insumos='), false, 'a refused store has no count to report');
  });

  test('an import records the seat it took, which is what pairs it with the company', () => {
    const imported = aeroImportAuditEvent({ date: '2026-10-28', entLan: 3010, productCode: '000123', boxes: 4 });
    assert.equal(imported.event, 'import');
    assert.equal(imported.destinationUrl, '/api/massas-launch');
    assert.equal(imported.error, null);
    assert.ok(imported.note?.includes('ent_lan=3010'));
    assert.ok(imported.note?.includes('boxes=4'));

    const refused = aeroImportAuditEvent({
      date: '2026-10-28',
      entLan: 3010,
      productCode: '000123',
      boxes: 4,
      error: 'AERO_IMPORT_REFUSED',
    });
    assert.equal(refused.error, 'AERO_IMPORT_REFUSED');
  });

  test('a sync that never started is written instead of passing as silence', () => {
    const refused = aeroSyncRefusedEvent({ date: '2026-10-28', destinationUrl: '/movimentoitem' });
    assert.equal(refused.event, 'read_history');
    assert.equal(refused.phase, 'requested');
    assert.equal(refused.error, 'AERO_NOT_CONFIGURED');
  });
});
