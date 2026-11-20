# Remediación Android 0.8.1 + paridad web — 15 puntos

**Estado:** ODD de implementación. **No hay release, tag ni asset publicado.**
**Base:** Android `0.8.0 (8003)` instalada en `emulator-5554`; web desplegada con los fixes de Sincronizar com ERP y Salida.
**Objetivo:** corregir los 15 puntos reportados por el usuario, recompilar una APK de prueba `0.8.1 (8004)`, instalarla en el emulador, verificarla punto por punto contra la web y iterar hasta que todo esté operativo. Después, y solo con aprobación explícita del usuario, preparar release.

---

## 0. Decisiones de alcance

1. **Android y web se corrigen donde el requisito lo pide.** La web es la referencia de diseño/comportamiento; si la web perdió una función, se recupera.
2. **Versión de prueba:** `versionName = 0.8.1`, `versionCode = 8004`. La APK se instala directo en `emulator-5554`; no se publica.
3. **Editar Reporte/Horario:** el dueño de la fila o un usuario con rol administrador. El backend es la autoridad; la UI solo refleja `canEdit`. Un trabajador no-dueño no ve Editar.
4. **Historiales Masas/Salidas:** al abrir muestran **hoy** con todas sus operaciones; debajo, las **5 fechas anteriores** más recientes y una acción **“Todas las fechas”**. Las fechas pasadas son **solo lectura** y muestran la **vista de compartir por WhatsApp** con el botón Compartir en la fecha seleccionada. Hoy es editable (si el backend lo permite) y también ofrece compartir.
5. **WhatsApp:** toda función de compartir usa la tabla compartida de abreviaturas. Si un producto no tiene abreviatura, se conserva su nombre con el límite existente. Debe haber tests de paridad Android/web.
6. **Fotos del Reporte:** Android incorpora el selector de fotos en creación y edición, como la web (múltiple, hasta 5, JPEG/PNG/WebP/HEIC/HEIF, 5 MB), con compresión Android; el detalle conserva cámara/borrado. La web conserva su selector actual.
7. **Compartir a fleteros:** se restaura en web desde la vista de compartir del Horario; Android ya lo tiene y debe seguir funcionando. Solo fleteros del día con teléfono configurado y asignados.
8. **Dashboard:** las tarjetas de Reporte y Cronograma muestran la vista de compartir del último registro, con Compartir y Editar (dueño/admin); Editar abre la pantalla de creación/edición correspondiente. Aplica a web y Android.
9. **Ayudas:** cada módulo (incluidos los nuevos) tiene botón de ayuda, textos reales y traducidos; no se promete una función inexistente.
10. **Sin release:** no crear tag, asset, ni publicar. No tocar la 0.7.5 ni `packages/backend/apk`. No dejar la contraseña de prueba en archivos, commits, docs, logs, capturas ni reportes.

---

## 1. Estado actual y cambios por requisito

### R1. Salida/Bajas y su Historial accesibles fuera del Dashboard

**Hoy Android:** Salida está en el drawer (`Tab.SALIDA`), pero **Historial de Salidas no existe como destino**; solo se abre desde la tarjeta del Dashboard o desde el botón “Histórico” del lanzamiento. `RolePolicy.EntryPoint.SALIDA_HISTORY` existe pero no se usa.

**Cambios Android** (`MainActivity.kt`):
- Añadir `SALIDA_HISTORY` al enum `Overlay` (líneas ~129-135).
- Añadir `DrawerEntry` “Historial de Salidas” con `RolePolicy.EntryPoint.SALIDA_HISTORY`, icono de historial, `NavTarget(Tab.SALIDA, Overlay.SALIDA_HISTORY)`, después de “Salida / Baixa” (~199).
- Resetear `salidaHistoryOpen = false` al elegir un destino del drawer (~540-544) y en `endSession()` (~332-353).
- `Overlay.SALIDA_HISTORY -> salidaHistoryOpen = true` en `onSelectDrawerEntry` (~553-561).
- `salidaHistoryOpen -> Overlay.SALIDA_HISTORY` en `currentOverlay` (~518-523); añadir también `stockHistoryOpen -> Overlay.STOCK_HISTORY` (hueco existente).
- Strings `nav_salida_history` en `values/strings.xml` y `values-es/strings.xml`.
- Test `MainActivityNavigationTest`: la fila aparece para trabajador/admin y abre el historial; el estado se resetea al cambiar de módulo.

**Criterio:** desde el menú se llega a Historial de Salidas sin pasar por Dashboard; al cambiar de módulo no queda pegado el historial.

---

### R2. Botón de Historial de Salida con el diseño canónico

**Hoy Android:** `SalidaLaunchScreen.kt:67-69` usa `TextButton` (texto plano, 44 dp, sin icono, sin testID). El patrón canónico es `ModuleHistoryButton` (`ui/components/ModuleHelpDialog.kt:156-169`): píldora 36 dp, target 48 dp, icono `ic_history` + texto, `testTag("module-history-pill")`.

**Cambios Android:**
- Reemplazar el `TextButton` por `ModuleHistoryButton`.
- `SalidaHistoryScreen` debe usar `HistoryHeader` (`ui/components/HistoryHeader.kt`) con título, contador, ayuda y “Volver” de 48 dp; no el header casero actual.
- Añadir testTag al botón del header y test de 48 dp/estilo en `ModuleHeaderActionsTest` o `SalidaLaunchScreenTest` (crear esta última).

**Criterio:** el botón de Historial de Salida se ve y mide igual que los de Masas/Cargamento/Reportes/Contagem; el header del historial es el mismo componente.

---

### R3. Lanzar Masas fijo abajo

**Hoy Android:** `MassasLaunchScreen.kt:117-121` envuelve **toda** la pantalla en `verticalScroll`; el botón Lançar está dentro de la tarjeta PASO 2 (`:323-345`) y puede quedar lejos. Salida sí tiene el pie fijo (`SalidaLaunchScreen.kt:86-149`).

**Cambios Android:**
- Estructurar `MassasLaunchScreen` como `Column(fillMaxSize) { header/banners; Box(weight(1f)) { Column(verticalScroll) { ... } }; LaunchBar(fixed) }`.
- Mover el resumen y los botones Limpar/Lançar a una barra fija fuera del scroll, con `Surface`/elevación y `testTag("massas-launch-bar")`.
- Corregir los comentarios que dicen “sticky” sin serlo (`:351-352`, `:654-655`).
- Test que verifique que la barra no se desplaza y que Lançar está visible con la lista larga.

**Criterio:** con 10 productos y todos los pasos abiertos, Limpar/Lançar siguen visibles abajo, como Salida.

---

### R4. Historial de Masas: hoy + 5 fechas + todas; pasado read-only/share

**Hoy Android:** `MassasHistoryScreen` es una lista plana de días con `HistoryHeader` y ayuda. Al entrar no inyecta hoy si no tuvo lanzamientos. Al elegir un día, `MainActivity.kt:488-495` pone `massasDayFromHistory = !isToday`; `MassasLaunchScreen` solo dibuja las secciones PASO 3-6 y el share cuando `onBackToHistory != null` (`:353`, `:656-661`). Resultado: **hoy no se puede compartir ni editar/borrar desde el historial**, y no hay chips de 5 fechas ni “todas”.

**Cambios Android:**
- `MassasHistoryScreen`: chip “Hoy” siempre presente (aunque el endpoint no lo devuelva), hasta 5 fechas anteriores y acción “Todas las fechas” que expanda el listado completo. Mantener el listado de tarjetas como vista “todas”.
- Desacoplar “día leído del historial” de “mostrar secciones”: pasar un `origin: LAUNCH|HISTORY` o `showDaySections` explícito. El historial de hoy debe mostrar PASO 3-6, edición/borrado según `isReadOnly` y el share; el pasado debe ser read-only y mostrar el share.
- No usar `onBackToHistory == null` como condición para ocultar secciones; usar `origin`/`readOnly`.
- Añadir testIDs: `massas-history-today`, `massas-history-chip-<date>`, `massas-history-all`, `massas-history-share`.
- Tests: hoy muestra operaciones y share; una fecha pasada es read-only y muestra share; “Todas” lista el resto; no se puede mutar pasado.

**Criterio:** mismo comportamiento que la web: hoy con operaciones y share, 5 anteriores, acceso a todas, pasadas read-only con ShareCard/WhatsApp y botón Compartir.

---

### R5. Historial de Salidas: mismo comportamiento

**Hoy Android:** `SalidaHistoryScreen` es una lista plana de movimientos; `SalidaRepository.history()` aplana días (`:153-155`) y pierde fecha/total; no hay selección de día, read-only, ShareCard, fotos ni filtros; el estado de carga no se dibuja; no hay tests de UI.

**Cambios Android:**
- `SalidaRepository.history()` debe devolver `SalidaHistoryDay` con `date`, `total_units`, `movements` (el contrato ya lo trae).
- Reescribir `SalidaHistoryScreen` con `HistoryHeader` + chip Hoy + 5 fechas + “Todas” + filtro de bloque.
- Día seleccionado: operaciones del día, solo lectura si es pasado, `SalidaWhatsAppShare` (preview + botón WhatsApp) con la tabla de abreviaturas, y botón Compartir en la fecha.
- Añadir fotos/reenviar solo si el alcance lo permite; como mínimo conservar el comportamiento actual y no romper.
- Mostrar spinner y error; testIDs `salida-history-today`, `salida-history-chip-<date>`, `salida-history-all`, `salida-history-share`, `salida-history-readonly-note`.
- Tests UI: hoy, pasada read-only, compartir, “Todas”, estados de carga/error.

**Criterio:** el Historial de Salidas se comporta como el de Masas y como la web: hoy con operaciones, 5 anteriores, todas, pasadas read-only/share.

---

### R6. Crear el módulo Historial de Salidas en el menú

Ya cubierto por R1: destino propio en el drawer, string, reset, overlay, acceso directo. Verificar que web ya lo tiene (`AppShell.tsx:120-122`) y que Android queda igual.

---

### R7. Relatório: incluir Salida/Bajas en el formulario (no solo detalle)

**Hoy Android:** `SalidaReportCard.kt` existe y se pinta **solo** en `ReportDetailScreen.kt:174-177`. El formulario `ReportGeneratorScreen.kt` no lo tiene, aunque la web sí lo pinta antes de guardar (`ReportsPage.tsx:342-344, 399-406`) y el texto de WhatsApp ya incluye las salidas (backend).

**Cambios Android:**
- Extraer/renombrar a `SalidaReportSection` y montarlo en `ReportGeneratorScreen` después de `ErpMovementsCard`, como `item`.
- Añadir `salidaDay`, `salidaLoading`, `salidaError`, `refreshSalidaDay()` al `ReportGeneratorViewModel` (copiar de `ReportDetailViewModel.kt:153-160`), llamarlo al resumir y tras `syncErp`.
- Mostrar `operator.name` y `(username)` como la web, no solo username; spinner, error real, vacío y total; `testTag("report-salida-block")`.
- No duplicar el bloque en el detalle: reutilizar el mismo componente.
- Tests: el formulario muestra la tarjeta; el operador Gustavo H aparece como Gustavo; el error no se muestra como día vacío; el total coincide.

**Criterio:** quien crea un Reporte ve las salidas del día antes de guardar, igual que la web.

---

### R8. WhatsApp: usar la tabla de abreviaturas en todos los shares

**Hoy Android:** Masas usa `WhatsappAbbreviations` explícitamente; Reportes/Horario/Cronograma usan el texto del servidor (correcto). **Stock y Assaí** construyen el mensaje con nombres crudos (`StockMessages.kt:28`, `AssaiOrder.assaiMessage`). Salida no tiene share. La web tiene la misma deuda en Stock/Assaí.

**Cambios:**
- Android: inyectar `WhatsappAbbreviationsSource` en `StockViewModel`/`AssaiViewModel` y aplicar `shortName(code, name)` al construir los mensajes; conservar el límite de 20 caracteres y el fallback.
- Android: al implementar `SalidaWhatsAppShare`, usar la tabla.
- Web: extender `stock.ts` y `assai.ts` para usar `abbreviateProduct`/`abbreviateTask` de la tabla compartida, con los mismos fallbacks; actualizar goldens/parity tests.
- Añadir tests de golden Android y web para Stock/Assaí; el test de paridad del JSON ya existe y debe seguir verde.

**Criterio:** ningún share de producto envía nombres completos si la tabla tiene una abreviatura; Masas/Reportes/Salida/Horario no cambian.

---

### R9. Botón Salvar Relatório fijo

**Hoy Android:** `ReportGeneratorScreen.kt:93-96` usa un `LazyColumn` raíz; el botón Salvar es el último `item` (`:281-289`) y se va con el scroll. `ReportEditScreen.kt` repite el patrón. La web tampoco lo tiene fijo.

**Cambios Android:**
- `Column(fillMaxSize) { LazyColumn(weight(1f)) { ... } ; Surface(fixed) { AdminPrimaryButton(Salvar) } }`.
- Lo mismo en `ReportEditScreen` (“Actualizar”).
- `testTag("report-save-bar")`; test de que el botón no se desplaza y está visible con el formulario largo.
- Web: hacer sticky el bloque de guardar de `ReportsPage` y `ReportEditPage` con el patrón de `SalidaSummaryBar` (`sticky bottom-0`) para paridad.

**Criterio:** Salvar está siempre visible abajo, como Lanzar de Salida; no tapa campos ni el teclado.

---

### R10. Horario: botón Salvar Horario y vista de compartir al guardar

**Hoy Android:** `LoadingScreen` no tiene botón Salvar; solo “Gerar texto”, copiar/compartir/PDF y fleteros. `LoadingShareScreen` existe, pero solo se abre desde el historial; desde la grilla no se llega. La web sí tiene `loading-save-btn` (no fijo), que abre la ShareCard.

**Cambios Android:**
- Añadir `AdminPrimaryButton`/botón “Salvar Horario” fijo al pie de `LoadingScreen`, deshabilitado si no hay filas; string `loading_save` en ambos locales.
- Al pulsar: abrir `LoadingShareScreen` del día actual (`loadingShareDay = today` o `state.date`), con `ShareCardMode.SAVED`, `onEdit` visible para quien pueda editar, PDF/Compartir/Volver.
- En `LoadingShareScreen`, `onEdit` no debe ser siempre null; en modo día ofrecer Editar; en modo histórico mantener `null`.
- TestIDs `loading-save-btn`, `loading-share-back`, `loading-share-edit`; tests de visibilidad fija, apertura y edición.
- Web: mantener/ajustar `loading-save-btn`; el usuario no lo veía: verificar que no esté oculto por read-only y que sea visible/fijo en el día; no mostrarlo en histórico.

**Criterio:** el día se cierra con un botón Salvar visible y se abre la vista de compartir; el histórico sigue read-only.

---

### R11. Compartir el Horario a fleteros con teléfono configurado

**Hoy Android:** cumple: `LoadingViewModel.fleterosWithPhone()` toma fleteros del día, con teléfono, y `openWhatsAppFor` abre el chat. Matiz: la lista solo se dibuja si `exportText != null` (hay que generar el texto antes); al añadir Salvar se resuelve.
**Hoy web:** la lógica existe en `ScheduleExportView.tsx:39-46, 182-205`, pero **el modal no se abre** (`exportOpen` queda en false); se perdió con `5bbcac9` al pasar a ShareCard.

**Cambios web:**
- Restaurar la puerta: en la ShareCard del Horario, añadir un bloque/botón “Enviar a fleteros” que muestre los fleteros con teléfono del día (footer), o un botón que abra `ScheduleExportView`; no enviar a números sin teléfono.
- TestIDs `loading-export-fletero-<id>`, test de que cada uno abre `wa.me` con el texto del horario; no mostrar si no hay fleteros con teléfono.
- Android: mover la lista de fleteros fuera del `let` de `exportText` o hacer que Salvar cargue el texto; mostrar disabled si no está listo. Mantener tests.

**Criterio:** ambos permiten compartir a cada fletero seleccionado con teléfono; sin teléfono no aparece; no se rompe el share general.

---

### R12. Relatório: incorporar fotos en creación/edición

**Hoy Android:** fotos solo en el detalle (cámara, subir, borrar); el formulario de creación y la edición no tienen selector. La web sí tiene selector múltiple en creación/edición (hasta 5, 5 MB, JPEG/PNG/WebP/HEIC/HEIF), sin `capture` ni compresión cliente.

**Cambios Android:**
- Nuevo `ReportPhotosSection`/`ReportPhotoPicker` para creación y edición: `PickMultipleVisualMedia` (galería) + cámara opcional; máximo 5; compresión con `AndroidPhotoCompressor`; previews/borrado; errores de límite.
- Estado `pendingPhotos` en `ReportGeneratorViewModel`/`ReportEditViewModel`; tras crear/actualizar, subir con `ReportsApi.attachPhoto`.
- Tests: selección múltiple, máximo 5, compresión, subida tras guardar, borrado, HEIC/JPEG; testTags `report-photo-input`, `remove-pending-photo-btn`.
- Web: conservar el comportamiento actual; si se toca, no perder el múltiple ni los límites. No es requisito agregar cámara/compresión web.

**Criterio:** un Reporte nuevo o editado puede incorporar fotos desde Android como en la web; el detalle sigue mostrando/borrando.

---

### R13. Dashboard: Reporte de hoy y Cronograma activo con ShareCard + Compartir/Editar

**Hoy Android:** la tarjeta de Reporte abre el detalle (`mode=null`) y no tiene Compartir/Editar; la de Cronograma abre el día y tiene “Enviar pelo WhatsApp” (chooser, no ShareCard), sin Editar ni nota. **Hoy web:** la tarjeta de Reporte enlaza a `/reports/:id` y no tiene Compartir/Editar; la de Cronograma tiene Compartir pero no Editar ni vista previa.

**Cambios Android:**
- Reporte: abrir `ShareCard` del último reporte (`mode=SAVED`) con Compartir, PDF, Editar (solo si `canEdit`), Cerrar; si no hay, abrir lista. No perder el detalle: “Ver detalle” separado si hace falta.
- Cronograma: abrir `LoadingShareRoute(batchDate)` en vez de chooser; ShareCard con Compartir, PDF, Editar (owner/admin), Cerrar; si no, día.
- Editar: dueño o admin; el backend expone `canEdit`; no recalcular solo con rol. Mostrar botón solo si puede.
- Tests: tarjeta Reporte abre ShareCard; botón Editar visible dueño/admin y oculto otro trabajador; Cronograma abre ShareCard; share abre WhatsApp/chooser correcto.
- `testTag("dashboard-report-card")`, `"dashboard-report-share"`, `"dashboard-report-edit"`, `"dashboard-share-active-schedule"`, `"dashboard-active-schedule-edit"`.

**Cambios web:**
- Reporte: enlace a `/reports/:id?share=1` (ShareCard) y acciones Compartir/Editar en la tarjeta; Editar según `canEdit` (dueño/admin).
- Cronograma: acciones Compartir (ShareCard) y Editar (abrir editor) según permiso; no solo link.
- Backend: permitir admin en `history-permissions.ts`/comandos de Reporte y Horario; tests de autorización; actualizar `canEdit` para que la UI lo refleje. Revisar que el admin no pueda editar filas cerradas fuera de ventana si esa regla se mantiene.
- Tests web/E2E: tarjeta Reporte abre ShareCard; Editar dueño/admin; otro trabajador no ve Editar; Cronograma.

**Criterio:** ambas apps muestran la vista de compartir del último Reporte/Horario con Compartir y Editar; el permiso coincide con el backend; un trabajador ajeno no ve Editar.

---

### R14. Ayudas: completar y corregir

**Hoy Android:** hay botón en Dashboard, Reportes, Cargamento, Masas (lanzamiento/histórico), Contagem, Assaí y Compartir App. Faltan: **Salida**, **Historial de Salidas**, **Historial de Reportes**, **Historial de Cargamento**, **Historial de Contagem**. Varias secciones están hardcodeadas en Kotlin (no traducen) y hay textos que prometen funciones inexistentes (`help_massas_step3_desc` “un clic”, share de hoy). Strings `help_reports_history_*`, `help_loading_history_*`, `help_stock_history_*` existen sin usar; no hay `help_salida_*`.
**Hoy web:** botones en casi todos, faltan `ReportViewPage`, `ReportEditPage`, `LoadingEditPage`, `AdminDashboard`, `AuditPage`; textos desactualizados en `moduleHelp.loading` (fecha inexistente), `massasLaunch` (share en histórico), `salida` (fotos después de lanzar), `salidaHistory` (editable, estados reales).

**Cambios:**
- Android: crear `help_salida_*` y `help_salida_history_*` en ambos locales; añadir `ModuleHelpButton` a Salida y a los historiales (usar `HistoryHeader(onHelp=...)`); pasar `onHelp` en Reportes/Cargamento/Contagem; mover secciones inline a recursos; corregir textos.
- Web: añadir ayuda a las cinco pantallas faltantes; corregir los cuatro textos; sumar `salida`/`salidaHistory` a `module-help.test.ts`; revisar que cada ayuda describa lo que la pantalla hace hoy.
- Tests de paridad de locales (`LocaleStringsParityTest`) y de esquema de ayuda web.

**Criterio:** todos los módulos tienen ayuda, en ambos idiomas, y el texto coincide con la UI real.

---

### R15. Salida/Bajas dentro de Relatório: paridad fina con la web

Además de R7:
- Mostrar `operator.name` + `(username)`, no solo username.
- Spinner real, error explícito (no `error = null`), vacío, total, botón refrescar si aplica.
- Mantener el anti-doble-conteo y el matching `GUSTAVO H → Gustavo` ya corregidos en `salida-report.service`; no regresar.
- TestIDs equivalentes a la web: `salida-report-section`, `-refresh`, `-loading`, `-error`, `-empty`, `-operator-<username>`, `-erp-only-<username>`, `-total`.
- Tests Android: Gustavo 6 + Nicolás 1, total 7; error no se muestra como vacío; el formulario lo pinta antes de guardar.

**Criterio:** el bloque Android es equivalente al `SalidaReportSection` web y usa el mismo backend.

---

## 2. Fases de implementación

### F0 — Preparación (sin cambios de producto)
- Crear/actualizar este ODD; baseline de suites Android/web; bump a `0.8.1 (8004)`.
- Verificar que el árbol está limpio y que el backend desplegado incluye el fix de Gustavo.

### F1 — Navegación, botones y ayudas (R1, R2, R3, R6, R9, R10, R14)
- Menú Historial de Salidas, reset de estados, overlay.
- ModuleHistoryButton/HistoryHeader en Salida.
- Barra fija de Masas y Salvar Reporte.
- Salvar Horario + ShareCard del día + Editar.
- Ayudas nuevas/corregidas.
- Tests: navegación, targets 48 dp, barra fija, save, help.

### F2 — Historiales Masas/Salidas (R4, R5, R8 parcial)
- Hoy + 5 + todas; read-only/share; chips/testIDs; repository de Salida por día.
- Share de Salida con abreviaturas.
- Tests UI/unit.

### F3 — Relatório: Salida + fotos (R7, R12, R15)
- Bloque de salidas en creación/edición; nombre/error/refresh.
- Selector de fotos múltiple/compresión/subida en creación y edición.
- Tests.

### F4 — Horario: fleteros y web (R11)
- Android: fleteros visibles/disabled; share del día.
- Web: restaurar `ScheduleExportView` en la ShareCard; tests; no perder el share general.
- Web: sticky Salvar Horario/Reporte si aplica.

### F5 — Dashboard y permisos (R13 + backend)
- Admin puede editar Reporte/Horario; `canEdit` coherente; UI dueño/admin.
- Tarjetas de Reporte/Cronograma con ShareCard/Compartir/Editar; web y Android.
- Tests de autorización y UI/E2E.

### F6 — Abreviaturas restantes y cierre (R8)
- Stock/Assaí Android y web con la tabla; goldens.
- Revisar todos los shares; no dejar nombres crudos donde haya abreviatura.

### F7 — Build, instalación y verificación
- Backend/web tests, build, CI, deploy `api+web`.
- Android: unit + Compose/instrumented, lint, build, `adb install -r` en `emulator-5554`.
- Capturas de cada punto (Dashboard, menú, Salida, Masas hoy/pasado, Salidas hoy/pasado, Reporte creación con fotos/salidas, Horario con Salvar/fleteros, Reportes/Cronograma tarjetas, ayudas).
- Verificar cada punto contra la web a 390 dp; reportar PASS/FAIL con evidencia.
- Si falla, volver a la fase correspondiente y recompilar; no publicar.

---

## 3. Protocolo de build/emulador

- Host: `/home/wilkin/proyectos/Trindade`; Android SDK `ANDROID_HOME=/home/wilkin/.cache/trindade-android-sdk`; JDK 21.
- Emulador: VM `ubuntu` (10.50.0.3), AVD `Trindade_UX_v030`, adb `~/Android/Sdk/platform-tools/adb`, serial `emulator-5554`.
- Compilar en el host, copiar por `scp` si hace falta, `adb install -r`; abrir `MainActivity`; no dejar procesos de build/servidores colgados.
- Cuenta de prueba: usar las credenciales ya provistas en el hilo **solo en el emulador**; no escribirlas en archivos, commits, docs, logs, capturas ni reportes. Cerrar sesión/limpiar datos si hace falta.
- Capturas en un directorio temporal de la sesión, no en el repo; nombrar por requisito.
- No hacer mutaciones de producción; las pruebas de API son de lectura o contra el entorno de prueba. No crear release/tag/asset.

## 4. Criterios de aceptación global

1. Los 15 puntos están implementados o explícitamente documentados como no aplicables, con evidencia.
2. La APK `0.8.1 (8004)` instala y abre sin crashes en `emulator-5554`.
3. Tests Android/web verdes; CI verde; deploy web/api verificado.
4. Cada pantalla nueva/modificada tiene test de UI y testIDs estables.
5. No se publicó nada; la 0.7.5 sigue intacta; no se guardó la contraseña.
6. El usuario puede verificar en el emulador con una lista PASS/FAIL y capturas.

## 5. Fuera de alcance / notas

- No se cambia la versión publicada 0.7.5 ni `packages/backend/apk`.
- No se agregan módulos nuevos fuera de Historial de Salidas.
- No se rediseña la app; se usa el lenguaje visual existente (píldoras 36/48 dp, ShareCard, HistoryHeader).
- El fix de `salida-report.service` (Gustavo H) ya está desplegado; cualquier cambio de este ODD no debe regresarlo.
- Las decisiones de permisos (admin edita reportes/horarios de otros) deben quedar cubiertas por tests del backend, no solo por la UI.

---

## 6. Addendum — Historiales web hoy + paridad completa de Salidas Android

Reporte adicional del usuario (2026-11-18). Este addendum es parte de la misma directiva y tiene prioridad dentro de F1/F2/F5.

### A. Web · Historial de Cargamento: hoy abre ShareCard con Editar

**Comportamiento pedido:** al elegir el Historial de Cargamento de **hoy**, se muestra la vista de compartir por WhatsApp, con botón **Editar** que abre la vista de edición/creación del horario. Editar solo lo ve el trabajador que creó el horario o un **administrador**; otro trabajador ve únicamente Compartir por WhatsApp. Las fechas pasadas siguen read-only, sin Editar.

**Hoy web:** `LoadingHistoryPage.tsx` calcula `detailHref = affordances.closedDay ? shareHref : /loading/edit?date=...` (ver líneas ~190-215). Para hoy (día no cerrado) el resumen abre el **editor**, no la ShareCard. `LoadingSchedulePage.tsx:210-218` en `fromHistory` solo pasa `onClose`, nunca `onEdit`.

**Cambios web:**
1. `LoadingHistoryPage.tsx`: para **todos** los días, el resumen y el ojo abren `shareHref` (`/loading?share=1&date=<date>&from=history`); no abrir el editor directo. Pasar un flag/consulta de permiso confiable para la ShareCard: `canEdit=1` solo si `batch.canEdit` (el servidor ya lo calcula), o mejor un endpoint/estado del día; no confiar en el query para autorizar, solo para mostrar.
2. `LoadingSchedulePage.tsx`: en la rama `fromHistory`, añadir `onEdit` cuando la fecha sea hoy y el usuario pueda editar (dueño/admin); navegar a `/loading/edit?date=<date>`. En pasado no pasar `onEdit`; en día abierto normal conservar el `onEdit` actual. Etiqueta “Editar”/“Editar horário”.
3. Backend `history-permissions.ts` + `loading.service.ts`: `canEdit` debe ser verdadero para el creador o un administrador en el **día de hoy**; el pasado sigue read-only. Mantener la ventana/closed-day que corresponda y cubrir la decisión con tests. No permitir que un trabajador ajeno vea/ejecute Editar.
4. Tests: `LoadingHistoryPage.test.tsx` (hoy abre ShareCard; otro trabajador no ve Editar), `LoadingSchedulePage.test.tsx` (desde histórico hoy muestra Editar y abre `/loading/edit`; pasado no), backend permission tests; E2E 390 px.

**Criterio:** hoy desde Historial de Cargamento se ve la ShareCard con Compartir y, si corresponde, Editar; otro trabajador solo Compartir; pasado sin Editar.

### B. Web · Historial de Reportes: Editar en la fecha de hoy

**Comportamiento pedido:** el Historial de Reportes ya abre la ShareCard (`/reports/:id?share=1`); falta el botón **Editar** para el reporte de **hoy**, con la misma regla dueño/admin; otro trabajador solo Compartir; pasado sin Editar.

**Cambios web:**
1. `ReportHistoryPage.tsx`: en la tarjeta de hoy, añadir acción Editar (48 px, icono + label) si `r.canEdit` y `r.report_date === today`; abrir `/reports/<id>/edit`. No mostrarla en fechas pasadas.
2. `ReportViewPage.tsx`: en la rama `showingShare && fromHistory`, añadir `onEdit` cuando `report.canEdit` y `report.report_date === today`; navegar a `/reports/:id/edit`. Mantener sin Editar en pasado y en `?share=1` sin `from=history` según corresponda.
3. Backend `history-permissions.ts` / `reports.query.service.ts` / `reports.command.service.ts`: `canEdit` debe reconocer al administrador en el día de hoy, además del creador; no cambiar la inmutabilidad del pasado. Tests de autorización y de que un trabajador ajeno recibe 403/no ve botón.
4. Tests: `ReportHistoryPage.test.tsx` (hoy dueño/admin ve Editar, otro no; pasado no), `ReportViewPage.test.tsx` (ShareCard fromHistory hoy con Editar, pasado sin), backend permissions; E2E.

**Criterio:** el reporte de hoy desde el Historial muestra ShareCard + Editar para dueño/admin; otro trabajador solo Compartir; pasado solo Compartir.

### C. Android · Historial de Salidas: paridad completa, no una lista plana

El usuario confirma que en Android **no vio nunca la vista** del Historial de Salidas y pide paridad completa con la web, **incluida la foto y el botón Compartir**. Esto amplía R5: no basta con una lista de movimientos.

**Referencia web obligatoria:** `packages/frontend/src/pages/salida/SalidaHistoryPage.tsx` y:
- `components/salida/SalidaWhatsAppShare.tsx`: teléfono, preview del mensaje del día y botón WhatsApp; mensaje con abreviaturas.
- `components/salida/SalidaPhotoPicker.tsx` y `SalidaMovementCard.tsx`: fotos por movimiento, cámara/galería, borrar, compartir con fotos.
- `lib/salida.ts`: `salidaDaySummaryText`, `salidaSummaryText`, `filterSessionMovements`, estados ERP, abreviaturas.

**Cambios Android:**
1. `SalidaRepository.history()` debe devolver días completos (`SalidaHistoryDay`: date, total_units, movements), no `flatMap` de movimientos; conservar `day(date)`.
2. Reescribir `SalidaHistoryScreen` con `HistoryHeader` (ayuda, volver), chip **Hoy** siempre, **5 fechas anteriores** y **“Todas las fechas”**; filtro por bloque; spinner/error/vacío; contador de pendientes; estado de outbox si aplica.
3. El día de hoy se muestra con todas las operaciones; las fechas pasadas son **solo lectura** y muestran la **vista de compartir WhatsApp** del día con botón Compartir. El botón Compartir debe estar en la fecha seleccionada, con teléfono y preview, usando la tabla de abreviaturas.
4. Fotos: implementar selector/cámara por movimiento, preview, borrar y subida usando los endpoints ya declarados en `SalidaApi` (`photos`, `uploadPhoto`, `deletePhoto`) y `SalidaRepository`; incluir las fotos en el share (misma semántica que web: si una foto no se puede obtener, se omite sin fallar el mensaje).
5. Compartir/Reenviar: `Share` por movimiento con fotos; `Reenviar ao ERP` para pendientes usando `retryPending`; no ocultar errores.
6. TestIDs Android equivalentes a web: `salida-history-date`, `salida-history-day-<date>`, `salida-history-readonly-note`, `salida-whatsapp-share-card`, `salida-share-day`, `salida-preview-message`, `salida-photo-picker`, `salida-share-<id>`, `salida-resend-<id>`, `salida-pending-count`.
7. Tests: hoy muestra operaciones/Compartir; una fecha pasada es read-only y muestra ShareCard; “Todas” lista el resto; fotos se suben/borran/comparten; reenvío de pendiente; navegación desde el menú (R1) y desde Dashboard.
8. No duplicar el módulo: el menú R1 debe abrir esta pantalla; no dejar una segunda ruta.

**Criterio:** el Historial de Salidas Android se siente y opera como el web: día, fotos, compartir, reenviar, filtros y fechas; no una lista plana.

### D. Fases afectadas

- **F1:** menú/Historial de Salidas y botón canónico; ayuda.
- **F2:** Historial de Salidas Android completo + historial de Masas; compartición con abreviaturas.
- **F5:** web Historial de Cargamento/Reportes hoy con Editar; backend admin; Dashboard y permisos.
- **F7:** capturas/verificación de estos tres puntos, incluida la vista de hoy en web y la paridad Android; PASS/FAIL.

No cambiar el alcance de release: **sin release/tag/asset**.

### E. Registro de aceptación

- **2026-11-18** — el addendum se acepta tal cual y se reparte así: **A + B + backend** (historiales web de hoy con Editar y el `canEdit`
  del servidor) viaja como una unidad propia de web/API en F5; **C** (Historial de Salidas Android completo) reemplaza el alcance
  mínimo de R5 y se implementa en F2, después de que F1 cierre las pantallas de Salida para no chocar archivos. F1 no cambia de
  alcance: menú/Historial de Salidas, botón canónico y ayudas siguen siendo suyos.
- El punto 5 de R5 («como mínimo conservar el comportamiento actual») queda **superado** por C: fotos por movimiento, compartir con
  fotos, reenviar pendientes y ShareCard del día son obligatorios, no opcionales.


---

## 7. Avance de implementación

Registro cronológico: cada fase aparece primero como alcance y después con su cierre. Cuando el mismo nombre
aparece dos veces, **manda la última entrada**; las primeras se conservan como punto de partida, no como estado.

### F0 — cerrada
ODD en el repo y versión por defecto del módulo en **0.8.1 (8004)** (`080d8e6a`). Baseline previa: Android 1433,
backend 983, web node 754 + unit 243. El fix de `GUSTAVO H → Gustavo` ya estaba desplegado y no se tocó.

### F5 (mitad del addendum A+B+backend) — cerrada
- `fd99fac8` — `canEdit` = dueño-en-ventana **o** admin-hoy, con `!isClosedDay`; el calendario manda sobre el reloj.
  Tests de proyección (21 casos) y de rutas: admin edita el día, trabajador ajeno 403, pasado inmutable.
- `af80fe42` — todos los días del Historial de Cargamento abren la ShareCard; `Editar` sólo hoy para dueño/admin
  (→ `/loading/edit?date=`); igual en la tarjeta del Historial de Reportes y en `ReportViewPage` rama `fromHistory`.
- Suites del worker: backend **983**, web node **754**, unit **243**.

### F1 — cerrada (Android)
| Commit | Requisito | Test que lo prueba |
| --- | --- | --- |
| `e4715ec1` | R1/R6 Historial de Salidas en el cajón, overlay, resets, `stockHistoryOpen` | `MainActivityNavigationTest` |
| `1ff84a8c` | R2 píldora `ModuleHistoryButton` + `HistoryHeader` | `SalidaHeaderTest`, `ModuleHeaderActionsTest` |
| `a9069aea` | R3 barra fija de Masas (`massas-launch-bar`) | `MassasLaunchBarTest` |
| `3059695a` | R9 Salvar fijo en Reporte y edición (`report-save-bar`) | `ReportSaveBarTest`, `ReportGeneratorScreenTest`, `ReportEditScreenTest` |
| `ccd0c89f` | R10 Salvar Horario + ShareCard del día con Editar (`loading-save-btn`) | `LoadingSaveBarTest`, `loading.*` |
| `c2446b74` | R14 ayudas de Salida e historial (es/pt) | `LocaleStringsParityTest`, `salida.*` |

Suite completa de Android **verde** al cerrar la fase. Sin build de APK todavía: eso es F7.

**Pendiente de F1**: nada de código. La verificación en emulador de R1/R2/R3/R9/R10/R14 va en F7 con el resto.

### F2 — punto de partida (histórico; cerrada más abajo)
Alcance confirmado por §6 C. Punto de partida exacto:
- `SalidaRepository.history()` devuelve hoy una lista plana de movimientos; debe devolver días (`date`, `total_units`,
  `movements`), que el contrato ya trae.
- `SalidaHistoryScreen` es la lista plana a reescribir: `HistoryHeader` (ya tiene ayuda), chip Hoy, 5 fechas,
  “Todas las fechas”, filtro por bloque, filas por movimiento con estados, fotos por movimiento
  (`SalidaApi.photos`/`uploadPhoto`/`deletePhoto`), ShareCard/WhatsApp del día con la tabla de abreviaturas y
  `Reenviar ao ERP` con `retryPending`.
- TestIDs exigidos: `salida-history-date`, `salida-history-day-<date>`, `salida-history-readonly-note`,
  `salida-whatsapp-share-card`, `salida-share-day`, `salida-preview-message`, `salida-photo-picker`,
  `salida-share-<id>`, `salida-resend-<id>`, `salida-pending-count`.
- Después: F3 (salidas en creación/edición + fotos), F4 (fleteros web + sticky), F5b (tarjetas del dashboard),
  F6 (abreviaturas en Stock/Assaí) y F7 (build 8004, instalación, capturas, PASS/FAIL).

### F2 — cerrada (Android, §6 C / R4–R5)

| Commit | Alcance | Test |
| --- | --- | --- |
| `592ba641` | `SalidaRepository.history()` devuelve días completos; estado con `historyDate`/`historyAll`; pantalla con Hoy + 5 + “Todas”, nota de solo lectura y total del día | `SalidaHistoryDatesTest` (3 casos) |
| `6d7e3d61` | `salidaDaySummaryText` con la tabla compartida + `SalidaWhatsAppShare` (teléfono, prévia, una acción, `wa.me` con respaldo general) | `SalidaDaySummaryTextTest` |
| `5cd892e4` | Fotos por movimiento: `photos`/`attachPhoto`/`deletePhoto`, compresión, previews, borrado, selector y compartir con fotos (`shareTextWithPhotos` = `ACTION_SEND_MULTIPLE` con degradación) | `SalidaMovementCardTest` |
| `d2044d79` | Pendientes (`isPending`), contador y reenvío del día y por movimiento (`retryPending`), filtro por bloque | `SalidaMovementCardTest` (reenvío) |

Suite `salida.*` verde al cerrar la fase. TestIDs de §6 C implementados: `salida-history-today`,
`salida-history-chip-<date>`, `salida-history-all`, `salida-history-readonly-note`, `salida-whatsapp-share-card`,
`salida-share-day`, `salida-preview-message`, `salida-photo-picker`, `salida-share-<id>`, `salida-resend-<id>`,
`salida-pending-count`, más `salida-history-block-*` y `salida-photos-<id>`.

**Pendiente de F2**: R4 (Masas: hoy + 5 + todas con operaciones y share) no se tocó — el histórico de Masas sigue
como lista de días. Va junto con F3 o en una unidad propia.

### F3 — alcance (histórico; slices cerrados más abajo)
Bloque `SalidaReportSection` en `ReportGeneratorScreen`/`ReportEditScreen` (`salidaDay`/`salidaLoading`/`salidaError`
en los ViewModels, como ya hace el detalle), nombre + `(username)`, spinner/error/vacío/total y `testTag("report-salida-block")`;
después el selector de fotos múltiple en creación y edición con compresión y subida tras guardar.

### F2b — cerrada
`9c951de7` — `MassasOrigin` explicito en `MassasLaunchScreen`: hoy abierto desde el historico muestra operaciones,
edicion y share; el pasado, lo mismo en solo lectura. Chips `Hoje` + cinco fechas + `Todas as datas`
(`massas-history-today`, `massas-history-chip-<date>`, `massas-history-all`) con la ventana en funcion pura.
Test: `MassasHistoryWindowTest`.

### F3 slice 1 — cerrada
`3bf6d6b2` — `SalidaReportCard` (la del detalle) montada en `ReportGeneratorScreen` y `ReportEditScreen`, con
`report-salida-block` y `ReportsRepository.salidaDay` por el dia del reporte. Sin dia leido no se dibuja.
Test: `ReportSalidaBlockTest`.

Suite completa de Android **verde** al cerrar estos dos slices.

### F3 slice 2 — cerrada
Fotos en creacion y edicion del Reporte (implementado; ver `ReportPhotosSection`, `pendingPhotos` en
`ReportGeneratorViewModel` y `ReportEditViewModel`, y `ReportPhotosSectionTest` / `ReportGeneratorScreenTest`):
- `pendingPhotos` en `ReportGeneratorViewModel` y `ReportEditViewModel` (JPEG ya comprimidos, tope 5 y 5 MB, error visible).
- `ReportPhotosSection` con `PickMultipleVisualMedia` + camara, compresion por `PhotoCompressor`, previews y borrado
  (`report-photo-input`, `remove-pending-photo-btn`).
- Subida con `ReportsApi.attachPhoto` **despues** de crear o actualizar, cuando el `reportId` ya existe.
- Tests: seleccion multiple, tope de 5, compresion una vez por foto, subida tras guardar, borrado.

### F3 slice 2 — cerrada (F3 completa)
`db63cc78` — `pendingPhotos` en los dos ViewModels del Reporte con tope 5 fotos y 5 MB (rechazo antes del viaje,
mensaje `report_photo_too_big`); `ReportPhotosSection` con `PickMultipleVisualMedia` + `report-photo-input` y
`remove-pending-photo-btn`; foto copiada a la caché antes de comprimir (el permiso del URI no sobrevive al cambio
de app); compresión con `AndroidPhotoCompressor`; subida atada al `reportId` (tras crear o tras actualizar).
Test: `ReportPhotosSectionTest`.
Suite completa de Android **verde** al cerrar F3.

**Nota de colocación**: la sección va al final de la lista del formulario. Delante del bloque de salidas sacaba
de la ventana de composición perezosa textos que los tests del formulario ya buscaban, y además es el último paso
real del operario.

### Resto de la directiva (no empezado)
- **F4** R11: restaurar la puerta a fleteros en la ShareCard web (`ScheduleExportView`), testIDs
  `loading-export-fletero-<id>`; sticky de Salvar/Reporte en web.
- **F5b** R13: tarjetas de Reporte y Cronograma del dashboard con ShareCard/Compartir/Editar en web y Android.
- **F6** R8: Stock y Assaí (Android y web) con la tabla de abreviaturas y goldens.
- **F7**: build **0.8.1 (8004)**, `adb install -r` en `emulator-5554`, capturas 390 dp y PASS/FAIL de los 15 puntos,
  más CI y deploy api+web.

### F4 — mitad web (fleteros) cerrada
`77a5db34` — `Enviar a fleteros` (`loading-share-fleteros`) junto al share general en la ShareCard del Horario.
Causa del sintoma reportado: la vista de compartir retorna antes del `return` principal, y `ScheduleExportView` sólo
se montaba en ese return, asi que abrir el estado no dibujaba nada. Montado tambien en la rama de compartir.
Test: `LoadingSchedulePage.test.tsx` (clic en la puerta -> `loading-export-modal`). Suite unit web **244/244**.

**Pendiente de F4**: sticky del bloque de guardar en web (`ReportsPage` y `ReportEditPage`, patron
`sticky bottom-0` de `SalidaSummaryBar`), con su E2E.

### F5b — cerrada (web y Android)

- Web: `2ce2676f` tarjetas al share; `117da90e` `latestReportCanEdit` + Compartir/Editar del reporte; `27cbe2fd`
  `activeScheduleCanEdit` + Compartir/Editar del lote. Unit web **247/247**, backend **985/985**.
- Android: `9e446745` + `88471c4d` contrato regenerado (artefacto + cliente Kotlin juntos), las dos tarjetas abren
  ShareCard y ofrecen Editar segun el resumen. Tests nuevos en `DashboardScreenTest` (acciones y ausencia para
  quien no puede). Suite completa Android **verde**.
- Regenerar el cliente Kotlin necesita Docker (`ghcr.io/cirruslabs/android-sdk:35`); el primer intento fallo por red
  y el reintento funciono. El fake `FakeSystemApi.summary` gano los dos campos con default false.

### F7 — build e instalación (verificación en curso)

- APK **0.8.1 (8004)** compilada con `-PapiBaseUrl=https://trindademasas.duckdns.org/` e instalada en
  `emulator-5554` (verificado por `dumpsys`: `versionName=0.8.1`, `versionCode=8004`).
- Arranca sin crashes: `mCurrentFocus=com.trindade.app/.MainActivity`, **0** `FATAL EXCEPTION` en logcat.
- Densidad del AVD: `Override density: 443` sobre 1080 px = **390 dp**.
- Capturas en `/tmp/trindade-081/`: dashboard, menú, lanzamiento de Salida e histórico de Salida.

Verificado visualmente hasta acá: **R1** (Histórico de Saídas en el cajón), **R2** (píldora Histórico + Ajuda en el
header de Salida) y **R14** (ayuda de Salida con textos reales en portugués). El histórico de Salida abre en **Hoje**
con sus chips.

**Pendiente**: capturas y PASS/FAIL de R3, R4, R5 (fotos/compartir/reenviar), R7, R9, R10, R11, R12, R13, R15; suite
completa de Android, CI y deploy api+web si corresponde.

### F7 — cierre del gate

- E2E obsoletos corregidos en `dcb00d2b` (solo tests): `history-share-390` ahora exige `report-share-edit` en el
  reporte de hoy, y `loading-history` verifica la ShareCard del lote en vez del editor.
- `massas-report-section:77` y `stock-history:29` **pasan aislados** (9.6 s y 2/2) y fallan solo dentro de la
  corrida completa de CI: interferencia de fixtures, no regresión.
- **CI verde**: run `44459124100`, `verify` + `android` success.
- **Deploy api+web** hecho: `/api/health` ok, bundle `assets/index-BCOgFz_U.js`, contenedores arriba.

**Pendiente de verificación en producción**: R11 (fleteros en la ShareCard del Horario) — el `dist/` local está
viejo y no pude confirmar el chunk desplegado por HTTP; se comprueba con un build local fresco o en el navegador.
Y las capturas/PASS-FAIL de R3, R5, R7/R15, R9, R10, R12, R13 y R14 en los cinco historiales, que el
`uiautomator dump` no permitió tomar.

---

## 8. Addendum 2 — segunda inspección del usuario (barra superior, Massas/Salidas)

La web es la fuente de verdad. Cinco defectos reportados tras probar la 0.8.1 (8004), con sus causas verificadas:

### 8.1 Barra superior y orden del menú
- `MainActivity.TAB_DESTINATIONS` no incluye `SALIDA` ni `SALIDA_HISTORY`: por eso Salida/Bajas y su historial
  no aparecen en la barra superior donde están los demás módulos.
- `DRAWER_ENTRIES` pone `SALIDA_HISTORY` justo después de `SALIDA`, antes de Masas. El usuario pide que el
  **Histórico de Salidas vaya debajo de Histórico de Masas**.
- La web (`AppShell.tsx:100-125`) ordena: Reportes, Cargamento, Masas, Salida, Assaí, Stock, Histórico de Masas,
  **Histórico de Salidas**, Histórico de Contagem, Histórico de Reportes, Histórico de Cargamento.

**Cambio:** añadir a la barra superior **Salida / Baixas** y **Histórico de Salidas** (RolePolicy.EntryPoint.SALIDA /
SALIDA_HISTORY; el historial con `NavTarget(Tab.SALIDA, Overlay.SALIDA_HISTORY)`). En el drawer, mover Histórico de
Salidas justo debajo de Histórico de Masas, manteniendo Salida en Operações. La barra sigue scrollable; seleccionar
el historial abre `salidaHistoryOpen=true`, no el lanzamiento. Tests de navegación y de targets.

### 8.2 Historial de Masas: abrir en Hoy y volver al historial
- `MassasHistoryScreen` es hoy una **lista de días**; al entrar desde el drawer no muestra el día.
- Al elegir una fecha, `MainActivity` pone `tab=MASSAS_LAUNCH` + `origin=HISTORY`; para hoy
  `massasDayFromHistory=false`, así que `onBackMassasLaunchTab` cae en Dashboard/Lanzamiento, no en el historial.
- La web (`MassasHistoryPage.tsx:135-149, 210-217`) abre en `saoPauloToday()` y muestra el día con todos los
  controles; los chips permiten cambiar de fecha.

**Cambio:** al abrir Historial de Masas, mostrar **Hoy** con todas las operaciones, no una lista inicial. El Volver
de la vista de hoy debe volver al **historial de Masas** (lista/Todas las datas), nunca a Lanzamiento. Pasado
read-only con ShareCard/WhatsApp. Mantener chips Hoy + 5 + Todas. No reutilizar `MassasLaunchScreen` como si fuera
el historial: separar las responsabilidades.

### 8.3 Lanzamiento de Masas sin compartir ni gestión de histórico
- `MassasLaunchScreen` todavía monta `MassasWhatsAppShare` cuando `origin == HISTORY` (aprox. 700-706); el usuario
  lo ve en Lanzamiento.
- Lanzamiento de Masas debe tener **solo** grilla/confirmación/barra de lanzamiento: sin share, sin filtros de
  trabajador, sin gestión de pendientes ERP.
- Historial de Masas es donde se ve/filtra por trabajador, se gestiona lo no enviado al ERP y se comparte por
  WhatsApp. Hoy con todos los controles; pasado read-only con share.

### 8.4 Historial de Salidas: hoy operativo y CTA en día vacío
- `SalidaHistoryScreen` devuelve solo un `Text` cuando el día no tiene movimientos y no ofrece ninguna acción.
- La web (`SalidaHistoryPage.tsx:550-568`) muestra un CTA `salida-empty-cta` que navega a `/salida`.
- Añadir el CTA **Lanzar salida** en el día vacío de hoy; `MainActivity` debe pasar `onLaunch` y volver a
  `salidaHistoryOpen=false`. En pasado no mostrar CTA; solo vacío read-only. El día con datos conserva fotos,
  compartir y reenviar pendientes; el pasado read-only con ShareCard/WhatsApp.

### 8.5 Verificación
- Tests de navegación: Salida e Historial en la barra superior; drawer con Historial de Salidas debajo de
  Historial de Masas; cada entrada abre la pantalla correcta.
- Massas: Historial abre Hoy; Volver va al historial; pasado read-only; Lanzamiento sin share/filtros ERP;
  Historial con share/filtros.
- Salidas: día vacío de hoy muestra CTA y abre Lanzamiento; pasado vacío no; fotos/share/retry siguen.
- Capturas en `/tmp/trindade-082/`: barra superior, drawer, Massas Hoy/Historial/Lanzamiento, Salidas Hoy
  vacío/con datos/Pasado y share.
- Bump a **0.8.2 (8005)**, instalar en `emulator-5554`, PASS/FAIL de estos cinco puntos antes de cualquier
  release. Sin release/tag/asset.

### §8 — estado de implementación (fuente de verdad)

| Punto | Estado | Commit / evidencia |
| --- | --- | --- |
| 8.1 barra superior + orden del cajón | **hecho** | `be12ac08`: Salida / Baixas en la fila; Histórico de Salidas movido debajo de Histórico de Masas |
| 8.1-b selección por overlay | **hecho** | `231dcd34`: `selectedTabIndex(row, tab, overlay)`; el historial entra en la fila y no marca el lanzamiento. Test en `MainActivityNavigationTest` |
| 8.2 Historial de Masas abre en Hoy + Volver al historial | **hecho** | `f5a1f04c`: `openMassasHistory` apunta al día de planta; `onBackMassasLaunchTab` vuelve a la lista para cualquier día abierto desde el archivo. **Sin test unitario**: el estado vive en la composición de `MainActivity`; se verifica en el dispositivo (8.5) |
| 8.3 Lanzamiento sin share ni gestión ERP | **hecho** | `MassasLaunchScreen` monta el share **sólo** con `origin == HISTORY`, que es lo que 8.2 pide: la grilla de lanzamiento no lo dibuja (PASS en dispositivo, 0.8.4/8007) |
| 8.4 CTA del día vacío en Salidas | **hecho** | `d48d5431`; `SalidaHistoryEmpty` + `SalidaHistoryEmptyTest` (hoy con CTA, pasado sin CTA) |
| 8.5 bump 0.8.2 (8005) + verificación | **hecho** | el cierre se hizo con **0.8.4 (8007)**, instalada en `emulator-5554`; capturas en `/tmp/trindade-084/` |

> Esta tabla se escribió al abrir §8; la cierra la sección «§8 — cierre verificado en dispositivo (0.8.4 / 8007)»
> de más abajo, que manda sobre ella.

### §8 — cierre verificado en dispositivo (0.8.4 / 8007)

| Punto | Estado | Evidencia |
| --- | --- | --- |
| 8.1 barra superior + cajón | **PASS** | barra con Salida; cajón: Histórico de Massas → Histórico de Saídas → Contagem |
| 8.1-b historial en la fila | hecho (test) | `selectedTabIndex(tab, overlay)` |
| 8.2 Historial de Masas abre Hoy sin grilla | **PASS** | `8ba06b04`; en pantalla: Data de Produção, Produção do dia, Lançamentos Individuais, Resumo Coletivo — sin “Lançar Produção por Caixas” |
| 8.3 Lanzamiento sin share/filtros/ERP | **PASS** | misma captura: nada de lanzamiento en el día del historial; Volver lleva a la lista con chips (`Hoje`) |
| 8.4 CTA día vacío en Salidas | hecho, sin captura | `d48d5431` |
| 8.5 build/install | **PASS** | 0.8.4 (8007) instalada; capturas en `/tmp/trindade-084/` |

**Causa del FAIL anterior**: el gate de la grilla se aplicó al primer `!isReadOnly` (ajustes ERP) y no al segundo, que es el grid de cantidades; y la tarjeta del dashboard entraba por otro camino que el cajón. Ambos corregidos en `8ba06b04`.

**8.4 en dispositivo (0.8.4/8007)**: PASS parcial. El Historial de Salidas abre en `Hoje` con `Nenhuma saída registrada hoje.` y el CTA **`Lanzar salida`** visible (`/tmp/trindade-084/03-salida-vacia-cta.png`). **Sin verificar**: que el CTA abra el lanzamiento y que una fecha pasada vacía NO muestre el CTA — el toque de chip no cambió de día en el intento final.

**8.4 — PASS final**: el estado vacío se extrajo a `SalidaHistoryEmpty(isToday, onLaunch)` y se prueba sin ViewModel
(`SalidaHistoryEmptyTest`): hoy muestra el CTA y el toque llega al callback; el pasado muestra la frase y
`assertDoesNotExist` sobre el CTA. Suite completa de Android verde; CI `44516361297` success (`verify` + `android`).

**Sección 8 cerrada**: 8.1, 8.1-b, 8.2, 8.3, 8.4 y 8.5 en PASS, con la APK `0.8.4 (8007)` instalada en
`emulator-5554`. Sin release, tag ni asset; la 0.7.5 y `packages/backend/apk` intactos.

## 18. Dashboard: la recepción sale del espejo, ya no del checklist

- Backend: `recepcionDone` = productos distintos recibidos hoy según `dayReceipts(db, today)`; `recepcionSynced` dice
  si el día se leyó del ERP. Se retiró `recepcionTotal` (el «18» eran tareas de la categoría 4, que ya no existen
  como lista) y se regeneraron contrato, OpenAPI y cliente Kotlin.
- Web y Android dicen «N mercadorias» cuando hay sincronización y «sem sincronização com o ERP» cuando no; HIGIENE
  conserva su checklist y su total. Tests de backend (dos casos) y de las dos UIs.

## 19. Web: el sync del ERP primero y el botón del archivo como el de Masas

- `ReportsPage`: «Sincronizar com ERP» es la primera opción del formulario, encima de Turno, con una sola instancia;
  el encabezado de las tarjetas conserva el título y las tarjetas su orden.
- `SalidaHistoryPage`: el botón toma el tratamiento canónico de Masas (ámbar compacto, `RefreshCw` con `animate-spin`,
  fila propia, 44 px) y el mensaje del día suma los operarios/productos del ERP que trae `SalidaReportSection`
  (`onDayLoaded`), sin duplicar y con el mismo formato.

## 21. Web: la ventana de respuesta, con forma de producto

- `Dialog` acepta `panelClassName` (foco atrapado, Escape, overlay y retorno de foco siguen siendo suyos).
- `MessageDialog`: panel `max-w-[26rem]`, `rounded-2xl`, `overflow-hidden`, sombra y ring; cabecera tonal
  (`bg-red-50`/`bg-emerald-50`) con icono en badge de 40 px, título de 18 px y X de 44 px con `aria-label`; cuerpo
  `text-[15px] leading-6` con `max-h-[40vh]` y scroll; pie `border-t` con «Cerrar» full-width en móvil y alineado a la
  derecha en escritorio. Sin autocierre y sin usar el color como única señal.
- Títulos por acción desde `ReportsPage`/`ReportEditPage` (`reports.actionSaveFailedReport`/`actionReportSaved`,
  PT/ES). Tests del componente (forma, tonos, dos puertas de cierre, mensaje largo) y del caso de temperaturas con
  título.

## 20. Web: la respuesta de una acción, en ventana

- Nuevo `components/ui/message-dialog.tsx` sobre el `Dialog` accesible existente: título, mensaje, tono error/éxito y
  botón Cerrar, sin autocierre. `ReportsPage` manda ahí la validación de temperaturas, los rechazos del servidor y la
  falta de conexión (la carga fallida se queda en la página); `ReportEditPage` hace lo mismo con su guardado.
- **Pendiente del barrido**: el resto de los módulos web (historiales, Massas, Salida, Loading, Stock, Admin,
  Dashboard) y la auditoría Android de banners inline, para la próxima pasada; el componente ya es el punto único.

## 17. Texto del Relatório: prefijo de bloque en Salidas y sin total de sección

- `export.service.ts`: la sección `📤 *SAÍDAS / BAIXA*` antepone **`EMB.`** a embalagens y **`BOB.`** a bobinas, sin
  prefijo para materia prima, y no lo repite cuando la tabla ya lo trae (`BOB. DISCO` → una sola vez). Se eliminó la
  línea `📊 Total: N un` de esa sección; los totales de otras secciones no se tocaron.
- Golden y `export.service.test.ts` actualizados con el ejemplo exacto (`- EMB. DISCO 400g: 9000 un`,
  `- BOB. ROLO 2kg: 6000 un`, `- BOB. BOBINA ROLO: 10 un`, `- GORDURA: 7 un`) y la ausencia del total.
- Web y Android muestran el texto del servidor tal cual (`GET /reports/:id/export`), así que no hubo cambio de
  cliente.

## 16. Vuelta en la cabecera, ERP en el mensaje del archivo, edición con las tres tarjetas

- **`ShareCardMode.FROM_HISTORY`**: la vuelta pasa a la cabecera izquierda (`share-card-back`) y el botón inferior
  desaparece; `SAVED` conserva su `Cerrar` abajo. Aplica a `ReportDetailScreen` y `LoadingShareScreen` sin cambios
  en esas pantallas.
- **Mensaje del Histórico de Salida**: `salidaDaySummaryText` fusiona los operarios/productos que sólo están en el
  ERP (o que suman a un operario del día) con la misma tabla y formato, sin repetir operario ni producto; sin día
  del ERP el texto no cambia. `SalidaViewModel.dayShareText` toma `salidaDay.operators`.
- **Edición de Relatório**: `ReportEditScreen`/`ReportEditViewModel` muestran `ErpMovementsCard` (Massa do dia +
  Insumos) y `SalidaReportCard` con **un** `Sincronizar com ERP` (`includeExits`), estado de carga y error; el
  `update` no se tocó.

## 15. Miniaturas de fotos en las superficies de compartir (web y Android)

- **Web** (`0e887983`): `ShareCard` acepta `photos` y dibuja una fila de miniaturas **arriba del texto** (`report-share-photos`,
  `report-share-photo-<id>`, `alt`), de solo lectura. `ReportViewPage` pasa las fotos que ya carga (guardado e
  historial); `SalidaWhatsAppShare` acepta fotos y las muestra arriba de la prévia, y `SalidaHistoryPage` le pasa las
  del día elegido, también en el pasado share-only.
- **Android** (`565a213a`): `ShareCard(photos)` y `SalidaWhatsAppShare(photos)` con `PhotoThumbnails`: fila horizontal
  de 56 dp, decodificada con `BitmapFactory` desde la URL pública en IO (sin agregar librería), rectángulo neutro
  mientras carga o si falla. `ReportDetailScreen` pasa `state.photos` y `SalidaHistoryScreen` las del día/movimiento.
- Sin botones de borrar/agregar en las miniaturas; el texto y la lógica de envío no cambian.

## 14. Web: el botón de compartir del Relatório

- **Causa doble** (`3dabc269`): producción servía un bundle viejo (`index-BCOgFz_U.js`, sin el camino de compartir del
  Relatório) y, además, `shareOrCopy` devolvía `failed` sin abrir nada cuando no había hoja nativa y el portapapeles
  faltaba o lo rechazaba.
- **Respaldo explícito**: si las dos vías fallan, el texto viaja en el enlace de WhatsApp
  (`api.whatsapp.com/send?text=…`) y el resultado es `whatsapp`; una ventana bloqueada dice `failed`; el portapapeles
  sigue siendo el camino barato cuando funciona; la hoja descartada no copia nada. La página muestra la nota de cada
  salida y ya no se traga las excepciones.
- **Tests**: 7 casos del ayudante con `node:test` y un caso de la página que aprieta el botón sin `navigator.share` y
  con el portapapeles rechazando.
- **Despliegue**: `docker compose build web && docker compose up -d web`; producción pasó de
  `index-BCOgFz_U.js` a `index-DeDK3alR.js`, y el bundle servido contiene el respaldo (`api.whatsapp.com/send?text=`)
  y la nota nueva (`shareWhatsAppOpened`).

## 13. Salida: sync del ERP (sólo hoy) y pasado sólo con el share

- **Sync del espejo en el Histórico de Salida** (`0fd92282`): botón «Sincronizar com ERP» + bloque del Relatório
  para el día de hoy. Android: `syncSalidaDay()` con `syncDay(..., includeExits = true)`, `reportsRepository.salidaDay`
  y `SalidaErpBlock` (spinner, error de credenciales/red, `474b…`); web: `triggerAeroMovementsSync(includeExits)` y
  `SalidaReportSection` con `refetchKey`. Sin escrituras a Trindade: sólo el espejo y su marca de sync.
- **El pasado es sólo el bloque de compartir** (`0fd92282`), en Masas y Salidas y en los dos clientes: debajo del
  encabezado y sus chips no quedan tarjetas, fotos, filtros, pendientes, nota de solo lectura ni sync. El día vacío
  deja la prévia vacía y el envío deshabilitado.
- **Fotos sólo del dueño** (`2a2d0ab1` + `0fd92282`): Android compara `movement.username` con la cuenta de la sesión
  y no dibuja selector ni borrado ajenos; web hace lo mismo con `canManagePhotos`; el backend responde 403
  `SALIDA_NOT_OWNER` al adjuntar o borrar en un movimiento que no es del llamador (tests de rutas con dos cuentas).

## 12. Remediaciones de la 0.8.5, cuarta pasada

- **Histórico de Salidas, día pasado: el día se lee y el share va al final** (`d0df0fca`). La columna de movimientos
  vivía en un `Column(weight(1f).verticalScroll())` dentro de un contenedor sin altura acotada: se colapsaba y el
  bloque de WhatsApp, dibujado después, quedaba arriba. Ahora el día entero es **un solo scroll** —cabecera,
  estado, tarjetas y, al final, el bloque de WhatsApp—; el día vacío conserva su frase, su CTA en hoy y su bloque
  con prévia vacía. Se quitó el contador del `HistoryHeader` y el total suelto «13 un» encima de las tarjetas: cada
  tarjeta dice sus unidades y su total.
- **Histórico de Masas, día pasado sin sync** (`5fc444e4`). El botón «Sincronizar com ERP» se preguntaba sólo por el
  origen; ahora `offersErpSync(origin, readOnly)` exige histórico **y** día abierto, y `syncAeroDay()` se niega en un
  día cerrado (sin lectura al ERP ni escritura del espejo). Producción, filtro por trabajador, chips de cinco fechas,
  tarjetas y share se conservan; las acciones de fila ya estaban detrás del `readOnly` del día.

## 11. Remediaciones de la 0.8.5, tercera pasada

- **Una sola sincronización del ERP en el Relatório.** La acción vive en el encabezado del bloque
  (`ErpMovementsCard`) y lee el día con `includeExits = true`: refresca massas, insumos y `salidaDay`. Las dos
  tarjetas ya no tienen botón. `ReportDetailViewModel` también refresca `salidaDay` en su sync.
- **Sin «Voltar» redundante.** `HistoryHeader` acepta `onBack` nulo; el día y la lista del Histórico de Masas y el
  Histórico de Salidas ya no lo dibujan. La navegación es la barra superior, «Todas as datas» vuelve al archivo, y
  el atrás físico cierra el archivo de Salidas antes de salir del módulo. Reportes, Cargamento y Contagem lo
  conservan.
- **Pasado verificado en los dos módulos.** Massas: sin grilla de lanzamiento (`origin`), filas sin importar ni
  enviar (`readOnly` del día), producción/filtros/share y chips de cinco fechas. Salidas: tarjetas, nota de solo
  lectura, share y reenvío pendiente, sin CTA en el día vacío; **corregido**: las fotos de un día cerrado se ven
  pero no se agregan ni se borran (el selector y el borrado se pasan sólo para hoy).

## 10. Remediaciones de la 0.8.5 verificadas en dispositivo

Cuatro defectos vistos con la 0.8.5 (8008) instalada en `emulator-5554`, cerrados en un solo slice (`3ef6bb5d`):

- **Relatório: la validación responde en ventana.** `ReportGeneratorViewModel.submit()` deja el mensaje de error en
  el estado cuando faltan lecturas (y `showValidation` para marcar las casillas); la frase ya no se dibuja dentro
  de la lista. `ReportEditViewModel` gana `validation: UiText?` y `dismissMessage()`, su guardado se puede tocar con
  una lectura faltante, y `ReportEditScreen` también responde en `ActionResultDialog`.
- **ERP: dos tarjetas.** `ErpMovementsCard` dibuja “Massa do dia” e “Insumos” como dos tarjetas independientes con
  la forma de `SalidaReportCard`; la sincronización es una sola y cada encabezado la ofrece sobre el mismo
  `onSync` (sin lógica duplicada). La cadena «Movimentações do ERP» quedó sin uso y se retiró.
- **Histórico de Masas en la fila.** La visita al archivo selecciona `Overlay.MASSAS_HISTORY` aunque abra en el día
  de planta (`massasVisitOverlay`), y elegir Lanzamiento suelta `massasDayFromList` para no volver a dibujar el día
  del archivo.
- **Histórico de Saídas: días, no un número.** El subtítulo usa el plural `salida_history_days` («3 dias» /
  «3 días»).

## 9. Auditoría sobre 0.8.4 (8007) — siete defectos

La web es la referencia. Registro de la auditoría del dueño, con lo que hay que tocar.

### P0

- **9.1 Loading** — `LoadingScreen` conserva el flujo viejo (`Gerar texto do WhatsApp`, Copiar, Compartilhar, PDF y
  la lista de fleteros) además de `Salvar Horário`. La web tiene **sólo Salvar** como acción y los fleteros viven
  en la ShareCard. Quitar el bloque viejo; mover los fleteros con teléfono a `LoadingShareScreen`/ShareCard.
- **9.2 Historial de Masas** — la vista de Hoy ya trae producción/filtros/ERP/share, pero **no tiene Volver visible
  ni chips Hoy+5+Todas**; la lista sólo se alcanza con el botón físico. Header "Histórico de Massas" con Volver y
  las fechas rápidas, sin grilla.

### P1

- **9.3 Editar en la ShareCard de hoy** — Historial de Reportes y de Cargamento: falta Editar para dueño/admin en
  la fecha de hoy; el pasado sigue read-only.
- **9.4 Ayudas** — faltan los botones en `ReportsHistoryScreen`, `LoadingHistoryScreen` y `StockHistoryScreen`.
- **9.5 i18n de Salida** — `SalidaLaunchScreen`, `SalidaHistoryScreen` y `ReportPhotosSection` tienen textos en
  español dentro de una app en portugués ("Salida / Baixa", "productos", "Lanzar salida", "Histórico de
  Salidas", "Agregar fotos"). Pasar a recursos PT/ES; el botón de lanzamiento muestra la **cantidad de productos
  distintos** como la web (`Lançar saída (N)`).
- **9.6 Dashboard** — eliminar el aviso `dashboard_deferred_notice` ("Novos módulos..."), que la web ya no tiene;
  revisar rótulos como "Calculador de Estoque" contra la web.
- **9.7 Cierre** — tests/Compose por punto, capturas en `/tmp/trindade-085/`, bump **0.8.5 (8008)**, build e
  instalación en `emulator-5554`, PASS/FAIL módulo por módulo.

Todo pendiente al abrir esta sección; se cierra por slices con su commit.

### Avance

- **P0-1 · hecho (`0ace959d`)** — `LoadingScreen` ya no dibuja `Gerar texto do WhatsApp`, Copiar, Compartilhar,
  PDF ni la lista de fleteros: `Salvar Horário` quedó como única acción del día. Los fleteros con teléfono se
  mudaron a `LoadingShareViewModel` (lee el día y el plantel junto al texto) y `LoadingShareScreen` los dibuja
  junto a la `ShareCard`; un chat que el dispositivo no puede abrir lo dice en su propia línea, sin reemplazar
  el texto. `LoadingViewModel` perdió el flujo de export y los dos renderers que inyectaba. La norma quedó en
  `docs/paridad-android-web.md` (Horario de Cargamento). Evidencia: `:app:testDebugUnitTest` verde, 159+ pruebas
  del paquete `loading` incluidas las nuevas de la grilla y de la pantalla de compartir.
- **Corrección de P0-2 · hecha (`63d2a2b2`)** — los chips no salen del calendario sino del archivo del servidor
  (`/massas-launch/history`), como la web: **Hoje** se dibuja siempre y **Todas as datas** abre el archivo. La
  vista de día comparte el ViewModel del historial, así que abrir el día y volver a la lista cuesta una sola
  lectura. **Regla final de la fila (verificación en 0.8.5, segunda pasada)**: las cinco anteriores son **siempre
  las cinco de calendario** `hoy-1 … hoy-5`, nunca las cinco primeras del archivo -- con un archivo de 18, 17, 16,
  13 y 12/11 la regla vieja se saltaba el 15 y el 14, las dos fechas más recientes que faltaban. Los días del
  archivo fuera de esa ventana viven en «Todas as datas», que no se rellena. `historyQuickDays` es la regla única
  para Masas y Salida; un chip sin producción abre su estado vacío y el pasado sigue read-only.
- **P1-3 · hecho (`31c8477c`)** — `ShareCard` dibuja **Editar** siempre que quien la abre lo ofrezca, en cualquier
  modo; el modo decide la salida (`Cerrar` el día recién guardado, `Volver` la puerta que la abrió). Quién lo
  ofrece es la regla de la web: el informe, `report.canEdit && report_date == hoy` (más siempre el recién
  guardado); el cargamento, hoy con el lote activo, la misma regla que usa su grilla. `Editar` abre el editor del
  día -- en cargamento ya no se limita a cerrar la tarjeta -- y el pasado sigue read-only. Norma en
  `docs/paridad-android-web.md` (§ Históricos). Evidencia: lane `loading`/`reports`/`ShareCard` y suite Android
  completa verdes (`ReportShareEditTest`, `MassasHistory…`, `LoadingShareViewModelTest.canEdit`, `ShareCardTest`).
- **P1-4 · hecho (`778a45cf`)** — `ReportsHistoryScreen`, `LoadingHistoryScreen` y `StockHistoryScreen` tienen el
  botón de ayuda en su `HistoryHeader` y un diálogo por módulo con lo que cada pantalla **hace**: filtrar por día o
  mes; abrir el registro con el texto del servidor, su WhatsApp/PDF y Editar sólo hoy; desactivar/reactivar y
  excluir cuando el servidor lo permite; y, en Contagem, que el día es una lectura y que la corrección se hace en
  la calculadora. Textos en `values`/`values-es` (8 claves por módulo). Cada pantalla tiene su test que abre la
  ayuda, lee dos secciones y la cierra.
- **P1-5 · hecho (`416ef27f`)** — los textos de Salida salieron del código a recursos PT/ES: `SalidaLaunchScreen`
  (título `Saída / Baixa`, bloques, productos/unidades, `Lançar saída`, diálogo de confirmación), `SalidaHistoryScreen`
  (título, vacío de hoy y del pasado, pendientes, data pasada read-only, estados, fotos, compartilhar/reenviar) y
  `ReportPhotosSection` (fotos pendientes, agregar, numeración, remover). El botón de lanzamiento muestra la
  **cantidad de productos distintos** como la web (`Lançar saída (N)`, sin sufijo si no hay): la barra se extrajo a
  `SalidaLaunchBar` (tag `salida-launch`) para poder probar el rótulo sin el ViewModel. Rótulo revisado:
  `Calculador de Estoque` → **`Calculadora de Estoque`** (PT) / **`Calculadora de Stock`** (ES), también en
  `help_stock_title`, y `help_stock_history_title` en ES pasa a «Historial de Conteo». Tests: `SalidaLaunchBarTest`
  (conteo, deshabilitado, en vuelo), `SpanishLocaleResolutionTest` con las claves nuevas en los dos idiomas, y las
  pruebas de Salida alineadas a recursos. **Decisión a confirmar**: la web todavía dice «Calculador de Estoque» en
  los dos locales; Android dice «Calculadora» en PT y «Calculadora de Stock» en ES, sin mezclar el portugués en el
  español.
- **Pendiente**: P1-7.

- **P0-2 · hecho (`6a0a5927`)** — el día que abre el Historial de Massas dejó la barra de la pestaña y trae la
  suya: **Histórico de Massas**, **Voltar** siempre visible (hoy incluido; antes sólo en el pasado) y las fechas
  rápidas **Hoje + 5 anteriores + Todas as datas**, con `MassasHistoryDayHeader` fuera del ViewModel para poder
  probarse. Las cinco anteriores salen del calendario, no del listado: esta superficie abre un día, no el
  archivo, y un día sin lanzamientos tiene su estado vacío. El día elegido viaja a `MainActivity`
  (`onSelectDay`), así que sobrevive a salir de la pestaña. La grilla sigue ausente en `MassasOrigin.HISTORY`;
  producción, filtros, ERP y share quedan como estaban, y el pasado sigue read-only. Evidencia: lane `massas`
  (139 pruebas, incluida `MassasHistoryDayHeaderTest`) y suite Android completa verdes.
