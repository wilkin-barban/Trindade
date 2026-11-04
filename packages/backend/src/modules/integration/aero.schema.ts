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
 * The canonical names are `launch_sync`, `read_history` and `test_connection`; both the web and the
 * current Android client write them. The older `dispatch`, `sync` and `test` aliases remain accepted
 * only so an APK already in the field keeps writing. New clients must use the canonical spelling.
 */
export const AeroLogEventSchema = z.enum([
  'test_connection',
  'launch_sync',
  'read_history',
  'dispatch',
  'sync',
  'test',
  'import',
  'queue_rejected',
]);

/**
 * Operation phase: `requested` before sending and `result` upon server response or network outcome.
 * `response` is retained only for older clients; the Android client now writes `result`.
 */
export const AeroLogPhaseSchema = z.enum(['requested', 'result', 'response']);

/**
 * The app that authored the line. `bridge` and `shortcut` are transports the web uses, not other
 * apps, but they are kept as identities because that is what the log already knows how to say.
 */
export const AeroLogClientSchema = z.enum(['android', 'web', 'shortcut', 'bridge']);

/**
 * The identifier that pairs the lines of one attempt.
 *
 * Declared once because two transports carry it -- the audit body and the `X-Trindade-Attempt` header on
 * the routes that write their own refusal line -- and a second copy would drift.
 */
export const AeroLogAttemptSchema = z.string().min(1).max(64);

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
    attemptId: AeroLogAttemptSchema.optional(),
    durationMs: z.number().int().min(0).max(600_000).optional(),
    appVersion: z.string().min(1).max(32).optional(),
    buildNumber: z.number().int().min(0).max(2_000_000_000).optional(),
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
