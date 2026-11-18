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
