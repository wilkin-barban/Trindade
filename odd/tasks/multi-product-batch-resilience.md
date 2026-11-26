# Resiliencia de lanzamientos múltiples (Web y Android · Massas y Salida)

Rama: `fix/multi-product-batch-resilience` (desde `13c663de`) · Estrategia de entrega: `ask-on-risk` (~420 líneas estimadas) · Engram mirror: pendiente (el directorio de trabajo del runtime resolvió `project="desktop"` en `/home/wilkin/Desktop`, fuera de `/home/wilkin/proyectos/Trindade`) · Runners: Frontend (`npm run test:node`, `npm run test:unit`, `npm run typecheck`), Backend (`npm test`), Android (`ANDROID_HOME=/home/wilkin/Android/Sdk ./gradlew testDebugUnitTest --no-daemon`).

## Specs

- S1 · Puente `Aero32Bridge.js` (`packages/frontend/scriptable/Aero32Bridge.js` + assets generados):
  - Cuando un lote multi-producto (`steps[0]` en `entrada_lote` o rama `else` en `saida`) falla en `indice >= 1` por error de red, timeout o respuesta no-JSON, serializar un objeto JSON válido `{ success: false, message }` por cada ítem fallido en lugar de texto plano sin comillas, preservando válidos el array JSON completo y las respuestas previas que sí confirmaron en el ERP.
  - Regenerar `public/Aero32Bridge.js` y `public/AeroBridge` bundle `.scriptable` con `packages/frontend/scripts/build-scriptable.mjs` verificando byte-a-byte con `aero-scriptable-asset.test.ts` y pruebas en sandbox VM.
- S2 · Web `Lanzamiento de masas` (`packages/frontend/src/lib/aero-queue.ts`, `packages/frontend/src/pages/MassasHistoryPage.tsx`):
  - Ante callback de error (`parsed.kind === 'error'`, ej. `wifi_required`), registrar auditoría `launch_sync` (`phase: 'result'`) con el intento pendiente si existe, restaurar `queue.inFlight` al frente de `queue.items` (`inFlight: []`) para no perder la cola en `localStorage`, y actualizar `syncAwaiting`.
  - Marcar `aeroCallbackHandled.current = true` de forma síncrona antes de `await resolveAeroCallback(queryString)` cuando exista callback válido, evitando doble lectura de `/last-result` y auditorías duplicadas.
- S3 · Web `Salida / Bajas` (`packages/frontend/src/pages/salida/SalidaHistoryPage.tsx`, `packages/frontend/src/lib/salida.ts`):
  - En `callback.kind === 'error'` (`wifi_required` u otro error de puente), limpiar `currentTripPayloads` del `SalidaOutbox` guardado (sin dejar bloqueo silencioso) para que «Reenviar ao ERP» siga disponible y funcional en tarjeta e historial.
  - Cuando `batchResult.state === 'failed'` (`ok === 0`) y no existan viajes previos confirmados en el movimiento, limpiar `currentTripPayloads` y no marcar `retryState: 'review'` (reservando `'review'` para respuestas `'partial'` o `'unreadable'`). Si ya existía confirmación previa en un movimiento multi-viaje y falla un viaje posterior, preservar estado `'partial'` en lugar de sobrescribir con `'failed'`.
  - En movimientos multi-viaje (`queued.trips.length > 1`), al completarse un viaje intermedio (`isComplete`), persistir `status: 'partial'` en backend hasta completar el último viaje (`trips.length === 1` → `'sent'`).
- S4 · Android `Lanzamiento de masas` (`ErpTimeout.kt`, `MassasLaunchViewModel.kt`):
  - Escalar el presupuesto de `withErpTimeout` de forma proporcional al número de productos del lote (`erpBatchTimeoutMs(count)` con piso `ERP_DISPATCH_TIMEOUT_MS = 25_000L` para 1 ítem).
  - En `dispatchToErp`, encolar **todos** los lanzamientos `created` en `aeroQueueStore` antes de iniciar los envíos HTTP al ERP para que un corte por timeout no deje ítems finales fuera de la cola persistida; cortar el bucle (`break`) ante fallos de transporte/red (`failure.code != AeroFailureCode.ERP_REFUSED`) manteniendo el intento del resto cuando el error sea `ERP_REFUSED`.
- S5 · Android `Salida / Bajas` (`SalidaOutbox.kt`, `SalidaRepository.kt`, `SalidaViewModel.kt`):
  - Persistir `SalidaOutbox` indexado por `movementId` (con compatibilidad de lectura sobre la clave legacy `"pending"`), guardar el outbox **antes** del primer `POST /saidasitem` y descontar cada payload individual confirmado conforme responde `AeroWriteResult.Ok` para no duplicar ítems en reintentos.
  - Usar `erpBatchTimeoutMs(selection.lines.size)` en `SalidaViewModel.confirmLaunch` y asegurar mediante `withContext(NonCancellable)` que una cancelación o timeout parcial en `sendToErp`/`retryPending` persista el progreso restante en outbox y registre el veredicto (`partial` si ya entraron documentos o `failed` si no) en el backend.
- S6 · Pruebas, verificación diferencial y auditoría de cierre:
  - Observar RED → GREEN por unidad (`T1`–`T5`), incluir pruebas unitarias de regresión, ejecutar suites completas Web + Backend + Android, ejecutar comprobación diferencial contra `main` (`13c663de`) y verificación independiente de solo lectura al cierre (`Risk: item 3, item 4`).
  - Mantener contexto de solo despliegue/push bajo decisión humana: dejar la rama lista con work-unit commits bajo Conventional Commits sin `Co-Authored-By` ni atribución a IA.

## Tasks

- [x] T1 · S1 · inline · `8c3b0356`, `f6829d69` · Bridge `Aero32Bridge.js`: serialización JSON segura en errores de lote (`indice >= 1`), deduplicación del loop de envío y regeneración de assets + test VM
- [x] T2 · S2 · inline · `a1dfcb20`, `54585d25`, `f6829d69` · Web Massas: restauración de `inFlight` + auditoría en `wifi_required` y guard síncrono de callback en `MassasHistoryPage.tsx` + tests
- [x] T3 · S3 · inline · `013f0ae4`, `f6829d69` · Web Salida: liberación de `currentTripPayloads` en error/fallo total y estado `'partial'` en multi-viaje (`SalidaHistoryPage.tsx`) + tests
- [x] T4 · S4 · inline · `088abd41`, `f6829d69` · Android Massas: `erpBatchTimeoutMs`, pre-encolado completo en `AeroQueueStore` y `break` ante error de transporte en `MassasLaunchViewModel.kt` + tests
- [x] T5 · S5 · inline · `fb7cb42c`, `f6829d69` · Android Salida: outbox por `movementId`, liquidación por payload individual, `erpBatchTimeoutMs` y persistencia `NonCancellable` de outbox/veredicto + tests
- [x] T6 · S6 · verifier + inline · `f6829d69` + cierre ODD · Suites completas (Frontend, Backend, Android), verificación diferencial contra base `13c663de`, revisor independiente de riesgo alto y cierre de documento ODD

## Log

- L1. Solicitud original del usuario (investigación):
  «En la aplicación web de Trindade, hoy y con el usuario administrador Wilkin, en el módulos de Lanzamiento de masas, realice un lanzamiento múltiple, coloque vários productos para hacer un mismo lanze, estaba correctamente conectado a la wifi de la empresa, el resultado fue un error de conexión, los productos no se lanzaron en ERP y quedaron pendientes todos, tube que de uno en uno fui mandando con su respectivo botón de enviar en el modulo de Histórico de masas para mandarlos uno a uno, de esa forma los envie al ERP correctamente, quiero que:
-investigues la causa de este bug al mandar varios produtos al mismo tiempo en el módulo de Lanzamiento de masas en la aplicación web
-investiga si existe este mismo bug en el módulo Salida / Bajas em la aplicación web
-investiga en la aplicación Android en los mismos dos si existe este bug
Entrégame un relatório con los hallazgos y remediaciones para la aplicación web y para la aplicación Android si es que exististe este bug al lanzar vários productos en los módulos lanzamiento de masas y salida/bajas, trabaja por el momento en solo lectura»
- L2. Autorización del usuario (2026-11-26):
  «Tienes luz verde, crea el artefacto ODD y esta vez, realiza tu mismo el trabajo con el mismo rigor que cuando orquestas al agente, déjalo todo listo»
- Evidencia de exploración / base (`13c663de`):
  - En producción (`2026-11-26T14:41:36Z`), `Scriptable` canjeó el ticket de `entrada_lote` desde IP `179.68.125.32` (Claro S.A.) mientras los demás intentos salieron por `189.11.66.175` (V.tal/Oi), causando `wifi_required` tras `TIEMPO_LIMITE = 10`s; adicionalmente se verificaron bugs reales en `Aero32Bridge.js` (JSON inválido cuando falla `indice >= 1`), `MassasHistoryPage.tsx` (cola `inFlight` huérfana y sin auditoría en error + race de doble callback), `SalidaHistoryPage.tsx` (`currentTripPayloads` bloqueando reenvío en `error` y `'sent'` prematuro en `trips > 1`), y Android (`withErpTimeout(25_000L)` global, pre-encolado parcial por ítem en Massas, reenvío duplicado por viaje y pérdida de outbox/veredicto en timeout de Salida).
  - Risk alto identificado: ítem 3 (contrato del puente `Aero32Bridge.js`, `AeroQueue` / `SalidaOutbox` compatibles hacia atrás) e ítem 4 (orden asíncrono de callbacks, `withErpTimeout`, `NonCancellable`, `erpDispatchMutex`).
  - Nota de Engram: `mem_current_project` sobre el workspace del runtime (`/home/wilkin/Desktop`) resolvió `desktop`, por lo que el mirror de Engram en el proyecto Trindade queda marcado pendiente y la fuente local autoritativa es este documento.
- L3. Verificación diferencial contra base `13c663de`, revisión independiente y cierre (`2026-11-26`):
  - Revisor independiente de solo lectura (`odd-independent-verifier`, conv `841a3906`) auditó `13c663de..54585d25`: veredicto `S1`–`S6` todas `met`, `0 Blockers` y 5 avisos no bloqueantes; sus 5 sondas regresivas quedaron integradas de forma permanente en `f6829d69`.
  - Diferencial contra `13c663de` en copias aisladas: la base reproducía fallo de JSON `'unreadable'` en `Aero32Bridge.js`, pérdida/no restauración de `inFlight` y cuádruple lectura en `MassasHistoryPage`, y bloqueo/estado `'sent'` prematuro en `SalidaHistoryPage`; todas pasan en `HEAD`.
  - Verificación completa ejecutada tras el último cambio de código/tests (`f6829d69`):
    - `npm run typecheck`: OK (`0` errores).
    - `npm run build --workspace=packages/frontend`: OK (`built in 16.24s`; `build-scriptable.mjs` reportó `sin cambios` en `public/Aero32Bridge.js` y `public/Aero32Bridge.scriptable`).
    - `bash scripts/verify-schema-clis.sh` y `bash scripts/verify-openapi-artifact.sh`: OK.
    - Backend (`npm run test --workspace=packages/backend` con `AERO_VAULT_KEY` efímera): `1001/1001` tests passed (`152` suites, `0` fallos).
    - Frontend Node (`npm run test:node --workspace=packages/frontend`): `780/780` tests passed (`187` suites, `0` fallos).
    - Frontend Unit (`npm run test:unit --workspace=packages/frontend`): `332/332` tests passed (`34/34` archivos, `0` errores en ejecución limpia; una corrida previa aislada mostró 1 rechazo asíncrono post-teardown preexistente en `LoadingSchedulePage.test.tsx`).
    - Android (`./gradlew testDebugUnitTest --no-daemon` en copia limpia `scratch/android-check` por archivos root-owned preexistentes en `packages/android/app/build`): `BUILD SUCCESSFUL`, XML `files=201 tests=1649 skipped=1 failures=0 errors=0` (`SalidaPhotoTransportSafetyTest.literalPhotoUrlPreservesRootPathWithoutQueryOrFragment` con `@Ignore` preexistente).
  - Risk de cierre: `item 3 (contrato del puente Aero32Bridge.js, AeroQueue y SalidaOutbox), item 4 (concurrencia de callbacks, withErpTimeout y NonCancellable)` — verificado por revisor independiente sin bloqueantes.
