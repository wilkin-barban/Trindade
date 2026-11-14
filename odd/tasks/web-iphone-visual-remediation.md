# Remediación visual iPhone: Salida, Masas, Assaí, Reporte, Auditoría y Dashboard

Tanda de ajustes visuales pedidos por el usuario sobre la vista iPhone. **Frontend-only**: no toca backend,
contratos, Android, migraciones ni ERP. Donde el pedido choca con la API, se resuelve en la capa web y queda
documentado acá.

## Specs

V1 — Salida/Baja oculta los códigos de producto en las filas visuales: la grilla de lanzamiento, la fila de ítem
de la tarjeta del histórico y las filas del diálogo de éxito muestran nombre + cantidad, sin `product.code` como
texto. El código sigue en `aria-label`, `data-testid` y en el payload, y `salidaSummaryText` lo conserva para
trazabilidad en WhatsApp. En la tarjeta se quita además el `label(item.block)` por ítem: el header ya nombra los
bloques.

V2 — Lanzamiento de Masas: cada producto es una fila (nombre a la izquierda, con `unitsPerBox` como subline de
10 px; input de cajas + unidades calculadas a la derecha), como `SalidaProductRow`. En `readOnly` el total ocupa
el lugar del input. La grilla usa `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` como Salida.

V3 — Calculadora Assaí: grilla de **3 columnas (Producto | Unidades | Cajas)**; `unitsPerBox` pasa a subline del
nombre (`14 un/cx`); sin `overflow-x-auto` ni `min-w-[320px]`; input `h-11 text-base`; cajas alineadas a la
derecha; total y errores como están. `ASSAI_PRODUCTS` queda sin `Quadrada` (8 productos), y ni el mensaje de
WhatsApp ni el total la nombran.

V4 — Reporte: `Quadrada` desaparece de la tarea **Assaí** y se conserva en **Cajas pequeñas**. Es un filtro de la
web en `readReportProducts`, no un cambio de catálogo: el backend, el contrato y Android siguen ofreciendo la
lista original. `CategorySection` queda genérico.

V5 — «Cronograma de Carga» / «Cronograma de Carregamento» pasan a **«Horario de Cargamento»** y **«Horário de
Carregamento»** en `nav.loadingSchedule`, `loading.title` y `moduleHelp.loading.title`. No se renombra el body
copy genérico, el historial ni «Cronograma activo» del Dashboard.

V6 — Auditoría: header en `Card` con título, subtítulo corto y total de registros; filtros en `Card` propia con
título, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, selects/inputs `w-full text-base sm:text-sm min-h-[44px]`,
botones `min-h-[44px] w-full sm:w-auto` y el userId sin `w-24` fijo en móvil. La tabla y la lógica no cambian.

V7 — Dashboard: tarjeta de Salida/Baja justo después de Lanzamiento de Masas, visible solo para `wilkin`
(`isSalidaVisible`), con dos puertas (`/salida` y `/salida-history`), tile de color y `testId="dashboard-card-salida"`.

## Tasks

- T1 (V5) — Renombrar en ES/PT y alinear el e2e del heading. Ver nota de pendiente del PDF. Ruta: inline.
- T2 (V1, V2, V3) — Filas de Salida y Masas, grilla de Assaí y catálogo sin Quadrada. Ruta: worker A.
- T3 (V4) — Filtro de Quadrada en `readReportProducts` con tests de lib, página y e2e. Ruta: worker B.
- T4 (V6, V7) — Auditoría y tarjeta del Dashboard, con sus claves i18n y tests. Ruta: worker B.
- T5 — Suites, typecheck y revisión del diff. Ruta: inline.
- T6 — Commit, push, deploy de `web` y verificación. Ruta: inline.

## Invariantes

- Solo frontend: backend, contratos, Android, migraciones y ERP intactos; el catálogo del API no cambia.
- Los códigos de producto siguen existiendo para accesibilidad, tests y trazabilidad del mensaje; solo se ocultan
  como texto en las filas.
- La tarjeta de Salida del Dashboard no se renderiza para quien no es `wilkin`.
- `Quadrada` sigue existiendo en Cajas pequeñas y en el catálogo del backend.
- i18n con paridad y sin claves muertas.

## Criterios de aceptación

1. V1: ninguna fila visual de Salida muestra el código; `aria-label`/`data-testid` y el mensaje lo conservan.
2. V2: en Masas el nombre y el campo comparten fila a 390 px, con `unitsPerBox` como subline; `readOnly` muestra
   el total en el lugar del input.
3. V3: Assaí entra en 390 px sin scroll horizontal, con 3 columnas y 8 productos.
4. V4: Assaí del reporte sin Quadrada; Cajas pequeñas con Quadrada; backend y contrato sin tocar.
5. V5: los tres textos renombrados en ambos idiomas; e2e alineado; PDF documentado si sale del backend.
6. V6: header y filtros en tarjetas propias, grid responsive y targets de 44 px.
7. V7: `wilkin` ve siete tarjetas con Salida después de Masas; el resto no la ve.
8. Suites node/unit y typecheck verdes; deploy de `web` sano y bundle nuevo.

## Log

L1 — pedido del usuario. El mensaje completo (V1–V7 con archivos y líneas) vive en la sesión. Decisiones textuales
que fijan el resultado:

  «Es frontend-only: no tocar backend, contratos, Android, migraciones ni ERP. Si un cambio parece requerir API,
  resolvelo en la capa web y documentalo en el ODD.»

  «`salidaSummaryText` y el payload de WhatsApp conservan el código para trazabilidad; el usuario pidió ocultarlo en
  las filas visuales.»

  «Es un filtro de la web para no tocar el backend, el contrato ni Android; el API sigue ofreciendo la lista
  original.»

  «Si el encabezado del PDF sale del backend y no lo podés cambiar sin tocar API, documentalo como pendiente en el
  ODD; no toques backend.»


L2 — ejecución y evidencia.

  V1: las tres filas visuales de Salida muestran nombre + cantidad; el código queda en `aria-label` y
  `data-testid` (assertado por test) y el mensaje de WhatsApp y el payload del ERP no cambian. La tarjeta del
  histórico dejó de repetir el bloque por ítem: lo nombra el header.
  V2: cada producto de Masas es una fila con el nombre y `un/cx` a la izquierda y el campo con las unidades a la
  derecha; en `readOnly` el total ocupa el lugar del campo. Contenedor `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`.
  V3: Assaí pasó de tabla de cuatro columnas a grilla de tres (`minmax(0,1fr) 5.5rem 3.25rem`), sin
  `overflow-x-auto` ni `min-w-[320px]`, con `un/cx` como sublinea, input `h-11 text-base` y cajas a la derecha.
  `ASSAI_PRODUCTS` queda en 8 productos y el mensaje no nombra Quadrada.
  V4: `readReportProducts` filtra Quadrada solo de `assai`; `normal` y el catálogo del API quedan iguales.
  V6: auditoría con header en tarjeta (título, subtítulo, total) y filtros en tarjeta propia con grid 1/2/4 y
  controles de 44 px; tabla y lógica intactas.
  V7: tarjeta de Salida en el Dashboard justo después de Masas, gateada por `isSalidaVisible`, con dos puertas y
  tile 📤.

  RED observado antes de cada cambio de datos/estructura: catálogo de Assaí `expected 8 actual 9` y el mensaje
  nombraba Quadrada; la fila de Salida devolvía `'1474EMBALAG. NHOQUE 1kgun'`; la tarjeta del histórico devolvía
  `'1474 EMBALAG. NHOQUE 1kgEmbalajes20 un'`; la grilla de Masas no era `flex` ni `xl:grid-cols-3`; V4 falló con
  Quadrada en `assai` y con una oferta de solo Quadrada leída como error; V7 falló con 6 tarjetas en lugar de 7.

  Verde final: `npm --workspace=packages/frontend run test:node` **718/718**, `NODE_ENV=test … test:unit`
  **186/186** (25 archivos), `npm run typecheck` sin errores.

  Un pin de la entrega anterior (`lib/iphone-layout.test.ts`) afirmaba la tabla con scroll de Assaí; se actualizó a
  la grilla de tres columnas en el mismo commit de V3, que es su lugar. La clave `assai.perBox` quedó sin uso y se
  retiró de ambos locales. `ReportEditPage` también usa `readReportProducts`, así que la pantalla de edición deja de
  ofrecer Quadrada en una tarea Assaí: es la consecuencia buscada del límite que fija V4, no un cambio de esa
  pantalla.

  Pendientes declarados:
  - El encabezado «CRONOGRAMA DE CARREGAMENTO» del texto/PDF de Cargamento sale de `/api/loading/export`
    (backend): renombrarlo exige tocar la API, así que queda fuera de esta entrega y el e2e que lo espera no se
    tocó.
  - La tabla densa de `/admin/audit` conserva su scroll horizontal; el foco era el header y los filtros.
  - Playwright no corre en este host (Ubuntu 26.04); los e2e de V4 y V5 quedaron como aserciones actualizadas, sin
    ejecución local, y el CI los corre en Ubuntu 24.04.

L3 — seguimiento del usuario: B1, R1 y B2.

  B1 — el botón «Lançar saída» del histórico usaba `flex-1` en la fila de acciones, así que en móvil se estiraba a
  todo el ancho y se leía como la acción primaria de la pantalla. Pasó a ser un `Link` compacto con las mismas
  clases que los históricos de Masas y Stock (`inline-flex h-11 shrink-0 … px-3 text-xs font-semibold … sm:h-10`),
  etiqueta corta en móvil (`salida.launchShort`: «Lanzar» / «Lançar») y completa desde `sm`, conservando el
  `data-testid="salida-history-launch"` y el destino `/salida`. Test de estructura actualizado: etiqueta `A`,
  `href`, sin `flex-1`/`w-full`, target de 44 px y las dos etiquetas con `sm:hidden` / `hidden sm:inline`.

  R1 — la causa del «Quadrada sigue en Cajas Assaí» no era la oferta de productos, que ya estaba filtrada, sino la
  **tarea de checklist**: el seed trae `Quadrada` dos veces, la tarea 60 en *Caixas pequenas* (categoría 9) y la
  tarea 66 en *Caixas Assai* (categoría 10), y el formulario la dibuja como tarea `check`. Solución web-only: nuevo
  `lib/report-categories.ts` con `visibleReportCategories`, que quita solo esa tarea de la categoría Assaí
  (reconocida por id 10 o por nombre en ambos idiomas, con acentos y mayúsculas normalizados) y devuelve todo lo
  demás por referencia y en el mismo orden, sin mutar la entrada.
    - `ReportsPage` filtra al recibir las categorías (un reporte nuevo no puede responder esa tarea).
    - `ReportEditPage` filtra **solo para dibujar** y conserva la lista cruda para `reportItems` y el prellenado:
    si un reporte ya respondió la tarea 66, al volver a guardarlo conserva su fila. Filtrar la lista que arma el
    payload habría borrado esa respuesta en silencio, que es justo lo que `report-items.ts` evita al emitir una
    fila por tarea marcada o no. Es una desviación deliberada y acotada de la letra del pedido («al setear
    categories»), tomada para no perder datos.
    - Backend, seed, DB, OpenAPI y Android intactos: el API sigue devolviendo ambas tareas. El filtro de
    `readReportProducts` (oferta de productos) queda donde estaba; es otra capa y no hace daño.
    - Tests: helper (Assaí pierde 66, pequeñas conserva 60, sin mutar y con match por nombre), `ReportsPage` y
    `ReportEditPage` (66 ausente, 60 presente) y e2e `report-builder.spec.ts` (60 visible, 66 count 0).

  B2 — WhatsApp y PDF del Horario de Cargamento pasan de columna a `grid grid-cols-2 gap-2 sm:flex sm:justify-end
  sm:gap-3`, con botones `w-full whitespace-nowrap px-2 text-xs sm:w-auto sm:px-4 sm:text-sm`, target de 44 px y
  los `data-testid` intactos. Mismo patrón en `LoadingEditPage`, que tenía el mismo par. El label completo
  «Exportar PDF» entra en 390 px: no hizo falta una etiqueta corta y no se agregó una clave muerta.

  Evidencia: RED observado en los tres frentes antes de implementar (Quadrada presente en las dos páginas, el
  botón como `button` con `flex-1`, los exports apilados). Verde final: node **723/723**, vitest **188/188**,
  typecheck sin errores. Pendiente de siempre: Playwright no corre en este host; el e2e nuevo se ejecuta en CI.
