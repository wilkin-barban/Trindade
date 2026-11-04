# Auto-conciliación de Masas contra el ERP después de lanzar

Estado: **Fase 1 autorizada (2026-11-03)**. Q1(a), Q2(a) y Q4(a) aprobadas; Q3 de publicación pendiente; Q5 cerrada sin reparar el pasado.
Entrega objetivo: build Android **7012** sobre `versionName` **0.7.1**, el mismo comportamiento en Web/iPhone, sin tag ni release nuevos.
Directiva: L1. Evidencia verificada: §2 y L2. Ambigüedades de la directiva: §3.3 y L3.

## 1. Contexto y objetivo

Después de lanzar masas, Trindade guarda el lanzamiento y lo manda al ERP, pero **no vuelve a leer el día del ERP**. El espejo local (`aero_movements`) queda como estaba, la tabla unificada compara los lanzamientos contra un espejo viejo y los muestra como pendientes con `ent_lan = null` aunque la planta ya los tenga. La pantalla no distingue «la planta no lo recibió» de «nadie volvió a preguntar».

Objetivo: que cada lote o cola de envíos termine con **exactamente una** lectura del día contra `/movimentoitem`, guardada en el backend, de modo que la tabla reconcilie sola; y que un fallo de lectura no se confunda con un fallo de envío.

Lo que no cambia: el envío (`/entradasitem`), las reglas de conciliación, el esquema de la base y el recorte de presentación de masas.

### 1.1 Por qué el `200` no alcanza

Un `200` en `/entradasitem` dice que el ERP recibió la entrada en su buffer. El asiento contable aparece recién cuando el ERP lo publica y `/movimentoitem` lo devuelve. Hoy la única prueba que la pantalla acepta es el espejo: `massasUnifiedRows` marca `reconciled` sólo si `reconcileAeroMovements` empareja el lanzamiento con un movimiento guardado (`packages/frontend/src/lib/massas-unified.ts:181`, `packages/frontend/src/lib/aero-integration.ts:866`, gemelo Android en `MassasUnified.kt`). Sin lectura, la fila queda `pendingErp` para siempre.

## 2. Evidencia (verificada, no inferida; 2026-11-03T21:32Z)

### 2.1 Base viva (SQLite de producción)

`massa_launches` del 2026-11-03, todas de `jaime` (`user_id` 18, rol Trabalhador):

| id | hora (UTC) | producto | cajas | `ent_lan` |
| ---: | --- | --- | ---: | --- |
| 101 | 09:38:59 | 5000 MASSA ROLO 1KG | 60 | `null` |
| 102 | 09:43:55 | 5000 MASSA ROLO 1KG | 30 | `null` |
| 103 | 11:27:19 | 5000 MASSA ROLO 1KG | 30 | `null` |
| 104 | 12:03:39 | 5000 MASSA ROLO 1KG | 30 | `null` |
| 105 | 12:46:01 | 5000 MASSA ROLO 1KG | 30 | `null` |
| 106 | 13:22:41 | 5000 MASSA ROLO 1KG | 30 | `null` |
| 107 | 18:53:38 | 5000 MASSA ROLO 1KG | 150 | `null` |

`aero_movements`: **0 filas** con `entry_date = 2026-11-03`. Las últimas son del 30/10 (21 filas) y del 29/10 (23 filas). El día que la planta trabajó no existe en el espejo.

### 2.2 Log de integración (`logs/aero-integration.log`)

- Siete lanzamientos **aceptados**: seis `dispatch` con `httpStatus: 200` (notas `launch #101` … `#106`) y un `launch_sync` `requested`/`result` 200 (`launch #107`, `attemptId e7519bbf-…`, `buildNumber 7008`, `appVersion 0.7.0`).
- Cuatro intentos de lectura, **todos 500** `AERO_ERP_REFUSED` (16:21:57, 16:22:04, 18:44:26, 18:44:33; `buildNumber 7008`). **Cero `read_history` exitosos** el 03/11.
- Conclusión: la planta recibió todo y Trindade no volvió a preguntar; los únicos intentos de lectura que hubo fallaron por un defecto del cliente instalado.

### 2.3 Android: dónde termina el envío y dónde nadie lee

| Punto | Archivo:línea | Qué hace hoy |
| --- | --- | --- |
| Lote | `MassasLaunchViewModel.kt:427` `dispatchToErp` | encola, despacha producto por producto, publica **un** veredicto (486-496) y refresca el día local (500-501). Nunca llama al ERP para leer. |
| Fila suelta | `MassasLaunchViewModel.kt:559` `sendPendingLaunch` | despacha y hace `refreshMirror` (602) — backend, no ERP. |
| Cola | `MassasLaunchViewModel.kt:638` `flushPendingQueue` | drena tandas de 8, liquida contra `settledLaunchIds()` del **espejo guardado** (645) y refresca (695). Cero lecturas. |
| Botón | `MassasLaunchViewModel.kt:505` `syncAeroDay` | único camino que lee el ERP; **limpia** `resultDialogMessage`/`errorMessage`/`noticeMessage` al arrancar (524-527) y escribe el diálogo al terminar. |
| Espejo | `MassasLaunchViewModel.kt:183` `refreshMirror` | lee `/integration/aero/movements` (backend) y descarta la respuesta si el día cambió. |
| Apertura | `MassasLaunchViewModel.kt:228` `loadDay` | `refreshMirror` + `flushPendingQueue`; no hay lectura del ERP. |
| Conciliación | `MassasLaunchViewModel.kt:927` `settledLaunchIds` | depende de `unifiedRows`, que depende del espejo. |

### 2.4 Web: el callback no vuelve a viajar

| Punto | Archivo:línea | Qué hace hoy |
| --- | --- | --- |
| Callback | `MassasLaunchPage.tsx:808` | despacha el resultado y limpia la URL; no lee nada. |
| Lote | `MassasLaunchPage.tsx:839` | si la cola quedó vacía muestra el veredicto; si no, `triggerAeroSync(rest)` vuelve a salir. |
| Fila | `MassasLaunchPage.tsx:920` | mismo cierre: `setResultModal` y, si falla, reencola. |
| Salida | `MassasLaunchPage.tsx:391` `triggerAeroSync` → `:453` | sale con `window.location.href`: la página se descarga, se pierde el estado de React. |
| Lectura | `MassasLaunchPage.tsx:510` `handleSyncFromErp` → `:538` | segundo viaje manual, misma mecánica de navegación. |
| Vuelta | `MassasLaunchPage.tsx:832` → `:548` `handleMovementsCallback` | postea el espejo y hace `loadMirror` (`:217`). |
| Pista | `MassasLaunchPage.tsx:1358` | el diálogo de éxito le pide al operador «Actualizá la pestaña «Espelho do ERP»»: la frase que este cambio vuelve falsa. |

### 2.5 Backend: contrato ya correcto, sin cambios de esquema

- `POST /api/integration/aero/movements` (`packages/backend/src/modules/integration/aero.routes.ts:106-115`) → `saveAeroMovements` (`aero.movements.service.ts:83`); un día pasado responde 409 `MASSAS_HISTORY_FROZEN` (`aero.movements.service.ts:92-98`, probado en `aero.movements.routes.test.ts:393`).
- `GET` devuelve el día completo (`aero.movements.service.ts:134`); los contadores de masas/insumos salen de `movementLenses` (`packages/backend/src/modules/reports/receipts.service.ts:89`).
- El snapshot guarda **todo** lo que el ERP devolvió: `aero.movements.routes.test.ts:303-333` registra 11 movimientos (10 masas + 1 insumo) y los guarda los 11. El recorte es de presentación: `aeroMirrorSeats` (`aero-mirror.ts:228`) y `massasUnifiedRows` filtran por catálogo.

### 2.6 Versiones y distribución

- `GET /api/app/latest-release` → `0.7.1`, `buildNumber 7011`, `apkSize 11277888`, `publishedAt 2026-11-03T20:11:58Z`.
- Archivo `packages/backend/apk/trindade-0.7.1.apk`, 10.8 MB, sha256 `41f87a148e28cc1f40bb2ac25a2e70f31587c598e806f2c65efa37411a46c545`; `LOCAL_APK_BUILD_NUMBER = 7011` (`app.service.ts:29`).
- **No existe release ni tag `v0.7.1`**: `gh release view v0.7.1` responde «release not found»; `git tag` sólo tiene `v0.7.0` (`4f41400`, build 7006). El APK se sirve desde disco y viaja dentro de la imagen de la API (`docker/Dockerfile.api:49`), así que publicarlo exige reconstruir `api`.
- La 0.7.1 publicada ya corrige `_method` en cuerpo/query y `ENTSAI: "E"` (L1) y su APK contiene la cadena `_method` en el `dex`; el 7011 se registró después de ese fix (`bbeafc9`, 14:01 local; registro 17:14). La tablet corre **7008 / 0.7.0**, anterior al fix: eso explica los cuatro 500 y significa que **la lectura sólo puede verificarse de punta a punta desde la tablet actualizada**.
- `http://192.168.25.250:1453` no es alcanzable desde este equipo (`curl` 000): el ERP de la planta sólo se ve desde su red.

*Actualizado el 2026-11-04:* esta sección describe el estado del 2026-11-03 al abrir el ODD. Después de T7 y T8 la
instancia sirve el build 7012 con digest `f325edb6…`, y el tag `v0.7.1` y su release existen; ver L7 y la
evidencia de T8.

## 3. Invariantes y decisiones

### 3.1 Cerradas

- **I1 — Conciliar es leer el espejo.** Un `200` en `/entradasitem` es recepción; `reconciled` sólo si el asiento está en `aero_movements`.
- **I2 — El espejo se guarda completo.** El snapshot conserva todo lo que el ERP devolvió; el recorte a masas es de presentación (tablas y contadores de Masas). Recebimento y Relatórios siguen viendo los insumos.
- **I3 — Una lectura por lote o por cola**, no una por producto ni una por tanda.
- **I4 — La lectura va después del veredicto y no lo reemplaza.** El operador primero sabe si su trabajo salió.
- **I5 — El fallo de lectura no deshace el lanzamiento.** La fila queda pendiente y el motivo se muestra; no se pierde la respuesta del envío.
- **I6 — Nada se reenvía si el espejo fresco ya lo tiene.** La guarda de la cola se apoya en la última lectura, no en la guardada.
- **I7 — Guardas de la lectura automática:** sólo el día en pantalla igual a hoy, sólo con credenciales completas, sólo si hubo envíos.
- **I8 — Una lectura en vuelo a la vez.** Ni el botón ni el camino automático abren una segunda.
- **I9 — Nada más se rompe.** Los errores con sus códigos y frases, la cola/outbox, los permisos y la auditoría quedan como están: el cambio sólo agrega una lectura.

### 3.2 Abiertas (bloquean tareas)

- **Q1 — Web: cuándo arranca el segundo viaje. Aprobada (a).** El segundo viaje de movimientos se dispara al cerrar el diálogo del veredicto, mediante un único cierre compartido (el `onClose` del `Dialog` en `MassasLaunchPage.tsx:1336` y el botón «Fechar» en `:1372`), con la marca persistida una sola vez. No se navega antes de mostrar el veredicto.
  *Por qué:* Safari/Atajos admite un viaje por carga de página; el segundo salto es inevitable y el veredicto no se puede perder.
- **Q2 — Android: cómo se muestra el fallo de lectura. Aprobada (a).** `noticeMessage = failure.describe()` (la frase compartida de `AeroFailure`), sin pisar el diálogo del lote.
- **Q4 — Cola: leer antes de liquidar. Aprobada (a).** Con la cola no vacía se lee primero, se liquida contra ese espejo, se envía y se vuelve a leer sólo si se envió algo (2 lecturas en una apertura con pendientes, 0 si no hay). No se reenvía lo que el espejo fresco ya contiene.
- **Q6 — Web: la contraseña del ERP en la sesión de la pestaña. Aprobada (c).** La contraseña pasa de la
  memoria del módulo al `sessionStorage` de la pestaña. Sin esto la lectura automática no existe en web: el
  atajo vuelve abriendo un documento nuevo, y el secreto que sólo vivía en el módulo anterior se perdía justo
  cuando el segundo viaje tenía que salir. Sigue sin tocar `localStorage`, cookies ni el servidor; no se
  registra en logs, bitácora ni avisos; se borra al cerrar sesión en Trindade y con **Limpiar**, y muere con
  la pestaña. Reemplaza la decisión de almacenamiento de `paridad-web-android-erp-7005` (T20: «sólo memoria»)
  para el alcance de esta feature.
  *Riesgo aceptado:* un script que se ejecute en la página puede leer el secreto mientras la pestaña viva; el
  alcance queda limitado a la pestaña y a la sesión. Una pestaña abierta sin relación con la que lanzó arranca
  vacía y la página vuelve a pedir la contraseña.
- **Q3 — Release: publicación en GitHub. Pendiente de decisión.** Aprobado implementar, testear, construir el APK 7012 firmado y desplegar producción con `latest-release`. **Prohibido** tocar el release `v0.7.0`, crear tag o release `v0.7.1` y alterar el asset de GitHub: el APK vive en `packages/backend/apk/trindade-0.7.1.apk` hasta que se decida publicarlo.
- **Q5 — Las siete filas del 03/11. Cerrada sin reparación.** El operador confirmó que no tiene acceso ahora y acepta que queden como están: no se repara el pasado, no se toca `aero_movements` del 03/11 y la prueba de aceptación pasa a ser un día abierto nuevo (AC10).

### 3.3 Discrepancias entre la directiva y el repositorio

1. **«los 8 productos de masas»**: el catálogo `MASSAS` tiene **10** códigos (`packages/backend/src/modules/stock/stock.catalog.ts:35-46`); el pedido hablaba de 8 y esa discrepancia quedó verificada. La invariante no depende del número: **no se hardcodea ni 8 ni 10**, el filtro de la vista es el catálogo del día/`MASSAS` y el backend guarda todo el espejo para Relatório y Recebimento.
2. **«reemplazar el asset del release existente»**: no existe release `v0.7.1`; el único release es `v0.7.0` (build 7006). Ver Q3.
3. **«una sola lectura por lote»**: `refreshMirror` seguirá leyendo el **backend** (no el ERP) al terminar; los tests cuentan `readMovements`/`syncDay`, no toda la red.
4. **La tablet corre 7008**: la verificación real depende de que el operador instale el 7012. Hasta entonces, el 500 seguirá apareciendo en el log y no es un defecto de este cambio.

## 4. No objetivos

- No filtrar el snapshot del backend a los productos de masas ni cambiar `movementLenses`.
- No cambiar las reglas de conciliación (`reconcileAeroMovements` / `MassasUnified`) ni el diseño de la tabla.
- No agregar sondeo periódico ni un planificador que consulte `/movimentoitem` por su cuenta.
- No cambiar el atajo de iOS, sus ocho acciones ni la receta de instalación: el segundo viaje reutiliza `movimentos`.
- No tocar el release `v0.7.0`, su tag `4f41400` ni su APK; tampoco crear tag o release `v0.7.1`.
- No tocar las lentes de Recebimento ni de Relatórios.
- No instalar nada en el emulador: la tablet la maneja el operador.
- No borrar ni reescribir el snapshot: `saveAeroMovements` hace upsert y nunca elimina asientos que el ERP dejó de devolver.

## 5. Specs

- **S1 — Una lectura por lote o por cola.** `dispatchToErp`, `sendPendingLaunch` y `flushPendingQueue` terminan con exactamente **una** invocación de lectura del día cuando `sent > 0`; un lote de tres productos es una lectura, no tres; una cola de diez drenada en dos tandas es una lectura, no dos.
- **S2 — La lectura va después del veredicto.** Android publica `resultDialogMessage`/`resultDialogIsSuccess` antes de leer; web muestra el modal y dispara el viaje al cerrarlo (Q1).
- **S3 — La lectura no reemplaza el veredicto.** El camino automático no escribe `resultDialogMessage` ni `errorMessage`; no puede reutilizar `syncAeroDay` tal cual porque ese método limpia el diálogo al arrancar (`:524-527`).
- **S4 — El espejo se guarda completo.** Se postea la lista entera que devolvió el ERP y el backend responde `saved` con esa cantidad; la tabla de Masas sigue mostrando sólo el catálogo del día y ningún insumo aparece como fila.
- **S5 — La conciliación es por espejo.** Tras la lectura: guardar, `refreshMirror`, `repository.day`; las filas del lote pasan de `pendingErp` a `reconciled` sólo si `reconcileAeroMovements` las empareja por `ent_lan`, o por fecha + producto + unidades + operador.
- **S6 — Fallo de lectura.** El veredicto del envío queda intacto, la fila sigue pendiente y el motivo es visible: Android `noticeMessage = failure.describe()` (Q2); web el feedback de movimientos con el motivo, nunca «0 movimientos» como éxito.
- **S7 — Nada se reenvía si el espejo fresco lo tiene.** Después de leer se hace `queue.settle(settledLaunchIds())`; con Q4(a), antes de reintentar se liquida con el espejo recién leído.
- **S8 — Guardas.** No hay lectura automática si el día en pantalla no es hoy, si las credenciales no están completas (`!settings.ready`), si no hubo envíos (`sent == 0`), ni después de un día cerrado.
- **S9 — Una lectura en vuelo.** Si el botón está leyendo (`isSyncingAero`), el camino automático no abre otra; si la lectura automática está en vuelo, el botón no dispara una segunda.
- **S10 — Web: la marca del viaje pendiente.** Con la cola vacía y veredicto exitoso se arma una marca por día en `localStorage`; se consume **una sola vez**, al cerrar el veredicto (el `onClose` del diálogo y el botón «Fechar» pasan por el mismo cierre), y dispara `handleSyncFromErp()`. Sin marca no hay viaje. La contraseña que ese viaje necesita vive en el `sessionStorage` de la pestaña (Q6), así que la lectura puede salir del documento que volvió del atajo: sin ella la página diría el motivo y no habría lectura.
- **S11 — Web: sin bucles ni pérdida.** La marca se consume antes de navegar; un viaje que no vuelve no se reintenta solo; «Reenviar fallas» no dispara la lectura (la cola no está vacía); un lote parcial no arma la marca; el callback de `movimentos` no arma otra marca; recargar la página con la marca armada no viaja sin un veredicto cerrado.
- **S12 — Web: reutiliza el atajo existente.** El segundo viaje es `buildAeroBridgeTriggerUrl` con `action: 'movimentos'` y su envelope, sin tocar la receta del atajo.
- **S13 — Android: un solo camino de lectura.** Un método privado (`readDay(date, mode)`) usado por el botón y por el camino automático; el automático actualiza `aeroSyncedAt` y no muestra spinner; el botón sigue mostrando `massas_aero_sync_done` y su indicador.
- **S14 — Observabilidad.** Cada lectura deja un par `read_history` `requested`/`result` con el mismo `attemptId`, la fecha en `note`, `buildNumber` del APK instalado y `saved` en la respuesta.
- **S15 — Día cerrado.** Un 409 `MASSAS_HISTORY_FROZEN` no se reintenta: se muestra el motivo y la fila queda pendiente.
- **S16 — Release.** `versionName` 0.7.1, `versionCode`/`buildNumber` **7012**, firmado con la clave oficial, `/latest-release` con `buildNumber 7012` y el `apkSize`/sha256 del archivo nuevo; sin tag ni release nuevos *en esta fase* (Q3). La publicación en GitHub se rige por S18.
- **S17 — Copia.** `massas.erp.mirrorHint` deja de pedir una actualización manual; se reescribe en `es.json` y `pt-BR.json` con paridad, y el test que la cita se actualiza.
- **S18 — Publicación del tag.** Un tag anotado `v0.7.1` sobre el commit de `main` con CI verde publica la GitHub Release `v0.7.1` con `trindade-0.7.1.apk` y su `.sha256`, y ese sha256 es el del APK que sirve producción. El `versionCode` del asset es el build interno de producción (7012), nunca el derivado del tag (7001), porque publicarlo sería un downgrade: el workflow lee `LOCAL_APK_BUILD_NUMBER` y aplica `max(código del tag, build interno)`, con tests del workflow. No se mueve ni se reutiliza `v0.7.0`, no se crea una segunda release, y el `versionCode` no aparece como valor en las notas públicas.

## 6. Tareas

Fase 1 — Android (T1, T2). Fase 2 — Web (T3, T4). Fase 3 — contrato y conciliación (T5). Fase 4 — documentación y entrega (T6, T7). Fase 5 — publicación (T8).

- [x] **T1 — Android: una lectura después del lote.** Specs S1 S2 S3 S5 S9 S13.
  - Archivos: `packages/android/app/src/main/java/com/trindade/app/massas/MassasLaunchViewModel.kt`, `packages/android/app/src/test/java/com/trindade/app/massas/MassasLaunchViewModelTest.kt`, `AeroTestFakes.kt`.
  - Qué: extraer de `syncAeroDay` un camino privado que lea y guarde sin tocar el diálogo; llamarlo al final de `dispatchToErp` cuando `sent > 0` y el día siga siendo hoy; después `refreshMirror` + `repository.day`.
  - Pruebas (RED primero): `elLoteTerminaConUnaSolaLecturaDelDia`, `elVeredictoDelLoteSigueEnElDialogoDespuesDeLeer`, `unLoteSinEnviosNoLee`, `elBotonDuranteLaLecturaAutomaticaNoDisparaOtra`.
  - Aceptación: 1 lectura para 3 productos; `resultDialogMessage` intacto; `aeroSyncedAt` actualizado; `readDates` del fake con la fecha del día.
  - Commit: `feat(android): re-read the erp day once after a launch batch` → hecho en `15d87b8` (T1 y T2 juntos). Suite Android 1346/1346.
- [x] **T2 — Android: fila suelta, cola y guarda contra el espejo fresco.** Specs S1 S6 S7 S8 S15. Depende de Q2 y Q4.
  - Archivos: los mismos de T1.
  - Qué: llamar al mismo camino desde `sendPendingLaunch` y al final de `flushPendingQueue`; liquidar la cola con el espejo recién leído; fallo → `noticeMessage`; sin credenciales o día pasado, nada.
  - Pruebas: `elEnvioIndividualTambienDejaElEspejoAlDia`, `laColaNoReenviaLoQueElEspejoFrescoYaTiene`, `unFalloDeLecturaDejaElLanzamientoHechoYElMotivoVisible`, `noLeeSinCredencialesNiUnDiaPasado`.
  - Aceptación: una lectura por fila suelta y una por cola drenada; cero reenvíos de lo que el espejo fresco contiene; fallo de lectura = fila pendiente + motivo + veredicto intacto.
  - Commit: `feat(android): reconcile the pending queue against a fresh erp day`.
- [x] **T3 — Web: marca y disparo del segundo viaje.** Specs S1 S2 S6 S10 S11 S12 S17. Depende de Q1.
  - Archivos: `packages/frontend/src/lib/aero-auto-read.ts` (nuevo), `src/lib/aero-auto-read.test.ts` (nuevo), `src/pages/MassasLaunchPage.tsx`, `src/i18n/locales/es.json`, `src/i18n/locales/pt-BR.json`, `src/pages/massas/aero-result-dialogs.test.ts`.
  - Qué: librería pura `armAeroAutoRead` / `consumeAeroAutoRead` (clave propuesta `trindade.aero.auto-read.v1`, mismo patrón que `aero-queue.ts:67`); armar al cerrar el callback con la cola vacía y `status === 'ok'`; consumir en un `closeResultModal()` único que cubre `:1336` y el botón «Fechar» `:1372`, y llamar `handleSyncFromErp()`; «Reenviar fallas» no consume; texto de `mirrorHint` acorde.
  - Pruebas: `armaLaMarcaSoloConLaColaVacia`, `consumeLaMarcaUnaSolaVez`, `noArmaEnUnDiaPasado`, `elReenvioDeFallasNoConsumeLaMarca`.
  - Aceptación: con la cola vacía queda una marca por día; se consume una sola vez al cerrar el veredicto y dispara un viaje; el reenvío de fallas no la consume; `mirrorHint` ya no pide actualizar a mano.
  - Commit: `feat(web): read the erp day after the launch queue drains` → `d6347ea`; la contraseña de la sesión, `8b3ed8c` (Q6).
- [x] **T4 — Web: e2e del viaje automático.** Specs S10 S11.
  - Archivos: `packages/frontend/src/__e2e__/auto-read-after-launch.spec.ts` (nuevo), sobre el arnés de `aero-batch-launch.spec.ts` (`?aero_action=…&aero_data=…`).
  - Pruebas: `closing the launch verdict reads the day once`, `a second dismissal does not travel again`, `a refused product keeps the retry and does not travel`.
  - Aceptación: tras el lote, la marca queda consumida; con la vuelta `movimentos` simulada, las filas del lote pasan a conciliadas y el insumo no aparece; segundo cierre sin viaje.
  - Commit: `test(web): cover the automatic movements read after a launch` → `7a81603`; el spec vive en `__e2e__/auto-read-after-launch.spec.ts`.
- [x] **T5 — Contrato y conciliación post-lectura.** Specs S4 S5.
  - Archivos: `packages/frontend/src/lib/massas-unified.test.ts`, `packages/frontend/src/lib/aero-integration.test.ts`, `packages/android/app/src/test/java/com/trindade/app/massas/MassasUnifiedTest.kt`, `packages/backend/src/modules/integration/aero.movements.routes.test.ts` (sólo si falta cobertura).
  - Pruebas: `unaLecturaDelDiaConciliaElLoteYNoMeteInsumos` (web y Android), `elEspejoGuardaInsumosAunqueMasasLosOculte` (verifica el contrato existente `:303-333`).
  - Aceptación: la fila se concilia por fecha + producto + unidades + operador; un asiento de insumo queda guardado e invisible en Masas; el backend no filtra nada.
  - Evidencia: `una lectura del día concilia el lote y no mete insumos` en `massas-unified.test.ts`; Android ya lo fijaba en `MassasUnifiedTest` (`a supply is filtered out of the table but still importable on its own`), y el contrato del backend ya guarda los 11 movimientos (`aero.movements.routes.test.ts:303-333`). No se duplicó.
- [x] **T6 — Documentación.** Specs S2 S10 S14 S16.
  - Archivos: `docs/integracion-aero-masas-web.md`, `docs/agents/trindade-development.md` (contrato de pruebas), `docs/release-android-historial.md` (fila 0.7.1 con `buildNumber` y fila 7012), `CHANGELOG.md`.
  - Qué: explicar el segundo viaje, la marca, las guardas y qué mirar en el log; dejar escrito que los insumos del espejo son de Relatório/Recebimento y que Masas sólo los oculta; y corregir `docs/release-android*.md` para que digan que el código de build es **interno** y no se publica en la identidad del release.
  - Aceptación: un lector nuevo entiende el flujo (lanzar → veredicto → lectura → conciliación) sin leer código; las docs de release explican que el código es interno y no exponen `versionCode`/`buildNumber` como valor público.
  - Commit: `docs(aero): document the automatic post-launch reconciliation`. Cerrada también por la
    remediación 0.7.2 (`odd/tasks/remediacion-hallazgos-auditoria-0.7.2.md`, T12): las guías dicen
    `sessionStorage` para la contraseña y el código de build ya no se publica como valor.
- [x] **T7 — Release 7012.** Spec S16. Depende de Q3 y de T1–T5 en verde. Riesgo alto (entrega).
  - Pasos: `./gradlew clean :app:assembleRelease` con `LOCAL_APK_BUILD_NUMBER=7012` (receta de `docs/agents/trindade-development.md` §6.5 y `docs/release-android.md`); verificar firma (huella `EE:0E:40:…`), `versionName 0.7.1` y `versionCode 7012`; copiar a `packages/backend/apk/trindade-0.7.1.apk`; recalcular `.sha256`; `docker compose build api web && docker compose up -d api web`; comprobar `GET /api/app/latest-release`, la descarga y el sha256 servido.
  - Aceptación: AC8–AC9. No instalar en el emulador ni por `adb`; la tablet la actualiza el operador y AC10 se prueba en un día abierto. Sin tocar el release `v0.7.0`, sin tag/release `v0.7.1` y sin publicar en GitHub (Q3).
  - Evidencia: APK firmado (`versionName 0.7.1`, `versionCode 7012`, huella `EE:0E:40:…`) de 11.277.888 bytes,
    sha256 `f325edb6d3c03eba2f058b7aa099961fa99ba12243c6ffbec2d8e44e7683de1f`; copiado a
    `packages/backend/apk/trindade-0.7.1.apk` con su `.sha256`; `LOCAL_APK_BUILD_NUMBER = 7012`; `api` y `web`
    reconstruidos y sanos; `latest-release` público responde `buildNumber 7012`, `apkSize 11277888` y la
    descarga coincide con el sha256. Sin tag ni release de GitHub en esta fase.
  - Commit: `chore(release): ship Android 7012 with the post-launch reconciliation`.
- [x] **T8 — Publicación 0.7.1.** Spec S18. Depende de T7 y de CI verde en el commit etiquetado. Riesgo alto (entrega).
  - Pasos: documentar 0.7.1, el build interno y `sessionStorage`; cambiar el workflow de release para que el `versionCode` del tag sea el mayor entre el derivado y `LOCAL_APK_BUILD_NUMBER`, con tests; commit, push y CI verde; crear y subir el tag anotado `v0.7.1` sobre ese commit; ejecutar y vigilar el workflow `Android release`; ajustar título y notas de la release sin publicar el `versionCode`; verificar `gh release view`, la descarga, el sha256, `/api/app/latest-release` y que el tag no se movió.
  - Aceptación: S18 y AC9. No instalar en emulador ni teléfonos; no mover `v0.7.0`; no crear una segunda release.
  - Checks: `python3 scripts/test_android_release_workflow.py`, CI del commit etiquetado, run del workflow del tag, `gh release view v0.7.1`, `sha256sum` del asset descargado contra `f325edb6…`, `curl /api/app/latest-release`, `git rev-parse v0.7.1`.
  - Commit: `ci(release): derive the tag build from the internal build production serves` (workflow, tests, documentación); la publicación en sí no lleva commit.
  - Evidencia: CI del commit `3a6a1f0` en verde (`verify` y `android`; el test del workflow corrió 19 casos en CI).
    Tag anotado `v0.7.1` = objeto `bfffd74…`, commit `3a6a1f0`; `v0.7.0` sigue en `4f41400`. El workflow
    `Android release` 41747341971 leyó el build interno, adoptó ese número sobre el del tag (7001) y el APK
    empaquetado declaró `versionName 0.7.1` con la huella oficial `EE0E404B…`. Release
    <https://github.com/wilkinbarban/Trindade/releases/tag/v0.7.1> publicada (no borrador), con
    `trindade-0.7.1.apk` y su `.sha256`; el asset se reemplazó por el binario de producción para que el digest
    coincidiera (el del workflow era idéntico en versión y firma, distinto en bytes) y la descarga verificada da
    `f325edb6…`. `/api/app/latest-release` responde `v0.7.1`, `buildNumber 7012`, `apkSize 11277888`; la
    descarga pública coincide; `api` y `web` sanos; ninguna release duplicada.
  - Commit: `ci(release): derive the tag build from the internal build production serves` (workflow, tests,
    documentación) y `docs(release): record the published 0.7.1 release`; la publicación en sí no lleva commit.

## 7. Criterios de aceptación

- **AC1** Lanzar un lote de tres productos en Android produce **una** llamada a `/movimentoitem` y **una** fila `read_history` `result` 200; la tabla deja de mostrar esas filas como pendientes sin tocar nada más.
- **AC2** En Web/iPhone, cerrar el veredicto de un lote con la cola vacía produce **un** viaje `movimentos`; al volver, las filas quedan conciliadas y el feedback de movimientos se muestra una vez.
- **AC3** Si la lectura falla: el diálogo del envío conserva su veredicto, las filas siguen pendientes y el motivo se muestra (Android `noticeMessage`; web feedback de error).
- **AC4** Un pendiente que el espejo fresco ya contiene no se reenvía (`payloads`/`inFlight` en cero para esa fila).
- **AC5** El snapshot guardado contiene todos los movimientos del día (masas + insumos) y la tabla de Masas no muestra insumos.
- **AC6** Cerrar dos veces el veredicto, recargar con la marca armada o reintentar fallas no produce viajes extra (e2e de T4).
- **AC7** Cada lectura automática deja un par `read_history` con el mismo `attemptId` y la fecha en `note` (S14).
- **AC8** El APK está firmado con la clave oficial y **verificado internamente** (`aapt dump badging`: `versionName 0.7.1` y el código de build interno; `/api/app/latest-release` expone ese código para el actualizador). Ese número **no se publica** como identidad de release: ni `docs/release-android*.md` ni las notas públicas lo registran.
- **AC9** CI completa en verde (los dos jobs de `.github/workflows/ci.yml`: `verify` y `android`).
- **AC10** En un **día abierto** y desde la tablet con el build nuevo (instalación manual del operador), lanzar un lote y cerrar el veredicto deja sus filas conciliadas sin tocar «Sincronizar com ERP». Las siete filas del 03/11 no se reparan ni se tocan (Q5): quedan como evidencia.

## 8. Plan de pruebas y observabilidad

### 8.1 Por capa

| Capa | Comando | Qué prueba |
| --- | --- | --- |
| Backend | `npm --workspace=packages/backend test` | contrato del snapshot, 409 de día cerrado, contadores |
| Web (node) | `npm --workspace=packages/frontend run test:node` | librería pura de la marca |
| Web (unit) | `NODE_ENV=test npm --workspace=packages/frontend run test:unit` | conciliación post-lectura, paridad i18n, cierre compartido |
| Web e2e | `npm --workspace=packages/frontend run test:e2e` (o `npx playwright test auto-read-after-launch`) | viaje único, segundo cierre sin viaje |
| Android | `cd packages/android && ./gradlew :app:testDebugUnitTest` | lectura por lote/cola, guardas, veredicto intacto |
| Tipos | `npm run typecheck` | backend y frontend sin errores |
| Compilación | `./gradlew :app:assembleDebug` y CI | que el cambio no rompa la compilación ni los dos jobs de CI |
| Real | tablet de la planta con 7012 | `read_history` 200 y filas conciliadas |

### 8.2 Qué mirar en el log

```bash
# Lecturas del día, con su intento y el build que las pidió
jq -r 'select(.event=="read_history") | "\(.ts) \(.phase) http=\(.httpStatus) build=\(.buildNumber) attempt=\(.attemptId) note=\(.note)"' logs/aero-integration.log | tail -20

# Una lectura por lote: contar pares por attemptId
jq -r 'select(.event=="read_history" and .phase=="result") | .attemptId' logs/aero-integration.log | sort | uniq -c | tail
```

Esperado después del cambio, en un lote de tres: un `read_history` `requested`, un `result` 200, un `attemptId`, `buildNumber 7012`, y las tres filas conciliadas.

### 8.3 Prueba real (operador)

1. Instalar el 7012 en la tablet (manual).
2. Lanzar un producto con las cajas habituales y esperar el veredicto.
3. Sin tocar «Sincronizar com ERP», comprobar que la fila pasa a conciliada en la tabla unificada.
4. Revisar el log con los comandos de 8.2.

## 9. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Lectura duplicada (botón + automática) | I8/S9: una lectura en vuelo, probada en T1 |
| Reenvío que duplica una caja | S7 + Q4(a): liquidar con el espejo recién leído |
| Web: dos viajes o bucle de navegación | S10/S11: marca consumida antes de navegar, sólo con la cola vacía; e2e T4 |
| Web: perder el veredicto por navegar antes de mostrarlo | Q1(a): disparar al cerrar el diálogo |
| Android: la lectura pisa el diálogo del lote | S3 + T1 (no reutilizar `syncAeroDay` sin separar el diálogo) |
| Rollover de medianoche (lanzar 23:59, leer 00:01) | S8: la fecha se captura al empezar y la lectura sólo corre si sigue siendo hoy; un 409 se muestra y no se reintenta |
| Lectura en un día cerrado | S8/S15: backend responde 409 `MASSAS_HISTORY_FROZEN` y se muestra el motivo |
| La tablet sigue en 7008: la lectura falla igual | Se muestra el motivo (S6); el arreglo es actualizar el APK (§2.6) |
| Snapshot upsert: asientos borrados en el ERP quedan en Trindade | Fuera de alcance (§4); documentado en T6 |
| Costo: una llamada más por lote | Aceptado: una por lote, no por producto (S1) |
| iOS: dos vueltas a Safari | Documentado en T6; sin cambio en el atajo |

## 10. Rollback

- **Código:** revertir los commits de T1–T5. El cambio es aditivo: el botón «Sincronizar com ERP» y la cola siguen siendo el camino manual. No hay migración ni cambio de esquema; el snapshot es caché recuperable.
- **Web:** quitar la consumición de la marca y el `localStorage` queda con una clave huérfana que nadie lee (`trindade.aero.auto-read.v1`).
- **APK:** el archivo anterior sigue en git (`git checkout <sha> -- packages/backend/apk/trindade-0.7.1.apk`); si el 7012 ya salió, se publica 7013 (el `versionCode` es monótono y el detector compara el número). No se re-etiqueta ni se crea release: no hay ninguna.
- **Datos:** ninguno que revertir. Los asientos leídos son copia del ERP y se reescriben con la próxima lectura.

## 11. Trazabilidad

| Spec | Tarea | Verificación |
| --- | --- | --- |
| S1 | T1, T2, T3 | `readDates`/`readMovements` con una sola llamada; e2e de T4 |
| S2 | T1, T3 | `elVeredictoDelLoteSigueEnElDialogoDespuesDeLeer`; e2e |
| S3 | T1 | mismo test + revisión de que no se limpia el diálogo |
| S4 | T5 | contrato del backend `:303-333` + `unaLecturaDelDiaConciliaElLoteYNoMeteInsumos` |
| S5 | T1, T5 | fila `reconciled` después de leer |
| S6 | T2, T3 | `unFalloDeLecturaDejaElLanzamientoHechoYElMotivoVisible` |
| S7 | T2 | `laColaNoReenviaLoQueElEspejoFrescoYaTiene` |
| S8 | T2 | `noLeeSinCredencialesNiUnDiaPasado` |
| S9 | T1 | `elBotonDuranteLaLecturaAutomaticaNoDisparaOtra` |
| S10 | T3, T4 | unit + e2e |
| S11 | T3, T4 | `consumeLaMarcaUnaSolaVez`, segundo cierre |
| S12 | T3 | revisión del envelope `movimentos` |
| S13 | T1, T2 | `aeroSyncedAt` y botón intactos |
| S14 | T1, T2, T7 | log con `attemptId` y `buildNumber` |
| S15 | T2 | 409 mostrado y no reintentado |
| S16 | T7 | `/latest-release`, sha256, firma |
| S17 | T3 | paridad i18n y test de copia |
| S18 | T8 | `test_android_release_workflow.py`, workflow del tag, `gh release view` y sha256 de la descarga |

## 12. Log

- **L1 — Directiva del 2026-11-03 (verbatim):**

```text
Actúa como el agente de ingeniería de Trindade (repo /home/wilkin/proyectos/Trindade, rama main). Esta es la FASE 0 de una remediación. NO modifiques código, tests, APK, Docker, documentación existente ni hagas commits/push todavía. Tu única entrega es un artefacto ODD.

Objetivo de la fase: crear SOLO `odd/tasks/auto-conciliacion-masas-erp-post-lanzamiento.md`, siguiendo el formato de los ODD existentes. Después responde con la ruta y un resumen; no implementes nada más.

Contexto confirmado (léelo y verifícalo en el repo):
- Hoy 2026-11-03 Jaime tiene 7 lanzamientos locales (IDs 101–107) en `massa_launches`, todos con `ent_lan = null`.
- `aero_movements` tiene 0 filas para 2026-11-03.
- El log `logs/aero-integration.log` registra seis `dispatch` y un `launch_sync` contra `/entradasitem` con HTTP 200; no hay ningún `read_history` exitoso. Los `read_history` de 16:22 y 18:44 dieron HTTP 500 desde build 7008 anterior al fix del payload.
- Las apps muestran pendientes porque la tabla de Lanzamiento de Masas combina lanzamientos locales + espejo guardado; el espejo no existe.
- Android: `MassasLaunchViewModel.dispatchToErp` (lote) recarga `repository.day` pero no ejecuta `syncAeroDay`; `sendPendingLaunch` llama `refreshMirror`, pero este solo lee el espejo ya guardado en backend, no consulta `/movimentoitem`. `flushPendingQueue` tiene el mismo límite.
- Web: el callback de `entrada`/`entrada_lote` limpia la cola y muestra resultado, pero no dispara la lectura de `/movimentoitem`; solo el botón Sincronizar com ERP hace esa lectura.
- La sincronización actual ya consulta todos los usuarios (`NOMUSU:null`), todos los productos (`CODPRO:null`) y `ENTSAI:"E"`. El filtro de los **10** productos de masas es de presentación (`aeroMirrorSeats` + `massasUnifiedRows`); NO filtrar el almacenamiento del espejo a 10, porque Relatório/insumos usa el resto. *(Nota posterior, 0.7.4: este párrafo decía «8»; el catálogo siempre tuvo y tiene diez códigos —`1045, 39, 60, 84, 91, 1192, 5000, 1047, 22, 1616`— y todo código fuera de ellos es insumo.)*
- La versión 0.7.1 actual ya corrige `_method` en cuerpo/query y `ENTSAI:"E"`; publica `buildNumber` 7011 en `/latest-release`, pero no tiene lectura automática posterior al lanzamiento.

Contenido obligatorio del ODD:
1. Objetivo: hacer transparente la conciliación después de Lanzar en Android y web/iPhone.
2. Evidencia/hallazgos anterior.
3. Invariantes:
   - guardar todo el espejo ERP; filtrar solo la vista de masas;
   - no marcar conciliado por HTTP 200 del alta; solo por el espejo;
   - no duplicar envíos si el ERP ya tiene el asiento;
   - una lectura automática por lote/cola, no una por producto;
   - no romper errores, cola, outbox, permisos ni auditoría;
   - no instalar en emulador (el usuario lo hace manualmente).
4. Fases TDD con checkboxes y archivos probables:
   - Fase 1 Android: después de un lote con envíos exitosos, una lectura real de `/movimentoitem` (`syncAeroDay` o helper privado), guardar snapshot, refrescar mirror/tabla; mismo comportamiento para envío individual y vaciado de cola. Tests de ViewModel: una sola lectura por lote, reconcilia, no duplica, fallo de lectura deja pendiente y muestra razón.
   - Fase 2 web: después del callback exitoso de entrada/entrada_lote y cuando la cola de envíos haya terminado, disparar automáticamente la consulta de movimientos por el atajo, guardar snapshot y recargar; tests de callback/estado, sin bucles y sin perder cola/resultado.
   - Fase 3 contrato/verificación: pruebas de reconciliación por fecha/producto/unidades/operador; revisar `aeroMirrorSeats`/`massasUnifiedRows`; no filtrar backend; documentar que insumos quedan para Relatório.
   - Fase 4 release: build Android 0.7.1 con versionCode/buildNumber 7012, mismo versionName; copiar a `packages/backend/apk/trindade-0.7.1.apk`, actualizar `LOCAL_APK_BUILD_NUMBER` 7012 y `latest-release`; reemplazar el asset del release existente sin crear release nuevo/tag; reconstruir API/web; no instalar emulador; verificar /latest-release, descarga, sha256 y CI verde.
5. Criterios de aceptación exactos y riesgos (por ejemplo, auto-sync duplicado, web con dos viajes del atajo, fallo de lectura).
6. Plan de pruebas y observabilidad (logs `launch_sync` + `read_history`, `buildNumber`).
7. Rollback.

Reglas de trabajo:
- Sigue `AGENTS.md` y `docs/agents/trindade-development.md`.
- No inventes que algo ya está implementado.
- No agregues atribución de IA ni hagas commit/push en esta fase.
- No toques el emulador.
- Si algo es ambiguo, regístralo en el ODD y en tu respuesta, sin implementar.

Al terminar, responde únicamente con: ruta del archivo ODD, resumen de 10–20 líneas y ambigüedades. No implementes código ni abras ramas.
```

- **L2 — Verificación del estado real (2026-11-03T21:32Z):** base viva (7 lanzamientos 101–107 sin `ent_lan`, 0 filas del 03/11 en `aero_movements`), log (7 envíos 200, 4 `read_history` 500 del build 7008, 0 lecturas exitosas), código Android y Web (§2.3, §2.4), contrato del backend (§2.5), versiones (0.7.1/7011, sin release `v0.7.1`, APK dentro de la imagen de la API), red del ERP inalcanzable desde este equipo.
- **L3 — Ambigüedades registradas al verificar:** catálogo de 10 masas y no 8 (§3.3.1); «asset del release existente» sin release `v0.7.1` (§3.3.2, Q3); «una sola lectura por lote» frente a `refreshMirror` (§3.3.3); tablet en 7008 (§3.3.4); Q1–Q5 abiertas (§3.2).
- **L4 — Corrección de la Fase 0:** la directiva pide «versionCode/buildNumber 7012» y «reemplazar el asset del release existente»; como no existe release `v0.7.1`, la entrega queda definida en Q3(a) — archivo local, `LOCAL_APK_BUILD_NUMBER 7012`, reconstrucción de `api`, sin tag ni release nuevos — sujeta a aprobación.

- **L5 — Corrección y autorización de Fase 1 (2026-11-03, verbatim):**

```text
FASE 1 de implementación autorizada. Trabaja en /home/wilkin/proyectos/Trindade, rama main, sin ramas nuevas. El ODD `odd/tasks/auto-conciliacion-masas-erp-post-lanzamiento.md` es la base, pero antes de implementar corrígelo con estas verdades verificadas:

CORRECCIONES OBLIGATORIAS DEL ODD:
1. El lanzamiento 102 es producto `5000` MASSA ROLO 1KG, no 1045. Corrige la tabla y cualquier referencia.
2. El catálogo `MASSAS` tiene 10 productos, no 8 (`packages/backend/src/modules/stock/stock.catalog.ts`). No hardcodear 8 ni 10: el filtro es el catálogo del día/MASSAS, y el backend guarda todo el espejo para Relatório/Recebimento. Mantén la aclaración de la discrepancia con el pedido del usuario.
3. Los comandos son npm, no pnpm. Corrige el plan de pruebas (`npm --workspace=packages/backend test`, `npm --workspace=packages/frontend run test:node`, `NODE_ENV=test npm --workspace=packages/frontend run test:unit`, Playwright, Gradle).
4. No publiques `versionCode` ni `buildNumber` como valores en documentación pública de release. El ODD puede registrar 7011/7012 internamente; `docs/release-android*.md` y notas públicas deben decir que el código es interno. Corrige T6/AC8.
5. Q5: las 7 filas del 03/11 NO se reparan después de medianoche; el usuario confirmó que no tiene acceso ahora y acepta que queden como están. Ajusta AC10 para que hable de una prueba nueva en un día abierto, no de reparar el 03/11. No toques datos de producción ni `aero_movements` del 03/11.
6. La tablet/emulador no se instala: el usuario lo hará manualmente. No ejecutes adb install.

DECISIONES APROBADAS:
- Q1(a): en web, el segundo viaje de movimientos se dispara al cerrar el diálogo del veredicto mediante un único cierre compartido (`onClose` y botón Fechar), con marca persistida una sola vez; no navegar antes de mostrar el veredicto.
- Q2(a): en Android, un fallo de lectura automática se muestra como `noticeMessage` con `failure.describe()`, sin pisar el diálogo del lote.
- Q4(a): en cola, leer antes de liquidar/reintentar y leer otra vez solo si se envió algo; no reenviar lo que el espejo fresco ya tiene.
- Q3 pendiente de publicación: NO toques por ahora el release `v0.7.0`, no crees tag/release `v0.7.1`, y no alteres el asset de GitHub. Implementa código, tests, build 7012 y despliegue de producción/latest-release; deja el APK 7012 en `packages/backend/apk/trindade-0.7.1.apk`, actualiza `LOCAL_APK_BUILD_NUMBER=7012`, `FALLBACK_RELEASE.version`/latest-release, reconstruye API/web y verifica. Al final reporta que la publicación en GitHub queda pendiente de decisión; no la inventes.

IMPLEMENTACIÓN:
- Sigue T1–T7 del ODD, con TDD y commits atómicos en main. Corrige primero el ODD y commitéalo por separado.
- Android: extrae un camino privado de lectura que no toque el diálogo; después de `dispatchToErp` con `sent > 0` haz exactamente una lectura real `/movimentoitem`, guarda snapshot, refresca mirror y día. Haz lo mismo en `sendPendingLaunch` y al final de `flushPendingQueue`; lee antes de liquidar la cola. Respeta día cerrado, credenciales, una lectura en vuelo y no dupliques. Añade tests de ViewModel: una sola lectura por lote, veredicto intacto, fallo visible, cola no reenvía lo que el espejo fresco contiene.
- Web: implementa la marca de auto-lectura Q1(a) con librería pura y tests unitarios/e2e; al cerrar el veredicto con cola vacía y éxito dispara `movimentos`, guarda snapshot y recarga. No bucles, no reenvío de fallas, no viaje en día pasado. Mantén el atajo existente.
- Mantén el filtro de masas en la vista (catálogo del día); guarda todos los movimientos del ERP. No cambies esquema, backend de snapshot ni lógica de conciliación salvo tests.
- Actualiza strings/i18n ES/PT y el hint que hoy pide actualizar el espejo a mano. Actualiza CHANGELOG/docs internos sin publicar versionCode.
- Ejecuta tests backend/frontend/Android, typecheck, e2e afectados, y build release 7012 firmado con la receta del repo. Verifica versionName 0.7.1, versionCode 7012, firma, sha256, `latest-release` con buildNumber 7012, descarga y API/web healthy. No instales el APK.
- Publica commits y push a origin/main. Verifica CI completo; si falla, corrígelo y vuelve a esperar verde. No abras ramas ni muevas tags. Limpia solo archivos temporales propios; no borres datos ni volúmenes.
- Si una decisión no está cubierta o algo contradice el repo, detente y repórtalo en lugar de improvisar.
```

- **L6 — La contraseña de la sesión en web (2026-11-03, verbatim de la decisión):**

```text
El usuario confirma explícitamente la OPCIÓN C para la contraseña del ERP en Web/iPhone: puede persistirse en `sessionStorage` para que el atajo de vuelta y la lectura automática de `/movimentoitem` funcionen.

Condiciones de la opción C:
- Nunca `localStorage`, cookies ni servidor: solo `sessionStorage` de la pestaña.
- No registrar la contraseña en logs/auditoría/toasts.
- Limpiarla al cerrar sesión, al limpiar la configuración y al salir de la sesión de la pestaña. Mantener la migración que purga el valor legado de localStorage.
- Añadir tests que prueben: se guarda en sessionStorage, no en localStorage, se recupera en una pestaña nueva del mismo navegador/sesión, se borra al limpiar, y no aparece en el payload de settings persistido.
- Actualizar los documentos/ODD que hoy afirman «solo memoria de la pestaña» para reflejar la decisión aprobada, incluida la nota de seguridad y el alcance de sessionStorage.
```

*Hallazgo que la motivó:* el e2e del segundo viaje probó que la vuelta del atajo llega en un documento nuevo, y
con la contraseña sólo en memoria el cierre gastaba la marca y no podía leer. Queda registrado como Q6.

- **L7 — Fase de publicación autorizada (2026-11-03, verbatim):**

```text
FASE de publicación autorizada. Repo /home/wilkin/proyectos/Trindade, rama main, sin ramas nuevas. El usuario autoriza ahora crear y subir el tag `v0.7.1` y publicar la GitHub Release `v0.7.1`. No instalar nada en el emulador/teléfonos; el usuario lo hará manualmente.

Estado actual:
- main está en 4aee312; CI de main verde.
- Producción `/api/app/latest-release` ya sirve `v0.7.1`, buildNumber 7012; APK firmado `packages/backend/apk/trindade-0.7.1.apk`, sha256 f325edb6d3c03eba2f058b7aa099961fa99ba12243c6ffbec2d8e44e7683de1f, versionName 0.7.1, versionCode 7012.
- Release GitHub existente: v0.7.0 (asset 0.7.0); no existe v0.7.1.
- `.github/workflows/android-release.yml` deriva versionCode del tag: v0.7.1 -> 7001, que es menor que 7012 y sería un downgrade. NO permitas que la release final quede con 7001.

Objetivo:
1. Documenta la versión 0.7.1 y el flujo de auto-conciliación/`buildNumber`/sessionStorage en README, CHANGELOG, docs/release-android.md, docs/release-android-historial.md y docs/auditoria-android.md, sin publicar el `versionCode` como valor en notas públicas.
2. Crea un tag anotado `v0.7.1` en el commit correcto de main (no muevas ni reutilices `v0.7.0`) y súbelo a origin. El tag debe quedar publicado.
3. Maneja el workflow disparado por el tag. Preferencia: hacer que la release final contenga el APK 7012 firmado, no el 7001 derivado del tag. Si el workflow publica 7001, espera a que termine y reemplaza el asset con el APK 7012 + su `.sha256`, pero no crees una segunda release. Si puedes hacer un arreglo durable y pequeño en el workflow para que la build del tag use el build interno 7012 (por ejemplo, una variable/repositorio o metadata de build), hazlo con tests/docs y commit antes del tag; no rompas el gate de tag. No inventes otro esquema de versionado sin documentarlo.
4. La GitHub Release v0.7.1 debe quedar con título/notas de 0.7.1, asset `trindade-0.7.1.apk` y sidecar, URL funcional y hash que coincida con producción. No dejes el asset 7001 ni un asset 0.7.0 bajo la tag nueva.
5. Verifica: `gh release view v0.7.1`, descarga del asset y sha256, `/api/app/latest-release`, API/web healthy, y que el tag no se movió. Ejecuta/verifica CI y el workflow de release; si algo falla, corrígelo y espera verde. No crees ramas.
6. Limpieza de archivos/worktrees propios; no borres datos, volúmenes ni assets históricos sin autorización.
7. Reporta tag, release URL, assets, versión/build/hash, estado del workflow/CI y cualquier desviación. No digas que publicaste 7001 si fue reemplazado: deja claro qué asset quedó.

Trabaja con pausas de control de 5 minutos; no dupliques releases ni tags. Si el workflow no puede producir el 7012 sin un cambio mayor, detente y reporta antes de publicar una release incorrecta.
```

*Decisión tomada al ejecutarla:* el arreglo durable es leer `LOCAL_APK_BUILD_NUMBER` desde el commit etiquetado y
publicar `max(código del tag, build interno)`; así el asset del tag y el binario que anuncia `/latest-release`
llevan el mismo número sin una segunda fuente de verdad ni configuración fuera del repositorio.
