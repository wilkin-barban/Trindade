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

