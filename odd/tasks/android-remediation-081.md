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
