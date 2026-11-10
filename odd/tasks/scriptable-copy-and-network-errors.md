# Instalación por copia y errores de red del puente Scriptable

Remediación sobre la entrega de Scriptable ya publicada: el `.scriptable` no se importó en el iPhone y el script
se quedaba esperando cuando el ERP no era alcanzable. Sin cambios de backend, esquema ni Android.

## Specs

S1 — Límite técnico aceptado: **no se puede leer el SSID** desde Safari ni desde Scriptable. iOS solo entrega el
nombre de la red a apps nativas con permiso de ubicación precisa y entitlement de Wi-Fi, y Scriptable no expone esa
API. La validación real es «el host del ERP responde o no responde», y el mensaje al usuario dice que el iPhone no
está en la red de la empresa **o** que el ERP no está disponible. No se promete comprobar el SSID exacto.

S2 — Instalación por copia. La UI deja de ofrecer la descarga del `.scriptable`. El camino es: instalar Scriptable
→ **Copiar código para Scriptable** → abrir Scriptable → **+** → pegar → renombrar el script a `Aero32Bridge` →
volver a Trindade. El `.scriptable` puede quedar como artefacto interno, pero ningún botón lo usa.

S3 — `packages/frontend/public/Aero32Bridge.js` es el JavaScript **crudo**, byte a byte igual a
`packages/frontend/scriptable/Aero32Bridge.js`: sin JSON, sin escapado, empieza con `// Puente Aero32` y no contiene
`"name":` ni `"script":`. `scripts/build-scriptable.mjs` lo copia de forma determinista junto al `.scriptable`; no
se duplica la fuente a mano.

S4 — `AERO_SCRIPTABLE_CODE_PATH = '/Aero32Bridge.js'` es la ruta que usa la UI. Un test fija que el asset crudo y
el `script` embebido en el `.scriptable` son idénticos.

S5 — `AeroScriptableDialog`: paso 1 «Instalar Scriptable no iPhone» (App Store); paso 2 «Copiar código para
Scriptable», con el texto de los cinco pasos de S2; sigue «Abrir Scriptable» (`scriptable://`) y «Cerrar». Ya no
dice «descargar el archivo», «Compartir → Scriptable» ni ofrece link de descarga. Targets ≥44 px, una columna a
375 px, sin scroll horizontal.

S6 — El botón copia el **JS crudo**, no el JSON. El código se carga al abrir el diálogo (fetch del asset), de modo
que el click no depende de un fetch asíncrono; usa `navigator.clipboard.writeText` y un fallback con
`textarea`/`document.execCommand` para Safari. Muestra «Copiado» y un error accionable si no se pudo copiar.

S7 — `AeroIntegrationPanel`: la acción de importar `.scriptable` se reemplaza por «Copiar código para Scriptable» o
un botón que abre el diálogo nuevo; no queda ningún botón de descarga. «Instalar Scriptable no iPhone» sigue
apuntando a la App Store y la ayuda explica el camino de copiar y pegar.

S8 — El script pone `timeoutInterval` explícito (8–10 s) en el canje y en **cada** POST al ERP. Sin timeout propio,
una red que no responde deja la pantalla «enviando» hasta que iOS decide.

S9 — Alcance del ERP: si el **primer** POST falla por red o timeout, el script no intenta los demás `bodies` (no
tiene sentido esperar 8 × 10 s), devuelve un callback de error explícito
`...&aero_error=wifi_required&aero_msg=<mensaje codificado>` sobre `sobre.callback`, y termina. Un error **HTTP** del
ERP no es un error de red: conserva el comportamiento actual de devolver la respuesta.

S10 — Mensaje de usuario: «No se pudo alcanzar el ERP. Verificá que el iPhone esté en la Wi-Fi Trindade Expedicao y
que la red de la fábrica esté disponible.» El código `wifi_required` es estable y la web traduce el mensaje.

S11 — Si falla el canje del ticket (sin internet), el script muestra un `Alert` corto y termina; no inventa
callback. Sin ticket, el mensaje actual sigue siendo correcto. El script no registra ticket, `Authorization` ni
cuerpos, y no guarda estado.

S12 — `parseAeroCallback` devuelve un caso explícito `{ kind: 'error'; code: string; message: string | null }`.
Parsea `aero_error` y `aero_msg` **antes** de `aero_action`, para no interpretar el error como un bridge válido, y
la query se limpia con `replaceState` como ya se hace.

S13 — `MassasLaunchPage`: ante un callback de error de red muestra el aviso con el mensaje de Wi-Fi/ERP y **no borra
la cola ni marca nada como enviado**; limpia el intento pendiente para que un refresh no lo repita.

S14 — `AeroIntegrationPanel`: si el test vuelve con `wifi_required`, muestra el mensaje y resetea `busy`; no lo
trata como credencial inválida.

S15 — `ReceiptsSection`/`ReportsPage`: el callback de movimientos también lee `aero_error`, muestra el aviso y no
deja el botón «Sincronizar» bloqueado; si vuelve error de red no incrementa el espejo ni muestra un día vacío.

S16 — Antes de abrir Scriptable, si `navigator.onLine === false` se muestra «Sin conexión a internet» y **no se abre
la app**. Aplica a `triggerAeroSync`, `handleSyncFromErp`, `triggerAeroMovementsSync` y el test del panel.

S17 — Watchdog: antes de navegar se guarda una marca local con `{action, date, at}`; se limpia al recibir cualquier
callback. En mount/visibility de las pantallas que lanzan el puente, si la marca supera 120–180 s se muestra
«Scriptable no volvió; revisá la Wi-Fi de la empresa y reintentá», se resetea el estado de envío y la marca se
limpia. La marca es por fecha/action y no dispara si el usuario vuelve rápido.

S18 — i18n ES/PT con paridad exacta: mensaje de Wi-Fi/ERP, sin conexión, Scriptable sin respuesta y copia de
código.

S19 — Pruebas: el diálogo no contiene `download`, `AERO_SCRIPTABLE_ASSET_PATH` ni «Importar Aero32Bridge.scriptable»;
el asset `/Aero32Bridge.js` existe, es JS crudo y no es JSON; el botón copia exactamente el source y se prueba el
fallback; el texto incluye `Aero32Bridge` y los pasos de Scriptable; el build copia ambos assets; `parseAeroCallback`
devuelve `kind:'error'` con code y mensaje; la página de Masas conserva la cola; el panel resetea el test;
Receipts/Reports muestran el error sin tocar el espejo; `navigator.onLine=false` no abre; el watchdog expira y un
callback lo limpia; el asset del script tiene timeout y `aero_error` y no secretos; E2E a 375 px del diálogo nuevo y
del aviso de error.

S20 — Documentación y publicación: `docs/integracion-aero-masas-web.md` y `docs/integracion-aero32.md` con la
instalación por copia, los pasos exactos, la validación de red sin SSID, el callback `wifi_required` y el watchdog;
`README.md`, `AGENTS.md`, `CHANGELOG.md` bajo `[Unreleased]` y la ayuda del módulo. Reconstruir y redesplegar **solo**
`web`; verificar `web` healthy, `/api/health` 200, `/Aero32Bridge.js` con JS crudo y hash igual al de `public/`,
`/Aero32Bridge.scriptable` disponible como artefacto interno, el bundle con «Copiar código», `Aero32Bridge` y
`aero_error`/`wifi_required`, y sin descarga del `.scriptable` como instalación. CI verde, push a `main`, sin tag ni
release.

## Tasks

| ID | RED (test que falla primero) | GREEN (cambio mínimo) | Archivos | Aceptación | Riesgo | Rollback | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | — | Este ODD, solo docs | `odd/tasks/scriptable-copy-and-network-errors.md` | Existe antes de todo código | Ninguno | `git revert` | pendiente | 9adaab11 |
| T2 | test del asset crudo: existe, empieza con `// Puente Aero32`, no es JSON, coincide con el `script` del `.scriptable` | generador copia `public/Aero32Bridge.js` | `scriptable/Aero32Bridge.js`, `scripts/build-scriptable.mjs`, `public/Aero32Bridge.js`, `src/lib/aero-scriptable-asset.test.ts` | Ambos assets deterministas y coherentes | Ninguno | Revertir commit | pendiente | f9d42e55 |
| T3 | test del script: timeouts, `aero_error`, no sigue el lote tras fallo de red | timeouts y callback de error | `scriptable/Aero32Bridge.js`, `public/Aero32Bridge.js`, `public/Aero32Bridge.scriptable`, tests | Fallo de red devuelve `wifi_required` y no reintenta 8 veces | 3 (artefacto publicado) | Revertir commit | pendiente | f9d42e55 |
| T4 | test de `parseAeroCallback`: `kind:'error'` antes de `aero_action` | parser y constante de ruta cruda | `lib/aero-integration.ts`, `lib/aero-integration.test.ts` | Error parseado con code/mensaje | 3 (contrato interno) | Revertir commit | pendiente | cca39ab2 |
| T5 | test del watchdog: marca, expiración y limpieza | módulo de marca y temporizador | `lib/aero-watchdog.ts`, `lib/aero-watchdog.test.ts` | Expira a los 150 s y un callback la limpia | Ninguno | Revertir commit | pendiente | cca39ab2 |
| T6 | test del diálogo: sin descarga, copia exacta y fallback | diálogo reescrito | `pages/massas/AeroScriptableDialog.tsx`, `aero-scriptable-install.test.ts` | Copia JS crudo, estado Copiado, error accionable | Ninguno | Revertir commit | pendiente | 2041cacf |
| T7 | tests de panel y llamadores: sin descarga, `onLine`, watchdog y error | panel, Masas, mirror, Reports, Receipts | `AeroIntegrationPanel.tsx`, `MassasLaunchPage.tsx`, `lib/aero-mirror.ts`, `ReportsPage.tsx`, `ReceiptsSection.tsx`, tests | Ningún camino queda bloqueado ni borra la cola | 3 (flujo compartido) | Revertir commit | pendiente | 4a95bed8 |
| T8 | paridad ES/PT | i18n | `i18n/locales/es.json`, `pt-BR.json` | Mismas claves, textos nuevos | Ninguno | Revertir commit | pendiente | 2041cacf |
| T9 | e2e: diálogo nuevo y aviso de error a 375 px | specs | `__e2e__/aero-scriptable-dialog.spec.ts`, aviso de error | Copia, sin descarga, aviso visible | Ninguno | Revertir commit | pendiente | 7efbc53d |
| T10 | — | Docs y CHANGELOG | `docs/…`, `README.md`, `AGENTS.md`, `CHANGELOG.md` | Instalación por copia y red documentadas | Ninguno | Revertir commit | pendiente | d14d8909 |
| T11 | — | Suites, typecheck, build, contrato, E2E | — | Todo verde | Ninguno | — | pendiente | pendiente |
| T12 | — | Imagen `web` y verificación en producción | producción | `web` healthy, `/Aero32Bridge.js` con hash, UI nueva | 5 (despliegue) | Volver a la imagen anterior | pendiente | pendiente |

## Log

L1 — Pedido del usuario (verbatim):

> Necesito que tomes el frente de Trindade en `/home/wilkin/proyectos/Trindade`, sobre `main`, sin ramas ni worktrees. Vamos a hacer una remediación sobre la entrega de Scriptable ya publicada. El usuario reporta dos problemas reales:
>
> 1. Importar el `.scriptable` desde la web no le funcionó; terminó copiando el JSON en el editor y Scriptable falló con `SyntaxError: Unexpected token ':'`. La instalación desde la web debe cambiar: en vez de descargar el `.scriptable`, la web debe ofrecer un botón que **copie el código JavaScript crudo** y explique crear un script nuevo, pegarlo y renombrarlo a `Aero32Bridge`.
> 2. Cuando el iPhone no está en la Wi-Fi de la empresa (o el ERP no responde), el script se queda intentando y la web termina sin un mensaje útil. Hay que detectar el fallo de alcance del ERP, no exactamente el SSID, y devolver un error claro a la web, sin bloquear ni dejar la pantalla “enviando”.
>
> Antes de tocar código, creá el ODD `odd/tasks/scriptable-copy-and-network-errors.md` y commiteá solo ese documento. Trabajá con TDD estricto: RED, implementación mínima, GREEN y refactor. Todo a `main`, commits atómicos ≤400 líneas, Conventional Commits, sin Co-Authored-By ni menciones de IA.
>
> ## Límite técnico que debés respetar
>
> No podemos leer el SSID `Trindade Expedicao` desde Safari ni desde Scriptable. iOS solo entrega el SSID a apps nativas con permiso de ubicación precisa y entitlement de Wi-Fi; Scriptable no expone esa API. Por eso la validación real es: **el host del ERP responde o no responde**. Si no responde, el mensaje correcto es que el iPhone no está en la red de la empresa o el ERP no está disponible. No prometas una comprobación del nombre exacto del SSID.
>
> ## 1. Instalación desde la web: copiar el código, no descargar el `.scriptable`
>
> - Mantené `Aero32Bridge.scriptable` como artefacto interno si hace falta para compatibilidad, pero **quitá de la UI el botón de descarga/importación**.
> - Generá también un asset público con el **JavaScript crudo**, por ejemplo:
>   ```text
>   packages/frontend/public/Aero32Bridge.js
>   ```
>   Debe ser exactamente el contenido de `packages/frontend/scriptable/Aero32Bridge.js` (mismo texto, sin JSON ni escapado). Extendé `packages/frontend/scripts/build-scriptable.mjs` para copiarlo de forma determinista junto al `.scriptable`; el build no debe duplicar fuentes a mano.
> - Agregá una constante `AERO_SCRIPTABLE_CODE_PATH = '/Aero32Bridge.js'` y un test que asegure que el asset crudo y el `script` del `.scriptable` son idénticos.
> - En `AeroScriptableDialog`:
>   - Paso 1: **Instalar Scriptable no iPhone** → App Store (`https://apps.apple.com/app/scriptable/id1405459188`).
>   - Paso 2: **Copiar código para Scriptable**.
>   - El texto debe explicar: tocar Copiar → abrir Scriptable → **+** → pegar → renombrar el script a **`Aero32Bridge`** → volver a Trindade.
>   - Ya no debe decir “descargar el archivo”, “Compartir → Scriptable” ni ofrecer un link de descarga.
>   - El botón debe copiar el **JS crudo**, no el JSON. Cargá el código al abrir el diálogo (fetch del asset o import raw) para que el click no dependa de un fetch asíncrono; usá `navigator.clipboard.writeText` y un fallback con `textarea`/`document.execCommand` para Safari.
>   - Mostrá estado “Copiado” y un error accionable si no se pudo copiar.
>   - Mantené `Abrir Scriptable` (`scriptable://`) y `Cerrar`; targets ≥44 px, una columna a 375 px, sin scroll horizontal.
> - En `AeroIntegrationPanel`:
>   - Reemplazá la tarjeta/acción de importar `.scriptable` por **Copiar código para Scriptable** o un botón que abra el diálogo nuevo. No debe quedar un botón de descarga.
>   - Mantené **Instalar Scriptable no iPhone** apuntando a la App Store.
>   - Ajustá el texto de ayuda para el nuevo camino de copiar y pegar.
> - Tests:
>   - El diálogo ya no contiene `download`, `AERO_SCRIPTABLE_ASSET_PATH` ni “Importar Aero32Bridge.scriptable”.
>   - El asset `/Aero32Bridge.js` existe, es JS crudo, empieza con el comentario `// Puente Aero32` y no contiene `"name":` ni `"script":`.
>   - El botón copia exactamente el source; probá el fallback de clipboard.
>   - El texto de instrucciones incluye el nombre `Aero32Bridge` y los pasos de Scriptable.
>   - Build copia ambos assets (`Aero32Bridge.js` y `.scriptable`).
>
> ## 2. Error de Wi-Fi/ERP en el script
>
> El flujo actual: el canje del ticket va por HTTPS y puede funcionar sin la Wi-Fi de la planta; el problema aparece en el POST al ERP local. Hoy no hay timeout propio, se intenta cada `body` y se devuelve un mensaje crudo. Hay que evitar que la pantalla quede “enviando” y que el usuario reciba un error genérico.
>
> - En `packages/frontend/scriptable/Aero32Bridge.js`:
>   - Poner `timeoutInterval` explícito en el canje y en cada POST al ERP (por ejemplo 8–10 s).
>   - Antes de enviar el primer `body`, o al fallar el primer POST, comprobar alcance del host del ERP:
>     - Un error de red/timeout se considera “ERP no alcanzable”.
>     - Un error HTTP del ERP no es un error de Wi-Fi; conservá el comportamiento actual para respuestas del ERP.
>     - No continúes con los demás `bodies` si el primero falla por red; no tiene sentido esperar 8 × 10 s.
>   - Devolver un callback de error explícito, por ejemplo:
>     ```text
>     ...&aero_error=wifi_required&aero_msg=<mensaje codificado>
>     ```
>     Usá `sobre.callback` (ya incluye `aero_action` y `aero_data=`). El código debe ser estable y la web traduce el mensaje.
>   - Mensaje de usuario: “No se pudo alcanzar el ERP. Verificá que el iPhone esté en la Wi-Fi Trindade Expedicao y que la red de la fábrica esté disponible.”
>   - Si falla el canje del ticket (sin internet), mostrá un Alert corto y terminá; no inventes callback.
>   - No loguees ticket, Authorization ni cuerpos; no guardes estado.
>   - Si el script se ejecuta sin ticket, el mensaje actual sigue siendo correcto.
> - No cambies el contrato del backend ni los endpoints de tickets.
>
> ## 3. Error visible en la web
>
> - Extendé `AeroCallbackResult`/`parseAeroCallback` con un caso explícito:
>   ```ts
>   { kind: 'error'; code: string; message: string | null }
>   ```
>   Parseá `aero_error` y `aero_msg` antes de `aero_action`, y limpiá la query con `replaceState` como ya se hace.
> - En `MassasLaunchPage`:
>   - Si el callback es un error de red, mostrá un `AeroResultDialog`/aviso con el mensaje de Wi-Fi/ERP y **no borres la cola ni los lanzamientos pendientes**. No marques nada como enviado.
>   - Limpiá el intento pendiente para que un refresh no lo replayed.
> - En `AeroIntegrationPanel`:
>   - Si el test vuelve con `wifi_required`, mostrá el mensaje y reseteá `busy`; no lo trates como credencial inválida.
> - En `ReceiptsSection`/`ReportsPage`:
>   - El callback de movimientos también debe leer `aero_error` y mostrar el aviso; el botón “Sincronizar” no debe quedar bloqueado.
>   - Si la sincronización desde Relatório vuelve con error de red, no incrementes el espejo ni muestres un día vacío.
> - En los disparadores (`triggerAeroSync`, `handleSyncFromErp`, `triggerAeroMovementsSync`, test del panel):
>   - Antes de abrir Scriptable, si `navigator.onLine === false`, mostrá un mensaje “Sin conexión a internet” y no abras la app.
>   - Agregá un **watchdog** para el caso en que Scriptable no vuelva con ningún callback:
>     - Guardá una marca local con timestamp/action/date antes de navegar.
>     - Limpiala al recibir cualquier callback.
>     - En mount/visibility de las pantallas que lanzan el puente, si la marca supera ~120–180 s, mostrá “Scriptable no volvió; revisá la Wi-Fi de la empresa y reintentá” y reseteá el estado de envío.
>     - La marca debe ser por fecha/action y no debe disparar sola si el usuario vuelve rápido.
> - i18n ES/PT:
>   - Mensaje de Wi-Fi/ERP, sin conexión, Scriptable sin respuesta y copia de código.
>   - Paridad exacta de claves.
> - Tests:
>   - `parseAeroCallback` devuelve `kind:'error'` con code/mensaje y no interpreta el error como un bridge válido.
>   - La página de Masas conserva la cola y muestra el mensaje.
>   - El panel resetea el test.
>   - Receipts/Reports muestran el error y no actualizan el espejo.
>   - `navigator.onLine=false` no abre Scriptable.
>   - Watchdog expira y limpia la marca; un callback la limpia antes.
>   - El asset del script tiene timeout y `aero_error`; no contiene secretos.
>   - E2E de 375 px para el diálogo nuevo y para el aviso de error.
>
> ## 4. Documentación y publicación
>
> - Actualizá `docs/integracion-aero-masas-web.md` y `docs/integracion-aero32.md`:
>   - Instalación por **Copiar código** (no descarga/importación).
>   - Pasos exactos: instalar Scriptable → copiar código → nuevo script → pegar → renombrar `Aero32Bridge`.
>   - Validación de red: no se puede leer el SSID; se prueba el host del ERP; mensaje al usuario.
>   - Watchdog y callback `wifi_required`.
> - Actualizá `README.md`, `AGENTS.md`, `CHANGELOG.md` `[Unreleased]` y la ayuda del módulo.
> - No crees tag ni GitHub Release. Todo a `main`.
> - Reconstruí y desplegá solo `web`:
>   ```bash
>   docker compose build web
>   docker compose up -d web
>   ```
>   No toques API ni base.
> - Verificá:
>   - `web` healthy y `/api/health` 200;
>   - `/Aero32Bridge.js` servido con JS crudo (no JSON) y hash igual a `packages/frontend/public/Aero32Bridge.js`;
>   - `/Aero32Bridge.scriptable` sigue disponible como artefacto interno, si se conserva;
>   - el bundle servido contiene “Copiar código”, “Aero32Bridge” y `aero_error`/`wifi_required`; no contiene descarga del `.scriptable` como instalación;
>   - no queda `Importar Aero32Bridge.scriptable` en la UI.
> - CI final verde y push a `main`. Sin tag/release. Dejá Herdr abierto.
>
> ## Cierre que necesito
>
> Reportá:
> 1. Commits, tests, CI.
> 2. Confirmación de que el asset crudo y el `.scriptable` interno coinciden.
> 3. Producción: web healthy, `/Aero32Bridge.js` con hash, UI nueva de copiar código.
> 4. Cómo queda el mensaje cuando no hay Wi-Fi/ERP y cómo se evita que la UI quede bloqueada.
> 5. Pendiente real en iPhone: copiar el código, crear el script, pegar, renombrar `Aero32Bridge` y probar sin/ con Wi-Fi.
>
> Si encontrás una contradicción, un test que no puede pasar o un riesgo irreversible, detenete y reportá antes de inventar. No dejes el frente a medias.

L2 — Evidencia del defecto. El asset publicado es JSON: abrir `Aero32Bridge.scriptable` en el editor y pegarlo en
Scriptable entrega el objeto entero, y el parser muere en el primer `:` de `"name"`, exactamente el
`SyntaxError: Unexpected token ':'` reportado. El arreglo no es explicar mejor la importación: es entregar el texto
que Scriptable ejecuta. En la red, el script no fija `timeoutInterval`, así que la primera petición al host de la
fábrica la corta iOS cuando quiere; un lote de ocho espera ese plazo ocho veces y la página vuelve sin veredicto.

L3 — Decisión de detección. No se comprueba el SSID: se intenta el ERP y se clasifica el fallo. Error de red o
timeout en el primer POST ⇒ `aero_error=wifi_required`; respuesta HTTP del ERP (incluido 4xx/5xx) ⇒ se devuelve tal
cual, porque el ERP contestó y el problema es otro. La marca del watchdog es la red de seguridad para el caso en que
Scriptable no vuelva a llamar.

L4 — Riesgo. El nuevo callback de error debe limpiarse igual que los demás: si la página no quita la query, un
refresh reabre el aviso; si borra la cola, se pierde trabajo del operador. Las pruebas fijan las dos cosas. El resto
del riesgo es de entrega: el asset crudo tiene que ser byte a byte el mismo texto que el `.scriptable` embebe, y el
build lo verifica.
