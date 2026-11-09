# Cofre ERP en el backend y ticket de un solo uso para el Atajo

Web + API · revisión de esquema **10** · sin cambios de comportamiento ni de UI en Android, sin APK nuevo.
Cierra el defecto de la contraseña del ERP en `sessionStorage` cuando iOS devuelve el callback en otra pestaña.

## 1. Contexto y evidencia del defecto

La contraseña del ERP vive hoy en `sessionStorage` bajo `AERO_SESSION_PASSWORD_KEY = 'trindade.aero.session.v1'`
(`packages/frontend/src/lib/aero-integration.ts:129`) y se carga dentro de `AeroSettings`
(`aero-integration.ts:219`, `password: aeroSessionPassword(session)`). La URL y el usuario viven en
`localStorage`.

El archivo reconoce el límite en su propio comentario (`aero-integration.ts:121-127`): «`sessionStorage` is per
tab and per session: it survives reloads and the return trip in the same tab, dies when the tab closes» y «A tab
opened without an opener starts empty, so the landing page can still ask for the secret». El mismo archivo
justifica el diseño actual por una razón que esta entrega revierte: «Keeping it out of `localStorage`, cookies and
the server is the most this side can do while the ERP stays inside the plant's LAN -- a server-side vault needs
the on-prem bridge, which does not exist yet» (`aero-integration.ts:114-120`).

El repo ya resolvió el mismo problema para otra pieza. `packages/frontend/src/lib/aero-queue.ts:9-11` dice: «It
lives in `localStorage` rather than `sessionStorage` on purpose. iOS may hand the returning URL to a fresh tab,
and a queue that vanished on the way back would silently drop the second product of the day». La cola quedó en el
almacenamiento correcto; la senha quedó en el equivocado.

Escenario exacto del defecto: el Atajo iOS devuelve el callback y iOS lo abre en una pestaña nueva. La consulta que
ya salió funciona porque el sobre se armó antes de salir y llevaba `Authorization: Basic`. Lo que falla después es
la lectura automática de `/movimentoitem` y cualquier envío o consulta desde esa pestaña: `sessionStorage` no se
hereda entre pestañas, la senha no está y la UI vuelve a pedirla. El sobre no es el problema; el almacenamiento sí.

## 2. Decisión B y modelo de amenaza

Se elige el diseño B: cofre cifrado en el backend y ticket de un solo uso que el Atajo canjea por el sobre del
ERP. Se descarta mover la senha a `localStorage` (el usuario lo prohíbe y repite el defecto con más exposición) y
se descarta dejarla en memoria del módulo (muere en cada regreso del Atajo).

Qué se protege:

- La senha del ERP frente a scripts de la página, backups del perfil del navegador, otra pestaña, otro dispositivo
  del mismo owner y cualquier lectura del almacenamiento local o de la sesión.
- La senha frente a la base de datos en claro: en SQLite queda solo ciphertext, IV y tag; sin `AERO_VAULT_KEY` no
  se descifra.
- El token del ticket frente a la base de datos: se guarda solo su SHA-256, así que leer la tabla no permite
  canjearlo.

Qué sigue expuesto, y por qué se acepta:

- El ticket en claro viaja dentro del diccionario que la página entrega al Atajo y puede quedar en el historial de
  Shortcuts. Vive 120 s, sirve una sola vez y no da la senha: entrega un sobre ya armado para una acción concreta.
- Quien tenga acceso al proceso API y a `AERO_VAULT_KEY` puede descifrar el cofre. Es el mismo nivel de acceso que
  ya permite leer la base y el entorno; el cofre no pretende proteger contra el propio servidor.
- El `Authorization: Basic` sigue viajando al ERP porque el ERP no ofrece otro mecanismo. El Atajo sigue siendo el
  único proceso que habla con la LAN de la fábrica: la web no gana alcance de red, solo deja de guardar el secreto.
- La web no puede fabricar un `Authorization` ni ver la senha: emitir un ticket exige JWT de `wilkin` con rol
  `Administrador`, y ningún endpoint devuelve la senha ni el ciphertext.

## 3. Arquitectura, datos, contratos, migración y flujo del Atajo

### 3.1 Componentes

Backend (`packages/backend/src/modules/integration/`):

- `vault.crypto.ts` — AES-256-GCM: `encryptSecret`, `decryptSecret`, `resolveVaultKey`. IV de 12 bytes, tag de 16,
  `keyVersion = 1`.
- `aero.settings.service.ts` — repositorio del cofre sobre `aero_integration_settings`.
- `aero.tickets.service.ts` — emisión, canje transaccional y limpieza sobre `aero_bridge_tickets`.
- `aero.vault.schema.ts` — Zod de settings, ticket y redeem.
- Rutas nuevas dentro del plugin ya registrado en `/api/integration/aero`: `/settings` (GET/PUT/DELETE),
  `/bridge-tickets` (POST) y `/bridge-tickets/redeem` (POST, sin JWT).

Frontend:

- `packages/frontend/src/lib/aero-vault.ts` — cliente del cofre y de tickets.
- `packages/frontend/src/lib/aero-integration.ts` — `AeroSettings` sin `password`, con `hasPassword`; purga legacy.
- `packages/frontend/src/pages/massas/AeroIntegrationPanel.tsx` — estado del cofre y guardado.
- `packages/frontend/src/pages/MassasLaunchPage.tsx` — tickets para lanzamiento, lote, movimientos y lectura.
- `packages/frontend/src/pages/massas/AeroShortcutDialog.tsx` — receta nueva `{ticket, ticketUrl}`.

Estatuto del ticket frente a la autenticación: `redeem` es unauthenticated **por diseño**. La credencial es el
token bearer de un solo uso; exigir además JWT rompería el caso que esta entrega existe para arreglar (el Atajo no
tiene sesión). No se registra detrás del guard del guest y no se le agrega `authenticate`.

### 3.2 Modelo de datos (revisión 10, aditiva)

```sql
CREATE TABLE aero_integration_settings (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  ws_url              TEXT NOT NULL,
  erp_username        TEXT NOT NULL,
  password_ciphertext TEXT NOT NULL,
  password_iv         TEXT NOT NULL,
  password_tag        TEXT NOT NULL,
  key_version         INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE aero_bridge_tickets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('entrada','entrada_lote','movimentos','test')),
  endpoint     TEXT NOT NULL,
  body         TEXT NOT NULL,
  bodies       TEXT,
  callback_url TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  used_at      TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_aero_bridge_tickets_user ON aero_bridge_tickets(user_id);
CREATE INDEX idx_aero_bridge_tickets_expires ON aero_bridge_tickets(expires_at);
```

`body` y `bodies` guardan JSON ya serializado por el servidor: el Atajo no interpreta ni rearma payloads.
`expires_at` y `used_at` son ISO UTC; en ese formato la comparación por texto ordena igual que el tiempo.

El sobre que devuelve el canje es **byte a byte el que la página armaba hoy**: `body` es un string con el JSON
del primer payload y `bodies` un array de strings con el JSON de cada uno, porque las acciones 5–23 del Atajo
existentes usan ese texto tal cual como cuerpo del POST (`aero-integration.ts:1018-1043`,
`buildAeroBridgeEnvelope` devuelve `body: JSON.stringify(payload)`). Si el servidor devolviera objetos en lugar de
texto, el Atajo tendría que cambiar y el delta dejaría de ser solo la entrada. `headers` sigue siendo el mismo
objeto `{ Authorization, 'Content-Type': 'application/json', Accept: 'application/json' }`.

### 3.3 Contratos API

| Método y ruta | Guard | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| `GET /api/integration/aero/settings` | `authenticate` + `requireUsername('wilkin')` + `requireRole('Administrador')` | — | `200 { configured, wsUrl, username, hasPassword, updatedAt }` |
| `PUT /api/integration/aero/settings` | ídem | `{ wsUrl, username, password? }` | `200` con la misma forma que el GET |
| `DELETE /api/integration/aero/settings` | ídem | — | `204`, borra settings y tickets pendientes del owner |
| `POST /api/integration/aero/bridge-tickets` | ídem | `{ action, payloads, callbackPath? }` | `201 { ticket, ticketUrl, expiresAt }` |
| `POST /api/integration/aero/bridge-tickets/redeem` | ticket bearer (`X-Trindade-Ticket`) | — | `200 { url, method, headers, body, bodies?, callback }` |

Reglas de validación:

- `wsUrl`: `http://` o `https://`, con host, máximo 2048 caracteres. `username`: no vacío, máximo 64.
- `password` no vacía reemplaza; vacía o ausente conserva la existente; sin previa y sin nueva → `400`
  `AERO_VAULT_PASSWORD_REQUIRED`.
- `action` ∈ `{entrada, entrada_lote, movimentos, test}`. `payloads` son objetos JSON: 1 para `entrada`,
  `movimentos` y `test` (`test` acepta `[{}]`), 2..8 para `entrada_lote`. Total serializado acotado.
- Mapeo de endpoint en el servidor: `entrada`/`entrada_lote` → `entradasitem`; `movimentos` →
  `movimentoitem?_method=PATCH`; `test` → `usuarios`.
- `callbackPath` se valida contra el origen de `PUBLIC_APP_URL` (`server.ts:25`); si no comparte origen, `400`.
- Ticket: 32 bytes aleatorios base64url, SHA-256 en la base, TTL 120 s, un solo uso, máximo 8 pendientes por owner
  con limpieza de expirados y usados al emitir.
- `redeem`: header faltante → `401`; hash desconocido → `404`; usado o expirado → `410` con el mismo cuerpo para
  ambos, de modo que la respuesta no diga cuál de los tres fue. `Cache-Control: no-store`.
- Códigos: `AERO_VAULT_NOT_CONFIGURED` (503), `AERO_VAULT_INVALID_SETTINGS` (400),
  `AERO_VAULT_PASSWORD_REQUIRED` (400), `AERO_BRIDGE_INVALID_ACTION` (400), `AERO_BRIDGE_INVALID_PAYLOADS` (400),
  `AERO_BRIDGE_INVALID_CALLBACK` (400), `AERO_TICKET_MISSING` (401), `AERO_TICKET_NOT_FOUND` (404),
  `AERO_TICKET_UNUSABLE` (410).

### 3.4 Migración

- `SCHEMA_VERSION = 10`; `REVISION_TEN_TABLES = ['aero_bridge_tickets', 'aero_integration_settings']`;
  `SCHEMA_TABLES` los suma y pasa de 18 a 20.
- `requiredTablesFor`: se agrega la rama `version >= 9` con el inventario hasta revisión 9 y `version >= 10` con el
  completo. La rama actual `version >= 7 → SCHEMA_TABLES` haría que una base 9 exija las tablas nuevas, se
  clasifique `incompatible` y `db:migrate` se niegue a escribir: la migración quedaría inalcanzable.
- `schema.sql` crea las dos tablas e índices; `migrations.ts` agrega el paso `{ to: 10, apply: migrateAeroVault }`
  en `aero-vault-migration.ts`, idempotente y con `stampSchemaVersion(db, 10)`.
- Solo CLI `db:migrate`. Ningún camino de arranque migra, estampa ni reescribe.

### 3.5 Flujo del Atajo

1. La página pide `POST /bridge-tickets` con la acción y los payloads ya armados por el código existente.
2. El API mapea el endpoint, serializa `body`/`bodies`, valida `callbackPath`, emite el token, guarda el hash y
   responde `{ ticket, ticketUrl, expiresAt }`.
3. La página abre el Atajo con `{ "ticket": ..., "ticketUrl": ... }`.
4. El Atajo lee ambas claves, hace `POST` a `ticketUrl` con `X-Trindade-Ticket` y sin cuerpo.
5. El API busca por hash, marca `used_at` en la misma transacción, descifra la senha y devuelve el sobre.
6. El Atajo ejecuta contra el ERP exactamente lo que ejecuta hoy y vuelve al `callback`.

## 4. Invariantes

- I1 — La senha nunca vuelve al navegador: ningún endpoint la devuelve, ni el ciphertext, ni el IV, ni el tag.
- I2 — La senha nunca se escribe en logs, URLs, auditoría ni mensajes de error. El token tampoco: no aparece en
  `note`, ni en queries, ni en el path; solo en el header del canje.
- I3 — Solo el owner `wilkin` con rol `Administrador` administra el cofre; el backend decide, la UI solo oculta.
  El invitado nunca escribe.
- I4 — El ticket es one-time, expira a los 120 s y se marca usado antes de que el sobre salga de la API.
- I5 — El backend no migra al arrancar: la revisión 10 se aplica solo con `db:migrate` y backup previo.
- I6 — Ningún cambio de comportamiento ni de UI en Android, y la publicación no toca Android: sin APK, sin tag,
  sin GitHub Release.
- I7 — Cerrar sesión no borra el cofre del servidor; solo `DELETE /settings` lo elimina.
- I8 — El callback, la auditoría, el espejo, la cola y la conciliación conservan su comportamiento actual.

## 5. Specs

S1 — El defecto es de almacenamiento, no del sobre: la senha vive en `sessionStorage`
(`aero-integration.ts:129`, `:219`), iOS puede devolver el callback en una pestaña nueva, y `aero-queue.ts:9-11` ya
lo reconoce para la cola.

S2 — «Quiero eliminar la contraseña del navegador por completo, no moverla a `localStorage`.» Diseño B: cofre
cifrado en el backend y ticket de un solo uso que el Atajo canjea por el sobre del ERP.

S3 — «La senha ERP se guarda una sola vez, cifrada en SQLite; la web nunca la recibe de vuelta ni la persiste en
`localStorage`/`sessionStorage`.» Cualquier pestaña nueva (callback, duplicada, otro dispositivo del mismo owner)
consulta, lanza y lee sin pedir la senha. El Atajo sigue siendo el único proceso que habla con la red de la fábrica.

S4 — Cifrado `node:crypto` AES-256-GCM, IV aleatorio de 12 bytes, auth tag, clave de 32 bytes en `AERO_VAULT_KEY`
base64, `key_version = 1`. En producción la clave se valida al arrancar y el API falla con mensaje claro si falta o
no decodifica a 32 bytes; no arranca degradado. En tests se inyecta una clave fija de test. La clave no va a la DB,
ni al repo, ni a logs, ni a la respuesta HTTP. Perder `AERO_VAULT_KEY` obliga a volver a cargar la senha. Sin
rotación multi-clave: `key_version` queda preparado y la deuda documentada.

S5 — Revisión **10** aditiva con `aero_integration_settings` y `aero_bridge_tickets` exactamente como en §3.2.
Solo SHA-256 del token. Se actualizan `SCHEMA_VERSION`, `SCHEMA_TABLES`, `REVISION_TEN_TABLES`, `schema.sql`,
`migrations.ts`, la migración 9 → 10 y los tests. `requiredTablesFor(9)` no exige las tablas nuevas; `>= 10` pide el
inventario completo. Conteo y revisión en README/docs se cuentan contra `schema.sql`, sin inventar el número.

S6 — La migración es solo por CLI (`db:migrate`), nunca al arrancar. Una base revisión 10 no se abre con la imagen
vieja; el rollback real es restaurar el backup previo.

S7 — Owner-only con `authenticate` + `requireUsername('wilkin')` + `requireRole('Administrador')`. `GET` responde
`{ configured, wsUrl, username, hasPassword, updatedAt }` y nunca la senha ni el ciphertext. `PUT` con
`{ wsUrl, username, password? }`: no vacía reemplaza, vacía o ausente conserva, sin previa y sin nueva → 400
accionable; valida URL `http://`/`https://` con host y usuario no vacío. `DELETE` borra settings y tickets
pendientes del owner → 204.

S8 — `POST /bridge-tickets` con `{ action, payloads, callbackPath? }`; `action` ∈
`{entrada, entrada_lote, movimentos, test}`; 1 payload para `entrada`/`movimentos`/`test` (`test` acepta `[{}]`) y
2..8 para `entrada_lote`, con tamaño acotado y rechazo de lo que no corresponda. El servidor mapea el endpoint,
serializa `body`/`bodies`, arma el callback con `callbackPath` validado contra el origen de `PUBLIC_APP_URL` y
guarda el ticket: token de 32 bytes base64url, SHA-256, TTL 120 s, un solo uso. Respuesta
`{ ticket, ticketUrl, expiresAt }` con `ticketUrl` sin el token. Límite de pendientes por owner y limpieza al
emitir.

S9 — `POST /bridge-tickets/redeem` sin JWT: ticket bearer en `X-Trindade-Ticket`, nunca en la URL. Busca por hash,
verifica `used_at IS NULL` y `expires_at > now`, marca `used_at` en la misma transacción antes de responder y
devuelve `{ url, method: 'POST', headers: { Authorization, 'Content-Type', Accept }, body, bodies?, callback }`.
`Cache-Control: no-store`; no se loguea el header, el token ni el body; inválido/usado/expirado responde 404/410 sin
filtrar cuál de los tres fue; la senha no se devuelve por separado.

S10 — Zod para settings, tickets y redeem, registrados en `packages/backend/src/contracts/openapi.ts` como
componentes nombrados, con paths, permisos y respuestas 400/401/403/404/410/503. Se actualizan `EXPECTED_PATHS` y el
route-coverage y se regenera `packages/contracts/openapi.json` con
`npm run contracts:generate --workspace=packages/backend`. Si el gate exige regenerar `packages/android/contract/`,
se hace con el script del repo, sin cambiar comportamiento ni UI Android y sin APK. `redeem` es unauthenticated por
diseño y queda documentado.

S11 — `AeroSettings` sin `password`, con `hasPassword` y, si hace falta, `configured`/`source`; URL y usuario del
servidor; `shortcutName`, `syncEnabled` y `lastSyncAt` locales. El cofre se carga desde `GET /settings` al montar
Masas y el Panel Admin, con estado neutro mientras carga y error accionable si falla. El panel muestra
«Configurado» con `hasPassword`, campo de senha siempre vacío, «Senha guardada no servidor», guardar vacío
conserva, «Limpiar» llama `DELETE` y solo entonces limpia el estado local, y «Probar conexión» pide un ticket
`test` y abre el Atajo en lugar de usar `probeAeroConnection`.

S12 — `MassasLaunchPage`: lanzamiento individual/lote, `movimentos` y lectura automática piden ticket y abren el
Atajo con `{ ticket, ticketUrl }`; ningún sobre con `Authorization` en el cliente. Se conservan cola, intentos,
auditoría, callback y fecha del intento. Cofre no configurado muestra la frase correcta, no un fallo genérico.

S13 — `AeroShortcutDialog`: receta que recibe `{ ticket, ticketUrl }`, canjea y usa el sobre; sin `Authorization`,
sin `password`, sin sobre de prueba con Basic Auth. El enlace iCloud del Atajo viejo de 20 acciones se marca legacy y
no se presenta como «listo para instalar». `es.json` y `pt-BR.json` con paridad.

S14 — Se elimina `aeroSessionPassword`/`AERO_SESSION_PASSWORD_KEY` del flujo nuevo con purga de compatibilidad al
cargar/logout/401: se borra el valor viejo y no se adopta. Ningún test afirma que la senha vive en el navegador.
Logout no borra el cofre del servidor. Settings legacy de `localStorage` solo precargan URL/usuario y se limpian tras
un guardado exitoso, dejando solo preferencias no secretas.

S15 — Delta del Atajo: diccionario `{ "ticket": "<token>", "ticketUrl":
"https://trindademasas.duckdns.org/api/integration/aero/bridge-tickets/redeem" }`; nuevas acciones 2, 3 y 4; las
acciones 2–20 actuales pasan a 5–23; toda lectura del «diccionario de entrada» apunta a la respuesta de la nueva
acción 4; el resto queda igual. Si Shortcuts devuelve texto, se agrega «Obtener diccionario de la entrada» sobre esa
respuesta antes de leer `url`.

S16 — TDD estricto: primero el test que falla, después la implementación mínima, después refactor. Cobertura
mínima: crypto (roundtrip, IV/tag, clave inválida, tampering, sin plaintext en DB); migración 10 (fresh, 9→10,
`requiredTablesFor(9)`, 10 no baja, status); settings (200/403/401, GET no filtra, PUT conserva/reemplaza, DELETE);
tickets (issue owner-only, token hasheado, TTL, redeem, one-time, expirado, header faltante, ticket de otro owner,
callbackPath inválido, payloads fuera de rango, body/bodies, sin token ni password en logs/URL); frontend (sin senha,
panel vacío, vacío preserva, ticket trigger, launch/lote/movimientos, auto-read, pestaña nueva, purga legacy, sin
secretos en storage); contrato (paths/schemas, artifact, coverage, typecheck, build); E2E dos pestañas del mismo
contexto. Si el Atajo real no se puede ejecutar en el host se simula la redirección y se deja el test de integración
preparado; no se inventa una ejecución iOS.

S17 — Producción: `AERO_VAULT_KEY` en `.env` sin imprimir el valor y sin commitearlo; si ya existe no se rota.
Vacía en `.env.example` con `openssl rand -base64 32` y en `docker-compose.yml` como variable de entorno.
`docs/despliegue.md` a revisión 10: backup previo obligatorio, API detenida, migración explícita, `db/status` current
10, imágenes nuevas, `docker compose up -d`, health, SPA y login. Se reconstruyen `api` y `web`; no se toca el
volumen salvo backup/migración aprobados. Se verifica que el API arranca con la clave, que `GET /settings` responde
401 sin token y que el panel funciona; no se carga ni se pide la senha real del ERP.

S18 — Todo a `main`, sin branches ni worktrees, commits atómicos ≤400 líneas, Conventional Commits, sin
`Co-Authored-By` ni menciones de IA. Sin tag ni GitHub Release: `.github/workflows/android-release.yml` se dispara
con cualquier tag `v*` y esta entrega no toca Android. «Publicar» es push a `main` más deploy de web/API. `CHANGELOG`
bajo `[Unreleased]`; `v0.7.5` no se mueve. El panel de Herdr queda abierto; no se borran backups, datos ni
contenedores ajenos.

## 6. Tasks

| ID | RED (test que falla primero) | GREEN (cambio mínimo) | Archivos | Aceptación | Riesgo | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | — (documento) | Este ODD, solo docs | `odd/tasks/cofre-erp-y-ticket-atajo.md` | Existe antes de todo código; commit solo docs | Ninguno | `git revert` del commit |
| T2 | `vault.crypto.test.ts`: roundtrip, IV/tag distintos, clave de 31/33 bytes rechazada, tampering rechazado, sin plaintext en DB | `vault.crypto.ts` + `resolveVaultKey` y validación de arranque | `modules/integration/vault.crypto.ts`, `server.ts`, tests | Clave inválida no arranca en producción; ciphertext no contiene el plaintext | 3 (contrato de entorno nuevo) | Revertir el commit; sin datos |
| T3 | `schema-version.test.ts`/`migrations.test.ts`: fresh 10, 9→10, `requiredTablesFor(9)` sin tablas nuevas, 10 no baja, status current | `SCHEMA_VERSION`, tablas, `schema.sql`, `aero-vault-migration.ts`, paso 10 | `db/schema-version.ts`, `db/schema.sql`, `db/migrations.ts`, `db/aero-vault-migration.ts`, tests | Base 9 migra a 10; base 10 se niega a abrir con build 9 | 1 (cambia forma persistida) | Restaurar backup previo |
| T4 | `aero.settings.routes.test.ts`: 401/403/200, GET sin senha, PUT conserva/reemplaza, 400 sin previa, DELETE 204 | Servicio y rutas de settings | `modules/integration/aero.settings.service.ts`, `aero.vault.schema.ts`, `aero.vault.routes.ts` | Matriz de permisos completa; GET no filtra | 3 (permisos) | Revertir commit; migración queda inofensiva |
| T5 | `aero.tickets.routes.test.ts`: emisión, TTL, hash, canje, one-time, expirado, header faltante, otro owner, callback inválido, payloads, logs | Servicio y rutas de tickets | `aero.tickets.service.ts`, `aero.vault.routes.ts`, tests | Ningún token ni senha en logs/URL; one-time bajo concurrencia | 4 (concurrencia del canje) | Revertir commit |
| T6 | `openapi.test.ts` `EXPECTED_PATHS` + route-coverage | Esquemas y registro OpenAPI, artifact | `contracts/openapi.ts`, `contracts/openapi.json`, tests | Gate de contrato en verde | 3 (contrato público) | Revertir artifact y esquemas |
| T7 | `aero-vault.test.ts`: settings sin senha, GET, PUT vacío, DELETE, purga legacy | `aero-vault.ts` y `aero-integration.ts` sin `password` | `lib/aero-vault.ts`, `lib/aero-integration.ts`, `lib/aero-integration.test.ts` | Ningún secreto en storage; purga verificada; las pruebas que afirmaban la senha en `sessionStorage` se reescriben | 3 (cambio de contrato interno) | Revertir commit |
| T8 | `AeroIntegrationPanel`/`MassasLaunchPage` tests: campo vacío, trigger por ticket, launch/lote/movimientos/auto-read | Panel, página y diálogo sobre tickets; se retira `probeAeroConnection` del navegador | `pages/massas/AeroIntegrationPanel.tsx`, `pages/MassasLaunchPage.tsx`, `pages/massas/AeroShortcutDialog.tsx`, `lib/aero-connection.ts` (se elimina), `lib/aero-batch.ts`, `lib/aero-mirror.ts`, `pages/massas/aero-bridge-wiring.test.ts`, `aero-probe-copy.test.ts` | Cada camino pide ticket; ningún `Authorization` en cliente; ninguna prueba exige ya el sondeo o el sobre armado en la página | 3 (flujo compartido) | Revertir commit |
| T9 | E2E dos pestañas + tests i18n | i18n ES/PT y spec de pestaña nueva | `i18n/locales/es.json`, `pt-BR.json`, `__e2e__/aero-vault-new-tab.spec.ts` | Segunda pestaña no pide senha | Ninguno | Revertir commit |
| T10 | — (docs) | Docs, CHANGELOG y delta del Atajo | `docs/despliegue.md`, `docs/integracion-aero32.md`, `README.md`, `CHANGELOG.md` | Revisión 10 y 20 tablas contadas; delta exacto | Ninguno | Revertir commit |
| T11 | — | Suites, typecheck, build, CI | — | Todo verde; sin rojos ni pendientes ejecutables | Ninguno | — |
| T12 | — | Backup, migración y deploy verificados | producción | `db/status` current 10; health; 401 sin token | 1 (datos) | Restaurar backup |

## 7. Migración a revisión 10, backup, rollback y verificación de producción

Estado medido antes de empezar: `db/status` dentro de `trindade-api-1` informa `schema revision: 9`,
`18 tables observed, 0 missing, 0 unexpected`, `verdict: current`. `schema.sql` declara 18 tablas; la revisión 10
suma dos y el inventario pasa a **20**, contado contra el archivo.

Secuencia de despliegue:

1. Backup del volumen de datos antes de cualquier escritura:
   `docker compose exec -T api node packages/backend/dist/db/backup.js` si el script existe; si no, copia
   consistente del archivo `trindade.db` con la API detenida a `packages/backend/data/backup-pre-rev10-<iso>.db`,
   verificando `integrity: ok` del backup. No se borra ningún backup anterior.
2. API detenida (`docker compose stop api`) para que nadie escriba durante la migración.
3. Migración explícita: `docker compose run --rm api node packages/backend/dist/db/migrate.js`.
4. `db/status` debe informar `schema revision: 10`, `20 tables`, `verdict: current`. Si no, se restaura el backup y
   no se levanta la imagen nueva.
5. Imágenes nuevas: `docker compose build api web` y `docker compose up -d`.
6. Health de la API, SPA servida, login, y `GET /api/integration/aero/settings` sin token → 401.

Rollback: la revisión 10 no la entiende la imagen vieja (`newer` ⇒ `refused`). Volver atrás significa detener la API,
restaurar el `.db` del backup previo y levantar la imagen anterior. No se intenta un downgrade de esquema.

`AERO_VAULT_KEY`: vive en el `.env` de producción junto al compose, gitignored, y se inyecta por
`docker-compose.yml` como variable de entorno; nunca en la base, el repo, los logs ni una respuesta. Si ya existe no
se rota. Perderla obliga a volver a cargar la senha: el ciphertext de los backups queda ilegible. Deuda declarada:
`key_version` está listo para rotación multi-clave, que no se implementa en esta entrega.

## 8. Delta exacto del Atajo

El Atajo actual tiene 20 acciones y la página lo alimenta con el sobre armado en el navegador. La receta vigente
está en `aeroBridgeShortcutRecipe` (`aero-integration.ts:1148-1189`, `actionCount: 20`) y sus textos en
`es.json`/`pt-BR.json` bajo `massas.aero.shortcutStep*`.

Diccionario que la página entrega ahora al Atajo:

```json
{ "ticket": "<token>", "ticketUrl": "https://trindademasas.duckdns.org/api/integration/aero/bridge-tickets/redeem" }
```

Acciones nuevas, con su texto exacto y su posición:

| Nueva | Acción en Shortcuts | Texto y parámetros | Posición |
| --- | --- | --- | --- |
| 2 | Obtener valor del diccionario | Clave `ticket`, del diccionario de la entrada | Después de la actual acción 1 («Obtener diccionario de la entrada») |
| 3 | Obtener valor del diccionario | Clave `ticketUrl`, del diccionario de la entrada | Después de la nueva acción 2 |
| 4 | Obtener contenido de URL | `POST` a la variable de la acción 3; encabezado `X-Trindade-Ticket` = variable de la acción 2; `Accept: application/json`; sin cuerpo | Después de la nueva acción 3, antes de la actual acción 2 |

Renumeración completa, con el contenido que **no** cambia:

| Actual | Nueva | Acción | Cambio de origen de datos |
| --- | --- | --- | --- |
| 1 | 1 | Obtener diccionario de la entrada | ninguno (sigue leyendo lo que la página entrega) |
| — | **2** | Obtener valor del diccionario `ticket` | nueva |
| — | **3** | Obtener valor del diccionario `ticketUrl` | nueva |
| — | **4** | Obtener contenido de URL · POST · cabecera `X-Trindade-Ticket` | nueva: la respuesta es el sobre |
| 2 | 5 | Obtener valor del diccionario `url` | pasa a leer la **respuesta de la 4** |
| 3 | 6 | Obtener valor del diccionario `headers` | pasa a leer la **respuesta de la 4** |
| 4 | 7 | Obtener valor del diccionario `Authorization` (del diccionario de cabeceras) | igual, pero el diccionario viene de la 6 |
| 5 | 8 | Obtener valor del diccionario `callback` | pasa a leer la **respuesta de la 4** |
| 6 | 9 | Si · el diccionario de la entrada tiene valor para `bodies` | pasa a leer la **respuesta de la 4** |
| 7 | 10 | Establecer variable `respostas` como lista vacía | igual |
| 8 | 11 | Repetir con cada elemento de `bodies` | pasa a leer la **respuesta de la 4** |
| 9 | 12 | Obtener contenido de URL dentro de la repetición | igual |
| 10 | 13 | Añadir a variable `respostas` | igual |
| 11 | 14 | Fin de la repetición | igual |
| 12 | 15 | Combinar texto `respostas` con coma | igual |
| 13 | 16 | Texto `[` + resultado + `]` | igual |
| 14 | 17 | Codificar URL | igual |
| 15 | 18 | Si no | igual |
| 16 | 19 | Obtener valor del diccionario `body` como `body_item` | pasa a leer la **respuesta de la 4** |
| 17 | 20 | Obtener contenido de URL individual | igual |
| 18 | 21 | Codificar URL | igual |
| 19 | 22 | Fin del Si | igual |
| 20 | 23 | Abrir URLs con `callback` + resultado | igual |

Regla única: toda lectura que hoy apunta al «diccionario de la entrada» (acciones 2, 3, 5, 6, 8, 16 actuales) pasa a
apuntar a la **respuesta de la nueva acción 4**. El POST al ERP, el lote, el `body_item` y el callback no cambian.

Caso tolerado: si Shortcuts devuelve la respuesta de la acción 4 como texto y no como diccionario, se agrega una
acción «Obtener diccionario de la entrada» sobre esa respuesta, inmediatamente después de la acción 4, y las
lecturas apuntan a esa acción. El contrato del servidor no cambia.

El enlace iCloud existente (`AERO_SHORTCUT_ICLOUD_URL`, `aero-integration.ts:35`) apunta al Atajo viejo de 20
acciones: queda marcado como legacy y no se presenta como «listo para instalar». El usuario actualiza su Atajo con
este delta; el ODD y `docs/` llevan los números y textos exactos.

## 9. Documentación a actualizar

`docs/despliegue.md` (revisión 10, 20 tablas, backup, migración explícita, `AERO_VAULT_KEY`, health),
`docs/integracion-aero32.md` (cofre, ticket, delta del Atajo), `docs/integracion-aero-masas-web.md` (flujo web sin
senha), `README.md` (conteo de tablas y revisión), `CHANGELOG.md` (`[Unreleased]`) y este ODD con sus commits.

## 10. Fuera de alcance

Rotación multi-clave; cambios en reconciliación, espejo, cola, auditoría o conciliación; cambios de comportamiento o
UI en Android; APK, tag o GitHub Release; mover `v0.7.5`; borrar backups, datos o contenedores ajenos; cerrar el
panel de Herdr.

## Log

L1 — Pedido del usuario (verbatim):

> Necesito que tomes el frente de Trindade en `/home/wilkin/proyectos/Trindade`, sobre `main`, con el árbol limpio y sin abrir ramas ni worktrees. El cambio es web/backend, no Android. Antes de tocar código, crea el artefacto ODD y commitea solo esa documentación; después trabajá con TDD estricto hasta cerrar, probar, desplegar y dejar `main` actualizado.
>
> ## El defecto que vamos a cerrar
>
> La contraseña del ERP vive hoy en `sessionStorage` (`trindade.aero.session.v1`, `packages/frontend/src/lib/aero-integration.ts`). La URL y el usuario viven en `localStorage`. Cuando el Atajo iOS devuelve el callback, iOS puede abrir una pestaña nueva; `sessionStorage` es por pestaña y no se hereda, así que la pestaña nueva no ve la senha. La consulta que ya salió funciona porque el sobre se armó antes de salir y llevaba el `Authorization: Basic`; lo que falla después es la lectura automática y cualquier envío o consulta desde esa pestaña, que vuelven a pedir la senha. El propio repo ya reconoce el problema en `packages/frontend/src/lib/aero-queue.ts`: la cola usa `localStorage` justamente porque iOS puede devolver el callback en una pestaña nueva. La contraseña quedó en el almacenamiento equivocado.
>
> Quiero eliminar la contraseña del navegador por completo, no moverla a `localStorage`. La solución es el diseño B: un cofre cifrado en el backend y un ticket de un solo uso que el Atajo canjea por el sobre del ERP.
>
> ## Resultado esperado
>
> - La senha ERP se guarda una sola vez, cifrada en SQLite; la web nunca la recibe de vuelta ni la persiste en `localStorage`/`sessionStorage`.
> - Cualquier pestaña nueva (callback del Atajo, pestaña duplicada, otro dispositivo del mismo owner) puede consultar, lanzar y leer sin pedir la senha.
> - El Atajo sigue siendo el único proceso que habla con la red de la fábrica. La web le entrega un ticket; el Atajo canjea el ticket por el sobre `{url, method, headers, body|bodies, callback}` y hace el POST al ERP como hoy.
> - La web no puede fabricar un `Authorization` ni ver la senha. El ticket es aleatorio, de un solo uso, con TTL corto, y no viaja en la URL ni en logs.
> - El callback, la auditoría, el espejo, la cola y la conciliación conservan su comportamiento actual.
>
> ## ODD obligatorio
>
> Creá `odd/tasks/cofre-erp-y-ticket-atajo.md` antes de implementar. Debe incluir, en el estilo de los ODD del repo:
>
> 1. Contexto y evidencia del defecto, con los archivos y el escenario de la pestaña nueva.
> 2. Decisión B y modelo de amenaza: qué se protege, qué sigue expuesto y por qué se acepta.
> 3. Arquitectura, modelo de datos, contratos API, migración y flujo del Atajo.
> 4. Invariantes: la senha nunca vuelve al navegador, nunca se escribe en logs/URLs/auditoría, solo el owner `wilkin` con rol `Administrador` administra el cofre, el ticket es one-time y expira, el backend no migra al arrancar, la publicación no toca Android.
> 5. Tareas TDD T1…Tn, cada una con test RED, cambio GREEN, archivos, criterio de aceptación, riesgo y rollback.
> 6. Migración a revisión 10, backup/rollback y verificación de producción.
> 7. Delta exacto del Atajo, con acciones nuevas y renumeración.
> 8. Documentación a actualizar y fuera de alcance.
>
> El ODD se commitea primero, solo docs. No empieces la implementación antes de que exista ese archivo.
>
> ## Diseño técnico que quiero
>
> ### 1. Persistencia y migración
>
> Agregá la revisión **10** del esquema, aditiva. Dos tablas nuevas:
>
> - `aero_integration_settings`: una fila por owner (unique `user_id`), con `ws_url`, `erp_username`, `password_ciphertext`, `password_iv`, `password_tag`, `key_version`, `created_at`, `updated_at`. La senha va cifrada; URL y usuario pueden quedar en claro.
> - `aero_bridge_tickets`: `id`, `token_hash` único, `user_id`, `action`, `endpoint`, `body`, `bodies` (nullable), `callback_url`, `expires_at`, `used_at`, `created_at`. Guardá solo el SHA-256 del token, nunca el token crudo.
>
> Actualizá `SCHEMA_VERSION` a 10, `SCHEMA_TABLES`, una constante `REVISION_TEN_TABLES`, `schema.sql`, `migrations.ts`, la migración 9 → 10 y los tests de esquema. **Cuidado con `requiredTablesFor`**: hoy `if (version >= 7) return SCHEMA_TABLES` haría que una base revisión 9 exija las tablas nuevas y se clasifique `incompatible`, impidiendo la propia migración. Agregá una rama para revisión 9 que devuelva las tablas hasta revisión 9, y `>= 10` para el inventario completo. Actualizá el conteo de tablas y la revisión en README/docs/`docs/despliegue.md` sin inventar el número: contalo contra `schema.sql`.
>
> La migración es solo por CLI (`db:migrate`), nunca al arrancar. Una base revisión 10 no debe abrirse con la imagen vieja; el rollback real es restaurar el backup previo si hay que volver atrás.
>
> ### 2. Cifrado
>
> Usá `node:crypto` con AES-256-GCM: IV aleatorio de 12 bytes, auth tag, clave de 32 bytes en `AERO_VAULT_KEY` codificada en base64. Guardá `key_version = 1`.
>
> - Validá la clave al arrancar en producción: si falta o no decodifica a 32 bytes, el API debe fallar con un mensaje claro, no arrancar en modo degradado.
> - En tests, inyectá una clave fija de test; nunca la de producción.
> - La clave no va a la DB, ni al repo, ni a logs, ni a la respuesta HTTP. En producción va en `.env` (gitignored) y en `docker-compose.yml` como variable de entorno. Agregala a `.env.example` vacía con instrucción de generación (`openssl rand -base64 32`).
> - Documentá que perder `AERO_VAULT_KEY` obliga a volver a cargar la senha; el ciphertext queda en backups pero no se puede descifrar sin la clave.
> - No implementes rotación multi-clave en esta entrega; dejá `key_version` preparado y documentá la deuda.
>
> ### 3. API owner-only
>
> Todos los endpoints de administración del cofre requieren `authenticate` + `requireUsername('wilkin')` + `requireRole('Administrador')`. La autoridad es el backend, no la UI. El invitado nunca debe poder escribir.
>
> - `GET /api/integration/aero/settings`
>   - Respuesta: `{ configured, wsUrl, username, hasPassword, updatedAt }`.
>   - Nunca devuelve la senha ni el ciphertext.
> - `PUT /api/integration/aero/settings`
>   - Body: `{ wsUrl, username, password? }`.
>   - Si `password` viene no vacío, cifralo y reemplazá el anterior.
>   - Si `password` viene vacío/ausente y ya existe una senha, conservala; así se puede cambiar URL/usuario sin reescribir la senha.
>   - Si no existe una senha previa y no viene una nueva, respondé 400 con un código accionable.
>   - Validá URL (`http://`/`https://`, host) y usuario no vacío.
> - `DELETE /api/integration/aero/settings`
>   - Borra settings y tickets pendientes del owner; 204.
> - `POST /api/integration/aero/bridge-tickets`
>   - Body: `{ action, payloads, callbackPath? }`.
>   - `action`: `entrada`, `entrada_lote`, `movimentos`, `test`.
>   - `payloads`: array de objetos JSON; 1 para `entrada`/`movimentos`/`test` (`test` puede ser `[{}]`), 2..8 para `entrada_lote`. Limitá tamaño y rechazá payloads que no correspondan.
>   - El servidor mapea el endpoint, no el cliente: `entrada`/`entrada_lote` → `entradasitem`; `movimentos` → `movimentoitem?_method=PATCH`; `test` → `usuarios`.
>   - El servidor serializa `body` (primer payload) y `bodies` (todos, solo lote), arma el callback con `callbackPath` validado contra el origen de `PUBLIC_APP_URL` y guarda el ticket.
>   - Token: 32 bytes aleatorios base64url; guardá SHA-256; TTL 120 s; un solo uso.
>   - Respuesta: `{ ticket, ticketUrl, expiresAt }`, donde `ticketUrl` es la URL absoluta del endpoint de canje (sin el token).
>   - Aplicá un límite simple de tickets pendientes por owner para no acumular basura; limpiá expirados/antiguos al emitir.
> - `POST /api/integration/aero/bridge-tickets/redeem`
>   - Sin JWT: el ticket es la credencial. Lee `X-Trindade-Ticket` del header, no de la URL.
>   - Buscá por hash, verificá `used_at IS NULL` y `expires_at > now`; marcá `used_at` en la misma transacción antes de responder.
>   - Descifrá la senha y devolvé el sobre `{ url, method: 'POST', headers: { Authorization, 'Content-Type', Accept }, body, bodies?, callback }`.
>   - `Cache-Control: no-store`; no loguees el header, el token ni el body. Un ticket inválido/usado/expirado responde 404/410 sin filtrar cuál de los tres fue.
>   - No devuelvas la senha por separado; solo el sobre necesario.
> - Errores con códigos semánticos (`apiError`) y frases ES/PT cuando corresponda. No inventes eventos nuevos en la auditoría si no son necesarios; los pares `requested`/`result` existentes siguen siendo la fuente. El token no debe aparecer en `note`, logs ni respuestas de error.
>
> ### 4. Contrato y rutas
>
> - Agregá esquemas Zod para settings, tickets y redeem; registralos en `packages/backend/src/contracts/openapi.ts` como componentes nombrados, con paths, descripciones de permisos y respuestas 400/401/403/404/410/503.
> - Actualizá `EXPECTED_PATHS` en `openapi.test.ts` y cualquier route-coverage.
> - Regenerá `packages/contracts/openapi.json` con `npm run contracts:generate --workspace=packages/backend`.
> - Si el gate de contrato Android exige regenerar `packages/android/contract/`, hacelo con el script del repo; **no cambies comportamiento ni UI Android y no generes APK**.
> - La nueva ruta de redeem es unauthenticated por diseño; documentá por qué (ticket bearer, one-time) y no la dejes detrás del guard del guest.
>
> ### 5. Frontend: cero senha en el navegador
>
> Reemplazá el modelo actual:
>
> - `AeroSettings` deja de tener `password`. Agregá `hasPassword` y, si hace falta, `configured`/`source`. La URL y el usuario vienen del servidor; `shortcutName`, `syncEnabled` y `lastSyncAt` pueden seguir locales.
> - Cargá el estado del cofre desde `GET /settings` al montar la página de Masas y el Panel Admin. Mientras carga, mostrá un estado neutro; si falla, un error accionable.
> - El panel `AeroIntegrationPanel`:
>   - Muestra “Configurado” cuando `hasPassword` es true.
>   - El campo de senha arranca vacío siempre; nunca se rellena desde el servidor. Mostrá “Senha guardada no servidor” y permití reemplazarla escribiendo una nueva.
>   - Guardar con senha vacía preserva la existente; guardar con una nueva la reemplaza.
>   - “Limpiar” llama `DELETE` y solo entonces limpia el estado local; si falla, no mientas.
>   - “Probar conexión” ya no usa `probeAeroConnection` desde el navegador: pide un ticket `test` y abre el Atajo. En una computadora el panel sigue limitado por dispositivo; en iPhone funciona.
> - `MassasLaunchPage`:
>   - Para lanzamiento individual/lote, `movimentos` y la lectura automática, pedí un ticket y abrí el Atajo con `{ ticket, ticketUrl }`; no armes sobres con `Authorization` en el cliente.
>   - Conservá la cola, los intentos, la auditoría, el callback y la fecha del intento.
>   - Si el cofre no está configurado, mostrá la frase correcta; no un fallo genérico.
> - `AeroShortcutDialog`:
>   - La receta nueva recibe `{ ticket, ticketUrl }`, canjea el ticket y usa el sobre devuelto. No muestres `Authorization`, `password` ni un “sobre de prueba” con Basic Auth.
>   - El enlace iCloud actual apunta al Atajo viejo de 20 acciones. No lo presentes como “listo para instalar” si no fue reemplazado: marcalo como legacy o quitá esa promesa. El usuario actualizará su Atajo existente con el delta.
>   - Actualizá `es.json` y `pt-BR.json` con paridad.
> - Eliminá el uso de `aeroSessionPassword`/`AERO_SESSION_PASSWORD_KEY` en el flujo nuevo. Dejá una purga de compatibilidad: al cargar/logout/401, borrá el valor viejo de `sessionStorage` y no lo adoptes. Ningún test debe seguir afirmando que la senha vive en el navegador.
> - No borres el cofre del servidor al cerrar sesión: el objetivo es que la próxima sesión/pestaña lo reutilice. Solo `DELETE /settings` lo elimina.
> - Si hay settings legacy en `localStorage`, usalos solo para precargar URL/usuario; la senha se escribe una vez y se cifra en el servidor. Después de un guardado exitoso, limpiá el payload legacy o dejá solo preferencias no secretas.
>
> ### 6. Delta del Atajo
>
> La página pasa al Atajo un diccionario:
>
> ```json
> { "ticket": "<token>", "ticketUrl": "https://trindademasas.duckdns.org/api/integration/aero/bridge-tickets/redeem" }
> ```
>
> El Atajo actual tiene 20 acciones. La nueva secuencia conserva las acciones del ERP; solo cambia la entrada:
>
> 1. Acción 1 actual: “Obtener diccionario de la entrada” — se queda.
> 2. Nueva acción 2: “Obtener valor del diccionario” clave `ticket`.
> 3. Nueva acción 3: “Obtener valor del diccionario” clave `ticketUrl`.
> 4. Nueva acción 4: “Obtener contenido de URL” — POST a `ticketUrl`, header `X-Trindade-Ticket` = `ticket`, `Accept: application/json`, sin cuerpo. La respuesta es el sobre.
> 5. Las acciones 2–20 actuales pasan a ser 5–23 y todas las lecturas del “diccionario de entrada” deben apuntar a la respuesta de la nueva acción 4. El resto (bodies, POST al ERP, batch, callback) queda igual.
> 6. Si Shortcuts devuelve la respuesta como texto en lugar de diccionario, agregá una acción “Obtener diccionario de la entrada” sobre esa respuesta antes de la lectura de `url`; documentá el caso, pero no cambies el contrato del servidor.
>
> El ODD y `docs/` deben llevar este delta exacto, con números y textos, y el mensaje final del agente debe entregar **solo lo nuevo y dónde insertarlo**, no una receta completa de 23 acciones.
>
> ### 7. TDD obligatorio
>
> Primero el test que falla; después la implementación mínima; después refactor. Como mínimo:
>
> - Crypto: roundtrip, IV/tag, clave inválida, tampering, sin plaintext en DB.
> - Migración 10: fresh install, 9→10, `requiredTablesFor(9)` no exige tablas nuevas, 10 no baja, status/verificación.
> - Settings: owner-only (wilkin admin 200; otro admin/trabajador 403; sin token 401), GET no filtra senha, PUT conserva senha si falta, PUT reemplaza, DELETE.
> - Tickets: issue owner-only, token hasheado, TTL, redeem correcto, one-time, expirado, header faltante, ticket de otro owner, callbackPath inválido, payloads fuera de rango, body/bodies correctos, no token/password en logs/URL.
> - Frontend: settings sin senha, panel precargado vacío, guardar con vacío preserva, ticket trigger, launch/lote/movimientos usan ticket, auto-read, nuevo tab sin pedir senha, purge legacy, no secretos en storage.
> - Contrato: OpenAPI paths/schemas, artifact, route coverage; typecheck; build.
> - E2E: dos pestañas del mismo contexto; guardar una vez y abrir otra pestaña/callback sin reingresar senha. Si no podés ejecutar el Atajo real en el host, simulá la redirección y dejá el test de integración preparado; no inventes una ejecución iOS.
>
> Corré las suites afectadas y el gate que corresponda (`packages/backend test`, frontend node/unit/e2e, typecheck, `make ci-clone` si es viable). No cierres con tests rojos ni con un “pendiente” que el repo pueda ejecutar.
>
> ### 8. Producción y publicación
>
> - Agregá `AERO_VAULT_KEY` a `.env` de producción sin imprimir el valor y sin commitearlo. Si ya existe, no la rotes. Añadila a `.env.example` vacía y a `docker-compose.yml`.
> - Actualizá `docs/despliegue.md` a revisión 10 y al nuevo paso de migración; backup previo obligatorio, API detenida, migración explícita, `db/status` current 10, imágenes nuevas, `docker compose up -d`, health, SPA y login.
> - Reconstruí `api` y `web`; no toques el volumen de datos salvo el backup/migración aprobados.
> - Verificá que la API arranca con la clave, que `GET /settings` responde 401 sin token y que el panel funciona; no hace falta que cargues la senha real del ERP en producción (la cargará el usuario), y no la pidas.
> - Todo a `main`, sin branches/worktrees, commits atómicos ≤400 líneas, Conventional Commits y **sin Co-Authored-By ni menciones de IA**.
> - **No crees tag ni GitHub Release**: `.github/workflows/android-release.yml` se dispara con cualquier tag `v*` y esta entrega no toca Android; no hay APK nuevo. “Publicar” acá significa push a `main` + deploy de las imágenes web/API. Actualizá `CHANGELOG` bajo `[Unreleased]` (o la convención equivalente) y no muevas `v0.7.5`.
> - Dejá el panel de Herdr abierto; no cierres sesión, pestaña ni pane. No borres backups, datos ni contenedores ajenos.
>
> ## Cierre que necesito de vos
>
> Cuando termines, reportá:
>
> 1. Commits en `main`, tests y CI.
> 2. Migración aplicada y revisión de esquema en producción; health.
> 3. Confirmación de que la senha no está en navegador, DB en claro, logs ni URLs.
> 4. Ubicación de `AERO_VAULT_KEY` (sin el valor) y advertencia de backup.
> 5. La receta delta del Atajo: solo acciones nuevas, números y dónde insertarlas.
> 6. Cualquier cosa que no hayas podido verificar en el iPhone real, marcada como pendiente y con el paso exacto para probarla.
>
> Si encontrás una contradicción con este diseño, un riesgo irreversible o un test que no puede pasar, detenete y reportá antes de inventar una solución. Trabajá hasta terminar; no dejes el frente a medias.

L2 — Evidencia leída antes de escribir una línea. `aero-integration.ts:114-120` afirma que sacar la senha del
navegador «needs the on-prem bridge, which does not exist yet»: este ODD crea ese puente del lado del servidor y deja
de depender de que el Atajo y la pestaña compartan almacenamiento. `aero-integration.ts:219` mete
`password: aeroSessionPassword(session)` dentro de `AeroSettings`, así que la senha viajaba en el mismo objeto que se
persiste; al separarla hay que cortar ese campo, no renombrarlo. `aero-queue.ts:9-11` ya había resuelto el mismo
problema para la cola con `localStorage`; la senha quedó en el otro almacenamiento.

L3 — Estado real de producción antes de tocar nada: `node packages/backend/dist/db/status.js` dentro del contenedor
`trindade-api-1` informa `schema revision: 9`, `18 tables observed, 0 missing, 0 unexpected`, `verdict: current`.
`schema.sql` declara 18 tablas; la revisión 10 suma dos y el inventario pasa a 20, contado contra el archivo.

L4 — La trampa de `requiredTablesFor` verificada contra el código: `schema-version.ts` devuelve `SCHEMA_TABLES` para
`version >= 7`, y `classifySchema` marca `incompatible` cuando falta una tabla requerida; `migrateDatabase` se niega a
escribir ante `incompatible`. Sin una rama `version >= 9` con el inventario de revisión 9, apenas `SCHEMA_VERSION`
pase a 10 toda base 9 quedaría inalcanzable.

L5 — Los dos guards que pide el diseño existen: `requireRole` en `modules/auth/auth.middleware.ts:114` y
`requireUsername` en `:139`, ya usados como `preHandler` en `audit.routes.ts:13` y `admin.routes.ts:33`. El origen del
callback sale de `PUBLIC_APP_URL` en `server.ts:25`, con respaldo en `APP_URL` y en el puerto local.

L6 — Mapa verificado contra el código antes de commitear este documento. La receta vigente declara
`actionCount: 20` y sus textos están en `massas.aero.shortcutStep*`; los cuatro bloques son A 1–5, B 6–14, C 15–18 y
D 19–20, así que la renumeración de §8 es exacta y no estimada. `buildAeroBridgeEnvelope` devuelve `body` como
`JSON.stringify(payload)` y `AeroBridgeEnvelope.bodies?: string[]`, de ahí que el canje tenga que devolver texto y no
objetos: si devolviera objetos, el delta dejaría de ser solo la entrada. `probeAeroConnection` no vive en
`aero-integration.ts` sino en `lib/aero-connection.ts:61`, y su único consumidor es `AeroIntegrationPanel:200`: al
retirarlo se elimina el módulo y su prueba, junto con `aero-probe-copy.test.ts`. `requireUsername` existe
(`auth.middleware.ts:139`) pero no tiene ningún llamador de producción todavía; este módulo es el primero.
`EXPECTED_PATHS` tiene 62 entradas y pasó a 65 con tres paths nuevos (GET/PUT/DELETE comparten `/settings`); medido contra `packages/contracts/openapi.json`, no contado a ojo.
`db-init.test.ts:32-51` lleva la lista de 18 nombres escrita a mano y hay que extenderla; `schema-version.test.ts:90-96`
suma las listas por revisión y tiene que incluir `REVISION_TEN_TABLES`. `docs/despliegue.md` usa el literal 9 en el
título de la sección 6, en la tabla de pasos, en el checklist y en la nota de sesiones.

L7 — Bloqueo del host, no del diseño: el guard de seguridad de esta sesión rechaza leer o escribir `.env` y
`.env.example`. Los pasos que dependen de esos dos archivos (S17) quedan como los únicos que pueden requerir una
autorización explícita del usuario; no se intenta rodear el guard. Todo lo demás del ODD avanza sin ese acceso.
