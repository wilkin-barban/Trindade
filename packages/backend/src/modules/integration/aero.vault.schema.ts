import { z } from 'zod';

/**
 * The shapes and the reason codes of the ERP vault and of its one-use bridge tickets.
 *
 * The header the iPhone shortcut presents is the only literal that several layers have to agree on. The vault
 * is per operator: the account comes from the session, never from a username written here. The codes are
 * semantic on purpose — the page branches on the code and shows its own sentence, so a refusal can be explained
 * without the server having to guess at the UI.
 *
 * The Zod schemas describe only what the wire must look like. What makes a URL an ERP URL, or how many payloads
 * one action accepts, is decided by the service that owns the rule: that way a refusal carries a code the page
 * can act on instead of a flattened field error.
 */

/** Codes the settings endpoints answer with. */
export const AERO_VAULT_ERROR_CODES = {
  /** `AERO_VAULT_KEY` is missing or does not decode to 32 bytes, or there is no usable password stored. */
  NOT_CONFIGURED: 'AERO_VAULT_NOT_CONFIGURED',
  INVALID_SETTINGS: 'AERO_VAULT_INVALID_SETTINGS',
  PASSWORD_REQUIRED: 'AERO_VAULT_PASSWORD_REQUIRED',
} as const;

export type AeroVaultErrorCode = (typeof AERO_VAULT_ERROR_CODES)[keyof typeof AERO_VAULT_ERROR_CODES];

/** Codes a bridge ticket request is refused with, before any secret is touched. */
export const AERO_BRIDGE_ERROR_CODES = {
  INVALID_ACTION: 'AERO_BRIDGE_INVALID_ACTION',
  INVALID_PAYLOADS: 'AERO_BRIDGE_INVALID_PAYLOADS',
  INVALID_CALLBACK: 'AERO_BRIDGE_INVALID_CALLBACK',
  FORBIDDEN: 'AERO_BRIDGE_FORBIDDEN',
} as const;

export type AeroBridgeErrorCode = (typeof AERO_BRIDGE_ERROR_CODES)[keyof typeof AERO_BRIDGE_ERROR_CODES];

/** Codes redemption answers with. Missing, unknown and spent are told apart only by status code. */
export const AERO_TICKET_ERROR_CODES = {
  MISSING: 'AERO_TICKET_MISSING',
  NOT_FOUND: 'AERO_TICKET_NOT_FOUND',
  UNUSABLE: 'AERO_TICKET_UNUSABLE',
} as const;

export type AeroTicketErrorCode = (typeof AERO_TICKET_ERROR_CODES)[keyof typeof AERO_TICKET_ERROR_CODES];

/** One entry of a refusal: the reason code plus the sentence the operator reads. */
export interface AeroVaultError {
  code: string;
  message: string;
}

export const AERO_VAULT_URL_MAX_LENGTH = 2048;
export const AERO_VAULT_USERNAME_MAX_LENGTH = 64;
export const AERO_VAULT_PASSWORD_MAX_LENGTH = 256;

/**
 * The body of `PUT /settings`.
 *
 * Lengths are checked here so a megabyte of text never reaches the URL parser; `min(1)` is deliberately absent
 * from `wsUrl` because `''` has to answer the semantic code (`AERO_VAULT_INVALID_SETTINGS`) rather than a field
 * error. The password may arrive empty: an empty password means "keep the stored one".
 */
export const AeroVaultSettingsBodySchema = z
  .object({
    wsUrl: z.string().max(AERO_VAULT_URL_MAX_LENGTH),
    username: z.string().max(AERO_VAULT_USERNAME_MAX_LENGTH),
    password: z.string().max(AERO_VAULT_PASSWORD_MAX_LENGTH).optional(),
  })
  .strict();

export type AeroVaultSettingsBody = z.infer<typeof AeroVaultSettingsBodySchema>;

/**
 * The five actions the shortcut knows. Everything else is refused before a row is written.
 *
 * `saida` is the baixa of insumos, embalagens and bobinas: a whole movement of up to eight products leaves as
 * one ticket, so it is a batch like `entrada_lote` and not a single payload like the others.
 */
export const AERO_BRIDGE_ACTIONS = ['entrada', 'entrada_lote', 'saida', 'movimentos', 'test'] as const;

export type AeroBridgeActionName = (typeof AERO_BRIDGE_ACTIONS)[number];

/** One batch action carries two to eight payloads; each of the others carries exactly one. */
export const AERO_BRIDGE_BATCH_MIN_PAYLOADS = 2;
export const AERO_BRIDGE_BATCH_MAX_PAYLOADS = 8;

/**
 * How many payloads each action accepts.
 *
 * `saida` starts at one because a movement with a single product is a movement, while `entrada_lote` starts at
 * two because a "lot" of one is the single entry that already exists. Declared as a range per action instead of
 * a branch inside the parser, so the rule the message describes and the rule the code applies are the same one.
 */
export const AERO_BRIDGE_PAYLOAD_RANGE: Record<AeroBridgeActionName, { min: number; max: number }> = {
  entrada: { min: 1, max: 1 },
  entrada_lote: { min: AERO_BRIDGE_BATCH_MIN_PAYLOADS, max: AERO_BRIDGE_BATCH_MAX_PAYLOADS },
  saida: { min: 1, max: AERO_BRIDGE_BATCH_MAX_PAYLOADS },
  movimentos: { min: 1, max: 1 },
  test: { min: 1, max: 1 },
};

export const AERO_BRIDGE_MAX_SERIALIZED_BYTES = 32 * 1024;

export const AeroBridgeActionSchema = z.enum(AERO_BRIDGE_ACTIONS);

/**
 * The body of `POST /bridge-tickets`, before the per-action rules run.
 *
 * `payloads` is not typed as a record array on purpose: `['not an object']` has to answer
 * `AERO_BRIDGE_INVALID_PAYLOADS`, and a Zod array of records would answer the same for a length problem, losing
 * the difference between "wrong shape" and "wrong count" that the page phrases differently.
 */
export const AeroBridgeTicketBodySchema = z
  .object({
    action: z.string(),
    payloads: z.array(z.unknown()),
    callbackPath: z.string().max(AERO_VAULT_URL_MAX_LENGTH).optional(),
  })
  .strict();

export type AeroBridgeTicketBody = z.infer<typeof AeroBridgeTicketBodySchema>;

export interface AeroBridgeTicketRequest {
  action: AeroBridgeActionName;
  payloads: Record<string, unknown>[];
  /** `null` means the caller said nothing, and the default launch page is used. */
  callbackPath: string | null;
}

export function isBridgeAction(value: string): value is AeroBridgeActionName {
  return (AERO_BRIDGE_ACTIONS as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read `POST /bridge-tickets` into the request the service issues a ticket for.
 *
 * The refusals are ordered the way the operator reads them: an unknown action before a payload count, because
 * the action decides how many payloads are legal. Serialising here also measures the real weight of what will be
 * stored, instead of trusting the array length as a proxy for size.
 */
export function parseAeroBridgeTicketRequest(
  raw: unknown,
): { ok: true; request: AeroBridgeTicketRequest } | { ok: false; code: string } {
  const body = isPlainObject(raw) ? raw : {};
  const rawAction = typeof body.action === 'string' ? body.action.trim() : '';
  if (!isBridgeAction(rawAction)) {
    return { ok: false, code: AERO_BRIDGE_ERROR_CODES.INVALID_ACTION };
  }

  const payloads = body.payloads;
  if (!Array.isArray(payloads) || !payloads.every(isPlainObject)) {
    return { ok: false, code: AERO_BRIDGE_ERROR_CODES.INVALID_PAYLOADS };
  }

  const count = payloads.length;
  const range = AERO_BRIDGE_PAYLOAD_RANGE[rawAction];
  const validCount = count >= range.min && count <= range.max;
  if (!validCount) {
    return { ok: false, code: AERO_BRIDGE_ERROR_CODES.INVALID_PAYLOADS };
  }

  const serialized = payloads.map((payload) => JSON.stringify(payload));
  const totalBytes = serialized.reduce((total, entry) => total + Buffer.byteLength(entry, 'utf8'), 0);
  if (totalBytes > AERO_BRIDGE_MAX_SERIALIZED_BYTES) {
    return { ok: false, code: AERO_BRIDGE_ERROR_CODES.INVALID_PAYLOADS };
  }

  let callbackPath: string | null = null;
  if (body.callbackPath !== undefined && body.callbackPath !== null) {
    if (typeof body.callbackPath !== 'string' || body.callbackPath === '') {
      return { ok: false, code: AERO_BRIDGE_ERROR_CODES.INVALID_CALLBACK };
    }
    callbackPath = body.callbackPath;
  }

  return { ok: true, request: { action: rawAction, payloads: payloads as Record<string, unknown>[], callbackPath } };
}
