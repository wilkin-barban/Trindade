# Puente Scriptable para el ERP en iPhone

Adopta **Scriptable** como el proceso nativo que habla con la red de la fábrica y retira el Atajo de iOS.
Sin cambios de backend, sin migración, sin Android. Reemplaza todos los `shortcuts://` por
`scriptable:///run/Aero32Bridge?ticket=…&ticketUrl=…`.

## Specs

S1 — El script se entrega como `Aero32Bridge.scriptable` en `packages/frontend/public/`, Vite lo copia a
`dist/`, y se importa en Scriptable sin que el usuario arme acciones a mano. Es JSON válido con
`{"name":"Aero32Bridge","script":"<js>","icon":{"color":"blue","glyph":"arrow.triangle.2.circlepath"},
"always_run_in_app":true,"share_sheet_inputs":["text"]}`. El nombre es exactamente `Aero32Bridge`, sin
espacio, porque el URL scheme lo usa.

S2 — El script no contiene secretos: ni `password`, ni `Authorization: Basic`, ni tokens literales. Lee
`args.queryParameters.ticket` y `args.queryParameters.ticketUrl`; si falta alguno, muestra un `Alert` breve y
termina sin inventar callback.

S3 — Canje: `POST` a `ticketUrl` con `X-Trindade-Ticket: <ticket>`, `Accept: application/json`, sin cuerpo, con
`Request` de Scriptable y `allowInsecureRequest = true`. La respuesta es el sobre
`{url, headers, body, bodies?, callback}`.

S4 — Envío: si `bodies` es un array no vacío se recorre; si no, se usa `[envelope.body]`. Cada payload se envía
como texto JSON a `envelope.url` con `envelope.headers` y `allowInsecureRequest = true`.

S5 — Retorno: un payload devuelve el texto tal cual; un lote devuelve `[respuesta1,respuesta2,…]` (coma entre
respuestas, corchetes alrededor), que es exactamente lo que `readAeroBatchResult` ya sabe leer. Luego
`Safari.open(envelope.callback + encodeURIComponent(resultado))` y `Script.complete()`.

S6 — El script no registra ni muestra `Authorization`, el ticket ni contraseñas; no guarda estado.

S7 — Deep link: `buildAeroBridgeTriggerUrl` devuelve
`scriptable:///run/Aero32Bridge?ticket=<encodeURIComponent(ticket)>&ticketUrl=<encodeURIComponent(ticketUrl)>`.
El nombre `Aero32Bridge` es una constante de integración, no editable por el usuario.

S8 — Se eliminan `shortcuts://`, `aeroShortcutTriggerUrl`, `AERO_SHORTCUT_ICLOUD_URL`,
`AERO_DEFAULT_BRIDGE_SHORTCUT_NAME`, `AERO_DEFAULT_SHORTCUT_NAME` y `aeroBridgeShortcutRecipe`. No queda
`shortcuts://` en `packages/frontend/src` ni en textos de UI.

S9 — `shortcutName` desaparece de `AeroSettings`, `DEFAULT_AERO_SETTINGS`, `loadAeroSettings` y
`saveAeroSettings`. Un nombre viejo en `localStorage` se ignora: no se migra, porque el nombre es fijo.

S10 — Todos los disparadores usan el builder nuevo sin `name`: `AeroIntegrationPanel.handleTest`,
`MassasLaunchPage.triggerAeroSync`, `handleSyncFromErp`, reintentos y auto-lectura,
`aero-mirror.triggerAeroMovementsSync`, y `ReportsPage`/`ReceiptsSection` cuando disparan movimientos.

S11 — `AeroShortcutDialog.tsx` se renombra a `AeroScriptableDialog.tsx` y muestra el camino nuevo: (1) «Instalar
Scriptable no iPhone» a la App Store; (2) «Importar Aero32Bridge.scriptable» al asset; (3) volver a Trindade,
donde los botones abren Scriptable. Explica que tras descargar el archivo hay que tocarlo y elegir
**Compartir → Scriptable**, y que el script aparece como `Aero32Bridge`. Ofrece «Abrir Scriptable» con
`scriptable://` sin ejecutar nada. Sin receta de acciones, sin iCloud, sin contraseña ni `Authorization`.

S12 — El diálogo es usable a 375 px, con objetivos táctiles ≥44 px y sin scroll horizontal.

S13 — `AeroIntegrationPanel` cambia «Instalar Atalho no iPhone» por «Instalar Scriptable no iPhone» (App Store),
agrega «Importar Aero32Bridge.scriptable» (descarga del asset) y mantiene un botón que abre el diálogo. Los
textos de «Probar conexión», «Sincronizar», «Abriendo…» y «Enviado…» pasan a nombrar Scriptable, y el panel
explica que Scriptable es la app nativa que habla con la fábrica y que la contraseña sigue en el cofre del
servidor.

S14 — `AeroDeviceBanner` y los textos: «iPhone con Atajos» → «iPhone con Scriptable»; `aeroDevice.body` y
cualquier «Atajos/Atalho» → «Scriptable».

S15 — i18n ES/PT con paridad: se actualizan `shortcutTitle`, `shortcutIntro`, `shortcutName`, `shortcutIcloud*`,
`shortcutStep*`, `shortcutOpenApp`, `testShortcutOpening`, `syncSent`, `syncConfirmHint`, `deviceLocked`,
`aeroDevice.body` y compañía; se eliminan las claves de la receta vieja.

S16 — Pruebas: se elimina `aero-shortcut-copy.test.ts` y se reemplaza por una prueba de instalación/importación;
se actualizan `aero-bridge-wiring.test.ts` (espera `scriptable://`), `aero-probe-copy.test.ts`,
`aero-integration.test.ts` (URL encoded, nombre fijo, sin iCloud ni receta), `aero-movements-sync.test.ts`
(el URL empieza con `scriptable:///run/Aero32Bridge?`), fixtures e2e sin `shortcutName`,
`aero-shortcut-dialog.spec.ts` reescrito, `admin-integration.spec.ts` y `erp-result-dialogs.spec.ts`.

S17 — Pruebas nuevas obligatorias: builder con ambos valores URL-encoded; ausencia de `shortcuts://` en
`src`; el asset existe, es JSON válido, `name === 'Aero32Bridge'`, el `script` contiene `args.queryParameters`,
`allowInsecureRequest`, `Safari.open`, `Script.complete`, `bodies` y `callback`, y no contiene `password` ni
`Authorization: Basic`; el build copia `dist/Aero32Bridge.scriptable`; todos los caminos que abren el puente
usan el builder de Scriptable; la UI de instalación/importación funciona a 375 px con links accesibles; no se
muestra la receta de acciones ni el enlace iCloud.

S18 — Documentación: `docs/integracion-aero-masas-web.md` (diagrama y apartado del Atajo → Scriptable, con
install/import, deep link, ticket y callback), `docs/integracion-aero32.md` (flujo y sección iOS),
`docs/arquitectura.md`, `docs/verificacion-erp-tablet.md`, `README.md`, `AGENTS.md` («Atajos» → «Scriptable») y
`CHANGELOG.md` bajo `[Unreleased]`.

S19 — El backend no cambia: `/api/integration/aero/bridge-tickets` y `/redeem` quedan igual, sin migración ni
cambios de base.

S20 — Publicación: suites de frontend (node/unit/e2e), typecheck, build, contrato; reconstruir y redesplegar
**solo** la imagen `web` (`docker compose build web` + `up -d web`), sin reiniciar API ni migrar. Verificar
`web` healthy, `/api/health` 200, que `https://trindademasas.duckdns.org/Aero32Bridge.scriptable` sirve el
archivo con el mismo SHA-256 que el de `public/`, que la SPA muestra los dos botones y que no queda
`shortcuts://` en el bundle servido. Push a `main`, CI verde, sin tag ni release.

## Tasks

| ID | RED (test que falla primero) | GREEN (cambio mínimo) | Archivos | Aceptación | Riesgo | Rollback | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | — | Este ODD, solo docs | `odd/tasks/scriptable-bridge-ios.md` | Existe antes de todo código; commit solo docs | Ninguno | `git revert` | pendiente | 0c80a0fd |
| T2 | `aero-integration.test.ts`: el builder devuelve `scriptable:///run/Aero32Bridge?` con ambos valores encoded | Builder nuevo y constante de nombre | `lib/aero-integration.ts`, tests | URL exacta, sin `name` | Ninguno | Revertir commit | pendiente | f020aeb1 |
| T3 | `aero-scriptable-asset.test.ts`: asset válido, nombre, tokens y ausencia de secretos | Fuente JS legible, generador del `.scriptable`, asset en `public/` | `scriptable/Aero32Bridge.js`, `scripts/build-scriptable.mjs`, `public/Aero32Bridge.scriptable`, `package.json`, tests | JSON válido, `name` exacto, tokens presentes, sin secretos | 3 (artefacto nuevo publicado) | Revertir commit | pendiente | 4866ac02 |
| T4 | tests de settings: `shortcutName` ya no existe | Modelo sin `shortcutName`; receta e iCloud eliminados | `lib/aero-integration.ts`, `lib/aero-integration.test.ts` | Datos viejos ignorados; sin receta | 3 (contrato interno) | Revertir commit | pendiente | 5436ab75 |
| T5 | `aero-scriptable-dialog.test.ts`: enlaces de instalación/importación, sin receta | Diálogo renombrado y reescrito | `pages/massas/AeroScriptableDialog.tsx`, borrar `AeroShortcutDialog.tsx` | UI nueva, 375 px, ≥44 px | Ninguno | Revertir commit | pendiente | 5436ab75 |
| T6 | tests de panel: botón Scriptable, importación, textos | Panel y banner | `pages/massas/AeroIntegrationPanel.tsx`, `AeroDeviceBanner.tsx`, tests | Dos botones y textos nuevos | Ninguno | Revertir commit | pendiente | 5436ab75 |
| T7 | tests de llamadores: todos usan el builder nuevo | Ajuste de `MassasLaunchPage`, `aero-mirror`, `ReportsPage`, `ReceiptsSection` | esos archivos, tests | Todos los caminos abren Scriptable | 3 (flujo compartido) | Revertir commit | pendiente | 5436ab75 |
| T8 | paridad ES/PT | i18n | `i18n/locales/es.json`, `pt-BR.json` | Mismas claves, sin receta vieja | Ninguno | Revertir commit | pendiente | 5436ab75 |
| T9 | e2e del diálogo y del panel | specs actualizados | `__e2e__/aero-shortcut-dialog.spec.ts`, `admin-integration.spec.ts`, `erp-result-dialogs.spec.ts` | 375 px, links accesibles, sin receta | Ninguno | Revertir commit | pendiente | af2ec856 |
| T10 | — | Docs y CHANGELOG | `docs/…`, `README.md`, `AGENTS.md`, `CHANGELOG.md` | Scriptable en toda la doc | Ninguno | Revertir commit | pendiente | aee06c68 |
| T11 | — | Suites, typecheck, build, contrato, CI | — | Todo verde | Ninguno | — | 1d689895 | pendiente |
| T12 | — | Imagen `web` y verificación en producción | producción | `web` healthy, asset con hash igual, sin `shortcuts://` | 5 (despliegue) | Volver a la imagen anterior | 1d689895 | pendiente |

## Log

L1 — Pedido del usuario (verbatim):

> Necesito que tomes el frente de Trindade en `/home/wilkin/proyectos/Trindade`, sobre `main`, sin ramas ni worktrees. La app ya no va a usar Atajos en iPhone: vamos a adoptar **Scriptable** para todos los botones que hoy abren el atajo. El usuario ya instaló Scriptable; la idea es que no tenga que crear ni configurar 24 acciones a mano: el script se entrega como `Aero32Bridge.scriptable` y se importa en la app.
>
> Antes de tocar código, creá `odd/tasks/scriptable-bridge-ios.md` y commiteá solo ese documento. Trabajá con TDD estricto: test RED, implementación mínima, GREEN, refactor. Todo a `main`, commits atómicos ≤400 líneas, Conventional Commits, sin Co-Authored-By ni menciones de IA.
>
> ## Objetivo
>
> 1. Crear el script **`Aero32Bridge.scriptable`** completo, listo para importar en Scriptable, sin credenciales.
> 2. Reemplazar **todos** los deep links `shortcuts://` y todos los flujos que abren Atajos por `scriptable:///run/Aero32Bridge?ticket=...&ticketUrl=...`.
> 3. Cambiar la ayuda del módulo **Configuração Integração Empresa** para el camino Scriptable.
> 4. Poner un botón **“Instalar Scriptable no iPhone”** que abra la App Store.
> 5. Poner otro botón **“Importar Aero32Bridge.scriptable”** que descargue/importe el archivo.
> 6. Eliminar la receta vieja de 24 acciones y el enlace iCloud obsoleto.
> 7. Verificar que todos los botones del flujo (test, lanzamiento, lote, sincronización manual, reintento, auto-lectura y Relatório) abran Scriptable.
> 8. Publicar en `main`, CI verde y reconstruir la imagen de producción de `web`.
>
> ## Scriptable: cómo funciona el flujo
>
> La página sigue pidiendo el ticket one-time al backend, exactamente como ahora. Lo único que cambia es el deep link que abre el proceso nativo:
>
> ```text
> scriptable:///run/Aero32Bridge?ticket=<token>&ticketUrl=<url-encoded>
> ```
>
> El script debe:
>
> - Leer `args.queryParameters.ticket` y `args.queryParameters.ticketUrl`.
> - Hacer `POST` a `ticketUrl` con:
>   - `X-Trindade-Ticket: <ticket>`
>   - `Accept: application/json`
>   - sin cuerpo (`Arquivo` vacío en la UI no aplica al script; desde JS no se envía body).
> - Interpretar la respuesta como JSON: el sobre con `url`, `headers`, `body`, `bodies?`, `callback`.
> - Si `bodies` es un array no vacío, recorrerlo; si no, usar `[envelope.body]`.
> - Para cada payload, hacer `POST` a `envelope.url` con:
>   - `headers = envelope.headers` (incluye `Authorization`, `Content-Type`, `Accept`)
>   - `body = payload` (texto JSON ya serializado)
>   - `allowInsecureRequest = true` para poder hablar con el HTTP local de la fábrica.
> - Si es un solo payload, devolver el texto tal cual; si es lote, devolver `[respuesta1,respuesta2,...]`.
> - Abrir `envelope.callback + encodeURIComponent(resultado)` con `Safari.open(...)`.
> - Llamar `Script.complete()`.
> - No registrar ni mostrar `Authorization`, `ticket` ni contraseñas.
> - Si falta el ticket o falla el canje, mostrar un `Alert` breve y terminar; no inventar un callback.
> - Usar `Request` de Scriptable, no `fetch`.
> - Para el ERP local, `allowInsecureRequest = true`; para el canje HTTPS también es inocuo.
> - El script no guarda estado ni credenciales.
>
> El archivo `.scriptable` debe ser JSON válido con esta forma:
>
> ```json
> {
>   "name": "Aero32Bridge",
>   "script": "<código JS>",
>   "icon": { "color": "blue", "glyph": "arrow.triangle.2.circlepath" },
>   "always_run_in_app": true,
>   "share_sheet_inputs": ["text"]
> }
> ```
>
> El nombre del script debe ser exactamente **`Aero32Bridge`**, sin espacio, porque el URL scheme usa ese nombre. El archivo debe llamarse **`Aero32Bridge.scriptable`** y vivir en:
>
> ```text
> packages/frontend/public/Aero32Bridge.scriptable
> ```
>
> Vite lo copia a `dist/Aero32Bridge.scriptable`. Verificá que el build lo incluya. El script debe ser legible y no contener secretos.
>
> ## Cambios en la web
>
> - En `packages/frontend/src/lib/aero-integration.ts`:
>   - Reemplazá `buildAeroBridgeTriggerUrl` para devolver el deep link de Scriptable, con `ticket` y `ticketUrl` URL-encoded.
>   - Eliminá `aeroShortcutTriggerUrl` si queda sin uso.
>   - Eliminá `AERO_SHORTCUT_ICLOUD_URL`, `AERO_DEFAULT_BRIDGE_SHORTCUT_NAME`, `AERO_DEFAULT_SHORTCUT_NAME`, `aeroBridgeShortcutRecipe` y toda la receta de acciones si quedan sin uso.
>   - Fijá el nombre `Aero32Bridge` como constante de integración. No debe ser editable por el usuario.
>   - Quitá `shortcutName` de `AeroSettings`, `DEFAULT_AERO_SETTINGS`, `loadAeroSettings` y `saveAeroSettings`; los datos viejos de localStorage se ignoran. No migres un nombre viejo a Scriptable: el nombre es fijo.
> - En todos los llamadores:
>   - `AeroIntegrationPanel.handleTest`
>   - `MassasLaunchPage.triggerAeroSync`, `handleSyncFromErp`, reintentos y auto-lectura
>   - `aero-mirror.triggerAeroMovementsSync`
>   - `ReportsPage` / `ReceiptsSection` cuando disparen movimientos
>   - cualquier otro `buildAeroBridgeTriggerUrl`
>   - Deben usar el nuevo builder sin `name`; el nombre va fijo dentro.
> - En `packages/frontend/src/pages/massas/AeroShortcutDialog.tsx`:
>   - Renombralo a `AeroScriptableDialog.tsx` (o dejá el archivo pero cambiá toda la UI; mejor renombrar para que no quede “shortcut” muerto).
>   - Quitá la receta de 23 acciones, los copy buttons, los bloques A/B/C/D y el enlace iCloud.
>   - Mostrá el camino nuevo:
>     1. **Instalar Scriptable no iPhone** → App Store.
>     2. **Importar Aero32Bridge.scriptable** → descarga del asset.
>     3. Volver a Trindade; los botones abren Scriptable automáticamente.
>   - Explicá que después de descargar el archivo hay que tocarlo y elegir **Compartir → Scriptable**; el script aparece como `Aero32Bridge`.
>   - Botón **Abrir Scriptable** con `scriptable://` (sin ejecutar el script).
>   - El diálogo debe ser usable a 375 px, targets ≥44 px y sin scroll horizontal.
>   - No mostrar contraseña, `Authorization` ni la receta de 24 acciones.
> - En `AeroIntegrationPanel`:
>   - Cambiar el botón **“Instalar Atalho no iPhone”** por **“Instalar Scriptable no iPhone”**, como enlace a App Store.
>   - Agregar **“Importar Aero32Bridge.scriptable”**, como enlace de descarga al asset.
>   - Mantener un botón de ayuda/instrucciones que abra el diálogo.
>   - Ajustar los textos de “Probar conexión”, “Sincronizar”, “Abriendo el atajo”, “Enviado al Atajo”, etc. a Scriptable.
>   - El panel debe explicar que Scriptable es la app nativa que habla con la red de la fábrica y que la contraseña sigue en el cofre del servidor.
> - En `AeroDeviceBanner` y i18n:
>   - “iPhone con Atajos” → “iPhone con Scriptable”.
>   - `aeroDevice.body` y cualquier texto “Atajos/Atalho” → “Scriptable”.
> - En i18n ES/PT:
>   - Actualizar todas las cadenas del flujo: `shortcutTitle`, `shortcutIntro`, `shortcutName`, `shortcutIcloud*`, `shortcutStep*`, `shortcutOpenApp`, `testShortcutOpening`, `syncSent`, `syncConfirmHint`, `deviceLocked`, `aeroDevice.body`, etc.
>   - Eliminar las claves de la receta vieja que ya no se usan.
>   - Mantener paridad ES/PT.
> - En `AeroShortcutDialog` y tests:
>   - Eliminar `aero-shortcut-copy.test.ts` si ya no aplica, o reemplazarlo por un test de los enlaces de instalación/importación.
>   - Actualizar `aero-bridge-wiring.test.ts` para que espere `scriptable://` y no `shortcuts://`.
>   - Actualizar `aero-probe-copy.test.ts`.
>   - Actualizar `aero-integration.test.ts`: tests de URL de Scriptable encoded, nombre fijo, sin `AERO_SHORTCUT_ICLOUD_URL` ni receta.
>   - Actualizar `aero-movements-sync.test.ts`: el URL de lanzamiento empieza con `scriptable:///run/Aero32Bridge?`.
>   - Actualizar fixtures e2e que usan `shortcutName`.
>   - `aero-shortcut-dialog.spec.ts`: reescribir para instalar/importar Scriptable; verificar App Store href, archivo `.scriptable` href, `scriptable://` open link, 375 px, targets ≥44 px, sin receta de 23/24 acciones.
>   - `admin-integration.spec.ts`: botón “Instalar Scriptable no iPhone”.
>   - `erp-result-dialogs.spec.ts`: comentarios/URLs de Atajos a Scriptable.
> - Tests obligatorios nuevos:
>   - `buildAeroBridgeTriggerUrl` devuelve `scriptable:///run/Aero32Bridge?ticket=...&ticketUrl=...` con ambos valores URL-encoded.
>   - No queda `shortcuts://` en `packages/frontend/src` ni en textos de UI.
>   - El asset `public/Aero32Bridge.scriptable` existe, es JSON válido, `name === 'Aero32Bridge'`, el `script` contiene `args.queryParameters`, `allowInsecureRequest`, `Safari.open`, `Script.complete`, `bodies`, `callback`, y no contiene `password` ni `Authorization: Basic`.
>   - El build de frontend copia `dist/Aero32Bridge.scriptable`.
>   - Todos los caminos que abren el bridge usan el builder de Scriptable: panel/test, lanzamiento, lote, sincronización manual, reintento, auto-lectura y Relatório.
>   - La UI de instalación/importación funciona a 375 px y los links son accesibles.
>   - No se muestra la receta de 24 acciones ni el enlace iCloud obsoleto.
> - Documentación:
>   - `docs/integracion-aero-masas-web.md`: reemplazar el diagrama y el apartado del Atajo por Scriptable; explicar install/import, deep link, ticket y callback.
>   - `docs/integracion-aero32.md`: tabla de flujo y sección de iOS con Scriptable.
>   - `docs/arquitectura.md`, `docs/verificacion-erp-tablet.md`, `README.md`, `AGENTS.md`: “Atajos” → “Scriptable”.
>   - `CHANGELOG.md`: `[Unreleased]` con el cambio; no crear tag.
> - No cambies el backend: los endpoints `/api/integration/aero/bridge-tickets` y `/redeem` ya existen y deben seguir igual. No agregues migración ni toques la base.
>
> ## Publicación
>
> - No crees tag ni GitHub Release: el workflow Android se dispara con `v*` y este cambio es web/iPhone.
> - Corré las suites afectadas y el gate que corresponda: backend no cambia, pero frontend node/unit/e2e, typecheck, build, contrato y e2e de 375 px.
> - Reconstruí la imagen `web` y redesplegala en producción:
>   ```bash
>   docker compose build web
>   docker compose up -d web
>   ```
>   No hace falta reiniciar API ni migrar base.
> - Verificá:
>   - `docker compose ps` con `web` healthy;
>   - `/api/health` 200;
>   - `https://trindademasas.duckdns.org/Aero32Bridge.scriptable` devuelve el archivo y su contenido es JSON válido;
>   - el SHA-256 del asset servido coincide con `packages/frontend/public/Aero32Bridge.scriptable`;
>   - la SPA incluye “Instalar Scriptable no iPhone” y “Importar Aero32Bridge.scriptable”;
>   - no queda `shortcuts://` en el bundle servido.
> - Push a `main`; CI verde. No tag/release.
> - Dejá el panel de Herdr abierto; no cierres sesión, pestaña ni pane.
>
> ## Cierre que necesito
>
> Reportá:
> 1. Commits en `main`, tests y CI.
> 2. Confirmación de que producción sirve la imagen nueva y el `.scriptable` con su hash.
> 3. Lista de todos los puntos que ahora abren Scriptable.
> 4. Qué quedó pendiente de probar en el iPhone real (instalar/importar y ejecutar una sincronización), con pasos exactos.
> 5. Cualquier riesgo o diferencia de comportamiento.
>
> Si encontrás una contradicción, un test que no puede pasar o un riesgo irreversible, detenete y reportá antes de inventar. No dejes el frente a medias.

L2 — Estado del que se parte, leído y no supuesto. El puente de hoy ya no construye sobres en el navegador: pide
un ticket one-time al backend y abre el proceso nativo con `{ticket, ticketUrl}`. Eso significa que **este cambio
no toca el backend ni la seguridad**: el cofre, el ticket, el TTL, el canje y el hash quedan exactamente igual y
Scriptable ocupa el lugar del Atajo como único proceso que habla con la LAN. La diferencia es que el script es un
archivo que se importa una vez, no 23 acciones que se arman a mano.

L3 — Decisión de empaquetado. El `.scriptable` es JSON con el JS dentro de un string, y un JSON escapado no se
lee. Por eso la fuente vive legible en `packages/frontend/scriptable/Aero32Bridge.js` y un generador determinista
produce `public/Aero32Bridge.scriptable`; una prueba compara el asset commiteado contra la fuente para que no
derive. Vite copia `public/` tal cual a `dist/`, así que el archivo servido es el commiteado.

L4 — Riesgo y alcance. No hay migración, ni cambio de contrato, ni de esquema. El riesgo real es de **entrega**:
publicar un asset que no se importe o un deep link mal formado dejaría a los botones sin efecto, y por eso las
pruebas fijan el nombre exacto, el encoding de los dos parámetros, la presencia del archivo en `dist/` y la
ausencia de `shortcuts://` en el bundle servido. El rollback es la imagen anterior de `web`; el backend no se
toca.

L5 — Cierre medido. Frontend `test:node` 589/589, `test:unit` 132/132, `tsc --noEmit` limpio, `npm run build` con
el asset copiado a `dist/` y **cero** `shortcuts://` en el bundle; E2E **116/116**. Producción: imagen `web`
reconstruida y recreada, `web` healthy, `/api/health` 200, `https://trindademasas.duckdns.org/Aero32Bridge.scriptable`
devuelve JSON válido con `name = Aero32Bridge` y el SHA-256 idéntico al de `public/`
(`09244c98…b4c9`), el bundle servido contiene «Instalar Scriptable no iPhone», «Importar Aero32Bridge.scriptable» y
`scriptable:///run/Aero32Bridge`, y no contiene `shortcuts://`. El API no se reinició ni se migró: el backend no
cambió.
