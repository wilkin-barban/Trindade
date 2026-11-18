# Salida abierta, Administración en diálogo y el WhatsApp de los históricos

Pasada del 2026-11-18, con tres features que llegan juntas y se commitean por separado:

1. **Salida / Baixa e Histórico de Saídas** dejan de ser una beta de una cuenta y quedan abiertos a todo rol
   autenticado de la web.
2. **Administración**: el alta y la edición de las seis pestañas que crean algo abren un diálogo con Aceptar/Cancelar.
3. Los **WhatsApp de los históricos de Masas y de Salidas** usan la misma tabla de abreviaturas y el mismo formato
   que el WhatsApp del Relatório.

## Specs

### A. Salida abierta (S-A1 a S-A5)

- **S-A1.** El backend admite a cualquier cuenta autenticada: las nueve rutas de `/api/salida*` usan
  `fastify.authenticate` y ya no `requireUsername('wilkin')`. Un anónimo sigue recibiendo **401**.
- **S-A2.** El puente admite la acción `saida` para cualquier cuenta autenticada: se eliminan
  `SAIDA_BETA_USERNAME`, `SAIDA_FORBIDDEN_MESSAGE` y el `403` por nombre. `entrada`, `entrada_lote`, `movimentos` y
  `test` no cambian.
- **S-A3.** El frontend dibuja el menú, la tarjeta del tablero y las dos rutas para cualquier sesión:
  `isSalidaVisible(user)` es «hay usuario», no «es wilkin».
- **S-A4.** El contrato no miente: las descripciones de OpenAPI de la superficie de baixa dicen que pide sesión y
  que rechaza con 401, y el artefacto `packages/contracts/openapi.json` — más el cliente Kotlin que se genera de
  él — se regeneran en el mismo commit.
- **S-A5.** El invitado conserva su regla de solo lectura, que es de la cuenta y no de este módulo: lee el catálogo y
  el historial (`200`) y el servidor le sigue negando las escrituras (`403`).

### B. Administración en diálogo (S-B1 a S-B5)

- **S-B1.** El botón `+ Nuevo` de las seis pestañas con alta (`categories`, `tasks`, `drivers`, `vehicles`,
  `timeSlots`, `workers`) abre siempre el diálogo de alta; ya no alterna a Cancelar.
- **S-B2.** El diálogo reutiliza `components/ui/dialog.tsx` (`Dialog`), con `data-testid` por pestaña:
  `admin-<tab>-modal`, `admin-<tab>-accept`, `admin-<tab>-cancel`, y `admin-<tab>-new` en el botón que lo abre.
- **S-B3.** `Aceptar` envía el formulario de la pestaña (el handler de siempre); `Cancelar` cierra y limpia. El
  título dice `Nuevo` al crear y `Editar` al editar, y `Editar` abre el mismo diálogo con los campos cargados.
- **S-B4.** Se conservan campos, validaciones, estados de carga, mensajes de éxito y error, el reset y la
  visibilidad por rol (el trabajador limitado solo ve `tasks` y `drivers`).
- **S-B5.** En iPhone (390 px) el diálogo abre, scrollea y sus botones tienen 44 px de alto.

### C. Abreviaturas compartidas (S-C1 a S-C5)

- **S-C1.** Hay una sola tabla aprobada. Vive en el backend
  (`packages/backend/src/modules/reports/whatsapp-abbreviations.ts`) y se publica como artefacto compartido en
  `packages/contracts/whatsapp-abbreviations.json`; el navegador tiene su copia en
  `packages/frontend/src/lib/whatsapp-abbreviations.ts`.
- **S-C2.** Las dos copias no pueden separarse: `whatsapp-abbreviations.contract.test.ts` (backend) y
  `whatsapp-abbreviations.parity.test.ts` (frontend) comparan fila por fila contra el artefacto.
- **S-C3.** Los históricos de Masas y de Salidas escriben el WhatsApp con el formato del Relatório:
  `- nombre corto: N un` en las listas, `👤 Operador:` como encabezado, `📦 nombre corto: N un (M cx)` en el resumen
  colectivo de Masas, y las cantidades exactas.
- **S-C4.** Se conserva la información propia de cada histórico: la fecha, la cantidad de movimientos y las cajas de
  Masas. El cambio es de estilo, no de datos.
- **S-C5.** Se aplica a todos los caminos de compartir: día completo y movimiento individual, en la vista previa y en
  el texto que se envía.

## Tasks

| ID | Specs | Tarea | Commit |
| --- | --- | --- | --- |
| T1 | S-A1, S-A2 | Quitar el guard por nombre de las nueve rutas de Salida y del ticket `saida` | `feat(salida)` |
| T2 | S-A3 | Frontend: `isSalidaVisible` por sesión, menú, tarjeta y rutas | `feat(salida)` |
| T3 | S-A4 | OpenAPI + artefacto + cliente Kotlin regenerado | `feat(salida)` |
| T4 | S-A1, S-A2, S-A5 | Tests de la matriz de rutas y del ticket, con anónimo, trabajador, invitado y otro admin | `feat(salida)` |
| T5 | S-A3 | E2E de un trabajador no-wilkin: menú, `/salida`, `/salida-history` y la confirmación de lanzamiento | `feat(salida)` |
| T6 | S-B1 a S-B4 | `AdminFormDialog` y los seis formularios en diálogo | `feat(admin)` |
| T7 | S-B2, S-B5 | E2E: abrir y cancelar en las seis pestañas, una creación real y la vista de 390 px | `feat(admin)` |
| T8 | S-C1 a S-C5 | Tabla compartida, builders de los dos históricos y tests de paridad | `feat(share)` |

## Paridad Android (normativa)

- **Salida**: Android no se toca en esta pasada. Cuando implemente el módulo, el historial del teléfono tampoco
  muestra `Conferir no ERP`: el sync del ERP es del Relatório.
- **Administración**: el alta y la edición usan un diálogo modal con Aceptar/Cancelar en las mismas seis pestañas;
  no se agregan formularios inline nuevos.
- **WhatsApp de Masas y Salidas**: el teléfono debe escribir el mismo texto que la web — misma tabla
  (`packages/contracts/whatsapp-abbreviations.json`), mismas abreviaturas, `- nombre: N un`, `👤 Operador:`,
  `📦` en el resumen, y las cantidades exactas. El fixture dorado del Relatório
  (`packages/backend/src/modules/reports/whatsapp-golden.test.ts`) sigue siendo la referencia de estilo.

## Log

**L1 (pedido del humano, textual):** el dueño aprobó abrir **Saída / Baixa** y **Histórico de Saídas** a todos los
roles autenticados de la web; el único bloqueo era la beta deliberada. Cambios exactos: quitar `BETA_USERNAME` y
`betaGuard` del backend usando `fastify.authenticate` en las 9 rutas (anónimo sigue 401); quitar
`SAIDA_BETA_USERNAME`, `SAIDA_FORBIDDEN_MESSAGE` y el `if (action === 'saida' ...)` del puente; abrir
`isSalidaVisible`/`SalidaRoute`/`AppShell`/`App.tsx` a cualquier usuario autenticado incluido invitado; actualizar
OpenAPI y regenerar contrato (Kotlin si el pipeline lo exige); tests de la matriz de rutas y del ticket; E2E con un
worker no-wilkin; documentar en el ODD y en `docs/paridad-android-web.md`; correr suites, typecheck, build, E2E,
deploy api+web, verificar con una cuenta no-wilkin, commit y push.

**L2 (pedido del humano, textual):** «Sumá otra feature a esta pasada, junto con la apertura de Salida: en
**Administración**, el botón `Nuevo` de cada pestaña con alta debe abrir un **modal** con el formulario
correspondiente y botones **Aceptar/Cancelar**, en lugar del formulario inline actual. […] Reutilizá el `Dialog`
existente […] Conservá campos, validaciones, estados de carga, mensajes de éxito/error, reset y la visibilidad por
rol (worker solo tasks/drivers). Agregá `data-testid` por pestaña (`admin-<tab>-modal`, `-accept`, `-cancel`) y una
E2E que abra/cancele en las 6 y una creación representativa; actualizá `admin-temperature-readings` y
`worker-admin-panel` si cambian los selectores (el botón `Criar` pasa a `Aceptar`). Documentá en el ODD y en
`docs/paridad-android-web.md` el patrón y las pestañas para Android; no implementes Android. Corré frontend
tests/E2E/build; el backend no cambia por esta feature. Hacé commit separado del de Salida, coordiná el deploy web
con el api+web de Salida y pusheá. No toques otras pestañas ni reglas.»

**L3 (pedido del humano, textual):** «los WhatsApp de **Histórico de Lançamento de Massas** y **Histórico de
Saídas** deben usar la misma tabla de abreviaturas, los mismos nombres cortos y la misma formatación que el WhatsApp
del Relatório. […] extraé la tabla/helper a un módulo compartido o a un JSON compartido; no la dupliques sin un test
que compare frontend y backend. Mantené las cantidades exactas y la información propia del histórico […]
Documentá en el ODD y en `docs/paridad-android-web.md` que los tres módulos comparten tabla y formato, y que Android
debe replicarlo.»

**L4 (pedido del humano, textual):** el CI falla en el job `verify` con
`packages/contracts/openapi.json does not match the schemas it is generated from`, falta `erpOnly` en
`SalidaReportOperator`: regenerar el contrato, incluirlo en el commit (y el Kotlin si el pipeline lo exige), pushear
y esperar el run. Condiciones de cierre: todo a `main`, CI verde con el run del push, reconstrucción real de la
imagen de producción con `docker compose up -d --build api web`, verificación del bundle servido, y la vista iPhone a
390 px con modales que abren, scrollean y botones de 44 px.
