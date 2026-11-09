import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { apiError } from '../../utils/api-error.js';
import { requireRole, requireUsername } from '../auth/auth.middleware.js';
import { optionalVaultKey } from './vault.crypto.js';
import {
  AERO_BRIDGE_ERROR_CODES,
  AERO_TICKET_ERROR_CODES,
  AERO_VAULT_ERROR_CODES,
  AERO_VAULT_OWNER_USERNAME,
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
  redeemBridgeTicket,
  resolveBridgeCallbackUrl,
  resolvePublicAppUrl,
  type RedeemBridgeTicketResult,
} from './aero.tickets.service.js';

/**
 * The ERP vault and the one-use bridge tickets, mounted inside the plugin registered at /api/integration/aero.
 *
 * Three of the five endpoints are the vault owner's alone: the server, not the panel, decides who may store or
 * read the configuration. Redemption is the exception and it is unauthenticated by design — the ticket is the
 * credential, because the caller is the iPhone shortcut, which has no session. That is also why nothing here
 * audits, logs or echoes a token, a password, an `Authorization` header or a request body: the audit log is
 * readable, and a credential written to a readable place is a leaked credential.
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

const INVALID_ACTION_MESSAGE =
  'La acción del Atajo no es válida: use entrada, entrada_lote, movimentos o test.';

const INVALID_PAYLOADS_MESSAGE =
  'Los datos del Atajo no son válidos para esa acción: entrada, movimentos y test llevan exactamente un objeto, ' +
  'entrada_lote lleva entre 2 y 8, y el total no puede superar los 32 KB.';

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
   * The owner guard, in this order: prove the token, prove the account, prove the role.
   *
   * `requireUsername` runs before `requireRole` on purpose: an administrator who is not the owner and a worker
   * who is neither both get the same 403, so the answer never describes which half was missing.
   */
  const ownerGuard: preHandlerHookHandler[] = [
    fastify.authenticate,
    requireUsername(AERO_VAULT_OWNER_USERNAME),
    requireRole('Administrador'),
  ];

  /**
   * GET /settings
   *
   * What the panel needs to render: whether the vault is configured, the URL and user it holds, and whether a
   * password is stored. The secret itself, its ciphertext, its IV and its tag never leave the server.
   */
  fastify.get(
    '/settings',
    { preHandler: ownerGuard },
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
    { preHandler: ownerGuard },
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
   * Clears the vault and this owner's tickets. Deliberately not gated on the vault key: cleaning up after a lost
   * key must stay possible, and removing a secret never needs to read one. Other owners' tickets are untouched.
   */
  fastify.delete(
    '/settings',
    { preHandler: ownerGuard },
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
    { preHandler: ownerGuard },
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
}
