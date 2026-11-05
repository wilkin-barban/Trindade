# Refresco del Relatório Android y operarios del espejo ERP — 0.7.4 / 7016

Feature: la vista Android de Relatório deja de mostrar una foto vieja del espejo ERP. El generador y el detalle refrescan las masas del día al reanudar la pantalla y después de sincronizar, muestran a todos los operarios (locales y ERP-only) con su desglose por producto y el resumen colectivo que ya muestra la web, y se entrega como sustitución de assets de la release existente `v0.7.4` con el APK interno 7016, sin tag nuevo.

Entrega: 0.7.4 / 7016 sobre `main`, sin ramas ni worktrees. Tag `v0.7.4` intacto en su commit histórico (`4aef9141`); se reemplazan sus assets con `--clobber`.

## Specs

S1. El generador de reporte refresca las masas del día con una acción explícita y testeable, invocada al entrar o reanudar la pestaña, y también después de una sincronización o de una actualización del espejo. Sin bucles de polling agresivos: el refresco es por evento de ciclo de vida, no periódico. El botón «Sincronizar com ERP» se mantiene.

S2. El detalle del reporte refresca al reanudar o volver a la pantalla, y lo hace sobre `report.reportDate`, nunca sobre la fecha del dispositivo. El generador sigue consultando `saopauloToday()`: esa semántica no cambia.

S3. Todos los operarios se muestran, tanto locales como ERP-only. No se filtra por `onlyErp`, `erpOnly` ni `user_id` en ninguna capa de presentación Android. Prueba UI con varios operarios y al menos un ERP-only.

S4. Un operario que se incorpora al espejo después de la carga inicial aparece tras el refresco. La prueba lo demuestra con una fuente falsa que gana un operario entre la primera lectura y la segunda.

S5. Paridad con la web en la tarjeta de movimientos: operario y totales más el desglose por producto de cada operario y el resumen colectivo del día. Si el backend ya envía esos datos, no se cambia el backend; sólo se dibuja lo que falta, sin romper el layout móvil ni los targets táctiles existentes.

S6. El ODD, `CHANGELOG.md`, los documentos de release (`docs/release-android.md`, `docs/release-android-historial.md`, `docs/auditoria-android.md`) y las notas internas registran la remediación y la sustitución de assets con su provenance.

S7. Sin release ni tag nuevos: `versionName = 0.7.4` y `LOCAL_APK_FILENAME = 'trindade-0.7.4.apk'` no cambian.

S8. `LOCAL_APK_BUILD_NUMBER` sube a **7016** (mayor que 7015) y el APK firmado se compila con `versionCode=7016`. No se crea tag nuevo ni release nueva.

S9. Los assets `trindade-0.7.4.apk` y `trindade-0.7.4.apk.sha256` del release existente `v0.7.4` se reemplazan con `gh release upload v0.7.4 ... --clobber`. El tag sigue apuntando a su commit histórico y no se mueve. El ODD y las notas internas dejan constancia de la sustitución y de su provenance. El buildNumber no se publica como valor en notas públicas.

S10. `/api/app/latest-release` devuelve `version: "v0.7.4"` y `buildNumber: 7016`. La 0.7.4/7015 instalada detecta la actualización por la comparación de buildNumber dentro de la misma versión pública (`SAME_RELEASE_PATCH`), no por tamaño de APK ni por versión pública. Prueba de `UpdateDetector` con 7015 → 7016.

S11. Se reconstruyen las imágenes API y web, se despliegan y se verifica salud, `/api/app/latest-release`, la descarga pública y su sha256. El asset del release coincide byte a byte con el APK que sirve producción.

S12. CI de `main` verde. No se crea tag nuevo ni se toca `v0.7.0`, `v0.7.1`, `v0.7.2` ni `v0.7.3`. No se instala ningún APK en emulador ni en teléfono.

S13. El trabajo corre en ciclos de control de 5 minutos. Si el reemplazo del asset o la actualización 7015 → 7016 no se puede garantizar, el trabajo se detiene y se reporta antes de publicar.

S14. El reporte final incluye ODD, commits, tests, CI, hashes, el asset reemplazado y la confirmación de que 7016 es actualizable desde 7015.

## Tasks

- [x] T1 — Documento ODD con specs, tareas, riesgos y Log. `S1-S14`. Sin commit de código.
- [x] T2 — Android RED generador: refresco explícito al reanudar y un operario que aparece en el espejo después de la carga inicial se ve tras el refresco. `S1, S3, S4`.
- [x] T3 — Android GREEN generador: `refreshMassas()` idempotente, llamada por evento de reanudación y por la sincronización. `S1, S3, S4`.
- [x] T4 — Android RED detalle: refresco al reanudar sobre `reportDate` y operario ERP-only visible. `S2, S3`.
- [x] T5 — Android GREEN detalle: hook de reanudación en `ReportDetailScreen` respetando `report.reportDate`. `S2, S3`.
- [x] T6 — Android RED tarjeta: desglose por producto por operario y resumen colectivo del día. `S5`.
- [x] T7 — Android GREEN tarjeta: `ErpMovementsCard` con desglose y resumen, strings ES/PT. `S5`.
- [x] T8 — Suites afectadas verdes (Android, backend, web) y typecheck. `S1-S5`.
- [x] T9 — Entrega 7016: `app.service.ts` con `LOCAL_APK_BUILD_NUMBER=7016`, test de `UpdateDetector` 7015 → 7016, CHANGELOG, docs de release y notas internas. `S6-S8, S10`.
- [x] T10 — APK firmado 7016, verificación de firma y sha256, reemplazo de assets del release `v0.7.4` con `--clobber`. `S8, S9`.
- [ ] T11 — Imágenes API y web, despliegue, salud, `/latest-release`, descarga y sha256. `S11`.
- [ ] T12 — Push a `main`, CI verde y reporte final. `S12-S14`.

## Riesgos

- R1 (alto, entrega): reemplazar assets de una release ya publicada deja a la planta sin vuelta atrás si el APK nuevo está mal firmado o no actualiza. Mitigación: S10 y S13; verificación de `UpdateDetector`, firma, sha256 y coincidencia byte a byte antes de publicar; el tag no se mueve.
- R2 (alto, contrato): un refresco mal ubicado puede multiplicar lecturas del endpoint o pisar respuestas fuera de orden. Mitigación: refresco por evento de ciclo de vida, sin polling, y estado escrito sólo cuando la lectura devuelve datos.
- R3 (medio, UX): el desglose por producto puede romper el layout móvil. Mitigación: S5, mismas reglas de apilado por ancho que la cabecera de la tarjeta.
- R4 (medio, paridad): la web y Android pueden divergir en el resumen colectivo. Mitigación: los mismos campos del contrato y los mismos casos de prueba.

## Log

L1 — Pedido del usuario (verbatim):

> Trabaja en /home/wilkin/proyectos/Trindade, rama main, sin ramas nuevas. El usuario aprobó la remediación de la vista Android de Relatório: faltan trabajadores que llegaron por el espejo ERP en "Massas do dia". El agente debe investigar y crear el artefacto ODD antes de tocar código, con TDD estricto (RED antes del fix) y paridad web/Android.
>
> HALLAZGOS YA VERIFICADOS
> - Backend `/api/massas-launch/report` devuelve todos los operarios del espejo, incluidos los ERP-only. `massasReportDayView` no filtra por `onlyErp`; los tests backend lo cubren.
> - Web `MassasReportSection` consulta ese endpoint y refresca con `date`/`refetchKey`; se ve correctamente.
> - Android usa el mismo endpoint y `ErpMovementsCard` recorre toda la lista `massasDay.operators`, sin filtro por `onlyErp`. Si faltan trabajadores, es un problema de refresco/estado, no de filtro.
> - `ReportGeneratorViewModel` carga `massasDay` solo una vez en `init` (`loadMassasDay`), no al volver a la pestaña ni cuando el espejo cambia en otro dispositivo; solo se actualiza al pulsar "Sincronizar com ERP". `ReportDetailViewModel` fuerza la carga al entrar, pero no refresca mientras el reporte queda abierto.
> - El generador consulta `saopauloToday()`; el detalle usa `report.reportDate`. No cambiar esa semántica sin justificar.
> - La vista Android muestra operario y total, pero no el desglose de productos por operario ni el resumen colectivo que muestra la web. Si es necesario para la paridad, añadirlo sin romper el layout móvil.
>
> REMEDIACIÓN ESPERADA
> 1. Añadir un refresco explícito y testeable de masas para el report generator (al reanudar/entrar a la pestaña y después de una sincronización/actualización del espejo), sin crear bucles de polling agresivos. Mantener el botón de sincronización.
> 2. Asegurar que el report detail también refresca al reanudar/volver, respetando la fecha del reporte.
> 3. Garantizar que todos los operarios, locales y ERP-only, se muestran; no filtrar por `onlyErp`/`erpOnly`/`user_id`. Añadir prueba UI Android con varios operarios y un ERP-only.
> 4. Añadir prueba que demuestre que un operario incorporado al espejo después de la carga inicial aparece tras el refresco.
> 5. Evaluar/añadir el desglose por producto y el resumen colectivo en Android si falta para paridad; no cambiar el backend si ya envía los datos.
> 6. Actualizar ODD, CHANGELOG, docs y release notes internas.
>
> ENTREGA SIN NUEVO RELEASE NI NUEVO TAG
> - Mantener `versionName = 0.7.4` y `LOCAL_APK_FILENAME = trindade-0.7.4.apk`.
> - Subir `LOCAL_APK_BUILD_NUMBER` a **7016** (mayor que 7015) y compilar el APK firmado con `versionCode=7016`. No crear un tag nuevo ni una release nueva.
> - Reemplazar en el release existente `v0.7.4` los assets `trindade-0.7.4.apk` y `.sha256` con `gh release upload v0.7.4 ... --clobber`; no cambiar el tag, que sigue apuntando a su commit histórico. Dejar constancia de esta sustitución/provenance en el ODD y en las notas internas; no publicar el buildNumber como valor en notas públicas.
> - Actualizar `/api/app/latest-release` para que devuelva `version v0.7.4` y `buildNumber 7016`; la 0.7.4/7015 instalada debe detectar actualización por `SAME_RELEASE_PATCH`/buildNumber, no por tamaño ni por versión pública. Añadir/verificar test de `UpdateDetector` con 7015→7016.
> - Reconstruir imágenes API/web, desplegar y verificar salud, `/latest-release`, descarga y sha256. El asset del release debe coincidir byte a byte con el APK servido por producción.
> - CI de main verde. No crear tag nuevo. No tocar `v0.7.0`, `v0.7.1`, `v0.7.2` ni `v0.7.3`. No instalar APK en emulador/teléfonos.
> - Reportar ODD, commits, tests, CI, hashes, release asset reemplazado y confirmación de que 7016 es actualizable desde 7015.
>
> Trabaja en ciclos de control de 5 minutos. Si el reemplazo del asset o la actualización 7015→7016 no se puede garantizar, detente y reporta antes de publicar.

L2 — Estado del árbol y de las pruebas antes de tocar código (2026-11-04, `main` en `460130d6`):

- `git status` limpio salvo el documento ODD. Sin ramas nuevas ni worktrees.
- Sin SDK de Android en el host: todas las corridas usan el contenedor oficial
  `ghcr.io/cirruslabs/android-sdk:35@sha256:c724009e...` con los cachés `~/.cache/trindade-gradle` y
  `~/.cache/trindade-android-sdk`.
- Tests agregados en RED antes de la implementación: `ReportGeneratorViewModelTest` (reanudación y operario que
  entra al espejo después de la carga inicial), `ReportDetailViewModelTest` (reanudación sobre `reportDate`) y
  `ErpMovementsCardOperatorsTest` (todos los operarios, desglose por producto, resumen colectivo).

L3 — RED observado (`./gradlew :app:testDebugUnitTest`, 54 tests, 5 fallos):

- `ReportGeneratorViewModelTest > an operator that reaches the mirror after the first read appears when the screen resumes`
  → `expected:<[Ana Paula, Beto Souza]> but was:<[Ana Paula]>`.
- `ReportGeneratorViewModelTest > a resume whose read answers nothing keeps the day already drawn`
  → `expected:<2> but was:<1>` (el stub de reanudación no leía).
- `ReportDetailViewModelTest > resuming the report re-reads the day it belongs to, and not the device's today`
  → `expected:<2> but was:<1>`.
- `ErpMovementsCardOperatorsTest > an operator says what it produced, product by product`
  → no existe `MASSA TOKO` dentro de `report-massas-operator-beto-souza`.
- `ErpMovementsCardOperatorsTest > the day closes with the collective summary of its massas`
  → no existe `Resumo coletivo`.
- Pasa en RED, y por eso queda como guarda y no como test nuevo fallido: el caso «todos los operarios, incluido
  el que sólo existe en el ERP» ya se dibujaba; y «reanudar antes de que llegue el reporte no lee nada» era
  vacío mientras la reanudación no hacía nada.

L4 — GREEN (`./gradlew :app:testDebugUnitTest` completo, 1381 tests, 147 clases, 0 fallos):

- `ReportGeneratorViewModel.onScreenResumed()` relee el día con `loadMassasDay()`, que respeta `saopauloToday()`
  y sólo escribe el estado cuando la lectura devolvió datos.
- `ReportDetailViewModel.onScreenResumed()` relee masas **y** recepciones con la fecha del reporte
  (`report.reportDate`) y no con la del dispositivo; una respuesta vacía conserva lo que ya se leía.
- `ReportGeneratorScreen` y `ReportDetailScreen` observan `Lifecycle.Event.ON_RESUME` con `DisposableEffect`,
  el mismo patrón que `MassasLaunchScreen`; un refresco por reanudación, sin temporizador.
- `ErpMovementsCard` dibuja cada operario con su desglose por producto (tag `report-massas-operator-<clave>`) y
  cierra el día con el resumen colectivo (`report-massas-summary`, `Resumo coletivo` / `Resumen colectivo`) sólo
  con las masas efectivamente producidas. Backend sin cambios.
- Suites de regresión: backend 737/737 (incluidas las dos aserciones de `buildNumber`), web `test:node` 574/574.

L5 — Entrega 7016 (misma versión pública, sin tag nuevo):

- `LOCAL_APK_BUILD_NUMBER = 7016` en `packages/backend/src/modules/app/app.service.ts`; `app.routes.test.ts`
  fijaba 7016 **antes** del cambio y falló en RED (2 fallos, las dos aserciones), luego verde.
- Nuevo pin en `UpdateDetectorTest`: `v0.7.4`, tamaño idéntico, `buildNumber 7016` contra `7015` instalado →
  `SAME_RELEASE_PATCH`. El número es lo único que distingue esos dos binarios cuando el tamaño coincide; en este
  par el APK además cambió de tamaño (11.295.724 → 11.296.176), pero la decisión no depende de eso.
- APK firmado: `versionCode 7016`, `versionName 0.7.4`, APK Signature Scheme v2, certificado
  `ee0e404b...9573c431f6` (la huella fijada del proyecto), sha256
  `7b4ae3df7d632a55cfa2ed6c09444f000763e01a1703c1d638a08ad4b0df0851`, 11.296.176 bytes, copiado a
  `packages/backend/apk/trindade-0.7.4.apk` con su sidecar regenerado y verificado con `sha256sum -c`.
- Constancia: este documento, `CHANGELOG.md` (sin el número), `docs/release-android.md`,
  `docs/release-android-historial.md` (donde vive el código de build interno) y
  `docs/agents/trindade-development.md`.
