# Espejo ERP viejo al reanudar Massas — remediación 0.7.4 / build 7018

Android · `MassasLaunchViewModel` · misma release pública `v0.7.4`, build interno nuevo `7018`.
Sin cambios en la lógica de reconciliación ni en el backend de negocio.

## Specs

S1 — El defecto es de refresco, no de reconciliación. Al reanudar la pantalla, `onScreenActive(true)`
sólo arranca el polling; `silentRefresh()` únicamente actualiza `dayView` y nunca vuelve a leer
`aeroMirror`. `refreshMirror()` sólo corre al iniciar, al cargar el día y después de un envío. Por eso la
UI puede quedar en `PENDING_ERP` ofreciendo Editar/Eliminar cuando el ERP ya tiene los asientos.

S2 — Caso real que la prueba tiene que reproducir, exactamente: lanzamientos **#113** (producto **22**,
**8 cajas = 120 unidades**) y **#114** (producto **5000**, **30 cajas = 300 unidades**), ambos del usuario
**`jaime`**; asientos del ERP **36017** (`000022` / 120 / JAIME) y **36018** (`005000` / 300 / JAIME),
ambos del mismo día.

S3 — Con ese espejo, las dos filas deben quedar `RECONCILED`, `reconciledLaunchIds` debe contener
`{113, 114}`, y `canEdit` debe responder `false` para ambas. El borrado debe rechazarse.

S4 — Reanudación: si el repositorio devuelve primero un espejo viejo (sin asientos) y después los dos
asientos, llamar `onScreenActive(true)` debe refrescar el espejo y dejar las dos filas conciliadas, sin
reiniciar la app y sin esperar al temporizador del polling.

S5 — UI: con esas dos filas ya conciliadas no se dibujan Editar ni Eliminar. La UI actual ya oculta las
acciones cuando el estado es el correcto; el defecto era el estado, no el dibujo.

S6 — GREEN mínimo: un `refreshDayAndMirror(date)` que lea el día y el espejo, respetando el token de fecha
y conservando el último espejo bueno si la lectura falla. Se usa en `onScreenActive(true)` para hoy, en el
polling y en la carga/recarga del día.

S7 — `loadDay()` no limpia `aeroMirror` cuando se recarga el mismo día; lo limpia sólo al cambiar de
fecha. Hoy lo limpia siempre, así que una recarga del mismo día vacía el espejo aunque después falle la
lectura.

S8 — La regla de reconciliación y los controles de la UI no cambian. Nada de backend de negocio
(`/api/massas-launch/*`), ni de `MassasUnified.kt`, ni del dibujo de acciones.

S9 — Entrega: misma release pública `v0.7.4`, build interno **7018** (`versionName 0.7.4`,
`versionCode/buildNumber 7018`). Sin tag nuevo ni release nueva; `v0.7.4` sigue en `4aef9141` y
`v0.7.0`–`v0.7.3` no se tocan. Assets `trindade-0.7.4.apk` y `.sha256` reemplazados con `--clobber`.

S10 — Un 7017 instalado tiene que detectar la actualización por `buildNumber` (`SAME_RELEASE_PATCH`), no
por versión ni por tamaño.

S11 — Producción: `/api/app/latest-release` publica 7018, y el asset de GitHub, el APK local y la descarga
de `/api/app/download-apk` son byte a byte el mismo binario (mismo sha256).

S12 — Suites afectadas completas en verde, CI de `main` en verde, CHANGELOG, docs y notas internas
actualizados. El APK no se instala en emulador ni teléfono.

## Tasks

| ID | Qué | Specs | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | Este documento + espejo en Engram + todo | S1-S12 | ODD | (mismo) |
| T2 | RED: reconciliación #113/#114 con asientos 36017/36018 | S2, S3 | inline | f9440df6 |
| T3 | RED: reanudación refresca el espejo (viejo → dos asientos) | S4 | inline | f9440df6 |
| T4 | RED: sin Editar/Eliminar con filas conciliadas | S5 | inline | f9440df6 |
| T5 | GREEN: `refreshDayAndMirror`, uso en resume/polling/carga, limpieza sólo al cambiar de fecha | S6, S7 | inline | 18bfb788 |
| T6 | Suite Android completa + backend + web | S12 | inline | ee24e1a9 |
| T7 | Build 7018: constante, aserciones de `app.service`, pin `UpdateDetector`, APK firmado | S9, S10 | inline | ee24e1a9 |
| T8 | Publicación: assets `--clobber`, notas, deploy, verificación byte a byte | S9-S11 | inline | ee24e1a9 |
| T9 | Docs, CHANGELOG, cierre del ODD, commits y CI | S12 | inline | (este documento) |

## Log

L1 — Pedido del usuario (verbatim):

> Necesito que tomes la remediación del caso de Android que verifiqué hoy y la lleves hasta el cierre. El backend está bien: los lanzamientos #113 (producto 22, 8 cajas = 120 unidades) y #114 (producto 5000, 30 cajas = 300 unidades), ambos de JAIME, ya están en el ERP como asientos 36017 y 36018. La web ya los muestra conciliados. El defecto está en Android: el espejo local queda viejo y la pantalla sigue mostrando Editar/Eliminar aunque la ERP ya tenga los dos asientos.
>
> El problema concreto está en `MassasLaunchViewModel`: al reanudar la pantalla, `onScreenActive(true)` solo arranca el polling; `silentRefresh()` únicamente actualiza `dayView` y nunca vuelve a leer `aeroMirror`. `refreshMirror()` solo corre al iniciar, al cargar el día y después de un envío. Además, `loadDay()` limpia `aeroMirror` aunque sea una recarga del mismo día. Por eso la UI puede quedar en `PENDING_ERP` y ofrecer acciones que ya no corresponden.
>
> Quiero que lo corrijas con TDD y ODD, sin tocar la lógica de reconciliación ni el backend de negocio: [S1-S12 resumidos arriba]
>
> La cadencia de supervisión la manejo yo; vos trabajá hasta terminar y reportame el resultado. Si encontrás un defecto adicional, no lo mezcles silenciosamente: documentalo y decidí si entra en este mismo 7018 o queda fuera.

L2 — Evidencia del defecto, antes de escribir una línea. La pantalla de Masas llama a `onScreenActive(true)` al
reanudar; eso arranca el polling, y `silentRefresh()` sólo escribía `dayView`. `refreshMirror()` corría al
iniciar, en `loadDay` y después de un envío. `loadDay` vaciaba `aeroMirror` incluso cuando la fecha pedida era la
que ya estaba en pantalla, así que una recarga del mismo día tiraba el espejo y lo volvía a pedir; si la lectura
fallaba, la pantalla se quedaba sin asientos y ofrecía Editar para lo que la planta ya tenía.

L3 — Extracción para poder probar la regla de la fila. `MassasLaunchRowActions` sale de `MassasLaunchScreen` sin
cambiar lo que dibuja; la prueba de UI lo monta solo con `TrindadeTheme` y comprueba qué botones existen según el
estado de la fila. No es refactor de adorno: sin el composable aparte, la única forma de afirmar «no hay Editar»
sería arrancar la pantalla entera con Hilt.

L4 — ROJO observado, dos veces, porque el primero no fue un rojo limpio. Primer intento: las pruebas no compilaban
(`MassaIndividualLaunch` sin importar en la pantalla y `TrindadeTheme` en el paquete equivocado en la prueba).
Segundo intento: 36 pruebas, 1 fallo y una prueba colgada; el cuelgue apareció como «skipped» con 766 segundos. La
causa era mía: el polling que arranca `onScreenActive(true)` quedaba vivo cuando la aserción reventaba, y `runTest`
no puede drenar un `while(true)`. El `try/finally` que apaga el polling convirtió el caso en un rojo de verdad.

L5 — ROJO limpio, job-18: `MassasLaunchViewModelTest > reloading the same day keeps the mirror it already read
FAILED — java.lang.AssertionError: expected:<[36017]> but was:<[]>` y `coming back to the screen re-reads the
mirror and settles the rows FAILED`. La reconciliación de #113/#114 y las tres pruebas de UI ya pasaban: son
caracterización, no defecto.

L6 — GREEN, job-19: `MassasLaunchViewModelTest` 57/57, `MassasLaunchRowActionsTest` 3/3, BUILD SUCCESSFUL. Dos
correcciones sobre el primer borrador: `refreshDayAndMirror` no toca `errorMessage` (un turno de polling cada
quince segundos borraría el motivo por el que se rechazó un lanzamiento) y `loadDay` sigue siendo el único que
anuncia una carga vacía.

L7 — Suites, job-20: Android 1390/1390 sin fallos ni omisiones (`:app:testDebugUnitTest` + `:app:assembleRelease`),
backend 737/737, web `test:unit` 126/126. `npm --workspace=packages/frontend test:node` no existe en este
proyecto: el script es `test:unit`, y así quedó verificado. El pin nuevo de `UpdateDetectorTest` se validó aparte,
job-21: BUILD SUCCESSFUL con 7018/7017 y 7018/7016.

L8 — Publicación y verificación. APK firmado con el certificado del proyecto (`CN=Trindade Massas Operacoes`,
SHA-256 `ee0e404b…c431f6`), `aapt2 dump badging` → `versionCode='7018' versionName='0.7.4'`, sha256
`8c9261515359a64b71a6abb9602d60e1f7db28d95c60ad72747e559e0b2eb522`, 11.296.176 bytes. Assets de `v0.7.4`
reemplazados con `--clobber`; el digest que publica GitHub es el mismo. `docker compose build api` + `up -d
--no-deps api`. Producción: `/api/app/latest-release` devuelve `v0.7.4` + `buildNumber: 7018`, y el APK
descargado de `/api/app/download-apk` tiene el mismo sha256 y el mismo tamaño que el local. Sin migración: la
revisión de la base no cambia.

L9 — Riesgo. Ninguno de los seis: no toca datos almacenados ni formatos, no toca permisos, no cambia contratos (la
respuesta de `latest-release` sólo cambia el entero que ya existía), no hay concurrencia nueva, no hay dependencias
ni CI nueva, y las dos reglas que cambiaron tienen prueba que las fija. El llamador del polling sí es compartido
con el resto del ViewModel, y por eso `silentRefresh` quedó como una línea que delega en la misma lectura.
