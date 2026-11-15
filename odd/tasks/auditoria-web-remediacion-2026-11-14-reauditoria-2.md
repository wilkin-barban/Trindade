# Re-auditoría 2 — pendientes de la web y iPhone (2026-11-15)

## Estado tras la segunda iteración

Verificado independientemente:

- Backend **917/917**; frontend node **727/727**; Vitest **200/200** (26 archivos); typecheck y build limpios; `npm audit --omit=dev` **0**.
- Producción: api/web healthy; health 200; rutas 200; catálogo Salida 401.
- Headers: CSP, nosniff, DENY, Referrer-Policy, Permissions-Policy, `Cache-Control: no-cache`; **HSTS presente** (`max-age=31536000`); gzip + immutable en assets; API `no-store`; log escribible.
- Auth: refresh en cookie HttpOnly/SameSite=Strict; sin `auth_token`/`auth_refresh_token` en localStorage; bootstrap desde cookie incluso con localStorage vacío; tests de reload/multi-tab/logout.
- P0.1 y P0.2 cerrados: Vitest volvió al pool que aísla; el fixture de cookie ya no hereda el deployment del shell.
- P2.1: default de proxies solo loopback + bridge declarado (`172.19.0.0/16`); `true`/`*`/`0` rechazados. `any` y bundle: aceptados/documentados.

## Pendiente P0.3 — E2E intermitente

- La suite completa sigue dando **117/118** en algunas corridas; el único fallo es `aero-batch-launch.spec.ts:133` (“one refused product comes back as a warning…”), que aislado pasa 3/3. El agente lo reconoce: falta una pasada dedicada al **estado del servidor E2E** (fixtures/DB por archivo), no otro timeout.
- **Remediación:** aislar el estado entre specs (fixtures por archivo o reset explícito del servidor E2E), de modo que `npm run test:e2e:host` complete **118/118 de forma determinista** en este host y el CI siga igual.
- **Aceptación:** dos corridas completas consecutivas 118/118, sin `skip`, `retry` ciego ni timeout alargado; evidencia en el ODD.

## Pendiente P1.1 — HEIC en Reportes

- **Salida ya está completo:** `SalidaPhotoPicker`/`lib/salida` aceptan HEIC/HEIF; backend Salida detecta brands `ftyp` y guarda `.heic`/`.heif`; tests.
- **Reportes backend** acepta HEIC/HEIF en la ruta y tiene tests; **falta el frontend**: `ReportsPage.tsx:563` y `ReportEditPage.tsx:593` siguen con `accept="image/jpeg,image/png,image/webp"`. Además el agente indica que el esquema `report_photos` necesita **revisión 12** (reconstrucción) para sostener el MIME HEIC.
- **Autorización:** el usuario pidió iterar hasta que no queden pendientes. Queda autorizada la revisión 12 **con backup previo y sin pérdida**; la tabla `report_photos` está vacía en producción (0 filas), y si el agente encuentra datos debe detenerse y pedir. No tocar el resto de tablas.
- **Remediación:** migración 12 con reconstrucción de `report_photos`, schema/contracts/tests; actualizar `accept` en Reportes y ReportEdit; extender `detectImageMime`/MIME/extensiones de Reportes si falta; tests con fixture HEIC/HEIF; verificar que la foto se ve en Safari/iPhone.
- **Aceptación:** subir una foto HEIC desde iPhone en Reportes (o un fixture E2E representativo) y verla; JPEG/PNG/WebP sin regresión; migración 12 probada, aplicada y con backup; backend/frontend verdes.

## P1.2 — Server header (residual externo)

- HSTS ya está en producción. `Server: nginx/1.27.5` sigue visible porque el TLS lo termina el `portfolio-nginx` de otro proyecto; `server_tokens off` del nginx de Trindade no puede borrar una cabecera que el borde agrega después. El agente documentó el bloque exacto en `docs/despliegue.md`.
- **Decisión:** no modificar otro proyecto desde Trindade. Se acepta como residual externo documentado; si el usuario quiere, se aplica `server_tokens off` en `portfolio-nginx`. No es un pendiente de este repo.

## P2 — cerrados/aceptados

- Proxies acotados; `any` no-test 49 y bundle 518/160 + 594/177 gzip: aceptados y documentados; no refactor global.
- `Server` externo: aceptado/documentado.
- No tocar Quadrada API/Android, beta `wilkin`, scroll de Auditoría.

## Vista iPhone

- **Cerrado:** notas 16 px, borrar foto 44×44, HEIC en Salida, cookie HttpOnly/SameSite=Strict, bootstrap con localStorage vacío, HSTS, gzip, labels “Horario”, retención con “foto no disponible”, 390 px.
- **Pendiente:** HEIC en Reportes (frontend + schema 12) y el E2E 118/118. El `Server` no es visual.

## Aceptación final

1. `npm run test:e2e:host` **118/118** determinista; backend 917/917; node 727/727; Vitest 200/200; typecheck/build; audit 0.
2. HEIC en Reportes funcionando en iPhone o fixture E2E + migración 12 con backup y tests.
3. Deploy `web`/`api` si hay cambios; health/rutas/catálogo/log; HSTS/gzip/CSP; evidencia de los números exactos.
4. ODD/CHANGELOG con la evidencia y el residual externo del `Server`; commits atómicos; sin tocar las deudas acordadas.

---

## Cierre de la tercera iteración (2026-11-15)

### P0.3 — E2E: causa raíz encontrada, no era el test

El fallo intermitente no era estado del servidor E2E ni un timeout: la app se quedaba en la **pantalla de login**
en medio del flujo (la captura de Playwright mostraba el formulario). La causa era de producto:
`rotateSession` ya toleraba un token rotado hace segundos, pero la ruta respondía **401** a ese caso. Dos documentos
del mismo navegador refrescando a la vez —o una respuesta perdida y reintentada— hacían que el perdedor de la
carrera interpretara un 401 como sesión expirada y limpiara la sesión.

- La ruta ahora **re-autentica** ese reintento: firma un access token con la autoridad de la sesión, sin refresh
  token nuevo y sin tocar la cookie (el ganador ya guardó la viva). Fuera de la ventana de gracia nada cambia: la
  familia se revoca y el token es un replay. Tests: servicio 119/119 en `modules/auth`, incluida la ventana medida
  con el reloj de la base.
- Además, el servidor E2E ganó un **reset explícito** (`POST /__test_reset`) que borra y resiembra su base en
  memoria con las mismas identidades, y el spec lo usa en cada test junto con productos propios por test.

**Evidencia: dos corridas completas consecutivas de `npm run test:e2e:host` → 118/118 (8m 36s) y 118/118 (9m 34s).**

### P1.1 — HEIC en Reportes: implementado, deploy **detenido**

- **Revisión 12**: reconstrucción de `report_photos` con el CHECK ampliado, copiando todas las columnas y contando
  antes de soltar la tabla, en una transacción `immediate`. `schema.sql` ya trae la tabla ancha para una
  instalación nueva. Tests de migración 31/31: una fila sobrevive con id, tamaño, token y fechas idénticos, un tipo
  inventado sigue rechazado, el DDL queda idéntico al re-ejecutar.
- **Reportes** acepta `image/heic`/`image/heif` de verdad (detección ISO-BMFF con familias HEIC y HEIF, extensión
  `.heic`/`.heif`), se eliminó el rechazo interino `REPORT_PHOTO_HEIC_UNSUPPORTED` y sus tests; `ReportsPage` y
  `ReportEditPage` ofrecen los formatos. Contrato regenerado con las descripciones correctas.
- **Bloqueo declarado**: la consigna decía que `report_photos` tenía **0 filas** en producción y que si encontraba
  datos me detuviera y pidiera autorización. **Encontré 6 filas.** No desplegué nada.

  Ensayo sobre una **copia** de la base de producción (`VACUUM INTO` + `docker compose cp`, sin tocar el original):
  migración `11 → 12`, `migrated`, integridad `ok`, 23 tablas, **6 filas antes y 6 después, idénticas campo por
  campo**, HEIC admitido. Es decir: el camino está probado con los datos reales; falta la autorización para
  aplicarlo.

  Backup disponible y previo: `trindade.pre-web-audit-2026-11-14.db` (909 KB) dentro del volumen, más la copia de
  ensayo en `/tmp/prod-rehearsal.db`.

### Números

| Comprobación | Resultado |
|---|---|
| Backend | **923/923** |
| Frontend node | **727/727** |
| Vitest | **200/200** |
| Typecheck / build | limpios |
| E2E host | **118/118** y **118/118** (dos corridas consecutivas) |
| Migración 12 (ensayo sobre copia de producción) | 6 → 6 filas idénticas, integridad ok |
| Producción | sin cambios en esta iteración: el deploy espera la autorización de la revisión 12 |

### Revisión 12 aplicada en producción (autorizada)

Autorización del usuario recibida con las 6 filas encontradas. Ejecución:

1. **Backup inmediatamente antes**: `VACUUM INTO trindade.pre-revision12-20261115T114641Z.db` (909312 bytes) dentro del
   volumen, y copia en `backups/trindade.pre-revision12-20261115T114641Z.db` en el host.
2. **Foto del estado**: 23 tablas, 5315 filas totales, `report_photos` con **6 filas** (ids, tamaños, MIME, tokens y
   fechas capturados en JSON).
3. **Deploy** `api` + `web`. La API **se negó a arrancar** con `Database startup refused: outdated — revision 11 is
   older than the supported revision 12`, que es el comportamiento correcto: este proyecto migra por comando, no al
   arrancar. Se aplicó con `docker compose run --rm --no-deps api node packages/backend/dist/db/migrate.js` y la API
   arrancó sola.
4. **Verificación posterior**: `user_version = 12`, `integrity_check = ok`, 23 tablas; **6 filas antes y 6 después,
   idénticas campo por campo** (`id`, `report_id`, `file_path`, `file_size`, `mime_type`, `public_token`,
   `created_at`); `CHECK` del MIME incluye `image/heic`; **ninguna otra tabla cambió** (comparación de conteos de las
   22 restantes: 0 diferencias).

Producción verificada: `/api/health` 200; `/salida`, `/salida-history`, `/reports`, `/loading` 200; catálogo 401;
CSP, HSTS, nosniff, DENY, Referrer-Policy, HTML `no-cache`, asset gzip + `immutable`, API `no-store`; log escribible;
`POST /api/reports/1/photos` sin sesión 401. HEIC en lo desplegado: la ruta compilada contiene `image/heic`,
`image/heif`, `ftyp` y las marcas; el bundle web de `ReportsPage` y `ReportEditPage` ofrece
`image/jpeg,image/png,image/webp,image/heic,image/heif`.

Pruebas de la iteración: backend **923/923**, node **727/727**, Vitest **200/200**, typecheck limpio, E2E **118/118**
dos veces consecutivas. La subida HEIC real desde un iPhone queda como verificación de campo: el backend ya la
acepta y la guarda, y Safari es el único navegador que además la muestra.
