import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The symmetric vault for the one secret this server has to keep: the ERP password.
 *
 * The plant's WebService only speaks Basic Auth over its LAN, so the password cannot be hashed; it has to be
 * recovered to build the envelope the iPhone shortcut sends. Encryption at rest is the smallest thing that keeps
 * it out of a database backup in clear while still letting the process use it.
 *
 * AES-256-GCM is chosen for the authentication tag: a tampered ciphertext fails to decrypt instead of producing a
 * plausible wrong password that would be sent to the ERP and counted as an operator mistake.
 */
export const VAULT_ALGORITHM = 'aes-256-gcm';
export const VAULT_KEY_BYTES = 32;
export const VAULT_IV_BYTES = 12;
export const VAULT_TAG_BYTES = 16;
export const VAULT_KEY_VERSION = 1;

/** Base64 alphabet with optional padding. Checked before decoding because `Buffer.from` is lenient by design. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export type VaultKeyErrorCode =
  /** `AERO_VAULT_KEY` is absent or blank. */
  | 'MISSING'
  /** Present but unusable: not base64, or not exactly 32 bytes once decoded. */
  | 'INVALID';

export class VaultKeyError extends Error {
  readonly code: VaultKeyErrorCode;

  constructor(code: VaultKeyErrorCode, message: string) {
    super(message);
    this.name = 'VaultKeyError';
    this.code = code;
  }
}

/** One encrypted value as it is stored: three base64 parts and the key generation that produced them. */
export interface VaultSecret {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
}

/**
 * Decode `AERO_VAULT_KEY`.
 *
 * Rejects anything that is not exactly 32 decoded bytes. `Buffer.from(value, 'base64')` silently ignores
 * characters it does not understand, so a key pasted with a typo would decode to the wrong length or to a
 * different key; both failures are silent at the call site and loud only when the ERP rejects every login.
 */
export function vaultKeyFromBase64(raw: string | undefined | null): Buffer {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    throw new VaultKeyError(
      'MISSING',
      'AERO_VAULT_KEY is required: generate one with `openssl rand -base64 32` and set it in the environment',
    );
  }
  if (value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
    throw new VaultKeyError('INVALID', 'AERO_VAULT_KEY must be base64 encoded (generate it with `openssl rand -base64 32`)');
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== VAULT_KEY_BYTES) {
    throw new VaultKeyError(
      'INVALID',
      `AERO_VAULT_KEY must decode to ${VAULT_KEY_BYTES} bytes, got ${key.length} (generate it with \`openssl rand -base64 32\`)`,
    );
  }
  return key;
}

/** Read the vault key from the environment. Never logs nor returns the value in an error message. */
export function resolveVaultKey(
  environment: Record<string, string | undefined> = process.env,
): Buffer {
  return vaultKeyFromBase64(environment.AERO_VAULT_KEY);
}

/** The vault key when it is configured and valid, or `null` when the deployment simply has not set one. */
export function optionalVaultKey(environment: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = environment.AERO_VAULT_KEY;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return vaultKeyFromBase64(raw);
}

function assertKey(key: Buffer): void {
  if (key.length !== VAULT_KEY_BYTES) {
    throw new VaultKeyError('INVALID', `vault key must be ${VAULT_KEY_BYTES} bytes, got ${key.length}`);
  }
}

/** Encrypt one secret with a fresh IV. The plaintext never leaves this call. */
export function encryptSecret(plaintext: string, key: Buffer): VaultSecret {
  assertKey(key);
  const iv = randomBytes(VAULT_IV_BYTES);
  const cipher = createCipheriv(VAULT_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    keyVersion: VAULT_KEY_VERSION,
  };
}

/**
 * Recover one secret. Throws on a tampered ciphertext, tag or IV, on a wrong key, and on a key generation this
 * build does not know: a wrong generation would otherwise be tried against the same ciphertext and reported as
 * "the ERP rejected the password".
 */
export function decryptSecret(secret: VaultSecret, key: Buffer): string {
  assertKey(key);
  if (secret.keyVersion !== VAULT_KEY_VERSION) {
    throw new VaultKeyError(
      'INVALID',
      `secret was written with key version ${secret.keyVersion}; this build only reads version ${VAULT_KEY_VERSION}`,
    );
  }
  const iv = Buffer.from(secret.iv, 'base64');
  const tag = Buffer.from(secret.tag, 'base64');
  const ciphertext = Buffer.from(secret.ciphertext, 'base64');
  if (iv.length !== VAULT_IV_BYTES) throw new Error('vault secret has an invalid IV');
  if (tag.length !== VAULT_TAG_BYTES) throw new Error('vault secret has an invalid authentication tag');
  const decipher = createDecipheriv(VAULT_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Constant-time comparison for callers that compare a stored secret against a supplied one. */
export function secretsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The startup gate for the vault key.
 *
 * Production must not boot without it: every settings read would answer 503 and the operator would learn about a
 * broken deployment only when the plant tries to launch. Outside production the key is optional, because a
 * developer cloning the repository has no reason to hold a secret, and the settings endpoints answer 503 with the
 * same explanation instead. A key that IS present but malformed is always refused: silent bad configuration is
 * how a wrong key reaches a backup.
 */
export function assertVaultKeyAtStartup(
  environment: Record<string, string | undefined> = process.env,
): Buffer | null {
  const production = environment.NODE_ENV === 'production';
  const raw = environment.AERO_VAULT_KEY;
  if (typeof raw !== 'string' || raw.trim() === '') {
    if (!production) return null;
    throw new VaultKeyError(
      'MISSING',
      'AERO_VAULT_KEY is required in production: the ERP vault cannot start without it. ' +
        'Generate one with `openssl rand -base64 32`, add it to the deployment environment, and never commit it.',
    );
  }
  return vaultKeyFromBase64(raw);
}
