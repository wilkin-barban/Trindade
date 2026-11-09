import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  VAULT_IV_BYTES,
  VAULT_KEY_BYTES,
  VAULT_KEY_VERSION,
  VaultKeyError,
  decryptSecret,
  encryptSecret,
  assertVaultKeyAtStartup,
  resolveVaultKey,
  vaultKeyFromBase64,
} from './vault.crypto.js';

/** A fixed key for the test run. Never the production one: it exists only in this file. */
const TEST_KEY = Buffer.alloc(VAULT_KEY_BYTES, 7);
const OTHER_KEY = Buffer.alloc(VAULT_KEY_BYTES, 9);

function flipOneBase64Byte(value: string): string {
  const bytes = Buffer.from(value, 'base64');
  bytes[0] = bytes[0]! ^ 0xff;
  return bytes.toString('base64');
}

describe('vault crypto', () => {
  it('round-trips a password without changing a single character', () => {
    const plaintext = 'senha-do-erp-Ünïcode-123 !@#';

    const secret = encryptSecret(plaintext, TEST_KEY);

    assert.equal(decryptSecret(secret, TEST_KEY), plaintext);
  });

  it('round-trips an empty string, because the caller decides what a usable password is', () => {
    const secret = encryptSecret('', TEST_KEY);

    assert.equal(decryptSecret(secret, TEST_KEY), '');
  });

  it('uses a fresh 12-byte IV for every encryption', () => {
    const first = encryptSecret('same password', TEST_KEY);
    const second = encryptSecret('same password', TEST_KEY);

    assert.equal(Buffer.from(first.iv, 'base64').length, VAULT_IV_BYTES);
    assert.equal(Buffer.from(second.iv, 'base64').length, VAULT_IV_BYTES);
    assert.notEqual(first.iv, second.iv);
    assert.notEqual(first.ciphertext, second.ciphertext);
  });

  it('stamps key version 1 and stores a 16-byte authentication tag', () => {
    const secret = encryptSecret('senha', TEST_KEY);

    assert.equal(secret.keyVersion, VAULT_KEY_VERSION);
    assert.equal(Buffer.from(secret.tag, 'base64').length, 16);
  });

  it('never stores the plaintext inside the ciphertext', () => {
    const plaintext = 'senha-que-no-puede-aparecer';
    const secret = encryptSecret(plaintext, TEST_KEY);

    const decoded = Buffer.from(secret.ciphertext, 'base64').toString('utf8');
    assert.equal(decoded.includes(plaintext), false);
    assert.equal(secret.ciphertext.includes(plaintext), false);
    assert.equal(secret.iv.includes(plaintext), false);
    assert.equal(secret.tag.includes(plaintext), false);
  });

  it('refuses a tampered ciphertext, tag or IV instead of returning garbage', () => {
    const secret = encryptSecret('senha-original', TEST_KEY);

    assert.throws(() => decryptSecret({ ...secret, ciphertext: flipOneBase64Byte(secret.ciphertext) }, TEST_KEY));
    assert.throws(() => decryptSecret({ ...secret, tag: flipOneBase64Byte(secret.tag) }, TEST_KEY));
    assert.throws(() => decryptSecret({ ...secret, iv: flipOneBase64Byte(secret.iv) }, TEST_KEY));
  });

  it('refuses to decrypt with another valid key', () => {
    const secret = encryptSecret('senha-original', TEST_KEY);

    assert.throws(() => decryptSecret(secret, OTHER_KEY));
  });

  it('reads a 32-byte base64 key and rejects everything else with a named error', () => {
    const valid = randomBytes(VAULT_KEY_BYTES).toString('base64');
    assert.equal(vaultKeyFromBase64(valid).length, VAULT_KEY_BYTES);

    const invalidKeys = [
      '',
      '   ',
      randomBytes(31).toString('base64'),
      randomBytes(33).toString('base64'),
      'not base64 at all!!',
      valid.slice(0, -4),
    ];
    for (const value of invalidKeys) {
      assert.throws(
        () => vaultKeyFromBase64(value),
        (error: unknown) => error instanceof VaultKeyError,
        `expected ${JSON.stringify(value)} to be refused`,
      );
    }
  });

  it('requires AERO_VAULT_KEY in the environment and names it when it is missing', () => {
    assert.throws(
      () => resolveVaultKey({}),
      (error: unknown) => error instanceof VaultKeyError && error.code === 'MISSING',
    );

    const key = resolveVaultKey({ AERO_VAULT_KEY: randomBytes(VAULT_KEY_BYTES).toString('base64') });
    assert.equal(key.length, VAULT_KEY_BYTES);
  });
});

describe('vault key at startup', () => {
  it('refuses to start production without a key, and says which variable is missing', () => {
    assert.throws(
      () => assertVaultKeyAtStartup({ NODE_ENV: 'production' }),
      (error: unknown) => error instanceof VaultKeyError && error.code === 'MISSING',
    );
  });

  it('refuses to start production with a key that is not 32 bytes', () => {
    assert.throws(
      () => assertVaultKeyAtStartup({ NODE_ENV: 'production', AERO_VAULT_KEY: randomBytes(16).toString('base64') }),
      (error: unknown) => error instanceof VaultKeyError && error.code === 'INVALID',
    );
  });

  it('starts production with a valid key and returns it', () => {
    const key = randomBytes(VAULT_KEY_BYTES).toString('base64');

    const resolved = assertVaultKeyAtStartup({ NODE_ENV: 'production', AERO_VAULT_KEY: key });
    assert.ok(resolved, 'a valid production key must resolve');
    assert.equal(resolved.length, VAULT_KEY_BYTES);
  });

  it('lets development run without a key, so the app still boots before the operator configures it', () => {
    assert.equal(assertVaultKeyAtStartup({ NODE_ENV: 'development' }), null);
  });

  it('still refuses development with a malformed key: a broken key is never a configuration mode', () => {
    assert.throws(
      () => assertVaultKeyAtStartup({ NODE_ENV: 'development', AERO_VAULT_KEY: 'short' }),
      (error: unknown) => error instanceof VaultKeyError && error.code === 'INVALID',
    );
  });
});
