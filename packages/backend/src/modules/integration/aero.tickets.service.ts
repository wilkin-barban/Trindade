import { createHash, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { decryptSecret } from './vault.crypto.js';
import { aeroVaultSettingsRow, type AeroVaultSettingsRow } from './aero.settings.service.js';
import type { AeroBridgeActionName } from './aero.vault.schema.js';
import type { AeroBridgeEnvelopeContract } from './aero.vault.contract.js';

/**
 * One-use bridge tickets: the credential the iPhone shortcut redeems for an envelope it does not build.
 *
 * The page cannot hold the ERP password any more, and the shortcut cannot ask a server it has no session with
 * for a long-lived credential. So the page mints a ticket that lives 120 seconds, works once, and answers with
 * an envelope already serialised here. Only the SHA-256 of the token is stored: a copy of the database cannot
 * be replayed against the API.
 */

/** How long a ticket can be redeemed. Short enough that a leaked dictionary in Shortcuts is worthless. */
export const BRIDGE_TICKET_TTL_MS = 120_000;

/** How many tickets one owner may have pending at once. The page needs a handful, never a list. */
export const MAX_PENDING_BRIDGE_TICKETS = 8;

/** The header the shortcut presents the token in. Never the URL: URLs land in logs and history. */
export const BRIDGE_TICKET_HEADER = 'x-trindade-ticket';

/** Where the launch page lives when the caller does not say, matching the shortcut's callback. */
export const DEFAULT_BRIDGE_CALLBACK_PATH = '/massas-launch';

const REDEEM_PATH = '/api/integration/aero/bridge-tickets/redeem';

const TABLE = 'aero_bridge_tickets';

/**
 * The endpoint each action posts to. The server maps it, not the page: the browser must not be able to aim the
 * shortcut at an arbitrary path of the plant's WebService, and the shortcut must not have to know the ERP.
 */
export const BRIDGE_ENDPOINT_BY_ACTION: Record<AeroBridgeActionName, string> = {
  entrada: 'entradasitem',
  entrada_lote: 'entradasitem',
  saida: 'saidasitem',
  movimentos: 'movimentoitem?_method=PATCH',
  test: 'usuarios',
};

/** A stored ticket. `bodies` is JSON text holding an array of JSON texts, or `null` outside a batch. */
export interface AeroBridgeTicketRow {
  id: number;
  token_hash: string;
  user_id: number;
  action: AeroBridgeActionName;
  endpoint: string;
  body: string;
  bodies: string | null;
  callback_url: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface IssuedBridgeTicket {
  ticket: string;
  ticketUrl: string;
  expiresAt: string;
}

export type RedeemBridgeTicketResult =
  | { ok: true; envelope: AeroBridgeEnvelopeContract }
  | { ok: false; code: 'AERO_TICKET_NOT_FOUND' | 'AERO_TICKET_UNUSABLE' };

/**
 * The public origin of this deployment, resolved per request the same way the server does at startup.
 *
 * Per request and not once at import: a test (or a deployment behind a fresh proxy) sets the variable after the
 * module is loaded, and a cached value would hand out redemption URLs pointing somewhere else.
 */
export function resolvePublicAppUrl(environment: Record<string, string | undefined> = process.env): string {
  return environment.PUBLIC_APP_URL || environment.APP_URL || `http://localhost:${environment.PORT || '3000'}`;
}

/** Where the shortcut redeems. It carries no token: the token travels in the header alone. */
export function bridgeTicketRedeemUrl(publicAppUrl: string): string {
  return `${publicAppUrl.replace(/\/+$/, '')}${REDEEM_PATH}`;
}

/**
 * The absolute callback the shortcut opens when it finishes, or `null` when the path leaves the public origin.
 *
 * Resolved against `PUBLIC_APP_URL` and then compared by origin, which is what catches `//evil.example/x` and an
 * absolute foreign URL in the same check: both parse as a different origin. `aero_action` and an empty
 * `aero_data` are then set on it, so the landing page knows which action came back and clears whatever it stored
 * in the query.
 */
export function resolveBridgeCallbackUrl(
  action: AeroBridgeActionName,
  callbackPath: string | null,
  publicAppUrl: string,
): string | null {
  let base: URL;
  try {
    base = new URL(publicAppUrl);
  } catch {
    return null;
  }

  let target: URL;
  try {
    target = new URL(callbackPath ?? DEFAULT_BRIDGE_CALLBACK_PATH, base);
  } catch {
    return null;
  }
  if (target.origin !== base.origin) return null;

  target.searchParams.set('aero_action', action);
  target.searchParams.set('aero_data', '');
  return target.toString();
}

/** The SHA-256 the table stores instead of the token. */
export function hashBridgeTicket(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Forget every ticket that can no longer be redeemed, whoever owns it.
 *
 * This cleanup is deliberately not scoped by owner: a spent or expired row is dead for everyone, so removing it
 * costs nobody a usable credential and keeps the table from growing with tokens that would only ever answer 410.
 * Live tickets are still never touched across owners -- that is what `dropOldestPendingTickets` scopes.
 */
function dropDeadTickets(db: Database.Database, nowIso: string): void {
  db.prepare(`DELETE FROM ${TABLE} WHERE used_at IS NOT NULL OR expires_at <= ?`).run(nowIso);
}

function dropOldestPendingTickets(db: Database.Database, userId: number, count: number): void {
  if (count <= 0) return;
  db.prepare(
    `DELETE FROM ${TABLE} WHERE id IN (
       SELECT id FROM ${TABLE} WHERE user_id = ? AND used_at IS NULL ORDER BY created_at ASC, id ASC LIMIT ?
     )`,
  ).run(userId, count);
}

function countPendingTickets(db: Database.Database, userId: number): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${TABLE} WHERE user_id = ? AND used_at IS NULL`).get(userId) as {
    n: number;
  };
  return row.n;
}

/**
 * Prepare the row for a new ticket: forget everything that can no longer be used, then make room for this one.
 *
 * Both steps run before the insert and inside the same transaction, so the table cannot keep a growing pile of
 * dead tokens, and the oldest *pending* ticket of this owner is the one sacrificed when the cap is reached. The
 * page issues tickets in the order it uses them, so the oldest is the least likely to still be needed, and no
 * other owner's usable ticket is ever dropped to make room for this one.
 */
function makeRoomForTicket(db: Database.Database, userId: number, nowIso: string): void {
  dropDeadTickets(db, nowIso);
  const pending = countPendingTickets(db, userId);
  dropOldestPendingTickets(db, userId, pending + 1 - MAX_PENDING_BRIDGE_TICKETS);
}

/**
 * Issue one ticket. The token is returned to the caller once and never stored: the row keeps its hash.
 *
 * `body` and `bodies` are serialised here because the existing shortcut actions send that text as the request
 * body. Sending objects instead would force every phone to be rebuilt for a change that is meant to be only the
 * credential's storage.
 */
export function issueBridgeTicket(
  db: Database.Database,
  input: {
    userId: number;
    action: AeroBridgeActionName;
    payloads: Record<string, unknown>[];
    callbackUrl: string;
    publicAppUrl: string;
  },
  now: Date = new Date(),
): IssuedBridgeTicket {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashBridgeTicket(token);
  const serialized = input.payloads.map((payload) => JSON.stringify(payload));
  const body = serialized[0];
  // `bodies` is the batch: every payload in order, for the actions that can carry more than one. `saida` is a
  // batch only when it really has several products, so a one-product baixa keeps the plain `body` the shortcut
  // already sends for the single actions.
  const carriesEveryBody = input.action === 'entrada_lote' || (input.action === 'saida' && input.payloads.length > 1);
  const bodies = carriesEveryBody ? JSON.stringify(serialized) : null;
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + BRIDGE_TICKET_TTL_MS).toISOString();

  db.transaction(() => {
    makeRoomForTicket(db, input.userId, createdAt);
    db.prepare(
      `INSERT INTO ${TABLE}
        (token_hash, user_id, action, endpoint, body, bodies, callback_url, expires_at, used_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    ).run(
      tokenHash,
      input.userId,
      input.action,
      BRIDGE_ENDPOINT_BY_ACTION[input.action],
      body,
      bodies,
      input.callbackUrl,
      expiresAt,
      createdAt,
    );
  })();

  return { ticket: token, ticketUrl: bridgeTicketRedeemUrl(input.publicAppUrl), expiresAt };
}

function buildBridgeEnvelope(
  ticket: AeroBridgeTicketRow,
  settings: AeroVaultSettingsRow,
  password: string,
): AeroBridgeEnvelopeContract {
  const base = settings.ws_url.replace(/\/+$/, '');
  const envelope: AeroBridgeEnvelopeContract = {
    url: `${base}/${ticket.endpoint}`,
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${settings.erp_username}:${password}`, 'utf8').toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: ticket.body,
    callback: ticket.callback_url,
  };
  if (ticket.bodies !== null) {
    envelope.bodies = JSON.parse(ticket.bodies) as string[];
  }
  return envelope;
}

/**
 * Redeem a ticket for the envelope.
 *
 * The claim is one synchronous transaction: the row is read, the conditional `UPDATE ... WHERE used_at IS NULL`
 * must change exactly one row, and the password is decrypted inside the same transaction. A second caller
 * arriving with the same token therefore finds either a used row or zero changed rows, never a second envelope.
 * If the decryption fails the whole transaction rolls back and the ticket stays redeemable, because the fault is
 * the vault's and not the ticket's.
 */
export function redeemBridgeTicket(
  db: Database.Database,
  token: string,
  key: Buffer,
  now: Date = new Date(),
): RedeemBridgeTicketResult {
  const tokenHash = hashBridgeTicket(token);
  const nowIso = now.toISOString();

  return db.transaction((): RedeemBridgeTicketResult => {
    const ticket = db.prepare(`SELECT * FROM ${TABLE} WHERE token_hash = ?`).get(tokenHash) as
      | AeroBridgeTicketRow
      | undefined;
    if (!ticket) return { ok: false, code: 'AERO_TICKET_NOT_FOUND' };

    // Same answer for used and for expired: the response must not tell a replay which of the two it hit.
    if (ticket.used_at !== null || ticket.expires_at <= nowIso) {
      return { ok: false, code: 'AERO_TICKET_UNUSABLE' };
    }

    const claimed = db
      .prepare(`UPDATE ${TABLE} SET used_at = ? WHERE id = ? AND used_at IS NULL`)
      .run(nowIso, ticket.id);
    if (claimed.changes !== 1) return { ok: false, code: 'AERO_TICKET_UNUSABLE' };

    const settings = aeroVaultSettingsRow(db, ticket.user_id);
    if (!settings) return { ok: false, code: 'AERO_TICKET_NOT_FOUND' };

    const password = decryptSecret(
      {
        ciphertext: settings.password_ciphertext,
        iv: settings.password_iv,
        tag: settings.password_tag,
        keyVersion: settings.key_version,
      },
      key,
    );

    return { ok: true, envelope: buildBridgeEnvelope(ticket, settings, password) };
  })();
}
