# Salida y Massas: errores en ventana, acciones ordenadas y exclusión de lo no conciliado

Remediación pedida en wB:p3, misma sesión, web y Android. El usuario reportó errores inline, un Row de acciones
que parte el texto y falta de una salida para borrar lo que el ERP no confirmó. Verificado: el backend ya borra un
lanzamiento de Massas (`DELETE /api/massas/:id`).

## Specs

- **S1.** Android `SalidaLaunchScreen` (`state.notice`) y `SalidaHistoryScreen` (`state.notice`, `SalidaErpBlock(error=state.erpError)`) no dibujan errores como texto: «Reutilizá el patrón de `MassasLaunchScreen`/`ActionResultDialog` para TODO error/éxito de acción y sync (incluido “sin Wi-Fi de la empresa”, “ERP no configurado”, fallo de conexión): diálogo con título, mensaje, botón Cerrar; sacá `erpError`/notices inline de `SalidaErpBlock` y de la pantalla. El texto debe explicar el error; no lo ocultes.»
- **S2.** Web `SalidaHistoryPage` (`erpNote`, `notice`) y `SalidaReportSection` (`failed`) no muestran errores inline: «el fallo de `/reports/day/salidas` y el de `handleSyncErp`/offline abren modal con Cerrar; nada inline.»
- **S3.** Android `SalidaHistoryScreen`: «quitá el texto de pendientes que el usuario citó (`“Saída pendente de envio ao ERP · N”`; si el equivalente local es `salida_history_pending`/“%d pendentes”, eliminá ese label). Conservá la acción de reenvío por movimiento; no borres la capacidad.»
- **S4.** `SalidaMovementCard` no parte el texto de sus acciones: «Rehacé las acciones con `FlowRow`/columna de 2 columnas, botones full-width o wrap correcto, 48 dp, sin texto vertical ni desbordes; dejá lugar para la nueva acción Excluir.»
- **S5.** Backend: «agregá `DELETE /api/salida/:movementId` (mismo prefijo/estilo del módulo) autenticado. Solo el dueño o admin; solo si el movimiento **no está confirmado por ERP** (`erp.status` null/`pending`/`failed`; rechazar `sent`/`reconciled`/`partial` con 409 y mensaje claro). Borrar ítems, fotos (filas y archivos), movimiento y la cola local/outbox asociada si existe; registrar auditoría.»
- **S6.** Web y Android: botón «Excluir» sólo cuando no está conciliado, con confirmación; al confirmar DELETE, refrescar día/share y quitar la tarjeta; «Misma semántica que el borrado de Massas (no borrar conciliados).»
- **S7.** Massas web: `handleDeleteLaunch` no usa `window.confirm` ni `setNotice` inline: «Cambialo a `ConfirmDialog` (o el diálogo de confirmación existente) y a `MessageDialog`/`ActionResultDialog` para el resultado éxito/error, con Cerrar; quita ese `notice` inline para el borrado.»
- **S8.** Massas Android: «Asegurá que el resultado de `deleteLaunch` (éxito o rechazo) salga en `ActionResultDialog` y no en texto inline; eliminá el banner inline equivalente. Conservá la regla de no borrar conciliados y el refresco de la tabla.»

## Tasks

- T1 · S5 · backend: servicio, ruta, auditoría y tests del DELETE de Salida.
- T2 · S1, S3, S4, S6 · Android Salida: diálogos de error, pendientes fuera, acciones en `FlowRow`, Excluir con confirmación.
- T3 · S2, S6 · Web Salida: errores en `MessageDialog`, Excluir con confirmación y refresco.
- T4 · S7 · Web Massas: borrado con `ConfirmDialog` + `MessageDialog`, sin aviso inline.
- T5 · S8 · Android Massas: resultado del borrado en `ActionResultDialog`, sin banner inline.
- T6 · docs/CHANGELOG, suites, build debug, deploy web y verificación HTTP.

## Slice boundaries

- `f848aeb4` · T1 · backend DELETE + contrato.
- `322325ed` · T2 · Android Salida (diálogos, pendientes, FlowRow, Excluir).
- `807fabd0` · T3 · Web Salida (MessageDialog, Excluir).
- `afe15eb9` · T4 · Web Massas (ConfirmDialog + MessageDialog).
- `3524a845` · T5 · Android Massas (resultado en ActionResultDialog).

## Log

- L1. «Remediación **Salida / Bajas + Histórico de Salidas** en wB:p3, misma sesión, web y Android. Cuatro frentes: 1) **Errores de sync/ERP en ventana, no inline (ambas apps)**… 2) **Histórico Android con pendientes**… 3) **Excluir salida no conciliada (web y Android)**… 4) Tests/verificación… No release/tag/asset; no toques 0.7.5 ni packages/backend/apk.»
- L2. «Addendum a la remediación en wB:p3, misma sesión. Además de excluir movimientos de Salida no conciliados, el usuario pide que **también se pueda excluir un lanzamiento (Massas)** en **web y Android**, y que el mensaje de esa exclusión se maneje en **ventana emergente**, no inline.» Backend ya tiene `DELETE /api/massas/:id`.
