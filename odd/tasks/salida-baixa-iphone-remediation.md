# Salida / Baixa — remediación iPhone y compartir por WhatsApp

La captura del usuario (`/home/wilkin/adjuntos/photo_AQAD-AxrG9sLyEd-.jpg`, Histórico de Salidas del
14/11/2026, 390 px) muestra tres defectos de lectura y uno de producto: el título se parte en tres líneas y el
subtítulo en seis por un header de dos columnas, los chips de bloque caen en tres filas, el estado vacío es un
párrafo sin acción, y **no hay ningún botón de compartir a la vista**. Además el menú tiene el módulo en el lugar
equivocado y la pantalla de lanzamiento muestra «Solo wilkin». Esta entrega es **solo frontend/i18n**: no toca
backend, Android, la migración ni el guard `wilkin`.

## Specs

R1 — Menú. `Salida/Baja` y `Histórico de Salidas` quedan inmediatamente después de `Lanzamiento de Masas`, en
ese orden. Orden esperado: Lanzamiento de Masas → Salida/Baja → Histórico de Salidas → Calculadora Assaí →
Calculadora de Stock → Histórico de Masas.

R2 — Sin texto visible «Solo wilkin» ni «Beta privada». El guard del servidor y `isSalidaVisible` **no cambian**:
el módulo sigue siendo solo para `wilkin` hasta que el usuario lo libere, y ningún otro rol gana acceso.

R3 — Header responsive en `/salida` y en `/salida-history`: en 390 px el título ocupa el ancho completo (una o
dos líneas como máximo) y el subtítulo no se convierte en una columna; las acciones bajan a una fila propia, a
ancho completo, y en desktop vuelven a la misma fila.

R4 — Filtros del histórico: los chips de bloque quedan **2x2** en móvil (`Todos`, `Embalagens` / `Bobinas`,
`Matéria-Prima`) y en una fila flexible en desktop; `Conferir no ERP` y `Compartir no WhatsApp` ocupan el ancho
completo en móvil y comparten fila en desktop.

R5 — Estado vacío con ícono, título, copy y CTA `Lançar saída`. El botón de compartir del día queda **visible y
deshabilitado**, con el helper «Sem saídas para compartilhar».

R6 — El botón de compartir de cada movimiento es verde, con ícono de WhatsApp, texto `Compartir por WhatsApp` /
`Compartilhar no WhatsApp` y objetivo táctil de 44 px.

R7 — Compartir con texto **y fotos**: por movimiento (las suyas) y del día (todas las de los movimientos
visibles). El texto del día resume fecha, cantidad de movimientos, total de unidades y cada movimiento con
operador, bloques, productos, cantidades y estado. Si el navegador no tiene hoja de compartir, el fallback abre
WhatsApp (`https://api.whatsapp.com/send?text=…`); si el popup falla, copia el texto. Nunca se inventan URLs
públicas: se usan las `publicUrl` de las fotos.

R8 — Un solo helper de compartir. El diálogo de éxito reutiliza `salidaPhotoFiles` y `shareSalida`; no hay dos
comportamientos. Toda cadena nueva existe en `es.json` y `pt-BR.json` con paridad.

## Tasks

- T1 (R1, R2) — hecho, commit `0717cbcf`: menú reordenado y badges visibles eliminados, con test de orden y
  de ausencia. Ruta: inline.
- T2 (R8, R7) — hecho, commit `0717cbcf`: `salidaDaySummaryText`, `salidaPhotoFiles`, fallback WhatsApp en
  `shareSalida` y el diálogo usando el helper común. Ruta: inline.
- T3 (R3) — hecho, commit `0717cbcf`: headers apilados en móvil. Ruta: inline.
- T4 (R4, R5, R6) — hecho, commit `0717cbcf`: chips 2x2, fila de acciones, vacío con CTA y botón verde por
  movimiento. Ruta: inline.
- T5 (R7) — hecho, commit `0717cbcf`: compartir del día y por movimiento con fotos. Ruta: inline.
- T6 — hecho: node 706/706, vitest 171/171 y typecheck limpio (L2). Ruta: inline.
- T7 — hecho, ver L3: push a `origin/main`, deploy de `web`, salud, `/salida-history` 200 y textos nuevos en
  el bundle sin «Solo wilkin». Ruta: inline.

## Invariantes

- El guard `wilkin` del servidor, `isSalidaVisible` y las rutas no cambian: la beta sigue cerrada.
- Ningún texto visible menciona «Solo wilkin» ni «Beta privada».
- El compartir nunca inventa una URL pública y nunca pierde el texto si las fotos no se pueden adjuntar.
- El botón de compartir del día está siempre presente en el histórico; sin movimientos está deshabilitado y
  explica por qué.
- 390 px: título en una o dos líneas, subtítulo legible, chips 2x2 y el botón verde de WhatsApp visible sin
  scrollear.
- i18n con paridad y sin claves muertas nuevas.

## Criterios de aceptación

1. En el menú, Salida/Baja y su histórico están justo debajo de Lanzamiento de Masas, en ese orden.
2. La pantalla de lanzamiento no muestra «Solo wilkin» ni «Beta privada», y ningún otro rol gana acceso.
3. En 390 px el header de ambas páginas apila título y acciones; el título no se parte en tres líneas.
4. Los chips quedan 2x2 en móvil y las acciones del histórico ocupan el ancho completo.
5. El histórico ofrece compartir del día (texto + fotos) siempre visible, deshabilitado con el helper cuando no
   hay movimientos, y compartir verde por movimiento (texto + fotos).
6. El fallback abre WhatsApp o copia el texto, y el diálogo de éxito comparte igual que el histórico.
7. Suites node/unit y typecheck verdes; deploy de `web` sano y bundle con los textos nuevos.

## Log

L1 — pedido del usuario. El mensaje completo (con los diez hallazgos numerados y su línea de código) vive en la
sesión; acá van, textuales, el diagnóstico y las tres decisiones de producto, que son las que no se reinterpretan:

  «Necesito que remedies la vista de iPhone y pulas el compartir del módulo Salida / Baixa. […] El problema
  visible: el header está en dos columnas en 390 px, el título se parte en 3 líneas y el subtítulo en 6; los chips
  caen en 3 filas; y no hay ningún botón de compartir visible.»

  «Mover Salida/Baja (y su Histórico de Salidas) en el menú justo debajo de Lanzamiento de Masas.»

  «Quitar el texto visible “Solo wilkin” / “Solamente wilkin”. El guard del servidor y `isSalidaVisible` siguen
  igual: el módulo sigue siendo solo para `wilkin` hasta que el usuario lo libere. No abras el acceso a otros
  roles.»

  «Hacer visible y funcional el compartir por WhatsApp en el histórico: botón verde en la tarjeta de filtros
  (resumen del día) y en cada movimiento, con texto + fotos y fallback a WhatsApp/copiar. El diálogo de éxito ya
  tiene el botón; unificá el helper.»

  Objetivo visual textual: «en 390 px el título se lee en una línea (o dos como máximo), el subtítulo no se
  convierte en una columna de 6 líneas, los chips quedan 2x2, y el botón verde de WhatsApp está visible sin
  scrollear.»

L2 — ejecución y evidencia.

  Tests primero, con rojo observado. RED de la capa de datos: `node --test src/lib/salida-share.test.ts` falla
  porque `salidaDaySummaryText` y `salidaPhotoFiles` no existen y `shareSalida` no abre WhatsApp. RED del orden
  del menú: `salida-nav-order.test.ts` falla porque el bloque de salida está después de `massas-history`. RED de
  las páginas: `vitest run src/pages/salida` → **8 de 32 casos fallando**, que son exactamente los nuevos: badges
  visibles, header sin apilar, chips sin grilla, sin botón de compartir del día, sin CTA en el vacío y sin fotos
  en el compartir.

  GREEN: `npm --workspace=packages/frontend run test:node` **706/706**; `NODE_ENV=test … test:unit`
  **171/171** (24 archivos); `npm run typecheck` sin errores. Commit `0717cbcf`
  (`feat(web): make salida readable and shareable on an iPhone`), 13 archivos, +761/−77.

  Cambios por spec:
  - R1: el bloque `isSalidaVisible(user)` quedó inmediatamente después de `/massas-launch`, antes de las
    calculadoras; el test de orden comprueba la secuencia completa y que la guarda sigue envolviendo los dos ítems.
  - R2: se quitaron los dos badges de `SalidaLaunchPage` y las claves `betaBadge`/`soloWilkin` de ambos locales
    (diff de i18n: +12/−6, sin reordenar el bloque). El guard del servidor, `isSalidaVisible` y las rutas no
    cambiaron.
  - R3: `salida-launch-header` y `salida-history-header` usan
    `flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`; acciones `w-full sm:w-auto` y botones
    `flex-1 sm:flex-initial`.
  - R4: `SalidaBlockFilter` pasa a `grid grid-cols-2 gap-2 sm:flex sm:flex-wrap`, y la fila de acciones a
    `grid grid-cols-1 gap-2 … sm:flex sm:items-center sm:justify-between` con los dos botones `w-full sm:w-auto`.
  - R5: el vacío es una tarjeta con ícono, título, copy y CTA `Lançar saída`; el compartir del día queda visible
    y deshabilitado con el helper `Sem saídas para compartilhar`.
  - R6: el botón por movimiento es verde, con ícono de WhatsApp, `Compartilhar no WhatsApp` y 44 px.
  - R7: `salidaDaySummaryText` (fecha, cantidad, operador, bloques, productos, estado y total calculado desde los
    ítems) y `salidaPhotoFiles` (fetch de `publicUrl`, `File` por foto, una foto ilegible no rompe el share);
    `shareSalida` adjunta fotos cuando la plataforma puede, si no abre WhatsApp y, si el popup se bloquea, copia.
  - R8: el diálogo de éxito ya no tiene su propio lector de fotos: usa `salidaPhotoFiles`, y comparte con el mismo
    `shareSalida`.

  Un test viejo de la página cambió de capa: el que verificaba el copiado con clipboard ahora comprueba que la
  tarjeta entrega el texto correcto al helper; el comportamiento del clipboard y del popup vive en
  `lib/salida-share.test.ts`, que cubre los tres caminos (hoja con archivos, WhatsApp y copiado).

L3 — despliegue del contenedor `web` y verificación.

  `docker compose up -d --build web` reconstruyó `web` y recreó `api` como dependencia; ambos quedaron
  `Up (healthy)` (127.0.0.1:8085 y :3005). `GET /api/health` → `{"status":"ok"}`; `GET /salida-history` → `200`.
  El bundle publicado (`assets/index-D9oHXsaN.js`) contiene «Compartilhar o dia» y «Sem saídas para compartilhar»,
  y **ya no contiene «Solo wilkin»**: el badge salió del binario, no solo de la pantalla.

  No se desplegaron backend, migración ni Android: la revisión sigue en 11 y el guard `wilkin` no cambió
  (`GET /api/salida/catalog` sin sesión sigue respondiendo `401`).

  Lo que no se puede probar acá: Playwright sigue sin correr en este host (Ubuntu 26.04, sin Chromium soportado,
  ver L7 del documento principal), así que el 390 px se verifica por clases y DOM, no por captura. Queda para el
  usuario la prueba real en el iPhone.
