# Paridad web ↔ Android, auditoría ERP y release 7005

Plan de remediación en 28 tareas (T0–T27). La web adopta las decisiones de diseño que Android ya tiene
(dashboard, cajas, fechas, horario), la auditoría ERP deja de rechazar el 100 % de lo que manda Android,
la contraseña del ERP deja de persistirse en el navegador y la entrega se publica como build **7005** sobre
la release `v0.7.0` existente.

## Specs

S1 — Montagem das Caixas, verbatim:

> **Montagem das Caixas:** la web adopta el payload de Android: una fila por tarea con `checked=false` explícito, no solo las marcadas.

S2 — Histórico de Massas, verbatim:

> **Histórico de Massas:** la web pasa al modelo Android de lista de días clicables, no a un selector de fecha único.

S3 — Dashboard, verbatim:

> **Dashboard:** copiar exactamente el orden Android: 6 tarjetas + panel “Resumo”, incluida “Compartilhar App” después de la calculadora de Assaí y su subtítulo.

S4 — Atajo iOS, verbatim:

> **Atajo iOS:** se sigue repartiendo el certificado `https://www.icloud.com/shortcuts/3216695a428f42539fec7abbd5419f34`. El enlace `27efb...` que usa Wilkin es equivalente (20 acciones idénticas + una acción extra de salida), pero **no** se cambia el enlace canónico ni el test.

S5 — Credenciales web, verbatim:

> **Credenciales web:** se tratan como hallazgo de seguridad y se migran fuera de `localStorage`. El ODD debe proponer el diseño; opción preferida: almacenamiento server-side cifrado (AES-GCM con clave en entorno) y endpoint admin-only, con migración única desde el `localStorage` existente y sin devolver la contraseña en las respuestas. Si encontrás una alternativa mejor, proponela y justificá; no implementes hasta aprobación.

S6 — Auditoría ERP (hallazgo A), verbatim:

> Android manda `event: dispatch|sync|test`, `phase: response` y `durationMs`; el backend solo acepta `launch_sync|read_history|test_connection`, `phase: requested|result` y no admite `durationMs` (`.strict()`). Resultado: **100% de la auditoría Android se rechaza con 400**.

S7 — Filtros de fecha web (hallazgo B), verbatim:

> `DateField` (`components/ui/date-field.tsx:51-60`) usa `<input type="date">` con `opacity-0`, sin `showPicker()` ni clic reenviado. En escritorio no abre el calendario; en táctil sí.

S8 — Cajas web (hallazgo D), verbatim:

> La web envía solo `checked=true` (`ReportEditPage.tsx:326-335`); el backend reemplaza `report_items` (`reports.command.service.ts:175-184`) y **borra** las filas no marcadas. Adoptar el payload Android con `checked=false` explícito.

S9 — Release 7005, verbatim:

> Próximo build Android: **versionCode 7005**, versionName `0.7.0`, mismo tag `v0.7.0`, reemplazar el asset de la release existente (sin release nueva).

S10 — Reglas de trabajo, verbatim:

> No ramas, no worktrees, no `Co-Authored-By`, commits atómicos ≤400 líneas, Conventional Commits.

S11 — Proxy descartado por topología (revisión, verbatim):

> El backend de producción corre en un VPS detrás del proxy compartido y **no tiene ruta a la LAN de la empresa**. La web usa el atajo de iOS justamente porque el ERP está en `http://192.168.25.250:1453/api` y la página es HTTPS. Evidencia: `docs/arquitectura.md:12-24`, `docs/integracion-aero-masas-web.md:24-25`.
>
> Por lo tanto, la **Opción A (backend como proxy de Aero32) no se puede implementar en este ciclo** sin un puente on-prem, que es otra pieza y otra decisión de infraestructura. No la propongas como recomendada.

S12 — Credenciales: decisión para T20 (revisión, verbatim):

> - `localStorage` deja de guardar `password`.
> - `wsUrl`, `username`, `shortcutName`, `syncEnabled` y `lastSyncAt` pueden seguir en `localStorage` (no son secretos).
> - La contraseña vive **solo en memoria** durante la sesión de la pestaña; si se recarga la página, se vuelve a pedir. Nada de `sessionStorage` persistente en esta fase.
> - La UI debe explicar “la contraseña no se guarda en este dispositivo; se pide al abrir la sesión”.
> - La migración debe borrar la contraseña existente de `localStorage` una vez y no volver a escribirla.
> - Si el usuario quiere “recordar en este dispositivo”, queda como fase futura con WebCrypto + passphrase; no en este ciclo.

S13 — «Caja no montada», verbatim:

> Decisión: **no persistir** el estado apagado del tipo de caja con el reporte. No agregues columna ni migración. El payload con `checked=false` ya expresa qué tareas no se marcaron.

S14 — Lane de tests web, verbatim:

> La lane actual es `node --test --import tsx "src/**/*.test.ts"` y **no tiene jsdom ni Testing Library**. Los `*.test.tsx` que propone el ODD no se pueden ejecutar.

S15 — Recorte de logs, verbatim:

> - El servidor sigue **estricto**: `error > 1024` o `note > 256` → `400 INVALID_AERO_LOG`.
> - Web y Android **recortan antes de enviar** a 1024/256, con test.

S16 — Filas por tarea, verbatim:

> se envía una fila por tarea **no-temperature** (marcadas y no marcadas). Las temperaturas siguen en `report_temperatures` y no se duplican en `report_items`.

S17 — Multioperario en el cliente, verbatim:

> T24 no puede quedarse solo en backend: si el contrato pasa a `operator_name` por ítem, actualizá también el payload de importación/lote de la web (`MassasLaunchPage.tsx`) y, si Android manda más de un asiento por request, su DTO. Agregá el test de contrato del cliente y la compatibilidad con el payload viejo de un solo operario.

S18 — Diseño iPhone en cada tarea web, verbatim:

> cada tarea web T6–T19 debe incluir en su aceptación una verificación en viewport **390×844** (Playwright o captura) y en escritorio.

S19 — D5/D7, verbatim:

> - D5: mantené los cuatro commits de Horário; si uno supera 400 líneas, partilo por comportamiento.
> - D7: no muevas T25/T26 a otro ODD sin consultar. El usuario pidió todo en este ciclo; si el tiempo aprieta, primero se recorta alcance con aprobación, no en silencio.

## Contexto

- `main` = `origin/main` = `2fba94a`, árbol limpio; tag `v0.7.0` en `4f414002` con asset build 7004
  (sha256 `7622756d…`, 11.194.408 bytes).
- Android 7004 ya tiene: acciones de histórico como iconos, filtro de fecha compacto, fecha grande en el
  Histórico de Contagem, cajas ocultas por interruptor, cabecera y «Compartir arquivo APK» en Compartir App,
  dashboard de 6 tarjetas + panel «Resumo».
- La web (React/Vite) sigue en el modelo anterior en dashboard, cajas, fechas e historiales, y habla con el
  ERP Aero32 **desde el navegador**: `aeroEndpoint(wsUrl, …)` se resuelve con la configuración guardada en
  `localStorage` (`src/lib/aero-integration.ts:10,239`). No hay alternativa: el ERP escucha en HTTP plano sobre
  la LAN (`http://192.168.25.250:1453/api`), la página es HTTPS y el VPS no tiene ruta a esa LAN, así que el
  navegador no puede delegar la llamada al backend (`docs/arquitectura.md:12-24`,
  `docs/integracion-aero-masas-web.md:24-25`). Esa topología es la causa raíz de S5 y la razón de S11.
- La auditoría ERP es hoy un contrato roto en el borde: `AeroLogBodySchema`
  (`packages/backend/src/modules/integration/aero.schema.ts:27`) es `.strict()` con
  `event: ['test_connection','launch_sync','read_history']` y `phase: ['requested','result']`, mientras Android
  emite `dispatch|sync|test` con `phase: response` y `durationMs`. El adaptador Android
  (`AeroAdapters.kt:55-57`) hace `runCatchingCancellable` y descarta la respuesta, así que el 400 nunca se ve.

## Objetivos

1. Un solo contrato de auditoría ERP que acepte a los tres clientes (android, web, atajo iOS) con identidad de
   app, correlación y duración, sin perder `.strict()` ni la prohibición de credenciales.
2. Que la auditoría cubra los caminos que hoy no escriben (recepciones, importaciones, dispatch/sync sin
   integración) y que un fallo de log sea visible para quien opera, no silencioso.
3. Paridad de fechas e historiales web con Android, con clic real y sin pickers fantasmas.
4. Dashboard web idéntico al de Android en orden, tarjetas y panel de resumen.
5. Montagem das Caixas web con interruptor por tipo y payload completo: una fila por tarea **no-temperature**
   (S16).
6. Horário web con el modal de Android (pestañas, multiselección, chapa por fila) y sus bugs de cuota cerrados.
7. Que la contraseña del ERP deje de persistirse: solo en memoria de la pestaña, pedida al abrir sesión, con
   purga única del valor existente (S12).
8. Cerrar los P0/P1 de Android y backend que el informe anterior dejó abiertos.
9. Build 7005 publicado, desplegado y verificado con hash idéntico en los cinco destinos.
10. Que los tests de componentes web se puedan ejecutar en CI: lane jsdom + Vitest (hoy no existe, S14).

## No objetivos

- No se toca el enlace canónico del atajo iOS ni su test (S4).
- No se crea release ni tag nuevos: mismo `v0.7.0`, reemplazo de assets (S9).
- No se introduce un endpoint batch en Aero32 ni en el backend: la semántica sigue siendo N POST por lote con
  `AERO_BATCH_MAX=8` y cola TTL 8 h (`src/lib/aero-queue.ts`).
- No se rediseña la taxonomía de errores del test web (`ok`, `http_error`, `reachable_without_cors`, `blocked`,
  `invalid_config`, `timeout`, `network`): se conserva y se reutiliza en Android.
- No se migra la web a otro framework ni se cambia el modelo de datos de reportes más allá de aceptar filas
  `checked=false`.
- No se construye el puente on-prem ni el backend como proxy de Aero32: queda fuera de este ciclo (S11).
- No se agrega tabla, endpoint ni cifrado server-side para las credenciales del ERP (S12).
- No se persiste «caja no montada» con el reporte: no hay columna ni migración (S13).
- No se usa `sessionStorage` persistente para la contraseña en esta fase (S12).

## Orden recomendado

| Etapa | Tareas | Motivo del orden |
| --- | --- | --- |
| 0. Lane de tests web | T0 | Sin jsdom los `*.test.tsx` del plan no se pueden ejecutar (S14) |
| 1. Contrato de auditoría | T1–T5 | Es el borde que hoy rechaza todo; sin esto el resto del ERP se opera a ciegas |
| 2. Fechas e historiales web | T6–T9 | Bloquea a quien opera desde escritorio, que es el caso de la oficina |
| 3. Dashboard web | T10 | Barato y visible; depende de que el backend ya entrega los campos |
| 4. Montagem das Caixas | T11–T15 | Decisión 1 y bugs de solo lectura; toca payload y backend |
| 5. Horário/Cronograma | T16–T19 | El cambio más grande de UI web; va después de cajas por solapamiento de `ReportEditPage` |
| 6. Credenciales web | T20 | Sin proxy (S11): solo frontend, contraseña en memoria |
| 7. Android P0 ERP | T21–T24 | Bloquea la operación de planta en el teléfono |
| 8. Android/backend P1 | T25–T26 | Robustez; no bloquea la entrega, sí la calidad |
| 9. Release 7005 | T27 | Última: empaqueta todo lo anterior |

## Tareas

### T0 · Web: lane ejecutable para tests de componentes (Vitest + jsdom)

- **Objetivo.** Crear la lane que hoy no existe: `packages/frontend` solo corre
  `node --test --import tsx "src/**/*.test.ts"`, sin jsdom ni Testing Library, así que ningún `*.test.tsx` de
  este plan podría ejecutarse (S14). Instalar `vitest`, `@testing-library/react`, `@testing-library/jest-dom` y
  `jsdom` en `packages/frontend`; `vitest.config.ts` con `environment: 'jsdom'` y `setupFiles` para jest-dom;
  script `test:unit`, y `npm test` del paquete corriendo node:test + vitest; `scripts/ci.sh` gana
  `run_step 'Run frontend unit tests' npm test --workspace=@trindade/frontend`, porque hoy la CI solo corre los
  tests del backend y Playwright, nunca la lane unitaria del frontend.
- **Áreas.** `packages/frontend/package.json`, `packages/frontend/vitest.config.ts` (nuevo),
  `packages/frontend/src/test/setup.ts` (nuevo), `scripts/ci.sh`, `package-lock.json`.
- **Tests exactos.** Prueba de humo `src/components/ui/__smoke__.test.tsx` con Testing Library y jest-dom;
  `npm test --workspace=@trindade/frontend` verde con ambas lanes; `node --test` sigue tomando solo
  `src/lib/*.test.ts`; `npx vitest run` reporta `jsdom`.
- **Aceptación.** Un `*.test.tsx` nuevo corre en CI; los tests puros de `src/lib/*.test.ts` siguen en node:test
  sin cambios; Playwright no se toca; `scripts/ci.sh` falla si la lane unitaria del frontend falla.
- **Commit esperado.** `test(web): give the frontend an executable component-test lane` · ~120 líneas.
- **Depende.** —

### T1 · Backend: contrato de auditoría que acepte a los tres clientes

- **Objetivo.** Extender `AeroLogBodySchema` de forma aditiva para aceptar `event` de Android
  (`dispatch|sync|test`) además de los actuales, `phase: response` además de `requested|result`, y los campos
  nuevos `client`, `attemptId`, `durationMs`; conservar `.strict()` y los límites de tamaño tal como están: el
  servidor **rechaza**, no recorta (S15).
- **Áreas.** `packages/backend/src/modules/integration/aero.schema.ts`,
  `packages/backend/src/modules/integration/aero.log.service.ts` (línea con `client`/`attemptId`),
  `packages/backend/src/contracts/openapi.ts` (si el cuerpo se documenta), `logs/aero-integration.log` solo como
  dato de referencia.
- **Tests exactos.** `aero.routes.test.ts` (400 con body inválido, 200 con body de cada cliente),
  `aero.log.service.test.ts` (la línea escrita conserva `client`, `attemptId` y `durationMs`), y
  `packages/backend/src/modules/integration/aero.log.contract.test.ts` (nuevo).
- **Aceptación.** Los cuerpos reales de web y de Android responden 200; un body con credenciales, con campo
  desconocido o con `error` > 1024 o `note` > 256 sigue respondiendo 400 `INVALID_AERO_LOG`; el servidor no
  recorta nada; el `.log` gana un campo estructurado `client` y las líneas viejas siguen siendo válidas.
- **Commit esperado.** `feat(backend): accept the audit events both clients actually send` · ~180 líneas.
- **Depende.** —

### T2 · Contrato: test de paridad con los cuerpos reales de cada cliente

- **Objetivo.** Congelar el contrato con un test que pase por `AeroLogBodySchema` los cuerpos que emiten web y
  Android, extraídos de sus emisores reales, para que un cambio de enum en cualquiera de los tres lados falle
  antes de producción.
- **Áreas.** `packages/backend/src/modules/integration/aero.log.contract.test.ts`,
  `packages/android/app/src/test/java/com/trindade/app/aero/AeroTestAuditTest.kt` (fixtures espejo).
- **Tests exactos.** `aero.log.contract.test.ts` con una tabla `cliente → body → esperado (200/400)`;
  `AeroTestAuditTest` afirmando que el `AeroAuditLogRequest` serializado coincide con el fixture del backend.
- **Aceptación.** Si se renombra un evento en uno de los tres lados, falla al menos un test; ningún fixture usa
  datos inventados fuera del código de producción.
- **Commit esperado.** `test(aero): pin the audit contract to the bodies each client sends` · ~120 líneas.
- **Depende.** T1.

### T3 · Web: emisor de auditoría con identidad, correlación y error legible

- **Objetivo.** Emitir `client: 'web'`, `attemptId` por intento, `launchId` real cuando exista, `durationMs` y
  un `error` que sea código estable (`AERO_*`) en lugar de frase libre; dejar de inventar `httpStatus: 200` en
  `read_history/result` y de adjuntar `error` en `test_connection/requested`; recortar `error` a 1024 y `note` a
  256 antes de enviar, porque el servidor rechaza en lugar de recortar (S15).
- **Áreas.** `packages/frontend/src/lib/aero-audit.ts`, `packages/frontend/src/lib/aero-integration.ts`,
  `packages/frontend/src/lib/aero-feedback.ts` (mapeo código → mensaje), consumidores en
  `MassasLaunchPage.tsx`, `ReportsPage.tsx`, `ReceiptsSection.tsx`.
- **Tests exactos.** `src/lib/aero-audit.test.ts` (identidad, correlación, `durationMs`, no inventar status,
  recorte de `error` y `note`), `src/lib/aero-integration.test.ts` (payload de auditoría por camino),
  `src/lib/aero-feedback.test.ts` (código → texto, `params` conservados).
- **Aceptación.** Cada evento emitido lleva `client`, `attemptId` y `durationMs`; ningún `error` viaja como
  prosa; `via=bridge|shortcut` se conserva como transporte y no como identidad de app; un `error` de 3000
  caracteres sale recortado a 1024 y el evento se acepta.
- **Commit esperado.** `fix(web): tell the audit log which app is calling and how long it took` · ~200 líneas.
- **Depende.** T1.

### T4 · Android: dejar de perder la respuesta del log y firmar su identidad

- **Objetivo.** Que `AeroMirrorAdapter.log` mire el estado de la respuesta (y loguee localmente el rechazo),
  enviar `client: 'android'`, `attemptId` y `durationMs` en cada evento, alinear el enum de eventos con el
  contrato de T1 y recortar `error` a 1024 y `note` a 256 antes de enviar (S15).
- **Áreas.** `packages/android/app/src/main/java/com/trindade/app/aero/AeroAdapters.kt`,
  `AeroAudit.kt`, `AeroDispatcher.kt`, `AeroErpClient.kt`, `network/MassasApi.kt` (request/response del log).
- **Tests exactos.** `AeroTestAuditTest.kt` (payload completo, `client=android` y recorte de `error`/`note`),
  `AeroErpClientTest.kt` (un 400 del endpoint de log no rompe la operación pero queda registrado),
  `AeroDispatcherTest.kt`.
- **Aceptación.** Un 400 de `/log` aparece en logcat/telemetría con el código del backend; el resto de la
  operación no cambia de resultado; ningún evento sale sin `attemptId` ni por encima de 1024/256 caracteres.
- **Commit esperado.** `fix(android): stop swallowing the audit response and name the client` · ~160 líneas.
- **Depende.** T1.

### T5 · Auditoría: cubrir los caminos que hoy no escriben

- **Objetivo.** Emitir eventos donde hoy no hay ninguno: recepciones web (`ReceiptsSection.tsx:135`), reportes
  web (`ReportsPage.tsx:68`), importación web (`MassasLaunchPage.tsx:564-593`), importación Android
  (`MassasLaunchViewModel.kt:578-618`) y dispatch/sync cuando la integración no está configurada (que hoy
  termina en silencio).
- **Áreas.** Los cinco puntos anteriores más `packages/frontend/src/lib/aero-audit.ts` y
  `packages/android/app/src/main/java/com/trindade/app/aero/AeroDispatcher.kt`.
- **Tests exactos.** `src/lib/aero-audit.test.ts` (una aserción por camino nuevo),
  `src/components/reports/receipts-sync-wiring.test.ts` (se emite al sincronizar),
  `MassasLaunchViewModelTest.kt` (importación registra evento con `launchId`).
- **Aceptación.** Para cada camino, un test que falla si el evento desaparece; el `.log` de una jornada real
  contiene al menos una línea de recepciones y una de importación.
- **Commit esperado.** `feat(aero): record the paths that were operating without a trace` · ~180 líneas.
- **Depende.** T3, T4.

### T6 · Web: `DateField` que abre el calendario en escritorio

- **Objetivo.** Que el control abra el picker con clic y con teclado en escritorio (hoy es un
  `<input type="date">` con `opacity-0` y sin `showPicker()`), conserve táctil y muestre el foco.
- **Áreas.** `packages/frontend/src/components/ui/date-field.tsx`.
- **Tests exactos.** `src/components/ui/DateField.test.tsx` (nuevo, Testing Library: `showPicker` invocado con
  clic real, fallback si no existe, teclado Enter/Espacio, `onChange` propaga ISO), e2e
  `src/__e2e__/date-field.spec.ts` (nuevo: clic abre el picker nativo en Chromium).
- **Aceptación.** Clic en el control dispara apertura del calendario; ningún consumidor cambia de API; los tests
  actuales que usan `.fill()` se mantienen verdes y se añade uno con clic. Verificado en 390×844 y en escritorio
  (S18).
- **Commit esperado.** `fix(web): make the date control open its calendar on a desktop click` · ~90 líneas.
- **Depende.** —

### T7 · Web: Histórico de Massas como lista de días (modelo Android)

- **Objetivo.** Reemplazar el `DateField` único por una lista de días clicables con su estado (hoy, ayer, día
  con datos), tal como `MassasHistoryScreen.kt:87-135`; el día elegido gobierna la tabla y se conserva el
  enlace profundo por `date` en la URL.
- **Áreas.** `packages/frontend/src/pages/MassasHistoryPage.tsx`, nuevo componente
  `src/components/massas/MassasDayList.tsx`, `src/i18n/locales/{es,pt-BR}.json`.
- **Tests exactos.** `src/pages/MassasHistoryPage.test.tsx` (nuevo: lista de días, día sin datos, clic cambia la
  tabla, URL conserva `date`), e2e `src/__e2e__/massas-history.spec.ts` (nuevo, clic real).
- **Aceptación.** En escritorio se puede cambiar de día sin picker; el día activo es visible; un día sin datos
  no se confunde con un error; el enlace profundo sigue funcionando. Verificado en 390×844 y en escritorio
  (S18).
- **Commit esperado.** `feat(web): pick the day of the massas history from a list of days` · ~220 líneas.
- **Depende.** T6.
- **Hecho.** `e676cf0` (lista de días, URL y estado vacío) + `01c5b01` (tests unitarios y e2e). Se dividió en
  dos porque el conjunto sumaba 458 líneas y el tope por commit es 400.
  - Evidencia: `npm run test:node` 480/480, `npm run test:unit` 12/12 (3 archivos),
    `npx playwright test massas-history` 2/2 en 390×844 y 1280×800.
  - Hallazgo al implementar: el histórico rechaza escrituras en días pasados (`MASSAS_HISTORY_FROZEN`), así que
    el e2e no puede fabricar un día con lanzamientos; ese caso queda en el test de componentes, que sí puede
    responder cualquier día. El e2e cubre el enlace profundo, el clic real y el día vacío.
  - Decisión: "hoy" no se ofrece en la lista. Abrirlo llevaría a un día congelado que se sigue lanzando y la
    página lo rechaza por diseño, así que un chip "Hoy" solo podría caer en ayer.

### T8 · Web: Histórico de Contagem con picker y chips

- **Objetivo.** Portar el modelo Android (`StockHistoryScreen.kt:132-133,167-192,268-279`): picker en diálogo
  más chips de días recientes, sin depender de `DateField` como único control.
- **Áreas.** `packages/frontend/src/pages/StockHistoryPage.tsx`, `src/components/ui/month-picker-dialog.tsx`
  (reutilizable) o nuevo `day-picker-dialog.tsx`.
- **Tests exactos.** `src/pages/StockHistoryPage.test.tsx` (nuevo: chips, picker abre/cierra, día elegido
  recarga), e2e `src/__e2e__/stock-history.spec.ts` (nuevo).
- **Aceptación.** Elegir día desde el picker recarga los datos; los chips reflejan días con conteo; el limpiar
  vuelve al día por defecto. Verificado en 390×844 y en escritorio (S18).
- **Commit esperado.** `feat(web): give the stock history a day picker and recent days` · ~200 líneas.
- **Depende.** T6.
- **Hecho.** `3868188`. En vez de un diálogo de calendario propio se extendió `DateField` con la variante
  `panel`: el calendario sigue siendo el del sistema, que es lo que el teléfono usa (`DatePickerDialog`), y no
  se duplica la lógica de `showPicker()` que T6 ya resolvió. Los chips son el segundo control que la tarea
  pedía; el "limpiar" no aplica porque el día por defecto es ayer y el chip de ayer está siempre a un toque.
  - Evidencia: `npm run test:node` 480/480, `npm run test:unit` 15/15, `stock-history.spec.ts` 2/2 en 390×844
    y 1280×800, backend 667/667 (por el registro de rutas de contagem en el servidor e2e).
  - Hallazgo: el servidor e2e no registraba `stockRoutes`, así que esta pantalla respondía 404 en las pruebas
    de navegador; ahora las sirve como producción. Verificado en capturas a 390×844 y 1280×900.

### T9 · Web: historiales de Reportes y Cargas recargan al elegir fecha

- **Objetivo.** Corregir que elegir fecha no recarga (`useEffect(..., [])`), añadir limpiar y `min/max`, y
  conservar el filtro por usuario del histórico de cargas, que es una ventaja de la web.
- **Áreas.** `packages/frontend/src/pages/ReportHistoryPage.tsx`,
  `packages/frontend/src/pages/LoadingHistoryPage.tsx`.
- **Tests exactos.** `src/pages/ReportHistoryPage.test.tsx` y `src/pages/LoadingHistoryPage.test.tsx` (nuevos:
  el cambio de fecha dispara nueva consulta, limpiar restaura, `min`/`max` presentes), e2e
  `src/__e2e__/loading-history.spec.ts` ampliado y `src/__e2e__/report-history.spec.ts` ampliado.
- **Aceptación.** Cambiar la fecha vuelve a pedir datos; el botón limpiar vuelve al estado por defecto; el
  filtro por usuario sigue vivo; ninguna consulta queda con `date` inválido. Verificado en 390×844 y en
  escritorio (S18).
- **Commit esperado.** `fix(web): reload the report and loading histories when the day changes` · ~140 líneas.
- **Depende.** T6.
- **Hecho.** `16a7e39`. El efecto pasa a depender del lector (`fetchReports`/`fetchItems`), que ya depende de
  fecha, mes y usuario: un solo cambio recarga sin botón. "Limpiar" aparece solo con algún filtro puesto.
  - Evidencia: unit 21/21 (6 archivos), `report-history.spec.ts` + `loading-history.spec.ts` 13/13 en
    navegador, node 480/480.
  - Decisión: `max` = hoy en ambos campos; no se puso `min`. El teléfono tampoco lo tiene y cualquier `min`
    inventaría la fecha en que arrancó el sistema, escondiendo reportes que existen.

### T10 · Web: dashboard de 6 tarjetas y panel «Resumo» (con i18n)

- **Objetivo.** Copiar el orden de Android: Reportes, Cronograma, Masas, Stock, Assaí, **Compartilhar App** y
  debajo el panel **Resumo** con cinco filas (cargamentos, reportes, usuarios, higiene `done/total`, recepción
  `done/total`); quitar la tarjeta de Histórico de Contagem, corregir el `<a>` anidado de la tarjeta de masas y
  el `xl:grid-cols-5`, y arreglar las cadenas `es` «Relatorios Totales» y «Mercancías».
- **Áreas.** `packages/frontend/src/pages/DashboardPage.tsx`, `src/i18n/locales/es.json`,
  `src/i18n/locales/pt-BR.json`.
- **Tests exactos.** `src/pages/DashboardPage.test.tsx` (nuevo: orden de tarjetas, ausencia de Histórico de
  Contagem, cinco filas del resumen con `done/total`, un solo `<a>` por tarjeta), e2e
  `src/__e2e__/dashboard.spec.ts` (nuevo) y `LocaleStringsParityTest` equivalente web si existe.
- **Aceptación.** El dashboard web se lee igual que el de Android; `done/total` viene de `/dashboard/summary`
  sin tocar backend; no hay enlaces anidados ni textos en español con portugués. Verificado en 390×844 y en
  escritorio (S18).
- **Commit esperado.** `feat(web): read the dashboard as six cards and one summary panel` · ~220 líneas.
- **Depende.** —
- **Hecho.** `9f04860`. Seis tarjetas (Reportes, Cronograma, Masas, Stock, Assaí, Compartir App) y panel
  «Resumo» con las cinco filas; salen Histórico de Contagem y las tres tarjetas de números. La tarjeta de masas
  deja de ser enlace y ofrece dos puertas, así que no queda ancla anidada. Grilla `lg:grid-cols-3` para que las
  seis no dejen una huérfana. Copia `es` corregida: «Reportes totales», «Mercaderías».
  - Evidencia: `DashboardPage.test.tsx` 4/4, `dashboard.spec.ts` 6/6 (390×844 y 1280×900, incluido desborde
    horizontal), node 480/480, Vitest 25/25. Capturas: `/tmp/t10-dashboard-phone.png`,
    `/tmp/t10-dashboard-desktop.png`.
  - Decisión: la fila de higiene/recepción de la tarjeta sigue mostrando solo `done`, como el teléfono y como la
    propia copia `pt-BR`; el par `done/total` se lee en el panel. Cambiar la tarjeta sería cambiar la frase, y
    eso se decide una vez, en el idioma.

### T11 · Web: interruptor por tipo de caja en Montagem das Caixas

- **Objetivo.** Añadir el switch por categoría hija (`ReportForm.kt:110-147`): al apagarlo se ocultan sus
  tareas y se limpian checks, productos y temperaturas de ese tipo.
- **Áreas.** `packages/frontend/src/components/reports/CategorySection.tsx`,
  `packages/frontend/src/pages/ReportsPage.tsx`, `ReportEditPage.tsx`.
- **Tests exactos.** `src/components/reports/CategorySection.test.tsx` (nuevo: apagado oculta tareas, limpiar
  selección, encendido restaura), e2e `src/__e2e__/massas-report-section.spec.ts` ampliado.
- **Aceptación.** Un tipo apagado no envía productos ni temperaturas de ese tipo; la UI no deja tareas
  huérfanas marcadas; el estado es explícito en la sesión. Verificado en 390×844 y en escritorio (S18).
- **Commit esperado.** `feat(web): switch a box type off together with its tasks` · ~180 líneas.
- **Depende.** —
- **Hecho.** `0a0e945` (~430 líneas: la refactorización de `CategorySection` en `TaskBlocks` + interruptor pesó
  más de lo previsto; comportamiento y tests van juntos). La regla vive en `lib/report-box-types.ts`
  (`boxTypeEnabled`, `toggleBoxType`, `switchedOffTasks`), compartida por el formulario y la edición.
  - Evidencia: `report-box-types.test.ts` 5/5 (node), `CategorySection.test.tsx` 4/4 (Vitest),
    `report-box-types.spec.ts` 2/2 (390×844 y escritorio), node 485/485, Vitest 29/29.
  - Desvío: el e2e quedó en un spec propio (`report-box-types.spec.ts`) en vez de ampliar
    `massas-report-section.spec.ts`, que prueba la tarjeta de masas y no el interruptor.
  - Borde compartido, sin cambio: la validación de temperaturas sigue mirando todas las tareas activas, como el
    teléfono. Ningún tipo de caja tiene tareas de temperatura en el catálogo, así que hoy no hay campo oculto
    obligatorio; si un administrador lo creara, ambos clientes lo reclamarían igual y se decide en T19.

### T12 · Web/backend: payload completo con `checked=false` explícito

- **Objetivo.** Enviar una fila por tarea **no-temperature** (marcadas y no marcadas) desde la web y confirmar
  que el backend persiste `checked=0` en lugar de borrar la fila, sin alterar exportación ni contadores (S16).
  Las temperaturas siguen en `report_temperatures` y no se duplican en `report_items`.
- **Áreas.** `packages/frontend/src/pages/ReportEditPage.tsx`,
  `packages/backend/src/modules/reports/reports.command.service.ts` (verificación, no cambio si ya persiste),
  `packages/backend/src/modules/reports/export.service.ts` (contrato de lectura).
- **Tests exactos.** `src/pages/ReportEditPage.test.tsx` (nuevo: payload con todas las tareas no-temperature,
  una tarea de temperatura no genera fila de ítem),
  `packages/backend/src/modules/reports/reports.command.service.test.ts` (actualizar conserva `checked=0`),
  `export.service.test.ts` (una tarea no marcada no se exporta), `dashboard.routes.test.ts` (`higieneDone`
  cuenta solo `checked=1`).
- **Aceptación.** Tras guardar, `report_items` tiene una fila por tarea no-temperature; las temperaturas viven
  solo en `report_temperatures`; el export no incluye las no marcadas; `higieneDone/higieneTotal` sigue
  correcto. Verificado en 390×844 y en escritorio (S18).
- **Commit esperado.** `feat(reports): send every task, checked or not, and keep the unchecked rows` · ~140 líneas.
- **Depende.** T11.
- **Hecho.** `3a4894e` (~345 líneas). Regla nueva en `lib/report-items.ts` (`reportTasks`, `reportItems`), usada
  por el formulario y por la edición. El backend no cambió: ya insertaba `checked` como 0/1 y borraba por
  `report_id` al actualizar.
  - Evidencia: `report-items.test.ts` 4/4 (node), `ReportEditPage.test.tsx` 2/2 (Vitest, cuerpo del PATCH),
    `reports.command.service.test.ts` 5/5 (`getReport` conserva `checked=0` en alta y en edición),
    `dashboard.routes.test.ts` 11/11 (`higieneDone` = 1 con tres filas, dos sin marcar), `export.service.test.ts`
    ya cubría que la no marcada no sale. Frontend node 489/489, Vitest 31/31, backend 669/669.
  - Desvío: sin e2e propio. La cadena queda probada en los dos extremos por interfaces públicas (cuerpo del
    PATCH en el navegador simulado, filas leídas por `getReport` y por el resumen HTTP); un tercer nivel con
    navegador no agregaría una regla distinta.

### T13 · Web: solo lectura real y tareas de Recebimento visibles

- **Objetivo.** Pasar `readOnly` a `CheckTask` y `TemperatureTask` (hoy quedan clicables) y dibujar los hijos de
  Recebimento en reportes nuevos y edición.
- **Áreas.** `packages/frontend/src/components/reports/CategorySection.tsx`,
  `packages/frontend/src/pages/ReportsPage.tsx:394-412`,
  `packages/frontend/src/pages/ReportEditPage.tsx:443-464`.
- **Tests exactos.** `src/components/reports/CategorySection.test.tsx` (checkbox y temperatura deshabilitados con
  `readOnly`), `src/pages/ReportsPage.test.tsx` y `ReportEditPage.test.tsx` (hijos de Recebimento presentes).
- **Aceptación.** En solo lectura ningún control acepta cambios; Recebimento muestra sus tareas en ambas
  pantallas. Verificado en 390×844 y en escritorio (S18).
- **Commit esperado.** `fix(web): keep read-only reports read-only and draw the receivings` · ~90 líneas.
- **Depende.** T11.
- **Hecho.** `4d70fab` (~380 líneas; el corte de ~90 no se sostuvo porque dibujar los hijos sin repetir el
  encabezado pidió sacar `BoxTypeList` de `CategorySection`).
  - `CheckTask` y `TemperatureTask` reciben `readOnly`: `disabled` más el corte en el `onChange`, porque un
    control deshabilitado sigue disparando eventos sintéticos. `ProductCheckTask` ya lo tenía.
  - El espejo del ERP reemplaza el checklist de Recebimento, no las categorías que cuelgan de ella. En el
    formulario el corte dibujaba `null` -- la categoría entera, hijos incluidos; en la edición se perdían solo
    los hijos. Ahora los dos dibujan `BoxTypeList` con los hijos.
  - Evidencia: `CategorySection.test.tsx` 5/5 (checkbox, temperatura rellena y sin marcar, todos `disabled`),
    `BoxTypeList.test.tsx` 5/5, `ReportsPage.test.tsx` 3/3 (nuevo), `ReportEditPage.test.tsx` 3/3. Frontend
    node 489/489, Vitest 41/41.
  - Verificado en 390×844 y 1280×900 con el registro del corte: el espejo arriba, el hijo con su interruptor
    debajo, ningún control apretable; `page.evaluate` confirma `disabled` en las tres tareas y en la temperatura.

### T14 · Web: catálogo de productos desde `/reports/products`

- **Objetivo.** Reemplazar la copia local `productTemplates.ts` por el catálogo del backend, como hace Android,
  para que un producto nuevo no exista solo en el servidor.
- **Áreas.** `packages/frontend/src/components/reports/productTemplates.ts`,
  `src/pages/ReportEditPage.tsx`, `ReportsPage.tsx`, cliente de API.
- **Tests exactos.** `src/pages/ReportEditPage.test.tsx` (productos llegan de la API, fallback visible si la
  llamada falla), `src/lib/report-products.test.ts` (mapeo).
- **Aceptación.** No queda catálogo duplicado; un producto agregado en backend aparece en la web sin
  despliegue. Verificado en 390×844 y en escritorio (S18).
- **Commit esperado.** `refactor(web): read the report products from the server catalogue` · ~160 líneas.
- **Depende.** T12.
- **Hecho.** `297d3ec` (~150 líneas). `lib/report-products.ts` (`readReportProducts`) valida la respuesta; las
  dos pantallas piden `/reports/products` en su propia llamada y `CategorySection`/`BoxTypeList`/`TaskBlocks`
  reciben el catálogo. `productTemplates.ts` borrado.
  - Fallback: no se conservó copia local. Ante una respuesta inválida o un error, las tareas de producto no
    pintan casillas y muestran `report-products-unavailable` ("no se pudo cargar la lista"): una lista vacía se
    leería como «ese producto no existe» y el operario dejaría de cargar. La regla «no queda catálogo
    duplicado» pesó más que la palabra «fallback» del enunciado.
  - Evidencia: `report-products.test.ts` 5/5, `CategorySection.test.tsx` 8/8 (oferta del servidor, aviso sin
    catálogo, producto deshabilitado en solo lectura), `ReportsPage.test.tsx` 5/5 (oferta desde la API y aviso
    con el endpoint caído sin perder el resto del formulario), `ReportEditPage.test.tsx` 4/4. Frontend node
    494/494, Vitest 47/47.
  - Verificado en 390×844 y 1280×900 con el endpoint sirviendo y fallando: casillas de Assaí y Normal desde la
    API, y el aviso en amarillo en su lugar cuando el servidor no responde.

### T15 · Android: limpiar el estado de cajas al crear o editar

- **Objetivo.** `onReportCreatedHandled` no limpia `disabledBoxTypeIds` y editar no resiembra los switches.
  Decisión D2: «caja no montada» es **estado de sesión**, no se persiste (S13). Limpiar el estado al crear,
  abrir ambos tipos ON al editar (igual que Android hoy) y documentarlo en el código.
- **Áreas.** `packages/android/app/src/main/java/com/trindade/app/reports/ReportGeneratorViewModel.kt`
  (`:337-355`), `ReportForm.kt`.
- **Tests exactos.** `packages/android/app/src/test/java/com/trindade/app/reports/ReportGeneratorViewModelTest.kt`
  (nuevo caso: crear limpia el estado; editar abre ambos tipos ON) y
  `testDebug/.../ReportBoxTypeSwitchTest.kt` ampliado.
- **Aceptación.** Tras guardar, el formulario arranca con ambos tipos ON; al editar, ambos tipos ON; no existe
  columna, bandera persistida ni migración; un comentario en `ReportGeneratorViewModel` dice que es estado de
  sesión.
- **Commit esperado.** `fix(android): keep the box switches in session state` · ~120 líneas.
- **Depende.** —
- **Hecho.** `c78ce5b` (~55 líneas). `onReportCreatedHandled` limpia `disabledBoxTypeIds`; `ReportEditViewModel`
  lo resiembra vacío en cada carga. En los dos casos con un comentario que dice que es estado de sesión (D2,
  S13) y qué se pierde si sobrevive: un reporte que abre con un tipo afuera y sus cajas sin registrar.
  - Evidencia: `ReportGeneratorViewModelTest` (nuevo caso `a delivered report takes the box switches with it`)
    y `ReportEditViewModelTest` (`a load opens both box types, whatever the previous report had switched off`).
    Con las dos líneas de producción revertidas los dos casos fallan; con el cambio, la lane
    `testDebugUnitTest` de las dos clases pasa entera.
  - `ReportBoxTypeSwitchTest` no cambió: el dibujo ya afirmaba que el estado vacío enciende los dos
    interruptores, y lo que T15 arregla es quién deja ese estado vacío, que es de los ViewModel.
  - Sin columna, sin bandera persistida y sin migración: el esquema no se tocó.

### T16 · Web: Horário con modal de pestañas, multiselección y chapa

- **Objetivo.** Portar el modal de Android (`LoadingScreen.kt:493-531`, `:634-652`, `:663-691`, `:591-610`):
  pestañas Fleteros / Motoristas da Casa, selección múltiple, chapa por fila, contador «Aceptar/Cancelar», y
  retener los fallos parciales de la tanda.
- **Áreas.** `packages/frontend/src/components/loading/DriverSelect.tsx`,
  `packages/frontend/src/pages/LoadingSchedulePage.tsx`, `src/i18n/locales/{es,pt-BR}.json`.
- **Tests exactos.** `src/components/loading/DriverSelect.test.tsx` (nuevo: pestañas, selección múltiple,
  chapa por fila, contador), e2e `src/__e2e__/loading-schedule.spec.ts` ampliado (asignar tres conductores de
  una vez).
- **Aceptación.** Asignar tres conductores cuesta una sola apertura del modal; un fallo parcial deja los éxitos
  aplicados y los fallos retenidos con reintento; la chapa queda escrita en cada fila. Verificado en 390×844 y
  en escritorio (S18).
- **Commit esperado.** `feat(web): assign several drivers from one modal, each with its plate` · ~340 líneas.
- **Depende.** —
- **Estado.** Hecho. Seis commits, porque la funcionalidad no entra en uno por debajo de 400 líneas.
  - **50a10a7** — reglas de qué se puede marcar y qué manda cada fila (`batchRows`, `togglePick`,
    `chooseVehicle`, `missingPlates`, `refusalMessage`). Nueve tests después del reintento.
  - **edc72fb** — `DriverPickerDialog`: pestañas, checkbox por fila, chapa por fila, contador y pie fijo.
  - **00569e9** — `DriverPicker`: la tanda se manda fila por fila contra `POST /loading/schedules`.
  - **cf8a320** — `ScheduleGrid` abre el modal por horario y el panel viejo desaparece; `DriverSelect.test.tsx`
    se va con él (sus casos quedaron en los dos nuevos).
  - **911b52d** — retención del fallo parcial: `onlyRefused` deja marcado sólo lo rechazado, cada rechazo lleva
    el nombre de su fila y el botón de reintentar manda nada más que eso.
  - **df59d9d** — el fletero registrado dentro del modal entra en la tanda (se armaba con las props y él no
    estaba), y la grilla deja de reemplazarse por el spinner en cada recarga: el spinner se llevaba el modal y
    con él las filas rechazadas. El spinner queda para la primera lectura del día.
  - Pruebas: `node --test src/lib/loading-picker.test.ts` → 9/9; `vitest run` de `DriverPicker.test.tsx` y
    `DriverPickerDialog.test.tsx` → 9/9; suite frontend completa → 503/503 en `node:test` y 13 archivos / 56
    tests en vitest; `tsc --noEmit` limpio. e2e `loading-schedule.spec.ts` → 12/12, incluidos «asigna tres
    fleteros en una sola apertura» y «quick-add entra en la tanda».
  - Visto en 390×844 y en 1280×900 (`/tmp/t16-fleteros-phone.png`, `/tmp/t16-casa-phone.png`,
    `/tmp/t16-casa-desktop.png`): con la grilla detrás en gris, la lista scrollea, el pie con contador y
    Aceptar/Cancelar queda fijo, y la pestaña «Motoristas da casa» dibuja el selector de chapa en cada fila.

### T17 · Web: bugs de cuota, off-by-one, slots huérfanos y spinners

- **Objetivo.** Corregir la cuota por slot exacto frente a la ventana ±60 (`ScheduleGrid.tsx:65-108`), el
  off-by-one de edición (`LoadingEditPage.tsx:226`), los slots huérfanos invisibles (`:144`), el código muerto
  `isRollingQuotaMaxed`, y el spinner de página completa tras cada asignación.
- **Áreas.** `packages/frontend/src/components/loading/ScheduleGrid.tsx`,
  `packages/frontend/src/pages/LoadingEditPage.tsx`, `src/lib/loading-quota.ts`.
- **Tests exactos.** `src/lib/loading-quota.test.ts` (nuevo o ampliado: ventana ±60, bordes), 
  `src/pages/LoadingEditPage.test.tsx` (off-by-one, slots huérfanos visibles), e2e
  `src/__e2e__/loading-schedule.spec.ts` (spinner local, no de página).
- **Aceptación.** Dos slots dentro de la ventana cuentan como el mismo turno; editar no desplaza una fila; un
  slot huérfano se ve y se puede limpiar; la asignación no bloquea la pantalla. Verificado en 390×844 y en
  escritorio (S18).
- **Commit esperado.** `fix(web): count the loading quota by window and stop shifting edited rows` · ~200 líneas.
- **Depende.** T16.
- **Estado.** Hecho, en tres commits más las pruebas de cada uno.
  - **06ca846** — `lib/loading-quota.ts` con `countInWindow`, `quotaIfMoved` e `isQuotaExceeded`, y la grilla
    usando esa regla para la insignia y para el aviso: antes la insignia contaba por minuto exacto y el aviso
    por ventana, así que un horario con un fletero decía «1/3» junto a «límite alcanzado». Se va el código
    muerto `isRollingQuotaMaxed`.
  - **1d6c51c** — la grilla dibuja los horarios de la lista **y** los que aparecen en las filas, ordenados por
    hora: una carga en 23:30 no se veía, contaba para la cuota y sólo se podía borrar por API.
  - **d992e5b** — `LoadingEditPage` cuenta con la misma regla y deja la fila fuera de su propia ventana antes de
    sumarla donde va: mover una fila a la hora que ya tenía la mostraba con un fletero de más. Su selector
    ofrece siempre la hora que la fila ya ocupa.
  - **89ddc56** — el spinner del horario vuelve a ser el de la primera lectura. Lo que `df59d9d` había dejado
    a medias: la condición miraba cuántas filas había, y un día vacío tiene cero, así que cada recarga volvía a
    tapar la pantalla con el spinner y se llevaba el modal con las filas rechazadas.
  - Pruebas nuevas: `src/lib/loading-quota.test.ts` (8 casos `node:test`: bordes de la hora, casa vs fletero,
    exclusión de la fila que se mueve), `src/components/loading/ScheduleGrid.test.tsx` (cuota del turno,
    aviso, hora huérfana dibujada y ordenada), `src/pages/LoadingEditPage.test.tsx` (off-by-one rojo con
    `3/3` donde hay dos, hora propia ofrecida) y `src/pages/LoadingSchedulePage.test.tsx` (el modal sobrevive
    la recarga de una tanda a medias, con el día vacío como caso duro). Las dos últimas se vieron en rojo
    contra el código anterior: `04:00 (3/3)` y el spinner reemplazando la grilla.
  - Suite: 511/511 en `node:test`, 16 archivos / 64 tests en vitest, `tsc --noEmit` limpio.
  - Visto en 390×844 y 1280×900 (`/tmp/t17-grid-phone.png`, `/tmp/t17-edit-phone.png` y sus pares de
    escritorio): 04:30, 05:00 y 05:30 leen 3/3 (el mismo turno), 04:00 lee 0/3 (la hora exacta anterior ya es
    otro turno), 23:30 se dibuja con su «1/3» y en la edición su select abre en 23:30 y ofrece esa hora.

### T18 · Web: historial de cargas y grilla con paridad Android

- **Objetivo.** Abrir el día desde el historial, retry, editar fila desde la grilla, papelera de 48 dp, textos
  sin emoji hardcodeado, editar sin pantalla destructiva y conservar el filtro por usuario.
- **Áreas.** `packages/frontend/src/pages/LoadingHistoryPage.tsx`,
  `packages/frontend/src/components/loading/ScheduleGrid.tsx`, `src/i18n/locales/{es,pt-BR}.json`.
- **Tests exactos.** `src/pages/LoadingHistoryPage.test.tsx` (abrir día, retry, filtro usuario),
  `src/components/loading/ScheduleGrid.test.tsx` (editar fila, papelera con área de 48 dp), e2e
  `src/__e2e__/loading-history.spec.ts`.
- **Aceptación.** Desde el historial se entra al día; un fallo se puede reintentar; editar no destruye datos;
  no queda texto duplicado en portugués dentro de la UI española. Verificado en 390×844 y en escritorio (S18).
- **Commit esperado.** `feat(web): open and retry a loading day from its history` · ~240 líneas.
- **Depende.** T17.
- **Estado.** Hecho, en cuatro commits.
  - **1ee69f4** — el historial reintenta la lectura que falló sin perder los filtros (antes sólo quedaba
    recargar la página, y con eso se iban el día y el operario elegidos), y la tarjeta escribe la cantidad y la
    fecha de carga desde el catálogo: se iban `📦 4 carregamentos` y `Carregamento:` escritos en el marcado.
  - **a379a7c** — la grilla gana el lápiz por fila, que abre `/loading/edit?date=…&edit=<id>` con esa fila ya
    en edición; las dos acciones de la fila miden 48×48 y el emoji del aviso de cuota pasa a ícono decorativo.
  - **da2f9ef** — e2e: la tarjeta abre el día que nombra, con sus filas, y una lectura que falla una vez se
    reintenta desde la alerta con el filtro todavía puesto.
  - **407b1c9** — el horario vacío tiene su propia frase: antes era la del día cortada en el primer punto, y en
    un día con cuatro camiones a las 04:00 la tarjeta de las 04:30 decía que no había ninguna carga ese día.
  - **9760daa** — las acciones de un lote (desactivar, eliminar) también miden 48×48 y la píldora de cantidad
    deja de partirse en dos líneas.
  - Pruebas: `LoadingHistoryPage.test.tsx` (reintento, textos y plurales, área de toque), `ScheduleGrid.test.tsx`
    (lápiz con su destino, filas sin permiso sin lápiz, 48×48, frase del horario vacío), `LoadingEditPage.test.tsx`
    (la fila señalada abre en edición) y `src/__e2e__/loading-history.spec.ts` (8/8, incluidos los dos casos
    nuevos). Suite: 511/511 `node:test`, 17 archivos / 72 tests vitest, `tsc --noEmit` limpio.
  - Visto en 390×844 y 1280×900 (`/tmp/t18-grid-phone.png`, `/tmp/t18-edit-phone.png`,
    `/tmp/t18-history-phone.png` y sus pares de escritorio): el lápiz abre la fila 12 en edición en los dos
    tamaños, y la tarjeta del historial lee «6 carregamentos» y «Carregamento: 03/11/2026» sin emoji.

### T19 · Web: errores y recursos del cronograma

- **Objetivo.** Distinguir «día vacío» de error, mensaje cuando no hay vehículos configurables, hacer alcanzable
  `scheduleAlreadyExists`, y cerrar la fuga de DOM si falla el PDF.
- **Áreas.** `packages/frontend/src/pages/LoadingSchedulePage.tsx`,
  `packages/frontend/src/lib/schedule-pdf.ts`, `src/i18n/locales/{es,pt-BR}.json`.
- **Tests exactos.** `src/pages/LoadingSchedulePage.test.tsx` (error ≠ vacío, sin vehículos, conflicto),
  `src/lib/schedule-pdf.test.ts` (recurso liberado en fallo).
- **Aceptación.** Un fallo de red no se presenta como día vacío; un cronograma duplicado devuelve su mensaje; no
  queda nodo oculto tras exportar con error. Verificado en 390×844 y en escritorio (S18).
- **Commit esperado.** `fix(web): say what actually failed on the loading schedule` · ~130 líneas.
- **Depende.** T18.
- **Estado.** Hecho, en un commit.
  - **0b48eeb** — el día que no se pudo leer ya no se dibuja como día vacío: `readError` es estado propio, toma
    el lugar de la grilla y trae el reintento (`loading-schedule-read-error` / `loading-schedule-retry`). Sigue
    habiendo un `error` aparte para el borrado y la exportación.
  - **0b48eeb** — `src/lib/schedule-pdf.ts`: el nodo de texto se arma, se usa y se libera en un solo lugar, con
    `finally`; las dos páginas que exportaban (`LoadingSchedulePage`, `LoadingEditPage`) lo usan. Antes, un
    fallo del escritor dejaba el nodo colgado en el documento, uno por intento.
  - **0b48eeb** — `scheduleAlreadyExists` es alcanzable: el backend agrega `code` al 409/400 del día cerrado
    (`loading.routes.ts`), `ApiClientError` lo guarda, y `refusalMessage` lo lee antes que el estado, porque 409
    también es un conductor duplicado y el 400 del día cerrado traía una frase traducida por el servidor.
  - **0b48eeb** — una planta sin chapas cargadas lo dice (`driver-select-no-vehicles`), en vez de dejar que el
    único mensaje sea «Falta la chapa de Silvana».
  - Pruebas: `LoadingSchedulePage.test.tsx` (fallo ≠ día vacío, reintento), `DriverPickerDialog.test.tsx`
    (sin vehículos vs. vehículos que no llegaron), `lib/schedule-pdf.test.tsx` (nodo liberado en éxito y en
    fallo; la extensión es `.tsx` porque el lane de vitest sólo recoge `.test.tsx` y el de `node:test` no tiene
    DOM), `lib/loading-picker.test.ts` (día cerrado por código) y
    `backend/src/modules/loading/loading.routes.schedules.test.ts` (el día cerrado manda su código en es y pt).
    Suite: backend 55/55 en `loading`, web 512/512 `node:test`, 17 archivos / 79 vitest, `tsc --noEmit` limpio.
  - Visto en 390×844 y 1280×900 (`/tmp/t19-error-phone.png`): con la lectura abortada, la grilla no se dibuja,
    el aviso aparece con su reintento y el reintento devuelve la grilla en los dos tamaños.

### T20 · Seguridad: la contraseña del ERP deja de persistirse

- **Objetivo.** `localStorage` deja de guardar `password`; `wsUrl`, `username`, `shortcutName`, `syncEnabled` y
  `lastSyncAt` siguen ahí porque no son secretos. La contraseña vive **solo en memoria** de la pestaña y se pide
  al abrir la sesión; la migración borra una vez el valor existente y no lo vuelve a escribir; la UI explica
  que no se guarda en el dispositivo (S12). Sin backend, sin tabla y sin cifrado server-side: el proxy no es
  viable sin puente on-prem (S11).
- **Áreas.** `packages/frontend/src/lib/aero-integration.ts` (modelo leído/escrito y migración),
  `packages/frontend/src/pages/massas/AeroIntegrationPanel.tsx`,
  `packages/frontend/src/i18n/locales/{es,pt-BR}.json`, `packages/frontend/src/__e2e__/admin-integration.spec.ts`.
- **Tests exactos.** `src/lib/aero-integration.test.ts` (la lectura descarta `password`, guardar no la escribe,
  la migración borra una sola vez, un `password` en memoria no sobrevive a `load`, y una acción que necesita el
  ERP sin contraseña devuelve un fallo de sesión explícito), `src/pages/massas/aero-integration-panel.test.tsx`
  (nuevo: mensaje visible y campo pedido al abrir), e2e `admin-integration.spec.ts` (recargar la página vuelve a
  pedir la contraseña).
- **Aceptación.** Tras guardar, `localStorage` no contiene `password`; recargar pide la contraseña; el panel
  dice «la contraseña no se guarda en este dispositivo; se pide al abrir la sesión»; la migración limpia el
  valor viejo una sola vez; no hay `sessionStorage` persistente; una acción que necesita el ERP sin contraseña en
  memoria avisa que se pida al abrir la sesión y no falla en silencio; verificado en 390×844 y en escritorio
  (S18).
- **Commit esperado.** `fix(web): keep the ERP password in memory instead of localStorage` · ~140 líneas.
- **Depende.** —
- **Cerrada.** Cuatro commits: `dcbc2fc` (la lib y su migración), `016c30b` (el panel, el aviso y los dos
  caminos que fallaban en silencio), `e5ad503` (los e2e que sembraban la contraseña) y `3069818` (la ayuda del
  panel, que seguía pidiendo los tres campos para guardar).
  - Tests corridos: `aero-integration.test.ts` 85/85 `node:test`; `aero-integration-panel.test.tsx` 5/5 y
    `aero-password-session.test.ts` 4/4 (suites nuevas); vitest 84/84; web `node:test` 517/517;
    `tsc --noEmit` limpio; Playwright 103/103 (`admin-integration.spec.ts` 4/4).
  - Rojo verificado antes del verde: la lib fallaba por falta de `aeroMissingSetup` y el panel por el
    `aero-state` que la prueba pide.
  - Lo guardado no contiene `password` y una recarga pide la contraseña sin perder la dirección; lo comprueban
    el e2e de admin y `localStorage` leído desde la página.
  - La suite completa traía dos fallos ajenos a esta tarea, corregidos aparte en `8946c1d`: una aserción que
    negaba el literal `11` (que también está en la fecha de noviembre) y un locator que resolvía dos líneas del
    mismo insumo en la base compartida.
  - Visto en 390×844 (`/tmp/t20-plan-390.png`) y 1280×900 (`/tmp/t20-plan-1280.png`): el aviso cabe bajo el
    campo sin desbordar y el badge dice «Falta la contraseña de esta sesión».

### T21 · Android: feedback al guardar la integración y no fallar en silencio

- **Objetivo.** P0-1: `isSaving` nunca se asigna, así que guardar la configuración ERP no da señal;
  P0-5: dispatch/sync con integración no lista termina sin mensaje.
- **Áreas.** `packages/android/app/src/main/java/com/trindade/app/admin/IntegrationSettingsViewModel.kt:112-130`,
  `admin/AdminIntegrationCard.kt`, `massas/MassasLaunchViewModel.kt:404-405`.
- **Tests exactos.** `test/.../admin/IntegrationSettingsReadyTest.kt` (guardando/guardado/error),
  `test/.../massas/MassasLaunchViewModelTest.kt` (integración no lista produce error visible).
- **Aceptación.** Guardar muestra estado y resultado; una acción bloqueada por integración ausente dice por qué.
- **Commit esperado.** `fix(android): show the result of saving the ERP settings` · ~120 líneas.
- **Depende.** —

### T22 · Android: un solo `AeroFailure` y el mensaje de Wi-Fi

- **Objetivo.** P0-2: reemplazar los cinco mapeos divergentes por un modelo único de fallo con código y texto;
  P0-3: mensaje específico de Wi-Fi/SSID en todos los botones, con `AeroReachability` leyendo SSID (hoy
  `aero_plant_probe_wifi` está muerto).
- **Áreas.** `packages/android/app/src/main/java/com/trindade/app/aero/AeroLogic.kt`, `AeroReachability.kt`,
  `AeroErpClient.kt`, `MassasErpSyncCard.kt`, `MassasLaunchScreen.kt`.
- **Tests exactos.** `test/.../aero/AeroFailureTest.kt` (nuevo: tabla código → mensaje), `AeroLogicTest.kt`,
  `AeroErpClientTest.kt` (red distinta detectada), `testDebug/.../massas/MassasErpSyncCardTest.kt`.
- **Aceptación.** Un mismo fallo se lee igual en todas las superficies; estar en otra red produce el mensaje de
  Wi-Fi, no un error genérico; no queda código muerto de reachability.
- **Commit esperado.** `refactor(android): one failure model and a real Wi-Fi message` · ~260 líneas.
- **Depende.** T21.

### T23 · Android: cola persistente y guardia contra el doble asiento

- **Objetivo.** P0-4: cola persistente equivalente a `aero-queue.ts` (TTL, reintento, sobrevive reinicio);
  P0-6: evitar el doble asiento con guarda `RECONCILED` y refresco del espejo.
- **Áreas.** nuevo `packages/android/app/src/main/java/com/trindade/app/aero/AeroQueue.kt` +
  `AeroQueueStore.kt`, `AeroDispatcher.kt`, `MassasLaunchViewModel.kt`, `AeroErpClient.kt`.
- **Tests exactos.** `test/.../aero/AeroQueueTest.kt` (nuevo: TTL 8 h, reintento, reinicio, tope 8),
  `MassasLaunchViewModelTest.kt` (un asiento ya conciliado no se reenvía), `AeroDispatcherTest.kt`.
- **Aceptación.** Cerrar la app no pierde pendientes; un asiento conciliado no se duplica; el espejo se refresca
  tras conciliar.
- **Commit esperado.** `feat(android): keep the ERP queue across restarts and refuse duplicated seats` · ~340 líneas.
- **Depende.** T4.

### T24 · Backend y clientes: multioperario real por asiento

- **Objetivo.** P0-7: `operator_name` es uno por request y `createMassaLaunches` aplica un solo `ownerId`; el
  asiento debe llevar su operario. El cambio no se queda en el backend: si el contrato pasa a `operator_name`
  por ítem, la web (`MassasLaunchPage.tsx`) y el DTO de Android tienen que mandarlo, con compatibilidad para el
  payload viejo de un solo operario (S17).
- **Áreas.** `packages/backend/src/modules/massas/massas.routes.ts:88-94`,
  `packages/backend/src/modules/massas/massas.service.ts:177-191,225`, contratos y OpenAPI,
  `packages/frontend/src/pages/MassasLaunchPage.tsx` (payload de importación/lote),
  `packages/android/app/src/main/java/com/trindade/app/network/MassasApi.kt` (DTO del lote).
- **Tests exactos.** `massas.routes.test.ts` (payload con dos operarios y payload viejo con uno),
  `massas.service.test.ts` (cada asiento con su `ownerId`),
  `packages/backend/src/contracts/route-coverage.test.ts`, `src/pages/MassasLaunchPage.test.tsx` (la web manda
  el operario por asiento) y `packages/android/app/src/test/java/com/trindade/app/network/MassasImportPayloadTest.kt`
  (DTO con más de un asiento).
- **Aceptación.** Dos asientos del mismo día con operarios distintos se guardan con su dueño, vengan de la web
  o de Android; el payload viejo de un solo operario sigue funcionando; el contrato generado refleja el campo
  por ítem.
- **Commit esperado.** `feat(massas): let each seat carry its own operator` · ~300 líneas (si excede 400, se
  parte en backend y clientes).
- **Depende.** —

### T25 · Web: errores y consultas ERP con el detalle correcto

- **Objetivo.** Quitar el fallback `WILKIN` de `readAeroTestResult` (falso positivo), no mostrar `err.message`
  crudo en la importación, no perder el detalle en `ReceiptsSection` ni los `params` en `syncFeedback`, y usar
  la taxonomía existente cuando `message` es `null`. Mantener la semántica de lote (N POST, `AERO_BATCH_MAX=8`,
  TTL 8 h).
- **Áreas.** `packages/frontend/src/lib/aero-integration.ts:289-328`, `lib/aero-feedback.ts:74-97`,
  `pages/MassasLaunchPage.tsx:515,586-589`, `components/reports/ReceiptsSection.tsx:75-77,115-120`.
- **Tests exactos.** `src/lib/aero-integration.test.ts` (usuario ausente ≠ `WILKIN`),
  `src/lib/aero-feedback.test.ts` (`params` conservados), `src/components/reports/receipts-sync-wiring.test.ts`,
  `src/lib/aero-queue.test.ts` (semántica de lote intacta).
- **Aceptación.** Un test sin usuario no se reporta como exitoso; ningún mensaje crudo del ERP llega a la UI;
  el detalle de la sincronización sobrevive hasta el aviso. Verificado en 390×844 y en escritorio (S18).
- **Commit esperado.** `fix(web): stop masking ERP failures with a successful-looking answer` · ~150 líneas.
- **Depende.** T3.

### T26 · Android: P1 de lote, `owner_status`, hints y ack reversible

- **Objetivo.** Límite de 8 por tanda con troceo y «reintentar fallidos»; leer `owner_status`; hint «no cierra
  cajas enteras»; ack por día reversible; tests que lo cubran.
- **Áreas.** `packages/android/app/src/main/java/com/trindade/app/massas/MassasLaunchViewModel.kt`,
  `MassasLaunchScreen.kt`, `AeroDispatcher.kt`, `reports/MassasDayCard.kt`.
- **Tests exactos.** `test/.../massas/MassasLaunchViewModelTest.kt` (troceo 8, reintento de fallidos,
  `owner_status`, ack reversible), `testDebug/.../massas/MassasDayHeaderTest.kt` (hint de cajas).
- **Aceptación.** Una tanda de 20 se envía en 8+8+4; un fallo parcial se puede reintentar sin duplicar; el ack se
  revierte sin perder datos.
- **Commit esperado.** `feat(android): send ERP launches in eights and retry only what failed` · ~300 líneas.
- **Depende.** T24, T23.

### T27 · Release 7005, despliegue y verificación

- **Objetivo.** Publicar el build 7005 y la web actualizada con la misma disciplina que la entrega anterior.
- **Áreas.** `packages/android/app/build.gradle.kts` (propiedades por build, no editadas a mano),
  `packages/backend/apk/`, `CHANGELOG.md`, `docs/release-android.md`, `docs/release-android-historial.md`,
  notas de la release en GitHub, `/tmp/andrelease.sh`.
- **Tests exactos.** Suite Android focalizada por área tocada + `LocaleStringsParityTest`; `apksigner verify`;
  `aapt2 dump badging`; `sha256sum -c`; e2e web en viewport 390×844 y escritorio; `curl` público de
  `/api/app/download-apk`.
- **Aceptación.** `versionCode 7005`, `versionName 0.7.0`; asset, sidecar, `packages/backend/apk`, Desktop y
  producción comparten el mismo sha256; la web desplegada se ve correcta en 390×844 y en escritorio; el tag
  `v0.7.0` no se movió.
- **Commit esperado.** `chore(android): hand the plant the 7005 build as the v0.7.0 asset` · binario + docs.
- **Depende.** Todas las anteriores.

## Plan de release (7005)

1. **Build.** `/tmp/andrelease.sh :app:assembleRelease --no-daemon
   -PapiBaseUrl=https://trindademasas.duckdns.org/ -PversionName=0.7.0 -PversionCode=7005
   -PrequireSigned=true` en el contenedor SDK 35 fijado por digest. Verificar `aapt2 dump badging`
   (`versionCode='7005'`), `apksigner verify --print-certs` (certificado `ee0e404b…`), tamaño y sha256.
2. **Emulador.** `ssh ubuntu … adb -s emulator-5554 install -r`, recorrido de las superficies tocadas
   (dashboard, cajas, horário, historiales, integración ERP) y capturas.
3. **Web.** `docker compose build web api && docker compose up -d`, prueba en 390×844 (iPhone) y escritorio
   1440×900, con las pantallas tocadas: dashboard, histórico de masas y contaje, reportes, cronograma,
   administración de integración.
4. **Assets.** `gh release upload v0.7.0 packages/backend/apk/trindade-0.7.0.apk
   packages/backend/apk/trindade-0.7.0.apk.sha256 --clobber` y `gh release edit v0.7.0 --notes-file …` con las
   notas en español. El tag `v0.7.0` no se mueve ni se recrea.
5. **Destinos.** `packages/backend/apk/trindade-0.7.0.apk` + `.sha256`, `~/Desktop/trindade-0.7.0.apk`,
   imagen `api` (hornea el APK con `COPY packages/backend/apk`) y producción (`/api/app/download-apk`).
6. **Verificación de hash.** Un solo comando que compare `sha256sum` de: asset descargado de GitHub, sidecar
   descargado, `packages/backend/apk`, Desktop y descarga pública de producción. Diferencia = no se publica.
7. **Docs.** `CHANGELOG.md` (entrada `0.7.0+7005`), `docs/release-android.md` (fila + estado final),
   `docs/release-android-historial.md` (fila, digests esperados, nota de reemplazo), notas de la release en
   español con tabla de verificación.
8. **Git.** Commits atómicos en `main`, ≤400 líneas, Conventional Commits, sin `Co-Authored-By`, sin ramas ni
   worktrees; push final a `origin/main` con confirmación del hash resultante.

## Riesgos y decisiones pendientes

**Fuera de alcance de este ciclo.** El puente on-prem y el backend como proxy de Aero32 quedan explícitamente
fuera: el VPS de producción no tiene ruta a la LAN de la fábrica (S11). Se documentan como fase futura, no como
deuda de este ODD.

**D1 — Credenciales ERP: decidido (S11, S12), sin bloqueo.** El backend no puede hablar con Aero32 desde
producción, así que T20 se resuelve en el frontend: `localStorage` deja de guardar la contraseña, que vive solo
en memoria de la pestaña y se pide al abrir sesión, con purga única del valor viejo y aviso en la UI. Consecuencia
aceptada: el navegador sigue recibiendo la contraseña en cada sesión, así que un XSS podría leerla mientras la
pestaña está abierta; eliminarla del navegador por completo exige el puente on-prem (fase futura), no un almacén
cifrado en el servidor. «Recordar en este dispositivo» con WebCrypto + passphrase queda también para otra fase.

**D2 — «Caja no montada»: decidido (S13).** Es estado de sesión: no se persiste, no hay columna ni migración. El
payload con `checked=false` ya expresa qué tareas no se marcaron, así que el reporte guardado no necesita una
bandera aparte. T15 limpia el estado al crear y abre ambos tipos ON al editar.

**D3 — `checked=false` y exportación (riesgo de T12).** Guardar una fila por tarea **no-temperature** cambia el
volumen de `report_items`; las temperaturas no se duplican (S16). La exportación ya filtra `checked=1`
(`export.service.ts:155,219`) y `higieneDone` cuenta solo marcadas (`dashboard.routes.ts:85`), pero hay que
confirmarlo con tests antes de publicar; si alguna consulta asume «solo existen filas marcadas», se corrige ahí y
se documenta.

**D4 — Histórico de Masas como lista de días (S2) vs enlaces profundos.** Cambiar el modelo de navegación puede
romper enlaces `?date=` que hoy usan otras pantallas. T7 debe conservar la URL y sus tests.

**D5 — Horário web es el cambio más grande de UI (T16–T19, ~900 líneas).** Se mantienen los cuatro commits
(S19): modal, cuota/off-by-one, historial/grilla y errores/recursos. Si uno supera 400 líneas, se parte por
comportamiento antes de abrirlo.

**D6 — Dos clientes del ERP, no un proxy (S11).** Android llama a Aero32 por la LAN; la web sale por el atajo de
iOS. El contrato de auditoría debe cubrir los cuerpos de `android` y de `shortcut`, y en este ciclo no existe un
tercer camino «servidor» que probar.

**D7 — Alcance P1: sin recorte silencioso (S19).** T25–T26 se quedan en este ciclo. Si el tiempo aprieta, se
recorta alcance **con aprobación explícita**, nunca moviéndolas a otro ODD por decisión propia.

## Trazabilidad

| Tarea | Hallazgo | Commit | Test que la prueba |
| --- | --- | --- | --- |
| T0 | S14 | `test(web): give the frontend an executable component-test lane` | `__smoke__.test.tsx`, `scripts/ci.sh` |
| T1 | A | `feat(backend): accept the audit events both clients actually send` | `aero.routes.test.ts`, `aero.log.service.test.ts` |
| T2 | A | `test(aero): pin the audit contract to the bodies each client sends` | `aero.log.contract.test.ts`, `AeroTestAuditTest.kt` |
| T3 | A, G | `fix(web): tell the audit log which app is calling and how long it took` | `aero-audit.test.ts`, `aero-feedback.test.ts` |
| T4 | A | `fix(android): stop swallowing the audit response and name the client` | `AeroTestAuditTest.kt`, `AeroErpClientTest.kt` |
| T5 | A | `feat(aero): record the paths that were operating without a trace` | `aero-audit.test.ts`, `MassasLaunchViewModelTest.kt` |
| T6 | B | `fix(web): make the date control open its calendar on a desktop click` | `DateField.test.tsx`, `date-field.spec.ts` |
| T7 | B, S2 | `e676cf0` `feat(massas): elegir el día del histórico desde una lista` + `01c5b01` `test(massas): cubrir la elección de día del histórico` | `MassasHistoryPage.test.tsx` 5/5, `massas-history.spec.ts` 2/2 |
| T8 | B | `3868188` `feat(stock): elegir el día del histórico desde un panel y los días contados` | `StockHistoryPage.test.tsx` 3/3, `stock-history.spec.ts` 2/2 |
| T9 | B | `16a7e39` `fix(web): recargar los históricos al elegir la fecha` | `ReportHistoryPage.test.tsx` 4/4, `LoadingHistoryPage.test.tsx` 2/2, e2e 13/13 |
| T10 | C, S3 | `9f04860` `feat(web): leer el panel como seis tarjetas y un resumen` | `DashboardPage.test.tsx` 4/4, `dashboard.spec.ts` 6/6 |
| T11 | D | `0a0e945` `feat(web): apagar un tipo de caja junto con sus tareas` | `CategorySection.test.tsx` 4/4, `report-box-types.test.ts` 5/5, `report-box-types.spec.ts` 2/2 |
| T12 | D, S1, S16 | `3a4894e` `feat(reports): mandar todas las tareas, marcadas o no` | `report-items.test.ts` 4/4, `ReportEditPage.test.tsx` 2/2, `reports.command.service.test.ts` 5/5, `dashboard.routes.test.ts` 11/11 |
| T13 | D | `4d70fab` `fix(reports): deshabilitar de verdad y no perder los hijos de Recebimento` | `CategorySection.test.tsx` 5/5, `BoxTypeList.test.tsx` 5/5, `ReportsPage.test.tsx` 3/3, `ReportEditPage.test.tsx` 3/3 |
| T14 | D | `297d3ec` `refactor(reports): leer el catálogo de productos del servidor` | `report-products.test.ts` 5/5, `CategorySection.test.tsx` 8/8, `ReportsPage.test.tsx` 5/5, `ReportEditPage.test.tsx` 4/4 |
| T15 | D, S13 | `c78ce5b` `fix(android): que los interruptores de caja duren lo que dura el reporte` | `ReportGeneratorViewModelTest.kt` y `ReportEditViewModelTest.kt`, casos nuevos; rojo verificado revirtiendo las dos líneas de producción |
| T16 | E | `feat(web): assign several drivers from one modal, each with its plate` | `DriverSelect.test.tsx`, `loading-schedule.spec.ts` |
| T17 | E | `fix(web): count the loading quota by window and stop shifting edited rows` | `loading-quota.test.ts`, `LoadingEditPage.test.tsx` |
| T18 | E | `feat(web): open and retry a loading day from its history` | `LoadingHistoryPage.test.tsx`, `loading-history.spec.ts` |
| T19 | E | `fix(web): say what actually failed on the loading schedule` | `LoadingSchedulePage.test.tsx`, `schedule-pdf.test.ts` |
| T20 | F, S5, S11, S12 | `dcbc2fc` `feat(aero): la contraseña del ERP deja de guardarse en el dispositivo` + `016c30b` (panel y avisos) + `e5ad503` (e2e) + `3069818` (ayuda del panel) | `aero-integration.test.ts` 85/85, `aero-integration-panel.test.tsx` 5/5, `aero-password-session.test.ts` 4/4, `admin-integration.spec.ts` 4/4, Playwright 103/103 |
| T21 | H P0-1, P0-5 | `fix(android): show the result of saving the ERP settings` | `IntegrationSettingsReadyTest.kt`, `MassasLaunchViewModelTest.kt` |
| T22 | H P0-2, P0-3 | `refactor(android): one failure model and a real Wi-Fi message` | `AeroFailureTest.kt`, `AeroLogicTest.kt` |
| T23 | H P0-4, P0-6 | `feat(android): keep the ERP queue across restarts and refuse duplicated seats` | `AeroQueueTest.kt`, `MassasLaunchViewModelTest.kt` |
| T24 | H P0-7, S17 | `feat(massas): let each seat carry its own operator` | `massas.routes.test.ts`, `massas.service.test.ts`, `MassasImportPayloadTest.kt`, `MassasLaunchPage.test.tsx` |
| T25 | G | `fix(web): stop masking ERP failures with a successful-looking answer` | `aero-integration.test.ts`, `aero-queue.test.ts` |
| T26 | H P1 | `feat(android): send ERP launches in eights and retry only what failed` | `MassasLaunchViewModelTest.kt`, `MassasDayHeaderTest.kt` |
| T27 | S9, S10 | `chore(android): hand the plant the 7005 build as the v0.7.0 asset` | `apksigner`, `aapt2`, `sha256sum -c`, e2e web |

## Log

- **L1** — Directiva completa de Wilkin, verbatim en el Anexo A (fuente:
  `/tmp/commandcode-1001/-home-wilkin-Desktop/1b66c6d5-3dc5-4bce-80bf-915e173590b5/scratchpad/trindade-parity-brief.md`).
- **L2** — Instrucción de ejecución de esta sesión, verbatim:

  > Che, ignorá la prueba anterior. El brief completo con las 5 decisiones y todos los hallazgos está en /tmp/commandcode-1001/-home-wilkin-Desktop/1b66c6d5-3dc5-4bce-80bf-915e173590b5/scratchpad/trindade-parity-brief.md. Leelo entero y ejecutá SOLO la primera parte: creá odd/tasks/paridad-web-android-erp-7005.md con el formato pedido. No toques código, no abras ramas. Al terminar quedate idle y reportá path, número de tareas, dependencias y decisiones pendientes.

- **L3** — Verificación previa a este documento (evidencia observada, no supuesta):  - `packages/backend/src/modules/integration/aero.schema.ts:27-40` — `.strict()` con
    `event: ['test_connection','launch_sync','read_history']`, `phase: ['requested','result']`, sin `client`,
    `attemptId` ni `durationMs`.
  - `packages/android/.../aero/AeroAdapters.kt:55-57` — `log()` descarta la respuesta del endpoint.
  - `packages/frontend/src/components/ui/date-field.tsx:49-63` — `<input type="date">` con `opacity-0` y sin
    `showPicker()`.
  - `packages/frontend/src/pages/DashboardPage.tsx:149-255` — `xl:grid-cols-5` y nueve `SummaryCard`.
  - `packages/frontend/src/pages/ReportEditPage.tsx:326-335` — payload con `.filter(([, checked]) => checked)` y
    `checked: true`.
  - `packages/frontend/src/lib/aero-integration.ts:10,141-187` — `trindade.aero.integration.v1` en
    `localStorage`, con contraseña.
  - `packages/frontend/src/i18n/locales/es.json:38,40` — «Mercancías» y «Relatorios Totales».
  - `packages/backend/src/modules/reports/reports.command.service.ts:175-184` y
    `export.service.ts:155,219` — reemplazo de `report_items` y exportación solo de `checked=1`.
- **L4** — Revisión del ODD, verbatim (sus decisiones quedan citadas en S11–S19; fuente:
  `/tmp/commandcode-1001/-home-wilkin-Desktop/1b66c6d5-3dc5-4bce-80bf-915e173590b5/scratchpad/trindade-odd-review.md`):

  > Che, revisé el ODD. Está bien de alcance, pero antes de aprobarlo necesito que corrijas 9 puntos. Leé /tmp/commandcode-1001/-home-wilkin-Desktop/1b66c6d5-3dc5-4bce-80bf-915e173590b5/scratchpad/trindade-odd-review.md entero y actualizá odd/tasks/paridad-web-android-erp-7005.md. No toques código. Al terminar quedate idle y reportá qué cambiaste y cuántas tareas quedaron.

- **L5** — Evidencia nueva de la revisión (observada al aplicarla):
  - `packages/frontend/package.json:8` — la lane es `node --test --import tsx "src/**/*.test.ts"`, sin jsdom.
  - `scripts/ci.sh:28-42` — la CI corre install, build, typecheck, tests de backend y Playwright; **nunca** corre
    la lane unitaria del frontend. T0 cierra ese hueco, no solo el de Vitest.
  - `docs/arquitectura.md:12-24` y `docs/integracion-aero-masas-web.md:24-25` — la web sale por el atajo de iOS
    porque el ERP es HTTP en la LAN y la página es HTTPS; el VPS no tiene ruta a esa LAN (S11).

## Anexo A — Directiva literal

Nota de lectura: la decisión 5 y el punto F de esta directiva (credenciales server-side cifradas) quedaron
**superados** por S11–S12: el proxy no es viable sin puente on-prem y la contraseña pasa a vivir solo en memoria
del navegador. El texto se conserva verbatim como registro histórico; ante conflicto, mandan las specs.

```text
# Directiva — Trindade: paridad web/Android, ERP y release 7005

## Objetivo

Crear primero el artefacto ODD en `odd/tasks/` con el plan completo de remediación y paridad web↔Android. **No escribir código todavía.** Después de crearlo, quedate idle y reportá path, tareas, dependencias y decisiones. El orquestador lo revisa con vos antes de autorizar la implementación.

## Decisiones ya tomadas por Wilkin

1. **Montagem das Caixas:** la web adopta el payload de Android: una fila por tarea con `checked=false` explícito, no solo las marcadas.
2. **Histórico de Massas:** la web pasa al modelo Android de lista de días clicables, no a un selector de fecha único.
3. **Dashboard:** copiar exactamente el orden Android: 6 tarjetas + panel “Resumo”, incluida “Compartilhar App” después de la calculadora de Assaí y su subtítulo.
4. **Atajo iOS:** se sigue repartiendo el certificado `https://www.icloud.com/shortcuts/3216695a428f42539fec7abbd5419f34`. El enlace `27efb...` que usa Wilkin es equivalente (20 acciones idénticas + una acción extra de salida), pero **no** se cambia el enlace canónico ni el test.
5. **Credenciales web:** se tratan como hallazgo de seguridad y se migran fuera de `localStorage`. El ODD debe proponer el diseño; opción preferida: almacenamiento server-side cifrado (AES-GCM con clave en entorno) y endpoint admin-only, con migración única desde el `localStorage` existente y sin devolver la contraseña en las respuestas. Si encontrás una alternativa mejor, proponela y justificá; no implementes hasta aprobación.

## Estado del repo

- `main` = `origin/main` = `2fba94a`; árbol limpio.
- Tag `v0.7.0` en `4f414002`; release `v0.7.0` con asset build **7004**, sha256 `7622756d…`, 11.194.408 bytes.
- Próximo build Android: **versionCode 7005**, versionName `0.7.0`, mismo tag `v0.7.0`, reemplazar el asset de la release existente (sin release nueva).
- No ramas, no worktrees, no `Co-Authored-By`, commits atómicos ≤400 líneas, Conventional Commits.
- Todo a `main`; publicar y reconstruir la imagen de producción para testear la web.

## Hallazgos que el ODD debe cubrir

### A. Logs y auditoría ERP (P0)

- Android manda `event: dispatch|sync|test`, `phase: response` y `durationMs`; el backend solo acepta `launch_sync|read_history|test_connection`, `phase: requested|result` y no admite `durationMs` (`.strict()`). Resultado: **100% de la auditoría Android se rechaza con 400**.
- `AeroAdapters.kt:55-57` ignora el estado de la respuesta del `/log`; el 400 es invisible.
- El `.log` real (`logs/aero-integration.log`, 89 líneas) no tiene ninguna línea de Android.
- No hay campo estructurado `client`; solo `note` libre. Android escribe `client=android` pero nunca llega; la web usa `via=bridge|shortcut`, que es transporte, no app.
- `launchId` nunca se envía: 89/89 líneas con `launchId:null`. No hay `attemptId`/correlación; el callback del test puede duplicarse.
- Faltan logs en: `ReceiptsSection.tsx:135`, `ReportsPage.tsx:68`, importación web `MassasLaunchPage.tsx:564-593`, importación Android `MassasLaunchViewModel.kt:578-618`, dispatch/sync con integración no configurada.
- `probeToAuditEvent` no emite `via=`; 11 líneas con `note:null`.
- `read_history/result` inventa `httpStatus:200`; `test_connection/requested` a veces lleva `error`; el `error` mezcla códigos e idiomas.
- `aero-audit.ts` devuelve `false` y nadie lo mira; errores >1024 o notes >256 desaparecen.
- Falta un test de contrato que pase los bodies reales de web y Android por `AeroLogBodySchema`.

### B. Web — filtros de fecha e históricos (P0/P1)

- `DateField` (`components/ui/date-field.tsx:51-60`) usa `<input type="date">` con `opacity-0`, sin `showPicker()` ni clic reenviado. En escritorio no abre el calendario; en táctil sí.
- Massas (`MassasHistoryPage.tsx:162-170`) y Contagem (`StockHistoryPage.tsx:110-118`) usan `DateField` como **único** control de día. En escritorio quedan clavadas en “ayer”.
- Massas Android no tiene picker: es una lista de días clicables (`MassasHistoryScreen.kt:87-135`). La web debe pasar a ese modelo (decisión 2).
- Contagem Android sí tiene `DatePickerDialog` + chips (`StockHistoryScreen.kt:132-133,167-192,268-279`).
- Reportes (`ReportHistoryPage.tsx:118-122`) y Cargas (`LoadingHistoryPage.tsx:118-122`) tienen input visible, pero elegir fecha no recarga (`useEffect(..., [])`), no hay limpiar y no hay `min/max`.
- Faltan tests de `MassasHistoryPage`, `StockHistoryPage`, `DateField` y e2e con clic real (los actuales usan `.fill()` y enmascaran el bug).

### C. Web — Dashboard (P1)

- Web actual: 9 tarjetas (Reportes, Cronograma, Masas, Stock, **Histórico de Contagem**, Assaí, Usuarios, Reportes totales, Cargamentos).
- Android nuevo: 6 tarjetas (Reportes, Cronograma, Masas, Stock, Assaí, **Compartilhar App**) + panel “Resumo” con 5 filas (Cargamentos, Reportes, Usuarios, Higiene done/total, Recepción done/total).
- Portar: quitar Histórico de Contagem del grid, insertar Compartilhar App después de Assaí, colapsar los tres contadores en el panel, mostrar `done/total`, arreglar el `<a>` anidado de la tarjeta de masas y el grid `xl:grid-cols-5`.
- Backend ya entrega todos los campos en `/dashboard/summary`; no hace falta backend.
- Corregir i18n `es`: “Relatorios Totales” → “Reportes Totales”; “Mercancías” → “Mercaderías”.

### D. Web — Montagem das Caixas (P1)

- Android tiene un switch por categoría hija (`ReportForm.kt:110-147`), oculta sus tareas (`:136-146`), limpia checks/productos/temperaturas (`ReportGeneratorViewModel.kt:337-355`) y deshabilita en solo lectura.
- La web no tiene switch; `CategorySection.tsx:232-243` dibuja todos los hijos siempre.
- La web envía solo `checked=true` (`ReportEditPage.tsx:326-335`); el backend reemplaza `report_items` (`reports.command.service.ts:175-184`) y **borra** las filas no marcadas. Adoptar el payload Android con `checked=false` explícito.
- Bug: `CheckTask` y `TemperatureTask` no reciben `readOnly`; quedan clicables en solo lectura (`CategorySection.tsx:97-158`).
- Bug: los hijos de Recebimento no se dibujan (`ReportsPage.tsx:394-412`, `ReportEditPage.tsx:443-464`).
- Deuda: `productTemplates.ts` duplica el catálogo del backend; Android usa `/reports/products`.
- Residual Android: `onReportCreatedHandled` no limpia `disabledBoxTypeIds`; editar no resiembra switches. Decidir si se persiste “no montado” o se documenta como estado de sesión.

### E. Web — Horário / Cronograma de Carregamento (P1)

- Android: modal real con pestañas Fleteros/Motoristas da Casa (`LoadingScreen.kt:493-531`), multiselección (`:634-652`), chapa por fila (`:663-691`), “Aceitar/Cancelar” y contador (`:591-610`), fallos parciales retenidos (`LoadingViewModel.kt:342-380`), tabla alineada (`:391-421`), papelera 48 dp (`:450-461`), editar fila desde la grilla (`:434-446`), slots = configurados ∪ ocupados (`LoadingViewModel.kt:80-81`), abrir día desde histórico (`LoadingHistoryScreen.kt:151,348`), retry (`:173-195`).
- Web: panel inline (`DriverSelect.tsx:116-119`), lista única con badge `(Casa)` (`:204-228`), asignación 1×1 (`:98-106`), chapa solo del asignado (`:126-155`), nombre+placa en línea (`ScheduleGrid.tsx:187-206`), botón grande de borrar (`:208-220`), historial clon de Reportes.
- Bugs web: cuota por slot exacto vs ventana ±60 (`ScheduleGrid.tsx:65-108`), off-by-one en edición (`LoadingEditPage.tsx:226`), código muerto `isRollingQuotaMaxed`, slots huérfanos invisibles (`ScheduleGrid.tsx:144`), spinner de página completa tras cada asignación, error presentado como “día vacío”, historial con emoji/textos hardcodeados, “Editar” abre pantalla destructiva, `scheduleAlreadyExists` inalcanzable, select de vehículos vacío sin mensaje, fuga de DOM si falla el PDF.
- Ventaja web a conservar: filtro por usuario en el histórico (`LoadingHistoryPage.tsx:120-123`).

### F. Web — credenciales ERP (P1 seguridad)

- `aero-integration.ts:140-179` guarda `wsUrl`, `username`, `password`, `shortcutName`, `syncEnabled`, `lastSyncAt` en `localStorage` sin cifrar.
- Android usa `AeroSettingsStore` + `KeystoreCipher` (AES/GCM con clave del Keystore).
- Migrar a almacenamiento server-side cifrado o alternativa justificada. Debe incluir migración única desde el `localStorage`, no exponer la contraseña en GET, y tests.

### G. Web — errores/consultas ERP (P1/P2)

- La taxonomía del test web es buena (`ok`, `http_error`, `reachable_without_cors`, `blocked`, `invalid_config`, `timeout`, `network`).
- Pero `readAeroMovements` con `message:null` muestra un genérico (`MassasLaunchPage.tsx:515`).
- `readAeroTestResult` usa fallback `WILKIN` si el ERP no devuelve usuario (`aero-integration.ts:289-328`): falso positivo.
- Import muestra `err.message` crudo (`MassasLaunchPage.tsx:586-589`).
- `ReceiptsSection` pierde el detalle (`:75-77,115-120`); `syncFeedback` descarta `params` (`aero-feedback.ts:74-97`).
- Batch/cola: la web ya tiene `aero-queue.ts` TTL 8 h y `AERO_BATCH_MAX=8`; Aero32 recibe N POST, no un endpoint batch. Mantener esa semántica.

### H. Android — P0/P1 del informe anterior que siguen abiertos

- P0-1: feedback al guardar configuración ERP (`IntegrationSettingsViewModel.kt:112-130`, `isSaving` nunca asignado).
- P0-2: modelo único `AeroFailure`; hoy hay 5 mapeos divergentes.
- P0-3: mensaje específico de Wi-Fi/SSID en todos los botones; `AeroReachability.kt` no lee SSID y `aero_plant_probe_wifi` está muerto.
- P0-4: cola persistente Android equivalente a `aero-queue.ts`.
- P0-5: no fallar en silencio si la integración no está lista (`MassasLaunchViewModel.kt:404-405`).
- P0-6: evitar doble asiento; guarda `RECONCILED` y refresco del espejo.
- P0-7: backend multioperario: `operator_name` es uno por request y `createMassaLaunches` aplica un solo `ownerId` (`massas.routes.ts:88-94`, `massas.service.ts:177-191,225`).
- P1: límite 8/tanda + troceo + “reintentar fallidos”; leer `owner_status`; hint “no cierra cajas enteras”; ack por día reversible; tests.

## Formato exigido del ODD

Archivo nuevo en `odd/tasks/`, nombre propuesto: `paridad-web-android-erp-7005.md`.

Debe seguir el formato de `odd/tasks/remediacion-diseno-android-acciones-y-dashboard.md`:

- Contexto y decisiones tomadas (las 5 de arriba).
- Objetivos y no-objetivos.
- Tareas `T1..Tn`, cada una con:
  - objetivo,
  - archivos/áreas,
  - tests exactos (unitarios, widget/Compose, e2e, backend),
  - criterios de aceptación,
  - commit atómico esperado (≤400 líneas),
  - dependencias.
- Orden recomendado:
  1. Contrato de logs/auditoría (backend + Android + web).
  2. Fechas/históricos web.
  3. Dashboard web.
  4. Montagem das Caixas.
  5. Horário/Cronograma.
  6. Credenciales web.
  7. Android P0 ERP.
  8. Android/backend P1.
  9. Release 7005 + deploy + verificación.

- Plan de release:
  - versionCode 7005, versionName 0.7.0, tag v0.7.0 sin mover;
  - reemplazar asset `trindade-0.7.0.apk` y sidecar `.sha256` en la release existente;
  - actualizar `packages/backend/apk`, `Desktop`, producción, `CHANGELOG.md`, `docs/release-android.md`, `docs/release-android-historial.md` y notas en español;
  - rebuild de la imagen de producción de la web y prueba en viewport iPhone (390×844) y escritorio;
  - emulador Ubuntu `emulator-5554`, `aapt2`/`apksigner`/`sha256sum -c`;
  - hash idéntico en asset, sidecar, `packages/backend/apk`, Desktop y producción;
  - push a `main`, sin ramas, sin `Co-Authored-By`.
- Riesgos y decisiones pendientes.
- Tabla de trazabilidad tarea → commit → test.

## Registro de ejecución

Una fila por tarea cerrada: commit atómico en `main`, evidencia observada. La evidencia se escribe acá al
cerrar la tarea, con el hash que quedó en el historial.

| Tarea | Commit | Evidencia observada |
| --- | --- | --- |
| T0 | `e84bc39` | `vitest run`: 1/1 verde (`src/components/ui/__smoke__.test.tsx`, jsdom). `node:test`: 468/468. `tsc --noEmit`: limpio. `scripts/ci.sh` corre la lane unitaria del frontend. |
| T1 | `440d882` | `aero.routes.test.ts`: 8/8 (2 nuevos: cuerpo Android 200 con `client`/`attemptId`/`durationMs`; `error` > 1024 y `client` desconocido siguen 400). `aero.log.service.test.ts`: 6/6. Contrato regenerado. De paso corrige el fixture de `receipts.service.test.ts` que dejaba `tsc --noEmit` rojo en `main` desde `9427d7b`. |
| T2 | `3f6c472` | `aero.log.contract.test.ts`: 25/25 (9 cuerpos reales web/Android aceptados, 16 bordes estrictos). Backend completo: 667/667. `:app:testDebugUnitTest --tests AeroTestAuditTest`: 7/7 en `ghcr.io/cirruslabs/android-sdk:35`. |

| T3 | `0e68273` | `node:test`: 475/475 (9 en `aero-audit.test.ts`: `client=web`, `attemptId`, `durationMs`, prefijo `AERO_*`, recorte de `note` 256 y `error` 1024, y que `read_history` ya no invente `httpStatus 200`). `tsc --noEmit` limpio. `npm run test:unit`: verde. |
| T4 | `d65b1d4` | `:app:testDebugUnitTest --tests "com.trindade.app.aero.*"` en `ghcr.io/cirruslabs/android-sdk:35`: BUILD SUCCESSFUL (11m). `AeroTestAuditTest` 11/11 (4 nuevos: `client=android` + `attemptId` por intento, correlación pedido/resultado, `error` recortado a 1024 y `note` a 256, y `rejection()` con el código del backend). `AeroMirrorAdapterTest` nuevo (Robolectric + MockWebServer): el cuerpo en el cable lleva `client`, `attemptId` y `durationMs`, y un 400 no lanza. |
## Reglas de trabajo
| T6 | `c53389e` | `vitest run`: 7/7 (6 nuevos en `DateField.test.tsx`: clic invoca `showPicker`, Enter y Espacio lo invocan y cancelan el scroll, Tab no, navegador sin `showPicker` sigue usable y propaga ISO, `NotAllowedError` se traga, y etiqueta/valor). Playwright `date-field.spec.ts` nuevo: 2/2, el clic abre el calendario a 390×844 y a 1280×800. `node:test`: 475/475. `tsc --noEmit`: limpio. |

| T5 | `599e420` | `node:test`: 480/480 (4 nuevos: recepción con lente e insumos, snapshot rechazado, importación con `ent_lan`/cajas y sync que no arranca) + `receipts-sync-wiring.test.ts` con la aserción del emisor. Playwright `report-receipts`: 1/1. Android `:app:testDebugUnitTest`: BUILD SUCCESSFUL; `AeroDispatcherTest` 12/12 (3 nuevos: dispatch sin configurar escribe `AERO_NOT_CONFIGURED` sin tocar el ERP, sync sin configurar igual, e importación con asiento y cajas), `MassasLaunchViewModelTest` 34/34 (la importación deja `ent_lan=35937`/`boxes=3` en el log). |
- Primero solo el ODD. No toques código ni abras ramas.
- No cierres paneles de Herdr.
- No interrumpas si estás `working`; terminá el ODD y quedate idle.
- Todo en español.
- Al terminar, reportá: path del ODD, número de tareas, dependencias, decisiones que necesitan aprobación y cualquier conflicto que hayas encontrado.
```
