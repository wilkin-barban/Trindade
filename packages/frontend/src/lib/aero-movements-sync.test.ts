import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { triggerAeroMovementsSync } from './aero-mirror.js';
import { AERO_BRIDGE_MARK_KEY } from './aero-watchdog.js';
import type { AeroVaultClient } from './aero-vault.js';
import type { AeroBridgeTicket } from './aero-vault.js';

/**
 * One way to ask the company for the day, so the report's single button and the receipts section cannot
 * drift apart. The helper also answers whether it launched anything: without company access -- or with a
 * server that refused the ticket -- the caller refreshes what it already has instead of leaving a button that
 * promises a sync it cannot start.
 */
const ready = {
  wsUrl: 'http://192.168.0.10:8070',
  username: 'WILKIN',
  hasPassword: true,
  shortcutName: 'Aero32 Bridge',
  syncEnabled: true,
  lastSyncAt: null,
};

/** The three verbs the vault client needs, recorded so a test can read what the page asked for. */
function vaultClient(answer: AeroBridgeTicket | Error): {
  client: AeroVaultClient;
  posts: Array<{ path: string; body: unknown }>;
} {
  const posts: Array<{ path: string; body: unknown }> = [];
  const client: AeroVaultClient = {
    get: async () => {
      throw new Error('the movements sync never reads the vault');
    },
    post: async <T,>(path: string, body: unknown): Promise<T> => {
      posts.push({ path, body });
      if (answer instanceof Error) throw answer;
      return answer as T;
    },
    put: async () => {
      throw new Error('the movements sync never writes the vault');
    },
    del: async () => {
      throw new Error('the movements sync never deletes the vault');
    },
  };
  return { client, posts };
}

const ticket: AeroBridgeTicket = {
  ticket: 'token',
  ticketUrl: 'https://trindademasas.duckdns.org/api/integration/aero/bridge-tickets/redeem',
  expiresAt: '2026-10-30T12:02:00.000Z',
};

describe('triggering the ERP movements sync', () => {
  it('asks for a `movimentos` ticket for the whole day and opens the shortcut with it', async () => {
    const launched: string[] = [];
    const { client, posts } = vaultClient(ticket);

    const fired = await triggerAeroMovementsSync(ready, {
      date: '2026-10-30',
      callbackPath: '/reports',
      navigate: (url) => launched.push(url),
      client,
    });

    assert.equal(fired, true);
    assert.equal(launched.length, 1);

    // What the server was asked for: one action, one payload, and the path the phone must come back to.
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0]!.body, {
      action: 'movimentos',
      payloads: [
        {
          _method: 'PATCH',
          CODFOR: null,
          NOMUSU: null,
          CODPRO: null,
          DTINI: '2026-10-30',
          DTFIM: '2026-10-30',
          ENTSAI: 'E',
        },
      ],
      callbackPath: '/reports?aero_action=movimentos&aero_data=',
    });

    // Lo que recibe el teléfono: el ticket y la URL del canje, en los dos parámetros del deep link.
    assert.ok(launched[0]!.startsWith('scriptable:///run/Aero32Bridge?'), launched[0]);
    const query = new URLSearchParams(launched[0]!.slice(launched[0]!.indexOf('?') + 1));
    assert.equal(query.get('ticket'), 'token');
    assert.equal(query.get('ticketUrl'), ticket.ticketUrl);
    assert.equal(launched[0]!.includes('Authorization'), false, 'no credential travels in the deep link');
    assert.equal(launched[0]!.includes('shortcuts://'), false);
  });

  it('answers false and launches nothing when the device has no company access', async () => {
    const launched: string[] = [];
    const { client, posts } = vaultClient(ticket);

    const fired = await triggerAeroMovementsSync(
      { ...ready, hasPassword: false },
      { date: '2026-10-30', callbackPath: '/reports', navigate: (url) => launched.push(url), client },
    );

    assert.equal(fired, false);
    assert.equal(launched.length, 0);
    assert.equal(posts.length, 0, 'a device without a vault must not even ask for a ticket');
  });

  it('answers false and launches nothing when the server refuses the ticket', async () => {
    const launched: string[] = [];
    const { client, posts } = vaultClient(new Error('503 AERO_VAULT_NOT_CONFIGURED'));

    const fired = await triggerAeroMovementsSync(ready, {
      date: '2026-10-30',
      callbackPath: '/reports',
      navigate: (url) => launched.push(url),
      client,
    });

    assert.equal(fired, false);
    assert.equal(launched.length, 0);
    assert.equal(posts.length, 1);
  });
});

/** A phone's local storage, small enough to prove what the page left behind when it handed over the trip. */
class FakeStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

/**
 * The browser facts the helper reads, installed for one test.
 *
 * `navigator.onLine` and `localStorage` are globals, so they are replaced instead of injected: what is under
 * test is precisely that the module asks the platform before opening a deep link.
 */
function installBrowser(options: { onLine: boolean }): {
  storage: FakeStorage;
  restore: () => void;
} {
  const storage = new FakeStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: options.onLine },
    configurable: true,
    writable: true,
  });
  return {
    storage,
    restore: () => {
      delete (globalThis as { localStorage?: unknown }).localStorage;
      delete (globalThis as { navigator?: unknown }).navigator;
    },
  };
}

describe('triggering the ERP movements sync never opens a trip that cannot happen', () => {
  it('answers false, asks for nothing and leaves no mark when the phone has no network', async (t) => {
    const { storage, restore } = installBrowser({ onLine: false });
    t.after(restore);
    const launched: string[] = [];
    const { client, posts } = vaultClient(ticket);

    const fired = await triggerAeroMovementsSync(ready, {
      date: '2026-10-30',
      callbackPath: '/reports',
      navigate: (url) => launched.push(url),
      client,
    });

    assert.equal(fired, false);
    assert.equal(launched.length, 0, 'sin red no se abre Scriptable');
    assert.equal(posts.length, 0, 'sin red no se pide ni el ticket');
    // Without a trip there is nothing owed, and a mark would warn about a launch that never started.
    assert.equal(storage.getItem(AERO_BRIDGE_MARK_KEY), null);
  });

  it('writes the mark before it hands the phone the deep link', async (t) => {
    const { storage, restore } = installBrowser({ onLine: true });
    t.after(restore);
    const { client } = vaultClient(ticket);
    // Type the shape, not `typeof markAtNavigate`: inside the closure TypeScript has already narrowed the
    // variable to `null`, and the cast would collapse the assertion to `never`.
    // Collected inside the closure instead of assigned to a `let`: TypeScript narrows a `let` initialised to
    // null as `null` for the rest of the flow, and the assertion would collapse to `never`.
    type Mark = { action?: string; date?: string; at?: number };
    const marks: Mark[] = [];

    const fired = await triggerAeroMovementsSync(ready, {
      date: '2026-10-30',
      callbackPath: '/reports',
      navigate: () => {
        const raw = storage.getItem(AERO_BRIDGE_MARK_KEY);
        if (raw) marks.push(JSON.parse(raw) as Mark);
      },
      client,
    });

    assert.equal(fired, true);
    // La marca describe el viaje que está por empezar: acción, día de la planta y el instante de la salida.
    const mark = marks[0];
    assert.ok(mark, 'the mark must exist at the moment the deep link is opened');
    assert.equal(mark.action, 'movimentos');
    assert.equal(mark.date, '2026-10-30');
    assert.equal(typeof mark.at, 'number');
  });

  it('forgets the mark when the navigation itself never happens', async (t) => {
    const { storage, restore } = installBrowser({ onLine: true });
    t.after(restore);
    const { client } = vaultClient(ticket);

    const fired = await triggerAeroMovementsSync(ready, {
      date: '2026-10-30',
      callbackPath: '/reports',
      navigate: () => {
        throw new Error('the deep link was refused');
      },
      client,
    });

    assert.equal(fired, false);
    // Una marca sin viaje dispararía «Scriptable no volvió» sobre algo que nunca salió.
    assert.equal(storage.getItem(AERO_BRIDGE_MARK_KEY), null);
  });
});
