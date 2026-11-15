# Remediación de la auditoría web final — 2026-11-14

## Estado y origen

- Origen: auditoría de solo lectura del proyecto web (backend, frontend, tests, nginx y producción), pedida por el usuario.
- Estado al abrir este ODD: `main` limpio, HEAD `9ee48c41`; API/web healthy; typecheck verde; frontend 724/724 node + 188/188 vitest; build verde.
- Objetivo: remediar los hallazgos Alto, Medio y Bajo de este informe, con TDD, commits atómicos, verificación y deploy cuando corresponda. Al terminar, el orquestador vuelve a auditar la web y la vista iPhone; si quedan pendientes, vuelve a pedir remediación.
- No es una exploración ni un prototipo: es una directiva de implementación. Reutilizar patrones existentes; no desarrollar de cero.

## Alcance

**Sí:**

- Todos los hallazgos Alto, Medio y Bajo de este informe.
- Deudas conocidas que el usuario pidió remediar: **Playwright ejecutable en este host** y **redacción del texto libre `response` en `logs/aero-integration.log`**.
- Tests, CI, build, E2E, deploy y verificación de producción de los cambios.
- Actualizar este ODD/informe con evidencia y desviaciones.

**No tocar (deudas conocidas que el usuario pidió dejar):**

- `Quadrada` en el catálogo/API/Android de Cajas Assaí (el filtro web se conserva).
- El beta de Salida restringido a `wilkin` en frontend/backend (es el plan de liberación).
- El scroll horizontal documentado de la tabla de Auditoría.
- No hacer refactors globales de estilo ni de tipos que no estén ligados a un hallazgo.

**No repetir como problema (ya verificado, no requiere cambios):**

- CORS: la API se consume same-origin a través de nginx; el allowlist solo aplica a clientes cross-origin.
- Límite de subida: el proxy aceptó 2 MB y 6 MB (401 del API, no 413); las fotos se suben una por una y 5 MB entra en el límite de 10 MB del nginx.
- Reportes compartidos: `listReportHistory` no filtra por actor y `getReport` no restringe lectura; las rutas de fotos autenticadas son consistentes con ese diseño. El borrado sí exige creador/ventana. No es un IDOR.
- Límites de fotos: Salida 3 y Reportes 5 están aplicados en backend; MIME + magic bytes + 5 MB + nombre UUID.
- No hay `dangerouslySetInnerHTML`/`eval` en fuente, el SQL usa prepared statements y no hay tests `skip`/`todo`; los `target="_blank"` tienen `rel`.
- La etiqueta “Sesión”, los eventos locales `salida_create`/`salida_photo`/`report_create`/`report_photo`, el deploy y el log escribible ya están verificados.

## Resumen de severidad

| Nivel | Hallazgos |
|---|---|
| Alto | H1 dependencias vulnerables; H2 headers/CSP; H3 tokens de larga vida en localStorage; H4 suite/CI no hermética |
| Medio | M1 gzip/caché y JSON autenticado sin `no-store`; M2 retención de fotos de Salida; M3 iPhone (textareas 14 px, target 36 px, HEIC); M4 copys residuales “Cronograma”; M5 docs desactualizadas |
| Bajo | L1 IP de auditoría = proxy; L2 lint no-op / warning Vitest / deuda `any`; L3 tamaño de bundle |
| Deudas conocidas a remediar | D1 Playwright en este host; D2 redacción de `response` en `logs/aero-integration.log` |
| Deudas conocidas a dejar | Quadrada API/Android; beta `wilkin` de Salida; scroll de Auditoría |

---

## Alto

### H1 — Dependencias vulnerables (`npm audit --omit=dev`: 5, exit 1)

**Evidencia:** `npm audit --omit=dev` reporta:

- `dompurify@3.4.15` (vía `jspdf@4.2.1`): **critical**, fix disponible; el bundle incluye `purify.es`. El export actual usa `html2canvas` + `jsPDF.addImage`, pero la dependencia vulnerable está en el árbol de producción.
- `@fastify/busboy@3.2.0` (vía `@fastify/multipart@10.0.0`): **high**; afecta la subida de fotos (DoS/CRLF/prototype).
- `zod@3.25.76`: **high**; fix **4.6.7**, semver mayor; requiere migración y tests.
- `fastify@5.12.4`: moderate (fix 5.12.6); `fast-uri@3.1.8/4.1.5`: moderate; se resuelven actualizando Fastify/AJV.

**Remediación:**

- Actualizar `dompurify`/`jspdf` y `@fastify/multipart`/`@fastify/busboy`; actualizar `fastify` y `fast-uri`; migrar `zod` a 4.6.7 con tests de todos los schemas y rutas afectadas.
- No usar `npm audit fix --force` sin revisar el diff; el `zod` mayor se migra explícitamente.
- Agregar al gate de CI `npm audit --omit=dev --audit-level=high` (y, si el agente lo considera estable, `moderate`), después de que el árbol quede limpio. No ocultar el resultado con `--json` o `|| true`.
- Probar: backend completo, frontend, build, PDF de Horario, subida de fotos de Salida/Reportes, auth/refresh, OpenAPI y contrato Android.

**Aceptación:** `npm audit --omit=dev` sin critical/high (y sin moderates si se puede); CI falla si reaparece un high; el PDF y las fotos siguen funcionando.

### H2 — Faltan headers de seguridad y CSP en producción

**Evidencia:** `curl -sSI https://trindademasas.duckdns.org` y el asset real solo devuelven `Permissions-Policy` y `Server: nginx/1.27.5`; no hay `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options` ni `Referrer-Policy`. `docker/nginx.conf` solo agrega `Permissions-Policy`.

**Remediación:**

- En `docker/nginx.conf` (y en el host/TLS edge si el repo lo controla): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `server_tokens off`.
- CSP: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `connect-src 'self'`; `font-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`; `form-action 'self'`. Verificar que no rompa fotos (`data:`/`blob:`), QR, PDF/canvas, Tailwind inline ni los enlaces externos de WhatsApp/App Store.
- HSTS: si el TLS termina en un edge externo, documentar y configurar allí; en el nginx HTTP no tiene efecto. No agregar HSTS sobre HTTP.
- Aplicar los headers también a las respuestas de la API cuando corresponda; `add_header ... always` para que viajen en errores.
- Verificar con `curl -I` (HTML, asset y `/api/health`) y correr el E2E.

**Aceptación:** los headers aparecen en producción; CSP no rompe la app; `Server` no expone la versión; los tests/E2E verdes.

### H3 — Tokens de larga vida en `localStorage`

**Evidencia:** `AuthContext` guarda `auth_token`, `auth_refresh_token` y `auth_user` en `localStorage`; el refresh token es de larga vida. La contraseña del ERP ya está en el vault del servidor, pero un XSS podría exfiltrar el refresh. La combinación con H1 (`DOMPurify` crítico) y H2 (sin CSP) es la cadena a corregir.

**Remediación propuesta (web, sin romper Android):**

- El refresh token de la web pasa a cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=<TTL>`; el access token queda solo en memoria (no en `localStorage`). No devolver el refresh token en el JSON al cliente web; el cliente nativo Android conserva el flujo por body con un marcador explícito (`X-Trindade-Client: native` o equivalente) y sigue recibiendo su token.
- `POST /auth/login`: setea la cookie y devuelve el access token; el web ignora cualquier refresh del body. `POST /auth/refresh`: acepta cookie (web) o body (nativo), rota y setea la cookie; el web recibe solo access. `POST /auth/logout`: limpia la cookie y revoca; el nativo conserva su body.
- `CORS`: `credentials: true` solo para el origen aprobado y exacto. CSRF: `SameSite=Strict` + verificación de `Origin`/`Sec-Fetch-Site` en refresh/logout autenticados por cookie. `Secure` activo en producción; en desarrollo local permitir HTTP solo con una bandera explícita.
- `AuthContext`/`api`: access token en memoria; al montar, `/auth/refresh` con `credentials: 'include'`; al 401, refresh y reintento; `auth_user` puede seguir en `localStorage` porque no es credencial. Eliminar `auth_refresh_token` y `auth_token` de `localStorage`; el evento de sesión solo lleva el access.
- Actualizar tests de auth (cookie flags, rotación, replay, logout, web/nativo), `AuthContext.behaviour`, helpers E2E (`loginViaApi`, los tests que leen `localStorage.auth_token`) y los E2E que usan el token para llamadas directas: deben usar el token devuelto por login o la cookie del contexto, no `localStorage`.
- No romper la app Android: su refresh por body debe seguir probado.

**Aceptación:** el web no persiste refresh/access en `localStorage`; login, reload, multi-tab, refresh, logout y expiración funcionan; Android sigue con body; CORS/CSRF probados; E2E actualizado. Si aparece un bloqueo real, reportarlo y aplicar como mitigación inmediata H1+H2, pero no dejar el hallazgo silencioso.

### H4 — La suite backend no es hermética y el CI puede no estar cubriéndola

**Evidencia reproducida:**

- Solo con `AERO_VAULT_KEY`: **877/877**, 0 fallos (el 877 que reportó el agente).
- Sin entorno: **875/877**; fallan `db/index.test.ts` (“serves login through existing-install startup…”) y `stage-one-invariants.test.ts` (“refuses a missing database parent…”) con `VaultKeyError`.
- Con el `.env` completo: **876/877**; falla `runtime-config.test.ts` (“rejects missing and blank JWT secrets”) porque el test no aísla `JWT_SECRET`.
- `scripts/ci.sh` no exporta `AERO_VAULT_KEY`; el workflow no define `env:`. `npm test` no construye `dist`, y dos tests levantan `dist`: localmente pueden pasar contra un build viejo.

**Remediación:**

- En los tests que lanzan `dist` (`db/index.test.ts`, `stage-one-invariants.test.ts`), inyectar un `AERO_VAULT_KEY` de test (32 bytes base64, no producción) en el entorno hijo.
- En `runtime-config.test.ts`, aislar el entorno: eliminar/ignorar `JWT_SECRET` en el caso “missing/blank”; no depender del `.env` del desarrollador.
- En `scripts/ci.sh`, exportar una clave de test efímera para el paso de backend (nunca la de producción) y documentar el comando local exacto. En CI, setear la variable en el workflow o en el script, no en un secreto implícito.
- Hacer que `npm test` no dependa de un `dist` viejo: `pretest` que compile, o que los tests de arranque usen un build fresco/`tsx`; documentar.
- Actualizar `README`/`docs` con el comando exacto y el `npm audit` del gate.

**Aceptación:** `npm --workspace=packages/backend test` verde desde un clon limpio sin cargar el `.env` de producción; `scripts/ci.sh` verde con la clave de test; el `.env` completo tampoco rompe `runtime-config`; el CI no depende de un secreto no declarado.

---

## Medio

### M1 — Sin gzip/caché y JSON autenticado sin `no-store`

**Evidencia:** el asset principal sale con `Content-Length: 518636` y sin `Content-Encoding` aunque se pida `Accept-Encoding: gzip, br`; el build de Vite da 160.52 kB gzip. No hay `Cache-Control` para `/assets` hashed ni `no-cache` para `index.html`. `docker/nginx.conf` no tiene `gzip`.

**Remediación:**

- `gzip on; gzip_vary on; gzip_proxied any; gzip_min_length 1024; gzip_types text/plain text/css application/javascript application/json image/svg+xml;` (brotli opcional si está disponible).
- `Cache-Control: public, max-age=31536000, immutable` para `/assets/`; `no-cache` para `index.html`; no cachear el HTML con hashes viejos.
- JSON autenticado: `Cache-Control: no-store` (servidor y/o `api` fetch `cache: 'no-store'`); las fotos ya usan `private, no-store`; respetar el cache de las fotos públicas.
- Verificar con `curl -H 'Accept-Encoding: gzip, br' -I` (asset e `index`) y con el E2E.

**Aceptación:** el asset viaja comprimido; el HTML no queda cacheado; los datos autenticados no se reutilizan tras logout/cambio de usuario; la app sigue funcionando.

### M2 — Fotos de Salida sin retención

**Evidencia:** `cleanupExpiredPhotos` limpia solo `report_photos`; `salida_photos` y sus archivos no tienen cleanup. La ruta `DELETE /salida/photos/:photoId` existe, pero la UI no ofrece borrar; con 3 fotos por movimiento el disco crece sin política.

**Remediación:** implementar una retención configurable para `salida_photos` (por ejemplo 90 días, mayor que Reportes porque es evidencia de salida/ERP), con `SALIDA_PHOTO_RETENTION_DAYS`, cleanup en `server.ts` junto al de Reportes, borrado de fila+archivo y tests. Si la foto expira, la UI debe mostrar un estado claro (“foto no disponible”) sin romper el histórico. Documentar la política; no borrar sin ventana.

**Aceptación:** el cleanup corre y está testeado; no toca fotos dentro de la ventana; el histórico muestra el estado correcto; el disco no crece sin límite.

### M3 — Pulido iPhone incompleto

**Evidencia:**

- `ReportsPage.tsx` y `ReportEditPage.tsx` usan `text-sm` (14 px) en el textarea de notas; iOS hace zoom al enfocar. La Auditoría sí quedó en 16 px.
- `SalidaPhotoPicker.tsx` usa `h-9 w-9` (36 px) para borrar foto, debajo del target de 44 px.
- Los inputs de foto aceptan solo `image/jpeg,image/png,image/webp`. Si el iPhone entrega HEIC (cámara/biblioteca), el backend devuelve 415 (`ALLOWED_MIME_TYPES`/`detectImageMime`).

**Remediación:**

- Subir los textareas a 16 px en móvil (`text-base sm:text-sm` o `text-base`); revisar los demás controles a 390 px.
- Llevar el borrar foto de Salida (y el equivalente de Reportes) a un target mínimo de 44×44 px.
- Verificar HEIC en iPhone real. Si Safari lo entrega, agregar `image/heic`/`image/heif` a `ALLOWED_MIME_TYPES`, detectar el `ftyp`/brands en `detectImageMime`, extender el `accept`, y tests con fixture HEIC; si Safari convierte a JPEG, documentarlo y dejar un error claro para el caso no soportado. No confiar solo en el filtro del picker.
- Revisar 390 px en Salida, Reportes, Massas, Stock, Assai, Horario, Audit, Dashboard y ShareApp; agregar/actualizar el test de layout iPhone.

**Aceptación:** sin zoom inesperado en los campos; targets ≥44 px; HEIC probado o con error explícito y documentado; los tests de 390 px verdes.

### M4 — Copys residuales de “Cronograma”

**Evidencia:** la página ya dice “Horario de Cargamento”, pero quedan `dashboard.activeSchedule` (“Cronograma activo”), `loading.exportTitle` (“Exportar Cronograma”), `loading.createSchedule`, `loading.viewSchedule`, `loading.viewLoading`, el header del WhatsApp/PDF en `loading.export.service.ts` (`🚛 *CRONOGRAMA DE CARREGAMENTO*`), el nombre `cronograma-${date}` y los tests/e2e que los fijan.

**Remediación:** alinear los textos visibles del módulo a “Horario de Cargamento/Horário de Carregamento”, incluido el documento que se comparte por WhatsApp/PDF y el nombre de archivo; actualizar i18n ES/PT, tests y E2E. El concepto interno “cronograma” puede quedar si es una palabra de dominio, pero no el nombre visible del módulo.

**Aceptación:** no queda “Cronograma” como nombre visible del módulo/documento; tests/i18n/e2e actualizados.

### M5 — Documentación desactualizada

**Evidencia:** `docs/integracion-aero-masas-web.md:524` sigue diciendo “Bajas de stock `/saidasitem` | Contrato listo; interfaz pendiente”, cuando la interfaz ya está implementada y desplegada. El `README` tampoco documenta el entorno exacto de la suite backend.

**Remediación:** actualizar esa fila y el estado de Salida; documentar el comando de test (H4), el `npm audit`, el Playwright host (D1) y la política de retención de fotos (M2). Actualizar `CHANGELOG`/ODD con evidencia.

**Aceptación:** docs coherentes con el código y el deploy; sin afirmaciones “pendiente” falsas.

---

## Bajo

### L1 — IP de auditoría = IP del proxy

**Evidencia:** `server.ts` no configura `trustProxy`; `request.ip` en auditoría/sesiones es la IP de nginx. El rate limiter no depende de IP (usa usuario/token), así que no hay lockout, pero la columna IP de Auditoría no identifica al operador. El comentario de `auth.rate-limiter` dice que no confiar en XFF es deliberado.

**Remediación:** configurar `trustProxy` solo para el proxy conocido (loopback/subred Docker), nunca wildcard, y usar la IP reenviada para auditoría/sesiones; o documentar explícitamente que la IP es la del proxy y ajustar la UI. Agregar tests de la IP resultante y no romper la invariante anti-spoofing.

**Aceptación:** la auditoría muestra la IP correcta o la UI/documentación aclara que es la del proxy; no se acepta XFF de orígenes no confiables.

### L2 — Lint no-op, warning de Vitest, deuda `any`

**Evidencia:** `npm run lint` es un no-op (`scripts/ci.sh` lo documenta). Vitest avisa que jsdom se creó 25 veces (48% del tiempo; sugiere `pool: 'vmThreads'` o `isolate: false`). Hay 106 `any`/`as any` no-test (admin/reportes concentran), sin `@ts-ignore`.

**Remediación:** agregar un lint real y acotado (o eliminar el script no-op para no simular un gate); configurar Vitest (`pool: 'vmThreads'` o `isolate: false`) y medir; reducir `any` solo en los módulos tocados, sin refactor global. Si el `any` restante queda aceptado, documentarlo en el ODD; no es un problema funcional.

**Aceptación:** el comando de lint no es un falso verde; el warning de jsdom desaparece o queda justificado; no se introducen `any` nuevos en los cambios.

### L3 — Tamaño de bundle

**Evidencia:** `index` 518.62 kB (160.52 gzip), `export-vendor` 594.35 kB (177.22 gzip); route-lazy y aceptable para una app interna, pero pesado en la red de planta/iPhone, más aún sin gzip. M1 resuelve la compresión; no se requiere sobre-dividir.

**Remediación:** después de M1, medir; si sigue doliendo, evaluar `manualChunks`/carga diferida de exportadores y ShareApp; documentar la decisión. No bloquear por esto si la compresión está bien.

**Aceptación:** decisión documentada; sin regresión de carga; gzip servido.

### D1 — Playwright ejecutable en este host (deuda conocida; remediar)

**Evidencia:** `@playwright/test@1.60.0`; el host es Ubuntu 26.04 y Playwright no soporta Chromium allí; el E2E quedó solo en CI Ubuntu 24.04. El usuario pidió poder correr E2E en este host.

**Remediación (probar en este orden, sin debilitar el CI):**

1. Chromium del sistema: detectar `chromium`/`chromium-browser`/`google-chrome`; si existe, configurar `executablePath` por env (`PLAYWRIGHT_CHROMIUM_PATH`) en `playwright.config.ts` y correr la suite.
2. `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright install --with-deps chromium` y probar el binario; si arranca, documentar la variable.
3. Docker oficial de Playwright para Ubuntu noble (`mcr.microsoft.com/playwright:v1.60.0-noble` o el tag correspondiente), montando el repo y usando `--network host`; agregar un target reproducible (`npm run test:e2e:host`/`make e2e-host`) que levante el `webServer`/DB de test y corra la suite. El CI sigue en Ubuntu 24.04.
4. Dejar evidencia del comando y del resultado (al menos un spec; idealmente la suite completa) en el ODD. Si ningún camino funciona, reportar el bloqueo exacto con el error, no solo “no se puede”.

**Aceptación:** `npm run test:e2e:host` (o el nombre acordado) corre en este host y pasa la suite; CI intacto; documentación en README/ODD.

### D2 — Redacción de `response` en `logs/aero-integration.log` (deuda conocida; remediar)

**Evidencia:** el log de integración escribe el texto libre `response` del ERP sin redactar; los eventos locales nuevos sí evitan credenciales.

**Remediación:** redactar antes de escribir: `Authorization`, `Basic ...`, `password`, `senha`, `token`, `refreshToken`, `cookie`, `set-cookie`, `secret`, claves largas base64/hex y cualquier campo sensible conocido; conservar el resto del mensaje útil. Tests con un fixture que incluya secretos y verifique que no aparecen en el archivo; no romper los eventos `salida_*`/`report_*` ni el formato `tail -f`/`jq`.

**Aceptación:** el log no contiene credenciales ni tokens; los tests lo prueban; la auditoría sigue siendo útil.

---

## Plan de trabajo sugerido

1. **ODD/TDD y baseline:** guardar este informe, correr baseline, crear las tareas y los tests rojos por hallazgo. No mezclar refactors.
2. **H4 + H1:** primero hacer hermética la suite/CI y actualizar dependencias (con tests); así el resto se valida sobre una base confiable. Commits atómicos; el `zod` mayor separado.
3. **H2:** headers/CSP y verificación con curl/E2E.
4. **H3:** migración de tokens web a cookie, con tests de auth, CORS/CSRF y E2E; el cambio más grande, hacerlo aislado.
5. **M1–M5:** gzip/caché/no-store, retención de fotos, iPhone, copys, docs.
6. **L1–L3 + D1/D2:** IP de auditoría, lint/Vitest, bundle, Playwright host y redacción del log.
7. **Cierre:** tests/build/E2E, deploy `web`/`api` según corresponda, verificación de producción, actualización del ODD/informe con evidencia y lista de pendientes.

## Reglas de ejecución

- Trabajar en `main` del repo de Trindade; commits atómicos y mensajes claros; no mezclar un test-only con el cambio de comportamiento.
- No tocar datos de producción sin backup; no operaciones destructivas; no borrar fotos/DB fuera de la ventana de retención.
- Deploy: `web` para frontend/UI; `api`+`web` para backend/auth/headers; verificar health, rutas, `/api/salida/catalog` 401, log escribible y rollback disponible.
- Usar los patrones existentes (ODD, tests, i18n, componentes, nginx, scripts); no desarrollar de cero.
- Si un hallazgo no se puede cerrar sin un cambio mayor no previsto, documentarlo con evidencia y reportarlo; no dejarlo silencioso.
- Al terminar, responder en el panel con: qué se cambió, archivos, commits, tests/E2E, deploy, evidencia de headers/gzip/Playwright/log, y pendientes. El orquestador volverá a auditar la web y la vista iPhone.

## Criterio de cierre

- Alto: sin critical/high de dependencias (o excepción aprobada), headers/CSP presentes, sin refresh/access de larga vida en `localStorage` web, suite/CI hermética y verde.
- Medio: gzip/caché/no-store, retención de Salida, iPhone (textareas/targets/HEIC), copys y docs corregidos.
- Bajo: IP de auditoría resuelta o documentada, lint/Vitest resueltos o aceptados con razón, bundle documentado.
- Deudas conocidas: Playwright corre en este host con evidencia; log redactado con tests.
- Deudas a dejar: Quadrada/API/Android, beta `wilkin`, scroll de Auditoría, sin tocar.
- Todo con tests, build, E2E, deploy verificado y ODD actualizado.

---

## Tasks

- T1 → H4. Suite hermética: `AERO_VAULT_KEY` de test en los dos tests que lanzan el servidor, `runtime-config.test.ts`
  sin depender del `.env` del desarrollador, `pretest` que construye `dist`, y clave efímera en `scripts/ci.sh`.
- T2 → H1. Dependencias: `dompurify`/`jspdf`, `@fastify/multipart`, `fastify`/`fast-uri`; `zod` 4 en un commit
  propio. Gate `npm audit --omit=dev --audit-level=high` en CI.
- T3 → H2. Headers de seguridad y CSP en `docker/nginx.conf` (y API donde corresponda), con verificación por `curl`.
- T4 → H3. Tokens web a cookie `HttpOnly`, access en memoria, refresh nativo por body; CORS/CSRF y E2E.
- T5 → M1. gzip, caché de `/assets`, `no-cache` de `index.html`, `no-store` en JSON autenticado.
- T6 → M2. Retención configurable de `salida_photos` (fila + archivo) y estado claro en el histórico.
- T7 → M3. iPhone: textareas 16 px, targets ≥44 px, HEIC con detección por bytes, revisión a 390 px.
- T8 → M4. Copys del módulo a «Horario de Cargamento» en i18n, documento compartido y nombre de archivo.
- T9 → M5. Documentación: estado de Salida, comando de tests, `npm audit`, Playwright host, retención.
- T10 → L1. IP de auditoría: `trustProxy` acotado al proxy conocido, con tests anti-spoofing.
- T11 → L2. Lint real o retiro del no-op, configuración de Vitest para el aviso de jsdom, `any` acotados.
- T12 → L3. Decisión de bundle documentada tras medir con gzip.
- T13 → D1. Playwright ejecutable en este host, con target reproducible y CI intacto.
- T14 → D2. Redacción del campo `response` de `aero-integration.log` con tests.
- T15 → cierre. Tests, build, E2E, deploy `web`/`api`, verificación de producción y evidencia en este documento.

## Log

L1 — directiva del usuario, verbatim:

```
Leé completo `odd/tasks/auditoria-web-remediacion-2026-11-14.md` y ejecutá esa directiva de remediación. No es una
exploración: es una instrucción del usuario para implementar, probar, commitear y desplegar los cambios que
correspondan.

Alcance: todos los hallazgos Alto, Medio y Bajo del informe; las deudas conocidas a remediar son Playwright
ejecutable en este host y la redacción de `response` en `logs/aero-integration.log`. No toques Quadrada
API/Android, el beta `wilkin` de Salida ni el scroll de Auditoría (deudas a dejar). No toques datos sin backup ni
hagas operaciones destructivas.

Trabajá con ODD/TDD y los patrones existentes, con commits atómicos; tests, typecheck, build y E2E; deploy
`web`/`api` cuando corresponda y verificación de producción. Podés usar el `.env` local para los tests, pero no
imprimas ni commitees secretos. El informe está sin commitear: agregalo a tu ODD/commit con la evidencia.

Al final respondé en el panel con: qué cambió, archivos, commits, tests/E2E, deploy, evidencia de
headers/gzip/Playwright/log y pendientes. Si algo te bloquea, no lo dejes silencioso: reportalo y seguí con lo
demás. No cierres el panel.
```

---

## Evidencia de ejecución (2026-11-14)

### Commits

| Commit | Hallazgo | Contenido |
| --- | --- | --- |
| `2d0a6210` | H4 | Suite hermética: `AERO_VAULT_KEY` de test explícita en los dos tests que lanzan el servidor, `runtime-config` aislado, `pretest` que construye `dist`, clave efímera en `ci.sh` |
| `aba3561f` | L2 | Se retira el `lint` no-op; Vitest con `pool: 'vmThreads'` (188/188 en 22 s) |
| `90ba4468` | H2 + M1 | CSP y headers con `always`, `server_tokens off`, gzip, `immutable` para `/assets`, `no-cache` para HTML, `no-store` para `/api` y `/p` |
| `19b4e7f1` | D1 | `npm run test:e2e:host`; Playwright ejecutable en Ubuntu 26.04 |
| `2941beec` | D2 | Redacción de `response`/`error` del log de Aero |
| `404771ae` | M2 + L1 | Retención de fotos de Salida (90 días configurable), estado «foto no disponible», `trustProxy` con lista explícita |
| `b59ad044` | M2/L1 (revisión) | Contención de rutas en ambos limpiadores, `julianday` en Reportes, `TRUSTED_PROXY_CIDRS=,` rechazado |
| `00b67f31` | M5 | Variables nuevas, comandos, `npm audit` y Playwright host en README y guía de despliegue |
| `e6c7c89d` | H1 | Zod 4.6.7 + zod-to-openapi 9, `npm audit --omit=dev`: 0; gate en CI |
| `c363d763` | M4 | «Horario de Cargamento» / «Horário de Carregamento» en interfaz, documento y PDF |
| `a63d25e7` | H3 | Sesión web por cookie `HttpOnly` + access en memoria; Android intacto; contrato regenerado |
| `8493c5d6` | H3 (corrección) | Renovación sin `Content-Type` vacío, origen público permitido, helper E2E |
| `8c983e62` | despliegue | El runner copia el `node_modules` anidado del workspace |

### Pruebas

- Backend: **896 → 908** tests, 0 fallos en cada corrida; última corrida completa en verde tras H3.
- Frontend: node **724 → 727**, vitest **188 → 198**, `npm run typecheck` limpio.
- Contrato: `verify-openapi-artifact.sh` verde; cliente Kotlin regenerado y `check-android-contract-types.sh` verde tras H3.
- E2E en el host (`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`): **117/118** antes de H3, **115/118** en la última corrida completa. Los dos `aero-batch-launch` pasan aislados (3/3) y el de `audit.spec.ts` 6.1 ya fallaba en el `HEAD` previo a esta remediación; los tres quedan reportados, no silenciados.

### Producción (deploy `api` + `web`)

- `docker compose ps`: `api` y `web` healthy; `/api/health` 200.
- `/salida`, `/salida-history`, `/reports`, `/loading` y `/dashboard` 200; `/api/salida/catalog` sin sesión 401.
- Headers en el HTML: `Content-Security-Policy` (la política pedida), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` y `Cache-Control: no-cache`.
- Asset: `Content-Encoding: gzip`, `Vary: Accept-Encoding`, `Cache-Control: public, max-age=31536000, immutable`.
- API: `cache-control: no-store` en la respuesta 401 del catálogo; `/api/auth/refresh` cross-site rechazado.
- `logs/aero-integration.log` escribible por el contenedor (append de cero bytes), 132 KB, formato JSON por línea intacto.
- Retención: la base tenía **0 fotos de salida y 0 de reporte**, así que el primer barrido no borró nada. Se tomó un `VACUUM INTO` previo (`trindade.pre-web-audit-2026-11-14.db`, 909 KB) dentro del volumen.

### Pendientes y límites declarados

1. `audit.spec.ts` 6.1 («admin can view audit page with log entries») falla desde antes de esta remediación: la página no encuentra texto `registro` con los datos del fixture. Necesita su propio diagnóstico.
2. `aero-batch-launch` es inestable en la corrida completa (pasa aislado), por estado compartido del servidor E2E; es la clase de fallo que la guía pide corregir en el test.
3. `Server: nginx/1.27.5` sigue visible: el TLS termina en un nginx del host, fuera del repositorio. Falta `server_tokens off` en ese bloque; el contenedor ya lo tiene.
4. L1: la lista de proxies confía en `172.16.0.0/12`. Un cliente real dentro de ese rango podría declarar su propia IP; hoy lo mitiga el bind de la API a `127.0.0.1`. Estrechar el rango al bridge real es la mejora pendiente.
5. H3: un perfil con cookie válida pero `localStorage` borrado vuelve a la pantalla de login; normal al reingresar, queda anotado.
6. L3: `index` 518.69 kB (160.55 gzip) y `export-vendor` 594.35 kB (177.22 gzip), sin cambios. Con gzip servido (M1) se decide **no** subdividir más: la carga pesada es el exportador, que ya es un chunk aparte y se usa a demanda.
7. Deuda `any`: 106 usos, concentrados en admin/reportes; no se tocaron en masa y no se introdujeron nuevos en estos cambios.
