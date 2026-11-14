# Pulido de la vista iPhone de la web

El iPhone es la superficie principal de Trindade y hasta ahora solo Salida / Baixa se había trabajado a 390 px.
Esta entrega hace dos ajustes pedidos sobre ese módulo y extiende los patrones que ya funcionan ahí al resto de
las rutas, sin tocar lógica de negocio, permisos, backend, Android ni ERP.

Referencia visual: `/home/wilkin/adjuntos/photo_AQAD-AxrG9sLyEd-.jpg` (Histórico de Salidas, 14/11/2026).

## Specs

R1 — Menú. `Salida/Baja` (lanzamiento) queda justo debajo de `Lanzamiento de Masas`; `Histórico de Salidas` queda
justo debajo de `Histórico de Masas`. Orden esperado: Lanzamiento de Masas → Salida/Baja → Calculadora Assaí →
Calculadora de Stock → Histórico de Masas → Histórico de Salidas → Histórico de Stock → Histórico de Reportes →
Histórico de Cargamento → Compartir. Los dos ítems siguen detrás de `isSalidaVisible(user)`.

R2 — Botón de ayuda. En `SalidaHistoryPage` el `ModuleHelpModal` vive en la fila del título, junto al `h1`
(`flex items-center justify-between gap-2`, ayuda en un contenedor `shrink-0`), como en `MassasHistoryPage` y
`ReportHistoryPage`. Las acciones (`Lançar saída`) van en su propia fila `w-full sm:w-auto` con el botón
`flex-1 sm:flex-initial`. Igual en `SalidaLaunchPage`.

P1..Pn — Pulido iPhone del resto de la web: aplicar los patrones de Salida/Baja donde el audit a 390 px encuentra
un defecto real y una corrección segura, sin rediseñar ni cambiar comportamiento.

## Rutas auditadas

| Ruta | Archivo principal | Estado |
| --- | --- | --- |
| `/login` | `pages/LoginPage.tsx` | auditada |
| `/dashboard` | `pages/DashboardPage.tsx` | auditada |
| `/reports` | `pages/ReportsPage.tsx` | auditada |
| `/reports/:id` | `pages/ReportViewPage.tsx` | auditada |
| `/loading` | `pages/LoadingSchedulePage.tsx` | auditada |
| `/massas-launch` | `pages/MassasLaunchPage.tsx` | auditada |
| `/massas-history` | `pages/MassasHistoryPage.tsx` | auditada |
| `/assai-calculator` | `pages/AssaiCalculatorPage.tsx` | auditada |
| `/stock-calculator` | `pages/StockCalculatorPage.tsx` | auditada |
| `/stock-history` | `pages/StockHistoryPage.tsx` | auditada |
| `/loading/reports-history` | `pages/ReportHistoryPage.tsx` | auditada |
| `/loading/history` | `pages/LoadingHistoryPage.tsx` | auditada |
| `/compartir` | `pages/ShareAppPage.tsx` | auditada |
| `/admin`, `/admin/audit` | `pages/admin/*` | auditada |
| `/salida`, `/salida-history` | `pages/salida/*` | referencia (ya pulida) |

## Hallazgos y fixes

Audit read-only a 390 px sobre el markup de las 17 rutas. Siete páginas ya cumplían el patrón y no se tocaron:
`/stock-history`, `/loading/history`, `/loading/reports-history`, `/massas-launch`, `/massas-history`,
`/stock-calculator` y `/compartir`. En `/admin/audit` el `overflow-x-auto` de la tabla de logs se conserva a
propósito: es una tabla densa y el scroll horizontal dentro de la tarjeta es lo correcto.

| P# | Ruta(s) | Archivo | Defecto a 390 px | Fix | Riesgo |
| --- | --- | --- | --- | --- | --- |
| P1 | `/login`, `/assai-calculator`, `/admin`, `/reports` | `components/ui/input.tsx` | El `Input` compartido renderizaba `text-sm` (14 px): iOS hace zoom automático al enfocar. | `text-base sm:text-sm` (16 px en móvil, 14 en desktop). | Bajo: solo tamaño de texto en móvil. |
| P2 | `/reports/:id` | `pages/ReportViewPage.tsx` | Las tres acciones usaban `h-9 sm:h-11` → 36 px en móvil, debajo del piso táctil. | `h-11` en las tres. | Bajo: solo alto. |
| P3 | `/dashboard` | `pages/DashboardPage.tsx` | La fila del título no tenía `gap` ni contenía la ayuda: el `h3` podía quedar pegado al botón. | `mb-4 flex items-center justify-between gap-2`, `min-w-0` en el título y la ayuda en un `div shrink-0`. | Bajo: estructura, mismo orden visual. |
| P4 | `/reports` | `pages/ReportsPage.tsx` | Título + ayuda en `flex items-center gap-2` sin wrap: se apretaban en 390 px. | `mb-1 flex flex-wrap items-center gap-2` + `min-w-0` en el `h2`. | Bajo. |
| P5 | `/loading` | `pages/LoadingSchedulePage.tsx` | Las dos acciones de exportación en `flex justify-end gap-3`: en móvil quedaban apretadas a la derecha. | Columna en móvil (`flex flex-col gap-3 … sm:flex-row sm:justify-end`) y botones `w-full sm:w-auto`. | Bajo. |
| P6 | `/assai-calculator` | `pages/AssaiCalculatorPage.tsx` | Tabla de cinco columnas con inputs sin contenedor de scroll: podía estirar la página. | Envoltorio `overflow-x-auto` y `min-w-[320px]` en la tabla. | Bajo: en desktop no cambia nada. |

Descartado a propósito: el contenedor del header de Assaí (`flex items-start justify-between gap-4`) tiene un solo
hijo, así que el `justify-between` es inerte; cambiarlo no arreglaba ningún defecto visible y se dejó como estaba.

Pendientes que necesitan decisión de producto (no se tocaron): unificar el alto de los `Button` secundarios de
todas las pantallas a 44 px, y decidir si `/admin` debe ofrecer las pestañas como chips 2x2 en móvil en lugar del
`overflow-x-auto` actual. Ambas cambian el aspecto de módulos que el audit no encontró rotos.

Tests: `packages/frontend/src/lib/iphone-layout.test.ts` fija los seis patrones (P1–P6) por lectura de fuente. Son
pins de regresión, no un rojo ejecutado: el rojo de estas correcciones es el hallazgo del audit con `path:line`,
porque no hay comportamiento que orquestar en un cambio de clases.

## Tasks

- T1 (R1) — hecho, commit `c99a0f53`: menú con cada ítem de Salida debajo de su par de Masas y test de orden
  completo con la guarda intacta. Ruta: inline.
- T2 (R2) — hecho, commit `c99a0f53`: ayuda en la fila del título en `/salida` y `/salida-history`, acciones en
  fila propia, con tests de estructura. Ruta: inline.
- T3 (P1–P6) — hecho, commit `b5998af6`: seis correcciones de clases y el pin de regresión
  `lib/iphone-layout.test.ts`. Ruta: inline.
- T4 — hecho: node, vitest y typecheck verdes (L2).
- T5 — hecho, ver L3: deploy de `web`, salud, `/salida-history` 200, catálogo sin sesión 401 y bundle nuevo.

## Invariantes

- Ningún cambio toca lógica de negocio, permisos ni contratos: son clases, estructura y copy.
- Los dos ítems de Salida siguen detrás de `isSalidaVisible(user)`; la beta no se abre.
- No se introduce un design system nuevo ni dependencias: se usan los componentes existentes y el design system
  del repo (`design/system.md`).
- 390 px: sin scroll horizontal, títulos legibles, ayuda junto al título, acciones a ancho completo.
- Inputs a 16 px en móvil (`text-base sm:text-sm`) y objetivos táctiles ≥44 px.
- Empty/loading/error siempre dicen algo accionable.

## Criterios de aceptación

1. El menú respeta el orden R1 y ambos ítems siguen gateados.
2. La ayuda de las dos pantallas de Salida está en la fila del título y las acciones en su propia fila.
3. Cada corrección del audit es de bajo riesgo y está probada por clases/DOM o wiring.
4. Suites node/unit y typecheck verdes; deploy de `web` sano con el bundle nuevo.
5. El ODD, el CHANGELOG y la evidencia quedan al día.

## Plan de tests

- Node: orden del menú, guarda `wilkin`, i18n con paridad.
- Vitest: estructura del header de Salida (ayuda en la fila del título, acciones aparte) y los patrones aplicados
  en las pantallas tocadas (DOM/clases); ningún test nuevo depende de un navegador real.
- Playwright: no corre en este host (Ubuntu 26.04, ver `salida-baixa-module.md` L7); el CI lo corre en Ubuntu
  24.04.

## Log

L1 — pedido del usuario. El mensaje completo vive en la sesión; acá van textuales las dos decisiones que fijan el
resultado:

  «R1 — Menú. El ítem Histórico de Salidas debe quedar justo debajo de Histórico de Masas. El ítem Salida/Baja
  (lanzamiento) sigue justo debajo de Lanzamiento de Masas, como está ahora.»

  «R2 — Botón de ayuda. En SalidaHistoryPage el ModuleHelpModal está en la fila de acciones, al lado de “Lançar
  saída”. Moverlo a la fila del título, como en MassasHistoryPage.tsx y ReportHistoryPage.tsx.»

  «No rediseñes todo: priorizá hallazgos de alto impacto y bajo riesgo. Si un cambio necesita una decisión de
  producto, dejalo como pendiente en el ODD en vez de inventarlo.» y «No tocar la migración ni la API.»

L2 — auditoría y ejecución.

  Audit read-only de las 17 rutas a 390 px: siete páginas ya cumplían el patrón, seis defectos concretos con
  `path:line` y un descarte razonado (el header de Assaí con un solo hijo). Hallazgos en la tabla de arriba.

  R1: el bloque de Salida se partió en dos guardas, cada una con su ítem; `salida-nav-order.test.ts` ahora fija la
  secuencia completa de diez entradas y comprueba que ninguna de las dos escapa de `isSalidaVisible`.
  R2: la ayuda quedó en `flex items-center justify-between gap-2` junto al `h1`, con `data-testid` en el
  contenedor, y las acciones en su propia fila; los tests de estructura comprueban que la ayuda está dentro del
  header y que el botón de lanzar no está dentro de la ayuda.

  Verde: `npm --workspace=packages/frontend run test:node` **712/712**, `NODE_ENV=test … test:unit` **172/172**,
  `npm run typecheck` sin errores. Commits `c99a0f53` (R1, R2, 149 líneas) y `b5998af6` (P1–P6, 72 líneas).

  Honestidad sobre el método: R1 y R2 sí tenían test antes del cambio, pero los tests de estructura y de clases de
  P1–P6 se escribieron con el fix, porque un cambio de clases no tiene un rojo de comportamiento que observar. El
  rojo de esas seis correcciones es el hallazgo del audit, con archivo y línea; los tests quedan como pin de
  regresión, y así está declarado en `iphone-layout.test.ts`.

L3 — despliegue y verificación.

  `docker compose up -d --build web`: `web` y `api` quedaron `Up (healthy)` (127.0.0.1:8085 y :3005).
  `GET /api/health` → `{"status":"ok"}`; `GET /salida-history` → `200`; `GET /api/salida/catalog` sin sesión →
  `401` (la beta sigue cerrada); bundle publicado `assets/index-B-4EmsLk.js` con los textos del módulo. No se
  tocaron API, migración ni Android.

  Lo que no se puede probar acá: Playwright no corre en este host (Ubuntu 26.04 sin Chromium soportado, ver
  `salida-baixa-module.md` L7), así que el 390 px se verifica por clases, DOM y estructura. La captura del iPhone
  del usuario sigue siendo la prueba que falta.
