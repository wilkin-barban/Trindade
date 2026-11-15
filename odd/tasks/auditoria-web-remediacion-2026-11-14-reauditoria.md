# Re-auditoría web — 2026-11-14/15

## Contexto

- Primera remediación completada por el agente de Trindade: 14 commits, `main` sincronizado, deploy `api`/`web` healthy, `npm audit --omit=dev` en **0**.
- Esta re-auditoría es independiente, de solo lectura, después del cierre. **No modifiqué el proyecto.**
- El informe original sigue en `odd/tasks/auditoria-web-remediacion-2026-11-14.md`; este documento es el delta con lo que quedó pendiente.
- No tocar las deudas que el usuario pidió dejar: `Quadrada` API/Android, beta `wilkin` de Salida, scroll de Auditoría.

## Resultado independiente

| Comprobación | Resultado real |
|---|---|
| `npm run typecheck` | **OK** |
| `npm run build` | **OK** (index 518.65 kB / 160.54 gzip; export-vendor 594.35 / 177.22) |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| Backend `npm --workspace=packages/backend test` | **907/908**; falla `auth.cookies.test.ts` |
| Frontend `test:node` | **727/727** |
| Frontend `test:unit` (Vitest, aislado) | **195/198 fallan**; 25 archivos fallan, 1 pasa |
| E2E `test:e2e:host` | **117/118**; 3 fallos (Audit 6.1 + 2 `aero-batch-launch`) |
| Producción | API/web healthy; `/api/health` 200; `/salida`, `/salida-history`, `/reports`, `/loading`, `/dashboard` 200; `/api/salida/catalog` 401 |
| Headers HTML | CSP, nosniff, DENY, Referrer-Policy, Permissions-Policy, `Cache-Control: no-cache` |
| Asset | `Content-Encoding: gzip`, `Cache-Control: public, max-age=31536000, immutable` |
| API | `cache-control: no-store`; refresh cross-site rechazado |
| Pendiente de headers | **HSTS ausente**; **`Server: nginx/1.27.5` visible** |
| Auth | `auth_token`/`auth_refresh_token` ya no están en `localStorage`; cookie HttpOnly/SameSite=Strict; tests de auth mayormente verdes |
| Log | `logs/aero-integration.log` escribible; redacción de `response`/`error` implementada |

## Alto / P0 — la suite no está verde

### P0.1 — Vitest 195/198 falla aislado (regresión de L2)

**Evidencia:** `npm --workspace=packages/frontend run test:unit` aislado da **195 failed / 3 passed (198)**; `Test Files 25 failed | 1 passed (26)`; fallan `SalidaLaunchPage` 17, `ReportsPage` 9, `SalidaHistoryPage` 20, `ReportHistoryPage` 8, `MassasHistoryPage` 7, `ScheduleGrid` 13, `LoadingEditPage` 7, `DriverPicker` 6, `LoadingSchedulePage` 3, `ReportEditPage` 8, `StockHistoryPage` 5, `massas-collective-table` 9, etc. El `test:node` sí está 727/727.

**Causa probable:** `packages/frontend/vitest.config.ts` usa `pool: 'vmThreads'` con jsdom y componentes React; el cambio de L2 (“share one jsdom per worker”) vino de un warning de performance, no de un bug. El job `job-25` que reportó 198/198 no es reproducible con el config actual.

**Remediación:** volver al pool por defecto / `pool: 'forks'` (o una configuración `vmThreads` que aísle de verdad) y dejar `npm --workspace=packages/frontend run test:unit` en **198/198** aislado. No ocultar el warning de jsdom a costa de romper 25 archivos; si se quiere optimizar, hacerlo con un test de regresión que corra la suite completa.

**Aceptación:** unit 198/198 aislado y dentro de `npm --workspace=packages/frontend test`; node 727/727; sin fallos intermitentes.

### P0.2 — Backend 907/908: cookie `Secure` en el test “plain HTTP”

**Evidencia:** `auth.cookies.test.ts:97`, test “sets an HttpOnly, SameSite=Strict cookie scoped to the auth routes with the refresh TTL” (suite `the web session cookie > login`):

```text
error: 'plain HTTP development must not mark the cookie Secure'
actual: 'trindade_refresh=...; Max-Age=2592000; Path=/api/auth; HttpOnly; Secure; SameSite=Strict'
```

El test aislado da 10/11; la suite completa 907/908. El fixture `app` (el que debería ser plain HTTP) está emitiendo `Secure`; `secureApp` es el que debe emitirlo. El test y/o el fixture/`cookieSecure` están mal; no se puede declarar 908/908.

**Remediación:** corregir el fixture de `app` para que represente HTTP/desarrollo sin `Secure` (o el cálculo de `secure` si el bug es de producción), y dejar la suite backend **908/908 sin cargar el `.env` de producción**. Revisar que el test “marks the cookie Secure when the deployment is HTTPS” siga pasando.

**Aceptación:** backend 908/908 desde un clon limpio; cookie sin `Secure` en HTTP desarrollo y con `Secure` en HTTPS/producción; sin secretos de producción en tests.

### P0.3 — E2E 117/118: fallos de test que el agente dejó abiertos

**Evidencia:** la corrida completa `npm run test:e2e:host` termina 117/118 con 3 fallos:

1. `src/__e2e__/audit.spec.ts:32` — `locator('text=registro')` resuelve 2 elementos (`Registros no total: 54` y `54 registros — Página 1 de 3`); strict mode violation. Es un selector de test ambiguo; usar `getByTestId('audit-total-logs')` o un locator específico y verificar que el fixture de auditoría realmente tiene filas.
2. `src/__e2e__/aero-batch-launch.spec.ts:99` y `:152` — inestables en la corrida completa; aislados pasan 3/3. El agente lo atribuye a estado compartido del servidor E2E; hay que aislar el test/servidor (fixtures/DB por spec o reset explícito), no aceptar “inestable”.
3. Confirmar que la corrida completa queda **118/118** en este host con `npm run test:e2e:host` y que el CI Ubuntu 24.04 sigue igual.

**Aceptación:** suite E2E completa verde en este host y en CI; sin tests marcados como inestables; `audit.spec` 6.1 y `aero-batch` con evidencia.

## Medio / P1

### P1.1 — HEIC del iPhone sigue sin soporte ni verificación

**Evidencia:** los inputs siguen con `accept="image/jpeg,image/png,image/webp"` en `SalidaPhotoPicker.tsx`, `ReportsPage.tsx` y `ReportEditPage.tsx`; el backend mantiene `ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']` en Salida y Reportes. No hay `image/heic`/`image/heif` en `detectImageMime` ni test con fixture HEIC. El cierre del agente no lo menciona.

**Remediación:** verificar en iPhone real si Safari entrega HEIC o lo transcodifica a JPEG. Si entrega HEIC, agregar `image/heic`/`image/heif` a `ALLOWED_MIME_TYPES`, detectar el `ftyp`/brands en `detectImageMime`, extender el `accept` y agregar tests con un fixture HEIC. Si Safari convierte, documentarlo y dejar un error claro para el caso no soportado; no confiar solo en el filtro del picker. Aplica a Salida y Reportes.

**Aceptación:** foto de cámara/biblioteca del iPhone funciona o falla con un mensaje explícito y probado; tests de MIME; sin regresión JPEG/PNG/WebP.

### P1.2 — HSTS ausente y `Server: nginx/1.27.5` visible

**Evidencia:** `curl -sSI https://trindademasas.duckdns.org` devuelve CSP/X-Frame/X-Content/Referrer/Cache-Control correctos, pero **no** `Strict-Transport-Security` y sí `Server: nginx/1.27.5`. `docker/nginx.conf` ya tiene `server_tokens off`, pero el header público viene del nginx del host (TLS/edge), fuera del contenedor.

**Remediación:** agregar `server_tokens off` a `docker/nginx-host-trindademasas.conf` y aplicarlo en el host; agregar `Strict-Transport-Security` en el terminador TLS (o documentar exactamente dónde está y cómo se configura, si no lo controla el repo). Verificar con `curl -I` que desaparece la versión y aparece HSTS. No poner HSTS sobre HTTP.

**Aceptación:** sin versión de nginx; HSTS presente en HTTPS; config del host versionada o documentada; CSP actual no se rompe.

### P1.3 — H3: bootstrap con cookie válida y `localStorage` vacío

**Evidencia:** `AuthContext` ya no guarda tokens, pero `restoreSession()` hace `if (!readStoredUser()) return;` antes de `refreshTokenOnce(null)`. Si el usuario limpia `localStorage` pero la cookie HttpOnly sigue válida, la app vuelve al login en vez de renovar. El agente lo anotó como “normal al reingresar”; el criterio H3 original pedía renovar desde la cookie en el montaje.

**Remediación:** decidir y probar: intentar `/auth/refresh` desde la cookie aun sin `auth_user` (con una marca para no refrescar en cada visita anónima) o documentar que el bootstrap exige la pista local y que el usuario debe volver a entrar. Si se mantiene el comportamiento actual, que sea una decisión explícita en el ODD, no un pendiente ambiguo. Tests: reload normal, reload con `localStorage` vacío y cookie válida, cookie inválida, multi-tab.

**Aceptación:** comportamiento definido y testeado; sin tokens en `localStorage`; login normal; multi-tab; logout.

## Bajo / P2

### P2.1 — `TRUSTED_PROXY_CIDRS` demasiado amplio

`DEFAULT_TRUSTED_PROXY_CIDRS` incluye `172.16.0.0/12`; hoy lo mitiga el bind de la API a `127.0.0.1`, pero conviene limitarlo al bridge/red real de Docker (`docker network inspect`), actualizar defaults/docs/tests y mantener el rechazo de `true`/`*`/`0`/`::/0`.

### P2.2 — Deuda `any` y bundle (aceptados)

- `any`/`as any` no-test: **49** en esta medición (el “106” del cierre incluye tests); no hay `@ts-ignore`. No hacer refactor global; documentar los existentes y no introducir nuevos en los módulos tocados.
- Bundle: index 518.65/160.54 gzip, export-vendor 594.35/177.22; con gzip servido y rutas lazy se acepta; no subdividir más sin una medición que lo justifique.

## Lo que sí quedó cerrado

- **H1:** `npm audit --omit=dev` en 0; Zod 4 migrado y probado.
- **H2 (parcial):** CSP, nosniff, DENY, Referrer-Policy, Permissions-Policy, `no-cache` del HTML, gzip/immutable de assets, `no-store` del API. Faltan HSTS y `server_tokens` del host (P1.2).
- **H3 (parcial):** refresh en cookie HttpOnly/SameSite=Strict; tokens fuera de `localStorage`; rotación/logout; tests de auth. Falta el bootstrap con `localStorage` vacío (P1.3) y el test `auth.cookies` (P0.2).
- **H4 (parcial):** suite backend hermética en general; falta el fallo de cookie (P0.2).
- **M1:** gzip/caché/no-store verificados en producción.
- **M2:** retención de Salida 90 días, fila+archivo, “foto no disponible”; backup `trindade.pre-web-audit-2026-11-14.db`; producción tenía 0 fotos.
- **M3 (parcial):** notas a 16 px, targets de borrar foto a 44×44, labels; falta HEIC (P1.1).
- **M4:** “Horario de Cargamento”/“Horário de Carregamento” en UI, WhatsApp/PDF y nombre de archivo; tests actualizados.
- **M5:** docs al día (integración Aero, README, despliegue).
- **L1 (parcial):** `trustProxy` con lista explícita; falta estrechar el rango (P2.1).
- **L2 (parcial):** lint no-op retirado; Vitest **regresionó** (P0.1).
- **L3:** medido y aceptado.
- **D1 (parcial):** Playwright corre en este host (`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`, `npm run test:e2e:host`); 117/118; faltan 3 tests (P0.3).
- **D2:** redacción de `response`/`error` del log Aero implementada y testeada.
- **Deploy:** API/web healthy, rutas 200, catálogo 401, log escribible, backup y datos intactos.

## Vista iPhone — estado

**Cerrado:** textareas de notas a 16 px (`ReportsPage`, `ReportEditPage`), borrar foto de Salida a 44×44, copys “Horario”, gzip, CSP, retención con “foto no disponible”, tests de 390 px.

**Pendiente:** HEIC de cámara/biblioteca (P1.1); bootstrap de sesión con cookie y `localStorage` vacío (P1.3); los 3 fallos E2E no son específicos de iPhone, pero impiden declarar la suite verde (P0.3). HSTS/Server no es visual.

## Orden de trabajo y aceptación

1. **P0.1 + P0.2:** reparar Vitest y la cookie de backend; correr backend y frontend completos aislados. Sin esto no se puede confiar en ningún cierre.
2. **P0.3:** reparar `audit.spec` 6.1 y la inestabilidad de `aero-batch`; `npm run test:e2e:host` 118/118.
3. **P1.1–P1.3:** HEIC, HSTS/server_tokens, bootstrap de cookie.
4. **P2.1:** estrechar proxies; **P2.2** aceptar/documentar.
5. Actualizar ODD/CHANGELOG con evidencia; commit atómico; deploy `api`/`web` si cambia; verificar producción.
6. Responder en el panel con: archivos, commits, tests exactos (backend 908/908, node 727/727, vitest 198/198, E2E 118/118), headers, evidencia iPhone/HEIC, y pendientes reales.

## Reglas

- No tocar Quadrada API/Android, beta `wilkin`, scroll de Auditoría.
- No tocar datos sin backup; no destructivo; no borrar fotos fuera de la ventana.
- No desplegar con la suite roja; no ocultar fallos con `|| true`, `skip` o `--force`.
- Usar ODD/TDD y patrones existentes; commits atómicos; actualizar el informe.

---

## Respuesta del agente (2026-11-15)

### P0.1 — Vitest

No pude reproducir los 195 fallos en esta máquina: `test:unit` daba 198/198 con y sin `NODE_ENV=test`, con
`env -i` y con `CI=true`. Aun así el pool se revirtió al **default** (proceso por archivo), que es el que aísla de
verdad: el override `vmThreads` era una optimización cosmética para un warning de rendimiento y el riesgo no se
justifica. El warning de jsdom vuelve y queda explicado en el comentario del config, no oculto.

Evidencia: `npm --workspace=packages/frontend run test:unit` → **26 archivos / 200 tests en verde**, dos corridas
seguidas; `test:node` 727/727.

### P0.2 — Cookie `Secure`

Reproducido: con `NODE_ENV=production` exportado en el shell, el fixture `app` emitía `Secure`.

Causa: `buildAuthTestApp` no fijaba `cookieSecure`, así que `authRoutes` lo resolvía desde `NODE_ENV`/
`PUBLIC_APP_URL` del entorno. Corregido en los dos extremos: el fixture **declara** `cookieSecure: false` (es una
instalación HTTP de desarrollo) y la producción resuelve el flag **una vez, al registrar las rutas**, desde la URL
pública de la instalación.

Evidencia: `auth.cookies.test.ts` **11/11 con y sin `NODE_ENV=production`**; suite backend **917/917**.

### P0.3 — E2E

- `audit.spec` 6.1: el texto `registro` aparece dos veces (header y pie); ahora usa `getByTestId('audit-total-logs')`.
  **Cerrado.**
- `aero-batch-launch`: se corrigieron tres causas reales — cada test escribe **productos distintos** (el servidor
  rechaza relanzar un producto del mismo día, que es correcto), se espera el ticket antes de entregar la respuesta
  del puente, y el flujo tiene presupuesto de 60 s en lugar de 30. Con eso la mayoría de las corridas pasa, pero
  **sigue siendo intermitente**: en algunas corridas uno de los tres tests se queda esperando el diálogo y falla.
  **Abierto, no silenciado.** Reproducción: `npm run test:e2e:host` (o el archivo solo, varias veces).
- Corrida completa: **117/118** cuando falla ese test; verde en las corridas donde no aparece.

### P1.1 — HEIC

Verificado el límite real: Safari **puede** entregar HEIC y el backend lo rechazaba.

- **Salida**: soporte completo. `image/heic`/`image/heif` aceptados, detección por ISO-BMFF `ftyp` (familia HEIC:
  heic/heix/hevc/hevx/heim/heis/hevm/hevs; familia HEIF: mif1/msf1), extensión y `mime_type` correctos, servido de
  vuelta, y el picker acepta el formato. Tests con fixture HEIC/HEIF y contra-pruebas (HEIC declarado como JPEG,
  bytes que no son ISO-BMFF).
- **Reportes**: **no** soportado todavía, y ahora lo dice. `report_photos.mime_type` tiene un `CHECK` que SQLite no
  puede ampliar sin reconstruir la tabla: es la revisión 12, una migración de datos de producción. Hasta entonces el
  endpoint responde **415 con `code: REPORT_PHOTO_HEIC_UNSUPPORTED`** y un mensaje que nombra el formato, probado en
  tests; el picker de Reportes sigue ofreciendo solo lo que el servidor guarda. Decisión pendiente del usuario:
  autorizar la revisión 12.

### P1.2 — HSTS y `Server`

- `Strict-Transport-Security: max-age=31536000` se emite desde `docker/nginx.conf` y **se verifica en producción**
  sobre HTTPS (sin `includeSubDomains`: la zona tiene hosts que no son de este servicio).
- `Server: nginx/1.27.5` **sigue visible**: el TLS lo termina otro nginx (contenedor `portfolio-nginx`, fuera de este
  repositorio) y el `server_tokens off` del contenedor no puede borrar una cabecera que el borde agrega después.
  Documentado en `docs/despliegue.md` con el bloque exacto y la verificación por `curl`. Aplicarlo requiere un
  cambio en el proyecto del portafolio, que no toqué.

### P1.3 — Bootstrap de sesión

Decidido y probado: **la cookie es la sesión**. `restoreSession` renueva siempre al montar, sin exigir `auth_user`;
la pista local solo pinta el primer frame. Costo: un refresh rechazado en una visita anónima, silencioso. También se
cerró la carrera que eso abrió (un login mientras la renovación está en vuelo no puede quedar deslogueado por el
fallo de esa renovación).

Tests: cookie válida con `localStorage` vacío → entra; segunda pestaña que monta después → entra; cookie inválida →
queda anónimo; logout limpia. `AuthContext.behaviour` 6/6.

### P2

- **P2.1** cerrado: el default del código es solo loopback y el bridge real se declara en `docker-compose.yml`
  (`TRUSTED_PROXY_CIDRS=127.0.0.1/8,::1/128,172.19.0.0/16`, verificado dentro del contenedor). Tests actualizados;
  `true`, `*` y `/0` siguen rechazados.
- **P2.2** aceptado y documentado: `any` no-test no se refactoriza en masa y no se introdujeron nuevos en los
  módulos tocados; bundle 518.69 kB / 160.55 gzip y export-vendor 594.35 / 177.22, sin subdividir más con gzip
  servido.

### Números exactos de esta entrega

| Comprobación | Resultado |
|---|---|
| Backend | **917/917** (con y sin `NODE_ENV=production` en la cookie) |
| Frontend `test:node` | **727/727** |
| Frontend `test:unit` (default pool) | **200/200**, 26 archivos |
| Typecheck | sin errores |
| Build | verde |
| E2E host | **117/118 – 118/118** según la corrida; `aero-batch-launch` intermitente y reportado |
| Producción | `api`/`web` healthy; rutas 200; catálogo 401; `HSTS` presente; CSP/nosniff/DENY/Referrer; gzip + immutable; API `no-store`; log escribible |
| `Server` | `nginx/1.27.5` visible: borde fuera del repo, documentado |
