# Remediación visual mobile: Histórico de Masas y botón de alta de operario ERP

Ajuste de maquetado responsivo en `MassasUnifiedTable.tsx` para la vista de celular (< sm). Cuando un asiento del ERP no tiene operario vinculado en Trindade, el botón "+ Criar Operário: <NOMBRE>" no debe comprimir la columna de datos del producto y operario en una franja estrecha que trunca textos y rompe líneas palabra por palabra.

## Specs

S1 — El contenedor de la fila en `MassasUnifiedTable.tsx` debe responder fluidamente a pantallas móviles (< sm). En mobile debe apilarse limpiamente (`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2`), evitando que el bloque de acciones a la derecha comprima la información izquierda a una franja de apenas ~100px.

S2 — El nombre del operario (`row.operatorName`), el badge de estado (`Só ERP`), el nombre del producto (`row.productName`), las cantidades (`row.boxes cx · row.units un`) y la nota de caja abierta (`row.openBoxUnits > 0`) deben tener el 100% del ancho disponible en mobile, sin truncarse prematuramente ("LUCA...", "MASS...") ni romper palabras sueltas por línea.

S3 — El bloque de acciones (`+ Criar Operário: <NOMBRE>`, `Importar`, `Enviar ao ERP`, `Já na tablet`, etc.) y las notas aclaratorias (`Não fecha caixas inteiras`, `Operador inativo: reative em Admin › Operários`, `Operador não vinculado`):
- En mobile (< sm): los botones toman ancho completo o natural (`w-full sm:w-auto text-center justify-center sm:justify-start`) y las notas se alinean de forma legible (`text-left sm:text-right`), sin forzar anchos fijos restrictivos como `max-w-[9rem]`.
- En desktop/tablet (sm en adelante): se conserva el layout side-by-side (`sm:flex-col sm:items-end`) existente.
- Se mantiene el piso táctil accesible de 44px (`min-h-[44px]`).

S4 — Conservar intactos todos los contratos de testing y atributos:
- `data-testid={`massas-unified-row-${row.key}`}`
- `data-testid={`massas-create-operator-${row.entLans[0]}`}`
- `data-testid={`massas-import-${row.entLans[0]}`}`
- `data-testid={`massas-open-box-${row.key}`}`
- `data-testid={`massas-reactivate-${row.entLans[0]}`}`
- `data-testid="massas-unified-send"`
- `data-testid={`massas-ack-${row.launchIds[0]}`}`
Todos los tests unitarios (`test:unit`, `test:node`) y E2E deben mantenerse pasando al 100%.

## Tasks

- [x] T1 — Verificar contratos y tests existentes de `MassasUnifiedTable.tsx`.
- [x] T2 — Ajustar el maquetado responsivo en `packages/frontend/src/pages/massas/MassasUnifiedTable.tsx`.
- [x] T3 — Añadir aserciones de regresión unitaria en `packages/frontend/src/pages/massas/massas-operator-from-seat.test.ts`.
- [x] T4 — Ejecutar suites: `test:unit` 315/315, `test:node` 771/771, `tsc --noEmit` y `build` verdes.
- [x] T5 — Commit atómico en `main` y push a `origin/main`.
- [ ] T6 — Recompilar y desplegar el contenedor de producción `trindade-web-1` (`docker compose build web && docker compose up -d web`) y verificar salud.

## Evidencia

- Contenedor de fila: `flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2`.
- Columna izquierda: `min-w-0 w-full sm:w-auto sm:flex-1`.
- Bloque de acciones: `flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:shrink-0 sm:items-end`.
- Los cuatro botones de fila (Importar, Criar Operário, Enviar ao ERP, Já na tablet) llevan `min-h-[44px] w-full items-center justify-center gap-1.5` y `sm:w-auto sm:justify-start`.
- Notas aclaratorias: `w-full text-left text-[11px] … sm:max-w-[9rem] sm:w-auto sm:text-right`.
- Todos los `data-testid` intactos.
- T6 queda pendiente: el usuario la ejecuta al recompilar y desplegar.

## Invariantes

- Frontend-only: no mutar backend, migraciones, base de datos ni contratos.
- Trunk-based: directo en `main`.
- Prohibición estricta de `Co-Authored-By` o autoría de IA en commits.
- En resoluciones de pantalla medianas/grandes (`sm:` en adelante) el diseño permanece side-by-side como antes.

## Criterios de Aceptación

1. En pantallas de iPhone (~375–390 px) el nombre del operario y el producto se leen completos y no se aplastan contra el botón.
2. El botón de crear operario se muestra cómodo para pulsar con el dedo, sin desbordar ni apretar el texto superior.
3. Tests unitarios, de node y typecheck de frontend pasando al 100%.
4. Contenedor web redesplegado y saludable en producción.
