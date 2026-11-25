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
- [ ] T5 — Tag `v0.8.9`, build oficial en GitHub Actions, descarga de APK + hash a `packages/backend/apk/`, rebuild/deploy de `trindade-web-1` y `trindade-api-1`, verificación final.

## Log

L1 — El usuario solicita: "Prepara la misma solución para el Histórico de masas en ambas aplicaciones, y de paso verifica en la web el histórico de Salida, si tiene el mismo problema ya remediarlo en esta passada, delega y orquesta".
L2 — Evidencia de la corrida:
- Frontend: `test:unit` 321/321, `test:node` 775/775, `tsc --noEmit` sin errores.
- Backend: `npm test` 1001/1001.
- Android lane JVM (`MassasUnifiedTest`, `MassasLaunchViewModelTest`, `MassasLogicTest`, `MassasWhatsappGoldenTest`): 115/115, 0 fallos.
- Android lane Compose/Robolectric: bloqueado por el entorno. Las clases mueren en el setup con `AssertionError: Failed to fetch maven artifact org.robolectric:android-all-instrumented…`; `curl` al artefacto devuelve **429** de Maven Central. No es un fallo del cambio: en la primera corrida de esta sesión esas mismas clases sí ejecutaron y sus dos únicas fallas fueron las que este cambio corrige. Queda pendiente re-ejecutarlas cuando el límite ceda.
- Decisión de secuencia: el tag y el despliegue (T5) no se ejecutan hasta tener el lane Compose en verde, porque un tag no se mueve después.
