import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { apiError } from '../../utils/api-error.js';
import { requireUsername } from '../auth/auth.middleware.js';
import { getSaoPauloDateString } from '../../utils/date.js';
import { SALIDA_PRODUCTS, findSalidaProduct } from './salida.catalog.js';
import { CreateSalidaBodySchema, SALIDA_ERROR_CODES } from './salida.schema.js';
import * as service from './salida.service.js';

/**
 * The salida (baixa) endpoints, mounted at /api/salida.
 *
 * The delivery is a private beta: every route but the public photo belongs to one account, and the authority
 * is the server. `requireUsername` is what makes that true even if a client draws the menu item for somebody
 * else, and the guard is declared per route rather than as a plugin hook so the unauthenticated photo route
 * cannot inherit it by accident.
 *
 * The service owns the rules; this file owns the wire. A refusal carries a semantic code so the page can
 * branch on the reason instead of matching a sentence.
 */
export interface SalidaRouteOptions {
  photosDir: string;
  publicBaseUrl?: string;
}

/** The account the beta belongs to. The literal is deliberate: this is a username, not a role. */
const BETA_USERNAME = 'wilkin';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Content sniffing for the three formats the upload accepts.
 *
 * The declared MIME type comes from the browser and a browser can be told anything, so the bytes are what
 * decide. Duplicated from `reports.routes.ts` on purpose: the two modules share a rule, not a lifecycle, and a
 * shared private helper between them would tie the reports module to a surface it does not own.
 */
function detectImageMime(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** The extension is derived from the detected type, never from the name the client sent. */
function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
}

const dateQuery = z.object({ date: z.string().optional() });

/** A path parameter read as the identifier it claims to be, or `null` when it is not one. */
function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 && String(id) === String(raw).trim() ? id : null;
}

export async function salidaRoutes(fastify: FastifyInstance, options: SalidaRouteOptions) {
  const { photosDir, publicBaseUrl } = options;
  const betaGuard: preHandlerHookHandler[] = [fastify.authenticate, requireUsername(BETA_USERNAME)];

  const invalidId = (reply: FastifyReply) =>
    reply.status(400).send(apiError('Identificador inválido', SALIDA_ERROR_CODES.INVALID_ID));

  // ---- Catalog ----

  /**
   * GET /catalog
   *
   * The fixed 21 products, in the plant's order. Served from here so the screen does not carry a second copy
   * of a list that is invariable: a duplicated catalogue is the one that drifts.
   */
  fastify.get('/catalog', { preHandler: betaGuard }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ products: SALIDA_PRODUCTS });
  });

  // ---- Movements ----

  /**
   * POST /
   *
   * The launch. The movement is persisted before any attempt against the ERP, which is the invariant the
   * whole module exists for: a failed WebService leaves a `Pendente` movement in the history, never a lost
   * load. The date is the plant's today and the operator is the session.
   */
  fastify.post('/', { preHandler: betaGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateSalidaBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(apiError('Dados inválidos: informe de 1 a 21 produtos com quantidade inteira maior que zero',
          SALIDA_ERROR_CODES.INVALID_ITEMS, parsed.error.flatten()));
    }

    const unknown = parsed.data.items.find((item) => findSalidaProduct(item.code) === undefined);
    if (unknown) {
      return reply
        .status(400)
        .send(apiError('Produto fora da lista fixa de salidas', SALIDA_ERROR_CODES.UNKNOWN_PRODUCT,
          { code: unknown.code }));
    }

    const movement = service.createSalidaMovement(fastify.db, {
      items: parsed.data.items,
      userId: request.user!.sub,
      publicBaseUrl,
    });
    return reply.status(201).send({ movement });
  });

  /**
   * GET /?date=YYYY-MM-DD
   *
   * One plant day. Without a date it answers the plant's today rather than the server's, because the server
   * may be anywhere and the day the operator means is the day in São Paulo.
   */
  fastify.get('/', { preHandler: betaGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = dateQuery.safeParse(request.query);
    const raw = parsed.success ? parsed.data.date : undefined;
    if (raw !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return reply
        .status(400)
        .send(apiError('Data inválida: use AAAA-MM-DD', SALIDA_ERROR_CODES.INVALID_DATE_FORMAT));
    }

    const date = raw ?? getSaoPauloDateString();
    return reply.send({ date, movements: service.listSalidaMovements(fastify.db, { date, publicBaseUrl }) });
  });

  /**
   * GET /history
   *
   * The days that carry launches, newest first, each with its movements. Read-only: nothing in this module
   * edits or deletes a movement, so this is the only form the past has here.
   */
  fastify.get('/history', { preHandler: betaGuard }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ days: service.salidaHistory(fastify.db, { publicBaseUrl }) });
  });

  // ---- Photos ----

  /**
   * GET /:id/photos
   *
   * The photos of one movement. The count is what the screen needs to know whether the add button still
   * applies, so the list is the whole answer.
   */
  fastify.get('/:id/photos', { preHandler: betaGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const movementId = parseId((request.params as { id: string }).id);
    if (movementId === null) return invalidId(reply);
    if (!service.salidaMovementExists(fastify.db, movementId)) {
      return reply.status(404).send(apiError('Movimento não encontrado', SALIDA_ERROR_CODES.NOT_FOUND));
    }
    return reply.send({ photos: service.listSalidaPhotos(fastify.db, movementId, publicBaseUrl) });
  });

  /**
   * POST /:id/photos
   *
   * One optional photo of an existing movement, uploaded after the movement exists so a launch is never held
   * back by a camera. The limit is three, and it is answered as 409 because the movement is valid and only the
   * count refuses.
   */
  fastify.post('/:id/photos', { preHandler: betaGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const movementId = parseId((request.params as { id: string }).id);
    if (movementId === null) return invalidId(reply);
    if (!service.salidaMovementExists(fastify.db, movementId)) {
      return reply.status(404).send(apiError('Movimento não encontrado', SALIDA_ERROR_CODES.NOT_FOUND));
    }

    let data: Buffer | undefined;
    let mimeType: string | undefined;
    let fileTooLarge = false;

    try {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send(apiError('Nenhum arquivo enviado', SALIDA_ERROR_CODES.INVALID_PHOTO));
      }
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) chunks.push(chunk);
      fileTooLarge = Boolean((file.file as unknown as { truncated?: boolean }).truncated);
      data = Buffer.concat(chunks);
      mimeType = file.mimetype;
    } catch (error) {
      const failure = error as { code?: string; statusCode?: number };
      if (failure?.code === 'FST_REQ_FILE_TOO_LARGE' || failure?.statusCode === 413) {
        return reply
          .status(413)
          .send(apiError('Arquivo muito grande. O tamanho máximo é 5MB.', SALIDA_ERROR_CODES.PHOTO_TOO_LARGE));
      }
      fastify.log.error(error);
      return reply.status(400).send(apiError('Falha ao processar o arquivo', SALIDA_ERROR_CODES.INVALID_PHOTO));
    }

    if (fileTooLarge || (data && data.length > MAX_PHOTO_SIZE)) {
      return reply
        .status(413)
        .send(apiError('Arquivo muito grande. O tamanho máximo é 5MB.', SALIDA_ERROR_CODES.PHOTO_TOO_LARGE));
    }

    if (!data || data.length === 0) {
      return reply.status(400).send(apiError('Arquivo vazio', SALIDA_ERROR_CODES.INVALID_PHOTO));
    }

    if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      return reply
        .status(415)
        .send(apiError('Formato inválido. Envie apenas imagens JPEG, PNG ou WebP.', SALIDA_ERROR_CODES.INVALID_PHOTO));
    }

    const detected = detectImageMime(data);
    if (!detected || detected !== mimeType) {
      return reply
        .status(415)
        .send(
          apiError(
            'Arquivo inválido. O conteúdo não corresponde a uma imagem JPEG, PNG ou WebP.',
            SALIDA_ERROR_CODES.INVALID_PHOTO,
          ),
        );
    }

    if (service.countSalidaPhotos(fastify.db, movementId) >= service.MAX_SALIDA_PHOTOS) {
      return reply
        .status(409)
        .send(apiError('Limite de 3 fotos por movimento atingido.', SALIDA_ERROR_CODES.PHOTO_LIMIT));
    }

    const storedName = `${randomUUID()}${extensionForMime(detected)}`;
    try {
      await writeFile(join(photosDir, storedName), data);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send(apiError('Falha ao salvar o arquivo', SALIDA_ERROR_CODES.INVALID_PHOTO));
    }

    let photo;
    try {
      photo = service.saveSalidaPhoto(fastify.db, {
        movementId,
        filePath: storedName,
        fileSize: data.length,
        mimeType: detected,
        publicBaseUrl,
      });
    } catch (error) {
      // A file with no row is a file nobody will ever read: it is removed before the failure is reported.
      try {
        const written = join(photosDir, storedName);
        if (existsSync(written)) await unlink(written);
      } catch {
        fastify.log.warn(`Failed to delete orphan salida photo: ${storedName}`);
      }
      throw error;
    }

    return reply.status(201).send({ photo });
  });

  /**
   * GET /photos/:photoId
   *
   * The bytes of one photo to a signed-in client, which is the same credential the movement card already has.
   */
  fastify.get('/photos/:photoId', { preHandler: betaGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const photoId = parseId((request.params as { photoId: string }).photoId);
    if (photoId === null) return invalidId(reply);

    const photo = service.getSalidaPhotoById(fastify.db, photoId);
    if (!photo) {
      return reply.status(404).send(apiError('Foto não encontrada', SALIDA_ERROR_CODES.NOT_FOUND));
    }

    const filePath = join(photosDir, photo.file_path);
    if (!existsSync(filePath)) {
      return reply.status(404).send(apiError('Arquivo da foto não encontrado', SALIDA_ERROR_CODES.NOT_FOUND));
    }

    try {
      const bytes = await readFile(filePath);
      return reply
        .header('Content-Type', photo.mime_type)
        .header('Cache-Control', 'private, no-store')
        .send(bytes);
    } catch {
      return reply.status(500).send(apiError('Falha ao ler o arquivo', SALIDA_ERROR_CODES.INVALID_PHOTO));
    }
  });

  /**
   * DELETE /photos/:photoId
   *
   * Removes the row first and the file after, best effort: a surviving file with no row is garbage, while a
   * row whose file is gone is a broken card. The movement itself is never touched.
   */
  fastify.delete('/photos/:photoId', { preHandler: betaGuard }, async (request: FastifyRequest, reply: FastifyReply) => {
    const photoId = parseId((request.params as { photoId: string }).photoId);
    if (photoId === null) return invalidId(reply);

    const deleted = service.deleteSalidaPhoto(fastify.db, photoId);
    if (!deleted) {
      return reply.status(404).send(apiError('Foto não encontrada', SALIDA_ERROR_CODES.NOT_FOUND));
    }

    try {
      const filePath = join(photosDir, deleted.file_path);
      if (existsSync(filePath)) await unlink(filePath);
    } catch {
      fastify.log.warn(`Failed to delete salida photo file: ${deleted.file_path}`);
    }

    return reply.send({ success: true });
  });

  /**
   * GET /photos/public/:token
   *
   * The one route without a session, and the token is the credential: it is what a share sheet hands to
   * somebody who has none. Nothing is listed here and the token is never logged.
   */
  fastify.get('/photos/public/:token', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    if (!token || token.length < 16) {
      return reply.status(404).send(apiError('Foto não encontrada', SALIDA_ERROR_CODES.NOT_FOUND));
    }

    const photo = service.getSalidaPhotoByPublicToken(fastify.db, token);
    if (!photo) {
      return reply.status(404).send(apiError('Foto não encontrada', SALIDA_ERROR_CODES.NOT_FOUND));
    }

    const filePath = join(photosDir, photo.file_path);
    if (!existsSync(filePath)) {
      return reply.status(404).send(apiError('Arquivo da foto não encontrado', SALIDA_ERROR_CODES.NOT_FOUND));
    }

    try {
      const bytes = await readFile(filePath);
      return reply
        .header('Content-Type', photo.mime_type)
        .header('Cache-Control', 'private, no-store')
        .send(bytes);
    } catch {
      return reply.status(500).send(apiError('Falha ao ler o arquivo', SALIDA_ERROR_CODES.INVALID_PHOTO));
    }
  });
}
