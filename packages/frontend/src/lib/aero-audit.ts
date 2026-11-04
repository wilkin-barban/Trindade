import { api, ApiClientError } from '../api/client';

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
  /**
   * The event names the log accepts, which is the union of the three vocabularies the server keeps.
   *
   * The web says `launch_sync` and `read_history`, the phone says `dispatch` and `sync`, and `import`
   * belongs to whichever client brought a seat in. They are one column because a reader filters the log
   * by event, not by app; `client` is the field that says who wrote the line.
   */
  event: 'test_connection' | 'launch_sync' | 'read_history' | 'dispatch' | 'sync' | 'test' | 'import';
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

/**
 * The request headers that pair a call with the attempt that produced it.
 *
 * The snapshot POST is audited by the server itself when it refuses, and the line it writes has to name
 * the same attempt the page's `read_history` result line names. The transport cannot derive it: it is the
 * page that knows which attempt came back from the shortcut. No attempt, no header -- the server must not
 * receive an identifier for a request that never began.
 */
export function aeroAttemptHeaders(attempt?: { attemptId: string } | null): Record<string, string> {
  return attempt ? { 'X-Trindade-Attempt': attempt.attemptId } : {};
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
 * The line the Recebimento block writes when the day came back from the bridge.
 *
 * The section stores the same snapshot the launch screen stores, so the read is the same `read_history`
 * the page already writes; what the note adds is which lens consumed it. Without that word the log holds
 * two identical reads of one day and a reader cannot tell whether the supplies were ever answered for.
 */
export function aeroReceiptsAuditEvent(args: {
  date: string;
  insumos: number;
  destinationUrl: string;
  error?: string | null;
  attemptId?: string;
}): AeroAuditEvent {
  const note = args.error
    ? `lens=recebimento · date=${args.date} · via=bridge`
    : `lens=recebimento · date=${args.date} · insumos=${args.insumos} · via=bridge`;
  return {
    event: 'read_history',
    phase: 'result',
    destinationUrl: args.destinationUrl,
    note,
    error: args.error ?? null,
    ...(args.attemptId ? { attemptId: args.attemptId } : {}),
  };
}

/**
 * The line an ERP seat leaves when it becomes a local launch, or when it does not.
 *
 * Importing writes to Trindade and never back to the company, so there is no HTTP answer from Aero32 to
 * report: what is worth recording is which seat was taken, with how many boxes, and whether the backend
 * kept it. `ent_lan` is the only field that pairs this launch with the company's own record.
 */
export function aeroImportAuditEvent(args: {
  date: string;
  entLan: number;
  productCode: string;
  boxes: number;
  error?: string | null;
  attemptId?: string;
}): AeroAuditEvent {
  return {
    event: 'import',
    phase: 'result',
    destinationUrl: '/api/massas-launch',
    note: `date=${args.date} · ent_lan=${args.entLan} · product=${args.productCode} · boxes=${args.boxes}`,
    error: args.error ?? null,
    ...(args.attemptId ? { attemptId: args.attemptId } : {}),
  };
}

/**
 * The line a screen writes when it could not start the bridge at all.
 *
 * A button that fires nothing because the device has no company access, and a button that fires an
 * envelope the ERP refuses, used to look the same in the log: neither wrote anything. This is the first
 * one, named, so silence stops being an answer.
 */
export function aeroSyncRefusedEvent(args: {
  date: string;
  destinationUrl: string;
  reason?: string;
}): AeroAuditEvent {
  return {
    event: 'read_history',
    phase: 'requested',
    destinationUrl: args.destinationUrl,
    note: `date=${args.date} · via=bridge`,
    error: args.reason ?? 'AERO_NOT_CONFIGURED',
  };
}

/**
 * What happened to one audit line.
 *
 * A boolean was not enough: `false` read the same whether the server refused the body or the network was
 * gone, and nothing in the browser said so, so a log with a hole looked like a log with nothing to say.
 */
export interface AeroAuditPostResult {
  ok: boolean;
  /** The HTTP status the server answered with, or null when no answer arrived. */
  status: number | null;
  /** The server's own code for the refusal, when it sent one. */
  code: string | null;
}

/**
 * Sends the event, reports a refusal in the console and says what happened.
 *
 * Never throws: the audit trail describes the operation, it is not part of it. A launch that reached
 * the company ERP and then failed to be logged must still read as a successful launch to the operator.
 * The failure does not vanish though: it is written once, with the event, the status and the code, which
 * are the three fields a person reading the console needs to find the missing line.
 */
export async function postAeroAuditEvent(event: AeroAuditEvent): Promise<AeroAuditPostResult> {
  try {
    await api.post('/integration/aero/log', buildAeroAuditBody(event));
    return { ok: true, status: 200, code: null };
  } catch (error) {
    const status = error instanceof ApiClientError ? error.status : null;
    const code = error instanceof ApiClientError ? error.code ?? null : null;
    console.error(
      `[aero-audit] ${event.event} was not stored: status=${status ?? 'none'} code=${code ?? 'none'}`,
    );
    return { ok: false, status, code };
  }
}
