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

- T1 (R1, R2) — Reordenar el menú y quitar los badges visibles, con tests de orden y de ausencia. Ruta: inline.
- T2 (R8, R7) — `salidaDaySummaryText` y `salidaPhotoFiles` en `lib/salida.ts`, fallback WhatsApp en
  `shareSalida`, y el diálogo de éxito usando el helper común. Ruta: inline.
- T3 (R3) — Headers responsive de las dos páginas. Ruta: inline.
- T4 (R4, R5, R6) — Chips 2x2, fila de acciones, estado vacío con CTA y botón de compartir verde por movimiento.
  Ruta: inline.
- T5 (R7) — Compartir del día y por movimiento con fotos en el histórico. Ruta: inline.
- T6 — Suites, typecheck y evidencia. Ruta: inline.
- T7 — Commit, push, deploy del contenedor `web` y verificación de salud y bundle. Ruta: inline.

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
