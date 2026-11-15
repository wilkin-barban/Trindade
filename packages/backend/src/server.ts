import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { corsPolicy } from './cors-policy.js';
import multipart from '@fastify/multipart';
import { loadRuntimeConfig } from './runtime-config.js';
import { openDatabase } from './db/index.js';
import { schemaNoticeForStartup } from './db/schema-notice.js';
import { createAuthenticate } from './modules/auth/auth.middleware.js';
import {
  createSessionStoreCheck,
  purgeDeadSessions,
  sessionStoreExists,
} from './modules/auth/auth.sessions.service.js';
import { cleanupExpiredPhotos } from './modules/reports/reports.lifecycle.service.js';
import { cleanupExpiredSalidaPhotos } from './modules/salida/salida.service.js';
import { assertVaultKeyAtStartup } from './modules/integration/vault.crypto.js';
import { registerApiRoutes } from './routes.js';

const config = loadRuntimeConfig();
// The ERP vault key is a startup gate in production, exactly like JWT_SECRET: a deployment that cannot decrypt the
// stored password must not come up serving 503s to the plant. It is read here, before the database is opened, so a
// missing key never leaves a database handle behind.
const aeroVaultKeyConfigured = assertVaultKeyAtStartup() !== null;
const db = openDatabase(config.databasePath);

// Photo storage directory
const DATA_DIR = join(import.meta.dirname, '../data');
const PHOTOS_DIR = process.env.PHOTOS_DIR || join(DATA_DIR, 'photos');
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || process.env.APP_URL || `http://localhost:${process.env.PORT || '3000'}`;
mkdirSync(PHOTOS_DIR, { recursive: true });

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
  // Only the deployment's own proxy may speak for a client. The list is explicit (loopback plus the private
  // container bridge, overridable with `TRUSTED_PROXY_CIDRS`) and never `true`: with an unrestricted trust any
  // client could send its own `X-Forwarded-For` and choose the address the audit and session rows record.
  trustProxy: config.trustedProxies,
});

// Everything under `/api/` and `/p/` answers with the session or with a token that stands for one, so no
// browser or intermediary may keep a copy: after a logout, or after another operator signs in on the same
// machine, a cached body would hand over the previous session's data. The policy lives here, not in the
// proxy, so it travels with the API in every deployment (compose, standalone, a test rig). It only fills
// the gap: a route that publishes something on purpose -- the public photo links -- sets its own value
// later in the request and that value wins, which is why nothing is overridden here.
server.addHook('onRequest', async (request, reply) => {
  const url = request.raw.url ?? '';
  if (!url.startsWith('/api/') && !url.startsWith('/p/')) return;
  reply.header('Cache-Control', 'no-store');
});

if (!aeroVaultKeyConfigured) {
  // Development only: in production the call above already refused to boot. Saying it once beats a 503 that looks
  // like a broken route when the panel is opened for the first time.
  server.log.warn('AERO_VAULT_KEY is not set: the ERP vault is disabled until it is configured');
}

// Report the schema revision the database was found in, and nothing else: startup never
// migrates, stamps, or refuses. This is a log notice for operators (`db:status` answers
// the same question on demand, and the only sanctioned write path is `db:migrate`). It is
// emitted here because the logger does not exist yet where the database is opened above.
const schemaNotice = schemaNoticeForStartup(db);
if (schemaNotice.level === 'warn') {
  server.log.warn(schemaNotice.payload, schemaNotice.message);
} else {
  server.log.info(schemaNotice.payload, schemaNotice.message);
}

// The session endpoints need one table that startup deliberately never creates. Check for it once
// and tell the operator what to do, instead of letting the first sign-in fail with a driver error
// that names an internal table.
const sessionStoreAvailable = sessionStoreExists(db);
// Re-checked on the paths that need it, so a migration performed while this process runs is
// picked up without a restart.
const sessionStoreCheck = createSessionStoreCheck(db, sessionStoreAvailable);
if (!sessionStoreAvailable) {
  server.log.warn(
    'auth_sessions is missing: sign-in, refresh and logout will answer 503 until an operator runs db:migrate',
  );
}

// Browser access is limited to the approved HTTPS origin; native clients still use authentication.
await server.register(cors, corsPolicy);

// The web session lives in an `HttpOnly` cookie scoped to the auth routes, so the parser has to be in place
// before those routes are registered. The cookie's attributes are decided in `auth.cookies.ts`.
await server.register(cookie);

// Multipart — 5MB file size limit
await server.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

// Decorate fastify instance with the database connection
server.decorate('db', db);

// Decorate with JWT authenticate (must be at top level, not inside a plugin)
server.decorate('authenticate', createAuthenticate(config.jwtSecret));

// Every route the API serves, registered from one place so the contract test enumerates the same
// set this process does.
await registerApiRoutes(server, {
  jwtSecret: config.jwtSecret,
  refreshTokenTtlDays: config.refreshTokenTtlDays,
  sessionStoreAvailable: sessionStoreCheck,
  photosDir: PHOTOS_DIR,
  publicBaseUrl: PUBLIC_APP_URL,
});



// Every cleanup below deletes dead data at startup and leaves the schema untouched. Each keeps its own window
// because photos and sessions are pruned for different reasons, but none of them is a magic number buried in a
// call: the salida window comes from the runtime configuration, and the two older ones stay where they were.
const REPORT_PHOTO_RETENTION_DAYS = 30;
const SESSION_RETENTION_DAYS = 30;

function runPhotoRetentionCleanup() {
  try {
    const result = cleanupExpiredPhotos(db, PHOTOS_DIR, REPORT_PHOTO_RETENTION_DAYS);
    if (result.deleted > 0 || result.errors > 0) {
      server.log.info({ result }, 'Report photo retention cleanup finished');
    }
  } catch (err) {
    server.log.warn({ err }, 'Report photo retention cleanup failed');
  }
}

runPhotoRetentionCleanup();
const photoRetentionInterval = setInterval(runPhotoRetentionCleanup, 24 * 60 * 60 * 1000);
photoRetentionInterval.unref?.();

/**
 * The salida photos, which had no window at all while the reports ones did.
 *
 * Same shape as the reports cleanup above, one registry apart: the file and its row go together, and a movement
 * whose photo was evicted still reads as the exit it recorded.
 */
function runSalidaPhotoRetentionCleanup() {
  try {
    const result = cleanupExpiredSalidaPhotos(db, PHOTOS_DIR, config.salidaPhotoRetentionDays);
    if (result.deleted > 0 || result.errors > 0) {
      server.log.info({ result }, 'Salida photo retention cleanup finished');
    }
  } catch (err) {
    server.log.warn({ err }, 'Salida photo retention cleanup failed');
  }
}

runSalidaPhotoRetentionCleanup();
const salidaPhotoRetentionInterval = setInterval(runSalidaPhotoRetentionCleanup, 24 * 60 * 60 * 1000);
salidaPhotoRetentionInterval.unref?.();

// Same shape as the photo retention cleanup above. Guarded by the session-store check because the
// table only exists once an operator has migrated, and startup must never create it.
function runSessionRetentionCleanup() {
  if (!sessionStoreCheck()) return;
  try {
    const deleted = purgeDeadSessions(db, SESSION_RETENTION_DAYS);
    if (deleted > 0) {
      server.log.info({ deleted }, 'Session retention cleanup finished');
    }
  } catch (err) {
    server.log.warn({ err }, 'Session retention cleanup failed');
  }
}

runSessionRetentionCleanup();
const sessionRetentionInterval = setInterval(runSessionRetentionCleanup, 24 * 60 * 60 * 1000);
sessionRetentionInterval.unref?.();

// Start server
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

try {
  await server.listen({ port, host });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}

export default server;
