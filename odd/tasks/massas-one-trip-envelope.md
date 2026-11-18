# Masas: un solo viaje a Safari con sobre multi-paso

Pasada del 2026-11-18. Hoy el lanzamiento de Masas pide `entrada`/`entrada_lote`, vuelve al histórico y el auto-read
pide `movimentos`: dos viajes a Safari para una sola operación. El sobre del ticket pasa a llevar dos pasos y el
histórico deja de pedir el segundo.

## Specs

- **S1.** `buildBridgeEnvelope` (`packages/backend/src/modules/integration/aero.tickets.service.ts`): para
  `entrada` y `entrada_lote` el sobre agrega `steps`, un arreglo de dos pasos ejecutables en orden:
  1. lanzamiento: `url` = `${base}/${ticket.endpoint}`, `method: 'POST'`, `body`/`bodies` del ticket;
  2. lectura del día: `url` = `${base}/movimentoitem?_method=PATCH`, `method: 'POST'`, `body` con `CODFOR: null`,
     `NOMUSU: null`, `CODPRO: null`, `DTINI`/`DTFIM` desde el `ENT_DTA` del primer payload, `ENTSAI: 'E'` y
     `_method: 'PATCH'`.
  Los dos pasos llevan los mismos headers Basic del sobre. Se conservan `url`, `method`, `body`/`bodies` legacy en el
  sobre para que un script viejo siga lanzando, y **no** se agrega una `action` nueva.
- **S2.** `Aero32Bridge.js` (y el `.scriptable` si el pipeline lo exige): si el sobre trae `steps`, los ejecuta en
  orden con su `url`/`headers`/`body`/`bodies` en el mismo viaje; si no, el comportamiento actual. El resultado que
  manda a `resultUrl` es compuesto: `{ launch, read }`. El `callback` sigue siendo `/massas-history`. Se cuidan el
  timeout por paso, los errores (un paso que falla no impide reportar el anterior) y el límite de 2 MB del cuerpo.
  El script viejo, que ignora `steps`, sigue funcionando; la app cae al auto-read si no hay `read`.
- **S3.** `MassasHistoryPage`: parsea el compuesto, usa `launch` para el veredicto y `read` para
  `handleMovementsCallback`. Si `read` viene presente y válido **no** arma ni consume `armAeroAutoRead` ni pide el
  segundo `movimentos`; si falta o falló, se mantiene el auto-read actual como fallback. Se conservan la cola y el
  reintento de lotes parciales y el diálogo de veredicto. `MassasLaunchPage` no cambia su flujo.
- **S4.** Receta en **Administração → Integração ERP / Aero32**: el código copiable sale de
  `AERO_SCRIPTABLE_CODE_PATH` / `public/Aero32Bridge.js` y debe incluir el soporte de `steps` y una versión visible.
  Las instrucciones dicen que, si el script ya existía, se reemplaza **todo** el código y se guarda manteniendo el
  nombre `Aero32Bridge`.
- **S5.** Tests: backend del sobre (dos pasos, `DTINI`/`DTFIM`, `ENTSAI`, `_method`, headers, legacy intacto),
  frontend del puente y del auto-read, `MassasHistoryPage` con compuesto y con fallback, y E2E del viaje único (sin
  segundo ticket) y de la receta copiable.
- **S6.** Documentación: el sobre multi-paso, el fallback de los scripts viejos y la receta, en
  `docs/integracion-aero32.md`, `docs/paridad-android-web.md` y este documento. Android no se toca.

## Tasks

| ID | Specs | Tarea | Commit |
| --- | --- | --- | --- |
| T1 | S1 | Sobre multi-paso en el backend, con el legacy intacto y sus tests | `b5454bc3` |
| T2 | S2, S4 | Scriptable con `steps`, resultado compuesto y la receta copiable versionada | `cf6cc0f3` |
| T3 | S3 | `MassasHistoryPage` leyendo el compuesto, con auto-read como fallback | `2bd0fea1` |
| T4 | S5 | Tests de frontend, E2E del viaje único y de la receta | `2691b405` |
| T5 | S6 | Documentación en `docs/integracion-aero32.md`, `docs/paridad-android-web.md` y este ODD | `4b68fa6e` |

## Log

**L1 (pedido del humano, textual):** «unificar los dos viajes a Safari del **Lançamento de Massas** en uno solo con
un sobre multi-paso. Hoy el lanzamiento pide `entrada`/`entrada_lote` y, al volver al histórico, el auto-read pide
`movimentos`; el usuario ve Safari dos veces. Implementá: 1) **Backend** (`aero.tickets.service.ts`
`buildBridgeEnvelope`): para `entrada`/`entrada_lote`, agregá `steps`: paso 1 = lanzamiento (`ticket.endpoint`,
`body`/`bodies`), paso 2 = lectura del día (`movimentoitem?_method=PATCH`, body con `CODFOR:null`, `NOMUSU:null`,
`CODPRO:null`, `DTINI/DTFIM` desde `ENT_DTA` del primer payload, `ENTSAI:'E'`, `_method:'PATCH'`), mismos headers
Basic. Mantené el `url`/`body`/`bodies` legacy para que un script viejo siga lanzando; no agregues una `action` nueva
si se puede evitar. 2) **Scriptable** (`packages/frontend/public/Aero32Bridge.js` y `.scriptable` si corresponde): si
el sobre trae `steps`, ejecutalos en orden con su url/headers/body/bodies en el mismo viaje; si no, comportamiento
actual. Guardá un resultado compuesto `{ launch, read }` (o `steps`) en `resultUrl`; callback sigue a
`/massas-history`. Cuidá timeout, errores y el límite de 2 MB; medí un día real. El script viejo debe seguir
funcionando (ignora `steps`) y la app debe caer al auto-read si no hay `read`. 3) **Frontend** (`MassasHistoryPage`):
parseá el compuesto; usá `launch` para el veredicto y `read` para `handleMovementsCallback`; si `read` está presente
y válido, NO armes/consumas `armAeroAutoRead` ni pidas el segundo `movimentos`; si falta o falló, mantené el auto-read
actual como fallback. Conservá cola/retry de lotes parciales y el diálogo de veredicto. `MassasLaunchPage` no cambia
de flujo. 4) **Receta en Administración**: actualizá la receta copiable en **Administração → Integração ERP / Aero32**
(`AeroScriptableDialog` carga `AERO_SCRIPTABLE_CODE_PATH`; el archivo servido es `public/Aero32Bridge.js`). El usuario
copia de ahí y pega en Scriptable; si ya tenía el script, las instrucciones deben decir que reemplace todo el código
por este y guarde, manteniendo el nombre `Aero32Bridge`. Actualizá tests/snapshots de copia
(`aero-scriptable-copy.test.tsx`/E2E) para que el código copiado incluya el soporte `steps`/versión. 5) **Tests**:
backend tickets/envelope/result; frontend bridge-wiring, auto-read-after-launch, MassasHistoryPage con compuesto y
fallback; E2E del one-trip sin segundo ticket y de la receta copiable. 6) **Docs/ODD**: documentá el sobre
multi-paso, el fallback de scripts viejos y la receta en `docs/integracion-aero32.md`/`docs/paridad-android-web.md`/ODD;
Android no se toca. Alcance: solo Massas (`entrada`/`entrada_lote`); no cambies `saida` ni el Relatório.»
