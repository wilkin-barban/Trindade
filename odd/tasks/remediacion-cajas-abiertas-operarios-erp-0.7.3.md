# Remediación cajas abiertas y operarios ERP-only — 0.7.3 / 7014

Feature: las cajas del espejo se calculan con `ceil` desde las unidades exactas, y las secciones individual y colectiva del día muestran los asientos del ERP (incluidos los parciales y los operarios sin cuenta) con filtro por trabajador.

Entrega: 0.7.3 / 7014. Rama `main`, sin ramas ni worktrees. Tag anotado `v0.7.3` y release sólo con CI verde.

## Specs

S1. Toda caja mostrada se calcula `ceil(unidades / unitsPerBox)` desde las unidades exactas. El redondeo se aplica al total de cada producto y de cada par operador-producto; nunca se suman los `ceil` de cada línea.
Criterio: `ceil(182 / 15) = 13`; `ceil(3 / 10) = 1`; dos líneas de 3 un del mismo producto y operador dan `ceil(6 / 10) = 1`, no 2.

S2. Los agregados que abarcan productos con distinto `unitsPerBox` (total del operador y total del día) suman las cajas ya calculadas por producto; no recalculan sobre unidades mezcladas. Los totales se derivan de las filas unificadas y de las unidades exactas, nunca de valores ya redondeados.

S3. Las unidades exactas se conservan intactas. La fila muestra el número principal como `13 cx` y las unidades exactas como `182 un`. Nunca se muestra un decimal de caja.

S4. Cuando el total deja resto (`unidades % unitsPerBox != 0`) se agrega una anotación compacta: ES `incluye 1 caja abierta`, PT `inclui 1 caixa aberta`. La anotación aparece sólo con resto mayor que cero; `12 + 1` no es el número principal. Singular y plural correctos.

S5. Los asientos parciales no son importables y no ofrecen importación. Se muestran como filas ERP-only de sólo lectura en Lançamentos Individuais y en Resumo Coletivo, con su operario y sus cajas. No se agrega un botón de importar a un parcial ni se habilitan cajas fraccionarias en `massa_launches`.

S6. Los asientos que cierran cajas enteras siguen importables y editables como hasta hoy. No se tocan `massas-import-policy.ts`, `massas-reconcile.ts`, la deduplicación por `ent_lan` ni el envío de cajas enteras al ERP.

S7. Lançamentos Individuais y Resumo Coletivo se alimentan de las filas unificadas (lanzamientos locales + espejo del ERP), no sólo de `launches`. No hay doble conteo: un asiento conciliado con su lanzamiento sigue siendo una fila.

S8. El filtro por trabajador usa una clave estable `operatorKey` derivada del nombre, nunca `user_id`, y ofrece también a los operarios que sólo existen en el ERP (`user_id` ausente). Al filtrar, ambas secciones muestran únicamente las filas de ese trabajador y el subtotal sale de sus unidades exactas.

S9. Paridad funcional y de textos entre web y Android; los textos existen en ES y PT con el mismo significado. No se rompe el layout móvil ni los targets táctiles existentes (≥44 px).

S10. El reporte del backend (`/api/massas/report`) devuelve las cajas enteras con la misma regla y conserva las unidades exactas; los campos nuevos son aditivos y no cambian la reconciliación.

S11. Entrega 0.7.3 / 7014: `LOCAL_APK_FILENAME='trindade-0.7.3.apk'`, `LOCAL_APK_BUILD_NUMBER=7014`, `FALLBACK_RELEASE.version='v0.7.3'`, APK firmado y sidecar en `packages/backend/apk/`, imágenes API y web reconstruidas, `/api/app/latest-release` con v0.7.3 y build 7014, descarga pública y sha256 verificados.

S12. El tag anotado `v0.7.3` se crea sobre el commit de entrega sólo después de CI verde y la release lleva el APK y el sidecar verificados. No se mueven `v0.7.0`, `v0.7.1` ni `v0.7.2`. El `versionCode` no se publica en notas públicas. Si el workflow falla, se corrige y se sube el asset verificado sin mover el tag, dejando constancia.

S13. La verificación contra el ERP físico (`192.168.25.250:1453`) sigue pendiente porque no es alcanzable desde esta máquina; el runbook se actualiza y no se inventan resultados.

## Tasks

- [ ] T1 — Documento ODD con specs, riesgos, RED/GREEN y criterios de aceptación. `S1-S13`. Commit: docs(odd).
- [ ] T2 — Backend RED: tests de 182/15, 3/10, dos líneas parciales del mismo operador-producto, producto y día. `S1-S3, S10`. Commit: fix(massas).
- [ ] T3 — Backend GREEN: `boxesForUnits` + `openBoxUnits`, acumulación por unidades y redondeo por producto. `S1-S3, S10`. Commit: fix(massas).
- [ ] T4 — Web RED: cálculo, anotación de caja abierta, resumen desde filas unificadas, filtro ERP-only, parcial no importable y entero importable. `S1-S8`. Commit: fix(web).
- [ ] T5 — Web GREEN: `massas-unified.ts`, `massas.ts`, `MassasCollectiveTable.tsx`, `MassasUnifiedTable.tsx`, páginas de lanzamiento/histórico e i18n. `S1-S9`. Commit: fix(web).
- [ ] T6 — Android RED: cálculo, anotación, secciones unificadas, filtro ERP-only, parcial no importable y entero importable. `S1-S9`. Commit: fix(android).
- [ ] T7 — Android GREEN: `MassasUnified.kt`, `MassasLogic.kt`, `MassasLaunchScreen.kt`, `MassasUnifiedTable.kt`, strings ES/PT. `S1-S9`. Commit: fix(android).
- [ ] T8 — Suites completas, typecheck, contratos y e2e móvil/escritorio. `S1-S10`. Commit: test(massas).
- [ ] T9 — Entrega 0.7.3/7014: `app.service.ts`, APK firmado y sidecar, docs, CHANGELOG y runbook. `S11-S13`. Commit: chore(release).
- [ ] T10 — Imágenes API y web, despliegue, salud y verificación de `/api/app/latest-release`, descarga y sha256. `S11`. Evidencia en el Log.
- [ ] T11 — Push a `main`, CI verde, tag anotado `v0.7.3` y release con los assets verificados. `S12`. Evidencia en el Log.
- [ ] T12 — Reporte final: commits, tests, CI, hashes, release, pendiente de ERP y confirmación de no instalación. `S13`.

## Riesgos

- R1 (alto, contrato): tocar `massas-report.service.ts` cambia el `/api/massas/report` que otros consumidores ya reciben. Mitigación: campos aditivos, cajas enteras, unidades intactas y tests de contrato/openapi.
- R2 (alto, datos): redondear cajas y guardarlas inventaría unidades en `massa_launches`. Mitigación: S5/S6; el redondeo es sólo presentación y la reconciliación sigue por unidades exactas.
- R3 (medio, UX): el `13` puede leerse como 13 cajas cerradas. Mitigación: S4, anotación de caja abierta.
- R4 (medio, paridad): web y Android divergen (hoy Android trunca). Mitigación: misma función y casos de prueba en ambas capas.
- R5 (alto, entrega): un release con APK equivocada o un tag movido deja a la planta sin actualización. Mitigación: S11/S12, verificación de `/api/app/latest-release`, sha256 y tag inmutable.

## Log

L1 — Pedido del usuario (verbatim):

> Continuamos en Trindade, en /home/wilkin/proyectos/Trindade, rama main, sin ramas nuevas. Ya hiciste la investigación read-only de los dos defectos reportados y el usuario aprobó estas cuatro decisiones. Debes implementarlas de punta a punta, con TDD estricto, y dejar todo listo, publicado y documentado.
>
> DECISIONES APROBADAS (no las reinterpretes)
> 1. Cajas con decimales: usar `ceil` del TOTAL de unidades dividido por `unitsPerBox`, por producto y por operador, recalculado siempre desde las unidades exactas. NO sumar los `ceil` de cada línea. Ejemplo: 182 un / 15 = 12.1333 → 13 cajas. Dos líneas de 3 un con caja de 10 dan 1 caja, no 2. Los totales deben salir de las filas unificadas y de las unidades exactas, no de valores ya redondeados.
> 2. Asientos parciales: NO habilitar su importación local. Mostrarlos como filas ERP-only de solo lectura en Lançamentos Individuais y Resumo Coletivo, con filtro por trabajador. Los asientos de cajas enteras siguen importables y editables como hasta ahora. No tocar la reconciliación ni la política de importación salvo lo mínimo de presentación; no inventar unidades.
> 3. Leyenda: mostrar el número principal como `13 cx` y las unidades exactas como `182 un`; agregar una anotación compacta solo cuando haya resto: `inclui 1 caixa aberta` / `incluye 1 caja abierta` (con las unidades abiertas si aporta). No mostrar `12 + 1` como número principal. Mantener paridad web/Android y ES/PT.
> 4. Entrega: 0.7.3 / build 7014, con release propia. No mover `v0.7.2`; 7014 > 7013 para no degradar. Tag anotado y GitHub Release solo después de CI verde. Reconstruir la imagen nueva de API y web, desplegarla y verificar `/api/app/latest-release`.
>
> ALCANCE TÉCNICO
> - Backend: `packages/backend/src/modules/massas/massas-report.service.ts` y consumidores; el reporte debe devolver cajas enteras calculadas con ceil del total, conservando unidades exactas. Tests RED con 182/15, 3/10 y dos líneas parciales del mismo producto/operador. No cambies la reconciliación.
> - Web: `massas-unified.ts`, `massas.ts`, `MassasCollectiveTable.tsx`, `MassasUnifiedTable.tsx`, páginas de lanzamiento/histórico e i18n. Las secciones Individuais y Resumo Colectivo deben alimentarse de las filas unificadas (espejo + locales), no solo de `launches`. Incluir operarios ERP-only aunque no tengan `user_id`; usar una clave estable `operatorKey` para filtrar, nunca `user_id` como identidad del espejo. Evitar doble conteo y respetar la deduplicación por `ent_lan`.
> - Android: `MassasUnified.kt`, `MassasLogic.kt`, `MassasLaunchScreen.kt`, `MassasUnifiedTable.kt`, strings ES/PT. Mismo ceil de total, mismas secciones unificadas, mismo filtro por `operatorKey`, filas ERP-only de solo lectura. Debe quedar paridad funcional con web.
> - UI: el número `13` no debe confundirse con 13 cajas cerradas; la anotación de caja abierta aparece solo con resto > 0. No agregar botón de importar a un parcial. No romper el layout móvil ni los targets táctiles existentes.
> - Tests obligatorios (RED antes del fix): backend 182/15 y agrupación; web cálculo, render y filtro ERP-only; Android cálculo, render y filtro; prueba de que un parcial no ofrece importación; prueba de que un asiento de caja entera sigue importable; e2e móvil/escritorio. Typecheck, contratos y suites completas.
>
> ENTREGA 0.7.3 / 7014
> - Actualizar `LOCAL_APK_FILENAME='trindade-0.7.3.apk'`, `LOCAL_APK_BUILD_NUMBER=7014`, `FALLBACK_RELEASE.version='v0.7.3'`, copiar APK firmado y sidecar a `packages/backend/apk/`.
> - Compilar APK firmado con versionName 0.7.3 y build 7014; verificar con aapt2/apksigner; no instalar en emulador ni teléfonos.
> - Reconstruir imágenes API y web, reiniciar y comprobar salud; verificar `/api/app/latest-release` (v0.7.3, buildNumber 7014, tamaño), descarga pública y sha256.
> - Documentar ODD nuevo, CHANGELOG, release docs/historial y guías; no publicar el versionCode como valor en notas públicas. Dejar evidencia de tests y del caso 182/15.
> - Tag anotado `v0.7.3` sobre el commit de entrega; release con APK+sidecar verificados contra producción. No mover `v0.7.0`, `v0.7.1` ni `v0.7.2`. No crear release vacía: si el workflow falla, corrige y sube el asset verificado sin mover el tag, y deja constancia.
> - Todo a `main`, sin worktrees/ramas. La verificación contra el ERP físico de la fábrica sigue pendiente porque `192.168.25.250:1453` no es alcanzable desde esta máquina; deja el runbook actualizado y no inventes resultados.
>
> ORDEN
> 1. ODD `odd/tasks/remediacion-cajas-abiertas-operarios-erp-0.7.3.md` con specs, riesgos, RED/GREEN y criterios de aceptación; commit.
> 2. Backend TDD y tests.
> 3. Web TDD.
> 4. Android TDD y paridad.
> 5. Suites completas, build 7014, imágenes, despliegue y verificación.
> 6. Push main, CI verde, tag/release v0.7.3.
> 7. Reporta avances por fase, commits, tests, CI, hashes, release, pendiente real de ERP y confirmación de no instalación.
>
> Trabaja en ciclos de control de 5 minutos. Si una decisión bloquea o el workflow no puede garantizar 7014/publicación segura, detente y reporta antes de publicar algo incorrecto.

L2 — Convención de cálculo decidida en la implementación: `boxesForUnits(units, upb) = upb > 0 ? Math.ceil(units / upb) : 0` y `openBoxUnits = upb > 0 && units % upb > 0 ? units % upb : 0`. El total de un operador o del día suma las cajas ya calculadas por producto, porque no existe un `unitsPerBox` único para unidades mezcladas (S2).

L3 — Investigación previa (read-only, sin cambios): `aero_movements` de producción confirma 182 un de MASSA QUADRADA (`001192`, upb 15) en `ent_lan 35983`, operario VINICIUS R, el 2026-11-04, y 8 de 40 asientos de masas del espejo no son divisibles por su `unitsPerBox` (3/10, 4/15, 172/10, 456/20, 182/15). La web imprimía `12.133333333333333 cx` y Android truncaba a `12` (y a `0` por debajo de una caja). Las secciones individual y colectiva se derivaban sólo de `launches` y `extractOperators` exigía `user_id`.
