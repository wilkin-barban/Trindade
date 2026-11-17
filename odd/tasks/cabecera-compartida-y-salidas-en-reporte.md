# Salida y Masas: cabecera compartida y las salidas dentro del reporte

Segunda pasada sobre el mismo par de módulos. La cabecera de `/salida` se vuelve la de los dos lanzamientos, los
históricos abren en el día que se puede gestionar y lo que sale de la planta entra en el reporte del día, por
operario, en la pantalla y en el texto que se comparte.

## Specs

S1 — La cabecera de Salida/Baja se lleva al lanzamiento de Masas, en la vista de iPhone:

> quiero la vista de la parte de arriba del modulo Saída / Baixa, la parte de la fecha, el boton de Historico y la
> parte que dice el nombre del operador, quiero que esta parte visual se lleve al modulo Lançamento de Massas, justo en
> la vista de iphone

Comprende la línea de fecha de planta, el botón al histórico y el operador de la sesión con su etiqueta «Sesión», con
la misma forma y el mismo alto de toque que en `/salida`.

S2 — `Histórico de Saídas` abre en el día de hoy:

> en Histórico de Saídas ve directamente a la fecha de Hoy, si aun no se ha lanzado nada muestra las tarjetas vacías
> o no las muestres directamente

Decisión de implementación: no se dibujan tarjetas vacías; se muestra el estado vacío con el acceso a lanzar.

S3 — En fechas pasadas, cada tarjeta pierde su botón de compartir por WhatsApp; el botón del final, el que comparte
el día completo, se queda:

> en la vista de fechas pasadas, quita el boton compartir por whatsapp de cada tarjeta, no es necesario en fechas
> pasadas ese boton, lo dejamos en modo lectura y deja el boton de Whatsapp del final, el que manda el relatorio
> completo de todas las tarjetas

S4 — Lo que se lanza en Salida/Baja entra en el módulo Relatório, con su resumen por operario, como ya ocurre con
«Massas do dia» e «Insumos» en Movimentações do ERP, y también en el texto que se comparte por WhatsApp:

> vincular el modulo Saída / Baixa al modulo Relatorio, dejando una opcion para mostrar su resumen por operario, de
> la misma forma que ya hacemos con las opciones Massas do dia e Insumos en Movimentações do ERP, vamos a incluir lo
> lanzado en Saída / Baixa en el modulo Relatorio y en lo compartido por whatsapp del modulo Relatorio

S5 — Todo queda documentado para el desarrollo Android:

> recuerda documentar todo para cuando estemos listos para el desarrollo de la proxima release de la aplicacion
> android, asi no tendremos que estar adivinando

## Decisiones del usuario

1. **Masas pierde el selector de fecha en el lanzamiento**: se lanza siempre el día de planta y el pasado se consulta
   en el histórico.
2. **El compartir por tarjeta se quita en los dos históricos** (Salida y Masas) cuando el día es pasado; el del día
   completo queda en ambos.
3. **El bloque de Salidas del reporte usa el `report_date`** del propio reporte, igual que Masas e Insumos.
4. **Solo el resumen**, sin fotos: las fotos siguen compartiéndose desde el histórico de Salidas.
5. **El bloque se muestra en** `/reports/:id` (donde ya está Masas), en el texto compartido y en la pantalla de
   creación `/reports` como previsualización.
6. **Operarios**: nombre visible y, cuando exista cuenta, el usuario entre paréntesis; los que solo existen en el ERP
   se marcan como hace Masas.

## Tasks

- T1 → S1. Extraer la cabecera a un componente reutilizable y montarla en `/salida` y `/massas-launch`; fuera el campo
  de fecha de Masas (decisión 1); tests de ambas pantallas y del componente.
- T2 → S2. `/salida-history` abre en el día de planta; día vacío sin tarjetas, con el estado vacío y el acceso a
  lanzar.
- T3 → S3. Sin compartir por tarjeta en días pasados, en los dos históricos (decisión 2); el compartir del día queda.
- T4 → S4. Servicio, endpoint, texto del WhatsApp y componente del reporte, con el `report_date` (decisión 3), solo
  resumen (decisión 4), montado en los tres lugares (decisión 5) y con el nombre y la marca de ERP (decisión 6).
- T5 → S5. Actualizar `docs/paridad-android-web.md` con todo lo de esta pasada.
- T6 → cierre. Suites, typecheck, build, E2E completo, contrato OpenAPI y Kotlin, deploy y verificación en producción.

## Log

L1 — pedido del usuario, verbatim:

```
quiero la vista de la parte de encima modulo Saída / Baixa, la parte de la fecha, el boton de Historico y la parte
que dice el nombre del operador, quiero que esta parte visual se lleve al modulo Lançamento de Massas, justo en la
vista de iphone, me gusta como se ve el modulo Saída / Baixa, vamos a llevar esta vista al modulo Lançamento de
Massas, en Histórico de Saídas ve directamente a la fecha de Hoy, si aun no se ha lanzadso nada muestra las tarjetas
vacias o no las muestres directamente, en la vista de fechas pasadas, quita el boton compartir por whatsapp de cada
tarjeta, no es necesario en fechas pasadas ese boton, lo dejamos en modo lectura y deja el boton de Whasapp del
final, el que manda el relatorio completo de todas las targetas, otra cosa que vas hacer en esta pasada es vincular
el modulo Saída / Baixa al modulo Relatorio, dejando una opcion para mostrar su resumen por operario, de la misma
forma que ya hacemos con las opciones Massas do dia e Insumos en Movimentações do ERP, vamos a incluir lo lanzado en
Saída / Baixa en el modulo Relatorio y en lo compartido por whatsapp del modulo Relatorio, dame un resumen de las
ideas y remediaciones quew quiero para ver si las entendiste bien antes de implementar nada
```

L2 — respuestas del usuario a las seis preguntas:

```
1-si, 2-los dos, 3-el que ya usan Masas e Insumos, 4-solo el resumen, 5-en la vista del reporte (/reports/:id, donde
ya está Masas) y en el texto compartido y También en la pantalla de creación del reporte (/reports), como
previsualización mientras se carga, 6-igual que Masas marca los que solo existen en el ERP. Otra cosa, recuerda
documentar todo para cuendo estemos listos para el desarrollo de la proxima relese ded la aplicacion android, asi no
tendremos que estar adivinando, puedes comensar con estas implementaciones en la aplicacion web en la vista de
iphone
```

## Paridad Android (lo que hay que replicar de esta pasada)

- **Cabecera de los dos lanzamientos**: línea de fecha de planta (día de São Paulo, no del teléfono), botón al
  histórico y operador de la sesión con su etiqueta. En Android, el equivalente es la barra superior de cada pantalla
  de lanzamiento, con el mismo orden y los mismos destinos.
- **Sin selector de fecha**: el lanzamiento es siempre el día de planta; el pasado se consulta en el histórico. En
  Android, el selector de fecha desaparece de la pantalla de lanzamiento de Masas y de Salida.
- **Históricos abren en hoy** y dibujan el día vacío como estado vacío, no como tarjetas vacías.
- **Días pasados**: solo lectura y sin el compartir por tarjeta; el compartir del día completo sigue disponible. Aplica
  a los dos históricos.
- **Reporte**: una sección `Saídas / Baixa` por operario, alimentada por el mismo día del reporte (`report_date`), con
  productos y unidades, sin códigos, sin fotos, y con el nombre visible más el usuario entre paréntesis; los
  operarios que solo existen en el ERP se marcan como en Masas. El texto que se comparte por WhatsApp la incluye en el
  mismo orden que la web (después de Masas).
- **Dónde se ve**: la vista del reporte y la previsualización de creación, con el mismo contenido.

## Estado de ejecución (2026-11-16)

| Tarea | Estado | Commit | Evidencia |
| --- | --- | --- | --- |
| T1 — cabecera compartida en los dos lanzamientos, Masas sin selector de fecha | hecho | `32fd90ce` | `DaySessionHeader` con prefijo de test ids (`salida-*`, `massas-*`); Masas lanza el día de planta |
| T2 — `/salida-history` abre en hoy, día vacío sin tarjetas | hecho | `32fd90ce` | abre en `saoPauloToday()`, valida `?date=`, estado vacío con acceso a lanzar |
| T3 — sin compartir por tarjeta en días pasados, en los dos históricos | hecho | `32fd90ce` | `SalidaMovementCard` (`!readOnly`) y el equivalente de Masas; el compartir del día queda |
| T4 — bloque de Salidas/Baixa en el reporte | hecho | `cff68334` | `salidaReportDayView`, `GET /api/reports/day/salidas`, sección `📤 *SAÍDAS / BAIXA*` en el texto, `SalidaReportSection` en `/reports/:id` y en `/reports` |
| T5 — paridad Android actualizada | hecho | `7bf2877f` | `docs/paridad-android-web.md`, sección nueva con cabecera, sin selector, históricos y bloque del reporte |
| T6 — cierre | hecho | `97e2dd5c` + deploy | build verde, E2E **118/118**, deploy `api`+`web` y producción verificada |

Números al cerrar el código: backend **969/969**, Vitest **219/219** (29 archivos), node **749/749**, typecheck limpio,
contrato OpenAPI al día y cliente Kotlin regenerado (195 archivos).

### T6 — cierre (2026-11-16)

- **Suites**: backend **969/969**, Vitest **219/219** (29 archivos), node **749/749**, `tsc` sin errores.
- **Build**: `✓ built in 16.28s`.
- **E2E completo**: **118/118** (7m 06s).
- **Contrato**: `verify-openapi-artifact.sh` al día; cliente Kotlin regenerado (195 archivos) y
  `check-android-contract-types.sh` verde.
- **Deploy**: `docker compose up -d --build api web`; `api` y `web` healthy.
- **Producción verificada**: `/api/health` 200; `/salida`, `/salida-history`, `/massas-launch`, `/massas-history` y
  `/reports` 200; `GET /api/reports/day/salidas?date=` sin sesión **401**; el `export.service` desplegado contiene
  `SAÍDAS / BAIXA` y el servicio `salida-report` está en la imagen; el bundle web sirve `salida-report-section` con
  `salida-report-operator-` y `salida-report-total`, y el chunk de lanzamiento de Masas monta `DaySessionHeader` con
  **cero** inputs de fecha; CSP y HSTS presentes, asset gzip + `immutable`, log escribible.
- **Árbol**: `.vitest/` eliminado y agregado a `.gitignore` (`97e2dd5c`); sin artefactos sin trackear.

### Corrección: la tarjeta de Salidas sale del bloque de ERP

Reporte del usuario: en «Movimentações do ERP» del reporte, la sección de Salidas quedaba mezclada con «Massas do dia» y
rompía el diseño en el teléfono.

Causa: la sección estaba montada **dentro** de la tarjeta de movimientos, en el mismo bloque que Massas, así que el
bloque apilaba una tercera sección y la tarjeta crecía.

Arreglo: `SalidaReportSection` es su propia tarjeta, con los márgenes de sus vecinas, al lado de la tarjeta de ERP en
`/reports` y después de la de Massas en `/reports/:id`. Un test fija la estructura: la tarjeta de salidas no puede
estar contenida en `massas-block` ni en `report-massas-card`.

Evidencia: Vitest **220/220** (dos corridas), build verde, E2E **118/118** y los tres specs del reporte 19/19; deploy
solo de `web` (healthy) y `/reports` 200 en producción con la sección servida en su propio chunk.

### Reordenamiento: un encabezado y tres tarjetas en el reporte

Pedido del usuario: Massas do dia e Insumos cada una en su tarjeta, como ya estaba Salida/Baixa, y el botón
«Sincronizar com ERP» por encima de las tres.

- `erp-movements-header` es una cabecera propia (título + botón único) fuera de las tarjetas.
- `report-massas-card`, `report-receipts-card` (solo en los días con recebimentos) y `salida-report-section` son tres
  tarjetas hermanas, sin anidamiento.
- El spec de la tarjeta ERP ahora prueba que la cabecera contiene el botón y que cada registro dibuja su tarjeta; el
  de insumos lee su línea de harina en `report-receipts-card`.

Evidencia: Vitest **220/220**, typecheck y build limpios, los cuatro specs de movimientos del ERP 8/8, E2E completo
**118/118** (8m 12s), deploy solo de `web` (healthy) y `/reports` 200 con los cuatro test ids servidos.

## Tarjeta de compartir al guardar un reporte (2026-11-16)

Pedido: al guardar el reporte, en vez de la vista del módulo, mostrar una tarjeta con la vista de WhatsApp del
reporte y cuatro acciones —Compartir en WhatsApp, PDF, Editar y Cerrar—, con «Editar» volviendo a la vista anterior.

Decisiones del usuario: (1) la tarjeta **reemplaza** la vista de lectura al guardar, con «Editar» detrás; (2) el
compartir **incluye las fotos** del reporte; (3) **sin** botón de copiar.

### Implementación

- `lib/report-share.ts`: `fetchReportExportText` (el texto es del servidor, `GET /reports/:id/export`),
  `reportPhotoFiles` (fotos del reporte como archivos para la hoja de compartir, con el mismo criterio que Salida:
  una foto que no se puede leer se omite), `shareReportMessage` (hoja nativa con archivos cuando el navegador lo
  admite; si no, el texto; si no hay hoja, copia) y `exportReportPdf` (el PDF que ya existía, extraído de la página).
- `components/reports/ShareCard.tsx`: tarjeta genérica —título, subtítulo, texto, estado de carga/error y las cuatro
  acciones—, sin saber nada de reportes, para poder montarla en Horario de Cargamento.
- `ReportViewPage`: con `?saved=1` renderiza la tarjeta; sin el parámetro, la vista de lectura de siempre (que además
  ahora usa `exportReportPdf`). «Editar» va a `/reports/:id/edit` y «Cerrar» a `/reports`.
- `ReportsPage`: al guardar navega a `/reports/:id?saved=1`.
- i18n: `reports.savedTitle`, `reports.shareSending`, `reports.shareCopied` en ambos idiomas.

### Evidencia

Vitest **227/227** (31 archivos) con dos tests nuevos de la tarjeta y dos de la página (con y sin `?saved=1`),
`tsc` limpio y build verde. El botón de copiar no existe en la tarjeta.

## La tarjeta de compartir en Horario de Cargamento (2026-11-16)

Pedido: llevar el mismo diseño y los mismos botones al módulo Horario de Cargamento.

- `ShareCard` ganó dos cosas para poder viajar: prefijo de test ids (`loading-share-*`) y acción de editar
  **opcional** (un día pasado no tiene nada que corregir).
- `lib/loading-share.ts`: texto desde `GET /loading/export?date=` (el mismo que sale por WhatsApp), compartir con la
  hoja nativa y copia como respaldo, y PDF con el generador que ya existía (`horario-<fecha>.pdf`).
- `LoadingSchedulePage`: el botón de exportar abre la tarjeta en lugar del diálogo; «Editar» va a
  `/loading/edit?date=`, «Cerrar» vuelve a la grilla del mismo día y la URL conserva la fecha al abrir y al cerrar.
- **Desvío declarado**: este módulo guarda turno por turno, no tiene un «guardar el día» único; por eso la tarjeta se
  abre a propósito desde el botón y no aparece sola después de cada guardado, que interrumpiría una grilla de veinte
  turnos. Queda documentado para Android con la misma regla.

Evidencia: Vitest **227/227**, node **749/749**, `tsc` limpio, el spec de Horario **13/13** con las cuatro acciones y
sin botón de copiar.

## Remediaciones del 2026-11-17

Estas cuatro llegaron después del cierre inicial de esta pasada y se registran acá, no en el ODD anterior.

| Tarea | Commit | Evidencia |
| --- | --- | --- |
| El sync del reporte pide **ambos lados** del día, sin cambiar el default de los demás | `016ea89e`, acotado en `46dd17f6` | `aeroMovementsPayload` vuelve a `ENTSAI: 'E'` por defecto y acepta `includeExits`; **solo** `ReportsPage` lo pasa. Tests: `aero-mirror` 26/26 (default `E`, explícito `null`), `receipts-sync-wiring` actualizado |
| El bloque de Salidas une espejo + lanzamientos locales y **solo admite operarios con cuenta activa** | `013ffd6d`, `8051cc94` | Verificado contra producción el 17/11: devuelve `joaoh` 20 un, `viviane` 435 un y `wilkin` 13 un (total 468); descarta JOSIANE, FELIPE, TELEVENDAS y WILIAN. Tests: un operario escrito de dos formas es **un** grupo; un día hecho solo de asientos se muestra |
| Nombre canónico del catálogo para 1074 y reparación **local** del charset en el bloque | `46dd17f6`, `049d8322` | El espejo guardaba `AĂ…UCAR 5 KG` (UTF-8 leído como ISO-8859-2). La ingesta compartida **no** se toca: el bloque nombra 1074 con el catálogo (`AÇÚCAR 5kg`, bloque matéria-prima) y repara el texto de códigos ajenos al leerlo. La fila de producción se normalizó a `AÇÚCAR 5 KG`. Tests: bloque 5/5 y texto de WhatsApp 26/26 con el nombre correcto y sin caracteres de control; regla de encoding documentada para Android |
| Confirmación de `Lanzar saída` con Cancelar / Confirmar | `729025fe` | `handleLaunch` abre el diálogo y `handleConfirmLaunch` ejecuta; `salida-confirm-modal` con productos, total y botones de 44 px. Tests de página 18/18: Lanzar abre y **no** llama a la API ni al ticket, Cancelar no lanza, Confirmar escribe el movimiento y arma el viaje. E2E propio: `salida-confirm-launch.spec.ts` |

### Estado de pruebas y despliegue

- Backend **974/974**. Frontend **230/230** vitest (31 archivos) y **750/750** node. `tsc` limpio. Build verde (`16.61s`).
- E2E: suite completa **118/118** más el spec nuevo de la confirmación de Salida (ver su propio conteo abajo).
- Deploy: `api` + `web` reconstruidos y healthy; producción verificada para el filtro de operarios y el nombre del azúcar.
