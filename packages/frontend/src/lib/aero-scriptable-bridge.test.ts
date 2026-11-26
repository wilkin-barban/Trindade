import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { readAeroBatchResult } from './aero-feedback';

const here = dirname(fileURLToPath(import.meta.url));
const BRIDGE_SOURCE = readFileSync(resolve(here, '..', '..', 'scriptable', 'Aero32Bridge.js'), 'utf8');

interface MockOutcome {
  response?: string;
  json?: unknown;
  error?: Error;
}

interface BridgeRunResult {
  openedUrl: string | null;
  storedResult: unknown;
  completed: boolean;
  calls: Array<{ url: string; body: string | null }>;
}

async function runBridgeScript(
  envelope: Record<string, unknown>,
  erpResponder: (body: string | null, index: number, url: string) => MockOutcome,
): Promise<BridgeRunResult> {
  let openedUrl: string | null = null;
  let storedResult: unknown = undefined;
  let completed = false;
  const calls: Array<{ url: string; body: string | null }> = [];
  let erpCallIndex = 0;

  class MockRequest {
    url: string;
    method = 'GET';
    headers: Record<string, string> = {};
    body: string | null = null;
    allowInsecureRequest = false;
    timeoutInterval = 10;

    constructor(url: string) {
      this.url = url;
    }

    async loadJSON() {
      if (this.url.includes('/bridge-tickets/redeem')) {
        return envelope;
      }
      throw new Error(`Unexpected JSON request to ${this.url}`);
    }

    async loadString() {
      if (this.url.includes('/bridge-tickets/result')) {
        storedResult = JSON.parse(this.body ?? 'null');
        return '{"ok":true}';
      }
      calls.push({ url: this.url, body: this.body });
      const outcome = erpResponder(this.body, erpCallIndex, this.url);
      erpCallIndex += 1;
      if (outcome.error) {
        throw outcome.error;
      }
      if (outcome.json !== undefined) {
        return JSON.stringify(outcome.json);
      }
      return outcome.response ?? '';
    }
  }

  class MockAlert {
    title = '';
    message = '';
    addAction() {}
    present() {
      return Promise.resolve(0);
    }
  }

  const context = {
    args: {
      queryParameters: {
        ticket: 'ticket-token',
        ticketUrl: 'https://trindade.test/api/integration/aero/bridge-tickets/redeem',
      },
    },
    Request: MockRequest,
    Alert: MockAlert,
    Safari: {
      open(url: string) {
        openedUrl = url;
      },
    },
    Script: {
      complete() {
        completed = true;
      },
    },
    encodeURIComponent,
  };

  const wrapped = `(async () => {\n${BRIDGE_SOURCE}\n})()`;
  await vm.runInNewContext(wrapped, context);
  return { openedUrl, storedResult, completed, calls };
}

describe('Aero32Bridge batch resilience', () => {
  it('keeps entrada_lote batch parseable as JSON when item 1+ fails with a network timeout', async () => {
    const body1 = JSON.stringify({ PRO_COD: '000060' });
    const body2 = JSON.stringify({ PRO_COD: '005000' });
    const body3 = JSON.stringify({ PRO_COD: '001047' });

    const result = await runBridgeScript(
      {
        url: 'http://192.168.25.250:1453/api/entradasitem',
        headers: { Authorization: 'Basic abc' },
        body: body1,
        bodies: [body1, body2, body3],
        callback: 'https://trindade.test/massas-history?aero_action=entrada_lote&aero_data=',
        resultUrl: '/api/integration/aero/bridge-tickets/result',
        steps: [
          {
            url: 'http://192.168.25.250:1453/api/entradasitem',
            method: 'POST',
            headers: { Authorization: 'Basic abc' },
            body: body1,
            bodies: [body1, body2, body3],
          },
          {
            url: 'http://192.168.25.250:1453/api/movimentoitem?_method=PATCH',
            method: 'POST',
            headers: { Authorization: 'Basic abc' },
            body: JSON.stringify({ ENTSAI: 'E', _method: 'PATCH' }),
          },
        ],
      },
      (_body, idx) => {
        if (idx === 0) return { json: { success: true, data: { ENT_LAN: 101 } } };
        if (idx === 1) return { error: new Error('The request timed out.') };
        if (idx === 2) return { json: { success: true, data: { ENT_LAN: 103 } } };
        return { json: { success: true, data: [] } };
      },
    );

    assert.equal(result.completed, true);
    assert.equal(
      result.openedUrl,
      'https://trindade.test/massas-history?aero_action=entrada_lote&aero_data=&aero_result=stored',
    );
    const data = (result.storedResult as { data: { launch: unknown; read: unknown } }).data;
    const outcome = readAeroBatchResult(data.launch, 3);
    assert.equal(outcome.state, 'partial');
    assert.equal(outcome.ok, 2);
    assert.equal(outcome.failed, 1);
    assert.deepEqual(outcome.failedIndexes, [1]);
    assert.equal(outcome.message, 'The request timed out.');
  });

  it('keeps saida batch parseable as JSON when item 1+ fails or returns non-JSON HTML', async () => {
    const body1 = JSON.stringify({ PRO_COD: '001356' });
    const body2 = JSON.stringify({ PRO_COD: '001355' });
    const body3 = JSON.stringify({ PRO_COD: '001900' });

    const result = await runBridgeScript(
      {
        url: 'http://192.168.25.250:1453/api/saidasitem',
        headers: { Authorization: 'Basic abc' },
        body: body1,
        bodies: [body1, body2, body3],
        callback: 'https://trindade.test/salida-history?aero_action=saida&aero_data=',
        resultUrl: '/api/integration/aero/bridge-tickets/result',
      },
      (_body, idx) => {
        if (idx === 0) return { json: { success: true, message: 'Despesa lançada com sucesso' } };
        if (idx === 1) return { response: '<html>502 Bad Gateway</html>' };
        return { json: { success: true, message: 'Despesa lançada com sucesso' } };
      },
    );

    const stored = (result.storedResult as { data: unknown }).data;
    const outcome = readAeroBatchResult(stored, 3);
    assert.equal(outcome.state, 'partial');
    assert.equal(outcome.ok, 2);
    assert.equal(outcome.failed, 1);
    assert.deepEqual(outcome.failedIndexes, [1]);
  });

  it('still aborts with wifi_required when the first item throws a connectivity error', async () => {
    const body1 = JSON.stringify({ PRO_COD: '000060' });
    const body2 = JSON.stringify({ PRO_COD: '005000' });

    const result = await runBridgeScript(
      {
        url: 'http://192.168.25.250:1453/api/entradasitem',
        headers: { Authorization: 'Basic abc' },
        body: body1,
        bodies: [body1, body2],
        callback: 'https://trindade.test/massas-history?aero_action=entrada_lote&aero_data=',
        resultUrl: '/api/integration/aero/bridge-tickets/result',
        steps: [
          {
            url: 'http://192.168.25.250:1453/api/entradasitem',
            method: 'POST',
            headers: { Authorization: 'Basic abc' },
            body: body1,
            bodies: [body1, body2],
          },
        ],
      },
      () => ({ error: new Error('The request timed out.') }),
    );

    assert.equal(result.calls.length, 1);
    assert.equal(result.storedResult, undefined);
    assert.ok(result.openedUrl?.includes('aero_error=wifi_required'));
  });

  it('keeps two-side movimentos merge intact on the legacy branch', async () => {
    const result = await runBridgeScript(
      {
        url: 'http://192.168.25.250:1453/api/movimentoitem?_method=PATCH',
        headers: { Authorization: 'Basic abc' },
        body: JSON.stringify({ ENTSAI: 'E' }),
        bodies: [JSON.stringify({ ENTSAI: 'E' }), JSON.stringify({ ENTSAI: 'S' })],
        callback: 'https://trindade.test/reports?aero_action=movimentos&aero_data=',
        resultUrl: '/api/integration/aero/bridge-tickets/result',
      },
      (_body, idx) =>
        idx === 0
          ? { json: { success: true, data: [{ ENT_LAN: 1 }], skipped: 1 } }
          : { json: { success: true, data: [{ ENT_LAN: 2 }], skipped: 2 } },
    );

    assert.deepEqual((result.storedResult as { data: unknown }).data, {
      success: true,
      data: [{ ENT_LAN: 1 }, { ENT_LAN: 2 }],
      skipped: 3,
    });
  });

  it('handles empty error messages, special characters, whitespace bodies, and inline callback without resultUrl', async () => {
    const body1 = JSON.stringify({ PRO_COD: '001356' });
    const body2 = JSON.stringify({ PRO_COD: '001355' });
    const body3 = JSON.stringify({ PRO_COD: '001900' });
    const body4 = JSON.stringify({ PRO_COD: '001357' });

    const result = await runBridgeScript(
      {
        url: 'http://192.168.25.250:1453/api/saidasitem',
        headers: { Authorization: 'Basic abc' },
        body: body1,
        bodies: [body1, body2, body3, body4],
        callback: 'https://trindade.test/salida-history?aero_action=saida&aero_data=',
      },
      (_body, idx) => {
        if (idx === 0) return { json: { success: true } };
        if (idx === 1) return { error: new Error('Line1\n"quote" \\ slash') };
        if (idx === 2) return { response: '   \n\t ' };
        return { error: new Error('') };
      },
    );

    assert.equal(result.completed, true);
    assert.equal(result.storedResult, undefined);
    const raw = decodeURIComponent((result.openedUrl ?? '').split('aero_data=')[1] ?? '');
    const parsed = JSON.parse(raw) as Array<{ success: boolean; message?: string }>;
    assert.deepEqual(parsed, [
      { success: true },
      { success: false, message: 'Line1\n"quote" \\ slash' },
      { success: false, message: 'Error al enviar al ERP' },
      { success: false, message: 'Error al enviar al ERP' },
    ]);
  });
});
