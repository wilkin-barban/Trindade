# Remediación: catálogo de masas de 10 códigos y separación Masas/Insumos en Relatório

Feature `remediacion-masas-vs-insumos-0.7.4`, rama `main`, sin worktrees. Entrega `0.7.4` con build interno `7015`.
La clasificación ya es por código: `MASSAS` tiene 10 y todo código fuera de esos 10 es insumo. Esta feature no
cambia el catálogo ni la base: unifica el predicado, lo prueba como invariante y separa los dos bloques en la UI.

## Specs

- **S1 — El catálogo son exactamente 10 códigos, y la clasificación es por código.** Los códigos canónicos son
  `1045, 39, 60, 84, 91, 1192, 5000, 1047, 22, 1616`; cualquiera de ellos es masa y cualquier otro código es
  insumo. La descripción nunca decide: un asiento cuyo `product_desc` empieza con «MASSA P PIZZA» es insumo si su
  código no está en los 10.
- **S2 — Una sola fuente de verdad y un predicado compartido.** `isMassa(code)` vive junto a `MASSAS` en
  `packages/backend/src/modules/stock/stock.catalog.ts` y normaliza los ceros de relleno del ERP (`000084` → `84`)
  con la misma regla que `erpCodeKey`. Lo usan `massasReportDayView` (a través de la selección de asientos de masa),
  `supplyReceipts` y `movementLenses`; ningún consumidor mantiene su propio `Set` de códigos.
- **S3 — Se clasifica al leer, no al guardar.** El espejo `aero_movements` sigue guardando todos los asientos que el
  ERP devolvió y no se migra ni se filtra al escribir. La lente es de presentación.
- **S4 — Invariantes del backend, probados.** (a) `MASSAS` contiene exactamente los 10 códigos canónicos, sin
  faltantes ni sobrantes; (b) cada código de masa aparece sólo en el bloque de masas; (c) todo código fuera de los 10
  —incluidos `107`, `138`, `1591`, `1800` y un insumo ficticio— aparece sólo en insumos; (d) no hay intersección
  entre los dos bloques y la unión cubre todos los asientos de entrada del día; (e) una descripción «MASSA P PIZZA»
  con un código ajeno no convierte ese asiento en masa.
- **S5 — Web, Relatório: dos bloques con títulos propios y listas que no se mezclan.** Masas e Insumos se dibujan
  como bloques visualmente separados, cada uno con su título y su propia lista; puede quedar un único botón de
  sincronización. Los productos salen de la respuesta del backend, no de una lista local. Los textos ES/PT aclaran
  que Insumos incluye productos que no son masa, incluidos los terceirizados.
- **S6 — Android, Relatório: misma separación y paridad con la web.** `massasDay` y `receipts` siguen siendo fuentes
  distintas y se renderizan en bloques separados con títulos claros; los productos y el contrato vienen del backend,
  sin lista hardcodeada, y los textos ES/PT dicen lo mismo que la web.
- **S7 — Pruebas de la separación en web, Android y e2e.** Un fixture con los 10 códigos de masa y un asiento
  `MASSA P PIZZA` de código ajeno: el bloque de masas no lo muestra y el de insumos sí; una masa no aparece en
  insumos; el módulo Lançamento de Massas sigue mostrando los 10 productos.
- **S8 — Documentación coherente y sin reescribir el pasado.** El ODD nuevo, `CHANGELOG.md` y los docs de reportes y
  ERP dejan explícito que 10 códigos son masa y el resto es insumo. Las referencias históricas a «8 masas» se
  conservan como hechos del pasado y se aclaran con la regla vigente. Queda constancia de que no se toca el catálogo
  ni la base.
- **S9 — Entrega 0.7.4 (build 7015).** `LOCAL_APK_FILENAME='trindade-0.7.4.apk'`,
  `LOCAL_APK_BUILD_NUMBER=7015`, `FALLBACK_RELEASE.version='v0.7.4'`, APK firmado y sidecar copiados a
  `packages/backend/apk/`; imágenes API/web reconstruidas y desplegadas; salud, `/api/app/latest-release`
  (`v0.7.4`, `buildNumber 7015`, tamaño), descarga y sha256 verificados; suites completas y typecheck en verde; CI
  de `main` verde; tag anotado `v0.7.4` sobre el commit de entrega y release con APK y sidecar verificados contra
  producción. `v0.7.0`, `v0.7.1`, `v0.7.2` y `v0.7.3` no se mueven. Si el workflow falla, no queda release vacía ni se
  mueve un tag: se corrige, se sube el asset verificado y se documenta. El host ERP de fábrica sigue inalcanzable y
  no se inventan pruebas reales contra él.

## Tasks

| ID | Specs | Ruta | Commit |
|----|-------|------|--------|
| T1 | S8 | Escribir este ODD antes de tocar código | — |
| T2 | S1-S3 | Backend: `isMassa` en el catálogo y los tres consumidores usándolo | — |
| T3 | S4 | Backend: tests de invariante del catálogo y de las dos lentes | — |
| T4 | S5, S7 | Web: bloques Masas/Insumos, textos ES/PT y tests de la separación | — |
| T5 | S6, S7 | Android: bloques, strings ES/PT y tests del contrato | — |
| T6 | S7 | e2e web y fixture de los 10 códigos; Lançamento sigue con 10 productos | — |
| T7 | S8 | Docs, CHANGELOG y aclaración de las referencias históricas a 8 masas | — |
| T8 | S9 | Suites completas, typecheck y APK firmado 0.7.4 / 7015 | — |
| T9 | S9 | Imágenes, despliegue y verificación de `/api/app/latest-release` | — |
| T10 | S9 | CI de main, tag anotado `v0.7.4` y release con APK y sidecar verificados | — |

## Log

- **L1 — 2026-11-04, pedido del usuario (verbatim).**

  > Rectificación del usuario: el catálogo de masas son **10 códigos**, no 8. Todo producto que no esté en esos 10
  > códigos es insumo. Códigos canónicos: `1045, 39, 60, 84, 91, 1192, 5000, 1047, 22, 1616`.
  >
  > Trabaja en /home/wilkin/proyectos/Trindade, rama main, sin ramas nuevas ni worktrees. Primero lee el estado
  > actual y crea un ODD de esta remediación (`odd/tasks/remediacion-masas-vs-insumos-0.7.4.md`) antes de tocar
  > código. TDD estricto: test RED, implementación, GREEN. No instales APK en emulador ni teléfonos.
  >
  > DIAGNÓSTICO QUE DEBES CERRAR
  > - La clasificación ya es por código, no por descripción: `MASSAS` tiene 10 y `supplyReceipts` excluye esos
  >   códigos. No cambies el catálogo ni inventes una lista de 8.
  > - Corrige toda documentación/ODD que presente “8 masas” como regla vigente. Deja explícito: 10 códigos son masa;
  >   cualquier otro código es insumo. Las referencias históricas deben quedar aclaradas, no reescribir hechos del
  >   pasado.
  > - `MASSA P PIZZA KIT`, `MASSA P PIZZA TRINDADE`, etc. son insumos si su código no está en los 10. No uses el
  >   nombre para clasificar.
  >
  > ALCANCE
  > 1. Backend: una sola fuente de verdad para los 10 códigos y un predicado compartido `isMassa(code)` para
  >    `massasReportDayView`, `supplyReceipts` y `movementLenses`. No filtres el espejo al guardar; clasifica al leer.
  >    No migres `aero_movements`.
  > 2. Tests de invariante backend:
  >    - `MASSAS` contiene exactamente los 10 códigos canónicos;
  >    - cada código de masa aparece solo en el bloque de masas;
  >    - cualquier código fuera de los 10 (incluye 107, 138, 1591, 1800 y un insumo ficticio) aparece solo en
  >      insumos;
  >    - no hay intersección y la unión cubre todos los asientos de entrada;
  >    - una descripción que empieza con “MASSA P PIZZA” no convierte un código en masa.
  > 3. Web: en Relatório, separa visualmente **Masas** e **Insumos** en bloques/tarjetas distintas, con títulos
  >    claros y sin compartir la lista. Puede quedar un solo botón de sincronización si el diseño lo pide, pero los
  >    rows de cada bloque no se mezclan. Usa los productos del backend, no una lista local. String ES/PT que aclare
  >    que insumos incluye productos que no son masa/terceirizados.
  > 4. Android: misma separación visual y funcional en el módulo Relatório; `massasDay` y `receipts` siguen siendo
  >    fuentes distintas. Usa los productos/contrato del backend, sin lista hardcodeada. Paridad con web.
  > 5. Tests web/Android/e2e: fixture con los 10 códigos de masa y con “MASSA P PIZZA” como insumo; comprobar que no
  >    aparece en el bloque de masas y sí en insumos; comprobar que una masa no aparece en insumos; comprobar que el
  >    módulo Lanzamiento de Masas sigue mostrando los 10 productos.
  > 6. Documentación: ODD nuevo, CHANGELOG, docs de reportes/ERP y cualquier referencia a “8 masas”. No publiques el
  >    build interno como valor en notas públicas. Deja constancia de que no se toca el catálogo ni la base.
  >
  > ENTREGA
  > - Como hay cambios de UI en Android, publica `0.7.4` con build `7015` (>7014). Actualiza
  >   `LOCAL_APK_FILENAME='trindade-0.7.4.apk'`, `LOCAL_APK_BUILD_NUMBER=7015`,
  >   `FALLBACK_RELEASE.version='v0.7.4'`, copia APK firmado y sidecar a `packages/backend/apk/`.
  > - Reconstruye imágenes API/web, despliega y verifica salud, `/api/app/latest-release` (v0.7.4, buildNumber 7015,
  >   tamaño), descarga y sha256.
  > - Suites completas y typecheck; build firmado; CI main verde; tag anotado `v0.7.4` sobre el commit de entrega y
  >   release con APK+sidecar verificados contra producción. No muevas `v0.7.0`, `v0.7.1`, `v0.7.2` ni `v0.7.3`.
  > - Si el workflow falla, no dejes release vacía ni muevas tags: corrige, sube el asset verificado y documenta. El
  >   host ERP de fábrica sigue inalcanzable; no inventes pruebas reales.
  > - Todo a main, sin ramas. Reporta commits, tests, CI, hashes, release y pendientes. Trabaja en ciclos de 5 minutos
  >   y no te desvíes a features ajenas.
