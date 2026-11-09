import { api } from '../api/client.js';

/**
 * Client of the ERP vault and of the bridge tickets.
 *
 * The password of the ERP no longer lives in this browser: the server keeps it encrypted, and this module
 * is the only door the page has to it. Two rules follow from that and are encoded here rather than in the
 * components that call it:
 *
 * 1. Nothing on the response side can carry a secret. Every payload that leaves the server is rebuilt from
 *    the five known fields, so a server that ever leaked a password (or the ciphertext) would still not put
 *    it in the page.
 * 2. "Save without rewriting the password" means the key must not exist. An empty string in the body would
 *    be a value, and a value the server could read as "clear it"; the key is omitted instead, so a settings
 *    round trip that only edits the URL or the user cannot touch the secret at all.
 *
 * No `Authorization` header is built here: the client of `../api/client.js` owns the session token, and the
 * bridge ticket is a bearer credential that only the Shortcut redeems, server side.
 */

/** Shape of `GET /api/integration/aero/settings`. There is no password field, by design (I1). */
export interface AeroVaultSettings {
  configured: boolean;
  wsUrl: string | null;
  username: string | null;
  hasPassword: boolean;
  updatedAt: string | null;
}

export type AeroBridgeAction = 'entrada' | 'entrada_lote' | 'movimentos' | 'test';

/** What the page hands to the Shortcut: a token that lives 120 s and burns on first use. */
export interface AeroBridgeTicket {
  ticket: string;
  ticketUrl: string;
  expiresAt: string;
}

/**
 * The four verbs this module needs from the app's client. Declared here instead of importing the class
 * type so a test can pass a hand-written double without a fetch, a router or a session.
 */
export interface AeroVaultClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  del<T = void>(path: string): Promise<T>;
}

export const AERO_VAULT_SETTINGS_PATH = '/integration/aero/settings';
export const AERO_VAULT_TICKETS_PATH = '/integration/aero/bridge-tickets';

/**
 * The settings as the page may see them: exactly the five fields of the contract.
 *
 * Extra keys are dropped on purpose. This is the single place where a mistaken or future server response
 * with a password inside would be defused before reaching a component, a log or a cache.
 */
function toAeroVaultSettings(raw: AeroVaultSettings | null | undefined): AeroVaultSettings {
  return {
    configured: raw?.configured === true,
    wsUrl: typeof raw?.wsUrl === 'string' ? raw.wsUrl : null,
    username: typeof raw?.username === 'string' ? raw.username : null,
    hasPassword: raw?.hasPassword === true,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

/**
 * The body of `PUT /settings`, with the password key absent unless a new one was actually typed.
 *
 * A whitespace-only password is treated as absent because an operator clearing the field with the space bar
 * means "do not touch it", not "my password is a space". A password with spaces around it is sent verbatim:
 * trimming it would send a different secret than the one the ERP expects.
 */
function settingsBody(input: {
  wsUrl: string;
  username: string;
  password?: string;
}): { wsUrl: string; username: string; password?: string } {
  const body: { wsUrl: string; username: string; password?: string } = {
    wsUrl: input.wsUrl,
    username: input.username,
  };

  if (typeof input.password === 'string' && input.password.trim() !== '') {
    body.password = input.password;
  }

  return body;
}

/** Reads the vault state of the owner. Never asks for, and never receives, the secret. */
export async function fetchAeroVaultSettings(
  client: AeroVaultClient = api,
): Promise<AeroVaultSettings> {
  const raw = await client.get<AeroVaultSettings>(AERO_VAULT_SETTINGS_PATH);
  return toAeroVaultSettings(raw);
}

/**
 * Stores the settings of the vault. `password` replaces the stored one only when it carries something;
 * omitting it keeps the secret the server already has.
 */
export async function saveAeroVaultSettings(
  input: { wsUrl: string; username: string; password?: string },
  client: AeroVaultClient = api,
): Promise<AeroVaultSettings> {
  const raw = await client.put<AeroVaultSettings>(AERO_VAULT_SETTINGS_PATH, settingsBody(input));
  return toAeroVaultSettings(raw);
}

/** Deletes the vault of the owner, and with it any pending ticket. Returns nothing to show. */
export async function deleteAeroVaultSettings(client: AeroVaultClient = api): Promise<void> {
  await client.del(AERO_VAULT_SETTINGS_PATH);
}

/**
 * Asks the server for a one-time ticket for one Shortcut action.
 *
 * The payloads travel as the page already built them: the server serializes them and the Shortcut never
 * reassembles anything. `callbackPath` is omitted rather than sent empty, which would fail the same-origin
 * validation for a reason that says nothing about the real mistake.
 */
export async function requestAeroBridgeTicket(
  input: {
    action: AeroBridgeAction;
    payloads: readonly Record<string, unknown>[];
    callbackPath?: string;
  },
  client: AeroVaultClient = api,
): Promise<AeroBridgeTicket> {
  const body: {
    action: AeroBridgeAction;
    payloads: readonly Record<string, unknown>[];
    callbackPath?: string;
  } = {
    action: input.action,
    payloads: input.payloads,
  };

  if (input.callbackPath !== undefined) {
    body.callbackPath = input.callbackPath;
  }

  return client.post<AeroBridgeTicket>(AERO_VAULT_TICKETS_PATH, body);
}
