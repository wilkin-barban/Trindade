import { describe, it } from 'node:test';
import assert from 'node:assert';
import Fastify, { type FastifyInstance } from 'fastify';
import { DEFAULT_TRUSTED_PROXY_CIDRS, loadRuntimeConfig, requireJwtSecret } from './runtime-config.js';

const STRONG_SECRET = 'unique-runtime-secret-32-bytes-minimum';

/**
 * A Fastify instance that only answers with the address it resolved the peer to, configured exactly the way
 * `server.ts` configures the real one. That value is what every audit and session row stores, so this is the
 * audit IP under test and not a proxy for it.
 */
function peerIpApp(trustProxy: ReturnType<typeof loadRuntimeConfig>['trustedProxies']): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy });
  app.get('/ip', async (request) => ({ ip: request.ip }));
  return app;
}

describe('Runtime configuration', () => {
  it('rejects missing and blank JWT secrets', () => {
    // The empty environment is passed explicitly: `requireJwtSecret()` with no argument falls back to
    // `process.env.JWT_SECRET`, so on a machine with a real `.env` this assertion read that secret instead of the
    // absence it means to test and went red only there. A configuration test that depends on the shell is not a
    // test of the configuration.
    assert.throws(() => loadRuntimeConfig({}), /required/);
    assert.throws(() => requireJwtSecret(''), /required/);
    assert.throws(() => requireJwtSecret('   '), /required/);
  });

  it('refuses a proxy list that is only separators instead of using the defaults', () => {
    // Silence here would leave the operator believing the list is theirs while the defaults apply.
    assert.throws(() => loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, TRUSTED_PROXY_CIDRS: ',' }), /at least one/);
  });

  it('counts UTF-8 bytes and requires at least 32', () => {
    assert.throws(() => requireJwtSecret('a'.repeat(31)), /32 UTF-8 bytes/);
    assert.strictEqual(requireJwtSecret('á'.repeat(16)), 'á'.repeat(16));
  });

  it('rejects known default and test values without disclosing them', () => {
    for (const value of ['change-me', 'development-secret', 'test-secret']) {
      const error = assert.throws(() => requireJwtSecret(value), /known default or test value/);
      assert.doesNotMatch(String(error), new RegExp(value));
    }
  });

  it('returns a strong explicit JWT secret unchanged', () => {
    const secret = 'unique-runtime-secret-32-bytes-minimum';
    assert.strictEqual(requireJwtSecret(secret), secret);
  });

  it('defaults the refresh-token lifetime to 30 days', () => {
    assert.strictEqual(loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET }).refreshTokenTtlDays, 30);
    assert.strictEqual(loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, REFRESH_TOKEN_TTL_DAYS: '' }).refreshTokenTtlDays, 30);
    assert.strictEqual(loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, REFRESH_TOKEN_TTL_DAYS: '   ' }).refreshTokenTtlDays, 30);
  });

  it('accepts an explicit whole-day refresh-token lifetime', () => {
    assert.strictEqual(loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, REFRESH_TOKEN_TTL_DAYS: '7' }).refreshTokenTtlDays, 7);
    assert.strictEqual(loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, REFRESH_TOKEN_TTL_DAYS: '365' }).refreshTokenTtlDays, 365);
  });

  // A zero, negative or fractional lifetime would mint refresh tokens that are already
  // expired, which presents to a user as a login that silently does not stick.
  it('rejects refresh-token lifetimes that are not positive whole days', () => {
    for (const value of ['0', '-1', '1.5', 'forever', '30d']) {
      assert.throws(
        () => loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, REFRESH_TOKEN_TTL_DAYS: value }),
        /positive whole number of days/,
        `accepted ${JSON.stringify(value)}`,
      );
    }
  });

  describe('salida photo retention', () => {
    // Salida photos are the evidence of an exit that already reached the ERP, so the default window is three
    // times the report one. A zero or negative window would delete the photo the moment it was uploaded.
    it('defaults to 90 days and accepts an explicit whole-day window', () => {
      assert.strictEqual(loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET }).salidaPhotoRetentionDays, 90);
      assert.strictEqual(
        loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, SALIDA_PHOTO_RETENTION_DAYS: '' }).salidaPhotoRetentionDays,
        90,
      );
      assert.strictEqual(
        loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, SALIDA_PHOTO_RETENTION_DAYS: '   ' }).salidaPhotoRetentionDays,
        90,
      );
      assert.strictEqual(
        loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, SALIDA_PHOTO_RETENTION_DAYS: '180' }).salidaPhotoRetentionDays,
        180,
      );
    });

    it('rejects salida photo windows that are not positive whole days', () => {
      for (const value of ['0', '-1', '1.5', 'forever', '90d']) {
        assert.throws(
          () => loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, SALIDA_PHOTO_RETENTION_DAYS: value }),
          /SALIDA_PHOTO_RETENTION_DAYS must be a positive whole number of days/,
          `accepted ${JSON.stringify(value)}`,
        );
      }
    });
  });

  describe('trusted proxies', () => {
    // The default is the deployment's own proxy and nothing else: loopback plus the private container bridge.
    it('trusts loopback and the container bridge, never a wildcard', () => {
      const { trustedProxies } = loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET });
      assert.deepEqual(trustedProxies, [...DEFAULT_TRUSTED_PROXY_CIDRS]);
      assert.ok(trustedProxies.includes('127.0.0.1/8'));
      assert.ok(trustedProxies.includes('172.16.0.0/12'));
      for (const entry of trustedProxies) assert.doesNotMatch(entry, /^\*$|\/0$/);
    });

    it('replaces the defaults with an explicit comma-separated list', () => {
      const { trustedProxies } = loadRuntimeConfig({
        JWT_SECRET: STRONG_SECRET,
        TRUSTED_PROXY_CIDRS: ' 10.0.0.0/8 , 192.168.0.1 ',
      });
      assert.deepEqual(trustedProxies, ['10.0.0.0/8', '192.168.0.1/32']);
    });

    it('refuses trust settings that would accept every peer', () => {
      for (const value of ['*', 'true', '0.0.0.0/0', '::/0', 'proxy', '10.0.0.0/33', 'not-an-ip']) {
        assert.throws(
          () => loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, TRUSTED_PROXY_CIDRS: value }),
          /TRUSTED_PROXY_CIDRS/,
          `accepted ${JSON.stringify(value)}`,
        );
      }
    });

    // The header is only worth reading when the peer is the proxy; anything else can write it.
    it('reads X-Forwarded-For only from a trusted proxy', async () => {
      const app = peerIpApp(loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET }).trustedProxies);
      try {
        const throughProxy = await app.inject({
          method: 'GET',
          url: '/ip',
          remoteAddress: '172.18.0.2',
          headers: { 'x-forwarded-for': '203.0.113.7' },
        });
        assert.deepEqual(throughProxy.json(), { ip: '203.0.113.7' });

        const throughLoopback = await app.inject({
          method: 'GET',
          url: '/ip',
          remoteAddress: '127.0.0.1',
          headers: { 'x-forwarded-for': '203.0.113.8' },
        });
        assert.deepEqual(throughLoopback.json(), { ip: '203.0.113.8' });
      } finally {
        await app.close();
      }
    });

    it('ignores a spoofed X-Forwarded-For from an untrusted peer', async () => {
      const app = peerIpApp(loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET }).trustedProxies);
      try {
        const spoofed = await app.inject({
          method: 'GET',
          url: '/ip',
          remoteAddress: '198.51.100.9',
          headers: { 'x-forwarded-for': '203.0.113.7' },
        });
        assert.deepEqual(spoofed.json(), { ip: '198.51.100.9' });

        // A client that appends its own hop cannot walk the answer away from the proxy either: the rightmost
        // address the trusted peer saw is the one that counts.
        const chained = await app.inject({
          method: 'GET',
          url: '/ip',
          remoteAddress: '172.18.0.2',
          headers: { 'x-forwarded-for': '10.9.9.9, 198.51.100.9' },
        });
        assert.deepEqual(chained.json(), { ip: '198.51.100.9' });
      } finally {
        await app.close();
      }
    });

    it('stops trusting a peer the operator removed from the list', async () => {
      const app = peerIpApp(
        loadRuntimeConfig({ JWT_SECRET: STRONG_SECRET, TRUSTED_PROXY_CIDRS: '10.0.0.0/8' }).trustedProxies,
      );
      try {
        const bridge = await app.inject({
          method: 'GET',
          url: '/ip',
          remoteAddress: '172.18.0.2',
          headers: { 'x-forwarded-for': '203.0.113.7' },
        });
        assert.deepEqual(bridge.json(), { ip: '172.18.0.2' });
      } finally {
        await app.close();
      }
    });
  });
});
