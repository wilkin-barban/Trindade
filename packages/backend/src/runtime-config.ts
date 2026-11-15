import { isIP } from 'node:net';

const REJECTED_JWT_SECRETS = new Set([
  'change-me',
  'changeme',
  'development-secret',
  'test-secret',
]);

const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * The salida photo window, in days.
 *
 * Three times the reports window on purpose: a report photo illustrates a shift, while a baixa photo is the
 * evidence of an exit that already reached the ERP and that somebody may still have to justify.
 */
export const DEFAULT_SALIDA_PHOTO_RETENTION_DAYS = 90;

/**
 * Who may assert a client address through `X-Forwarded-For`.
 *
 * Loopback is nginx on the same host; `172.16.0.0/12` is the private range a Docker/compose bridge allocates
 * from. Nothing wider belongs here: a `/0` or a `*` would let any client name its own address, which is
 * exactly the spoofing the audit IP exists to prevent.
 */
export const DEFAULT_TRUSTED_PROXY_CIDRS: readonly string[] = ['127.0.0.1/8', '::1/128', '172.16.0.0/12'];

export interface RuntimeConfig {
  jwtSecret: string;
  databasePath: string;
  refreshTokenTtlDays: number;
  salidaPhotoRetentionDays: number;
  /** The value Fastify's `trustProxy` takes: an explicit list of proxies, never `true`. */
  trustedProxies: string[];
}

/**
 * A whole-day window read from the environment.
 *
 * An unset value takes the default; anything that is not a positive whole number is refused, because a zero or
 * negative lifetime would silently mint refresh tokens that are already expired -- or, for a photo window,
 * delete the file the moment it was written -- and both look like a broken deployment rather than a typo.
 */
function parsePositiveWholeDays(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive whole number of days`);
  }
  return parsed;
}

/** One trusted proxy, normalised to `address/prefix`, or a refusal naming the variable. */
function parseTrustedProxy(raw: string): string {
  const entry = raw.trim();
  const [address, prefixPart, ...rest] = entry.split('/');
  const family = address ? isIP(address) : 0;
  if (rest.length > 0 || family === 0) {
    throw new Error(
      'TRUSTED_PROXY_CIDRS must list IP addresses or CIDR blocks, for example 127.0.0.1/8,172.16.0.0/12',
    );
  }
  // A bare address is a single host and is kept as the narrowest block a client cannot widen.
  if (prefixPart === undefined) return `${address}/${family === 4 ? 32 : 128}`;
  if (!/^\d+$/.test(prefixPart)) {
    throw new Error('TRUSTED_PROXY_CIDRS must list IP addresses or CIDR blocks, for example 127.0.0.1/8,172.16.0.0/12');
  }
  const prefix = Number(prefixPart);
  const widest = family === 4 ? 32 : 128;
  // `/0` is the whole internet wearing a CIDR's clothes; it is refused by name so the operator sees why.
  if (prefix < 1 || prefix > widest) {
    throw new Error(
      `TRUSTED_PROXY_CIDRS must not trust every peer: ${entry} is not a usable block (use a prefix between 1 and ${widest})`,
    );
  }
  return `${address}/${prefix}`;
}

/**
 * The `trustProxy` list: the deployment's own proxy, or the operator's explicit replacement.
 *
 * This is deliberately a list and never `true`: Fastify's `trustProxy: true` trusts every peer, so any client
 * could forge `X-Forwarded-For` and the audit column would record an address the operator chose.
 */
function parseTrustedProxies(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return [...DEFAULT_TRUSTED_PROXY_CIDRS];
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (entries.length === 0) return [...DEFAULT_TRUSTED_PROXY_CIDRS];
  return entries.map(parseTrustedProxy);
}

export function loadRuntimeConfig(environment = process.env): RuntimeConfig {
  const jwtSecret = environment.JWT_SECRET;
  if (!jwtSecret?.trim()) {
    throw new Error('JWT_SECRET is required; set a unique secret of at least 32 UTF-8 bytes');
  }
  if (REJECTED_JWT_SECRETS.has(jwtSecret.trim().toLowerCase())) {
    throw new Error('JWT_SECRET uses a known default or test value; generate a unique secret');
  }
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 UTF-8 bytes');
  }
  return {
    jwtSecret,
    databasePath: environment.DATABASE_PATH ?? new URL('../data/trindade.db', import.meta.url).pathname,
    refreshTokenTtlDays: parsePositiveWholeDays(
      environment.REFRESH_TOKEN_TTL_DAYS,
      'REFRESH_TOKEN_TTL_DAYS',
      DEFAULT_REFRESH_TOKEN_TTL_DAYS,
    ),
    salidaPhotoRetentionDays: parsePositiveWholeDays(
      environment.SALIDA_PHOTO_RETENTION_DAYS,
      'SALIDA_PHOTO_RETENTION_DAYS',
      DEFAULT_SALIDA_PHOTO_RETENTION_DAYS,
    ),
    trustedProxies: parseTrustedProxies(environment.TRUSTED_PROXY_CIDRS),
  };
}

export function requireJwtSecret(value = process.env.JWT_SECRET): string {
  return loadRuntimeConfig({ JWT_SECRET: value }).jwtSecret;
}
