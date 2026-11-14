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

(Se completan con el audit; cada P# queda con archivo, defecto, fix aplicado y riesgo.)

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

(Se completa con la evidencia.)
