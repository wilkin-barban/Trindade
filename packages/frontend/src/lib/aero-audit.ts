import { api } from '../api/client';

/**
 * One line of the company integration's audit trail.
 *
 * The vocabulary is the server's: it validates this body against a strict schema and stamps the user
 * from the verified token, so nothing here can claim an identity. Everything is optional except the
 * event and the destination because a failed attempt is still worth recording, and a failed attempt
 * often knows nothing but where it was going.
 *
 * Three fields are not optional in practice, and the emitter fills them so no caller can forget:
 * `client` names the app that spoke (the log is one table and the web is not the only author),
 * `attemptId` correlates the `requested` line with the `result` line of the same action, and
 * `durationMs` says how long the ERP took. The server refuses a body over its column sizes instead of
 * trimming it, so the trimming happens here, on the client, before the POST.
 */

/** The app that authored the line. `bridge` and `shortcut` are transports, kept out of `client`. */
export type AeroAuditClient = 'web' | 'android' | 'shortcut' | 'bridge';

export interface AeroAuditEvent {
  event: 'test_connection' | 'launch_sync' | 'read_history';
  phase?: 'requested' | 'result';
  destinationUrl: string;
  httpStatus?: number | null;
  payload?: unknown;
  response?: string | null;
  error?: string | null;
  launchId?: number | null;
  note?: string | null;
  /** Defaults to `web`; the client is not taken from the call site unless it really is another app. */
  client?: AeroAuditClient;
  /** Generated per event when absent. Pass the same one to the requested and the result line. */
  attemptId?: string;
  /** Explicit duration when the caller measured it. */
  durationMs?: number;
  /** Epoch milliseconds the action started; the emitter derives `durationMs` from it. Never sent. */
  startedAt?: number;
}

/** The exact body the server accepts, with every field it refuses already trimmed. */
export interface AeroAuditBody {
  event: AeroAuditEvent['event'];
  destinationUrl: string;
  client: AeroAuditClient;
  attemptId: string;
  durationMs: number;
  phase?: 'requested' | 'result';
  httpStatus?: number | null;
  payload?: unknown;
  response?: string | null;
  error?: string | null;
  launchId?: number | null;
  note?: string | null;
}

/** Column sizes the server enforces. A longer value is a 400, so it is trimmed here. */
export const AERO_NOTE_MAX = 256;
export const AERO_ERROR_MAX = 1024;
export const AERO_RESPONSE_MAX = 4096;

/** The prefix every audit error carries, so the log can be filtered by code and not by prose. */
export const AERO_ERROR_PREFIX = 'AERO_';

/**
 * Starts an attempt and remembers when it started.
 *
 * The pair is what makes two lines about the same action readable together: without it, a `requested`
 * that never gets a `result` can only be guessed at by comparing timestamps and payloads.
 */
export function newAeroAttempt(now: number = Date.now()): { attemptId: string; startedAt: number } {
  return { attemptId: newAeroAttemptId(), startedAt: now };
}

/** A random identifier, with a fallback for browsers that predate `randomUUID`. */
export function newAeroAttemptId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `attempt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Turns whatever the client knows about a failure into a code the log can be filtered by.
 *
 * The ERP answers in Portuguese sentences and the bridge in short tokens; both used to travel as the
 * `error` field, which made the log's most important column unqueryable. A token-shaped value keeps its
 * meaning (`movements_unreadable` becomes `AERO_MOVEMENTS_UNREADABLE`); a sentence is classified into one
 * of the codes below, which is the most the log can honestly say about it.
 */
export function aeroErrorCode(error: string | null | undefined): string | null {
  const raw = (error ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith(AERO_ERROR_PREFIX)) return raw;
  if (/^[a-z][a-z0-9_]*$/.test(raw)) return `${AERO_ERROR_PREFIX}${raw.toUpperCase()}`;

  const lower = raw.toLowerCase();
  if (lower.includes('mixed') || lower.includes('bloque')) return 'AERO_BLOCKED_MIXED_CONTENT';
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('tempo esgotado')) {
    return 'AERO_TIMEOUT';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('unreachable') ||
    lower.includes('econn') ||
    lower.includes('sem conex')
  ) {
    return 'AERO_UNREACHABLE';
  }
  if (lower.includes('401') || lower.includes('unauthor') || lower.includes('credenc') || lower.includes('senha')) {
    return 'AERO_UNAUTHORIZED';
  }
  if (lower.includes('403') || lower.includes('forbidden') || lower.includes('proib')) return 'AERO_FORBIDDEN';
  if (lower.includes('404') || lower.includes('não encontrad') || lower.includes('nao encontrad')) {
    return 'AERO_NOT_FOUND';
  }
  if (/\b5\d\d\b/.test(lower) || lower.includes('erp')) return 'AERO_ERP_ERROR';
  return 'AERO_CLIENT_ERROR';
}

/**
 * The audit `error` value: a stable code, plus the ERP's own words when there were any.
 *
 * A code alone loses the sentence the ERP answered with, and the sentence alone cannot be filtered. The
 * code comes first so `grep AERO_UNAUTHORIZED` works, and the detail follows for the person reading one
 * line. Length is capped at the column the server enforces.
 */
export function aeroAuditErrorValue(error: string | null | undefined): string | null {
  const raw = (error ?? '').trim();
  if (!raw) return null;
  const code = aeroErrorCode(raw)!;
  const tokenShaped = raw.startsWith(AERO_ERROR_PREFIX) || /^[a-z][a-z0-9_]*$/.test(raw);
  const value = tokenShaped ? code : `${code}: ${raw.replace(/\s+/g, ' ').trim()}`;
  return truncate(value, AERO_ERROR_MAX);
}

/**
 * Normalizes one event into the body the server will accept.
 *
 * Exported because the rules are worth asserting without a network: identity, correlation, duration,
 * trimming and the error code. `postAeroAuditEvent` is a POST over this and nothing else.
 */
export function buildAeroAuditBody(event: AeroAuditEvent, now: number = Date.now()): AeroAuditBody {
  const durationMs =
    event.durationMs ??
    (event.startedAt !== undefined ? Math.max(0, now - event.startedAt) : 0);

  const body: AeroAuditBody = {
    event: event.event,
    destinationUrl: event.destinationUrl,
    client: event.client ?? 'web',
    attemptId: truncate(event.attemptId, 64) ?? newAeroAttemptId(),
    durationMs: Math.min(Math.max(0, Math.trunc(durationMs)), 600_000),
  };

  if (event.phase !== undefined) body.phase = event.phase;
  if (event.httpStatus !== undefined) body.httpStatus = event.httpStatus;
  if (event.payload !== undefined) body.payload = event.payload;
  if (event.response !== undefined) body.response = truncate(event.response, AERO_RESPONSE_MAX);
  if (event.error !== undefined) body.error = aeroAuditErrorValue(event.error);
  if (event.launchId !== undefined) body.launchId = event.launchId;
  if (event.note !== undefined) body.note = truncate(event.note, AERO_NOTE_MAX);

  return body;
}

/**
 * Sends the event and reports whether the server kept it.
 *
 * Never throws: the audit trail describes the operation, it is not part of it. A launch that reached
 * the company ERP and then failed to be logged must still read as a successful launch to the operator.
 */
export async function postAeroAuditEvent(event: AeroAuditEvent): Promise<boolean> {
  try {
    await api.post('/integration/aero/log', buildAeroAuditBody(event));
    return true;
  } catch {
    return false;
  }
}
