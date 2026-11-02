# Remediación 7006 — históricos, cargamento y selección de motoristas

Estado: **especificación a revisión**. Nada implementado, ninguna rama abierta.
Release objetivo: **7006** — Android `versionCode 7006`, `versionName 0.7.0`, mismo tag `v0.7.0` con reemplazo de asset; web y api reconstruidos.

---

## 1. Contexto

El ciclo 7005 cerró la paridad web/Android y publicó el build 7005. La operación encontró después un conjunto de defectos que comparten una misma raíz conceptual: **el histórico se comporta como un editor**. Un día pasado se puede abrir desde el histórico, agregar filas, moverlas, borrarlas y desactivar el lote; un lote desactivado desaparece de la vista del día en vez de mostrarse desactivado; los errores de selección se dibujan dentro de la grilla o del modal en vez de bloquear el paso; y el selector de motoristas ofrece conductores y chapas que el backend va a rechazar.

La remediación tiene nueve frentes verificados en código:

| Frente | Defecto | Evidencia |
| --- | --- | --- |
| A | No existe `activate`; un lote/reporte desactivado no se puede reactivar | `loading.routes.ts:37-48`, `reports.routes.ts:192-204`, `history-permissions.ts:92-96` |
| B | El resultado de desactivar se pierde y `busy` se libera antes de recargar | `LoadingHistoryViewModel.kt:239-256`, `ReportsHistoryViewModel.kt:206-223`, `load()` pisa `message` |
| C | El botón Histórico de Relatório usa otro componente que los demás módulos | `ReportGeneratorScreen.kt:103-106` vs `LoadingScreen.kt:136` |
| D | El histórico de cargamento abre el día en modo edición también en días pasados | `LoadingHistoryPage.tsx:168-187`, `LoadingEditPage.tsx:99-105`, `loading.service.ts:34-188` |
| E | La fila de acciones de la tarjeta se rompe a 390 px | `LoadingHistoryPage.tsx:168-187` |
| F | El selector ofrece conductores y chapas ya usados en el día o en la tanda | `loading-picker.ts:54-59`, `DriverPicker.tsx:187`, `DriverPickerDialog.tsx:191-195`, `LoadingViewModel.kt:323-381` |
| G | Los errores de selección van inline; en Android vuelven a la grilla | `DriverPickerDialog.tsx:211-226`, `LoadingScreen.kt:173-195` |
| H | Massas ofrece “Sincronizar con ERP” en un día cerrado y no guarda el día de la respuesta | `MassasDayHeader.kt:71-79`, `MassasLaunchViewModel.kt:175-181` |
| I | Brechas G1–G8 de la remediación anterior | `MassasHistoryPage.tsx:98-115`, `StockHistoryPage.tsx:66-80,164`, `aero-audit.ts:260-265`, `aero.log.contract.test.ts:36` |

### 1.1 Estado real verificado (no supuesto)

- **No hay endpoint de reactivación.** `grep activate` sobre `loading.routes.ts` y `reports.routes.ts` solo devuelve `deactivate`.
- **`canDeactivate` se apaga con `active === false` y no existe `canActivate`** (`packages/backend/src/modules/history-permissions.ts:89-100`). Un lote desactivado no ofrece ninguna acción de ciclo de vida.
- **`canDelete` es `Administrador || Trabalhador` sin mirar el día**: hoy cualquiera de esos roles borra físicamente un día pasado.
- **`listByDate` filtra `AND ls.is_active = 1`** (`loading.service.ts:27`): el día inactivo se lee vacío, indistinguible de un día sin cargas.
- **`create` bloquea un día cuyas filas están todas inactivas** con `scheduleAlreadyExists` (`loading.service.ts:40-56`), y la ruta lo traduce a “Já existe um cronograma para esta data no histórico” (`loading.routes.ts:112-121`), que describe otra cosa.
- **Los duplicados responden 409 con el texto en portugués como `code`** (`loading.service.ts:110-139`, `loading.routes.ts:122-126`): el cliente no tiene un identificador estable para traducir ni para señalar la fila.
- **`assertDayStillOpen` existe en massas** (`massas.service.ts:288-293`, 409 `MASSAS_HISTORY_FROZEN`) y **no tiene equivalente en loading**.
- **El sync ERP reescribe días pasados**: `saveAeroMovements` hace upsert por `(movement_date, ent_lan, product_code)` sin mirar la fecha (`aero.movements.service.ts:70-109`), mientras `massas.service.ts` congela el día.
- **El resultado tipado de ciclo de vida sí existe** (`ScheduleLifecycleResult.Changed | Refused(code) | Unreachable`, `LoadingRepository.kt:125-132`; `ReportLifecycleResult` equivalente). El hallazgo B está **parcialmente desactualizado**: lo que falla no es el tipo, sino (a) `load()` limpia el mensaje al empezar y lo reemplaza por “Sem conexão” si la recarga falla, (b) `busy = false` se publica antes de `load()`, (c) “Tentar de novo” solo hace `GET /history` (`LoadingHistoryScreen.kt:356`, `ReportsHistoryScreen.kt:317`), y (d) `history()` y `createDriver()` sí colapsan cualquier fallo a `null` (`LoadingRepository.kt:52-60,140-148`).
- **`refusalMessage` ya distingue 403 y 404** (`LoadingHistoryViewModel.kt:258-265`); faltan 401, 409 de negocio y 5xx.
- **Los tests de contrato del log ERP usan fixtures que ningún emisor produce**: `note: 'client=web · via=bridge'` en `aero.log.contract.test.ts:36,48,60,73`, y el log real tiene 92 líneas, 0 con `client=web` y 3 con `client=android`.

---

## 2. Decisiones cerradas

Las diez decisiones de la directiva, con su consecuencia técnica:

- **D1 — Día pasado = solo lectura de contenido**, en web y Android, para todos los roles, con el día de São Paulo como frontera. No se crea, no se edita, no se mueve, no se borra una fila de un día anterior a hoy.
- **D2 — El ciclo de vida no es contenido.** Un Administrador puede **desactivar y reactivar** un lote o un reporte desde el histórico. Reactivar un día pasado lo devuelve al archivo visible; **no** lo vuelve editable.
- **D3 — El día inactivo se muestra completo**, atenuado y en solo lectura; no se oculta. Al Administrador se le ofrece **Reactivar**.
- **D4 — Los errores de selección son un paso bloqueante**: una ventana de resultado, una línea por fila rechazada con su nombre. Nunca inline dentro de la grilla. En web, un solo `Dialog` a la vez: el resultado vive dentro del picker o el picker se cierra para abrir el resultado, nunca dos modales apilados.
- **D5 — Duplicados fuera de la oferta.** Se ocultan o desmarcan los conductores y las chapas ya usados en el día y en la tanda. El backend sigue siendo la última defensa; la UI no ofrece lo que va a rechazar.
- **D6 — Massas ERP conserva la fecha seleccionada.** `syncAeroDay` no cambia; el botón se oculta o deshabilita en día de solo lectura y la respuesta se descarta si el día cambió.
- **D7 — La placa de fletero se oculta** en selector, grilla y edición. No se borran datos históricos de la base.
- **D8 — Android 7006**: `versionCode 7006`, `versionName 0.7.0`, mismo tag `v0.7.0`, reemplazo de APK y sidecar en la release existente. Sin release nueva.
- **D9 — Web**: imagen de producción reconstruida y verificación visual en 390×844 y escritorio.
- **D10 — Trunk-based**: sin ramas, sin worktrees, todo a `main`, commits de hasta 400 líneas, Conventional Commits, sin `Co-Authored-By`.

### 2.1 Decisiones aprobadas

Q1–Q4 quedaron aprobadas el 2026-11-02 y son normativas:

- **Q1 = Sí.** La reactivación alcanza al lote de cargamento y al reporte. Las filas borradas con `DELETE` no se recuperan.
- **Q2 = Sí.** `includeInactive=1` es opt-in; el default de `listByDate` no cambia.
- **Q3 = Sí.** El sync ERP de un día pasado responde **409 `MASSAS_HISTORY_FROZEN`** y se audita `sync_refused`.
- **Q4 = Sí.** El borrado físico de contenido pasado está prohibido; desactivar y reactivar siguen permitidos (S23).
- Los mensajes de commit van en inglés por convención del repositorio; el documento y las notas de release, en español.

### 2.2 Decisiones abiertas — ninguna

Las cuatro preguntas que bloqueaban T1 están resueltas. No queda ninguna decisión de producto abierta para las 23 tareas.

> Q4 cambia comportamiento actual: hoy un `Trabalhador` puede borrar filas de ayer. La directiva lo prohíbe, así que la spec S22 lo fija y los tests que hoy esperan borrado en días viejos se reescriben (ver T1 y T11).

### 2.2 Conflictos detectados en la directiva o en el código

1. **D1 vs. D2 sobre “borrar”.** Resuelto por Q4: desactivar sí, borrar no.
2. **Hallazgo B desactualizado.** El resultado tipado ya existe desde 7005; la ficha T9 se limita a lo que realmente falla. Si se implementa “desde cero” un tipo nuevo, se duplica el existente.
3. **`listByDate` es compartido.** Resuelto por Q2: opt-in, default intacto.
4. **Los tests actuales fijan el comportamiento viejo.** Hay tests que borran/desactivan días pasados como si fuera correcto; T1 y T11 los reescriben, no los borran.
5. **Idioma de los commits.** Resuelto: inglés por convención del repo; documento y notas en español.
6. **Publicación.** T23 puede publicar **solo después** de que tests, hashes y tag estén verificados, y **avisa antes** de `gh release upload`.

---

## 3. No objetivos

- No se toca el esquema de base de datos ni se borran columnas (`license_plate` de fleteros se conserva; solo deja de mostrarse y de pedirse).
- No se agrega reactivación de filas individuales borradas (Q1).
- No se reabre un día pasado para edición: reactivar no equivale a desbloquear.
- No se rediseña el flujo de lote de Massas ni el contrato de `syncAeroDay`.
- No se crea una release nueva ni se mueve el tag `v0.7.0`.
- No se toca el actualizador, la firma ni el pipeline de APK más allá del `versionCode`.
- No se reescribe la auditoría ERP completa: solo se cierran G6–G8.

---

## 4. Specs

Cada spec es verificable y cita sus textos literales. Las claves de i18n se agregan en `packages/frontend/src/i18n/locales/{es,pt-BR}.json` y en `packages/android/app/src/main/res/values{,-es}/strings.xml`; el texto portugués es el operativo y el español el de la variante.

### S22 — Un día pasado es solo lectura de contenido

Para toda fecha anterior a hoy en São Paulo, y para cualquier rol, estas rutas responden **409** con `{ error, message, code: 'LOADING_HISTORY_FROZEN' }` y no escriben nada:

- `POST /loading/schedules`
- `PATCH /loading/schedules/:id`
- `DELETE /loading/schedules/:id`
- `DELETE /loading/schedules/batch/:date`

Mensaje: PT `"O carregamento de dias passados é somente leitura: não é possível criar, editar ou apagar."` / ES `"El cargamento de días pasados es solo lectura: no se puede crear, editar ni borrar."`

Hoy (São Paulo) sigue abierto. Mañana no.

### S23 — El ciclo de vida sí se permite en un día pasado

`PATCH /loading/schedules/:id/deactivate`, `PATCH /loading/schedules/batch/:date/deactivate` y `PATCH /loading/schedules/batch/:date/activate` funcionan sobre días pasados. Desactivar no edita contenido: cambia el estado del lote. La auditoría registra `deactivate`/`activate` con `scheduleDate`.

### S24 — Reactivación

- `PATCH /loading/schedules/batch/:date/activate` → `{ success: true }`, 404 si el lote no existe, 403 si no es Administrador, 409 `LOADING_HISTORY_FROZEN` **no** aplica (S23).
- `PATCH /loading/schedules/:id/activate` → igual, por fila (necesaria para el detalle; Q1 la deja fuera de la UI).
- `PATCH /reports/:id/activate` → `{ success: true }`, 404 si no existe, 403 si no es Administrador.
- Toda reactivación escribe `audit_log` con `action: 'activate'` y la entidad correspondiente.

### S25 — La proyección de permisos conoce el día

`projectHistoryPermissions` recibe la fecha de la fila (o del lote) y devuelve:

- `readOnly: true` cuando la fecha es anterior a hoy en São Paulo, **aunque** `canEdit` fuera verdadero por ventana de tiempo.
- `canEdit: false` en día pasado.
- `canDelete: false` en día pasado (Q4).
- `canDeactivate: isAdmin && active` (sin cambio).
- `canActivate: isAdmin && !active` (nuevo).

En un día de hoy, la ventana de una hora (loading) y la de hoy/ayer (reports) siguen mandando como hasta ahora.

### S26 — El día inactivo se muestra completo

`GET /loading/schedules?date=<fecha>&includeInactive=1` devuelve todas las filas del día, activas e inactivas, cada una con `is_active`. La respuesta del día agrega `dayActive: boolean` (`true` si hay al menos una fila activa). El día se dibuja atenuado, completo y sin acciones de contenido. Si `dayActive === false`, se muestra el banner de S27 y la acción **Reactivar**.

### S27 — `batchIsDeactivated`

`POST /loading/schedules` sobre un día cuyas filas están todas inactivas responde **409** con `code: 'LOADING_BATCH_DEACTIVATED'` y:

- PT: `"O lote deste dia está desativado. Reative-o no histórico para carregar de novo."`
- ES: `"El lote de este día está desactivado. Reactivalo en el histórico para volver a cargar."`

`scheduleAlreadyExists` queda reservado para el caso en que realmente exista un lote activo.

### S28 — Duplicados con código estable

Los 409 de duplicado conservan su texto y agregan código y contexto:

```json
{ "error": "Motorista já agendado neste lote de carregamento.", "message": "…", "code": "DRIVER_ALREADY_SCHEDULED", "field": "driver_id", "existing": { "time_slot": "04:00" } }
```

`VEHICLE_ALREADY_SCHEDULED` para chapa, con `field: "vehicle_id"` y `existing.time_slot`. Aditivo: los clientes viejos siguen leyendo `error`/`message`.

### S29 — Sync ERP solo en el día abierto

- `MassasDayHeader` no ofrece “Sincronizar com ERP” cuando el día es de solo lectura; si se conserva visible, queda deshabilitado con explicación.
- `MassasLaunchViewModel.refreshMirror(date)` descarta la respuesta si `state.value.date !== date` (token de día).
- El backend rechaza `syncAeroDay` sobre una fecha pasada con 409 `MASSAS_HISTORY_FROZEN` y audita `sync_refused`, o —si Q3 se resuelve al revés— registra `sync_past_day` en la auditoría. `DTINI = DTFIM = fecha seleccionada` no se toca.

### S30 — Errores de escritura tipados

Los repositorios Android distinguen tres resultados y solo usan `Unreachable` cuando **no hubo respuesta**:

- `Changed` → mensaje de éxito.
- `Refused(401)` → “Sua sessão expirou. Entre de novo.” / “Tu sesión expiró. Volvé a entrar.”
- `Refused(403)` → “Só um administrador pode fazer isso.”
- `Refused(404)` → “Esse carregamento não existe mais.”
- `Refused(409)` → el mensaje del servidor, traducido por código cuando exista.
- `Refused(5xx)` → “O servidor não conseguiu concluir. Tente de novo em instantes.”

`history()` y `createDriver()` dejan de devolver `null` para todo fallo y pasan a un resultado con el mismo vocabulario (o conservan `null` solo para `Unreachable`, documentado).

### S31 — Reactivar desde el histórico (Android)

La tarjeta de un lote/reporte inactivo ofrece **Reativar** cuando `canActivate == true`, con confirmación y mensaje de resultado. Tras reactivar, la tarjeta se redibuja activa en la misma página.

Strings: PT `"Reativar"`, `"Lote reativado."`, `"Relatório reativado."`; ES `"Reactivar"`, `"Lote reactivado."`, `"Reporte reactivado."`.

### S32 — Día inactivo en el histórico (Android)

Abrir un lote inactivo muestra el día completo, atenuado, en solo lectura, con el banner de S27 y sin “Adicionar”, editar ni borrar. El día no se oculta del histórico.

### S33 — Una acción no la pisa la recarga

Al desactivar/reactivar/borrar:

- `busy` permanece `true` hasta que termina la recarga posterior.
- Un segundo toque durante `busy` se ignora (ya existe el guard, pero hoy `busy` se libera antes).
- El mensaje de la acción no se reemplaza por el resultado de `load()`: si la recarga falla, se conserva el mensaje de la acción y se ofrece reintentar la lectura.

### S34 — “Tentar de novo” repite lo que falló

Si hubo una acción de ciclo de vida, “Tentar de novo” la repite en vez de solo recargar. Si la acción ya había aplicado y solo falló la recarga, el reintento lee el histórico y no repite la escritura (se distingue por `lastWrite`).

### S35 — Histórico de cargamento sin edición en días pasados (web)

- La tarjeta no enlaza a `/loading/edit?date=` cuando el día es pasado.
- No se dibuja “Editar” ni acciones de contenido.
- `LoadingEditPage` muestra un banner de solo lectura y no abre el formulario.
- `?edit=<id>` sobre un día pasado se ignora: no se entra en edición.
- Añadir, borrar y mover quedan ocultos o deshabilitados.

Texto del banner: PT `"Dia encerrado: somente leitura."` / ES `"Día cerrado: solo lectura."`

### S36 — Tarjeta de cargamento en móvil

La cabecera usa `flex-col sm:flex-row`; el grupo de acciones es `shrink-0 justify-end gap-1 sm:gap-2`; “Editar” es un `Link` con `buttonVariants` y `max-sm:min-h-12`; los iconos son 48×48 con `rounded-lg`. No hay `<button>` dentro de `<a>`. A 390×844 la fecha y el conteo ocupan el ancho completo y las acciones quedan en una fila propia, alineadas a la derecha.

### S37 — `historyAffordances` refleja el servidor

La función web consume `readOnly`, `isClosedDay`, `canActivate`, `canDeactivate`, `canDelete` del servidor y no re-deriva reglas propias. Un día pasado no ofrece edición ni borrado; un día inactivo ofrece Reactivar al Administrador.

### S38 — Chapas libres reales

`freeVehicles` resta las chapas del día **y** las ya elegidas en la tanda; la chapa elegida por la propia fila se conserva al recalcular. Ninguna fila puede elegir una chapa ya tomada por otra fila de la misma tanda.

### S39 — Conductor ocupado explicado

Un conductor ya agendado en el día no se ofrece para agregar; se lista con “ya está en HH:MM” en vez de desaparecer sin explicación. Texto: PT `"{{name}} já está nas {{time}}."` / ES `"{{name}} ya está en las {{time}}."`

### S40 — Tres estados distintos

- **Flota vacía**: no hay vehículos configurados → “No hay vehículos en la planta.”
- **Sin chapas libres**: hay flota, todas tomadas → PT `"Todas as chapas já estão em uso neste dia."` / ES `"Todas las chapas ya están en uso en este día."`
- **Error de lectura**: no se pudo leer la flota → error con reintento.

Ninguno de los tres se muestra como “sin conexión” ni como “no hay vehículos”.

### S41 — El día se relee antes de ofrecer el selector

Al abrir el selector se relee el día. Si la lectura falla, no se ofrece “Agregar” y se muestra PT `"Não foi possível ler o dia. Tente de novo antes de adicionar."` / ES `"No se pudo leer el día. Reintentá antes de agregar."`

### S42 — La tanda no envía duplicados

`accept()` rechaza antes de enviar cuando dos filas comparten chapa; `onlyRefused` conserva la chapa de la fila rechazada y el reintento no repite el 409. Si el servidor rechaza una fila, las demás no se pierden.

### S43 — Android: chapas y duplicados

`PlatePicker` recibe solo chapas libres del día y de la tanda; el KDoc que afirma que una chapa puede repetirse se corrige; `confirmAdd` deduplica por `vehicleId`; el 409 se muestra con nombre y motivo.

### S44 — Resultado en ventana (web)

Los rechazos de una tanda se muestran en un paso de resultado **dentro** del `DriverPickerDialog`, con una línea por fila (nombre + motivo) y las acciones “Reintentar” y “Cerrar”. No se apilan modales. El estado `error` muerto de `DriverPicker.tsx:61` se elimina.

### S45 — Resultado en ventana (Android)

El resultado de una tanda se muestra en `ActionResultDialog` (o `AdminResultDialog`), no en la grilla. Un fallo parcial conserva el mensaje y lista las filas rechazadas. Un 409 nombra al conductor o la chapa y su horario.

### S46 — Sin respuestas fuera de orden

`MassasHistoryPage` y `StockHistoryPage` usan `AbortController` o token de petición; una respuesta vieja no pinta otro día; el `catch` limpia `dayView`/`day` y muestra el error.

### S47 — Contagem no ofrece hoy

Los chips de día de `StockHistoryPage` se limitan a `<= ayer`, igual que Massas. Hoy se alcanza por el flujo en curso, no por el histórico.

### S48 — Placa de fletero fuera de la grilla y la edición

La grilla y la edición no muestran `license_plate` de un fletero. El dato sigue en la base y en la respuesta; solo deja de dibujarse.

### S49 — Toda acción ERP web emite el par completo

`requested` y `result` de `read_history` y `launch_sync` incluyen `client: 'web'`, `attemptId` correlativo y `durationMs > 0`. `postAeroAuditEvent` deja de devolver un booleano ignorado: el fallo se registra en consola con el código y el evento.

### S50 — El contrato del log usa cuerpos reales

`aero.log.contract.test.ts` construye los cuerpos con los emisores reales (`aeroTestRequestedEvent`, `probeToAuditEvent`, `aeroImportAuditEvent`), no con fixtures inventados; valida `client`, `attemptId` y `durationMs`.

### S51 — Build 7006

`versionCode 7006`, `versionName 0.7.0`, firmado con la clave oficial, APK `trindade-0.7.0.apk` + `trindade-0.7.0.apk.sha256`, tag `v0.7.0` sin mover, asset reemplazado en la release existente, copias en `packages/backend/apk`, Desktop y producción. `aapt2 dump badging`, `apksigner verify` y `sha256sum -c` en verde; instalado y recorrido en `emulator-5554`.

### S52 — Botón Histórico de Relatório homogéneo

`ReportGeneratorScreen` usa `ModuleHistoryButton` (píldora de 36 dp con `ic_history`), igual que Cargamento, Massas y Stock.

### S53 — La cola Android no reintenta un día cerrado

Cuando el backend responde **409 `MASSAS_HISTORY_FROZEN`** al guardar el snapshot de un día pasado:

- `syncDay` devuelve `AeroSyncOutcome.Failed(AeroFailure(AeroFailureCode.BACKEND_DAY_CLOSED))`, con `retryable = false`.
- El ítem de la cola que pertenece a ese día se **descarta** con `settle(launchIds)` y se registra una línea `aero_queue_rejected` con fecha, `launchIds` y `code: MASSAS_HISTORY_FROZEN`.
- Ni la apertura del día ni el reintento manual vuelven a mandarlo: no hay reintento infinito.
- El operario ve una línea que nombra el día cerrado, no “sem conexão”.

Texto: PT `"O dia {{date}} está encerrado: o espelho do ERP não pode mais ser atualizado."` / ES `"El día {{date}} está cerrado: el espejo del ERP ya no se puede actualizar."`

### S54 — Android: el conductor ya asignado se explica con su horario

El selector de Cargamento (Android) no borra de la lista a un conductor ya agendado en el día: lo dibuja deshabilitado con el horario donde está, PT `"{{name}} já está nas {{time}}."` / ES `"{{name}} ya está en las {{time}}."` Un candidato ocupado nunca desaparece en silencio; uno libre se puede marcar. Si el backend rechaza con `DRIVER_ALREADY_SCHEDULED`, la fila del resultado nombra al conductor y el horario existente.

---

## 5. Tareas

Cada tarea declara objetivo, archivos, tests exactos, aceptación, commit esperado y dependencias. Todas las tareas escriben tests primero (RED observable) y cierran con la suite focalizada y `tsc`/`gradle` según corresponda.

### Fase 1 — Backend

#### T1 — Política de día cerrado en loading
- **Specs**: S22, S23, S25 (parte backend), S26, S27.
- **Objetivo**: un día pasado no se escribe; el día inactivo se puede leer completo; el alta sobre un lote desactivado tiene su propio código.
- **Archivos**: `packages/backend/src/modules/loading/loading.service.ts`, `packages/backend/src/modules/loading/loading.routes.ts`, `packages/backend/src/modules/loading/loading.schema.ts`, `packages/backend/src/modules/loading/loading-test-helper.ts`, `packages/backend/src/contracts/openapi.ts`, `packages/backend/src/contracts/route-coverage.test.ts`.
- **Trabajo**:
  1. `assertLoadingDayStillOpen(date)` en `loading.service.ts`, con `getSaoPauloDateString()` y `code: 'HISTORY_FROZEN'`; llamada al inicio de `create`, `update`, `move` (si existe), `remove`, `removeBatch`.
  2. `listByDate(date, actor, { includeInactive })`; por defecto conserva `is_active = 1`; con `includeInactive` devuelve todas y agrega `dayActive`.
  3. `create` distingue `LOADING_BATCH_DEACTIVATED` de `scheduleAlreadyExists`.
  4. Rutas: 409 `LOADING_HISTORY_FROZEN` / `LOADING_BATCH_DEACTIVATED` con `apiError`-style `{ error, message, code }`; `includeInactive` en el querystring con validación booleana.
- **Tests**:
  - `loading.service.test.ts`: `rejects a create on yesterday with HISTORY_FROZEN`; `rejects update and remove of a parada from yesterday`; `keeps an inactive batch readable with includeInactive`; `answers LOADING_BATCH_DEACTIVATED instead of scheduleAlreadyExists`.
  - `loading.routes.mutations.test.ts`: `answers 409 LOADING_HISTORY_FROZEN when a Trabalhador edits yesterday`; `answers 409 LOADING_HISTORY_FROZEN when an Administrador deletes yesterday`; `accepts today`.
  - `loading.routes.schedules.test.ts`: `returns inactive rows and dayActive=false with includeInactive=1`; `keeps the default read without inactive rows`.
  - `route-coverage.test.ts`: las rutas siguen cubiertas.
- **Aceptación**: los seis casos en verde; una fila de ayer no cambia en base tras `POST`/`PATCH`/`DELETE`; hoy sigue funcionando; `GET` sin `includeInactive` devuelve exactamente lo de antes.
- **Commit**: `feat(backend): freeze past loading days and read inactive batches whole` (~220 líneas).
- **Depende de**: Q2 y Q4 aprobadas.
- **Estado.** Hecho, en dos commits de 363 y 399 líneas cambiadas.
  - **fe4a921** — `feat(loading): freeze past loading days and read a closed day whole`. Código de
    `loading.service.ts`/`loading.routes.ts`/`loading.schema.ts`/`openapi.ts`: `closedDayRefusal`
    (409 `LOADING_HISTORY_FROZEN`) en `create`/`update`/`remove`/`removeBatch`, rechazo de mover a un día
    pasado, `listByDate` + `readDay` con `includeInactive` y `dayActive`, y
    `LOADING_BATCH_DEACTIVATED` (409) para el alta sobre un lote desactivado. Tests nuevos del ciclo de vida
    en `loading.service.test.ts` y del mensaje bilingüe en `loading.routes.validation.test.ts`.
  - **46cd532** — `test(loading): date the route suites from the operators' today`. Las suites de rutas,
    export y contrato usaban fechas fijas de 2026, ya cerradas: cada fixture de escritura calcula su propio
    día y el export deriva de él el texto del día de la semana que espera. 683 tests de backend en verde.

#### T2 — Endpoints de reactivación
- **Specs**: S24, S31 (contrato), S25.
- **Archivos**: `loading.service.ts`, `loading.routes.ts`, `packages/backend/src/modules/reports/reports.routes.ts`, `packages/backend/src/modules/reports/reports.service.ts` (o el servicio de ciclo de vida que use), `contracts/openapi.ts`, `contracts/route-coverage.test.ts`.
- **Trabajo**: `activateBatch(db, date)`, `activate(db, id)` (Q1: sin UI), `activateReport(db, id)`; rutas `PATCH /schedules/batch/:date/activate`, `PATCH /schedules/:id/activate`, `PATCH /reports/:id/activate`; Administrador obligatorio; `auditLog` con `action: 'activate'`.
- **Tests**:
  - `loading.routes.mutations.test.ts`: `reactivates a deactivated batch as Administrador and audits it`; `answers 403 for a Trabalhador`; `answers 404 for an unknown date`.
  - `reports.routes.test.ts`: `reactivates a report and audits it`; `answers 403 for a Trabalhador`.
  - `loading.service.test.ts`: `activateBatch returns false when the date has no rows`.
- **Aceptación**: ciclo desactivar → reactivar → el lote vuelve a `is_active = 1`; dos reactivaciones seguidas no fallan; la auditoría tiene una línea por acción.
- **Commit**: `feat(backend): let an administrator reactivate a batch or a report` (~170 líneas).
- **Depende de**: T1.
- **Estado.** Hecho en un commit (**b2fa299**), 264 líneas insertadas. `activate`/`activateBatch` en
  `loading.service.ts`, `activateReport` en `reports.lifecycle.service.ts`, las tres rutas con rol
  Administrador y su `audit_log` (`action: 'activate'`, `scheduleDate` en el lote), y las tres operaciones
  nuevas del contrato con su entrada en `EXPECTED_PATHS`. Los tests fijan la idempotencia (dos
  reactivaciones seguidas, 200 las dos), el 403 del Trabalhador sin tocar la fila, el 404 de fecha o fila
  inexistente, el 400 de id inválido, la reactivación de un día pasado y una línea de auditoría por acción.
  691 tests de backend en verde.

#### T3 — Proyección de permisos con la fecha
- **Specs**: S25, S37.
- **Archivos**: `packages/backend/src/modules/history-permissions.ts`, `packages/backend/src/modules/history-permissions.test.ts`, call sites en `loading.service.ts` y `reports.service.ts`, `contracts/openapi.ts`.
- **Trabajo**: `projectHistoryPermissions(actor, row, window, now)` recibe la fecha del día y agrega `isClosedDay`, `canActivate`; `readOnly` y `canDelete` respetan S25; `projectScheduleRow` y la proyección de reportes pasan la fecha.
- **Tests**: en `history-permissions.test.ts`: `marks a past day readOnly even inside the one-hour window`; `forbids deleting a past row for an Administrador`; `offers activate only to an Administrador on an inactive row`; `keeps today editable within the window`.
- **Aceptación**: ninguna proyección de día pasado devuelve `canEdit`/`canDelete` verdaderos; hoy no cambia; los contratos publicados reflejan los campos nuevos (aditivos).
- **Commit**: `feat(backend): project closed days as read only with an activate offer` (~140 líneas).
- **Depende de**: T1 (para la fecha).
- **Estado.** Hecho en un commit (**868a10d**), 91 líneas insertadas. `OwnableHistoryRow.day_date` optativo:
  sin fecha la proyección no cambia, así que los reportes conservan su ventana. Con fecha, `isClosedDay`
  manda sobre el reloj (`readOnly`, `canEdit` y `canDelete` en falso) y `canActivate` aparece para el
  Administrador sobre una fila inactiva. Los tres call sites de loading pasan `schedule_date`/`batch_date`;
  `loading.schema.ts` y `reports.schema.ts` publican los campos nuevos como aditivos. 695 tests en verde.

#### T4 — Códigos estables de duplicado
- **Specs**: S28.
- **Archivos**: `loading.service.ts`, `loading.routes.ts`, `contracts/openapi.ts`.
- **Trabajo**: `DRIVER_ALREADY_SCHEDULED` / `VEHICLE_ALREADY_SCHEDULED` con `field` y `existing.time_slot`; conservar `error`/`message` en PT/ES.
- **Tests**: `loading.routes.schedules.test.ts`: `answers DRIVER_ALREADY_SCHEDULED with the slot of the existing row`; `answers VEHICLE_ALREADY_SCHEDULED with the slot of the existing row`; `keeps the human message in Portuguese and Spanish`.
- **Aceptación**: los tres casos verdes; un cliente que solo lee `error` sigue funcionando.
- **Commit**: `feat(backend): name duplicate refusals with a stable code and slot` (~90 líneas).
- **Depende de**: ninguna (paralelizable con T1).
- **Estado.** Hecho en un commit (**1fc74c5**), 129 líneas. Los cuatro rechazos de duplicado (alta y
  edición, motorista y vehículo) llevan `code`, `field` y `existing.time_slot`; `LoadingRefusal` los expone
  solo cuando existen, para que una comparación estructural del rechazo no vea claves de más. El mensaje
  humano se conserva y se traduce en el alta (PT/ES). `ErrorEnvelopeSchema` documenta los dos campos
  aditivos y el 409 del contrato los nombra. 698 tests en verde.

#### T5 — Sync ERP sin días pasados
- **Specs**: S29 (backend).
- **Archivos**: `packages/backend/src/modules/integration/aero.movements.service.ts`, `packages/backend/src/modules/integration/aero.movements.routes.ts`, `packages/android/app/src/main/java/com/trindade/app/aero/AeroAdapters.kt`, `packages/android/app/src/main/java/com/trindade/app/aero/AeroDispatcher.kt`, `packages/android/app/src/main/java/com/trindade/app/aero/AeroFailure.kt`, `packages/frontend/src/pages/massas/MassasLaunchPage.tsx` solo si la ruta vive ahí.
- **Trabajo**: guarda `HISTORY_FROZEN` → 409 `MASSAS_HISTORY_FROZEN` para `movement_date < hoy`; auditoría `sync_refused` con la fecha; no se toca `DTINI/DTFIM`. En Android, `saveMovements` deja de devolver `null` para todo fallo y devuelve el status y el código del backend, para que T20 pueda distinguir el día cerrado (S53).
- **Tests**: `aero.movements.service.test.ts`: `refuses a past movement date`; `still writes today`; `aero.movements.routes.test.ts`: `answers 409 MASSAS_HISTORY_FROZEN for a past date`; `AeroAdaptersTest`: `keeps the status and code of a refused snapshot`; `aero.log.contract.test.ts` sigue verde.
- **Aceptación**: un día pasado no cambia en `aero_movements`; hoy se sincroniza igual que antes; el cliente Android recibe `409` + `MASSAS_HISTORY_FROZEN` y no un `null` indistinguible.
- **Commit**: `fix(backend): refuse an ERP snapshot for a closed massas day` (~100 líneas).
- **Depende de**: Q3.
- **Estado.** Backend hecho (**b9e5a58**, 204 líneas): el rechazo vive en el servicio, la ruta lo audita con
  `sync_refused` y el 409 quedó documentado. El puerto Android ya devuelve `AeroSnapshotSave` con
  `Saved`/`Refused(status, code)`/`Unreachable` y `AeroFailure` lleva `serverStatus`/`serverCode`; RED observado en
  `AeroAdaptersTest` (2 de 3 fallando) y GREEN en curso.

#### T6 — Auditoría ERP web real
- **Specs**: S49.
- **Archivos**: `packages/frontend/src/lib/aero-audit.ts`, `packages/frontend/src/pages/massas/AeroIntegrationPanel.tsx`, `packages/frontend/src/pages/MassasLaunchPage.tsx`, `packages/frontend/src/lib/aero-audit.test.ts`, `packages/frontend/src/pages/massas/aero-bridge-wiring.test.ts`.
- **Trabajo**: `postAeroAuditEvent` devuelve un resultado con el error en vez de `false` silencioso; `MassasLaunchPage` emite `read_history`/`launch_sync` con `client: 'web'` y `attemptId`; `durationMs` sale del `startedAt`; los `void` pasan a `.catch` que registra.
- **Tests**: `aero-audit.test.ts`: `reports a failed audit post with its status`; `derives durationMs from startedAt`; `aero-bridge-wiring.test.ts`: `the launch page emits both members of the pair with one attemptId`.
- **Aceptación**: tras un ciclo, `logs/aero-integration.log` tiene líneas `client=web` con pares correlacionados.
- **Commit**: `fix(web): make every ERP audit event reach the log with its pair` (~180 líneas).
- **Depende de**: ninguna.
- **Estado.** Hecho: `postAeroAuditEvent` devuelve `{ ok, status, code }` y escribe el fallo en consola con el
  evento; el intento del puente se persiste en `aero-pending-attempt.ts` antes de salir y el `result` lo lee de
  vuelta, así `read_history` y `launch_sync` comparten `attemptId`, `client: 'web'` y `durationMs`. Tests: 532
  node en verde, `aero-pending-attempt.test.ts` y el caso de par en `aero-bridge-wiring.test.ts`.

### Fase 2 — Android históricos

#### T7 — Reactivar en el histórico
- **Specs**: S31, S24.
- **Archivos**: `packages/android/app/src/main/java/com/trindade/app/loading/LoadingHistoryViewModel.kt`, `.../loading/LoadingHistoryScreen.kt`, `.../loading/LoadingRepository.kt`, `.../reports/ReportsHistoryViewModel.kt`, `.../reports/ReportsHistoryScreen.kt`, `.../reports/ReportsRepository.kt`, `.../network/LoadingApi.kt`, `.../network/ReportsApi.kt`, `.../ui/components/HistoryCardActions.kt`, `res/drawable/ic_activate.xml`, `res/values/strings.xml`, `res/values-es/strings.xml`.
- **Trabajo**: `offersActivate`, `activateBatch`/`activate` en VM y repo, `ActionResultDialog` de confirmación, icono `ic_activate`, strings; muestra “Reativar” solo con `canActivate == true`.
- **Tests**:
  - `LoadingHistoryViewModelTest.kt`: `activates the batch the server offered`; `does not offer activate on an active batch`; `keeps the message of a successful activation`.
  - `ReportsHistoryViewModelTest.kt`: equivalente para reporte.
  - `LoadingHistoryRepositoryTest.kt`: `posts the activate route for a date`.
  - `LoadingHistoryScreenTest.kt` / `ReportsHistoryScreenTest.kt`: `draws the reactivate action only when the flag is true`.
- **Aceptación**: un lote desactivado se reactiva desde la tarjeta; el caso `canActivate=false` no dibuja nada.
- **Commit**: `feat(android): reactivate a deactivated batch from the history` (~300 líneas).
- **Depende de**: T2.

#### T8 — Día inactivo completo y en solo lectura
- **Specs**: S32, S26, S27.
- **Archivos**: `LoadingScreen.kt`, `LoadingViewModel.kt`, `LoadingEditViewModel.kt`, `LoadingRepository.kt`, `network/LoadingApi.kt`, strings.
- **Trabajo**: abrir el día con `includeInactive=1` cuando el lote está inactivo o el día es pasado; banner; ocultar añadir/editar/borrar/desactivar; mensaje `batchIsDeactivated` al intentar crear.
- **Tests**: `LoadingViewModelTest.kt`: `opens an inactive day with its rows and dayActive=false`; `does not offer adding to a closed day`; `surfaces LOADING_BATCH_DEACTIVATED instead of scheduleAlreadyExists`; `LoadingScreenTest.kt`: `draws the read-only banner and no add action`.
- **Aceptación**: un lote inactivo se ve completo y atenuado; no hay acciones de contenido; el alta explica que hay que reactivar.
- **Commit**: `feat(android): show a deactivated day whole and read only` (~280 líneas).
- **Depende de**: T1, T7.

#### T9 — Errores tipados y mensaje que sobrevive
- **Specs**: S30, S33, S34.
- **Archivos**: `LoadingHistoryViewModel.kt`, `ReportsHistoryViewModel.kt`, `LoadingRepository.kt`, `ReportsRepository.kt`, strings.
- **Trabajo**: resultados con código; `refusalMessage` cubre 401/409/5xx; `busy` hasta terminar; `load()` no pisa el mensaje de la acción; `lastWrite` para que el reintento no repita una escritura aplicada; “Tentar de novo” repite la acción cuando corresponde.
- **Tests**: `LoadingHistoryViewModelTest.kt`: `keeps the success message when the reload fails`; `keeps busy until the reload ends`; `does not repeat an applied write on retry`; `names an expired session instead of a network fault`; `ReportsHistoryViewModelTest.kt`: equivalentes; `LoadingHistoryRepositoryTest.kt`: `returns Unreachable only when the call throws`.
- **Aceptación**: un 401 y un 500 no dicen “Sem conexão”; el mensaje de éxito no desaparece; el doble toque no dispara dos PATCH.
- **Commit**: `fix(android): keep the lifecycle result and name the refusal` (~250 líneas).
- **Depende de**: T7.

#### T10 — Botón Histórico de Relatório
- **Specs**: S52.
- **Archivos**: `packages/android/app/src/main/java/com/trindade/app/reports/ReportGeneratorScreen.kt`, `testDebug/.../reports/ReportGeneratorScreenTest.kt`.
- **Trabajo**: `NavigationActionButton` → `ModuleHistoryButton`; sin tocar el resto del header.
- **Tests**: `ReportGeneratorScreenTest.kt`: `draws the shared history pill in the header`.
- **Aceptación**: la píldora mide 36 dp con `ic_history` y coincide con Cargamento/Massas/Stock.
- **Commit**: `fix(android): use the shared history button on the report form` (~40 líneas).
- **Depende de**: ninguna.

#### T11 — Día pasado en solo lectura (Android)
- **Specs**: S22, S32.
- **Archivos**: `LoadingScreen.kt`, `LoadingViewModel.kt`, `LoadingEditViewModel.kt`, `LoadingEditScreen.kt`, `MainActivity.kt`, `LoadingScreenTest.kt`, `LoadingEditScreenTest.kt`, `LoadingViewModelTest.kt`.
- **Trabajo**: el histórico abre el día pasado con `readOnly`; la grilla no dibuja añadir/editar/borrar; la edición profunda no abre; `MainActivity` no navega a edición.
- **Tests**: `LoadingScreenTest.kt`: `hides every content action on a past day`; `LoadingViewModelTest.kt`: `refuses to create on a past day without calling the API`; `LoadingEditScreenTest.kt`: `shows the read-only banner for a past day`.
- **Aceptación**: abrir ayer desde el histórico no permite escribir; el servidor tampoco (T1).
- **Commit**: `feat(android): open a past loading day in read only` (~200 líneas).
- **Depende de**: T1, T3.

### Fase 3 — Web cargamento

#### T12 — Histórico sin edición en días pasados
- **Specs**: S35, S37.
- **Archivos**: `packages/frontend/src/pages/LoadingHistoryPage.tsx`, `packages/frontend/src/pages/LoadingEditPage.tsx`, `packages/frontend/src/lib/history-permissions.ts`, `packages/frontend/src/lib/history-permissions.test.ts`, `LoadingHistoryPage.test.tsx`, `LoadingEditPage.test.tsx`, locales.
- **Trabajo**: tarjeta sin `Link` en día pasado; sin “Editar”; banner; `?edit=` bloqueado; acciones de contenido ocultas; `historyAffordances` lee el servidor.
- **Tests**: `LoadingHistoryPage.test.tsx`: `does not link a past day to the editor`; `offers reactivate on an inactive day`; `LoadingEditPage.test.tsx`: `shows the read-only banner and drops the form on a past day`; `ignores edit=<id> on a past day`; `history-permissions.test.ts`: `a closed day is not editable nor deletable`.
- **Aceptación**: desde el histórico de ayer no se llega al editor; el deep-link no abre el formulario; hoy no cambia.
- **Commit**: `feat(web): stop opening a past loading day in the editor` (~200 líneas).
- **Depende de**: T1, T3.

#### T13 — Acciones de la tarjeta en móvil
- **Specs**: S36.
- **Archivos**: `packages/frontend/src/pages/LoadingHistoryPage.tsx`, `LoadingHistoryPage.test.tsx`, `packages/frontend/src/__e2e__/loading-history.spec.ts`.
- **Trabajo**: `flex-col sm:flex-row`, acciones con `shrink-0`, “Editar” como `Link` con `buttonVariants`, iconos 48×48.
- **Tests**: `loading-history.spec.ts`: `keeps the date and the actions on separate rows at 390x844`; `does not nest the edit button inside the link`.
- **Aceptación**: a 390 px no hay solapamiento ni texto de 128 px; a 1280 px la fila sigue en una línea.
- **Commit**: `fix(web): align the loading history actions on a phone` (~90 líneas).
- **Depende de**: T12.

#### T14 — Respuestas fuera de orden y chips de Contagem
- **Specs**: S46, S47.
- **Archivos**: `packages/frontend/src/pages/MassasHistoryPage.tsx`, `packages/frontend/src/pages/StockHistoryPage.tsx`, `MassasHistoryPage.test.tsx`, `StockHistoryPage.test.tsx`, `__e2e__/stock-history.spec.ts`, `__e2e__/massas-history.spec.ts`.
- **Trabajo**: token/`AbortController` en ambas páginas; `catch` limpia la vista; chips filtrados `<= ayer`.
- **Tests**: `MassasHistoryPage.test.tsx`: `drops a stale answer that arrives after a newer one`; `StockHistoryPage.test.tsx`: `does not offer today in the day chips`; `clears the day view when the read fails`; `stock-history.spec.ts`: `the chip list stops at yesterday`.
- **Aceptación**: cambiar de día rápido nunca pinta el día anterior; hoy no aparece en los chips.
- **Commit**: `fix(web): drop stale history answers and hide today from the chips` (~150 líneas).
- **Depende de**: ninguna.
- **Estado.** Hecho: ambas páginas guardan el token de la última lectura y descartan la respuesta vieja; el
  `catch` limpia `dayView`/`day`; los chips de Contagem se cortan en ayer. Tests: `MassasHistoryPage`,
  `StockHistoryPage` (12 en verde, RED verificado con las páginas revertidas) y `stock-history.spec.ts` (2/2).

### Fase 4 — Selección

#### T15 — Chapas libres, conductores ocupados y tanda sin duplicados
- **Specs**: S38, S39, S40, S42.
- **Archivos**: `packages/frontend/src/lib/loading-picker.ts`, `packages/frontend/src/lib/loading-picker.test.ts`, `packages/frontend/src/components/loading/DriverPicker.tsx`, `DriverPickerDialog.tsx`, `DriverPicker.test.tsx`, `DriverPickerDialog.test.tsx`, locales.
- **Trabajo**: `pickedVehicleIds`, `freeVehicles` con tanda, `assignedDriverIds` con horario, mensajes de S39/S40, `accept()` valida chapa repetida, `onlyRefused` conserva la chapa propia.
- **Tests**: `loading-picker.test.ts`: `freeVehicles excludes the plate picked in this batch`; `freeVehicles keeps the plate of the row itself`; `accept refuses two rows with the same plate`; `onlyRefused keeps the plate of the refused row`; `DriverPickerDialog.test.tsx`: `names the slot where a driver already is`; `distinguishes an empty fleet from a day with no free plates`.
- **Aceptación**: no se puede elegir dos veces la misma chapa; el rechazo nombra el horario; los tres estados de S40 son distinguibles.
- **Commit**: `fix(web): give the driver picker the day it is about` (`be0d1a9`), junto con T16 (~356 líneas).
- **Depende de**: T4 (códigos), T12.
- **Estado.** Hecho: `freeVehicles` resta la tanda y conserva la chapa propia; `rowsWithRepeatedPlate` corta el
  envío duplicado; los ocupados se listan con su horario; flota vacía, sin chapas libres y error de lectura son
  tres estados distintos. Tests: `loading-picker` (537 node en verde), `DriverPicker`, `DriverPickerDialog`,
  `ScheduleGrid` (107 vitest) y `loading-schedule.spec.ts` (12/12).

#### T16 — Releer el día al abrir el selector
- **Specs**: S41.
- **Archivos**: `packages/frontend/src/components/loading/DriverPicker.tsx`, `LoadingSchedulePage.tsx` (o el padre que abre el picker), `DriverPicker.test.tsx`, `LoadingSchedulePage.test.tsx`.
- **Trabajo**: lectura fresca del día antes de habilitar el picker; estado de error con reintento; sin “Agregar” si la lectura falla.
- **Tests**: `DriverPicker.test.tsx`: `reads the day again before offering drivers`; `does not offer adding when the day read failed`; `LoadingSchedulePage.test.tsx`: `the add action waits for the fresh day`.
- **Aceptación**: un compañero que agregó una fila mientras el modal estaba cerrado aparece como ocupado.
- **Commit**: `fix(web): give the driver picker the day it is about` (`be0d1a9`), junto con T15 (~356 líneas).
- **Depende de**: T15.
- **Estado.** Hecho: `openPicker` relee el día y sólo abre con lectura buena; si falla, `picker-read-error` con
  el texto de S41 y el picker no se abre. `fetchData` devuelve el resultado de la lectura.

#### T17 — Android: chapas libres y deduplicación
- **Specs**: S43, S38, S54.
- **Archivos**: `packages/android/app/src/main/java/com/trindade/app/loading/LoadingViewModel.kt`, `LoadingScreen.kt`, `LoadingViewModelTest.kt`, `LoadingScreenTest.kt`.
- **Trabajo**: `assignedVehicleIds` + `pickedVehicleIds`, `PlatePicker` con libres, KDoc corregido, `confirmAdd` dedupe, 409 con nombre y horario. **G4**: `availableDrivers` deja de borrar al ocupado; el selector lo lista con `assignedSlot` y deshabilitado (S54).
- **Tests**: `LoadingViewModelTest.kt`: `offers only free plates to the picker`; `does not send two rows with the same vehicle`; `lists an already scheduled driver with the slot where he is`; `does not pick an occupied driver`; `LoadingScreenTest.kt`: `the plate picker lists a taken plate as unavailable`; `the driver row explains the slot of an occupied driver`.
- **Aceptación**: la UI no ofrece una chapa que el backend va a rechazar.
- **Commit**: `fix(android): keep taken plates out of the driver picker` (~220 líneas).
- **Depende de**: T4.

### Fase 5 — Errores en ventana

#### T18 — Paso de resultado en el picker (web)
- **Specs**: S44.
- **Archivos**: `packages/frontend/src/components/loading/DriverPickerDialog.tsx`, `DriverPicker.tsx`, `DriverPickerDialog.test.tsx`, `DriverPicker.test.tsx`, `packages/frontend/src/__e2e__/loading-schedule.spec.ts`.
- **Trabajo**: estado `outcome` con filas rechazadas; un solo `Dialog`; acciones Reintentar/Cerrar; eliminar el `error` muerto.
- **Tests**: `DriverPickerDialog.test.tsx`: `lists every refused row with its name and reason`; `never renders two dialogs at once`; `loading-schedule.spec.ts`: `a refused batch opens the result step inside the picker`.
- **Aceptación**: una tanda con dos rechazos muestra dos líneas y un solo modal.
- **Commit**: `feat(web): show batch refusals in one result step` (~220 líneas).
- **Depende de**: T15, T16.
- **Estado.** Hecho: el paso de resultado vive dentro del `DriverPickerDialog` (una línea por fila rechazada) y
  el pie pasa a Reintentar + Cerrar mientras queden filas; el estado `error` muerto se eliminó junto con su
  prop y su bloque. Tests: `DriverPickerDialog` (`lists every refused row with its name and reason, in one
  dialog`, `offers the retry and the close, and no second accept, while rows are owed`) y
  `loading-schedule.spec.ts` (`4.2 reports a refused batch in a step inside the picker`); 111 vitest y 13/13
  e2e en verde.

#### T19 — Resultado en ventana (Android)
- **Specs**: S45.
- **Archivos**: `LoadingScreen.kt`, `LoadingViewModel.kt`, `ui/components/ActionResultDialog.kt`, `LoadingScreenTest.kt`, `LoadingViewModelTest.kt`.
- **Trabajo**: el resultado de `confirmAdd` se dibuja en `ActionResultDialog`; fallo parcial conserva el mensaje; 409 con nombre y horario.
- **Tests**: `LoadingScreenTest.kt`: `shows the result dialog instead of an inline message`; `LoadingViewModelTest.kt`: `keeps the message after a partial failure`.
- **Aceptación**: la grilla no dibuja el error de una tanda; el diálogo lista cada fila.
- **Commit**: `feat(android): report a batch refusal in the result dialog` (~200 líneas).
- **Depende de**: T17.

### Fase 6 — Massas ERP

#### T20 — Sync solo en el día abierto
- **Specs**: S29, S53.
- **Archivos**: `packages/android/app/src/main/java/com/trindade/app/massas/MassasDayHeader.kt`, `MassasLaunchViewModel.kt`, `aero/AeroDispatcher.kt`, `aero/AeroFailure.kt`, `aero/AeroAdapters.kt`, `MassasDayHeaderTest.kt`, `MassasLaunchViewModelTest.kt`, `AeroDispatcherTest.kt`, `AeroFailureTest.kt`, `packages/frontend/src/pages/massas/MassasLaunchPage.tsx`, `MassasLaunchPage.test.tsx`, `__e2e__/massas-sync-header.spec.ts`, locales.
- **Trabajo**: ocultar/deshabilitar el botón en read-only; token de día en `refreshMirror`; descartar respuesta de otro día; `AeroFailureCode.BACKEND_DAY_CLOSED` no retryable; `syncDay` mapea 409 `MASSAS_HISTORY_FROZEN`; la cola descarta los ítems de un día cerrado con `settle` y línea `aero_queue_rejected` (S53); tests de fecha enviada.
- **Tests**: `MassasLaunchViewModelTest.kt`: `sends the selected date`; `drops the mirror answer when the day changed`; `drops a queued item the backend closed instead of retrying it`; `MassasDayHeaderTest.kt`: `hides the sync button on a closed day`; `AeroDispatcherTest.kt`: `maps a closed-day snapshot to a non retryable failure`; `AeroFailureTest.kt`: `BACKEND_DAY_CLOSED is not retryable`; `massas-sync-header.spec.ts`: `the sync action is not offered on a past day`.
- **Aceptación**: cambiar de día durante el sync no pinta el espejo del día anterior; un día cerrado no ofrece sincronizar; una cola con un ítem de ayer se vacía en la primera apertura y el ítem no vuelve.
- **Commit**: `fix(massas): sync only the open day and ignore a stale mirror` (~180 líneas).
- **Depende de**: T5.

### Fase 7 — Brechas restantes

#### T21 — Placa de fletero en grilla y edición
- **Specs**: S48.
- **Archivos**: `packages/frontend/src/components/loading/ScheduleGrid.tsx`, `packages/frontend/src/pages/LoadingEditPage.tsx`, `ScheduleGrid.test.tsx`, `LoadingEditPage.test.tsx`.
- **Trabajo**: `getDisplayPlate` devuelve vacío para `fletero`; la edición no dibuja la chapa del fletero; el dato sigue en la respuesta.
- **Tests**: `ScheduleGrid.test.tsx`: `does not draw the plate of a fletero`; `keeps the plate of a company row`; `LoadingEditPage.test.tsx`: `hides the fletero plate in the editor`.
- **Aceptación**: ninguna vista web muestra la chapa del fletero; los datos históricos no se tocan.
- **Commit**: `fix(web): hide the fletero plate in the grid and the editor` (~80 líneas).
- **Depende de**: ninguna.
- **Estado.** Hecho: `getDisplayPlate` devuelve vacío para un fletero y la edición sólo dibuja
  `vehicle_plate` de una fila de casa; la chapa sigue en la respuesta. Tests: `ScheduleGrid`
  (`does not draw the plate of a fletero`, `keeps the plate of a company row`) y `LoadingEditPage`
  (`hides the fletero plate in the editor`); 110 vitest en verde.

#### T22 — Contrato del log ERP con cuerpos reales
- **Specs**: S50, S49.
- **Archivos**: `packages/backend/src/modules/integration/aero.log.contract.test.ts`.
- **Trabajo**: reemplazar fixtures inventados por los emisores web reales; validar `client`, `attemptId`, `durationMs`.
- **Tests**: `aero.log.contract.test.ts`: `accepts the body a web launch actually sends`; `requires client and attemptId on both members of the pair`.
- **Aceptación**: el contrato falla si un emisor deja de mandar `client` o `attemptId`.
- **Commit**: `test(backend): pin the ERP log contract to the real web emitters` (~110 líneas).
- **Depende de**: T6.

### Fase 8 — Release y verificación

#### T23 — Build 7006 y despliegue
- **Specs**: S51, D8, D9, D10.
- **Archivos**: `packages/android/app/build.gradle.kts`, `CHANGELOG.md`, `docs/release-android.md`, `docs/release-android-historial.md`, `packages/backend/apk/`.
- **Trabajo**:
  1. `versionCode 7006`, `versionName 0.7.0`.
  2. Build release firmado; `aapt2 dump badging` y `apksigner verify`.
  3. Instalar en `emulator-5554` y recorrer: histórico de cargamento (ayer, read-only), reactivar, selector sin duplicados, resultado en ventana, relatório con píldora, Massas sync oculto en pasado.
  4. `sha256sum -c` del par APK/sidecar; copiar a `packages/backend/apk`, Desktop y producción.
  5. `docker compose build web api && docker compose up -d web api`.
  6. Verificación visual 390×844 y 1440×900 en producción local.
  7. `CHANGELOG`, docs de release y historial, en español.
  8. Push a `main`.
- **Aceptación**: APK 7006 con digest verificado, release `v0.7.0` con el asset reemplazado y el sidecar correcto, tag sin mover, web sirviendo los bundles nuevos, capturas sin errores de consola, `origin/main` actualizado.
- **Commit**: `chore(release): ship Android 7006 with the loading history fixes` (~200 líneas de docs y versión).
- **Depende de**: T1–T22. **Requiere autorización explícita de publicación** antes de tocar GitHub.

---

## 6. Orden de ejecución y commits

| # | Tarea | Commit | Líneas estimadas |
| --- | --- | --- | --- |
| 1 | T1 | `feat(backend): freeze past loading days and read inactive batches whole` | 220 |
| 2 | T2 | `feat(backend): let an administrator reactivate a batch or a report` | 170 |
| 3 | T3 | `feat(backend): project closed days as read only with an activate offer` | 140 |
| 4 | T4 | `feat(backend): name duplicate refusals with a stable code and slot` | 90 |
| 5 | T5 | `fix(backend): refuse an ERP snapshot for a closed massas day` | 100 |
| 6 | T6 | `fix(web): make every ERP audit event reach the log with its pair` | 180 |
| 7 | T7 | `feat(android): reactivate a deactivated batch from the history` | 300 |
| 8 | T8 | `feat(android): show a deactivated day whole and read only` | 280 |
| 9 | T9 | `fix(android): keep the lifecycle result and name the refusal` | 250 |
| 10 | T10 | `fix(android): use the shared history button on the report form` | 40 |
| 11 | T11 | `feat(android): open a past loading day in read only` | 200 |
| 12 | T12 | `feat(web): stop opening a past loading day in the editor` | 200 |
| 13 | T13 | `fix(web): align the loading history actions on a phone` | 90 |
| 14 | T14 | `fix(web): drop stale history answers and hide today from the chips` | 150 |
| 15 | T15 | `fix(web): offer only free plates and explain who is already scheduled` | 300 |
| 16 | T16 | `fix(web): read the day again before opening the driver picker` | 140 |
| 17 | T17 | `fix(android): keep taken plates out of the driver picker` | 220 |
| 18 | T18 | `feat(web): show batch refusals in one result step` | 220 |
| 19 | T19 | `feat(android): report a batch refusal in the result dialog` | 200 |
| 20 | T20 | `fix(massas): sync only the open day and ignore a stale mirror` | 180 |
| 21 | T21 | `fix(web): hide the fletero plate in the grid and the editor` | 80 |
| 22 | T22 | `test(backend): pin the ERP log contract to the real web emitters` | 110 |
| 23 | T23 | `chore(release): ship Android 7006 with the loading history fixes` | 200 |

Ninguna tarea supera las 400 líneas. El orden de la tabla es el orden de ejecución recomendado y el de las dependencias declaradas. T1–T6 no se paralelizan entre sí cuando comparten `loading.service.ts`/`loading.routes.ts`: T1, T2 y T4 van en serie. T10, T14 y T21 no dependen de nadie y pueden adelantarse si conviene.

---

## 7. Plan de release 7006

1. **Android**: `versionCode 7006`, `versionName 0.7.0`. Firma con la clave oficial. `aapt2 dump badging` confirma `versionCode='7006'` y `versionName='0.7.0'`.
2. **Asset**: `trindade-0.7.0.apk` + `trindade-0.7.0.apk.sha256` reemplazan el asset actual de la release `v0.7.0` (`gh release upload v0.7.0 <files> --clobber`). El tag **no se mueve**.
3. **Copias**: `packages/backend/apk/`, Desktop y producción. `sha256sum -c` en cada copia.
4. **Web/api**: `docker compose build web api && docker compose up -d web api`; verificar el bundle servido (`MassasHistoryPage-*.js` nuevo) y ausencia de errores de consola.
5. **Emulador**: instalar en `emulator-5554`; recorrido de histórico de cargamento de ayer, reactivación, selector sin duplicados, resultado en ventana, relatório con píldora y Massas sin sync en pasado.
6. **Capturas**: 390×844 y 1440×900 de histórico de cargamento, picker y Massas.
7. **Docs**: `CHANGELOG.md`, `docs/release-android.md`, `docs/release-android-historial.md`; notas de release en español.
8. **Git**: commits atómicos a `main`, push a `origin/main`, sin ramas, sin `Co-Authored-By`.

Los pasos 2, 3 y 4 son **publicación**: se ejecutan solo con autorización explícita en el momento.

---

## 8. Riesgos

| Riesgo | Probabilidad | Mitigación |
| --- | --- | --- |
| Q2 mal resuelta resucita filas borradas en el grid operativo | Media | `includeInactive` opt-in y test de default intacto (T1) |
| Q4 cambia el borrado para Trabalhador y rompe tests existentes | Alta | Reescribir los tests que fijan el comportamiento viejo en T1/T11, no borrarlos |
| El cambio de `projectHistoryPermissions` afecta a reportes | Media | Tests de hoy/ayer en T3; contratos aditivos |
| El 409 de día cerrado rompe la app Android vieja (7005) | Media | Los clientes viejos ya muestran el `error` del servidor; no hay campo nuevo obligatorio |
| `assertLoadingDayStillOpen` bloquea el flujo de hoy por zona horaria | Media | Usar `getSaoPauloDateString()` (ya usado en massas) y test de medianoche |
| El sync ERP rechazado en pasado rompe un reintento de la cola Android | Media | T5 audita y devuelve código; la cola distingue `Refused` de `Unreachable` |
| El reemplazo de asset deja el sidecar desincronizado | Media | `sha256sum -c` antes de publicar y verificación del asset remoto |
| La verificación visual no cubre el picker a 390 px | Media | Capturas obligatorias en T13/T15/T18 y revisión antes de T23 |

---

## 9. Trazabilidad

| Tarea | Specs | Commit | Test de cierre | Estado |
| --- | --- | --- | --- | --- |
| T1 | S22, S23, S25, S26, S27 | `fe4a921`, `46cd532` | `loading.routes.mutations.test.ts`, `loading.service.test.ts` | hecho |
| T2 | S24, S31 | `b2fa299` | `loading.routes.mutations.test.ts`, `reports.routes.test.ts` | hecho |
| T3 | S25, S37 | `868a10d` | `history-permissions.test.ts` | hecho |
| T4 | S28 | `1fc74c5` | `loading.routes.schedules.test.ts` | hecho |
| T5 | S29, S53 | — | `aero.movements.service.test.ts`, `AeroAdaptersTest` | pendiente |
| T6 | S49 | — | `aero-audit.test.ts`, `aero-bridge-wiring.test.ts` | pendiente |
| T7 | S24, S31 | — | `LoadingHistoryViewModelTest.kt` | pendiente |
| T8 | S26, S27, S32 | — | `LoadingViewModelTest.kt` | pendiente |
| T9 | S30, S33, S34 | — | `LoadingHistoryViewModelTest.kt` | pendiente |
| T10 | S52 | — | `ReportGeneratorScreenTest.kt` | pendiente |
| T11 | S22, S32 | — | `LoadingScreenTest.kt` | pendiente |
| T12 | S35, S37 | — | `LoadingHistoryPage.test.tsx`, `LoadingEditPage.test.tsx` | pendiente |
| T13 | S36 | — | `loading-history.spec.ts` | pendiente |
| T14 | S46, S47 | — | `MassasHistoryPage.test.tsx`, `StockHistoryPage.test.tsx` | pendiente |
| T15 | S38, S39, S40, S42 | — | `loading-picker.test.ts`, `DriverPickerDialog.test.tsx` | pendiente |
| T16 | S41 | — | `DriverPicker.test.tsx` | pendiente |
| T17 | S38, S43, S54 | — | `LoadingViewModelTest.kt`, `LoadingScreenTest.kt` | pendiente |
| T18 | S44 | — | `DriverPickerDialog.test.tsx`, `loading-schedule.spec.ts` | pendiente |
| T19 | S45 | — | `LoadingScreenTest.kt` | pendiente |
| T20 | S29, S53 | — | `MassasLaunchViewModelTest.kt`, `AeroDispatcherTest.kt`, `massas-sync-header.spec.ts` | pendiente |
| T21 | S48 | — | `ScheduleGrid.test.tsx`, `LoadingEditPage.test.tsx` | pendiente |
| T22 | S49, S50 | — | `aero.log.contract.test.ts` | pendiente |
| T23 | S51 | — | build + emulador + capturas | pendiente |

---

## 10. Log

**L1 (pedido del usuario, verbatim)**

> Che, nuevo ciclo 7006. Leé entero /tmp/commandcode-1001/-home-wilkin-Desktop/1b66c6d5-3dc5-4bce-80bf-915e173590b5/scratchpad/trindade-odd-7006-brief.md y creá SOLO el ODD odd/tasks/remediacion-historico-cargamento-7006.md con el formato pedido. No toques código ni abras ramas. Al terminar quedate idle y reportá path, tareas, dependencias y conflictos.

**L2 (directiva completa)**

`/tmp/commandcode-1001/-home-wilkin-Desktop/1b66c6d5-3dc5-4bce-80bf-915e173590b5/scratchpad/trindade-odd-7006-brief.md`, leída entera. Su contenido normativo —objetivo, las diez decisiones cerradas, los nueve hallazgos A–I con evidencia, el orden recomendado, el plan de release y las reglas— está volcado en las secciones 1, 2, 4, 5 y 7 de este documento.

**L4 (aprobación y alcance añadido, verbatim)**

> ODD 7006 aprobado con Q1=Sí (reactivar solo lote/reporte), Q2=Sí (includeInactive opt-in), Q3=Sí (409 MASSAS_HISTORY_FROZEN + auditoría), Q4=Sí (prohibir borrado físico en pasado). Commits en inglés por convención del repo. Antes de implementar, agregá al ODD: (a) T20 o T5 debe cubrir la cola Android cuando el backend devuelve 409 MASSAS_HISTORY_FROZEN por fecha pasada: marcar el ítem como rechazado, no reintentar infinito, test; (b) T17 debe cubrir G4 en Android: el candidato ya asignado se explica con su horario, no desaparece mudo. T23 queda autorizado a publicar solo después de tests/hashes/tag verificados; avisá antes de gh release upload. Commiteá el ODD y arrancá T1→T23 sin parar; actualizá trazabilidad por tarea. No dupliques mensajes.

**L5 (cambios incorporados por L4)**

- S53 nueva: `AeroFailureCode.BACKEND_DAY_CLOSED` no retryable, 409 mapeado en `syncDay`, ítem de cola descartado con auditoría. Cubierta por T5 (contrato del backend y del puerto) y T20 (dispatcher, cola y UI).
- S54 nueva: el conductor ocupado se lista deshabilitado con su horario en el selector de Cargamento Android. Cubierta por T17.
- T23 publica solo con tests, hashes y tag verificados, y avisa antes de `gh release upload`.
- Diferencia declarada de la cola real: el 409 llega al guardado del snapshot (`AeroMirrorPort.saveMovements`), no al envío del asiento a Aero32. El “ítem rechazado” se implementa descartándolo de la cola con `settle` al detectar el día cerrado, y el fallo deja de ser retryable.

**L3 (verificación previa a la redacción)**

Lectura directa del código para no heredar afirmaciones del brief: `loading.routes.ts:37-48,64-72`, `reports.routes.ts:192-204`, `history-permissions.ts:89-100`, `loading.service.ts:20-56,110-139,338-371`, `massas.service.ts:288-293`, `aero.movements.service.ts:70-109`, `LoadingRepository.kt:45-60,118-155`, `LoadingHistoryViewModel.kt:130-170,220-300`, `ReportsHistoryViewModel.kt:190-240`, `ReportGeneratorScreen.kt:103-106`, `ModuleHelpDialog.kt:150-172`, `LoadingHistoryPage.tsx:160-200`, `LoadingEditPage.tsx:92-110,255-270`, `StockHistoryPage.tsx:60-85`, `loading-picker.ts:45-125`, `DriverPicker.tsx:55-95,180-200`, `DriverPickerDialog.tsx:200-235`, `ScheduleGrid.tsx:60-100`, `aero-audit.ts:150-170`, `aero.log.contract.test.ts:30-75`, `wc -l logs/aero-integration.log` = 92 líneas, 0 `client=web`, 3 `client=android`.

Correcciones que esta verificación introduce sobre el brief: el hallazgo B está parcialmente desactualizado (el resultado tipado ya existe); `refusalMessage` ya distingue 403/404; `create` ya devuelve `code` pero con el texto en portugués como valor; `canDelete` no mira el día; y los tests actuales fijan el borrado de días pasados.
