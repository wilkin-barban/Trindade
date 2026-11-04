# Remediación de los hallazgos de auditoría — 0.7.2 (7013)

Auditoría read-only de los ciclos 7006, 7007 y 0.7.1/7012 sobre `main`. Esta entrega no agrega features: cierra
los defectos encontrados, con TDD estricto, y publica 0.7.2 con el mismo binario en producción y en GitHub.

**Alcance:** Android (A1–A4, A6), web/backend (M1–M7), documentación (M8, B2), deuda menor (B1, B3, B4), runbook
A5 y la entrega 0.7.2. **Fuera de alcance:** cualquier feature nueva, `/saidasitem` (deuda documentada, B6) y la
instalación del APK en emulador o teléfonos, que hace el usuario.

## 1. Contexto y evidencia

La auditoría revisó, en solo lectura, los tres ciclos que llevaron Trindade a 0.7.1: el cierre de históricos y
cargamento (7006), la autoría y los errores de histórico (7007) y la conciliación automática de Masas más la
publicación 0.7.1/7012. Encontró defectos de corrección, de seguridad y de entrega que no rompen el flujo feliz
pero sí el camino del error, la concurrencia y la trazabilidad.

Evidencia por hallazgo (archivo y síntoma observado en la auditoría):

| ID | Evidencia | Síntoma |
| --- | --- | --- |
| A1 | `packages/android/app/src/main/java/com/trindade/app/aero/AeroDispatcher.kt:270` | `AeroSnapshotSave.Unreachable -> AeroFailure(SNAPSHOT_REFUSED)`: el backend caído se reporta como backend que rechazó el snapshot |
| A2 | `packages/android/app/src/main/java/com/trindade/app/network/AuthApi.kt:52,70` | `Response<SuccessResponse>`; el contrato generado espera el enum `"true"` y el servidor escribe `true` |
| A3 | `packages/android/app/src/main/java/com/trindade/app/massas/MassasLaunchViewModel.kt:392-401` | `confirmLaunch` baja `isSubmitting` antes de que `dispatchToErp` termine; `sendPendingLaunch` y `flushPendingQueue` no se serializan entre sí |
| A4 | `packages/android/app/src/main/java/com/trindade/app/aero/AeroQueue.kt:150-170`, `AeroQueueStore.kt:47-53` | una cola de más de 8 h se descarta en silencio y sin línea de auditoría |
| A6 | `.github/workflows/android-release.yml` (job `publish`) | un re-run recompila y hace `--clobber`: el asset de la release puede dejar de coincidir con el binario que sirve producción |
| M1 | `packages/backend/src/modules/history-permissions.ts:116`, rutas de lote | el flag día-level se proyecta con la regla de fila y ofrece borrar un lote que la ruta rechaza |
| M2 | contrato del log `sync_refused` | el evento no lleva `attemptId` y el cliente web no manda `X-Trindade-Client` |
| M3 | `packages/frontend/src/api/client.ts:76` | `handleUnauthorizedRedirect` olvida el JWT y deja viva la contraseña ERP de la pestaña |
| M4 | `packages/frontend/src/lib/aero-integration.ts:253` | `clearAeroSettings` no borra la marca de auto-lectura |
| M5 | `packages/frontend/src/pages/MassasLaunchPage.tsx:544-600` | la fecha del callback es la del reloj de la página, no la que se pidió al ERP |
| M6 | `packages/frontend/src/pages/ReportHistoryPage.tsx` | acciones por debajo de 48 px y sin chip de solo lectura, a diferencia de Cargamento |
| M7 | `packages/backend/src/modules/integration/aero.log.contract.test.ts` | fixtures con `note`/payload inventados en vez de cuerpos de los emisores reales |
| M8 | `odd/tasks/auto-conciliacion-masas-erp-post-lanzamiento.md`, `docs/auditoria-android.md`, guías | T6 sin marcar, versiones mezcladas, `localStorage` donde ya es `sessionStorage`, 7012 publicado como valor |
| B1 | emisor de `logImport` Android | usa `phase:"response"` donde el resto usa `result` |
| B2 | KDoc de históricos | describen un `canDelete` que ya no existe |
| B3 | tests de reportes | no afirman el código `REPORT_DELETE_FORBIDDEN` |
| B4 | tests web/Android | leen el fuente con `readFileSync` en vez de ejercitar comportamiento |
| B6 | `/saidasitem` | sin consumidor de producción: se documenta como deuda, no se implementa |

## 2. Prioridades

- **ALTA (A1–A6):** pérdida de trabajo, doble envío de cajas, diagnóstico falso, entrega divergente o
  verificación de punta a punta imprescindible. Bloquean la release.
- **MEDIA (M1–M8):** permisos sobredeclarados, secretos que sobreviven al cierre de sesión, correlación del log,
  fecha del snapshot y accesibilidad del histórico. Bloquean la release.
- **BAJA (B1–B4, B6):** consistencia de nombres y cobertura; se cierran en la misma entrega salvo B5.

## 3. Invariantes

1. **Paridad web/Android:** toda regla de negocio que cambie en un cliente se refleja en el otro o se documenta
   por qué no aplica; los textos visibles existen en `es.json` y `pt-BR.json` con paridad.
2. **Snapshot completo:** el espejo guarda todo lo que el ERP devuelve (masas e insumos). La tabla de Masas
   oculta los insumos; no los filtra de la base.
3. **No duplicar envíos:** un mismo `launchId` no sale dos veces al ERP por dos caminos concurrentes.
4. **No conciliar por HTTP 200:** la conciliación se decide con el espejo leído, nunca con el código de estado.
5. **Credenciales fuera de logs y documentación pública:** la contraseña ERP vive en `sessionStorage`, no se
   registra, no se publica, y se borra al cerrar sesión, al expirar el JWT y al limpiar la integración.
6. **El espejo no se filtra a masas:** ocultar una fila en la tabla no la borra del snapshot.
7. **`versionCode`/`buildNumber` internos:** no se publican como valor en notas, README ni changelog público; sí
   se documentan donde corresponde operarlas (release docs internas, runbook).
8. **Sin downgrade:** el `versionCode` publicado nunca es menor que el que producción sirve.

## Specs

- **S1 — Backend inalcanzable al guardar el snapshot.** Si el backend no responde al guardar el snapshot que el
  ERP devolvió, el fallo es `AeroFailureCode.SNAPSHOT_BACKEND_UNREACHABLE`: `retryable = true`, auditoría
  `AERO_SNAPSHOT_BACKEND_UNREACHABLE` y frase propia `aero_failure_snapshot_backend_unreachable` en español y
  portugués. No se reporta como un rechazo del backend.
- **S2 — Snapshot rechazado.** Un HTTP de rechazo del backend sigue siendo `SNAPSHOT_REFUSED` con
  `serverStatus`/`serverCode`, y `MASSAS_HISTORY_FROZEN` sigue siendo `BACKEND_DAY_CLOSED`. La distinción de S1
  no cambia ninguno de los dos.
- **S3 — Cuerpo de sesión sin tipo.** `AuthApi.logout` y `AuthApi.changePassword` declaran `Response<Unit>`; un
  `200 {"success":true}` es éxito y no una excepción de decodificación que el repositorio reporte como fallo.
- **S4 — Una sola salida al ERP a la vez.** Lote, fila suelta y drenaje de cola comparten un mutex; un
  `launchId` que está en vuelo no se vuelve a despachar; dos toques concurrentes producen una llamada al ERP y
  no dos cajas.
- **S5 — La cola vencida deja traza.** `readAeroQueueResult` distingue `Pending`, `Empty` y
  `Rejected(EXPIRED|MALFORMED)`; una cola de más de `AERO_QUEUE_TTL_MS` se descarta con una línea
  `queue_rejected` cuyo `code` es `AERO_QUEUE_EXPIRED` y que nombra la fecha y los `launchIds`.
- **S6 — El asset de la release es el binario de producción.** Si el checkout del tag trae
  `packages/backend/apk/trindade-<versión>.apk` con su `.sha256` que verifica, el workflow publica **ese**
  archivo, tras comprobar `versionName`, `versionCode` decidido y huella de firma; si no lo trae, publica el
  compilado. Un sidecar roto, una versión distinta o una firma distinta fallan el job en lugar de publicar otro
  binario. Un re-run converge al mismo digest.
- **S7 — Borrado de lote y de fila separados.** El flag que ofrece borrar un lote o un día es verdadero solo si
  la ruta que lo ejecuta lo aceptaría (administrador); el de una fila sigue la regla de autoría con día abierto.
- **S8 — Rechazo del snapshot correlacionado.** La fila `sync_refused` lleva el `attemptId` del intento que la
  produjo y el `client` real; la web envía `X-Trindade-Client: web` en sus llamadas a `/integration/aero/*`.
- **S9 — Cerrar sesión olvida todo.** Logout, expiración del JWT y `clearAeroSettings` borran el token, la
  contraseña ERP de la sesión y la marca de auto-lectura; ninguna marca huérfana dispara un viaje después.
- **S10 — La fecha pedida manda.** El intento de `movimentos` guarda la fecha con la que se armó el viaje y el
  callback guarda el snapshot y recarga el espejo con esa fecha, no con la del reloj al volver.
- **S11 — Histórico de Relatórios como Cargamento.** Toda acción del histórico tiene target táctil de al menos
  48 px y un día cerrado muestra el chip de solo lectura con el mismo componente que Cargamento.
- **S12 — Contrato del log con cuerpos reales.** Cada evento canónico (`launch_sync`, `read_history`,
  `test_connection`, `import`, `queue_rejected`) tiene un caso con la forma que el emisor web o Android produce,
  y los alias aceptados están cubiertos.
- **S13 — Documentación sin contradicciones.** No queda documentación que diga `localStorage` para la contraseña
  ERP, ni el código de build publicado como valor, ni un conteo de tests que la suite no dé; el ODD 0.7.1 cierra
  su T6.
- **S14 — Deuda menor cerrada.** `logImport` usa `phase:"result"`; el test de borrado de reportes afirma
  `REPORT_DELETE_FORBIDDEN`; los tests que leían el fuente se sustituyen por comportamiento sin perder la
  cobertura.
- **S15 — Runbook de verificación real.** Existe `docs/verificacion-erp-tablet.md` con pasos, comandos y criterio
  de éxito para un día abierto desde la tablet, marcado como pendiente de ejecución desde esta máquina.
- **S16 — Release 0.7.2 interna.** `versionName 0.7.2`, build interno 7013 (>7012), firmado con la clave
  oficial; `LOCAL_APK_FILENAME='trindade-0.7.2.apk'`, `LOCAL_APK_BUILD_NUMBER=7013`,
  `FALLBACK_RELEASE.version='v0.7.2'`; `/latest-release` responde `v0.7.2` con el build interno y el tamaño del
  archivo; la descarga coincide con el sha256 del APK de `packages/backend/apk/`.
- **S17 — Tag y release sin divergencia.** Un tag anotado `v0.7.2` sobre el commit de `main` con CI verde
  publica la GitHub Release `v0.7.2` con `trindade-0.7.2.apk` y su `.sha256`; el asset publicado es el mismo
  binario que producción sirve (mismo sha256), el workflow adopta 7013 sobre el 7002 del tag, y `v0.7.0` y
  `v0.7.1` no se mueven ni se reutilizan. El código de build no aparece como valor en las notas públicas.

## 4. Tareas

Cada tarea es TDD: primero el test que falla (RED) por la regla que cubre, después el cambio mínimo (GREEN) y el
refactor con la suite enfocada. Los commits son atómicos y llevan tests y documentación con el comportamiento.

- [ ] **T1 — A1: separar snapshot rechazado de backend inalcanzable.** Specs S1, S2.
  - Archivos: `aero/AeroFailure.kt`, `aero/AeroDispatcher.kt`, `res/values/strings.xml`, `res/values-pt-r2/strings.xml` (o el locale que exista), `aero/AeroDispatcherTest.kt`, `aero/AeroFailureTest.kt`, `massas/MassasLaunchViewModelTest.kt`.
  - Regla: `AeroSnapshotSave.Unreachable` produce `AeroFailureCode.SNAPSHOT_BACKEND_UNREACHABLE` con `auditCode` propio (`AERO_SNAPSHOT_BACKEND_UNREACHABLE`), retryable, y una frase distinta de «el backend rechazó el snapshot».
  - Aceptación: AC1. Test RED: `AeroDispatcherTest` con un mirror que responde `Unreachable` afirma el código nuevo y la auditoría; el mismo test con `Refused` afirma `SNAPSHOT_REFUSED`.
  - Riesgo: 3 (contrato del log: códigos nuevos consumidos por diagnósticos). Rollback: revertir el enum y su `when` exhaustivo falla en compilación, no en producción.

- [ ] **T2 — A2: `logout` y `changePassword` sin cuerpo tipado.** Specs S3.
  - Archivos: `network/AuthApi.kt`, `auth/AuthRepository.kt`, `auth/*Test.kt` (MockWebServer), `network/AuthApiTest.kt`.
  - Regla: ambos declaran `Response<Unit>`; un 200 real con `{"success":true}` se lee como éxito y no como fallo de red.
  - Aceptación: AC2. Test RED: con MockWebServer devolviendo `200 {"success":true}`, `logout()` y `changePassword()` resuelven éxito.
  - Riesgo: 2 (seguridad: cerrar sesión es la barrera de sesión). Rollback: una línea por método.

- [ ] **T3 — A3: serializar lote, fila y cola.** Specs S4.
  - Archivos: `massas/MassasLaunchViewModel.kt`, `massas/MassasLaunchViewModelTest.kt`.
  - Regla: un único mutex cubre toda salida al ERP (lote, fila suelta, drenaje de cola); un `launchId` en vuelo no se vuelve a despachar; dos toques concurrentes producen un solo envío.
  - Aceptación: AC3. Test RED: dos `sendPendingLaunch` concurrentes sobre la misma fila → el dispatcher fake registra una llamada; `flushPendingQueue` mientras un envío está en vuelo no reenvía el mismo `launchId`.
  - Riesgo: 4 (concurrencia). Rollback: quitar el mutex devuelve el comportamiento anterior, y el test lo detecta.

- [ ] **T4 — A4: el TTL de la cola deja traza.** Specs S5.
  - Archivos: `aero/AeroQueue.kt`, `aero/AeroQueueStore.kt`, `aero/AeroQueueTest.kt`, `massas/MassasLaunchViewModel.kt`, `massas/MassasLaunchViewModelTest.kt`.
  - Regla: `readAeroQueueResult` distingue `Pending`, `Empty` y `Rejected(EXPIRED|MALFORMED)`; el view model registra `queue_rejected` con `code=AERO_QUEUE_EXPIRED` (o `AERO_QUEUE_MALFORMED`) y la cantidad de ítems antes de descartarla. Nunca se pierde trabajo sin línea.
  - Aceptación: AC4. Test RED: cola con `createdAt` de hace 9 h → `Rejected(EXPIRED)` con los ítems; el view model llama `logQueueRejected` con la fecha y el código.
  - Riesgo: 1 (descarte de datos locales). Rollback: el store sigue borrando el blob; solo cambia lo que se informa.

- [ ] **T5 — A6: el asset de la release no puede divergir de producción.** Specs S6.
  - Archivos: `.github/workflows/android-release.yml`, `scripts/test_android_release_workflow.py`.
  - Regla: si el checkout del tag trae `packages/backend/apk/trindade-<versión>.apk` con su `.sha256` válido, el
  asset publicado es **ese** archivo, verificado con `aapt2`/`apksigner` y su digest; si falta, se publica el
  compilado. Un sidecar que no verifica, un `versionName` distinto o una firma distinta fallan el job.
  - Aceptación: AC5. Tests del workflow: (a) prefiere el binario del repo y su digest; (b) sidecar roto → falla;
  (c) archivo de otra versión → falla; (d) sin archivo → publica el compilado; (e) re-run converge al mismo digest.
  - Riesgo: 5 (entrega). Rollback: quitar el paso devuelve el comportamiento anterior, sin tocar tags ya publicados.

- [ ] **T6 — M1: `canDelete` día-level alineado con la ruta.** Specs S7.
  - Archivos: `packages/backend/src/modules/history-permissions.ts`, `loading/loading.service.ts`, `massas/massas.service.ts`, `reports/*`, tests de permisos, `LoadingHistoryPage.tsx`, `ReportHistoryPage.tsx`, `HistoryCardActions.kt`, tests.
  - Regla: el flag que habilita borrar un **lote/día** es verdadero solo si la ruta que lo ejecuta lo aceptaría (admin para lote); el de una **fila** sigue la regla de autoría.
  - Aceptación: AC6. Tests: Trabajador con filas propias ve borrar fila, no lote; Administrador ve ambos; la ruta rechaza con 403 lo que el flag ya no ofrece.
  - Riesgo: 2 (permisos). Rollback: revertir la proyección del flag.

- [ ] **T7 — M2: `sync_refused` correlacionado y atribuido.** Specs S8.
  - Archivos: `packages/backend/src/modules/integration/aero.movements.*`, `aero.log.contract.test.ts`, `packages/frontend/src/lib/aero-mirror.ts` (o el emisor), `packages/android/.../AeroAudit.kt` si aplica.
  - Regla: el rechazo del snapshot lleva el `attemptId` del intento y el `client` real (`web`/`android`); la web manda `X-Trindade-Client` en todas sus llamadas a `/integration/aero/*`.
  - Aceptación: AC7. Test RED: POST de snapshot rechazado → la fila de auditoría tiene `attemptId` y `client=web`; sin header, el backend no inventa `android`.
  - Riesgo: 3 (contrato del log). Rollback: el header es aditivo.

- [ ] **T8 — M3+M4: cerrar sesión olvida todo secreto y toda marca.** Specs S9.
  - Archivos: `api/client.ts`, `contexts/AuthContext.tsx`, `lib/aero-integration.ts`, `lib/aero-auto-read.ts`, tests de los tres.
  - Regla: `handleUnauthorizedRedirect`, logout y `clearAeroSettings` borran el JWT, la contraseña ERP de la sesión y la marca de auto-lectura; ninguna marca huérfana dispara una lectura tras un cierre de sesión.
  - Aceptación: AC8. Tests: con marca y contraseña presentes, `handleUnauthorizedRedirect()` deja ambos vacíos; `clearAeroSettings()` borra la marca; logout limpia las tres cosas.
  - Riesgo: 2 (seguridad). Rollback: las llamadas son aditivas.

- [ ] **T9 — M5: la fecha pedida viaja con el intento.** Specs S10.
  - Archivos: `lib/aero-pending-attempt.ts`, `pages/MassasLaunchPage.tsx`, `lib/aero-pending-attempt.test.ts`, `pages/massas/*.test.tsx`.
  - Regla: el intento de `movimentos` guarda la fecha pedida; el callback guarda el snapshot y recarga el espejo con esa fecha, no con la del reloj al volver.
  - Aceptación: AC9. Test RED: intento con `date=2026-11-03` y callback después de medianoche → `buildAeroMovementsSnapshot` recibe `2026-11-03`.
  - Riesgo: 1 (snapshot guardado bajo el día equivocado). Rollback: usar la fecha del closure otra vez.

- [ ] **T10 — M6: histórico de Relatórios como Cargamento.** Specs S11.
  - Archivos: `pages/ReportHistoryPage.tsx`, `components/ui/HistoryCardActions.tsx`, `components/ui/*`, tests de la página y de accesibilidad.
  - Regla: toda acción del histórico tiene target táctil ≥ 48 px y el día cerrado muestra chip de solo lectura con el mismo componente que Cargamento.
  - Aceptación: AC10. Tests a 390 px: las acciones conservan ≥ 48 px y el chip aparece con `isClosedDay`.
  - Riesgo: 6 (sin test de regresión visual nativo; se cubre con clases y DOM). Rollback: revertir el componente.

- [ ] **T11 — M7: contrato del log con cuerpos reales.** Specs S12.
  - Archivos: `aero.log.contract.test.ts`, fixtures nuevas bajo `packages/backend/src/modules/integration/__fixtures__/` o inline, `aero.log.service.ts`.
  - Regla: cada evento canónico (`launch_sync`, `read_history`, `test_connection`, `import`, `queue_rejected`) tiene al menos un caso con el cuerpo que el emisor real produce, incluidos los alias aceptados.
  - Aceptación: AC11. Test RED: un fixture con la forma real de `queue_rejected` (note con `aero_queue_rejected · date=… · launchIds=… · code=…`) se acepta y se expone con sus campos.
  - Riesgo: 3 (contrato del log). Rollback: los fixtures son datos de test.

- [ ] **T12 — M8+B2: documentación y KDoc coherentes.** Specs S13.
  - Archivos: `odd/tasks/auto-conciliacion-masas-erp-post-lanzamiento.md` (T6), `docs/auditoria-android.md`, `docs/integracion-aero-masas-web.md`, `docs/agents/trindade-development.md`, `README.md`, KDoc de `canDelete`.
  - Regla: no queda `localStorage` para la contraseña ERP, no queda 7012/7013 como valor en documentación pública, los conteos de tests que se citan coinciden con la suite y el ODD anterior cierra T6.
  - Aceptación: AC12. Verificación: `grep` dirigido y revisión de las frases citadas.
  - Riesgo: 6 (documentación). Rollback: `git revert` del commit de docs.

- [ ] **T13 — B1/B3/B4: deuda menor.** Specs S14.
  - Archivos: emisor de `logImport`, tests de reportes, tests que leen fuente con `readFileSync`.
  - Regla: `logImport` usa `phase:"result"`; el test de borrado de reporte afirma `REPORT_DELETE_FORBIDDEN`; donde un test lee el fuente para afirmar comportamiento, se sustituye por un test de comportamiento sin perder la cobertura.
  - Aceptación: AC13.
  - Riesgo: 6. Rollback: por test.

- [ ] **T14 — A5: runbook de verificación real.** Specs S15.
  - Archivos: `docs/verificacion-erp-tablet.md` (nuevo), enlace desde `docs/agents/trindade-development.md`.
  - Regla: pasos exactos para un día abierto desde la tablet: lanzar lote, ver la lectura automática, `/movimentoitem` 200 en el log, espejo con el día completo, filas conciliadas, qué mirar si falla y qué NO hacer (no reparar el 03/11). Queda marcado como **pendiente de ejecución real** desde esta máquina.
  - Aceptación: AC14 (documento revisable; ejecución real pendiente).
  - Riesgo: 6. Rollback: borrar el documento.

- [ ] **T15 — Entrega 0.7.2 (7013).** Specs S16, S17.
  - Pasos: `app.service.ts` (`LOCAL_APK_FILENAME`, `LOCAL_APK_BUILD_NUMBER=7013`, `FALLBACK_RELEASE.version`), APK firmado con 7013, sidecar, `packages/backend/apk/`, `docker compose build api web`, verificación de `/latest-release`, descarga y sha256; CHANGELOG, release docs, historial, README; CI verde; tag anotado `v0.7.2`; release con el binario de producción y sidecar; verificación final de tag, assets, hash y producción.
  - Aceptación: AC15–AC17.
  - Riesgo: 5 (entrega). Rollback: no se mueve ningún tag; un asset equivocado se reemplaza con `--clobber` sin crear release nueva.

## 5. Criterios de aceptación

- **AC1** Un fallo del backend al guardar el snapshot se reporta como `SNAPSHOT_BACKEND_UNREACHABLE` (auditoría `AERO_SNAPSHOT_BACKEND_UNREACHABLE`, retryable) y un rechazo HTTP como `SNAPSHOT_REFUSED`; la UI muestra frases distintas en español y portugués.
- **AC2** `logout()` y `changePassword()` tratan `200 {"success":true}` como éxito; hay test con MockWebServer y no queda `Response<SuccessResponse>` en `AuthApi`.
- **AC3** Dos salidas concurrentes al ERP no duplican cajas: un `launchId` en vuelo no se reenvía y el test lo demuestra con dos corrutinas.
- **AC4** Una cola expirada deja una línea `queue_rejected` con `AERO_QUEUE_EXPIRED` y la cantidad de ítems; no hay pérdida silenciosa.
- **AC5** Los tests del workflow demuestran que el asset preferido es el binario de producción del repositorio, que un sidecar roto o una versión distinta fallan el job y que un re-run no cambia el digest publicado.
- **AC6** El borrado de lote solo se ofrece a quien la ruta aceptaría; el de fila sigue la regla de autoría.
- **AC7** El rechazo del snapshot queda correlacionado por `attemptId` y atribuido al cliente real.
- **AC8** Tras logout, expiración del JWT o `clearAeroSettings`, no queda contraseña ERP ni marca de auto-lectura.
- **AC9** El snapshot de `movimentos` se guarda con la fecha pedida, aunque el callback llegue después de medianoche.
- **AC10** Las acciones del histórico de Relatórios tienen target ≥ 48 px y el día cerrado muestra chip de solo lectura.
- **AC11** El contrato del log cubre los eventos canónicos con cuerpos reales de los emisores y sus alias.
- **AC12** No queda documentación que diga `localStorage` para la contraseña ERP, ni el build interno publicado como valor, ni conteos de test falsos.
- **AC13** `logImport` usa `phase:"result"`, el test de reportes afirma `REPORT_DELETE_FORBIDDEN` y los tests de fuente sustituidos conservan su cobertura por comportamiento.
- **AC14** Existe el runbook de verificación real con pasos, comandos y criterio de éxito, marcado como pendiente de ejecución desde esta máquina.
- **AC15** El APK 0.7.2 está firmado con la clave oficial y declara `versionName 0.7.2` con el build interno 7013; `/latest-release` responde `v0.7.2`, `buildNumber 7013` y el tamaño del archivo.
- **AC16** La descarga pública y el asset de la GitHub Release `v0.7.2` comparten el sha256 de `packages/backend/apk/trindade-0.7.2.apk`; `v0.7.0` y `v0.7.1` no se movieron y no hay una segunda release.
- **AC17** CI en verde en el commit etiquetado y en el de documentación; `api` y `web` sanos.

## 6. Verificación real pendiente (ERP inalcanzable desde esta máquina)

`http://192.168.25.250:1453` no es alcanzable desde el host de desarrollo (`curl` sin respuesta), así que **no se
puede ejecutar** aquí la prueba de punta a punta contra el ERP de la fábrica. Queda preparado y marcado:

- **P1** Lanzar un lote de tres productos desde la tablet con 0.7.2 y un día abierto; comprobar en el log una
  llamada `read_history` con `result` y el mismo `attemptId`, y ninguna cola en vuelo.
- **P2** Verificar que las filas quedan conciliadas sin tocar «Sincronizar com ERP» y que el espejo guarda masas
  e insumos del día.
- **P3** Repetir con el ERP caído a propósito (sin Wi-Fi de planta): la UI debe decir «backend inalcanzable»,
  no «snapshot rechazado», y la cola debe conservar el pendiente con su línea de auditoría si expira.
- **P4** Confirmar que las siete filas del 03/11 siguen intactas (no se reparan en esta entrega).

## 7. Log

- **L1 — Pedido del usuario (verbatim):** ver la sección final de este documento.

---

- **L1 — Pedido del usuario (verbatim, 2026-11-04):**

```text
Trabaja como agente de ingeniería de Trindade en /home/wilkin/proyectos/Trindade, rama main, sin ramas nuevas. Esta tarea es una remediación completa de los hallazgos de la auditoría read-only de los ciclos 7006, 7007 y 0.7.1/7012. Debes crear primero el artefacto ODD, trabajar con TDD ESTRICTO (RED test que falla antes del fix, GREEN, REFACTOR) y luego implementar, probar, desplegar y publicar 0.7.2.

NO instales ningún APK en emulador/teléfonos; el usuario lo hará manualmente. NO toques ni muevas tags/releases existentes (v0.7.0, v0.7.1) ni borres datos/volúmenes. NO abras ramas ni worktrees. Todo a main. Si no puedes verificar algo contra el ERP de la fábrica porque el host no es alcanzable desde esta máquina, deja el test/runbook preparado y márcalo como pendiente de ejecución real; no inventes un resultado.

OBJETIVO DEL ODD
Crear `odd/tasks/remediacion-hallazgos-auditoria-0.7.2.md` antes de tocar código, con:
- contexto y evidencia de la auditoría;
- prioridades ALTA/MEDIA/BAJA;
- invariantes: paridad web/Android, snapshot completo, no duplicar envíos, no conciliar por HTTP 200, credenciales fuera de logs/documentación pública, no filtrar el espejo a masas (insumos para Relatório), versionCode/buildNumber, no downgrade;
- tareas TDD con archivos, tests, criterios de aceptación, riesgos y rollback;
- sección de verificación real pendiente (ERP inalcanzable desde esta máquina).

HALLAZGOS A REMEDIAR (prioridad ALTA)
A1. `SNAPSHOT_REFUSED` se usa también cuando el backend no responde (`AeroDispatcher.kt`): distinguir “snapshot rechazado por el backend” de “backend inalcanzable”, con código/estado propio, UI y auditoría coherentes. Tests Android/backend.
A2. `AuthApi.logout` y `changePassword` siguen usando `SuccessResponse` y un 200 `{"success":true}` puede decodificarse como fallo. Usar `Response<Unit>` (o el patrón ya aplicado a lifecycle) y probar 200 real.
A3. Ventana de doble envío Android entre lote y cola: `confirmLaunch` libera `isSubmitting` antes de terminar `dispatchToErp`, y una recarga/reintento puede drenar un ítem ya encolado. Serializar lote/cola/flush (mutex/estado) y probar concurrencia; no duplicar cajas.
A4. TTL de cola Android (`AeroQueueStore`): un pendiente de más de 8 h se borra en silencio. Debe emitir `queue_rejected`/auditoría o conservarse con un estado visible; nunca perder trabajo sin traza. Test.
A5. Verificación real ERP: preparar un runbook y un test de aceptación para tablet/día abierto; no se puede ejecutar aquí. Dejar claro qué falta y cómo comprobarlo (`/movimentoitem` 200, espejo, filas conciliadas, logs).
A6. Reproducibilidad/provenance del release: un re-run del workflow `android-release.yml` puede volver a subir un APK recompilado distinto del binario de producción. Añadir guarda/verificación (o publicar de forma reproducible) y tests del workflow para que release y `/latest-release` conserven el mismo asset/digest. No crear una release incorrecta.

HALLAZGOS MEDIA
M1. `canDelete` de lote día-level sobredeclara permiso a un Trabajador; la ruta de borrado es admin-only. Alinear flags/proyección y ruta (o retirar la acción cuando la ruta la rechazará). Tests web/Android/backend.
M2. `sync_refused` del snapshot no lleva `attemptId` y la web no envía `X-Trindade-Client`; correlacionar el rechazo con el intento y atribuir el cliente real. Tests.
M3. Web: `handleUnauthorizedRedirect` limpia el JWT pero no `clearAeroSessionPassword`; limpiar también el secreto ERP y la marca de auto-lectura en logout/expiración/clear. Tests de seguridad.
M4. Web: la marca de auto-lectura (`AERO_AUTO_READ_KEY`) no la limpia `clearAeroSettings`/logout; evitar que una marca huérfana dispare un viaje ajeno. Test.
M5. Web: la fecha de la lectura no viaja en el callback de `movimentos`; un cruce de medianoche puede guardar el snapshot bajo el día nuevo. Llevar la fecha pedida en el attempt/callback y usarla. Test.
M6. Histórico de Relatórios web: acciones sin target táctil 48 px y sin chip de solo lectura/`isClosedDay`; alinear con Cargamento. Tests 390 y accesibilidad.
M7. Contrato del log backend: fixtures con `note`/payload inventados; usar cuerpos reales de los emisores web/Android y cubrir los alias/eventos canónicos. Tests.
M8. Documentación desactualizada/contradictoria: ODD T6 sin marcar, `auditoria-android` mezcla 0.7.0/0.7.1, guías que aún dicen localStorage para la contraseña web, publicar 7012 pese a la regla de no publicar el código, conteos de tests inconsistentes. Corregir sin publicar versionCode como valor en notas.

HALLAZGOS BAJA
B1. `logImport` usa `phase:"response"`; usar `result` como el resto.
B2. KDoc obsoletos sobre `canDelete`/históricos.
B3. Assert del código `REPORT_DELETE_FORBIDDEN` en tests.
B4. Tests frágiles que leen el fuente con `readFileSync`; sustituir por comportamiento donde falte (sin borrar cobertura existente).
B5. Añadir cobertura instrumentada/Compose solo si es viable y aporta al flujo; si no, documentar la limitación y mantener JVM/Compose/e2e.
B6. `/saidasitem` no tiene consumidor de producción: documentarlo como deuda/fuera de alcance, no inventar UI. No lo conviertas en un blocker.

RELEASE 0.7.2
- versionName 0.7.2, versionCode/buildNumber 7013 (>7012), APK firmado.
- Actualizar `LOCAL_APK_FILENAME='trindade-0.7.2.apk'`, `LOCAL_APK_BUILD_NUMBER=7013`, `FALLBACK_RELEASE.version='v0.7.2'`, copiar APK y sidecar a `packages/backend/apk/`.
- El workflow debe publicar el build 7013, nunca 7002 derivado del tag; `max(código del tag, build interno)` ya existe, pero valida que 7013 gane y añade tests/guardas.
- Reconstruir API y web, verificar `/latest-release` (v0.7.2, buildNumber 7013, tamaño), descarga/sha256, API/web healthy.
- Actualizar CHANGELOG, release docs, historial, README y ODD; no mostrar versionCode/buildNumber como valor en notas públicas; documentar el build interno solo donde corresponda.
- Crear tag anotado v0.7.2 en main con CI verde y publicar GitHub Release v0.7.2 con APK+sidecar. No mover/reutilizar v0.7.0/v0.7.1; no crear segunda release. Si el workflow genera un asset con digest distinto, reemplazarlo por el binario de producción y dejarlo verificado; no permitas que release y producción diverjan.
- No instalar el APK.
- Limpiar temporales/worktrees propios; no borrar backups/datos.

ORDEN Y CALIDAD
1. ODD y commit docs.
2. Fase ALTA: tests RED, fixes, GREEN.
3. Fase MEDIA.
4. Fase BAJA/documentación.
5. Tests completos (backend, web node/unit/e2e, Android JVM/Compose; typecheck/contracts), build 7013 y despliegue.
6. Push main, CI verde; tag/release solo después.
7. Reporta commits, tests, estado CI, release/assets/hashes, pendientes reales de ERP y confirmación de no instalación.

Trabaja con ciclos de control de 5 minutos y no te desvíes a features fuera de estos hallazgos. Si una decisión bloquea o el workflow no puede garantizar 7013/no-downgrade, detente y reporta antes de publicar una release incorrecta.
```
