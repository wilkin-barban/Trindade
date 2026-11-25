# Corrección de Serialización y Reenvío de Bajas / Salida al ERP

Corrección del fallo de serialización JSON en la aplicación Android que impedía enviar bajas a `POST /saidasitem` del ERP Aero32, y aseguramiento del flujo de reenvío de movimientos pendientes para que el usuario pueda sincronizar documentos pendientes al actualizar.

## Specs

S1 — Serialización de SaidaItemPayload:
- Agregar `@Serializable` a `SaidaItemPayload` en `packages/android/app/src/main/java/com/trindade/app/salida/SalidaErpPayload.kt`.
- Asegurar que Retrofit con `kotlinx.serialization` serialice correctamente el payload hacia `POST /saidasitem` sin lanzar `SerializationException`.

S2 — Flujo de Reenvío de Pendientes y Sincronización con el Servidor:
- En `SalidaRepository.kt`: al ejecutarse `retryPending()`, tras enviar exitosamente las bajas al ERP, actualizar el estado en el backend de Trindade invocando `api.recordErpResult(pending.movementId, SalidaErpResultRequest(status = status))`.
- Garantizar que al reenviar, el historial local y remoto refleje el nuevo estado (`sent`) y no continúe mostrando el documento en error.
- Si el outbox local estuviera vacío pero se solicita reenvío para un movimiento con `erp_status == "failed"`, permitir reconstruir los payloads desde los ítems del movimiento para reintentar el despacho al ERP.

S3 — Pruebas Unitarias:
- Agregar prueba unitaria en `SalidaErpPayloadTest` o `SalidaRepositoryTest` comprobando que `Json.encodeToString(payload)` serializa `SaidaItemPayload` con las claves exactas requeridas por Aero32 (`PRO_COD`, `PRO_DES`, `PRO_QTD`, `PED_DTA`, `PED_USU`, `PED_SER`, `PED_DTANOT`, `PED_OBS`, `LOTES`).
- Validar que las suites de backend y frontend sigan pasando al 100%.

S4 — Bump de Build para Auto-Update de Android:
- En `packages/backend/src/modules/app/app.service.ts`: incrementar `LOCAL_APK_BUILD_NUMBER` de `8011` a `8012` para que la app instalada en los teléfonos detecte la actualización disponible en `GET /api/app/latest-release`.

## Tasks

- [x] T1 — `@Serializable` en `SaidaItemPayload` y test de serialización (`SalidaErpPayloadTest`, 2 casos).
- [x] T2 — `retryPending()` registra el veredicto con `recordErpResult` y rearma la cola desde los ítems cuando la cola está vacía y el movimiento quedó en `failed` (`SalidaRetryPendingTest`, 5 casos).
- [x] T3 — `LOCAL_APK_BUILD_NUMBER = 8012` en `packages/backend/src/modules/app/app.service.ts`; las dos aserciones de `app.routes.test.ts` actualizadas.
- [x] T4 — Suites: Android `com.trindade.app.salida.*` 101/101 (1 omitido preexistente), backend completo 998/998, frontend Node 771/771.
- [ ] T5 — Commit atómico en `main` y push a `origin/main` sin `Co-Authored-By`.

## Evidencia

- **S1** — `SaidaItemPayload` lleva `@Serializable` y `@EncodeDefault` en `LOTES`. Sin la anotación, Retrofit serializa el `@Body` en memoria y muere con `SerializationException` antes de tocar la red: eso es exactamente el `AERO_ERP_UNREACHABLE` en 5 ms con HTTP 200 en Trindade. `@EncodeDefault` evita que el valor por defecto omita la clave que el parser de Delphi lee.
- **S2** — `SalidaRepository.retryPending(movement, username)`: extraje `recordVerdict(movementId, outcome)` y lo usan tanto `finish()` como `retryPending()`, así el servidor pasa el documento a `sent`/`partial`/`failed` también en el reenvío. Si `outbox.load()` es null y el llamador pasa un movimiento con `erp.status == failed`, `rebuild()` arma los documentos desde `movement.items` con la **fecha del movimiento** y los guarda en la cola antes de enviar. Un movimiento conciliado o ya enviado nunca se rearma.
- **S3** — Tests nuevos: `SalidaErpPayloadTest` (claves exactas y `LOTES` presente) y `SalidaRetryPendingTest` (veredicto `sent` tras reenvío, rearmado desde ítems con `PED_DTA` del documento, reconciliado no se rearma, cola vacía sin movimiento sigue siendo `Skipped`, y fallo registra `failed` conservando la cola).
- **S4** — `LOCAL_APK_BUILD_NUMBER` 8011 → 8012. **Ojo operativo:** el `buildNumber` publicado solo tiene sentido junto a un APK compilado con `versionCode 8012`; mientras el archivo servido siga siendo la build 8011, `UpdateDetector` verá una actualización permanente. El `versionCode` público no cambia.
- **Contrato de la cola** — `SalidaOutboxStore` implementa el nuevo `SalidaOutboxPort` para poder probar el reenvío con una cola en memoria; Hilt liga el puerto al almacén real en `NetworkModule`.
- **Verificación** — Android en `ghcr.io/cirruslabs/android-sdk:35` (contenedor root, SDK escribible): `BUILD SUCCESSFUL`, `com.trindade.app.salida.*` 101 pruebas, 0 fallos, 1 omitido preexistente; las 7 nuevas pasan. Backend `app.routes.test.ts` 7/7.

## Invariantes

- Trunk-based directo a `main`. Prohibición total de `Co-Authored-By` o autoría de IA.
- Cero alteraciones a esquemas de base de datos ni contratos abiertos.
- Los diálogos modales y mensajes de error en Android se mantienen mediante `ActionResultDialog` / `MessageDialog`, sin texto suelto inline.
