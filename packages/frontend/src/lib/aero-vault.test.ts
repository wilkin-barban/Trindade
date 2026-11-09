import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  AERO_VAULT_SETTINGS_PATH,
  AERO_VAULT_TICKETS_PATH,
  deleteAeroVaultSettings,
  fetchAeroVaultSettings,
  requestAeroBridgeTicket,
  saveAeroVaultSettings,
  type AeroBridgeTicket,
  type AeroVaultClient,
  type AeroVaultSettings,
} from './aero-vault.js';

/**
 * A client double that records instead of fetching.
 *
 * The point of these tests is the body that would leave the page, so the double keeps the exact object it
 * was handed -- not a JSON round trip -- and every assertion about a forgotten key is an assertion about
 * what the server would actually receive.
 */
class FakeClient implements AeroVaultClient {
  readonly gets: string[] = [];
  readonly puts: { path: string; body: unknown }[] = [];
  readonly posts: { path: string; body: unknown }[] = [];
  readonly dels: string[] = [];

  constructor(private readonly response: unknown = {}) {}

  async get<T>(path: string): Promise<T> {
    this.gets.push(path);
    return this.response as T;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    this.posts.push({ path, body });
    return this.response as T;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    this.puts.push({ path, body });
    return this.response as T;
  }

  async del<T = void>(path: string): Promise<T> {
    this.dels.push(path);
    return undefined as T;
  }
}

const configured: AeroVaultSettings = {
  configured: true,
  wsUrl: 'http://192.168.25.250:1453/api',
  username: 'WILKIN',
  hasPassword: true,
  updatedAt: '2026-02-10T12:00:00.000Z',
};

function putBody(client: FakeClient): Record<string, unknown> {
  assert.equal(client.puts.length, 1);
  const body = client.puts[0].body;
  assert.equal(typeof body, 'object');
  assert.notEqual(body, null);
  return body as Record<string, unknown>;
}

function postBody(client: FakeClient): Record<string, unknown> {
  assert.equal(client.posts.length, 1);
  const body = client.posts[0].body;
  assert.equal(typeof body, 'object');
  assert.notEqual(body, null);
  return body as Record<string, unknown>;
}

describe('aero vault settings', () => {
  it('reads the settings in the shape of the contract, without any password field', async () => {
    const client = new FakeClient(configured);

    const settings = await fetchAeroVaultSettings(client);

    assert.deepEqual(client.gets, [AERO_VAULT_SETTINGS_PATH]);
    assert.deepEqual(settings, configured);
    assert.deepEqual(Object.keys(settings).sort(), [
      'configured',
      'hasPassword',
      'updatedAt',
      'username',
      'wsUrl',
    ]);
    assert.equal('password' in settings, false);
  });

  it('drops a secret the server should never send, instead of carrying it to the page', async () => {
    const client = new FakeClient({ ...configured, password: 'segredo', passwordCiphertext: 'ff00' });

    const settings = await fetchAeroVaultSettings(client);

    assert.equal('password' in settings, false);
    assert.equal('passwordCiphertext' in settings, false);
    assert.equal(settings.hasPassword, true);
  });

  it('tolerates a server answer with missing fields', async () => {
    const client = new FakeClient({ configured: false });

    const settings = await fetchAeroVaultSettings(client);

    assert.deepEqual(settings, {
      configured: false,
      wsUrl: null,
      username: null,
      hasPassword: false,
      updatedAt: null,
    });
  });

  it('sends a typed password once, next to the url and the user', async () => {
    const client = new FakeClient({ ...configured, hasPassword: true });

    await saveAeroVaultSettings(
      { wsUrl: configured.wsUrl!, username: 'WILKIN', password: 'segredo-do-erp' },
      client,
    );

    assert.equal(client.puts.length, 1);
    assert.equal(client.puts[0].path, AERO_VAULT_SETTINGS_PATH);
    assert.deepEqual(putBody(client), {
      wsUrl: configured.wsUrl,
      username: 'WILKIN',
      password: 'segredo-do-erp',
    });
  });

  it('omits the password key for an empty string so saving cannot mean clearing it', async () => {
    const client = new FakeClient(configured);

    await saveAeroVaultSettings({ wsUrl: configured.wsUrl!, username: 'WILKIN', password: '' }, client);

    const body = putBody(client);
    assert.deepEqual(Object.keys(body).sort(), ['username', 'wsUrl']);
    assert.equal('password' in body, false);
  });

  it('omits the password key when it is absent, so the stored secret stays untouched', async () => {
    const client = new FakeClient(configured);

    await saveAeroVaultSettings({ wsUrl: configured.wsUrl!, username: 'WILKIN' }, client);

    const body = putBody(client);
    assert.deepEqual(Object.keys(body).sort(), ['username', 'wsUrl']);
    assert.equal('password' in body, false);
  });

  it('treats a whitespace-only password as absent but never trims a real one', async () => {
    const blank = new FakeClient(configured);
    await saveAeroVaultSettings(
      { wsUrl: configured.wsUrl!, username: 'WILKIN', password: '   ' },
      blank,
    );
    assert.equal('password' in putBody(blank), false);

    const spaced = new FakeClient(configured);
    await saveAeroVaultSettings(
      { wsUrl: configured.wsUrl!, username: 'WILKIN', password: '  segredo  ' },
      spaced,
    );
    assert.equal(putBody(spaced).password, '  segredo  ');
  });

  it('returns the settings the server answered with after a save', async () => {
    const client = new FakeClient({ ...configured, hasPassword: false, updatedAt: null });

    const settings = await saveAeroVaultSettings(
      { wsUrl: configured.wsUrl!, username: 'WILKIN', password: 'x' },
      client,
    );

    assert.deepEqual(settings, {
      configured: true,
      wsUrl: configured.wsUrl,
      username: 'WILKIN',
      hasPassword: false,
      updatedAt: null,
    });
  });

  it('deletes the vault with a DELETE and returns nothing to show', async () => {
    const client = new FakeClient();

    const result = await deleteAeroVaultSettings(client);

    assert.deepEqual(client.dels, [AERO_VAULT_SETTINGS_PATH]);
    assert.deepEqual(client.puts, []);
    assert.equal(result, undefined);
  });
});

describe('aero bridge tickets', () => {
  it('posts the action, the payloads and the callback path', async () => {
    const ticket: AeroBridgeTicket = {
      ticket: 'tok_abc',
      ticketUrl: 'https://trindademasas.duckdns.org/api/integration/aero/bridge-tickets/redeem',
      expiresAt: '2026-02-10T12:02:00.000Z',
    };
    const client = new FakeClient(ticket);
    const payloads = [
      { PRO_COD: '005000', PRO_QTD: 2000 },
      { PRO_COD: '001045', PRO_QTD: 800 },
    ];

    const answer = await requestAeroBridgeTicket(
      { action: 'entrada_lote', payloads, callbackPath: '/massas' },
      client,
    );

    assert.equal(client.posts.length, 1);
    assert.equal(client.posts[0].path, AERO_VAULT_TICKETS_PATH);
    assert.deepEqual(postBody(client), {
      action: 'entrada_lote',
      payloads,
      callbackPath: '/massas',
    });
    assert.deepEqual(answer, ticket);
  });

  it('omits the callback path when it is not given', async () => {
    const client = new FakeClient({ ticket: 't', ticketUrl: 'u', expiresAt: 'e' });

    await requestAeroBridgeTicket({ action: 'test', payloads: [{}] }, client);

    const body = postBody(client);
    assert.deepEqual(Object.keys(body).sort(), ['action', 'payloads']);
    assert.equal('callbackPath' in body, false);
  });

  it('sends only the three keys of the contract, even if the caller passes more', async () => {
    const client = new FakeClient({ ticket: 't', ticketUrl: 'u', expiresAt: 'e' });

    await requestAeroBridgeTicket(
      {
        action: 'movimentos',
        payloads: [{ _method: 'PATCH', ENTSAI: 'E' }],
        callbackPath: '/massas',
        password: 'segredo',
        headers: { Authorization: 'Basic xxx' },
      } as never,
      client,
    );

    assert.deepEqual(Object.keys(postBody(client)).sort(), ['action', 'callbackPath', 'payloads']);
  });
});

/**
 * Any read or write of the web storage has to blow up: the whole point of the vault is that the secret
 * never lands in this browser, so a module that touched `localStorage` would undo the delivery.
 */
function forbiddenStorage(name: string): object {
  const boom = (what: string) => () => {
    throw new Error(`${name} must not be used: ${what}`);
  };

  return new Proxy(
    {},
    {
      get: boom('get'),
      set: boom('set'),
      has: boom('has'),
      deleteProperty: boom('deleteProperty'),
      ownKeys: boom('ownKeys'),
      getOwnPropertyDescriptor: boom('getOwnPropertyDescriptor'),
    },
  );
}

describe('aero vault and web storage', () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();

  function replaceStorage(): void {
    for (const name of ['localStorage', 'sessionStorage']) {
      originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        value: forbiddenStorage(name),
        configurable: true,
        writable: true,
      });
    }
  }

  afterEach(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        delete (globalThis as Record<string, unknown>)[name];
      }
    }
    originals.clear();
  });

  it('never touches localStorage or sessionStorage in any of its functions', async () => {
    replaceStorage();

    const settingsClient = new FakeClient(configured);
    assert.deepEqual(await fetchAeroVaultSettings(settingsClient), configured);

    const saveClient = new FakeClient(configured);
    await saveAeroVaultSettings(
      { wsUrl: configured.wsUrl!, username: 'WILKIN', password: 'segredo-do-erp' },
      saveClient,
    );

    const deleteClient = new FakeClient();
    await deleteAeroVaultSettings(deleteClient);

    const ticketClient = new FakeClient({ ticket: 't', ticketUrl: 'u', expiresAt: 'e' });
    await requestAeroBridgeTicket(
      { action: 'entrada', payloads: [{ PRO_COD: '005000' }], callbackPath: '/massas' },
      ticketClient,
    );

    // The bodies carry the secret only on the way out, and the response side keeps no password field.
    assert.equal(putBody(saveClient).password, 'segredo-do-erp');
    assert.equal('password' in (await fetchAeroVaultSettings(settingsClient)), false);
  });
});
