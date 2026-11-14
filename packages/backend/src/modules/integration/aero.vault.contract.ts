import { z } from 'zod';

/**
 * The published contract of the ERP vault and of the bridge tickets.
 *
 * These schemas describe the wire, and nothing else: the runtime validation lives with each service so a
 * refusal can carry a semantic code. They are declared apart from the routes because the OpenAPI artifact is
 * generated from them and CI compares that artifact byte for byte; keeping them in one named module makes a
 * change to the published surface visible in a single diff.
 */

export const AeroVaultSettingsResponseSchema = z
  .object({
    configured: z.boolean(),
    wsUrl: z.string().nullable(),
    username: z.string().nullable(),
    hasPassword: z.boolean(),
    updatedAt: z.string().nullable(),
  })
  .strict();

export const AeroVaultSettingsRequestSchema = z
  .object({
    wsUrl: z.string().min(1).max(2048),
    username: z.string().min(1).max(64),
    password: z.string().max(256).optional(),
  })
  .strict();

/**
 * The actions the shortcut can be armed for, as the published contract names them.
 *
 * `saida` joined the four that existed: it is the baixa of insumos, embalagens and bobinas, and it is a batch
 * (1..8 payloads) because one movement can carry several products. Every existing name keeps its meaning.
 */
export const AeroBridgeActionSchema = z.enum(['entrada', 'entrada_lote', 'saida', 'movimentos', 'test']);

export const AeroBridgeTicketRequestSchema = z
  .object({
    action: AeroBridgeActionSchema,
    payloads: z.array(z.record(z.unknown())).min(1).max(8),
    callbackPath: z.string().min(1).max(2048).optional(),
  })
  .strict();

export const AeroBridgeTicketResponseSchema = z
  .object({
    ticket: z.string().min(1),
    ticketUrl: z.string().min(1),
    expiresAt: z.string().min(1),
  })
  .strict();

/**
 * What the iPhone shortcut receives. `body` and `bodies` are JSON **text**, exactly what the shortcut sends as
 * the request body, so the actions that already exist do not change.
 */
export const AeroBridgeEnvelopeSchema = z
  .object({
    url: z.string().min(1),
    method: z.literal('POST'),
    headers: z.record(z.string()),
    body: z.string(),
    bodies: z.array(z.string()).optional(),
    callback: z.string().min(1),
  })
  .strict();

export type AeroVaultSettingsResponse = z.infer<typeof AeroVaultSettingsResponseSchema>;
export type AeroVaultSettingsRequest = z.infer<typeof AeroVaultSettingsRequestSchema>;
export type AeroBridgeActionContract = z.infer<typeof AeroBridgeActionSchema>;
export type AeroBridgeTicketRequest = z.infer<typeof AeroBridgeTicketRequestSchema>;
export type AeroBridgeTicketResponse = z.infer<typeof AeroBridgeTicketResponseSchema>;
export type AeroBridgeEnvelopeContract = z.infer<typeof AeroBridgeEnvelopeSchema>;
