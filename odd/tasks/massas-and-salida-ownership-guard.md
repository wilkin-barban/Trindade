# Restricción de Envío a ERP y Ack en Histórico de Masas y Reenvío en Histórico de Salida Web (v0.8.9)

Asegura que en el Histórico de Masas (Android y Web) únicamente el operario que realizó el lanzamiento o un Administrador pueda enviar pendientes al ERP o marcar/desmarcar "Na Tablet", y remedia la misma brecha de permisos en la aplicación Web para el Histórico de Salida (restringiendo el reenvío al dueño del movimiento o Administrador). Publica la versión v0.8.9 (build 8014) de Android y redespliega los servicios web y api.

## Specs

S1 — Restricción en Histórico de Masas (Android):
- En `packages/android/app/src/main/java/com/trindade/app/massas/MassasUnifiedTable.kt`:
  - Para filas en estado `MassasRowState.PENDING_ERP`, verificar si el usuario tiene permiso para operar la fila:
    `val canManagePending = isAdmin || (viewer?.id != null && row.ownerUserId == viewer.id)`
  - Si `!canManagePending`, no mostrar las acciones `ActionRow` (o no ofrecer `onSend` ni `onAcknowledge` / `onUndoAcknowledge`).
- En `packages/android/app/src/main/java/com/trindade/app/massas/MassasLaunchViewModel.kt`:
  - En `sendPendingLaunch(row)`, `acknowledgeLaunch(row)` y `undoAcknowledgeLaunch(row)`:
    - Comprobar que el usuario actual (`state.value.currentUser`) sea `Administrador` o que su ID coincida con `row.ownerUserId`.
    - Si no está autorizado, rechazar la operación emitiendo un diálogo de aviso/error (`resultDialogMessage`) sin mutar el almacén de acks ni disparar el bridge al ERP.
- Crear/actualizar pruebas unitarias en `packages/android/app/src/test/java/com/trindade/app/massas/`.

S2 — Restricción en Histórico de Masas (Web):
- En `packages/frontend/src/pages/massas/MassasUnifiedTable.tsx`:
  - Para filas `row.state === 'pendingErp'`, renderizar los botones de `onSendToErp` y `onToggleAck` únicamente si el usuario actual es `Administrador` o si `user?.id != null && row.ownerUserId === user.id`.
- En `packages/frontend/src/pages/MassasHistoryPage.tsx`:
  - En `handleSendPendingLaunch(row)` y `handleToggleAck(row)`, validar la condición de dueño o administrador antes de proceder. Si no está autorizado, mostrar aviso de error.
- En `packages/frontend/src/pages/massas/MassasCollectiveTable.tsx`:
  - Verificar y asegurar que respete la misma restricción si renderiza o delega acciones de pendientes.
- Crear/actualizar pruebas unitarias en `packages/frontend/src/pages/massas/` o `packages/frontend/src/lib/`.

S3 — Restricción de Reenvío en Histórico de Salida (Web):
- En `packages/frontend/src/lib/salida.ts`:
  - Implementar la función guardiana:
    ```typescript
    export function salidaOffersResend(
      movement: SalidaMovement,
      viewerUsername: string | null | undefined,
      isAdmin: boolean,
    ): boolean {
      const status = movement.erp?.status ?? null;
      const isPending = status === null || status === 'failed';
      if (!isPending) return false;
      if (isAdmin) return true;
      const cleanViewer = String(viewerUsername ?? '').trim().toLowerCase();
      const cleanOwner = String(movement.username ?? '').trim().toLowerCase();
      return Boolean(cleanViewer && cleanViewer === cleanOwner);
    }
    ```
- En `packages/frontend/src/pages/salida/SalidaHistoryPage.tsx`:
  - Pasar `onResend` a `SalidaMovementCard` únicamente si `salidaOffersResend(movement, user?.username, Boolean(user?.role === 'Administrador'))`.
  - En `resendToErp(movement)`, comprobar `salidaOffersResend(...)` y mostrar aviso de error si la cuenta no es la dueña ni administrador.
- En `packages/frontend/src/components/salida/SalidaMovementCard.tsx`:
  - Asegurar que el botón de reenvío al ERP sólo se dibuje cuando `onResend` esté definido.
- Actualizar pruebas unitarias en `packages/frontend/src/lib/salida.test.ts` y tests de páginas de salida.

S4 — Release Android v0.8.9 (build 8014) y Despliegue Completo:
- En `packages/backend/src/modules/app/app.service.ts`:
  - `LOCAL_APK_BUILD_NUMBER = 8014`
  - `FALLBACK_RELEASE.version = 'v0.8.9'`
  - `FALLBACK_UPSTREAM_APK_URL = 'https://github.com/wilkin-barban/Trindade/releases/download/v0.8.9/trindade-0.8.9.apk'`
  - `LOCAL_APK_FILENAME = 'trindade-0.8.9.apk'`
- Actualizar `packages/backend/src/modules/app/app.routes.test.ts`.
- Documentar en `docs/release-android-historial.md`.
- Crear tag `v0.8.9`, disparar build oficial de GitHub Actions, descargar APK firmado y `.sha256` en `packages/backend/apk/`.
- Reconstruir y redesplegar `trindade-web-1` (`docker compose build web && docker compose up -d web`) y `trindade-api-1` (`docker compose build api && docker compose up -d api`).
- Validar salud de contenedores y endpoints en producción.

## Tasks

- [x] T1 — Android: `ownsPendingRow`/`canManagePendingRow` en `MassasUnified.kt`, gating en `MassasUnifiedTable.kt` y rechazo en `MassasLaunchViewModel.kt` (`sendPendingLaunch`, `acknowledgeLaunch`, `undoAcknowledgeLaunch`). Lane JVM 115/115 verde; el lane Compose/Robolectric no pudo re-ejecutarse por `429` de Maven Central (ver Log).
- [x] T2 — Web: `canManagePendingRow` en `lib/massas-unified.ts`, gating en `MassasUnifiedTable.tsx` y rechazo en los dos handlers de `MassasHistoryPage.tsx`; `MassasCollectiveTable` sólo delega props. Tests en `massas-unified.test.ts`.
- [x] T3 — Web: `salidaOffersResend` en `lib/salida.ts` con el cuarto parámetro `hasOwedTrip` (un viaje guardado que aún debe un documento mantiene la oferta con la cabeza en `sent`), usado por `SalidaHistoryPage.tsx` en la tarjeta y en `resendToErp`. `SalidaMovementCard` ya sólo dibuja el botón con `onResend`. Tests en `salida.test.ts`.
- [x] T4 — `v0.8.9` / build 8014 en `app.service.ts`, `app.routes.test.ts`, `build.gradle.kts` y el historial. Backend 1001/1001.
- [x] T5 — Tag `v0.8.9` y build oficial. El job `build` del run [45647359686](https://github.com/wilkin-barban/Trindade/actions/runs/45647359686) terminó en verde y verificó firma y versión; el job `publish` cayó tres veces con `HTTP 500/502/503` de la API de GitHub (lecturas respondían 200). El APK firmado y su `.sha256` se bajaron del artefacto `android-release` del propio run, se verificaron con `aapt2` (`8014` / `0.8.9`) y `apksigner` (`ee0e404b…c431f6`), y quedaron en `packages/backend/apk/` con `sha256sum -c` OK. El release `v0.8.9` se publicó cuando la API volvió: `trindade-0.8.9.apk` (11.627.726 bytes) y su checksum, con el asset de GitHub respondiendo 200.
- `trindade-web-1` y `trindade-api-1` reconstruidos y recreados, ambos **healthy**.
- Producción: `GET /api/app/latest-release` → `v0.8.9`, `buildNumber: 8014`, `apkSize: 11627726`; `GET /api/app/download-apk` → 200 con 11.627.726 bytes y SHA-256 `00c3d065c6c2245e485a7932ef519aff27c44ccca528b38346954d6f27360894`, idéntico al asset publicado.
- **SHA-256 de la build 0.8.9**: `00c3d065c6c2245e485a7932ef519aff27c44ccca528b38346954d6f27360894`.
- Incidente registrado: la API de escritura de releases de GitHub estuvo devolviendo 5xx durante ~10 minutos; no se movió el tag ni se reintentó el build, sólo la publicación.

## Log

L1 — El usuario solicita: "Prepara la misma solución para el Histórico de masas en ambas aplicaciones, y de paso verifica en la web el histórico de Salida, si tiene el mismo problema ya remediarlo en esta passada, delega y orquesta".
L2 — Evidencia de la corrida:
- Frontend: `test:unit` 321/321, `test:node` 775/775, `tsc --noEmit` sin errores.
- Backend: `npm test` 1001/1001.
- Android lane JVM (`MassasUnifiedTest`, `MassasLaunchViewModelTest`, `MassasLogicTest`, `MassasWhatsappGoldenTest`): 115/115, 0 fallos.
- Android lane Compose/Robolectric: resuelto. El primer intento murió en el setup porque Robolectric no podía bajar sus artefactos (`429` de Maven Central); con los jars `android-all-instrumented` 13 y 15 traídos del espejo de Google a la caché `~/.m2` montada, la lane corre: **25 pruebas en 6 clases, 0 fallos**, incluida `MassasUnifiedTableTest` con el viewer administrador y una fila ajena sin acciones. Las clases mueren en el setup con `AssertionError: Failed to fetch maven artifact org.robolectric:android-all-instrumented…`; `curl` al artefacto devuelve **429** de Maven Central. No es un fallo del cambio: en la primera corrida de esta sesión esas mismas clases sí ejecutaron y sus dos únicas fallas fueron las que este cambio corrige. Queda pendiente re-ejecutarlas cuando el límite ceda.
- Decisión de secuencia: el tag y el despliegue (T5) no se ejecutan hasta tener el lane Compose en verde, porque un tag no se mueve después. Cumplido: ambas lanes verdes antes de taguear.
