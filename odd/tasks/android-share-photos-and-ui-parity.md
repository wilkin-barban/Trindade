# Android: compartir fotos en WhatsApp, selector cámara/galería y paridad UI

Rama: `fix/android-share-photos-and-ui-parity` (desde `6aca28d7` en `main`) · Estrategia de entrega: `ask-on-risk` (~550 líneas estimadas) · Engram mirror: pendiente (el workspace `/home/wilkin/Desktop` resuelve `project="desktop"`) · Runners: Android SDK container (`scripts/ci-android.sh`, `./gradlew testDebugUnitTest --no-daemon`, Robolectric + JVM unit tests).

## Specs

- S1 · Compartir por WhatsApp con foto(s) encima del mensaje en `Relatório` y `Histórico de Salida` (`ShareManager.kt`, `HttpReportPhotoFiles.kt`, `ReportDetailViewModel.kt`, `SalidaViewModel.kt`, `PhotoThumbnails.kt`):
  - En Relatório (`"en el modulo Relatorio, al compartir el Relatorio por whatsapp no coloca la foto encima del mensaje como si lo hace la aplicacion web"`) y en Histórico de Salida (`"en el modulo Historico de salida existe el mismo comportamiento al compartir para whatsapp y el mensaje tiene una foto, no la envia ni la coloca encima del mensaje como si lo hace la aplicacion web"`), las fotos deben descargarse bajo `cacheDir/exports/share-photos/` (cubierto por `file_paths.xml`), evitar colisiones y detectar extensión por MIME/URL.
  - `HttpReportPhotoFiles` y `PhotoThumbnails` deben resolver URLs relativas contra `BuildConfig.API_BASE_URL`, usar `@PublicFileClient` para URLs públicas sin filtrar JWT y `@BackendClient` (`followRedirects(false)`) **solo** contra el origen propio (`API_BASE_URL`) para `/api/...` autenticados cuando `publicUrl` falte o haya expirado (>24 h).
  - `AndroidShareManager.shareTextWithPhotos` debe usar `Intent.ACTION_SEND` con único `Uri` en `EXTRA_STREAM` + `EXTRA_TEXT` cuando haya 1 foto (para que WhatsApp muestre la foto encima del texto) y `ACTION_SEND_MULTIPLE` cuando haya múltiples, añadiendo `ClipData` completo, `FLAG_GRANT_READ_URI_PERMISSION` y `FLAG_ACTIVITY_NEW_TASK` en `createChooser`. Si no llegan fotos en Salida con teléfono cargado, respetar `historyPhone`. Eliminar llamada duplicada `refreshSalidaDay(report)` en `ReportDetailViewModel.load`.
- S2 · Selector reutilizable Cámara + Galería para `Relatório` y `Histórico de Salida` (`PhotoSourcePicker.kt`, `SalidaHistoryScreen.kt`, `ReportDetailScreen.kt`, `ReportGeneratorScreen.kt`, `ReportEditScreen.kt`, ViewModels):
  - Extraer y reutilizar el diálogo dual de Salida (`"en el modulo Relatorio, la opcion de Adicionar fotos solamente me deja seleccionarla de la galeria, esta opcion tiene que ser la misma de Adicionar fotos del modulo Historico de Salida, esta me da la opcion de tirar la foto con las camara del celular o escogerla de la galeria, tenemos que reutilizar esta opcion en el modulo Relatorio para que quede de esta forma, me de las dos opciones"`) sin duplicar lógica entre pantallas.
  - Soportar **Cámara** (`TakePicture` + `newCaptureFile` + `FileProvider`) y **Galería** (`PickVisualMedia` / `PickMultipleVisualMedia`) en `SalidaHistoryScreen`, `ReportDetailScreen`, `ReportGeneratorRoute` y `ReportEditRoute`.
  - Unificar validación `MAX_PHOTO_BYTES` en `ReportEditViewModel.addPendingPhoto` y esperar (`join`/`suspend`) las subidas pendientes en `ReportGeneratorViewModel` y `ReportEditViewModel` antes de completar la navegación post-guardado.
- S3 · Módulo `Compartir` (`ShareAppScreen.kt`, `ShareAppViewModel.kt`, `ShareModels.kt`):
  - Mostrar el resultado de alta/validación de operario y errores de compartir/APK en una ventana emergente (`ActionResultDialog`) en lugar de dibujarlo inline en la pantalla (`"en el modulo de Compartir, al cadastrar un operario para mandarlo por whatsapp, dibuja el mensaje en la aplicacion en ves de mostrar una ventana emergente con el mensaje de exito o error"`).
  - Corregir brechas de paridad detectadas en el módulo: lanzar enlaces externos de forma segura (`ShareManager.openLink` / `try-catch`), consultar `latestRelease` para no mostrar versión fija desactualizada (`v0.5.0`), y en modo usuario existente alinear contraseña temporal válida (`PasswordPolicy`) + persistencia vía `UsersRepository.update` (`PATCH /api/admin/users/:id`) antes de abrir WhatsApp o copiar.
- S4 · Limpieza de texto `"abriendo a converza"` / `"Abrindo a conversa…"` / `"Abrindo o e-mail…"` y lanzamientos externos seguros (`AssaiCalculatorScreen.kt`, `StockCalculatorScreen.kt`, `StockHistoryScreen.kt`, `ShareAppScreen.kt`):
  - Eliminar el texto debajo de Compartir por WhatsApp (`"en el modulo Calculadora Assai, al final del todo, justo debajo del boton de Compartir por Whatsapp, hay un texto que dice (abriendo a converza), esto es un bug que debe corregirce, no debe mostrar este texto"`) y limpiar el mismo patrón en `StockHistoryScreen`, `ShareAppScreen` y el modal bloqueante de `StockCalculatorScreen`.
  - Envolver todo `startActivity` externo en `try/catch` (`ShareManager.openLink` o helper compartido), mostrando aviso modal de error únicamente si falla el lanzamiento o el teléfono es inválido.
- S5 · Remediaciones del barrido en módulos hermanos + Verificación integral (`ReportDetailScreen.kt`, `TimeSlotsAdminScreen.kt`, `ReportForm.kt`, `MassasHistoryScreen.kt`):
  - Llevar `state.message` de `ReportDetailScreen` a `ActionResultDialog` (diferenciando éxito como `report_erp_sync_success` / copia de errores) en lugar de texto rojo inline; quitar duplicidad inline de `TimeSlotsAdminScreen`; localizar nombres de categorías/subtipos/tareas en `ReportForm.kt` (`nameEs` en español, manteniendo `namePt` interno en el payload) y texto `"Últimas datas"` / etiquetas faltantes.
  - Observar RED → GREEN por unidad (`T1`–`T5`), correr suites completas y pasar verificación independiente de solo lectura (`Risk: item 2 (JWT/@BackendClient origen y FileProvider URIs + persistencia de contraseña PasswordPolicy), item 3 (helpers compartidos ShareManager y ReportPhotoFiles)`).

## Tasks

- [x] T1 · S1 · inline · `45587352` · Compartir fotos en WhatsApp (`AndroidShareManager`, `HttpReportPhotoFiles`, `PhotoThumbnails`, `ReportDetailViewModel`, `SalidaViewModel`) + tests
- [x] T2 · S2 · inline · `2bd4b417` · Selector reutilizable Cámara + Galería (`PhotoSourcePicker`) en Salida y Relatório + upload await/`MAX_PHOTO_BYTES` + tests
- [x] T3 · S3 · inline · `568be4d8` · Módulo Compartir: `ActionResultDialog` al registrar/errores, enlace seguro, `latestRelease` y paridad `EXISTING` password + tests
- [x] T4 · S4 · inline · `55566b9c` · Eliminar `"Abrindo a conversa…"` / `"Abrindo o e-mail…"` / `"Abrindo WhatsApp…"` y proteger `startActivity` en Assaí, Stock y Compartir + tests
- [x] T5 · S5 · inline · `bb73c218` · Barrido Android (`ReportDetailScreen` modal, `TimeSlotsAdminScreen`, `ReportForm` + i18n) + tests
- [ ] T6 · S1-S5 · verifier + inline · — · Verificación completa (`ci-android.sh`), revisión independiente de riesgo alto y cierre ODD
- [ ] T7 · S6 · inline · — · Preparar release Android `0.8.12` (`build 8017`), compilar/firmar APK, pasar CI completo, merge/push a `main` + tag `v0.8.12` y desplegar producción (`/api/app/latest-release` listo para actualizar)

## Log

- L1. Auditoría solicitada (2026-11-26):
  «verifica en la aplpicacion Android:
-en el modulo Relatorio, al compartir el Relatorio por whatsapp no coloca la foto encima del mensaje como si lo hace la aplicacion web
-en el modulo Historico de salida existe el mismo comportamiento al compartir para whatsapp y el mensaje tiene una foto, no la envia ni la coloca encima del mensaje como si lo hace la aplicacion web 
-en el modulo de Compartir, al cadastrar un operario para mandarlo por whatsapp, dibuja el mensaje en la aplicacion en ves de mostrar una ventana emergente con el mensaje de exito o error 
-en el modulo Relatorio, la opcion de Adicionar fotos solamente me deja seleccionarla de la galeria, esta opcion tiene que ser la misma de Adicionar fotos del modulo Historico de Salida, esta me da la opcion de tirar la foto con las camara del celular o escogerla de la galeria, tenemos que reutilizar esta opcion en el modulo Relatorio para que quede de esta forma, me de las dos opciones 
-en el modulo Calculadora Assai, al final del todo, justo debajo del boton de Compartir por Whatsapp, hay un texto que dice (abriendo a converza), esto es un bug que debe corregirce, no debe mostrar este texto 

he encontrado todas estos detalles o problemas que tienen que remediarce, investiga todos ellos, y en la investigacion verifica si se me queda algun otro bug o detalle que debe corregirse, realiza la auditoria en modo lectura y entregame los hallazgos y las remediaciones de los mismos»
- L2. Autorización del usuario (2026-11-26):
  «avanza, tienes luz verde»
- Evidencia inicial (`6aca28d7`):
  - Auditoría de solo lectura + verificación directa en `ShareManager.kt`, `ReportPhotoFiles.kt`, `file_paths.xml`, `SalidaViewModel.kt`, `ReportDetailViewModel.kt`, `ShareAppScreen.kt`, `ShareAppViewModel.kt`, `AssaiCalculatorScreen.kt`, `StockCalculatorScreen.kt`, `StockHistoryScreen.kt`, `SalidaHistoryScreen.kt`, `ReportGeneratorScreen.kt`, `ReportEditScreen.kt`, `ReportForm.kt`, `ProfileScreen.kt` y `TimeSlotsAdminScreen.kt`.
  - Clasificación de riesgo: `Risk: item 2, item 3` por uso de `@BackendClient` vs `@PublicFileClient`, permisos `FileProvider` en `cacheDir/exports`, persistencia de credenciales (`PATCH /api/admin/users/:id`) y contrato compartido de `ShareManager` / `ReportPhotoFiles`.
- L3. Autorización de entrega y release (2026-11-26):
  «al finalizar puedes hacer push,  generar la nueva versión Android y dejarlo todo listo para actualizar y probar la nueva relese con las remediaciones»
  → Incluye corte `0.8.12` (`build 8017`), APK firmado en `packages/backend/apk/`, CI completo, merge/push a `main` + tag `v0.8.12` y re-despliegue de `trindade-api-1`/`trindade-web-1` para dejar `/api/app/latest-release` sirviendo la nueva release.
- Pausa solicitada por el usuario (2026-11-26T22:02-03:00 — timer 50 min):
  - Estado exacto en rama `fix/android-share-photos-and-ui-parity`:
    - `T1` RED observado en `task-10340`.
    - `T1` implementaciones ya escritas en working tree: `ReportPhotoFiles.kt`, `ShareManager.kt`, `ReportDetailViewModel.kt`, `SalidaViewModel.kt`, `PhotoThumbnails.kt` (más tests en `ShareManagerTest.kt`, `HttpReportPhotoFilesTest.kt`, `ReportDetailViewModelTest.kt`, `SalidaShareWithPhotosTest.kt`).
    - Pendiente al reanudar `T1`: definir/ajustar `daySharePhotoCandidates()` en `SalidaViewModel.kt`, inyectar `@BackendClient` / `@PublicFileClient` en `MainActivity.kt` (`LocalPhotoByteLoader`), correr `T1` GREEN en `$HOME/.cache/trindade-android-work` y commitear `T1`; luego seguir con `T2` → `T7` y limpiar `$HOME/.cache/trindade-android-work` al cerrar.
