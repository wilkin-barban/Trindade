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
- [ ] T3: `SalidaMovementShareTest` con cinco casos (con fotos, sin fotos, descarga fallida, sin hoja del sistema, enlace de WhatsApp) y el flujo del carrete de `SalidaHistoryPhotoPickerTest` actualizado al diálogo. Corrida en curso.
- [ ] T4: Bump de versión a 0.8.10 (8015), changelog, commit atómico en `main` y tag `v0.8.10` (S4).
- [ ] T5: Monitorear GitHub Actions, descargar APK firmado y SHA-256 a `packages/backend/apk/`, verificar endpoints de actualización (S4).

## Log

- Evidencia parcial: la app y los tests de salida compilan; `compileDebugKotlin` tuvo dos errores propios del
  cambio (una función local declarada antes de su launcher y un `publicUrl` no nulo) que ya están corregidos.

- L1: 2026-11-25T16:15:00-03:00 — Usuario reporta: "en el módulo Histórico de salida no puedo compartir por WhatsApp lo lanzado de manera individual, si se puede con el botón al final del módulo para compartir el relatórios de todos los trabajadores, pero el lansado de manera individual no funciona, el botón existe, pero no hace nada, además no existe la posibilidad de tirar foto a los productos lanzado soe compartir los por WhatsApp con su foto, este comportamiento esta correcto en la aplicación web en el mismo módulo, verifica en la aplicación web el comportamiento y verifica el bug que te estoy descriviedo, quiero la paridad y la implementación de esto este módulo de la misma forma que ya existe en la web, realiza la investigacion y entrégame los hallazgos".
- L2: 2026-11-25T16:18:00-03:00 — Usuario instruye: "Delega y orquesta, investiga mientras orquestas si el botón de tirar la foto y el compartir en el módulo de Relatório funcionan en la aplicación Android, investiga si existe algún otro bug como este en la aplicación Android, para corregirlos y remediarlos todos en esta passada".
