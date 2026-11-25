# Corrección Auto-Update Android y Permisos de Reenvío de Salida (v0.8.8)

Soluciona la falla de instalación de actualizaciones in-app en Android 12+ (bloqueo BAL de PackageInstaller) y restringe el botón de reenvío de pendientes en el histórico de salida al operario dueño del movimiento o administrador, publicando la versión v0.8.8 (build 8013).

## Specs

S1 — Corrección de Instalación In-App en Android:
- En `packages/android/app/src/main/java/com/trindade/app/update/ApkInstaller.kt`:
  - En Android 12+ (API 31+), el intento de instalación desatendida vía `PackageInstaller.Session` con `USER_ACTION_NOT_REQUIRED` delega a `UpdateReceiver`, el cual es bloqueado por Android al intentar iniciar una actividad desde segundo plano (restricción BAL - Background Activity Launch).
  - Reemplazar esa ruta por la invocación directa de `createInstallIntent(apkFile)` con `context.startActivity(intent)` (`Intent.ACTION_VIEW` con `FLAG_GRANT_READ_URI_PERMISSION` y `FLAG_ACTIVITY_NEW_TASK`).
  - Si falta permiso de orígenes desconocidos (`canRequestPackageInstalls() == false`), abrir la configuración del sistema vía `permissionManager.createManageUnknownAppSourcesIntent()`.
- Actualizar pruebas en `packages/android/app/src/test/java/com/trindade/app/update/ApkInstallerTest.kt`.

S2 — Restricción de Reenvío en Histórico de Salida:
- En `packages/android/app/src/main/java/com/trindade/app/salida/SalidaHistoryScreen.kt`:
  - Implementar la función guardiana:
    ```kotlin
    internal fun salidaOffersResend(
        movement: SalidaCreateResponseMovement,
        viewerUsername: String,
        viewerIsAdmin: Boolean,
        isPending: Boolean,
    ): Boolean = isPending && (viewerIsAdmin || movement.owns(viewerUsername))
    ```
  - Asignar `onResend` en `SalidaMovementCard` usando `salidaOffersResend(...)`.
- En `packages/android/app/src/main/java/com/trindade/app/salida/SalidaViewModel.kt`:
  - En `resendPending(movement)`, verificar que el usuario actual tenga autorización (dueño o admin) antes de procesar el reintento.
- En `packages/backend/src/modules/salida/salida.routes.ts`:
  - En `POST /api/salida/:id/erp-result`, verificar que `request.user!.role === 'Administrador' || owner === request.user!.sub`, respondiendo `403` (`NOT_OWNER`) si un operario intenta actualizar el estado de un movimiento ajeno.
- Actualizar pruebas unitarias en Android y Backend (`salida.routes.test.ts`).

S3 — Release Android v0.8.8 y Despliegue en Servidor:
- Actualizar `packages/backend/src/modules/app/app.service.ts`:
  - `LOCAL_APK_BUILD_NUMBER = 8013`
  - `FALLBACK_RELEASE.version = 'v0.8.8'`
  - `FALLBACK_UPSTREAM_APK_URL = 'https://github.com/wilkin-barban/Trindade/releases/download/v0.8.8/trindade-0.8.8.apk'`
  - `LOCAL_APK_FILENAME = 'trindade-0.8.8.apk'`
- Actualizar `packages/backend/src/modules/app/app.routes.test.ts`.
- Documentar en `docs/release-android-historial.md`.
- Taggear `v0.8.8` y disparar workflow de GitHub Actions.
- Descargar APK firmado en `packages/backend/apk/` y verificar con `sha256sum`.
- Redesplegar `trindade-api-1` (`docker compose build api && docker compose up -d api`) y validar endpoints `/api/app/latest-release` y `/api/app/download-apk`.

## Tasks

- [x] T1 — Corrección de `ApkInstaller.kt` para abrir el instalador en primer plano con `ACTION_VIEW`, actualizando `ApkInstallerTest.kt`.
- [x] T2 — Restricción de reenvío en `SalidaHistoryScreen.kt`, `SalidaViewModel.kt`, `salida.routes.ts` y sus respectivos tests unitarios.
- [x] T3 — Metadatos de release en `app.service.ts` (`v0.8.8`, build 8013), `app.routes.test.ts`, historial y commit atómico en `main`.
- [ ] T4 — Tag `v0.8.8`, build y firma oficial en GitHub Actions.
- [ ] T5 — Descarga de APK a `packages/backend/apk/`, redespliegue de `trindade-api-1` y verificación de salud y descarga.

## Log

L1 — El usuario solicita: "Delega, orquesta y deja todo listo para a actualizar en los celulares" tras confirmar que la app descarga la APK pero no la instala, y que cualquier trabajador podía reenviar bajas pendientes ajenas.
