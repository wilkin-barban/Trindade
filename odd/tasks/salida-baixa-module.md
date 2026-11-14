# Salida / Baixa — módulo web para insumos, embalagens e bobinas

Módulo aditivo para dar de baja insumos, embalagens e bobinas desde Trindade Web, con histórico propio y
conciliación contra el ERP Aero32 (`/movimentoitem`, `ENTSAI: "S"`). Beta privada: solo `wilkin`.

## Specs

S1 — Lista fija de 21 productos, invariable y sin CRUD. Nombres exactos en portugués, códigos de 4 dígitos
en la UI y de 6 dígitos hacia el ERP:

- Embalagens (13): `1474` EMBALAG. NHOQUE 1kg · `1473` EMBALAG. NHOQUE 400g · `1357` EMBALAG. DISCO 200g ·
  `1356` EMBALAG. DISCO 400g · `1355` EMBALAG. DISCO 500g · `1358` EMBALAG. LASANHA · `1359` EMBALAG.
  CASEIRA · `1361` EMBALAG. QUADRADA · `1307` EMBALAG. ROLO 1kg · `1625` EMBALAG. TOKO · `1354` EMBALAG.
  ROLO 500g · `1528` EMBALAG. ROLO 2kg · `1781` EMBALAG. TEMPERO
- Bobinas (3): `1900` BOBINA ROLO · `1899` BOBINA LASANHA · `1898` BOBINA DISCO
- Matéria-Prima (5): `1012` SORBATO · `1011` PROPIONATO · `1068` MICRO SAL · `1074` AÇÚCAR 5kg ·
  `1673` GORDURA VEGETAL

No incluye `1040` FARINHA TRIGO. `1673` aparece una sola vez. El catálogo lo sirve el backend
(`GET /api/salida/catalog`); la UI no lo duplica salvo fallback idéntico y con test de paridad.

S2 — Beta privada. Solo el usuario `wilkin` ve los ítems de menú y accede a `/salida` y `/salida-history`.
Toda ruta de salida y la acción `saida` del puente responden `401` sin sesión y `403` a cualquier otro
usuario. La autoridad es el servidor; la UI solo oculta. La liberación a todos los roles y Android quedan
fuera de esta entrega.

S3 — Fecha fija del día actual de São Paulo, mostrada como `Hoje · dd/mm/yyyy`, sin input de fecha. Operador:
el usuario logueado, solo lectura.

S4 — Tres bloques con switch independiente: Embalagens, Bobinas, Matéria-Prima. Apagar un bloque limpia sus
cantidades; encenderlo lo deja vacío. Los switches pueden estar varios activos a la vez.

S5 — El operador solo carga cantidades enteras > 0 en unidades. No elige fecha, no escribe motivo y no crea
ni edita productos.

S6 — Un solo botón `Lanzar salida` envía todos los productos con cantidad > 0 de todos los bloques activos en
un mismo movimiento local. Orden obligatorio: primero `POST /api/salida` (persistido en Trindade), después
subir fotos, después ERP. Si el ERP falla, el movimiento queda `Pendente` y el histórico ofrece
`Reenviar ao ERP`; nunca se pierde lo cargado.

S7 — Contrato de escritura ERP: `POST {wsUrl}/saidasitem`, Basic Auth, un payload por producto:

```json
{
  "PRO_COD": "001474",
  "PRO_DES": "EMBALAG. NHOQUE 1kg",
  "PRO_QTD": 2000,
  "PED_DTA": "2026-11-13",
  "PED_USU": "WILKIN",
  "PED_SER": "APL",
  "PED_DTANOT": "2026-11-13",
  "PED_OBS": "Saida de insumos via Trindade",
  "LOTES": []
}
```

`PRO_QTD` = unidades × 100; `PRO_COD` a 6 dígitos con ceros; `PED_USU` = username en mayúsculas;
`PED_SER` = `APL`; sin `PRO_CST`; sin `PED_DTMOVI`; `LOTES: []`; fechas `YYYY-MM-DD` de São Paulo. No se
reutiliza el payload de entrada.

S8 — Fotos opcionales, máximo 3, con el patrón de `ReportEditPage` / `ReportsPage`: input `image/*` con
`capture="environment"`, preview, remover, JPEG/PNG/WebP, 5 MB, subida después de crear el movimiento. Sin
fotos el movimiento es válido.

S9 — Puente Aero: se agrega la acción `saida` a `AERO_BRIDGE_ACTIONS`, al enum del contrato, al `CHECK` de
SQLite y a `BRIDGE_ENDPOINT_BY_ACTION` (`saidasitem`), aceptando 1–8 payloads por ticket y usando `bodies`
cuando hay más de uno. El frontend trocea movimientos de más de 8 productos en grupos de 8. `entrada`,
`entrada_lote`, `movimentos` y `test` siguen funcionando igual y tienen tests de regresión.

S10 — Histórico propio `/salida-history`, solo lectura: filtros de día (chips hoy/ayer/7 días), filtro por
bloque, tarjetas con fecha/hora, operador, bloque(s), productos y cantidades, total, fotos, estado de
conciliación y acción `Compartir`. Botón `Conferir no ERP` dispara la lectura `/movimentoitem` con
`ENTSAI: "S"`, guarda el snapshot por `POST /api/integration/aero/movements` y refresca. Muestra `ERP OK`,
`Pendente` o `Parcial` y los `ENT_LAN` cuando existen. No se edita ni se borra ningún movimiento.

S11 — Conciliación pura en `salida-reconcile.ts`: empareja items con asientos `movement_type === 'S'` por
fecha de planta, código sin ceros, cantidad y operador (username y display name, como Masas), consumiendo
cada asiento una sola vez. Devuelve `ent_lans`, `matchedItemIds`, `unmatchedItemIds`; el estado es
`reconciled` si todos los items tienen asiento, `partial` si algunos, `pending` si ninguno. Los asientos `E`
se ignoran.

S12 — Compartir por WhatsApp: mensaje con fecha, operador, bloque(s), productos, cantidades y total; las
fotos se comparten junto al texto con `navigator.share({ files, text })` cuando el navegador lo soporta.
Fallback: copiar el texto con `shareOrCopy` y permitir guardar/compartir las fotos por separado. Sin URLs
públicas inventadas.

S13 — Auditoría: cada intento de envío y cada lectura de movimientos deja el par `requested`/`result` con el
mismo `attemptId`, reutilizando `aero.log.service.ts`. No se escriben credenciales ni `Authorization`.

S14 — i18n: todas las cadenas nuevas en `es.json` y `pt-BR.json` con paridad; nombres de producto fijos en
portugués; títulos de bloque traducidos. Responsive 390 px y 1440 px, targets ≥44/48 px, inputs ≥16 px en
móvil, resumen sticky al pie en móvil y estático en desktop, sin ocultar información esencial.

S15 — Cambios aditivos: tablas nuevas y únicos cambios compartidos permitidos son la acción `saida` del
puente, el `CHECK` reconstruido de `aero_bridge_tickets` con migración segura que preserva filas, el evento
de auditoría `salida_sync` y la extensión mínima de `aero-mirror.ts` para `ENTSAI: 'S'`. OpenAPI se regenera,
nunca se edita a mano.

S16 — No se toca Masas, Relatório, Stock ni Android. Ningún test existente se rompe.

## Contrato HTTP (backend, todo `wilkin`-only en beta)

- `GET /api/salida/catalog` → `{ products: [{ code, name, block }] }`, `block ∈ embalagens|bobinas|materia-prima`, orden de S1.
- `POST /api/salida` body `{ items: [{ code, quantity }] }` (1..21, sin duplicados, entero > 0, código del catálogo) →
  `201 { movement }`. Fecha = `getSaoPauloDateString()`, usuario = sesión.
- `GET /api/salida?date=YYYY-MM-DD` → `{ date, movements: [movement] }` con items, fotos y conciliación.
- `GET /api/salida/history` → `{ days: [{ date, total_units, movements }] }`, días descendentes.
- `POST /api/salida/:id/photos` (multipart `file`, máx. 3, 5 MB, MIME + magic bytes) → `201 { photo }`.
- `GET /api/salida/:id/photos` → `{ photos: [photo] }`.
- `GET /api/salida/photos/:photoId` / `DELETE /api/salida/photos/:photoId`.
- `GET /api/salida/photos/public/:token` (sin sesión, el token es la credencial) → bytes de la imagen.

`movement` = `{ id, movement_date, user_id, username, display_name, created_at, items: [{ id, product_code,
product_name, block, quantity, position }], photos: [{ id, file_path, file_size, mime_type, url, publicUrl,
created_at }], total_units, reconciliation: { status, ent_lans, matched_item_ids } }`.

Tablas (revisión 11, aditivas): `salida_movements`, `salida_movement_items`, `salida_photos` con índices por
fecha y por movimiento.

## Tasks

- T1 (S1, S15) — hecho, commit `223d92c0`: catálogo fijo, tablas de la revisión 11 y migración que reconstruye el
  `CHECK` de `aero_bridge_tickets` copiando y contando las filas antes de soltar el original. Tests de migración
  10→11, inventario y `CHECK`. Ruta: inline.
- T2 (S2, S7, S13) — hecho, commits `b47100a8` (almacenamiento y catálogo) y `6cf017b9` (rutas): servicio de
  movimientos con items y fotos, plugin con `requireUsername('wilkin')` por ruta, foto pública por token y errores
  con código. Ruta: worker backend.
- T3 (S11) — hecho, commit `b47100a8`: `salida-reconcile.ts` puro, asientos `S` solamente, cada asiento consumido
  una vez y estado `reconciled`/`partial`/`pending`. Ruta: worker backend.
- T4 (S9) — hecho, commit `1612d29c`: acción `saida` del puente con 1–8 payloads, `bodies` cuando hay más de uno,
  `403` a cualquier otra cuenta y evento `salida_sync`, con regresión de las cuatro acciones previas. Ruta: worker
  backend.
- T5 (S15) — hecho, commit `99a8bbe6`: contrato generado con los nueve endpoints y `EXPECTED_PATHS` al día.
  Ruta: worker backend.
- T6 (S1, S3, S4, S5, S14) — hecho, commits `252b8fdf` (componentes) y `1fcd6549` (pantalla): bloques, grilla,
  fotos, resumen sticky y diálogo de éxito. Ruta: worker frontend.
- T7 (S7, S9, S12) — hecho, commit `d317f536`: payload `PED_*`, troceo de 8, ticket `saida` y share con archivos.
  Ruta: worker frontend.
- T8 (S10, S11) — hecho, commit `4a1001b7`: histórico con chips, filtro por bloque, tarjetas, `Conferir no ERP` y
  reenvío. Ruta: worker frontend.
- T9 (S13, S14) — hecho, commits `d317f536` (pares de auditoría con el mismo `attemptId`), `c9bd3c28` (i18n) y
  `2ee2b068` (guarda exacta y menú). Ruta: worker frontend.
- T10 — hecho: backend 866/866, frontend node 696/696 y vitest 164/164, typecheck limpio; verificación
  independiente de permisos, migración, conciliación, auditoría y contrato sin defectos. El e2e de navegador no se
  puede ejecutar en este host (Ubuntu 26.04 sin Chromium soportado, ver L7); corre en el lane de CI sobre
  ubuntu-24.04. Ruta: inline + verificador.
- T11 — hecho, commit `d3b33462`: CHANGELOG, arquitectura, integración y guía de agentes.
- T12 — pendiente: build, `docker compose up -d --build`, salud y evidencia.

## Invariantes
## Log

L1 — pedido del usuario. El mensaje completo vive en la sesión; acá va su contenido sin condensar en lo que
fija cadenas, listas y contrato (que además están citados literalmente en S1 y S7), y resumido en lo que repite
alcance y proceso. Ninguna cadena de usuario de este documento es una paráfrasis:

  # Módulo Salida / Baixa — directiva de desarrollo

  Necesito que desarrolles, bajo ODD y TDD, un módulo nuevo llamado **Salida / Baixa** en Trindade Web. Es para
  insumos, embalagens y bobinas que hoy solo se dan de baja en la tablet de la empresa. La lista es fija y no se
  administra desde la UI. El operario solo carga cantidades en unidades; no elige fecha, no escribe motivo y no
  crea productos. La fecha es siempre el día actual de São Paulo. Se pueden cargar varios productos y lanzarlos
  en un mismo movimiento. El módulo debe tener su propio Histórico, con conciliación contra el ERP leyendo
  `/movimentoitem` con `ENTSAI: "S"`.

  Alcance de esta entrega: solo web/iPhone; visible y usable solo por `wilkin` (beta); los demás roles no ven el
  ítem de menú, no acceden a las rutas y el backend les responde 403. Cuando esté 100% funcional se libera a
  todos los roles y se hace Android. No tocar Masas, Relatório, Stock ni el trabajo de la fábrica: el módulo es
  aditivo, y el único cambio compartido es agregar la acción `saida` al puente Aero, retrocompatible y con tests
  de regresión. Todo a `main`, sin ramas ni worktrees huérfanos, commits atómicos de ≤400 líneas, Conventional
  Commits, sin `Co-Authored-By` ni atribución de IA. No cerrar sesiones, tabs ni paneles de Herdr; al terminar,
  quedar idle.

  Lista fija: 21 productos. Embalagens (13): 1474 EMBALAG. NHOQUE 1kg · 1473 EMBALAG. NHOQUE 400g · 1357
  EMBALAG. DISCO 200g · 1356 EMBALAG. DISCO 400g · 1355 EMBALAG. DISCO 500g · 1358 EMBALAG. LASANHA · 1359
  EMBALAG. CASEIRA · 1361 EMBALAG. QUADRADA · 1307 EMBALAG. ROLO 1kg · 1625 EMBALAG. TOKO · 1354 EMBALAG. ROLO
  500g · 1528 EMBALAG. ROLO 2kg · 1781 EMBALAG. TEMPERO. Bobinas (3): 1900 BOBINA ROLO · 1899 BOBINA LASANHA ·
  1898 BOBINA DISCO. Matéria-Prima (5): 1012 SORBATO · 1011 PROPIONATO · 1068 MICRO SAL · 1074 AÇÚCAR 5kg ·
  1673 GORDURA VEGETAL. No incluir 1040 FARINHA TRIGO; 1673 una sola vez; nombres exactos en portugués. Códigos
  de 4 dígitos en la UI y 6 hacia el ERP. Lista invariable: sin CRUD, edición ni importación.

  UI: título `Salida / Baixa`, subtítulo, badge `Beta privada` / `Solo wilkin`; fecha fija `Hoje · dd/mm/yyyy`
  (São Paulo) sin input; operador logueado de solo lectura; tres bloques con switch independiente como
  `BoxTypeSwitchRow` (apagar limpia sus cantidades, encender deja vacío); grilla por bloque como
  `MassasLaunchGrid` con código, nombre, entero > 0 y sufijo `un`; un solo botón `Lanzar salida` que envía todos
  los productos con cantidad de todos los bloques activos en un mismo movimiento local; hasta 3 fotos opcionales
  con el patrón de `ReportEditPage`/`ReportsPage`; orden persistir en Trindade → subir fotos → ERP, dejando el
  movimiento `Pendente` con `Reenviar ao ERP` si el ERP falla; diálogo de éxito con respuesta del ERP, resumen,
  fotos, `Copiar resumen` y `Compartir por WhatsApp`; histórico propio `/salida-history` de solo lectura con
  chips de días, filtro por bloque, tarjetas con fecha/hora, operador, bloques, productos/cantidades, total,
  fotos, estado y `Compartir`; `Conferir no ERP` con `/movimentoitem` `ENTSAI: "S"`, snapshot y refresco,
  mostrando `ERP OK`/`Pendente`/`Parcial` y los `ENT_LAN`; WhatsApp con `navigator.share({ files, text })` cuando
  se pueda y fallback con `shareOrCopy`; i18n con paridad `es.json`/`pt-BR.json` y nombres de producto en
  portugués; responsive 390/1440, targets ≥44/48 px, inputs ≥16 px, resumen sticky en móvil.

  Contrato ERP de escritura: `POST {wsUrl}/saidasitem`, Basic Auth, un payload por producto con `PRO_COD` a 6
  dígitos, `PRO_DES`, `PRO_QTD` = unidades ×100, `PED_DTA`, `PED_USU` en mayúsculas, `PED_SER` `APL`,
  `PED_DTANOT`, `PED_OBS` `Saida de insumos via Trindade` y `LOTES: []`, sin `PRO_CST` y sin `PED_DTMOVI`.
  Consulta: `POST {wsUrl}/movimentoitem?_method=PATCH` con `_method` también en el cuerpo, `CODFOR: null`,
  `NOMUSU` en mayúsculas o `null`, `CODPRO: null`, `DTINI/DTFIM` del día, `ENTSAI: "S"`; snapshot por
  `POST /api/integration/aero/movements` y conciliación por fecha + producto + cantidad + operador contra los
  asientos `movement_type === 'S'`. No reutilizar el payload de entrada.

  Backend: módulo `packages/backend/src/modules/salida/` con catálogo, schema, service, routes, reconcile y
  tests; catálogo fijo por `GET /api/salida/catalog`; tablas `salida_movements`, `salida_movement_items` y
  `salida_photos` en la siguiente revisión aditiva, sin tocar tablas existentes salvo el `CHECK` de
  `aero_bridge_tickets` con migración segura y tests que preserven filas; endpoints de catálogo, alta, día,
  histórico y fotos reutilizando el patrón de reportes; `salida-reconcile.ts` puro; acción `saida` en el puente
  con 1–8 payloads y `bodies`, sin romper las otras acciones; guarda `wilkin` en todas las rutas y en la acción;
  auditoría `requested`/`result` con el mismo `attemptId` sin credenciales; OpenAPI generado desde Zod y prueba
  de cobertura de rutas.

  Frontend: rutas `/salida` y `/salida-history` lazy y guardadas para `wilkin`, nav en `AppShell`, páginas y
  componentes nuevos en `pages/salida/` y `components/salida/`, extensión mínima de `aero-mirror.ts` si hace
  falta `ENTSAI: 'S'`, reutilización de `Card`, `Button`, `Input`, `Dialog`, `DateField`/`HistoryDayPanel`,
  `ModuleHelpModal`, `BoxTypeSwitchRow`, la grilla de `MassasLaunchGrid`, el patrón de fotos, el share de
  `MassasWhatsAppShare`/`ExportPreview`, `shareOrCopy`, `waMeLink`, el cliente `api` e i18n. Tests primero, con
  rojo observado, cubriendo catálogo, switches, cantidades, resumen, payload, troceo, callback, orden, fotos,
  historial, filtros, conciliación, share y visibilidad.

  Verificación y cierre: suites de backend, frontend node/unit, typecheck, Playwright si el alcance lo pide, y
  `contracts:generate`; build y `docker compose up -d --build` con salud verificada y módulo oculto para otros
  roles; documentación en este documento, `CHANGELOG.md` y los docs que correspondan; commits atómicos en `main`
  sin `Co-Authored-By`; dejar el panel idle sin cerrar sesiones de Herdr.

L2 — ejecución T1: revisión 11 del esquema.

  `db/salida-migration.ts` crea las tres tablas y reconstruye `aero_bridge_tickets` (copia, cuenta y recién
  entonces suelta el original, dentro de una transacción `immediate`, con `foreign_keys = OFF` fuera de ella y
  los dos índices recreados). `schema.sql`, `SCHEMA_VERSION = 11`, `REVISION_ELEVEN_TABLES`,
  `requiredTablesFor` y el paso en `migrations.ts`. RED: `node --test src/db/salida-migration.test.ts` falla por
  módulo ausente; GREEN 7/7. Dos listas de expectativas quedaron obsoletas por el cambio y se actualizaron en el
  mismo commit: `revision-ten.test.ts` (fijaba `SCHEMA_VERSION === 10`) y `db-init.test.ts` (20 tablas). Commit
  `223d92c0`, 379 líneas. `schema-version.test.ts` exigía la lista de inventarios al día y también se corrigió.

L3 — ejecución T2–T5 (worker backend, revisado y verificado por el padre).

  RED de rutas: 48 casos, 45 fallando por plugin sin montar; GREEN 48/48. RED de conciliación:
  `ERR_MODULE_NOT_FOUND`; la tabla encontró un defecto real (la fecha del asiento no se comparaba) y quedó 14/14.
  RED del puente: `saida` respondía `400 AERO_BRIDGE_INVALID_ACTION`; GREEN 7/7 con las cuatro acciones previas
  intactas. RED de auditoría con `salida_sync` ausente: 35/37; GREEN 37/37. Commits `b47100a8` y `6cf017b9`
  (almacenamiento y rutas), `1612d29c` (puente), `99a8bbe6` (contrato). El padre actualizó `EXPECTED_PATHS` del
  test de contrato y la lista de tablas de `db-init.test.ts`, y regeneró el artefacto con el generador.

L4 — verificación independiente (verificador read-only, sin escribir el repo).

  Permisos: matriz anónimo/`wilkin`/otro admin/trabajador/invitado sobre las 9 rutas → `401` y `403` correctos,
  sin ruta sin guarda; confusión de rutas (dos segmentos, `..%2f`, mayúsculas, doble barra) falla cerrada; un JWT
  con `username: wilkin` falsificado da `403` porque la identidad sale de la base; la acción `saida` se rechaza
  después de parsear y antes de tocar el cofre (con la tabla del cofre vacía responde `403`, no `503`) y
  `entrada` desde la misma cuenta sigue admitida. Migración: 40 tickets preservados con ids, `bodies`, cascada,
  secuencia e índices; inventario fresco == migrado; re-ejecución `already-current`. Conciliación y auditoría sin
  defectos; residuo **preexistente** ajeno a esta entrega: `appendAeroLog` no redacta el texto libre de
  `response`. Contrato vigente y cobertura de rutas en ambos sentidos. Comandos: `npm --workspace=packages/backend
  test` 866/866, `bash scripts/verify-openapi-artifact.sh` vigente, 76/76 y 62/62 en los subconjuntos dirigidos.

L5 — ejecución T6–T9 (worker frontend) y corrección de S13.

  Primer cierre: 34 tests node y 14 vitest, pero **sin auditoría** y sin manejar el callback `saida` en el
  histórico. Corrección: pares `requested`/`result` con el mismo `attemptId` persistido en el almacenamiento
  antes de salir (el enlace profundo destruye la página), `read_history` para `Conferir no ERP` y `salida_sync`
  para el envío y el reenvío; el evento se agregó al tipo del cliente (`aero-audit.ts`) para no usar un cast; y
  `isSalidaVisible` pasó a comparar exacto, igual que el servidor, con test que fija la sensibilidad a mayúsculas.
  Evidencia final: node 696/696, vitest 164/164, `tsc` del frontend exit 0. Commits `c9bd3c28` (i18n),
  `d317f536` (payloads, auditoría y share), `252b8fdf` (componentes), `1fcd6549` (lanzamiento), `4a1001b7`
  (histórico) y `2ee2b068` (rutas y menú).

L6 — desvíos declarados.

  1. **Tamaño de commits.** Tres unidades del backend y cuatro del frontend superan el objetivo de ≤400 líneas
     (hasta ~1500). Se mantuvieron atómicas por comportamiento, con sus tests al lado: partirlas más exigía
     separar los tests del código que prueban o fragmentar un único plugin de rutas y una única página. El
     artefacto OpenAPI y el cliente Android son generados y no se revisan línea por línea.
  2. **Contrato Android.** Regenerar `packages/android/contract` estaba fuera del alcance funcional, pero el lane
     de CI compara los tipos generados: se regeneraron con el script documentado (solo modelos generados, ningún
     `when` de la app usa esos enums) y se commiteó en `f723fe78` sin tocar la app ni publicar APK.
  3. **Detalle de producto.** El payload de salida usa `PED_OBS` «Saida de insumos via Trindade» tal como fija la
     directiva, distinto del «Saida de massas» del registro histórico; se actualizó el ejemplo del registro.

L7 — e2e de navegador: no se puede ejecutar en este host (preexistente, no del cambio).

  `npx playwright test --project=chromium` levanta el servidor de e2e y el SPA, y después falla en **los 117
  specs** con el mismo error antes de abrir el navegador:

      browserType.launch: Executable doesn't exist at ~/.cache/ms-playwright/chromium_headless_shell-1223/...
      Error: Playwright does not support chromium on ubuntu26.04-x64

  El host es Ubuntu 26.04.1 y el Playwright que fija el repo se niega a instalar Chromium ahí; es exactamente la
  razón por la que `.github/workflows/ci.yml` fija `runs-on: ubuntu-24.04` con ese comentario. No es una regresión
  del módulo: **no se ejecutó ningún test**, así que el resultado no dice nada sobre el código nuevo. La cobertura
  de la UI de salida queda en los 696 tests node y los 164 de vitest, que sí corren en este host, y en el lane de
  CI, que corre sobre el sistema soportado.
