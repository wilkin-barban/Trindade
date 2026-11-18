# Puente Aero32: los dos lados del día en un solo viaje

El botón **Sincronizar com ERP** del Relatório falló en producción el 2026-11-18 sin que el API registrara
ningún error: el ERP de la empresa contestó el read con `PDO::prepare(): Argument #1 ($query) cannot be empty`
dentro de un `200`, el puente lo guardó, y el cliente lo mostró crudo. La causa es `ENTSAI: null` —el cuerpo de
`includeExits`—, que el PHP del ERP no acepta: con `ENTSAI` nulo no arma ninguna consulta.

La salida elegida es **B**: el Relatório pide los dos lados en dos payloads separados dentro del mismo ticket
`movimentos`, el sobre lleva `bodies`, y el guion del puente corre ambos pasos y devuelve una sola lista. Ningún
`null` viaja por el cable.

## Specs

- **S1** Nunca se manda `ENTSAI: null` por el cable. El Relatório pide **dos payloads en el mismo ticket
  `movimentos`**: uno `ENTSAI:"E"` y otro `ENTSAI:"S"`.
- **S2** El backend permite `payloads`/`bodies` de **hasta 2** en `movimentos` (`aero.vault.schema.ts` y
  `aero.tickets.service.ts`), conservando el `body` legacy `E` para scripts viejos.
- **S3** `Aero32Bridge.js` (fuente `packages/frontend/scriptable` + el publicado en `packages/frontend/public` +
  la receta en Administración → Integração ERP / Aero32) ejecuta ambos pasos en el mismo viaje y devuelve un
  resultado que `readAeroMovements` lee como una sola lista (`success: true`, `data` unida E+S, `skipped`). Si el
  script viejo ignora `bodies`, completa al menos `E` y no rompe.
- **S4** `aero-mirror`: para `includeExits` arma los dos payloads E/S; nunca `null`.
- **S5** Si el ERP devuelve un error, la UI muestra un mensaje amigable / código `AERO_*` y **nunca** la frase
  cruda de PHP. Un test de regresión fija las dos cosas: `ENTSAI` no nulo y error no crudo.
- **S6** Tests de contrato/script/parser, build, CI y deploy **api+web**; se actualiza la versión de la receta. No
  se toca Android, la APK ni la release.

## Tasks

| ID | Alcance | Ruta |
| --- | --- | --- |
| T1 | Esquema y servicio del ticket: `movimentos` acepta 2 payloads y arma `bodies`, conservando `body` legacy | backend |
| T2 | `aero-mirror`: dos payloads E/S para `includeExits`, sin `null` | web |
| T3 | Guion del puente: dos pasos en un viaje, `data` unida + `skipped`, tolerante al script viejo | scriptable/public/receta |
| T4 | Mensaje de error: código `AERO_*` y frase de planta, nunca el texto de PHP | web |
| T5 | Tests de regresión: `ENTSAI` no nulo en el cable y error no crudo; contrato del sobre y del parser | ambos |
| T6 | Suite completa, build, CI y deploy api+web; versión de la receta | operación |

## Log

### L1 — pedido del dueño (2026-11-18)

> Elijo **B**, con fallback tipo C solo si el script viejo no entiende el sobre nuevo. Implementalo así:
> 1) **Nunca** mandes `ENTSAI: null` por el cable; el Relatório debe pedir dos payloads en el mismo ticket
> `movimentos`: uno `ENTSAI:"E"` y otro `ENTSAI:"S"`. 2) Backend: permití `payloads`/`bodies` de hasta 2 en
> `movimentos` (`aero.vault.schema.ts` y `aero.tickets.service.ts`), conservando el `body` legacy E para scripts
> viejos. 3) `Aero32Bridge.js` (fuente `packages/frontend/scriptable` + publicado + receta en Administración →
> Integração ERP/Aero32): ejecutá ambos pasos en el mismo viaje y devolvé un resultado que `readAeroMovements`
> pueda leer como una sola lista (`success:true`, `data` unida E+S, `skipped`); si el script viejo ignora
> `bodies`, que al menos complete E y no rompa. 4) `aero-mirror`: para `includeExits`, armá los dos payloads E/S;
> nunca null. 5) Si el ERP devuelve un error, mostrá un mensaje amigable/AERO_* y **nunca** la frase cruda de PHP;
> test de regresión que fije ambos (`ENTSAI` no nulo y error no crudo). 6) Tests de contrato/script/parser, build,
> CI y deploy **api+web**; actualizá la versión de la receta. No toques Android/APK ni la release.

## Avance

Cerrado el 2026-11-18. Causa confirmada antes de tocar código: el read del Relatório viajaba con `ENTSAI: null`, el
PHP del ERP no arma consulta con ese filtro abierto y contestó `PDO::prepare(): Argument #1 ($query) cannot be empty`
dentro de un 200; el puente guardó ese texto y el operario lo leyó como fallo del botón.

- **T1** `movimentos` acepta hasta 2 payloads; `bodies` se publica para el viaje de dos lados y `body` conserva el
  legacy de entradas (`b0d6c671`). El OpenAPI no cambia (`payloads` sigue `1..8`), así que no se regeneró cliente
  alguno y Android quedó intacto.
- **T2** `aeroMovementsPayload` recibe `side: 'E' | 'S'` (un lado abierto dejó de ser representable) y
  `aeroMovementsPayloads` arma uno o dos cuerpos (`b3252dd5`).
- **T3** Guion **v2.1.0**: ejecuta los dos cuerpos, fusiona en `{ success: true, data: [...E, ...S], skipped }` y, si
  un lado falla, devuelve ese fallo en vez de medio día. Un guion viejo ignora `bodies` y completa las entradas.
- **T4** El parser aplana una lista de listas; `PDO::prepare(...)` se clasifica `AERO_ERP_ERROR` y la pantalla muestra
  `reports.receiptsError` mientras la frase cruda queda solo en la auditoría.
- **T5** Tests: backend **976/976**, frontend node **754/754**, unit **235/235**.
- **T6** CI `44394510058` verde; el primer intento falló porque el E2E fijaba `v2.0.0` literal en la receta
  (`3c636474`). Deploy api+web: bundle `assets/index-DidEhsDF.js`, `/Aero32Bridge.js` con `v2.1.0`, contenedores
  `healthy`.

### Cierre verificado en producción (21:41)

El botón funciona. La evidencia está en la auditoría y en la base:

- `21:41:42` → `read_history` / `result`, nota `lens=recebimento · date=2026-11-18 · insumos=2 · via=bridge`, **sin
  error**, y `POST /api/integration/aero/movements` con 201.
- Espejo del día: `aero_movements` de `2026-11-18` con 13 asientos `E` y 823 `S`, `synced_at 21:41:41.292Z`. Los dos
  lados llegaron, que es lo que el pedido único con `ENTSAI` nulo nunca podía traer.
- La fila del ticket de esa pulsación (`aero_bridge_tickets`, creada `21:41:32.491Z`, usada `21:41:34.054Z`) lleva
  `bodies` con dos elementos, `ENTSAI:"E"` y `ENTSAI:"S"`, y un `body` legacy con `E`.

**El intento de 21:39:03 era el cliente viejo, no el nuevo.** Esa fila tiene `bodies: null` y un `body` con
`"ENTSAI":null`: la pestaña se había cargado antes del deploy de las 20:56 y nunca se recargó. Dos minutos después,
la misma pulsación desde la página nueva armó el sobre correcto. No hace falta arreglo de servidor: el cliente
desplegado ya pide los dos lados y la planta ya sirve el guion v2.1.0.

**Lección operativa**: un deploy de web no recarga las pestañas abiertas. Si vuelve a aparecer un `PDO::prepare` en
la auditoría, lo primero que hay que mirar es si la fila del ticket trae `bodies` nulo: eso dice «cliente viejo», no
«servidor roto».