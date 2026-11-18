# Android 0.8.0 — paridad total con la web (APK de prueba, sin release)

Pasada del 2026-11-18. La app Android publicada es **0.7.5 / 7019** y ya implementa la mayor parte de
Trindade: auth, dashboard, Masas, Relatórios, Horario de Carga, Stock, Assaí, Administración, Compartir,
auditoría y ERP directo. **No hay que reescribirla desde cero**: hay que evolucionarla a una versión de
paridad, cerrar los huecos que quedaron de la web y pulir la UI antes de que el dueño la verifique.

**Condición de arranque:** este pase empieza cuando el pase web de las ShareCard de histórico esté
cerrado (CI verde y deploy real). Hasta entonces no se toca `packages/android`.

## Reglas del pase

1. **No crear tag, release de GitHub, asset `.apk` ni publicación.** El APK es de prueba.
2. **Dejarlo instalado en el emulador de la VM `ubuntu`** (`emulator-5554`, AVD `Trindade_UX_v030`) y
   dejar capturas de las pantallas principales.
3. **No tocar datos de producción ni la release actual.** El backend solo se toca si un contrato o un
   endpoint nuevo lo exige, y se documenta.
4. **Un solo mensaje de WhatsApp**: tabla compartida + golden del Relatório. No reconstruir nombres.
5. **Una sola ShareCard de lectura**: historiales sin Editar y con Volver.
6. **El sync del espejo es del Relatório**; el histórico de Salida no tiene `Conferir no ERP`.
7. **Salida nace abierta** para toda cuenta autenticada; el invitado conserva solo lectura.
8. **Fecha de planta en São Paulo**, 44 dp mínimo y revisión a 390 dp.
9. Cada APK se compara contra la web; si hay diferencia, se corrige y se vuelve a instalar.
10. Commits convencionales por fase; se pushea el código, **nunca** la release.

## Estado actual verificado

- `packages/android` es un solo módulo `:app` (Compose + Hilt + Retrofit/OkHttp + kotlinx.serialization).
- Contratos generados en `packages/android/contract` (181 modelos); `erpOnly`, `AeroBridgeStep` y
  `AeroBridgeEnvelopeStepsInner` ya existen.
- Tests: 105 clases JVM, 43 Robolectric Compose y 4 instrumentados opt-in (`nativeExportGate`).
- Emulador de referencia: VM Ubuntu `10.50.0.3`, AVD `Trindade_UX_v030`, Android 14/API 34, x86_64;
  se maneja por `ssh ubuntu` y `adb`.
- Build de la app: `./gradlew testDebugUnitTest`, `./gradlew assembleDebug`; release firmada solo con
  keystore externo y `-PrequireSigned=true`.

## Huecos de paridad (prioridad)

### P0 — bloquean la paridad

| Hueco | Archivos / referencia |
| --- | --- |
| **Salida/Baixa no existe**: sin API, repositorio, ViewModel, pantallas, fotos, `saidasitem` ni `salida_sync` | crear `app/src/main/java/com/trindade/app/salida/`; `network/SalidaApi.kt`; `aero/AeroErpClient.kt`; `aero/AeroAudit.kt` |
| **Relatório no muestra el bloque `SAÍDAS / BAIXA`** ni pide ambos lados del espejo | `network/ReportsApi.kt` (falta `GET api/reports/day/salidas`), `reports/ErpMovementsCard.kt`, `aero/AeroErpClient.kt` (`ENTSAI` fijo en `E`), `reports/ReportDetailScreen.kt` |
| **Historiales abren el editor/detalle con Editar**, no la ShareCard de lectura | `reports/ReportsHistoryScreen.kt`, `loading/LoadingHistoryViewModel.kt`, `reports/ReportDetailScreen.kt`, `loading/LoadingScreen.kt` |
| **Massas escribe el WhatsApp viejo** (bullets, nombres completos, sin tabla/golden) | `massas/MassasLogic.kt`, `network/MassasApi.kt` (DTOs duplicados); crear asset de la tabla |
| **Massas deja el share/copy/sync en el lanzamiento**, no en el histórico; día vacío no muestra el bloque deshabilitado | `massas/MassasLaunchScreen.kt`, `massas/MassasHistoryScreen.kt` |
| **Bug de sesión**: refresh en la ventana de gracia (200 sin `refreshToken`) borra la sesión | `auth/AuthRepository.kt` (`refresh()`), `AuthInterceptor.kt` |

### P1 — visibles y de comportamiento

| Hueco | Archivos |
| --- | --- |
| Admin con formularios inline; la web usa modal con Aceptar/Cancelar en 6 pestañas | `admin/CategoriesScreen.kt`, `TasksScreen.kt`, `DriversScreen.kt`, `VehiclesScreen.kt`, `TimeSlotsAdminScreen.kt`, `UsersScreen.kt` |
| Dashboard/menú/RolePolicy sin Salida; faltan 7 tarjetas | `dashboard/DashboardScreen.kt`, `MainActivity.kt`, `auth/RolePolicy.kt` |
| Assaí con 9 productos; la web tiene 8 y quitó `Quadrada` | `assai/AssaiOrder.kt`, `AssaiCalculatorScreen.kt` |
| `salida_sync` no está en el enum de auditoría | `aero/AeroAudit.kt` |
| ShareManager no adjunta fotos en `ACTION_SEND` múltiple | `export/ShareManager.kt` |
| Contrato sin `securitySchemes`, `SuccessResponse` enum booleano, `AeroBridgeStep` duplicado, `MassasReportDayView.operators` no estricto, `MassasLaunchCreateRequest` todo opcional | `packages/backend/src/contracts/openapi.ts`, `aero.vault.schema.ts`, regenerar |
| Report/Massas no coinciden en el filtro de cuentas activas | `massas-report.service.ts` (falta `is_active = 1`), `salida-report.service.ts` |
| `MassasApi` y `StockApi` fuera de `ContractCoverageTest`; sin golden Android de WhatsApp | tests |

### P2 — pulido

- Revisar 390 dp/44 dp en todas las pantallas y modales; capturas.
- Decidir si se mantiene el polling de 15 s de Massas (la web actual no lo instala).
- `X-Trindade-Client: native` en auth/sesión (hoy no se envía).
- Docs: `docs/auditoria-android.md` (agregar `salida_sync`), `CHANGELOG.md`, `docs/calculadoras.md`.

## Fases de implementación

### Fase 0 — Entorno y contrato

- JDK 21 en el host; `ANDROID_HOME` con platform/build-tools necesarios; si falta `platforms;android-37`,
  instalarlo o usar la imagen CI `ghcr.io/cirruslabs/android-sdk:35`.
- Regenerar contratos si cambia el OpenAPI; no editar modelos generados.
- Corregir el refresh de gracia y agregar tests de sesión.
- Añadir el asset `whatsapp-abbreviations.table.json` copiado de
  `packages/frontend/src/lib/whatsapp-abbreviations.table.json` y un test de paridad.

### Fase 1 — Salida/Baixa (P0)

- Catálogo 19 (11/3/5), cantidades enteras, 4 dígitos UI/6 ERP, confirmación antes de enviar.
- Local primero (`POST /api/salida`), fotos después sobre el movimiento, outbox y reintento.
- ERP directo `POST /saidasitem` en lotes de 8, veredicto `complete/partial/failed/unreadable/legacy`,
  `POST /api/salida/:id/erp-result`, auditoría `salida_sync`.
- Pantallas: lanzamiento (header de día/operador/histórico, bloques, barra sticky), histórico (hoy/pasado,
  filtros de sesión/bloque, estados Enviado/Conciliado/Parcial/Pendente, fotos ≤3, `Reenviar` solo con
  `canRelaunchSalida`, sin `Conferir no ERP`, share del día).
- Navegación/dashboard/RolePolicy; 7 tarjetas; E2E/Compose de 390 dp.

### Fase 2 — Relatório y ShareCard de históricos (P0)

- `GET /api/reports/day/salidas` + tarjeta `SalidaReportCard` (operarios activos, `erpOnly`, nombres
  canónicos, encoding, error vs vacío).
- Sync del Relatório con `ENTSAI: null` (`includeExits: true`); el resto sigue `E`.
- `ShareCard` Compose reutilizable: modos `saved` (Editar+Cerrar), `share`/`fromHistory` (Volver, sin
  Editar, sin Copiar); usarla en historial de Reportes y en Horario cerrado.
- Historial de Reportes → ShareCard; historial de Horario cerrado/ojo → ShareCard; abierto → editor.

### Fase 3 — Masas, Admin, UI (P0/P1)

- Mover producción del día, resumen colectivo, share y `Sincronizar com ERP` al histórico; lanzamiento
  solo grilla + confirmación + barra sticky.
- WhatsApp con tabla/golden, `- nombre: N un`, `📦`, `👤`, `(N cx)`, `(só ERP)`, `PÃO`; día vacío con
  prévia vacía y botón deshabilitado; sin Copiar.
- Admin en modal para las seis pestañas; Assaí 8 productos; dashboard/menú.
- Revisión visual 390 dp/44 dp y capturas.

### Fase 4 — Verificación APK vs web

1. `./gradlew testDebugUnitTest` verde.
2. `./gradlew assembleDebug` (o release de prueba si hay keystore) con
   `-PapiBaseUrl=https://trindademasas.duckdns.org/`.
3. `scp` del APK a la VM y `adb -s emulator-5554 install -r`; si la firma choca con la 0.7.5, desinstalar
   solo en el emulador de pruebas y avisar.
4. Capturas `adb exec-out screencap` de dashboard, Masas, Salida, Reportes, Horario, Admin, Share y
   comparación con la web a 390 px.
5. Registrar diferencias y corregirlas; repetir hasta que no queden P0/P1 visibles.
6. Dejar la APK instalada; **no publicar**.

## Criterios de aceptación

- [ ] La app compila y `testDebugUnitTest` está verde.
- [ ] Salida/Baixa completo (lanzar, histórico, fotos, share, ERP, sin beta/Conferir).
- [ ] Relatório con bloque de Salidas y sync `includeExits`.
- [ ] Historiales de Reportes/Horario abren ShareCard de lectura con Volver, sin Editar ni Copiar.
- [ ] Massas con tabla/golden, share en histórico, día vacío deshabilitado, sin Copiar.
- [ ] Admin modal, Assaí 8, dashboard 7, Salida en menú/RolePolicy.
- [ ] Sesión de gracia sin logout; `salida_sync`; contratos regenerados.
- [ ] 390 dp/44 dp sin desbordes; capturas revisadas.
- [ ] APK instalada en `emulator-5554`; sin tag/release/asset publicado.

## Entorno

- VM `ubuntu` (`10.50.0.3`), AVD `Trindade_UX_v030`, Android 14/API 34 x86_64, `/dev/kvm`.
- SDK `~/Android/Sdk`; JDK 21; `adb`.
- Build en el host con el SDK local; instalar en la VM por `scp` + `adb`.
- El repo no está en la VM; el código vive en este host.
- Capturas fuera del repo (`/tmp` o `~/Desktop`); no ensuciar el árbol.

## Notas de arranque

- Este pase **no** empieza hasta que el pase web de ShareCard de histórico tenga CI verde y deploy real.
- No se toca la release 0.7.5 ni `packages/backend/apk`.
- El usuario verifica la APK en su emulador antes de autorizar una release.

## Índice de tareas (para delegación)

| ID | Fase | Alcance |
| --- | --- | --- |
| T0.1 | 0 | Asset `whatsapp-abbreviations.table.json` copiado de la web + test de paridad Android contra él — hecho |
| T0.2 | 0 | Refresh en la ventana de gracia sin cerrar sesión (`AuthRepository.refresh`) + tests — hecho |
| T0.3 | 0 | Contratos: regenerar solo si el OpenAPI cambió; no editar modelos a mano |
| T1.1 | 1 | `network/SalidaApi.kt` + DTOs + cobertura de contrato |
| T1.2 | 1 | `salida/` repositorio, ViewModel y outbox (local primero, fotos, reintento) |
| T1.3 | 1 | ERP directo `POST /saidasitem` en lotes de 8 + `POST /api/salida/:id/erp-result` + auditoría `salida_sync` |
| T1.4 | 1 | Pantallas de lanzamiento e histórico (bloques, sticky, filtros, estados, fotos, share del día) |
| T1.5 | 1 | Navegación, dashboard y `RolePolicy` con Salida; 7 tarjetas |
| T2.1 | 2 | `GET /api/reports/day/salidas` + `SalidaReportCard` en el detalle del Relatório |
| T2.2 | 2 | Sync del Relatório con `includeExits` (`ENTSAI: null`) y el resto en `E` |
| T2.3 | 2 | `ShareCard` Compose reutilizable y su uso en historial de Reportes y Horario cerrado |
| T3.1 | 3 | Masas: producción del día y share/sync en el histórico; WhatsApp con tabla/golden; día vacío deshabilitado; sin Copiar |
| T3.2 | 3 | Admin en modal (seis pestañas), Assaí 8 productos, dashboard 7 tarjetas |
| T4.1 | 4 | `testDebugUnitTest` + `assembleDebug` con `-PapiBaseUrl` de producción |
| T4.2 | 4 | Instalación en `emulator-5554`, capturas y comparación con la web a 390 px |

## Avance

### Fase 0 — cerrada

- **T0.1** `app/src/main/assets/whatsapp-abbreviations.table.json`, copiado del que sirve la web, con
  `WhatsappAbbreviationsTableTest` comparando las cuatro secciones fila por fila contra
  `packages/frontend/src/lib/whatsapp-abbreviations.table.json` y fijando algunas filas aprobadas.
- **T0.2** `AuthRepository.refresh`: un 200 sin `refreshToken` (ventana de gracia) guarda sólo el access token y
  **no** cierra la sesión; el par rotado se guarda entero; un 401 real sigue devolviendo `false`. `TokenStore`
  ganó `saveAccessToken` con implementación por defecto para los stores de test.
  `AuthRefreshGraceTest`: 4 casos, más los de `AuthRepositoryTest`/`AuthInterceptorTest`.
- **T0.3** contratos ya regenerados en la pasada web; `verify-openapi-artifact.sh` en verde, sin cambios.
