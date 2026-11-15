/**
 * The web session cookie, exercised instead of described.
 *
 * The refresh token is the session. While the web kept it in `localStorage` any XSS could take it and keep
 * signing in long after the tab was closed, so the browser now gets it only as an `HttpOnly` cookie scoped to
 * `/api/auth`. The native app cannot use cookies, so the JSON body keeps carrying the token for it, and the
 * browser opts out explicitly. These tests pin that split, the cookie attributes, and the cross-site refusal
 * that backs `SameSite=Strict`.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

import { defaultAuthAdmissionLimiter } from './auth.admission-limiter.js';
import { buildAuthTestApp, type TestFixtures } from './auth-test-helper.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.cookies.js';

const REFRESH_TTL_DAYS = 30;
const REFRESH_MAX_AGE_SECONDS = REFRESH_TTL_DAYS * 24 * 60 * 60;

function setCookieHeaders(response: { headers: Record<string, unknown> }): string[] {
  const raw = response.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

function refreshCookie(response: { headers: Record<string, unknown> }): string | undefined {
  return setCookieHeaders(response).find((line) => line.startsWith(`${REFRESH_COOKIE_NAME}=`));
}

function cookieValue(response: { headers: Record<string, unknown> }): string | undefined {
  const line = refreshCookie(response);
  if (!line) return undefined;
  return line.slice(REFRESH_COOKIE_NAME.length + 1).split(';')[0];
}

describe('the web session cookie', () => {
  let app: FastifyInstance;
  let secureApp: FastifyInstance;
  let db: Database.Database;
  let secureDb: Database.Database;
  let fixtures: TestFixtures;
  let secureFixtures: TestFixtures;

  before(async () => {
    const built = await buildAuthTestApp({ refreshTokenTtlDays: REFRESH_TTL_DAYS });
    app = built.app;
    db = built.db;
    fixtures = built.fixtures;

    const secure = await buildAuthTestApp({ refreshTokenTtlDays: REFRESH_TTL_DAYS, cookieSecure: true });
    secureApp = secure.app;
    secureDb = secure.db;
    secureFixtures = secure.fixtures;
  });

  beforeEach(() => {
    defaultAuthAdmissionLimiter.reset();
  });

  after(async () => {
    await app.close();
    await secureApp.close();
    db.close();
    secureDb.close();
  });

  async function webLogin(target: FastifyInstance, identity: { username: string; password: string }) {
    return target.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: identity,
      headers: { 'x-trindade-client': 'web' },
    });
  }

  async function nativeLogin(target: FastifyInstance, identity: { username: string; password: string }) {
    return target.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: identity,
    });
  }

  describe('login', () => {
    it('sets an HttpOnly, SameSite=Strict cookie scoped to the auth routes with the refresh TTL', async () => {
      const response = await webLogin(app, fixtures.admin);
      assert.strictEqual(response.statusCode, 200);

      const line = refreshCookie(response);
      assert.ok(line, 'the web login must set the refresh cookie');
      assert.match(line!, /HttpOnly/);
      assert.match(line!, /SameSite=Strict/);
      assert.match(line!, new RegExp(`Path=${REFRESH_COOKIE_PATH}`));
      assert.match(line!, new RegExp(`Max-Age=${REFRESH_MAX_AGE_SECONDS}`));
      assert.doesNotMatch(line!, /Secure/, 'plain HTTP development must not mark the cookie Secure');
    });

    it('marks the cookie Secure when the deployment is HTTPS', async () => {
      const response = await webLogin(secureApp, secureFixtures.admin);
      assert.strictEqual(response.statusCode, 200);
      assert.match(refreshCookie(response) ?? '', /Secure/);
    });

    it('keeps the refresh token out of the JSON body for the web and still returns the access token', async () => {
      const response = await webLogin(app, fixtures.admin);
      const body = JSON.parse(response.body);

      assert.strictEqual(typeof body.token, 'string');
      assert.strictEqual(body.user.username, fixtures.admin.username);
      assert.strictEqual(typeof body.expiresIn, 'number');
      assert.strictEqual(body.refreshToken, undefined, 'the web must not receive the refresh token in JSON');
    });

    it('still returns the refresh token in the body for native clients, which cannot use cookies', async () => {
      const response = await nativeLogin(app, fixtures.admin);
      const body = JSON.parse(response.body);

      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(typeof body.refreshToken, 'string');
      assert.strictEqual(refreshCookie(response), undefined, 'a native login must not set a browser cookie');
    });
  });

  describe('refresh', () => {
    it('accepts the cookie, rotates the session, re-sets the cookie and returns only the access token', async () => {
      const login = await webLogin(app, fixtures.admin);
      const presented = cookieValue(login);
      assert.ok(presented);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          'x-trindade-client': 'web',
          cookie: `${REFRESH_COOKIE_NAME}=${presented}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(typeof body.token, 'string');
      assert.strictEqual(body.refreshToken, undefined, 'the web must not receive the rotated refresh token in JSON');

      const rotated = cookieValue(response);
      assert.ok(rotated, 'the rotated token must be re-set as a cookie');
      assert.notStrictEqual(rotated, presented, 'the session must rotate');
    });

    it('keeps serving native clients that present the token in the body', async () => {
      const login = await nativeLogin(app, fixtures.admin);
      const { refreshToken } = JSON.parse(login.body);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(typeof body.token, 'string');
      assert.strictEqual(typeof body.refreshToken, 'string');
      assert.notStrictEqual(body.refreshToken, refreshToken);
      assert.strictEqual(refreshCookie(response), undefined);
    });

    it('refuses a cross-site refresh authenticated by cookie with 403 and a semantic code', async () => {
      const login = await webLogin(app, fixtures.admin);
      const presented = cookieValue(login);

      for (const headers of [
        { origin: 'https://evil.example' },
        { 'sec-fetch-site': 'cross-site' },
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          headers: {
            'x-trindade-client': 'web',
            cookie: `${REFRESH_COOKIE_NAME}=${presented}`,
            ...headers,
          },
        });

        assert.strictEqual(response.statusCode, 403, JSON.stringify(headers));
        assert.strictEqual(JSON.parse(response.body).code, 'auth.cross_site_request');
        assert.strictEqual(refreshCookie(response), undefined, 'a refused refresh must not rotate the cookie');
      }
    });

    it('accepts a same-origin refresh', async () => {
      const login = await webLogin(app, fixtures.admin);
      const presented = cookieValue(login);
      assert.ok(presented);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          'x-trindade-client': 'web',
          host: 'localhost:3099',
          origin: 'http://localhost:3099',
          'sec-fetch-site': 'same-origin',
          cookie: `${REFRESH_COOKIE_NAME}=${presented}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
    });
  });

  describe('logout', () => {
    it('clears the cookie and revokes the session the browser was holding', async () => {
      const login = await webLogin(app, fixtures.admin);
      const presented = cookieValue(login);
      const accessToken = JSON.parse(login.body).token;

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'x-trindade-client': 'web',
          cookie: `${REFRESH_COOKIE_NAME}=${presented}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const cleared = refreshCookie(response);
      assert.ok(cleared, 'logout must clear the cookie');
      assert.match(cleared!, /Expires=Thu, 01 Jan 1970|Max-Age=0/);

      const replay = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { cookie: `${REFRESH_COOKIE_NAME}=${presented}` },
      });
      assert.strictEqual(replay.statusCode, 401, 'the revoked session must not refresh');
    });
  });
});

describe('the cookie policy itself', () => {
  it('grants credentialed CORS only to the exact approved origin', async () => {
    const { corsPolicy, APPROVED_WEB_ORIGINS } = await import('../../cors-policy.js');
    assert.deepStrictEqual(corsPolicy.origin, APPROVED_WEB_ORIGINS);
    assert.ok(!APPROVED_WEB_ORIGINS.includes('*'));
    assert.ok(APPROVED_WEB_ORIGINS.every((origin) => origin.startsWith('https://')));
    assert.strictEqual(corsPolicy.credentials, true);
  });

  it('marks the cookie Secure for HTTPS and production, never by accident in plain-HTTP development', async () => {
    const { resolveRefreshCookieSecure } = await import('./auth.cookies.js');
    assert.strictEqual(resolveRefreshCookieSecure({ appUrl: 'https://trindade.example', nodeEnv: 'production' }), true);
    assert.strictEqual(resolveRefreshCookieSecure({ appUrl: 'http://localhost:3000', nodeEnv: 'production' }), true);
    assert.strictEqual(resolveRefreshCookieSecure({ appUrl: '', nodeEnv: undefined }), false);
    assert.strictEqual(resolveRefreshCookieSecure({ appUrl: 'http://localhost:3000', nodeEnv: 'development' }), false);
    // The single, explicit opt-out for an install that really is served over plain HTTP.
    assert.strictEqual(
      resolveRefreshCookieSecure({ appUrl: 'http://192.168.25.250:3000', nodeEnv: 'production', allowInsecure: 'true' }),
      false,
    );
  });
});
