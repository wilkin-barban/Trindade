import { z } from 'zod';

/**
 * Codes the integration endpoint answers with, so a client can branch on the reason rather than
 * on the sentence.
 */
export const AERO_ERROR_CODES = {
  INVALID_AERO_LOG: 'INVALID_AERO_LOG',
} as const;

export type AeroErrorCode = (typeof AERO_ERROR_CODES)[keyof typeof AERO_ERROR_CODES];

/**
 * Valid event types for the company Aero WebService integration audit trail.
 *
 * The two vocabularies are not a mistake. The web and the iOS shortcut speak of `launch_sync`,
 * `read_history` and `test_connection`; the phone says `dispatch`, `sync` and `test`. They grew
 * apart because each client was written against its own screen, and the server used to accept only
 * the web's words, so every Android line was refused with a 400. Both are accepted now and the
 * `client` field says who spoke, which is what the operator reads when a line looks odd.
 */
export const AeroLogEventSchema = z.enum([
  'test_connection',
  'launch_sync',
  'read_history',
  'dispatch',
  'sync',
  'test',
  'import',
]);

/**
 * Operation phase: requested before sending, result upon server response or network outcome.
 * Android reports `response` for the same moment the web calls `result`.
 */
export const AeroLogPhaseSchema = z.enum(['requested', 'result', 'response']);

/**
 * The app that authored the line. `bridge` and `shortcut` are transports the web uses, not other
 * apps, but they are kept as identities because that is what the log already knows how to say.
 */
export const AeroLogClientSchema = z.enum(['android', 'web', 'shortcut', 'bridge']);

/**
 * Request body for appending an audit log event.
 * Marked strict to reject smuggled fields such as inline credentials or authorization headers.
 */
export const AeroLogBodySchema = z
  .object({
    event: AeroLogEventSchema,
    phase: AeroLogPhaseSchema.optional(),
    destinationUrl: z.string().min(1).max(2048),
    httpStatus: z.number().int().min(100).max(599).nullable().optional(),
    payload: z.unknown().optional(),
    response: z.string().max(4096).nullable().optional(),
    error: z.string().max(1024).nullable().optional(),
    launchId: z.number().int().positive().nullable().optional(),
    note: z.string().max(256).nullable().optional(),
    client: AeroLogClientSchema.optional(),
    attemptId: z.string().min(1).max(64).optional(),
    durationMs: z.number().int().min(0).max(600_000).optional(),
  })
  .strict();

/**
 * Success response envelope for the audit log endpoint.
 */
export const AeroLogResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

/**
 * Error response envelope carrying an explanatory message and machine-readable code.
 */
export const AeroErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string(),
    details: z.unknown().optional(),
  })
  .strict();

export type AeroLogEvent = z.infer<typeof AeroLogEventSchema>;
export type AeroLogPhase = z.infer<typeof AeroLogPhaseSchema>;
export type AeroLogClient = z.infer<typeof AeroLogClientSchema>;
export type AeroLogBody = z.infer<typeof AeroLogBodySchema>;
export type AeroLogResponse = z.infer<typeof AeroLogResponseSchema>;
