import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { apiError } from '../../utils/api-error.js';
import { requireRole } from '../auth/auth.middleware.js';
import { optionalVaultKey } from './vault.crypto.js';
import {
  AERO_BRIDGE_ERROR_CODES,
  AERO_BRIDGE_RESULT_MAX_BYTES,
  AERO_TICKET_ERROR_CODES,
  AERO_VAULT_ERROR_CODES,
  AeroBridgeTicketResultBodySchema,
  isBridgeAction,
  parseAeroBridgeTicketRequest,
} from './aero.vault.schema.js';
import {
  aeroVaultSettingsRow,
  deleteAeroVaultSettings,
  readAeroVaultSettings,
  saveAeroVaultSettings,
} from './aero.settings.service.js';
import {
  BRIDGE_TICKET_HEADER,
  issueBridgeTicket,
  readLastBridgeTicketResult,
  redeemBridgeTicket,
  resolveBridgeCallbackUrl,
  resolvePublicAppUrl,
  storeBridgeTicketResult,
  type RedeemBridgeTicketResult,
} from './aero.tickets.service.js';

/**
 * The ERP vault and the one-use bridge tickets, mounted inside the plugin registered at /api/integration/aero.
 *
 * The vault is per operator: each signed-in account reads, writes and clears only the row keyed by its own
 * `user_id`, so a worker can keep the credentials of the phone in his hand without seeing anyone else's. The
 * address still belongs to the plant, but the server cannot know which field the UI locked; the panel enforces
 * that split, while the API guarantees the isolation that matters: one account never reaches another's secret.
 * Redemption is the exception and it is unauthenticated by design — the ticket is the credential, because the
 * caller is the iPhone shortcut, which has no session. That is also why nothing here audits, logs or echoes a
 * token, a password, an `Authorization` header or a request body: the audit log is readable, and a credential
 * written to a readable place is a leaked credential.
 */

const VAULT_NOT_CONFIGURED_MESSAGE =
  'El cofre del ERP no está configurado en el servidor: falta AERO_VAULT_KEY o no es válida. ' +
  'Genere una con `openssl rand -base64 32`, cárguela en el entorno de la API y vuelva a intentar.';

const VAULT_UNREADABLE_MESSAGE =
  'La contraseña guardada del ERP no se puede descifrar con la clave actual del servidor. ' +
  'Revise AERO_VAULT_KEY y, si cambió, vuelva a guardar la contraseña desde el panel.';

const VAULT_EMPTY_MESSAGE =
  'Todavía no hay contraseña del ERP guardada en el servidor. ' +
  'Guárdela una vez desde el panel de integración antes de generar el ticket.';

const INVALID_SETTINGS_MESSAGE =
  'La configuración del ERP no es válida: la URL debe empezar con http:// o https:// y tener host, ' +
  'y el usuario no puede quedar vacío.';

const PASSWORD_REQUIRED_MESSAGE =
  'Falta la contraseña del ERP: es la primera vez que se guarda esta configuración y no hay una anterior. ' +
  'Escríbala para guardarla cifrada en el servidor.';

/**
 * The account the baixa beta belongs to.
 *
 * A literal on purpose, and on the server: the guard in front of these routes proves a role, and the role is not
 * what the beta narrows. The same literal the salida module guards its routes with.
 */
const INVALID_ACTION_MESSAGE =
  'La acción del Atajo no es válida: use entrada, entrada_lote, saida, movimentos o test.';

const INVALID_PAYLOADS_MESSAGE =
  'Los datos del Atajo no son válidos para esa acción: entrada, movimentos y test llevan exactamente un objeto, ' +
  'entrada_lote lleva entre 2 y 8, saida lleva entre 1 y 8, y el total no puede superar los 32 KB.';

/**
 * The sentence a `saida` ticket answers to anybody who is not the beta user.
 *
 * It says what it is and not what to do about it, because there is nothing to do: the baixa module is a private
 * beta by decision, and the rest of the bridge (including `entrada`) keeps working for the same account.
 */
const INVALID_CALLBACK_MESSAGE =
  'El destino de vuelta del Atajo no es válido: tiene que ser una ruta de esta misma aplicación, ' +
  'sin cambiar de dominio.';

const TICKET_MISSING_MESSAGE =
  'Falta el ticket de un solo uso: el Atajo tiene que enviarlo en la cabecera X-Trindade-Ticket.';

const TICKET_NOT_FOUND_MESSAGE =
  'Este ticket no existe. Vuelva a la página de lanzamiento y genere uno nuevo.';

const TICKET_UNUSABLE_MESSAGE =
  'Este ticket ya se usó o venció (dura 120 segundos). Vuelva a la página de lanzamiento y genere uno nuevo.';

/**
 * The key this request may use, or `null` when the deployment has none or it is malformed.
 *
 * Both cases answer the same code: telling the operator apart "not set" from "set but wrong" would describe the
 * deployment's secrets to whoever can reach the endpoint, and the fix is the same in both cases.
 */
function vaultKeyForRequest(): Buffer | null {
  try {
    return optionalVaultKey();
  } catch {
    return null;
  }
}

function vaultNotConfigured(reply: FastifyReply) {
  return reply
    .status(503)
    .send(apiError(VAULT_NOT_CONFIGURED_MESSAGE, AERO_VAULT_ERROR_CODES.NOT_CONFIGURED));
}

/** The token from the redemption header. Fastify lowercases header names, so this lookup is case-insensitive. */
function bridgeTicketFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers[BRIDGE_TICKET_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const token = typeof value === 'string' ? value.trim() : '';
  return token === '' ? null : token;
}

export async function aeroVaultRoutes(fastify: FastifyInstance) {
  /**
   * Every operator may use the vault of their own phone.
   *
   * The guard proves the token and the role; the identity itself comes from `request.user.sub`, never from the
   * body. `Trabalhador` is included on purpose: Android already lets a worker keep credentials on the device,
   * and the web cannot ask a worker to hand their ERP password to the administrator's account.
   */
  const operatorGuard: preHandlerHookHandler[] = [
    fastify.authenticate,
    requireRole('Administrador', 'Trabalhador'),
  ];

  /**
   * GET /settings
   *
   * What the panel needs to render: whether the vault is configured, the URL and user it holds, and whether a
   * password is stored. The secret itself, its ciphertext, its IV and its tag never leave the server.
   */
  fastify.get(
    '/settings',
    { preHandler: operatorGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (vaultKeyForRequest() === null) return vaultNotConfigured(reply);
      return reply.send(readAeroVaultSettings(fastify.db, request.user!.sub));
    },
  );

  /**
   * PUT /settings
   *
   * Stores the URL and the ERP user, and the password when one arrives. An empty or absent password keeps the
   * stored ciphertext, so a typo in the URL never costs the operator the secret.
   */
  fastify.put(
    '/settings',
    { preHandler: operatorGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const key = vaultKeyForRequest();
      if (key === null) return vaultNotConfigured(reply);

      const saved = saveAeroVaultSettings(fastify.db, request.user!.sub, request.body, key);
      if (!saved.ok) {
        const message =
          saved.code === AERO_VAULT_ERROR_CODES.PASSWORD_REQUIRED
            ? PASSWORD_REQUIRED_MESSAGE
            : INVALID_SETTINGS_MESSAGE;
        return reply.status(400).send(apiError(message, saved.code));
      }
      return reply.send(saved.settings);
    },
  );

  /**
   * DELETE /settings
   *
   * Clears this operator's vault and pending tickets. Deliberately not gated on the vault key: cleaning up after
   * a lost key must stay possible, and removing a secret never needs to read one. Other operators' rows and
   * tickets are untouched.
   */
  fastify.delete(
    '/settings',
    { preHandler: operatorGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      deleteAeroVaultSettings(fastify.db, request.user!.sub);
      return reply.status(204).send();
    },
  );

  /**
   * POST /bridge-tickets
   *
   * Mints the one-use credential the shortcut redeems. The request is validated before any secret is touched, and
   * the ticket is refused while the vault has no password: a ticket that would redeem into an envelope with no
   * credentials is a failure the operator should read now, not after walking to the plant.
   */
  fastify.post(
    '/bridge-tickets',
    { preHandler: operatorGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = parseAeroBridgeTicketRequest(request.body);
      if (!parsed.ok) {
        const messages: Record<string, string> = {
          [AERO_BRIDGE_ERROR_CODES.INVALID_ACTION]: INVALID_ACTION_MESSAGE,
          [AERO_BRIDGE_ERROR_CODES.INVALID_PAYLOADS]: INVALID_PAYLOADS_MESSAGE,
          [AERO_BRIDGE_ERROR_CODES.INVALID_CALLBACK]: INVALID_CALLBACK_MESSAGE,
        };
        return reply.status(400).send(apiError(messages[parsed.code] ?? INVALID_PAYLOADS_MESSAGE, parsed.code));
      }

      // Any authenticated account may arm a `saida` trip; the beta that narrowed it is over, and the shape of the
      // request was already checked above, before any secret is read or a row is written.
      if (vaultKeyForRequest() === null) return vaultNotConfigured(reply);

      const userId = request.user!.sub;
      if (aeroVaultSettingsRow(fastify.db, userId) === null) {
        return reply.status(503).send(apiError(VAULT_EMPTY_MESSAGE, AERO_VAULT_ERROR_CODES.NOT_CONFIGURED));
      }

      const publicAppUrl = resolvePublicAppUrl();
      const callbackUrl = resolveBridgeCallbackUrl(
        parsed.request.action,
        parsed.request.callbackPath,
        publicAppUrl,
      );
      if (callbackUrl === null) {
        return reply
          .status(400)
          .send(apiError(INVALID_CALLBACK_MESSAGE, AERO_BRIDGE_ERROR_CODES.INVALID_CALLBACK));
      }

      const issued = issueBridgeTicket(fastify.db, {
        userId,
        action: parsed.request.action,
        payloads: parsed.request.payloads,
        callbackUrl,
        publicAppUrl,
      });
      return reply.status(201).send(issued);
    },
  );

  /**
   * POST /bridge-tickets/redeem
   *
   * Unauthenticated by design: the shortcut holds no session, so the ticket is the credential. It arrives in a
   * header, never in the URL, and it is spent inside the same transaction that answers. Nothing is cached, and
   * the answer never says whether a refusal was a replay or an expired token.
   */
  fastify.post('/bridge-tickets/redeem', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');

    const token = bridgeTicketFromHeaders(request.headers);
    if (token === null) {
      return reply.status(401).send(apiError(TICKET_MISSING_MESSAGE, AERO_TICKET_ERROR_CODES.MISSING));
    }

    const key = vaultKeyForRequest();
    if (key === null) return vaultNotConfigured(reply);

    let redeemed: RedeemBridgeTicketResult;
    try {
      redeemed = redeemBridgeTicket(fastify.db, token, key);
    } catch {
      // A wrong key or a tampered row threw inside the transaction, which rolled the claim back: the ticket is
      // still usable once the deployment is fixed. The error is swallowed on purpose -- it describes the vault.
      return reply
        .status(503)
        .send(apiError(VAULT_UNREADABLE_MESSAGE, AERO_VAULT_ERROR_CODES.NOT_CONFIGURED));
    }

    if (!redeemed.ok) {
      return redeemed.code === 'AERO_TICKET_NOT_FOUND'
        ? reply.status(404).send(apiError(TICKET_NOT_FOUND_MESSAGE, AERO_TICKET_ERROR_CODES.NOT_FOUND))
        : reply.status(410).send(apiError(TICKET_UNUSABLE_MESSAGE, AERO_TICKET_ERROR_CODES.UNUSABLE));
    }

    return reply.send(redeemed.envelope);
  });

  /**
   * POST /bridge-tickets/result
   *
   * Unauthenticated by design: the ticket is the credential, presented in the X-Trindade-Ticket header.
   * Finds the ticket by token hash even if already consumed, stores JSON.stringify(data) in result and
   * datetime('now') in result_at. Correlated movements retain their first result; legacy actions may overwrite.
   * Maximum body size 2 MB.
   */
  fastify.post(
    '/bridge-tickets/result',
    {
      bodyLimit: 3 * 1024 * 1024,
      errorHandler: (error, _request, reply) => {
        if (error.statusCode === 413 || (error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
          return reply
            .status(413)
            .send(apiError('El resultado supera el límite de 2 MB.', AERO_TICKET_ERROR_CODES.TOO_LARGE));
        }
        throw error;
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');

      const token = bridgeTicketFromHeaders(request.headers);
      if (token === null) {
        return reply.status(401).send(apiError(TICKET_MISSING_MESSAGE, AERO_TICKET_ERROR_CODES.MISSING));
      }

      const parsed = AeroBridgeTicketResultBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send(apiError('El cuerpo debe incluir el campo data.', AERO_BRIDGE_ERROR_CODES.INVALID_PAYLOADS));
      }

      let serialized: string;
      try {
        serialized = JSON.stringify(parsed.data.data);
      } catch {
        return reply
          .status(400)
          .send(apiError('El cuerpo no se puede serializar a JSON.', AERO_BRIDGE_ERROR_CODES.INVALID_PAYLOADS));
      }

      if (Buffer.byteLength(serialized, 'utf8') > AERO_BRIDGE_RESULT_MAX_BYTES) {
        return reply
          .status(413)
          .send(apiError('El resultado supera el límite de 2 MB.', AERO_TICKET_ERROR_CODES.TOO_LARGE));
      }

      const stored = storeBridgeTicketResult(fastify.db, token, parsed.data.data);
      if (!stored.ok) {
        if (stored.code === 'AERO_TICKET_RESULT_CONFLICT') {
          return reply.status(409).send(apiError('El resultado del intento ya fue registrado.', AERO_TICKET_ERROR_CODES.RESULT_CONFLICT));
        }
        return reply.status(404).send(apiError(TICKET_NOT_FOUND_MESSAGE, AERO_TICKET_ERROR_CODES.NOT_FOUND));
      }

      return reply.send({ ok: true });
    },
  );

  /**
   * GET /bridge-tickets/last-result?action=<AeroBridgeAction>
   *
   * Authenticated per operator: answers the newest result for the requested action recorded within the
   * last 10 minutes for tickets owned by request.user.sub. Never returns another user's result.
   */
  fastify.get(
    '/bridge-tickets/last-result',
    { preHandler: operatorGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');

      const query = request.query as { action?: unknown; attemptId?: unknown };
      const rawAction = typeof query?.action === 'string' ? query.action.trim() : '';
      if (!isBridgeAction(rawAction)) {
        return reply.status(400).send(apiError(INVALID_ACTION_MESSAGE, AERO_BRIDGE_ERROR_CODES.INVALID_ACTION));
      }

      if (query.attemptId !== undefined &&
          (rawAction !== 'movimentos' || typeof query.attemptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(query.attemptId))) {
        return reply.status(400).send(apiError('El identificador del intento no es válido.', AERO_BRIDGE_ERROR_CODES.INVALID_PAYLOADS));
      }
      const result = readLastBridgeTicketResult(fastify.db, request.user!.sub, rawAction, query.attemptId as string | undefined);
      if (!result.ok) {
        return reply
          .status(404)
          .send(
            apiError(
              'No se encontró ningún resultado para esta acción dentro de los últimos 10 minutos.',
              AERO_TICKET_ERROR_CODES.RESULT_NOT_FOUND,
            ),
          );
      }

      return reply.send({ data: result.data });
    },
  );
}
