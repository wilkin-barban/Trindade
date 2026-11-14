import { z } from 'zod';
import { MAX_SALIDA_ITEMS, SALIDA_BLOCKS } from './salida.catalog.js';

/**
 * The shapes the salida endpoints answer with and accept, which is what the published contract describes.
 *
 * Kept next to the module rather than in the document, because a document that describes a shape nobody
 * declared is a document that drifts. Every response is `.strict()` for the reason `contracts/common.schema.ts`
 * explains: a plain object would strip an extra field silently, and the contract test would then prove nothing.
 */

/** The codes this module answers with, so the screen can branch on the reason instead of the sentence. */
export const SALIDA_ERROR_CODES = {
  INVALID_ITEMS: 'SALIDA_INVALID_ITEMS',
  UNKNOWN_PRODUCT: 'SALIDA_UNKNOWN_PRODUCT',
  INVALID_DATE_FORMAT: 'SALIDA_INVALID_DATE_FORMAT',
  INVALID_ID: 'SALIDA_INVALID_ID',
  NOT_FOUND: 'SALIDA_NOT_FOUND',
  PHOTO_LIMIT: 'SALIDA_PHOTO_LIMIT',
  INVALID_PHOTO: 'SALIDA_INVALID_PHOTO',
  PHOTO_TOO_LARGE: 'SALIDA_PHOTO_TOO_LARGE',
} as const;

export type SalidaErrorCode = (typeof SALIDA_ERROR_CODES)[keyof typeof SALIDA_ERROR_CODES];

export const SalidaBlockSchema = z.enum(SALIDA_BLOCKS);

/** One row of the fixed catalogue, in the order the launch screen renders it. */
export const SalidaProductSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    block: SalidaBlockSchema,
  })
  .strict();

export const SalidaCatalogResponseSchema = z.object({ products: z.array(SalidaProductSchema) }).strict();

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const quantities = z.object({
  code: z.string().regex(/^\d{4}$/, 'code must be four digits'),
  quantity: z.number().int().positive(),
}).strict();

/**
 * The body of `POST /api/salida`: what the operator filled in, and nothing else.
 *
 * The date and the operator are not fields. The date is the plant's today and the operator is the session,
 * so a client cannot backdate a baixa or attribute one to somebody else. Whether a code exists in the
 * catalogue is a rule of this module and not of the shape, so it is answered by the route with its own code;
 * a duplicated code is refused here because two lines of the same product are always a typo, never an intent.
 */
export const CreateSalidaBodySchema = z
  .object({
    items: z.array(quantities).min(1).max(MAX_SALIDA_ITEMS),
  })
  .strict()
  .refine((body) => new Set(body.items.map((item) => item.code)).size === body.items.length, {
    message: 'the same product code cannot appear twice',
    path: ['items'],
  });

/** One item of a stored movement: the catalogue as it was when the operator launched it. */
export const SalidaItemSchema = z
  .object({
    id: z.number().int(),
    product_code: z.string(),
    product_name: z.string(),
    block: SalidaBlockSchema,
    quantity: z.number().int(),
    position: z.number().int(),
  })
  .strict();

/**
 * One photo of a movement.
 *
 * `url` is the authenticated route and `publicUrl` the tokenised one the share sheet hands to somebody
 * without a session; both are projected by the read, never stored.
 */
export const SalidaPhotoSchema = z
  .object({
    id: z.number().int(),
    file_path: z.string(),
    file_size: z.number().int(),
    mime_type: z.string(),
    url: z.string(),
    publicUrl: z.string(),
    created_at: z.string(),
  })
  .strict();

/** The three answers the reconciliation can give, which is the vocabulary the history card renders. */
export const SalidaReconciliationSchema = z
  .object({
    status: z.enum(['reconciled', 'partial', 'pending']),
    ent_lans: z.array(z.number().int()),
    matched_item_ids: z.array(z.number().int()),
  })
  .strict();

export const SalidaMovementSchema = z
  .object({
    id: z.number().int(),
    movement_date: z.string(),
    user_id: z.number().int(),
    username: z.string(),
    display_name: z.string(),
    created_at: z.string(),
    items: z.array(SalidaItemSchema),
    photos: z.array(SalidaPhotoSchema),
    total_units: z.number().int(),
    reconciliation: SalidaReconciliationSchema,
  })
  .strict();

export const SalidaCreateResponseSchema = z.object({ movement: SalidaMovementSchema }).strict();

export const SalidaListResponseSchema = z
  .object({
    date: dateOnly,
    movements: z.array(SalidaMovementSchema),
  })
  .strict();

/** One day of the history: what it moved, and the movements themselves in launch order. */
export const SalidaHistoryDaySchema = z
  .object({
    date: z.string(),
    total_units: z.number().int(),
    movements: z.array(SalidaMovementSchema),
  })
  .strict();

export const SalidaHistoryResponseSchema = z.object({ days: z.array(SalidaHistoryDaySchema) }).strict();

export const SalidaPhotoResponseSchema = z.object({ photo: SalidaPhotoSchema }).strict();

export const SalidaPhotosResponseSchema = z.object({ photos: z.array(SalidaPhotoSchema) }).strict();

export type SalidaProductResponse = z.infer<typeof SalidaProductSchema>;
export type SalidaItemInput = z.infer<typeof quantities>;
export type CreateSalidaBody = z.infer<typeof CreateSalidaBodySchema>;
export type SalidaItem = z.infer<typeof SalidaItemSchema>;
export type SalidaPhoto = z.infer<typeof SalidaPhotoSchema>;
export type SalidaReconciliation = z.infer<typeof SalidaReconciliationSchema>;
export type SalidaMovement = z.infer<typeof SalidaMovementSchema>;
export type SalidaHistoryDay = z.infer<typeof SalidaHistoryDaySchema>;
