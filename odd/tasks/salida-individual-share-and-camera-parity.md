# Paridad de Compartir con Fotos y Captura Directa de Cámara en Histórico de Salida (Android v0.8.10)

Implementa la paridad con la aplicación Web en el módulo Histórico de Salida de la aplicación Android:
1. Permite compartir por WhatsApp cada movimiento lanzado de manera individual incluyendo su texto formateado y sus fotos adjuntas (descargándolas y enviándolas mediante la hoja nativa de Android hacia WhatsApp).
2. Conecta el callback de compartir individual que estaba descolgado (`{}`) en `SalidaHistoryScreen.kt` / `MainActivity.kt`.
3. Incorpora la captura directa con cámara (`ActivityResultContracts.TakePicture()`) para tirar fotos a los productos lanzados con paridad a la web (`<input capture="environment">`).
4. Publica la versión v0.8.10 (build 8015) de Android y actualiza el artefacto en el backend.

## Specs

S1 — Compartir movimiento individual con fotos en Android:
- En `packages/android/app/src/main/java/com/trindade/app/salida/SalidaViewModel.kt`:
  - Implementar `shareMovementWithPhotos(movement: SalidaCreateResponseMovement, labels: SalidaSummaryLabels = SalidaSummaryLabels()): Boolean`:
    - Genera el texto del movimiento mediante `salidaDaySummaryText(date = movement.movementDate, movements = listOf(movement), abbreviations = abbreviationsSource?.table ?: WhatsappAbbreviations.EMPTY, labels = labels)`.
    - Extrae las URLs públicas o directas de fotos del movimiento: `movement.photos.mapNotNull { it.publicUrl ?: it.url }.filter { it.isNotBlank() }`.
    - Si hay fotos y `photoFiles != null`, lanza corrutina con `shareSalidaWithPhotos(text, urls, shareManager, photoFiles)` (que descarga las fotos a la caché y despacha `shareManager.shareTextWithPhotos(text, files)`).
    - Si no hay fotos o falla la descarga, despacha `shareManager.shareText(text)`.
    - Devuelve `true` si se pudo despachar con `shareManager`.
- En `packages/android/app/src/main/java/com/trindade/app/salida/SalidaHistoryScreen.kt`:
  - Conectar el callback `onShare` de `SalidaMovementCard` directamente a `viewModel.shareMovementWithPhotos(movement, summaryLabels)` (con fallback a `onOpenWhatsApp` si `shareManager` no está disponible).
  - En `MainActivity.kt`:
    - Conectar `onOpenWhatsApp` al pasar los argumentos a `SalidaHistoryScreen` para no dejar lambdas no-op descolgadas.

S2 — Captura directa de cámara ("Tirar foto") en Histórico de Salida (Android):
- En `packages/android/app/src/main/java/com/trindade/app/salida/SalidaHistoryScreen.kt`:
  - Incorporar un launcher para `ActivityResultContracts.TakePicture()` usando `newCaptureFile(context)` en `cacheDir/captures` y `FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)` (siguiendo el mismo patrón que `ReportDetailScreen.kt`).
  - Al pulsar la acción de agregar/tirar foto de un movimiento (`pendingPhotoMovement = movement.id`), lanzar la captura directa de la cámara (o proveer la opción directa de cámara con paridad a web).
  - Al completar la captura (`saved == true`), llamar a `viewModel.attachPhotoFromPath(movementId, file.absolutePath)` para comprimir y subir la foto al movimiento.
  - Asegurar que `SalidaMovementCard` refresque las fotos y permita ver/borrar la foto capturada.

S3 — Tests unitarios y de regresión en Android:
- En `packages/android/app/src/test/java/com/trindade/app/salida/`:
  - Crear/actualizar tests unitarios para `SalidaViewModel.shareMovementWithPhotos` verificando que cuando el movimiento tiene fotos se descarguen y se llame a `shareTextWithPhotos`, y cuando no tiene fotos se llame a `shareText`.
  - Crear/actualizar tests en `SalidaHistoryScreenTest.kt` verificando la acción de compartir individual en la tarjeta de movimiento.
  - Verificar que todos los tests pasen con `./gradlew testDebugUnitTest`.

S4 — Release Android v0.8.10 (build 8015) y actualización en backend:
- Incrementar en `packages/android/app/build.gradle.kts`:
  - `versionCode = 8015`
  - `versionName = "0.8.10"`
- Actualizar `CHANGELOG.md` con los detalles de la versión 0.8.10.
- Realizar commit atómico en `main` sin `Co-Authored-By` ni IA attribution.
- Crear y pushear tag `v0.8.10`.
- Esperar y verificar el workflow de GitHub Actions para el build del APK de release.
- Descargar el APK firmado de GitHub Release a `packages/backend/apk/trindade-0.8.10.apk` y calcular su SHA-256 en `trindade-0.8.10.apk.sha256`.
- Actualizar y reiniciar el contenedor `trindade-api-1` si es necesario, verificando los endpoints `/api/app-update/latest-release` y `/api/app-update/download-apk`.

## Tasks

- [x] T1: `shareMovementWithPhotos` en `SalidaViewModel.kt` (texto de la baja + fotos `publicUrl ?: url`, con caída al texto solo), `onShare` de la tarjeta conectado y `MainActivity` pasando `onOpenWhatsApp` → `viewModel.openWhatsAppLink`.
- [x] T2: `TakePicture()` con `newCaptureFile` (ahora `internal` en `ReportDetailScreen.kt`) y `FileProvider`, más un diálogo de dos puertas — `Tirar foto` y `Escolher do celular` — para no perder el carrete; al volver se llama `attachPhotoFromPath` y una captura cancelada no se confunde con un error.
- [x] T3: `SalidaMovementShareTest` con cinco casos (con fotos, sin fotos, descarga fallida, sin hoja del sistema, enlace de WhatsApp) y el flujo del carrete de `SalidaHistoryPhotoPickerTest` actualizado al diálogo. Suite Android completa: **1.628 pruebas, 0 fallos, 1 omitida**.
- [x] T4: `build.gradle.kts` 0.8.10 / 8015, `CHANGELOG.md`, `app.service.ts` y su test en v0.8.10 / 8015, historial de releases. Commits `247c1be5` y `678b46e2`, tag `v0.8.10` pusheado (run [45691617154](https://github.com/wilkin-barban/Trindade/actions/runs/45691617154)).
- [x] T5: Workflow [45691617154](https://github.com/wilkin-barban/Trindade/actions/runs/45691617154) en verde; release `v0.8.10` publicado. APK y `.sha256` en `packages/backend/apk/` con `sha256sum -c` OK y verificación propia: `versionCode 8015`, `versionName 0.8.10`, firmante `ee0e404b…c431f6`. `trindade-api-1` reconstruido y recreado (**healthy**). Producción: `GET /api/app/latest-release` → `v0.8.10`, `buildNumber: 8015`, `apkSize: 11629050`; `GET /api/app/download-apk` → 200 con 11.629.050 bytes y SHA-256 `240cf5a82eac9c880b3409558a18efc332f50f998fb634666d6ed0d52fbab74b`.
- Nota: la ruta `GET /api/app-update/latest-release` que menciona la spec **no existe** en este backend (devuelve 404). Las rutas reales son `/api/app/latest-release` y `/api/app/download-apk`, y son las que se verificaron.

## Log

- Evidencia: `compileDebugKotlin` y `compileDebugUnitTestKotlin` tuvieron errores propios del cambio —una función
  local declarada antes de su launcher, un `publicUrl` nullable y un import faltante de `viewModelScope`— que quedaron
  corregidos. Un `UncaughtExceptionsBeforeTest` en `SalidaShareWithPhotosTest` se debía a los scopes de view model
  de la clase nueva que no se cancelaban al terminar; se corrigió y la lane quedó limpia.
- SHA-256 de la build 0.8.10: `240cf5a82eac9c880b3409558a18efc332f50f998fb634666d6ed0d52fbab74b`.

- L1: 2026-11-25T16:15:00-03:00 — Usuario reporta: "en el módulo Histórico de salida no puedo compartir por WhatsApp lo lanzado de manera individual, si se puede con el botón al final del módulo para compartir el relatórios de todos los trabajadores, pero el lansado de manera individual no funciona, el botón existe, pero no hace nada, además no existe la posibilidad de tirar foto a los productos lanzado soe compartir los por WhatsApp con su foto, este comportamiento esta correcto en la aplicación web en el mismo módulo, verifica en la aplicación web el comportamiento y verifica el bug que te estoy descriviedo, quiero la paridad y la implementación de esto este módulo de la misma forma que ya existe en la web, realiza la investigacion y entrégame los hallazgos".
- L2: 2026-11-25T16:18:00-03:00 — Usuario instruye: "Delega y orquesta, investiga mientras orquestas si el botón de tirar la foto y el compartir en el módulo de Relatório funcionan en la aplicación Android, investiga si existe algún otro bug como este en la aplicación Android, para corregirlos y remediarlos todos en esta passada".
