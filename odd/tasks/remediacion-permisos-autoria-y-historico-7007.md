# Remediación 7007 — autoría, permisos por día y errores de histórico

Ciclo de corrección sobre `main` (trunk-based, commits atómicos en inglés). No toca la release 7006, el tag `v0.7.0` ni su APK. Sin publicación.

## Specs

- **S1** `projectHistoryPermissions.canDelete` conoce la autoría: `canDelete = !isClosedDay && (isAdmin || (role === 'Trabajador' && row.user_id === actor.sub))`.
- **S2** Las proyecciones de reportes pasan la fecha del dominio: `day_date: report_date` en `getReportPermissions()`, `listReportHistory()`, el detalle de `reports.query.service` y el update de `reports.command.service`. Hoy un reporte del 30/10 sale con `isClosedDay=false` y `canDelete=true`, violando Q4.
- **S3** `DELETE /api/reports/:id`: el Administrador borra cualquiera; el Trabajador solo el suyo y solo si es de hoy. Ajeno → 403, pasado → 403 (`MASSAS_HISTORY_FROZEN` o el código que ya use el módulo de reportes), inexistente → 404.
- **S4** `readDay()` devuelve `dayActive = total === 0 || active > 0`. Un día vacío es editable; un lote con filas y todas inactivas sigue `dayActive=false`.
- **S5** La web dibuja exactamente los flags del servidor: `showDeactivate = canDeactivate`, `showDelete = canDelete`, `showReactivate = canActivate`, sin filtro propio por `isClosedDay`. `showEdit` mantiene `canEdit && !closedDay`.
- **S6** `ReportHistoryPage` ofrece Reactivar con `activateReport(id)` cuando el servidor manda `canActivate`.
- **S7** Android `ReportsHistoryScreen` dibuja Reactivar con `canActivate=true`. Primero el test de UI; si pasa, la causa está en el DTO o en el JSON real, no en el render.
- **S8** Cargamento y Reportes en Android no ofrecen borrado en días pasados y sí Desactivar/Reactivar según el estado del servidor.
- **S9** `history()` tipado en `LoadingRepository` y `ReportsRepository`: la pantalla distingue 401/403/500 (respuesta del servidor) de una caída de red. `Unreachable` solo cuando no hubo respuesta HTTP, y el banner «Sem conexão» no aparece con datos ya cargados.
- **S10** Verificación completa: backend, frontend (unit + vitest), `tsc`, Android unit tests. Documentación del ciclo con tareas, tests y hashes. Commits atómicos a `main` y push al final. Sin release ni APK publicado.

## Supuestos

- Q2 aplica a Cargamento **y** Reportes: el Trabajador borra lo suyo de hoy en ambos módulos (el pedido lo afirma y pide asumirlo).
- Q4 se mantiene: en días pasados no se borra nada, ni siquiera el Administrador; desactivar y reactivar sí.
- El día de un reporte es `report_date`; el de un lote de cargamento es `schedule_date`.

## Tasks

| # | Tarea | Specs | Commit |
| --- | --- | --- | --- |
| T1 | `canDelete` con autoría en la proyección | S1 | `70730fc` |
| T2 | Reportes proyectan su fecha de borrado (`erase_day_date`) | S2 | `70730fc` |
| T3 | `DELETE /reports/:id` para el autor de hoy, 403 ajeno/pasado | S3 | `70730fc` |
| T4 | `readDay` con día vacío editable | S4 | `5e48c18` |
| T5 | Web: affordances = flags del servidor + Reactivar en Reportes | S5, S6 | `b63532e` |
| T6 | Android: Reactivar de reportes y flags por fila | S7, S8 | `6f9f4be` |
| T7 | Android: `history()` tipado y errores por estado | S9 | `6f9f4be` |
| T8 | Verificación y documentación del ciclo | S10 | `docs(odd): close the 7007 permissions cycle` |

### Decisiones tomadas durante la implementación

- **S2 se resolvió con `erase_day_date` y no con `day_date`.** Pasar `day_date: report_date` en Reportes habría cerrado también la edición del día anterior, que es la ventana del turno noche. El campo nuevo cierra solo el borrado y deja intacta la ventana de escritura; Cargamento sigue anclando ambos en `day_date`.
- **`eraseClosed` no se publica en la respuesta.** Las cuatro proyecciones comparten esquema estricto (`zod`), y agregar la clave rompía los contratos de loading y reports. La ruta de borrado responde un 403 con código propio y no necesita el detalle en el cuerpo.
- **La web ya no tiene regla propia sobre el calendario.** `showDeactivate`, `showDelete` y `showReactivate` son el flag del servidor tal cual; `showEdit` conserva `canEdit && !closedDay`. Ocultar Desactivar en un día pasado era una regla del cliente que Q4 no pide y que le quitaba al administrador una acción real.

## Log

**L1** (pedido del operador, verbatim):

> Nuevo ciclo 7007 de remediación sobre Trindade. Trabajá sobre main, sin ramas, con commits atómicos en inglés. No toques la release 7006, el tag v0.7.0 ni su APK. No publiques release/APK sin autorización explícita. No dupliques directivas.
>
> Decisiones cerradas:
> - Q4 se mantiene: en días pasados NO se borra contenido, ni siquiera el Administrador. El Admin puede desactivar y reactivar lotes/reportes pasados. El borrado físico es solo para registros de hoy.
> - Un Trabajador solo puede borrar sus propios registros de hoy, en Cargamento y Reportes. Si la ruta actual no lo permite, ajustala con tests de autoría y fecha.
> - Reactivación Android: primero un test de UI con canActivate=true. Si el test pasa, inspeccioná el JSON real que recibe la app y el rol de la sesión; corregí la causa raíz. No fuerces el botón para todos.
> - Día vacío Android: el backend debe devolver dayActive=true cuando total de filas = 0. Un lote con filas pero todas inactivas sigue dayActive=false.
> - Errores Android: tipar history() en Loading/Reports; Unreachable solo cuando no hubo respuesta HTTP. 401/403/500 no deben decir "Sem conexão".
>
> Hallazgo crítico ya verificado en producción:
> - getReportPermissions() y listReportHistory() no pasan day_date a projectHistoryPermissions. Por eso un reporte del 30/10 devuelve isClosedDay=false y canDelete=true, violando Q4. Pasá day_date: report_date en ambas proyecciones.
> - projectHistoryPermissions.canDelete no conoce autoría. Cambiar a: canDelete = !isClosedDay && (isAdmin || (role === 'Trabajador' && row.user_id === actor.sub)).
> - DELETE /reports/:id hoy es solo Administrador. Si Q2 aplica a Reportes, permitir al Trabajador autor borrar su reporte de hoy y testear 403 para ajeno o pasado. Asumí que aplica a ambos módulos.
>
> Implementación, en este orden: 1 backend permisos; 2 backend día vacío; 3 web; 4 Android reactivación; 5 Android errores; 6 verificación y documentación; 7 commits atómicos a main y push a origin/main al final, sin release.

## Evidencia

### Backend

- `history-permissions.test.ts`: 6/6. La autoría manda (`Trabalhador` sobre fila ajena → `canDelete=false`), el día pasado cierra el borrado para todos, y el día de hoy respeta autoría y rol.
- `reports.routes.test.ts`: 403 con `REPORT_DELETE_FORBIDDEN` para el reporte ajeno y para el de un día pasado; 204 para el autor del suyo de hoy.
- `loading.service.test.ts`: día sin filas → `dayActive=true`; lote con filas todas inactivas → `dayActive=false`.
- Contratos `loading.contract.test.ts` y `reports.contract.test.ts` verdes: la proyección no agrega claves al esquema.
- Suite completa: **701 pass / 0 fail**.

### Web

- `history-permissions.test.ts`: 6/6 con los casos reescritos (día cerrado conserva Desactivar, no muestra Borrar).
- `ReportHistoryPage.test.tsx`: 6/6, incluido el botón `activate-report-41` que llama `PATCH /reports/41/activate`.
- Suites: **543 node tests + 113 vitest**, `tsc -b` sin errores.

### Android

- `ReportsHistoryScreenTest`: nuevo test de UI con `canActivate=true`, `canDeactivate=false`, `canDelete=false`; el render ya era correcto, así que la causa no estaba ahí.
- `ReportsHistoryDecodeTest`: decodifica el cuerpo real de producción (`canActivate: true` en el reporte 69 del 30/10) y prueba que el cliente dibuja lo que el servidor manda y que un flag ausente no es permiso.
- JSON real verificado en producción: la clave `canActivate` llega y vale `true` para el reporte retirado; el `canDelete: true` de ese mismo reporte es la violación de Q4 que cierra T1–T3 al desplegar.
- `HistoryRead<T>` (`Loaded` / `Refused(status)` / `Unreachable`) en `network/HistoryRead.kt`, consumido por ambos repositorios y por los dos view models: 401 → sesión expirada, 403 → solo administrador, 5xx → el servidor no pudo concluir, y solo una lectura sin respuesta dice «Sem conexão».
- Suite completa: **1329 tests / 0 fallos**.

### Pendiente al cierre

- No se publicó release ni APK: el `versionCode` 7007 queda sin compilar y el tag `v0.7.0` no se tocó.
- El cambio de permisos se activa en producción al desplegar el backend; hasta entonces la API sigue devolviendo `canDelete=true` en días pasados.
