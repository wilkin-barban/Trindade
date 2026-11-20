import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const AERO_LOG_FILE = 'aero-integration.log';
export const AERO_LOG_MAX_BYTES = 2 * 1024 * 1024;
const TRUNCATION_MARKER = '…[truncated]';
const PAYLOAD_MAX_CHARS = 4096;
const RESPONSE_MAX_CHARS = 2048;

/**
 * What replaces a secret. Stable on purpose: an operator greps for it once and learns to recognize it, and a
 * line that says nothing about a credential is more useful than a line that pretends the ERP answered blank.
 */
export const AERO_REDACTED = '[redacted]';

/**
 * Structured log entry for Aero32 WebService integration events.
 */
export interface AeroLogEntry {
  ts: string;
  event: string;
  phase: string | null;
  user: string;
  role: string;
  destinationUrl: string;
  httpStatus: number | null;
  payload: unknown;
  response: string | null;
  error: string | null;
  launchId: number | null;
  note: string | null;
  client: string | null;
  attemptId: string | null;
  durationMs: number | null;
  appVersion?: string | null;
  buildNumber?: number | null;
}

/**
 * The local half of the audit trail.
 *
 * These four events never leave the machine: they record that a movement, a report or one of their photos was
 * written into Trindade's own database. They live in the same file as the ERP calls on purpose, because the
 * question an operator asks on a Monday morning -- "did the plant record this?" -- is answered by reading one
 * line, not by correlating a file with the database.
 *
 * The spelling is fixed here and in `AeroLogEventSchema`; the two lists are what the contract test pins.
 */
export const AERO_LOCAL_EVENTS = ['salida_create', 'salida_photo', 'salida_delete', 'report_create', 'report_photo'] as const;

export type AeroLocalEvent = (typeof AERO_LOCAL_EVENTS)[number];

/** The two local surfaces that own the events above. */
export type AeroLocalDestination = 'local://salida' | 'local://reports';

/**
 * Appends one local event, with the fields the remote events always keep null.
 *
 * A local write has no phase, no HTTP status, no response and no attempt: it happened. Accepting
 * `appendAeroLog` directly would make every caller repeat eight nulls and would let them drift, so the shape of a
 * local line is stated once here.
 */
export function appendLocalAeroLog(
  entry: {
    event: AeroLocalEvent;
    user: string;
    role: string;
    destinationUrl: AeroLocalDestination;
    payload: unknown;
    note: string;
  },
  dir?: string,
): string {
  return appendAeroLog(
    {
      ts: new Date().toISOString(),
      event: entry.event,
      phase: null,
      user: entry.user,
      role: entry.role,
      destinationUrl: entry.destinationUrl,
      httpStatus: null,
      payload: entry.payload,
      response: null,
      error: null,
      launchId: null,
      note: entry.note,
      client: null,
      attemptId: null,
      durationMs: null,
    },
    dir,
  );
}

/**
 * Resolves the directory where the Aero integration audit log is stored.
 * Honors AERO_LOG_DIR from the environment when set and non-empty, falling back
 * to the `logs` folder under the process current working directory.
 */
export function resolveAeroLogDir(env?: NodeJS.ProcessEnv): string {
  const currentEnv = env ?? process.env;
  const custom = currentEnv.AERO_LOG_DIR?.trim();
  if (custom && custom.length > 0) {
    return custom;
  }
  return join(process.cwd(), 'logs');
}

/**
 * Recursively removes authorization and credential fields from payloads
 * so passwords, basic auth tokens, and secret keys never leak to disk.
 */
function sanitizePayloadData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizePayloadData);
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (
      lower === 'authorization' ||
      lower.includes('password') ||
      lower === 'senha' ||
      lower.includes('credential')
    ) {
      continue;
    }
    sanitized[key] = sanitizePayloadData(value);
  }
  return sanitized;
}

/** A credential field name, wherever it appears and in any casing. */
const SENSITIVE_KEY_VALUE =
  /(["']?)([A-Za-z0-9_.-]*(?:authorization|password|senha|passwd|token|secret|credential|api[-_]?key|cookie)[A-Za-z0-9_.-]*)(\1\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;&}\]\[]+)/gi;

/** `Basic <base64>` and `Bearer <token>` wherever a client echoed the header it sent. */
const SCHEME_TOKEN = /\b(basic|bearer)\s+([A-Za-z0-9._~+/=-]+)/gi;

/**
 * A `Cookie:`/`Set-Cookie:` header carries several pairs separated by `;`, so the whole line is the value.
 * The header name and its separator survive; only the pairs are replaced.
 */
const COOKIE_HEADER = /\b(set-cookie|cookie)\b(\s*[:=]\s*)([^\n"']+)/gi;

/** A long hex run is a hash, a key or a signature; none of them belong on disk. */
const HEX_RUN = /\b[0-9a-fA-F]{32,}\b/g;

/** A long base64 run is judged as key material only when it looks random (see `looksLikeKeyMaterial`). */
const BASE64_RUN = /[A-Za-z0-9+/]{40,}={0,2}/g;

/**
 * Decides whether a run of base64 characters is a secret rather than a long ordinary word.
 *
 * The alphabet of base64 has no underscore and no space, so prose rarely survives 40 characters inside it. The
 * cases that do -- a long source identifier, a checksum without digits -- are not worth a false redaction, so the
 * run has to mix cases and carry at least one digit.
 */
function looksLikeKeyMaterial(run: string): boolean {
  const body = run.replace(/=+$/, '');
  if (body.length < 32) {
    return false;
  }
  return /[A-Z]/.test(body) && /[a-z]/.test(body) && /[0-9]/.test(body);
}

/** Decides whether the word after `Basic`/`Bearer` is a credential and not the prose word "authentication". */
function looksLikeCredentialToken(token: string): boolean {
  if (token.length < 6) {
    return false;
  }
  if (/[0-9]/.test(token) || token.endsWith('=')) {
    return true;
  }
  return token.length >= 16 && /[A-Z]/.test(token) && /[a-z]/.test(token);
}

/**
 * Replaces the value of one `key: value` / `key=value` / `"key":"value"` match, keeping its punctuation.
 * A scheme (`Basic`, `Bearer`) is part of the diagnosis, not part of the secret, so it stays.
 */
function redactKeyValue(match: string, quote: string, key: string, separator: string, rawValue: string): string {
  const quoted = rawValue.startsWith('"') || rawValue.startsWith("'");
  const value = quoted ? rawValue.slice(1, -1) : rawValue;
  const scheme = /^(basic|bearer)\s/i.exec(value)?.[1];
  const marker = scheme ? `${scheme} ${AERO_REDACTED}` : AERO_REDACTED;

  // Already redacted: the value is the scheme whose credential the rule above replaced.
  if (/^(basic|bearer)$/i.test(value)) {
    return match;
  }
  if (value === AERO_REDACTED || value === marker) {
    return match;
  }
  const q = quoted ? rawValue[0] : '';
  return `${quote}${key}${separator}${q}${marker}${q}`;
}

/**
 * Removes credentials from a free-text field, in place and without removing the sentence around them.
 *
 * The ERP answers in prose -- an HTML error page, the request body it refused to parse -- so the secrets arrive
 * inside a longer string rather than as object keys. The rules therefore work on the text: a sensitive key and
 * its value, an echoed authorization header, a cookie header, and long hex or base64 runs that are shaped like
 * keys. Everything else, including the message the operator needs on a Monday, is left alone.
 */
export function redactAeroText(text: string): string {
  return text
    .replace(SCHEME_TOKEN, (match, scheme: string, token: string) =>
      looksLikeCredentialToken(token) ? `${scheme} ${AERO_REDACTED}` : match,
    )
    .replace(COOKIE_HEADER, (_match, header: string, separator: string) => `${header}${separator}${AERO_REDACTED}`)
    .replace(SENSITIVE_KEY_VALUE, redactKeyValue)
    .replace(HEX_RUN, AERO_REDACTED)
    .replace(BASE64_RUN, (run) => (looksLikeKeyMaterial(run) ? AERO_REDACTED : run));
}

/** Redacts every string inside a payload, whatever shape the payload has. */
function redactPayloadStrings(data: unknown): unknown {
  if (typeof data === 'string') {
    return redactAeroText(data);
  }
  if (Array.isArray(data)) {
    return data.map(redactPayloadStrings);
  }
  if (data !== null && typeof data === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      redacted[key] = redactPayloadStrings(value);
    }
    return redacted;
  }
  return data;
}

/**
 * Appends one JSON line to the Aero integration log file.
 * Handles directory creation, single-generation size rotation at 2MB,
 * credential redaction, and length truncation for payload and response fields.
 */
export function appendAeroLog(entry: AeroLogEntry, dir?: string): string {
  const logDir = dir ?? resolveAeroLogDir();
  mkdirSync(logDir, { recursive: true });

  const filePath = join(logDir, AERO_LOG_FILE);
  const rotatedPath = `${filePath}.1`;

  if (existsSync(filePath)) {
    try {
      const stats = statSync(filePath);
      if (stats.size >= AERO_LOG_MAX_BYTES) {
        if (existsSync(rotatedPath)) {
          rmSync(rotatedPath, { force: true });
        }
        renameSync(filePath, rotatedPath);
      }
    } catch {
      // Rotation failure should not prevent logging the current event
    }
  }

  // Sanitize, redact and cap payload
  let finalPayload = redactPayloadStrings(sanitizePayloadData(entry.payload));
  if (finalPayload !== undefined && finalPayload !== null) {
    if (typeof finalPayload === 'string') {
      if (finalPayload.length > PAYLOAD_MAX_CHARS) {
        finalPayload = finalPayload.slice(0, PAYLOAD_MAX_CHARS) + TRUNCATION_MARKER;
      }
    } else {
      const serialized = JSON.stringify(finalPayload);
      if (serialized && serialized.length > PAYLOAD_MAX_CHARS) {
        finalPayload = serialized.slice(0, PAYLOAD_MAX_CHARS) + TRUNCATION_MARKER;
      }
    }
  } else {
    finalPayload = null;
  }

  // Redact, then cap response
  let finalResponse = entry.response == null ? null : redactAeroText(entry.response);
  if (finalResponse && finalResponse.length > RESPONSE_MAX_CHARS) {
    finalResponse = finalResponse.slice(0, RESPONSE_MAX_CHARS) + TRUNCATION_MARKER;
  }

  const record: AeroLogEntry = {
    ts: entry.ts,
    event: entry.event,
    phase: entry.phase ?? null,
    user: entry.user,
    role: entry.role,
    destinationUrl: entry.destinationUrl,
    httpStatus: entry.httpStatus ?? null,
    payload: finalPayload,
    response: finalResponse,
    error: entry.error == null ? null : redactAeroText(entry.error),
    launchId: entry.launchId ?? null,
    note: entry.note ?? null,
    client: entry.client ?? null,
    attemptId: entry.attemptId ?? null,
    durationMs: entry.durationMs ?? null,
    ...(entry.appVersion != null ? { appVersion: entry.appVersion } : {}),
    ...(entry.buildNumber != null ? { buildNumber: entry.buildNumber } : {}),
  };

  const line = JSON.stringify(record) + '\n';
  appendFileSync(filePath, line, 'utf-8');

  return filePath;
}
