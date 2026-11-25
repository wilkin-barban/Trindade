# Módulo Estoque: Conciliación Físico vs ERP y Auditoría de Sincronización

Nuevo módulo web para Administradores que enlaza en tiempo real el inventario físico contado en `Contagem de Estoque` con la existencia/saldo devuelto por el WebService de Aero32, permitiendo auditar la respuesta del ERP y preparar los cuadres automáticos.

## Specs

S1 — Acceso y Seguridad: Ruta `/estoque`, restringida exclusivamente al rol `Administrador` (`user?.role === 'Administrador'`). Usuarios sin dicho rol son redirigidos a `/dashboard`. Enlace visible en `AppShell.tsx` para administradores.

S2 — Fecha Presente en Modo Lectura: La cabecera muestra la fecha del día actual en São Paulo como etiqueta informativa fija en solo lectura, sin selector ni controles para cambiar de fecha.

S3 — Enlace con Contagem de Estoque: Consume `GET /api/stock?date=<HOJE>` para listar los 25 productos del catálogo (`STOCK_CATALOG`: 10 de Massas y 15 de Terceirizados), mostrando las cajas y unidades físicas contadas hoy en el piso.

S4 — Sincronización con ERP y Auditoría:
- Botón en cabecera `[ 🔄 Sincronizar Estoque ERP ]` (`data-testid="estoque-sync-erp"`).
- Emite un ticket hacia `Aero32Bridge` con `callbackUrl: '/estoque'`, solicitando la consulta de stock/movimientos del ERP.
- Al regresar a `/estoque` con `?aero_action=...&aero_data=...`, procesa la respuesta, registra la auditoría mediante `/api/integration/aero/log` en `logs/aero-integration.log`.
- Notificación exclusivamente mediante ventana modal emergente (`MessageDialog`), sin pintar alertas, banners ni textos de error/éxito sueltos en el cuerpo del módulo.

S5 — Diseño Mobile-First iPhone:
- Tarjetas individuales por producto (`data-testid={`estoque-card-${product.code}`}`), optimizadas para el ancho de pantalla de iPhone (~375–390 px) y piso táctil de 44px (`min-h-[44px]`).
- Visualización de tres métricas: Físico (cx / un contadas), ERP (saldo/unidades del ERP o estado pendiente de sincronización), y Diferencia (Delta con badge de estado).
- Botones de acción para cuadre (Entrada `entradasitem` si Físico > ERP, Salida `saidasitem` si Físico < ERP) con confirmación modal.

S6 — Testing y Verificación:
- Pruebas unitarias en Vitest/node para `EstoquePage.tsx`: guard de administrador, carga de productos, botón de sync, modal emergente de resultado y cálculo de discrepancias.

## Tasks

- [x] T1 — Crear `packages/frontend/src/pages/EstoquePage.tsx` con soporte para iPhone, tarjetas de producto, cálculo de diferencia, botón de sync con Aero32Bridge y modal `MessageDialog`.
- [x] T2 — Registrar la ruta `/estoque` en `packages/frontend/src/App.tsx` (guard admin) y agregar el ítem de navegación en `packages/frontend/src/components/layout/AppShell.tsx`.
- [x] T3 — Crear pruebas unitarias en `packages/frontend/src/pages/EstoquePage.test.tsx` (6 casos).
- [x] T4 — Suites: `test:unit` 321/321, `test:node` 771/771, `tsc --noEmit` sin errores, `build` correcto.
- [x] T5 — Commit atómico en `main` y push a `origin/main` sin `Co-Authored-By`.
- [x] T6 — Recompilar y desplegar `trindade-web-1` (`docker compose build web && docker compose up -d web`) y verificar salud.

## Evidencia

- **S1** — `EstoquePage` envuelve la pantalla en un guard propio (`useAuth().user?.role !== 'Administrador'` → `<Navigate to="/dashboard" replace />`). El guard vive fuera de `EstoqueScreen` para que los hooks corran siempre en el mismo orden. Ruta `/estoque` bajo `ProtectedRoute` con `lazy`; ítem de navegación visible solo para `Administrador` con ícono `Warehouse`.
- **S2** — Badge de cabecera `Hoje, DD/MM/YYYY` armado con `saoPauloToday()`/`formatDateLabel()`; sin selector ni input de fecha (aserción explícita en el test).
- **S3** — `GET /stock?date=<hoje>`; las tarjetas salen del catálogo que devuelve la API, no de una copia local. Cajas y unidades físicas se leen de `StockProduct.boxes/units`.
- **S4** — `triggerAeroMovementsSync(settings, { date: today, callbackPath: '/estoque', includeExits: false })`, que pide el ticket `movimentos` y abre Scriptable. Al volver, `resolveAeroCallback` + `readAeroMovements` persisten el espejo con `POST /integration/aero/movements` y la URL se limpia. La auditoría (`requested` y `result`, evento `read_history`, `destinationUrl` a `/movimentoitem`) viaja por `postAeroAuditEvent` → `/api/integration/aero/log`.
- **S5** — Tarjetas `data-testid="estoque-card-<code>"` apiladas, métricas Físico / ERP / Delta con badge verde-ámbar-rojo y acciones de 44 px. La sugerencia de cuadre abre una ventana **neutra** (`Dialog`, `data-testid="estoque-suggestion"`) que dice explícitamente que nada se envió al ERP: no se usa el tilde verde de éxito para una acción que no ocurrió.
- **S6** — Cero texto de resultado en el cuerpo: todo pasa por `MessageDialog` (`data-testid="estoque-message"`) o por la ventana neutra de sugerencia. Los mensajes de error usan las claves i18n, nunca el `message` crudo de una excepción.
- **Definición del saldo ERP (decisión registrada)** — el WebService Aero32 no expone endpoint de existencia; solo `/movimentoitem`. La métrica ERP es el **movimiento neto del día** (`Σ E − Σ S` por código, comparando con `code.replace(/^0+/, '')`). Un espejo de otra fecha se trata como no sincronizado (test dedicado) en vez de restar días distintos. La etiqueta de la tarjeta dice `ERP (Día)` para no presentarlo como saldo de depósito.
- **Verificación** — `test:unit` 321/321 (34 archivos), `test:node` 771/771 (186 suites), `tsc --noEmit` sin errores, `build` de Vite correcto con `EstoquePage` en su propio chunk. Dos corridas completas consecutivas de `test:unit` verdes; una corrida intermedia falló sin que se capturara el caso y no volvió a reproducirse.
- **T6 completada** — Contenedor web recompilado y desplegado (`docker compose build web && docker compose up -d web`). Contenedor `trindade-web-1` en estado `Up (healthy)`, respondiendo HTTP 200 en `/estoque`. Commit de implementación: `bbd65045e5658208d7649eca630bd84ddea080a3`.

## Invariantes

- Frontend-only: no mutar backend, base de datos ni contratos de Android.
- Exclusivo para administradores: otros roles no ven ni pueden acceder a `/estoque`.
- Fecha fija en modo solo lectura para el día de hoy.
- Cero alertas dibujadas en el cuerpo: todo resultado viaja por `MessageDialog`.
- Trunk-based directo a `main`. Prohibición total de `Co-Authored-By` o autoría de IA.

## Criterios de Aceptación

1. En iPhone Safari la pantalla `/estoque` se lee clara, fluida y con tarjetas verticales sin desbordes.
2. Muestra los productos y las cantidades físicas reales contadas hoy en Contagem de Estoque.
3. El botón de sincronizar dispara el puente y audita el resultado del ERP.
4. Todo mensaje de feedback se muestra en ventana emergente modal.
5. Suites unitarias pasando al 100% y contenedor web saludable en producción.
