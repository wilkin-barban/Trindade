import type Database from 'better-sqlite3';
import { decryptSecret, encryptSecret } from './vault.crypto.js';
import {
  AERO_VAULT_ERROR_CODES,
  AeroVaultSettingsBodySchema,
  type AeroVaultSettingsBody,
} from './aero.vault.schema.js';
import type { AeroVaultSettingsResponse } from './aero.vault.contract.js';

/**
 * The ERP vault: one row per owner, holding the WebService URL, the ERP user and the password encrypted at rest.
 *
 * The row is never returned as it is stored. Every read path goes through `aeroVaultSettingsResponse`, which
 * reports whether there is a password without ever exposing the ciphertext, the IV or the tag, let alone the
 * plaintext: that is what keeps the secret on the server even when the browser asks for its own configuration.
 */

/** The vault row exactly as stored. Only this module and the ticket redemption ever see it. */
export interface AeroVaultSettingsRow {
  id: number;
  user_id: number;
  ws_url: string;
  erp_username: string;
  password_ciphertext: string;
  password_iv: string;
  password_tag: string;
  key_version: number;
  created_at: string;
  updated_at: string;
}

/** What redemption needs to build a Basic Auth header. Never leaves the server in this shape. */
export interface AeroVaultCredentials {
  wsUrl: string;
  username: string;
  password: string;
}

const TABLE = 'aero_integration_settings';

/** The answer for an owner who never configured the vault. A fresh object each time: callers serialise it. */
function emptySettings(): AeroVaultSettingsResponse {
  return { configured: false, wsUrl: null, username: null, hasPassword: false, updatedAt: null };
}

/**
 * An ERP address is an absolute HTTP(S) URL with a host.
 *
 * `new URL` accepts far more than the plant's WebService does (`ftp:` reaches a different port, `file:` reaches
 * the disk), so the protocol is checked as well. A missing host (`http://`) throws, which is the same refusal.
 */
export function isErpWebServiceUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== '';
}

/** The stored row of one owner, or `null` when that owner has not configured the vault yet. */
export function aeroVaultSettingsRow(db: Database.Database, userId: number): AeroVaultSettingsRow | null {
  const row = db.prepare(`SELECT * FROM ${TABLE} WHERE user_id = ?`).get(userId) as AeroVaultSettingsRow | undefined;
  return row ?? null;
}

/** The public shape of the vault: enough to render the panel, nothing that could be replayed. */
export function aeroVaultSettingsResponse(row: AeroVaultSettingsRow | null): AeroVaultSettingsResponse {
  if (!row) return emptySettings();
  return {
    configured: true,
    wsUrl: row.ws_url,
    username: row.erp_username,
    hasPassword: row.password_ciphertext.length > 0,
    updatedAt: row.updated_at,
  };
}

export function readAeroVaultSettings(db: Database.Database, userId: number): AeroVaultSettingsResponse {
  return aeroVaultSettingsResponse(aeroVaultSettingsRow(db, userId));
}

export type SaveAeroVaultSettingsResult =
  | { ok: true; settings: AeroVaultSettingsResponse }
  | { ok: false; code: 'AERO_VAULT_INVALID_SETTINGS' | 'AERO_VAULT_PASSWORD_REQUIRED' };

/**
 * `null` when the caller sent no password, or only whitespace.
 *
 * A password of blanks is not a password: treating it as one would store a secret the ERP rejects and the panel
 * would keep saying "configured". A real password is stored exactly as typed, spaces included, because the ERP
 * compares bytes and a trimmed secret would fail to authenticate.
 */
function passwordFromInput(input: AeroVaultSettingsBody): string | null {
  const raw = input.password;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return raw;
}

/**
 * Save the owner's vault row.
 *
 * A non-empty password is encrypted with a fresh IV and replaces all three stored parts, so an old ciphertext
 * cannot survive next to a new tag. An absent password keeps the stored ciphertext byte for byte: the URL or the
 * user can be corrected without retyping a secret nobody has on hand. And a first save with no password is
 * refused, because a row without a secret would look configured to every screen and then fail at the plant.
 */
export function saveAeroVaultSettings(
  db: Database.Database,
  userId: number,
  rawBody: unknown,
  key: Buffer,
  now: Date = new Date(),
): SaveAeroVaultSettingsResult {
  const parsed = AeroVaultSettingsBodySchema.safeParse(rawBody);
  if (!parsed.success) return { ok: false, code: AERO_VAULT_ERROR_CODES.INVALID_SETTINGS };

  const wsUrl = parsed.data.wsUrl.trim();
  const username = parsed.data.username.trim();
  if (!isErpWebServiceUrl(wsUrl) || username === '') {
    return { ok: false, code: AERO_VAULT_ERROR_CODES.INVALID_SETTINGS };
  }

  const password = passwordFromInput(parsed.data);
  const existing = aeroVaultSettingsRow(db, userId);
  if (password === null && existing === null) {
    return { ok: false, code: AERO_VAULT_ERROR_CODES.PASSWORD_REQUIRED };
  }

  const timestamp = now.toISOString();
  if (password === null) {
    db.prepare(`UPDATE ${TABLE} SET ws_url = ?, erp_username = ?, updated_at = ? WHERE user_id = ?`).run(
      wsUrl,
      username,
      timestamp,
      userId,
    );
  } else {
    const secret = encryptSecret(password, key);
    db.prepare(
      `INSERT INTO ${TABLE}
        (user_id, ws_url, erp_username, password_ciphertext, password_iv, password_tag, key_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         ws_url = excluded.ws_url,
         erp_username = excluded.erp_username,
         password_ciphertext = excluded.password_ciphertext,
         password_iv = excluded.password_iv,
         password_tag = excluded.password_tag,
         key_version = excluded.key_version,
         updated_at = excluded.updated_at`,
    ).run(
      userId,
      wsUrl,
      username,
      secret.ciphertext,
      secret.iv,
      secret.tag,
      secret.keyVersion,
      timestamp,
      timestamp,
    );
  }

  return { ok: true, settings: readAeroVaultSettings(db, userId) };
}

/**
 * Remove the vault row and every bridge ticket of that owner.
 *
 * The tickets go with the vault because a ticket that outlives its settings would redeem into an envelope with
 * no credentials. Other owners' rows are untouched: the cleanup is scoped by `user_id`, never global.
 */
export function deleteAeroVaultSettings(db: Database.Database, userId: number): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM ${TABLE} WHERE user_id = ?`).run(userId);
    db.prepare('DELETE FROM aero_bridge_tickets WHERE user_id = ?').run(userId);
  })();
}

/**
 * The stored credentials, decrypted, for the one caller that needs them: ticket redemption.
 *
 * Throws when the key is wrong or the ciphertext was tampered with. The caller turns that into a refusal; it
 * must never be turned into a plausible wrong password, because the ERP would report it as a bad login and the
 * operator would look for the fault in the wrong place.
 */
export function readAeroVaultCredentials(
  db: Database.Database,
  userId: number,
  key: Buffer,
): AeroVaultCredentials | null {
  const row = aeroVaultSettingsRow(db, userId);
  if (!row) return null;
  return {
    wsUrl: row.ws_url,
    username: row.erp_username,
    password: decryptSecret(
      {
        ciphertext: row.password_ciphertext,
        iv: row.password_iv,
        tag: row.password_tag,
        keyVersion: row.key_version,
      },
      key,
    ),
  };
}
