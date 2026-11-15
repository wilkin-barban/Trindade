import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock browser storage and window globals before importing client.ts
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

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();

globalThis.localStorage = mockLocalStorage;
globalThis.sessionStorage = mockSessionStorage;
globalThis.window = {
  location: { pathname: '/dashboard', href: '/dashboard' } as any,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
} as any;

// Dynamic import of client after globals are configured
const { api, consumeSessionExpiredNotice, handleUnauthorizedRedirect, getAccessToken, setAccessToken } =
  await import('./client');

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  credentials?: RequestCredentials;
}

const originalFetch = globalThis.fetch;
let recordedRequests: RecordedRequest[] = [];

function resetEnvironment() {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  recordedRequests = [];
  setAccessToken(null);
  globalThis.window.location.pathname = '/dashboard';
  globalThis.window.location.href = '/dashboard';
  globalThis.fetch = originalFetch;
}

function record(input: RequestInfo | URL, init?: RequestInit): RecordedRequest {
  let body: any = null;
  if (init?.body && typeof init.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  const recorded: RecordedRequest = {
    url: String(input),
    method: init?.method || 'GET',
    headers: (init?.headers as Record<string, string>) || {},
    body,
    credentials: init?.credentials,
  };
  recordedRequests.push(recorded);
  return recorded;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('an expired session closes the ERP session it belonged to', () => {
  // The session ending is a logout the operator did not ask for, and it has to close the same things: the
  // in-memory access token, the plant password this tab held and the auto-read mark. A mark left behind fires
  // a read for a launch of a session that is gone.
  resetEnvironment();
  setAccessToken('expired-access-token');
  mockLocalStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'test' }));
  mockLocalStorage.setItem('trindade.aero.auto-read.v1', JSON.stringify({ date: '2026-11-03', at: Date.now() }));
  mockSessionStorage.setItem('trindade.aero.session.v1', 'secret');

  handleUnauthorizedRedirect();

  assert.equal(getAccessToken(), null);
  assert.equal(mockLocalStorage.getItem('auth_user'), null);
  assert.equal(mockSessionStorage.getItem('trindade.aero.session.v1'), null);
  assert.equal(mockLocalStorage.getItem('trindade.aero.auto-read.v1'), null);
});

test('no credential is ever written to localStorage', async (t) => {
  await t.test('login keeps the access token in memory and never persists it', async () => {
    resetEnvironment();
    globalThis.fetch = async (input, init) => {
      record(input, init);
      return json({
        token: 'logged-in-access-token',
        expiresIn: 7200,
        user: { id: 10, username: 'testuser', role: 'Administrador' },
      });
    };

    await api.post('/auth/login', { username: 'testuser', password: 'secretpassword123' });

    assert.equal(getAccessToken(), 'logged-in-access-token');
    assert.equal(mockLocalStorage.getItem('auth_token'), null);
    assert.equal(mockLocalStorage.getItem('auth_refresh_token'), null);
    // The cookie is the session; the browser has to be told to keep it.
    assert.equal(recordedRequests[0].credentials, 'include');
    assert.equal(recordedRequests[0].headers['X-Trindade-Client'], 'web');
  });

  await t.test('a token left behind by an older build is purged, not reused', async () => {
    resetEnvironment();
    mockLocalStorage.setItem('auth_token', 'legacy-access-token');
    mockLocalStorage.setItem('auth_refresh_token', 'legacy-refresh-token');
    mockLocalStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'test' }));

    handleUnauthorizedRedirect();

    assert.equal(mockLocalStorage.getItem('auth_token'), null);
    assert.equal(mockLocalStorage.getItem('auth_refresh_token'), null);
  });
});

test('the web client declares itself on every call', async (t) => {
  await t.test('sends X-Trindade-Client: web, and a per-request attempt when asked', async () => {
    resetEnvironment();
    setAccessToken('valid-access-token');

    globalThis.fetch = async (input, init) => {
      record(input, init);
      return json({ ok: true });
    };

    await api.get('/integration/aero/movements?date=2026-11-03');
    await api.post(
      '/integration/aero/movements',
      { date: '2026-11-03', movements: [] },
      { headers: { 'X-Trindade-Attempt': 'attempt-9' } },
    );

    assert.equal(recordedRequests[0].headers['X-Trindade-Client'], 'web');
    assert.equal(recordedRequests[1].headers['X-Trindade-Client'], 'web');
    assert.equal(recordedRequests[1].headers['X-Trindade-Attempt'], 'attempt-9');
    // The attempt is the caller's, not something the transport invents for every request.
    assert.equal(recordedRequests[0].headers['X-Trindade-Attempt'], undefined);
  });
});

test('session rotation and cookie renewal', async (t) => {
  await t.test('expired access token -> cookie renewal -> original request retried once with new token', async () => {
    resetEnvironment();
    setAccessToken('expired-access-token');
    mockLocalStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'test' }));

    let normalCallCount = 0;
    let refreshCallCount = 0;

    globalThis.fetch = async (input, init) => {
      const req = record(input, init);

      if (req.url.endsWith('/api/users/options')) {
        normalCallCount++;
        if (normalCallCount === 1) {
          assert.equal(req.headers['Authorization'], 'Bearer expired-access-token');
          return json({ error: 'Invalid or expired token' }, 401);
        }
        assert.equal(req.headers['Authorization'], 'Bearer fresh-access-token');
        return json({ users: [{ id: 1, name: 'Wilkin' }] });
      }

      if (req.url.endsWith('/api/auth/refresh')) {
        refreshCallCount++;
        assert.equal(req.method, 'POST');
        // The browser presents the session in its HttpOnly cookie: no token in the body, no bearer header,
        // and the browser has to be told to send it.
        assert.equal(req.body, null);
        assert.equal(req.headers['Authorization'], undefined);
        assert.equal(req.credentials, 'include');
        assert.equal(req.headers['X-Trindade-Client'], 'web');
        return json({ token: 'fresh-access-token', expiresIn: 7200 });
      }

      return new Response('Not found', { status: 404 });
    };

    const result = await api.get<{ users: Array<{ id: number; name: string }> }>('/users/options');

    assert.deepEqual(result, { users: [{ id: 1, name: 'Wilkin' }] });
    assert.equal(normalCallCount, 2, 'expected original request to be called then retried');
    assert.equal(refreshCallCount, 1, 'expected exactly one refresh call');
    // The renewed access token stays in memory; the rotated refresh token lives in the cookie and never reaches
    // this code, so nothing here could write it down.
    assert.equal(getAccessToken(), 'fresh-access-token');
    assert.equal(mockLocalStorage.getItem('auth_token'), null);
    assert.equal(mockLocalStorage.getItem('auth_refresh_token'), null);
  });

  await t.test('a reload renews from the cookie alone, with no token in memory', async () => {
    resetEnvironment();
    mockLocalStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'test' }));

    globalThis.fetch = async (input, init) => {
      const req = record(input, init);
      if (req.url.endsWith('/api/auth/refresh')) {
        assert.equal(req.credentials, 'include');
        return json({ token: 'renewed-from-cookie', expiresIn: 7200 });
      }
      if (req.url.endsWith('/api/auth/me')) {
        assert.equal(req.headers['Authorization'], 'Bearer renewed-from-cookie');
        return json({ user: { id: 1, username: 'test', role: 'Administrador' } });
      }
      return new Response('Not found', { status: 404 });
    };

    const { refreshTokenOnce } = await import('./client');
    assert.equal(await refreshTokenOnce(null), true);
    assert.equal(getAccessToken(), 'renewed-from-cookie');

    const me = await api.get<{ user: { username: string } }>('/auth/me');
    assert.equal(me.user.username, 'test');
  });

  await t.test('failed renewal -> session cleared and redirected to login', async () => {
    resetEnvironment();
    setAccessToken('expired-access-token');
    mockLocalStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'test' }));

    globalThis.fetch = async (input, init) => {
      const req = record(input, init);
      if (req.url.endsWith('/api/users/options')) {
        return json({ error: 'Invalid or expired token' }, 401);
      }
      if (req.url.endsWith('/api/auth/refresh')) {
        return json({ error: 'Invalid or expired session' }, 401);
      }
      return new Response('Not found', { status: 404 });
    };

    await assert.rejects(
      async () => {
        await api.get('/users/options');
      },
      (err: any) => {
        assert.equal(err.name, 'ApiClientError');
        assert.equal(err.status, 401);
        return true;
      }
    );

    assert.equal(getAccessToken(), null);
    assert.equal(mockLocalStorage.getItem('auth_user'), null);
    assert.equal(mockLocalStorage.getItem('auth_token'), null);
    assert.equal(consumeSessionExpiredNotice(), true);
    assert.equal(globalThis.window.location.href, '/login');
  });

  await t.test('no credential ever travels on a normal request', async () => {
    resetEnvironment();
    setAccessToken('valid-access-token');

    globalThis.fetch = async (input, init) => {
      record(input, init);
      return json({ ok: true });
    };

    await api.get('/reports');
    await api.post('/stock/add-entry', { product_id: 1, quantity: 10 });

    for (const req of recordedRequests) {
      assert.notEqual(req.url, '/api/auth/refresh');
      // Authorization header must ONLY carry the access token
      assert.equal(req.headers['Authorization'], 'Bearer valid-access-token');
      assert.equal(req.headers['Cookie'], undefined);
      // Body must never contain a refresh token
      if (req.body && typeof req.body === 'object') {
        assert.equal(req.body.refreshToken, undefined);
      }
    }
  });

  await t.test('two parallel 401s produce one single refresh call (no stampede)', async () => {
    resetEnvironment();
    setAccessToken('expired-access-token');

    let refreshCallCount = 0;
    let reportsCallCount = 0;
    let productsCallCount = 0;

    globalThis.fetch = async (input, init) => {
      const req = record(input, init);

      if (req.url.endsWith('/api/reports')) {
        reportsCallCount++;
        if (req.headers['Authorization'] === 'Bearer expired-access-token') {
          return json({ error: 'Invalid or expired token' }, 401);
        }
        return json({ reports: [] });
      }

      if (req.url.endsWith('/api/products')) {
        productsCallCount++;
        if (req.headers['Authorization'] === 'Bearer expired-access-token') {
          return json({ error: 'Invalid or expired token' }, 401);
        }
        return json({ products: [] });
      }

      if (req.url.endsWith('/api/auth/refresh')) {
        refreshCallCount++;
        // Simulate network latency for refresh
        await new Promise((resolve) => setTimeout(resolve, 30));
        return json({ token: 'renewed-access-token', expiresIn: 7200 });
      }

      return new Response('Not found', { status: 404 });
    };

    const [reportsRes, productsRes] = await Promise.all([
      api.get<{ reports: any[] }>('/reports'),
      api.get<{ products: any[] }>('/products'),
    ]);

    assert.deepEqual(reportsRes, { reports: [] });
    assert.deepEqual(productsRes, { products: [] });
    assert.equal(refreshCallCount, 1, 'two concurrent 401s must trigger only ONE refresh call');
    assert.equal(reportsCallCount, 2, 'reports request retried once with new token');
    assert.equal(productsCallCount, 2, 'products request retried once with new token');
    assert.equal(getAccessToken(), 'renewed-access-token');
  });

  await t.test('retried request that still returns 401 fails without infinite loop', async () => {
    resetEnvironment();
    setAccessToken('expired-access-token');

    let callCount = 0;
    let refreshCount = 0;

    globalThis.fetch = async (input, init) => {
      const req = record(input, init);
      if (req.url.endsWith('/api/users/options')) {
        callCount++;
        return json({ error: 'Invalid or expired token' }, 401);
      }
      if (req.url.endsWith('/api/auth/refresh')) {
        refreshCount++;
        return json({ token: 'token-that-also-fails', expiresIn: 7200 });
      }
      return new Response('Not found', { status: 404 });
    };

    await assert.rejects(
      async () => {
        await api.get('/users/options');
      },
      (err: any) => {
        assert.equal(err.name, 'ApiClientError');
        assert.equal(err.status, 401);
        return true;
      }
    );

    assert.equal(refreshCount, 1, 'must refresh at most once');
    assert.equal(callCount, 2, 'must retry at most once');
    assert.equal(consumeSessionExpiredNotice(), true);
    assert.equal(getAccessToken(), null);
  });

  await t.test('login 401 with Invalid credentials never triggers refresh', async () => {
    resetEnvironment();

    let refreshCalled = false;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/login')) {
        return json({ error: 'Invalid credentials' }, 401);
      }
      if (url.endsWith('/api/auth/refresh')) {
        refreshCalled = true;
        return json({ ok: true });
      }
      return new Response('Not found', { status: 404 });
    };

    await assert.rejects(
      async () => {
        await api.post('/auth/login', { username: 'test', password: 'bad' });
      },
      (err: any) => {
        assert.equal(err.status, 401);
        return true;
      }
    );

    assert.equal(refreshCalled, false, 'login 401 must never call refresh');
  });

  await t.test('a 401 whose message names no token still renews once', async () => {
    // The backend answers with a semantic code, and a 401 with a token in hand means the session, not
    // the request, is what expired. Reading the prose to decide would skip the renewal the moment the
    // sentence changed.
    resetEnvironment();
    setAccessToken('expired-access-token');

    let refreshCalled = false;
    let reportsCallCount = 0;

    globalThis.fetch = async (input, init) => {
      const req = record(input, init);

      if (req.url.endsWith('/api/auth/refresh')) {
        refreshCalled = true;
        return json({ token: 'renewed-access-token', expiresIn: 7200 });
      }

      if (req.url.endsWith('/api/reports')) {
        reportsCallCount++;
        if (req.headers['Authorization'] === 'Bearer expired-access-token') {
          return json({ error: 'Request denied by policy', code: 'DENIED' }, 401);
        }
        return json({ reports: [] });
      }

      return new Response('Not found', { status: 404 });
    };

    assert.deepEqual(await api.get<{ reports: any[] }>('/reports'), { reports: [] });
    assert.equal(refreshCalled, true, 'the renewal does not depend on how the 401 was worded');
    assert.equal(reportsCallCount, 2);
    assert.equal(getAccessToken(), 'renewed-access-token');
  });

  await t.test('logout revokes the cookie session with the in-memory token and forgets it', async () => {
    resetEnvironment();
    setAccessToken('current-access-token');
    mockLocalStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'test' }));

    globalThis.fetch = async (input, init) => {
      record(input, init);
      return json({ success: true });
    };

    const { logoutSession } = await import('./client');
    await logoutSession();

    const call = recordedRequests[0];
    assert.ok(call.url.endsWith('/api/auth/logout'));
    assert.equal(call.method, 'POST');
    assert.equal(call.headers['Authorization'], 'Bearer current-access-token');
    assert.equal(call.credentials, 'include');
    assert.equal(call.headers['X-Trindade-Client'], 'web');
    assert.equal(getAccessToken(), null);
    assert.equal(mockLocalStorage.getItem('auth_user'), null);
  });

  await t.test('api.upload transparently renews session and retries once on 401', async () => {
    resetEnvironment();
    setAccessToken('expired-access-token');

    let uploadCallCount = 0;
    let refreshCallCount = 0;

    globalThis.fetch = async (input, init) => {
      const req = record(input, init);

      if (req.url.endsWith('/api/reports/upload')) {
        uploadCallCount++;
        if (req.headers['Authorization'] === 'Bearer expired-access-token') {
          return json({ error: 'Invalid or expired token' }, 401);
        }
        assert.equal(req.headers['Authorization'], 'Bearer fresh-access-token');
        return json({ url: '/photo.jpg' });
      }

      if (req.url.endsWith('/api/auth/refresh')) {
        refreshCallCount++;
        return json({ token: 'fresh-access-token', expiresIn: 7200 });
      }

      return new Response('Not found', { status: 404 });
    };

    const fakeFormData = {} as FormData;
    const result = await api.upload<{ url: string }>('/reports/upload', fakeFormData);

    assert.deepEqual(result, { url: '/photo.jpg' });
    assert.equal(uploadCallCount, 2, 'upload should retry once after refresh');
    assert.equal(refreshCallCount, 1);
    assert.equal(getAccessToken(), 'fresh-access-token');
  });

  resetEnvironment();
});
