# Remediación Android: paridad con la Web, diálogos de resultado y envío por lote al ERP

Feature autorizada por Wilkin (ver `L1`) para los 7 defectos reportados entre la app Android, la Web y el backend. Se mantiene `versionName 0.7.0` y se sube solo `versionCode` a `7002`; el APK reemplaza el asset de la release `v0.7.0` y producción (VPS + `~/Desktop`) se actualiza con el mismo binario.

## Specs

### S1 — Histórico de Lançamento de Massas

Origen verbatim:

> 1. Histórico de Lançamento de Massas (30/10 desactualizado):
>    - Causa raíz: En MassasLaunchViewModel.kt, loadDay(date) solo llama a repository.day(date) y NUNCA a refreshMirror(date). Por eso, al entrar a cualquier día del histórico (como el 30/10), aeroMirror queda vacío y la MassasUnifiedTable no muestra ningún asiento del ERP (omitiendo a Victor, Jonas, Viviane, Gustavo, Jaime, Joao H y Jefferson).
>    - Solución: En loadDay(date), llamar siempre a refreshMirror(date) de forma incondicional (no atada a credenciales locales del teléfono, ya que la base de datos de Trindade ya contiene los movimientos del ERP para ese día).

Criterios de aceptación (derivados, sin agregar requisitos):

- `loadDay(date)` refresca el espejo en la misma corrida en que carga el día, para hoy y para cualquier día del histórico.
- El refresco **no** depende de `aeroSettings.ready` ni de credenciales del teléfono: el espejo sale de la base de Trindade.
- El espejo es del día: al cambiar de día no se arrastran los asientos del día anterior. Un día sin snapshot muestra la tabla sin asientos del ERP, no los de ayer (un asiento de otro día se lee como si fuera de este y se le acredita a la mañana equivocada).
- Un fallo al leer el espejo no rompe la carga del día ni inventa asientos.
- La lectura del espejo en el arranque de la pantalla tampoco depende de que el teléfono tenga credenciales del ERP: sale de la base de Trindade.
- Un día del histórico sigue siendo de solo lectura (`isReadOnly`) y el refresco no habilita ninguna edición.
- La tabla unificada muestra los asientos del ERP de ese día sin que el operario tenga que sincronizar a mano.

### S2 — Una sola acción de sincronización en la cabecera de la fecha

Origen verbatim:

> 2. Botón "Atualizar agora" en Lançamento de Massas:
>    - Causa raíz: En MassasLaunchScreen.kt tenemos el botón redundante de refresh en la tarjeta de fecha y abajo una tarjeta entera MassasErpSyncCard.
>    - Solución: Eliminar el botón "Atualizar agora" y la tarjeta separada redundante. Mudar la acción "Sincronizar ERP" (con su indicador de progreso y hora de última sincronización) directamente a la cabecera de la fecha, ahorrando un espacio vertical valiosísimo.

Criterios de aceptación:

- La tarjeta de fecha deja de dibujar el botón `"Atualizar agora"` (`massas_sync_now`).
- La tarjeta separada `MassasErpSyncCard` deja de componerse en la pantalla.
- La cabecera de la fecha dibuja **una** acción "Sincronizar ERP" que muestra: indicador de progreso mientras sincroniza, y la hora de última sincronización cuando la hay.
- No quedan dos affordances de refresco del mismo día en la pantalla.
- El espacio vertical liberado no se rellena con otra tarjeta.

### S3 — Panel Admin sin "Código de usuário"

Origen verbatim:

> 3. Panel Admin (Integración ERP):
>    - Causa raíz: En AdminIntegrationCard.kt se incluye el campo "Código de usuário" (userCode).
>    - Solución: En la Web (AeroIntegrationPanel.tsx) este campo no existe en la UI; la integración solo pide URL, usuario y contraseña. Eliminar el input de userCode en AdminIntegrationCard.kt y alinear la validación ready.

Criterios de aceptación:

- La tarjeta de integración del teléfono pide exactamente tres campos editables: URL, usuario y contraseña. No hay input de "Código de usuário".
- `ready` se calcula con URL, usuario y contraseña, igual que la Web; un `userCode` vacío no bloquea guardar ni probar.
- El contrato con el backend no cambia: `user_code` sigue viajando si el servidor lo tiene guardado, y el valor almacenado sigue disponible como respaldo de `ENT_USU`.
- Un operario con la integración configurada en la Web y sin `user_code` en el teléfono puede probar la conexión y sincronizar.

### S4 — "Recebimento" oculto cuando el espejo ERP cubre los insumos

Origen verbatim:

> 4. Módulo Relatório (Opción antigua "Recebimento" visible):
>    - Causa raíz: En Web (ReportsPage.tsx:395) la categoría ERP_RECEIPT_CATEGORY_ID (id = 4, "Recebimento") se oculta explícitamente cuando usesErpReceipts() es true porque los insumos ya están en la tarjeta ERP. En Android (ReportGeneratorScreen.kt:227) no se filtraba, por lo que el operario ve la checklist antigua con checkboxes inútiles además de la tarjeta ERP.
>    - Solución: Filtrar la categoría id 4 cuando usesErpReceipts() sea true, y mantener ErpMovementsCard ubicado justo después de Temperaturas.

Criterios de aceptación:

- Con la tarjeta ERP cubriendo insumos, la categoría `id = 4` ("Recebimento") no se dibuja en el relatório del teléfono.
- Sin cobertura del espejo ERP, la categoría 4 se sigue dibujando como hoy.
- `ErpMovementsCard` sigue inmediatamente después de Temperaturas.
- Un relatório guardado con la categoría oculta no arrastra ítems de esa categoría ni rompe el guardado.

### S5 — Botón "Sincronizar com ERP" con el sistema de diseño de Trindade

Origen verbatim:

> 5. Botón "Sincronizar con ERP" en Movimentações do ERP (Relatório):
>    - Causa raíz: ErpMovementsCard.kt dibuja un OutlinedButton improvisado con emoji de texto plano que rompe la estética de la app.
>    - Solución: Rediseñarlo de forma limpia y consistente con el sistema de diseño de Trindade (Material 3, altura mínima de 48dp, estilo primario/secundario según corresponda y tipografía adecuada).

Criterios de aceptación:

- El texto del botón es exactamente la cadena `report_erp_sync`, sin prefijo de emoji ni adornos de texto plano.
- Altura mínima de toque 48dp y tipografía de `MaterialTheme.typography` (sin tamaños hardcodeados fuera de la escala).
- El componente es Material 3 y su color sale de `colorScheme` (estilo secundario/tonal para una acción de refresco, coherente con el resto de las tarjetas).
- Mientras sincroniza, el botón muestra progreso y no permite doble disparo.

### S6 — Resultados de acciones en ventana emergente

Origen verbatim:

> 6. Mensajes de Acción en Diálogos Emergentes (Modales/Popups):
>    - Causa raíz: Los mensajes de resultado incrustados en línea (debajo de botones o banners) empujan la pantalla y no le dan certeza al operario.
>    - Solución: Todos los mensajes generados por acciones de botones (sincronización ERP, guardado de reporte, lanzamiento de masas, test de integración) deben presentarse en una ventana emergente (AlertDialog) con botones claros de "Fechar" / "OK".

Criterios de aceptación:

- Las cuatro acciones nombradas reportan su resultado en un `AlertDialog`: sincronización ERP, guardado de reporte, lanzamiento de masas, test de integración.
- El diálogo tiene un botón de cierre etiquetado `"Fechar"` u `"OK"` que lo descarta.
- El mensaje en línea correspondiente deja de dibujarse: la acción ya no empuja el contenido ni duplica el aviso.
- Un fallo y un éxito se distinguen en el diálogo (mensaje y, cuando aplique, color/tono), y el diálogo no se cierra solo antes de que el operario lo lea.
- El botón que originó el diálogo vuelve a estar disponible al cerrarlo.

### S7 — Envío de varias masas al mismo tiempo

Origen verbatim:

> 7. Envío de 2 o más masas al mismo tiempo al ERP:
>    - Causa raíz: En dispatchToErp, cuando se lanzan varias masas, el bucle itera sobre cada una pero no le pasaba operatorName a AeroDispatchRequest (quedaba en null y caía en el fallback 1).
>    - Solución: Pasar operatorName = launch.displayName.ifBlank { launch.username } en cada item del lote, y reportar el resultado acumulado en la ventana emergente ("X massas sincronizadas com sucesso").

Criterios de aceptación:

- Cada `AeroDispatchRequest` del lote lleva `operatorName`, resuelto como el envío individual ya lo hace.
- El asiento del ERP queda con el operario de la masa, no con el fallback 1.
- El lote completo reporta en el diálogo el resultado acumulado: "X massas sincronizadas com sucesso" cuando todas salen, y el conteo de rechazadas/inalcanzables cuando no.
- Un lote de N masas no se corta en la primera negativa del ERP: se reporta el acumulado.
- Con una sola masa el comportamiento sigue siendo el de hoy.

### S8 — Entorno de verificación en emulador

Origen verbatim:

> Nota de entorno:
> Tenés acceso al emulador Android en la PC Ubuntu vía `ssh ubuntu` con adb en `/home/wilkin/Android/Sdk/platform-tools/adb` (dispositivo `emulator-5554` activo con la app instalada). Podés usarlo para instalar el APK compilado (`adb install -r`), correr pruebas y verificar capturas.

Criterios de aceptación:

- El APK firmado se instala con `adb install -r` sobre `emulator-5554` sin desinstalar datos.
- Los 7 puntos se verifican en el emulador con captura de pantalla como evidencia.
- Si el emulador no está disponible, se reporta como verificación no disponible, sin sustituirla por una afirmación.

### S9 — Entrega

Origen verbatim:

> Requisitos de entrega:
> - Tag y versión: mantener v0.7.0, subir solo versionCode a 7002.
> - Sustituir el APK en la release oficial de GitHub con `gh release upload v0.7.0 ... --clobber` y actualizar producción en el VPS y ~/Desktop.
> - Todo a main directo sin ramas.

Criterios de aceptación:

- `versionName` sigue siendo `"0.7.0"`; `versionCode` sube a `7002`.
- El APK se firma con `trindade-release.jks` y se publica como asset de `v0.7.0` reemplazando el anterior (`--clobber`), con su `.sha256` actualizado.
- Producción en el VPS y la copia de `~/Desktop` quedan con el mismo binario, y `sha256sum -c` del asset descargado da OK.
- Los commits van directo a `main`, sin ramas. El tag `v0.7.0` se vuelve a apuntar al commit final del binario, igual que en la entrega anterior: un tag que no refleja el código que parió el APK es exactamente lo que se corrigió la vez pasada.

## Tasks

- T1 | S1 | inline | `loadDay` refresca el espejo del día de forma incondicional — commit: `2deefb8`
- T2 | S2 | inline | cabecera de fecha con la única acción de sincronización; fuera "Atualizar agora" y `MassasErpSyncCard`; el resultado de la sincronización de massas pasa al diálogo (parte de S6) — commit: `3b57a37`
- T3 | S3 | inline | Admin sin "Código de usuário"; `ready` alineado con la Web sin romper `user_code` ni `ENT_USU` — commit: `91b02c0`
- T4 | S4 | inline | Relatório: categoría 4 oculta cuando el espejo ERP cubre insumos, `ErpMovementsCard` tras Temperaturas — commit: _pendiente_
- T5 | S5 | inline | botón "Sincronizar com ERP" rediseñado en Material 3, 48dp, sin emoji — commit: _pendiente_
- T6 | S6 | inline | diálogo de resultado compartido y las cuatro acciones reportando en él (sincronización ERP, guardado de reporte, lanzamiento de masas, test de integración) — commit: 44dcf70
- T7 | S7 | inline, después de T6 | `dispatchToErp` pasa `operatorName` por ítem y reporta el acumulado del lote en el diálogo — commit: 3974734
- T8 | S1–S7 | inline | suite Android completa (unidad + Robolectric) en el contenedor fijado — commit: pendiente
- T9 | S8 | inline | verificación en `emulator-5554` por `ssh ubuntu` con capturas de los 7 puntos — commit: _pendiente_
- T10 | S9 | inline | `versionCode 7002`, APK firmado, sha256, `gh release upload v0.7.0 --clobber` — commit: _pendiente_
- T11 | S9 | inline | producción en VPS + copia en `~/Desktop` — commit: _pendiente_
- T12 | S9 | inline | `main` pusheado y tag `v0.7.0` re-apuntado al commit del binario — commit: _pendiente_

## Test plan

Cada tarea arranca en RED con la prueba que nombra su regla, y se cierra con la suite del módulo.

**T1 — `MassasLaunchViewModel`.** Repositorio falso con `day(date)` y `storedAeroMovements(date)` devolviendo 7 asientos. Tras `loadDay("2025-10-30")`: `state.aeroMirror` tiene los 7 asientos, `isReadOnly` sigue en `true`, y el espejo se refresca también con `aeroSettings.ready == false`. Control adicional: `storedAeroMovements` nulo no borra el espejo previo ni introduce error.

**T2 — Robolectric sobre la pantalla de lanzamiento.** No existe ningún nodo con el texto de `massas_sync_now`; `MassasErpSyncCard` no se compone; la cabecera de fecha expone una sola acción de sincronización que muestra progreso con `isSyncingAero = true` y la hora de `aeroSyncedAt` cuando la hay. El test actual de `MassasErpSyncCard` se reescribe contra el contrato de la cabecera (la lógica de mensajes de esa tarjeta se muda a T6).

**T3 — Robolectric sobre `AdminIntegrationCard`.** Se dibujan tres campos y ninguno se llama "Código de usuário"; `ready` es `true` con URL + usuario + contraseña y `userCode` vacío; el guardado conserva `user_code` en el JSON y `AeroSettingsCodecTest` sigue pasando. Regresión exigida: un `AeroDispatchRequest` sin `operatorName` sigue resolviendo `ENT_USU` con el `user_code` configurado.

**T4 — Robolectric sobre `ReportGeneratorScreen`.** Con el espejo cubriendo insumos, la categoría 4 no se dibuja y `ErpMovementsCard` aparece justo después de Temperaturas; sin cobertura, la categoría 4 se dibuja. El mismo escenario con un guardado de relatório comprueba que no viajan ítems de la categoría oculta.

**T5 — Robolectric sobre `ErpMovementsCard`.** El texto del botón es igual a `stringResource(R.string.report_erp_sync)` (falla si reaparece el emoji), altura mínima 48dp y tipografía de `MaterialTheme`. Con `isSyncing = true` muestra progreso y no dispara `onSync` al tocarlo.

**T6 — dos niveles.** Unidad: cada acción deja el resultado en el estado del diálogo (éxito y error) y el mensaje en línea queda vacío. Robolectric: el `AlertDialog` se abre con el texto esperado y un botón "Fechar"/"OK" que lo cierra, para las cuatro acciones; al cerrarlo, el botón de origen vuelve a estar habilitado.

**T7 — unidad sobre `MassasLaunchViewModel`.** Dispatcher falso que registra los `AeroDispatchRequest`. Lote de 3 masas con `displayName`/`username` distintos: los 3 requests llevan `operatorName` con la regla de S7. Los tres salen: diálogo con "3 massas sincronizadas com sucesso". Lote mixto: diálogo con rechazadas/inalcanzables acumuladas y el lote completo se intenta igual.

**T8 — suite completa.** `./gradlew testDebugUnitTest` en la imagen fijada `ghcr.io/cirruslabs/android-sdk:35@sha256:c724009e305b4607157287624033ab97f319af44c244bfc9f73b6293f3bb01b9`, con caché `~/.cache/trindade-gradle`. Las 1140 pruebas actuales siguen verdes; `LocaleStringsParityTest` cubre las cadenas nuevas en `values` y `values-es`.

**T9 — emulador.** `ssh ubuntu` → `adb install -r`, apertura de la app y capturas: histórico 30/10 con los asientos del ERP, cabecera de fecha con su única acción, Admin con tres campos, Relatório sin "Recebimento" y con la tarjeta ERP tras Temperaturas, botón nuevo, diálogo de resultado, y lote de 2+ masas con su mensaje acumulado.

**T10/T11/T12 — entrega.** `aapt`/`apksigner` para confirmar `versionCode 7002`, `versionName 0.7.0` y firma; `sha256sum` del APK publicado contra la descarga de la release; comprobación de producción en el VPS y de `~/Desktop`; `git ls-remote` para `main` y `refs/tags/v0.7.0` apuntando al mismo commit.

## Risk

- T3 y T7 escriben la identidad del operario en el asiento del ERP: `Risk: item 1` (una atribución equivocada es difícil de detectar después). Exige las pruebas de regresión de `ENT_USU` para envío individual y por lote antes de cerrar.
- T10/T11 publican y despliegan: `Risk: item 5`, autorizado por S9.
- T1, T2, T4, T5, T6, T8, T9: `Risk: none` con la cobertura de arriba.

## Log

L1 — Pedido original de Wilkin, verbatim:

> Hola colega. Estuvimos investigando a fondo la aplicación Android contra la Web y el backend, y tenemos identificadas las causas raíz exactas de los 7 puntos solicitados por Wilkin:
>
> 1. Histórico de Lançamento de Massas (30/10 desactualizado):
>    - Causa raíz: En MassasLaunchViewModel.kt, loadDay(date) solo llama a repository.day(date) y NUNCA a refreshMirror(date). Por eso, al entrar a cualquier día del histórico (como el 30/10), aeroMirror queda vacío y la MassasUnifiedTable no muestra ningún asiento del ERP (omitiendo a Victor, Jonas, Viviane, Gustavo, Jaime, Joao H y Jefferson).
>    - Solución: En loadDay(date), llamar siempre a refreshMirror(date) de forma incondicional (no atada a credenciales locales del teléfono, ya que la base de datos de Trindade ya contiene los movimientos del ERP para ese día).
>
> 2. Botón "Atualizar agora" en Lançamento de Massas:
>    - Causa raíz: En MassasLaunchScreen.kt tenemos el botón redundante de refresh en la tarjeta de fecha y abajo una tarjeta entera MassasErpSyncCard.
>    - Solución: Eliminar el botón "Atualizar agora" y la tarjeta separada redundante. Mudar la acción "Sincronizar ERP" (con su indicador de progreso y hora de última sincronización) directamente a la cabecera de la fecha, ahorrando un espacio vertical valiosísimo.
>
> 3. Panel Admin (Integración ERP):
>    - Causa raíz: En AdminIntegrationCard.kt se incluye el campo "Código de usuário" (userCode).
>    - Solución: En la Web (AeroIntegrationPanel.tsx) este campo no existe en la UI; la integración solo pide URL, usuario y contraseña. Eliminar el input de userCode en AdminIntegrationCard.kt y alinear la validación ready.
>
> 4. Módulo Relatório (Opción antigua "Recebimento" visible):
>    - Causa raíz: En Web (ReportsPage.tsx:395) la categoría ERP_RECEIPT_CATEGORY_ID (id = 4, "Recebimento") se oculta explícitamente cuando usesErpReceipts() es true porque los insumos ya están en la tarjeta ERP. En Android (ReportGeneratorScreen.kt:227) no se filtraba, por lo que el operario ve la checklist antigua con checkboxes inútiles además de la tarjeta ERP.
>    - Solución: Filtrar la categoría id 4 cuando usesErpReceipts() sea true, y mantener ErpMovementsCard ubicado justo después de Temperaturas.
>
> 5. Botón "Sincronizar con ERP" en Movimentações do ERP (Relatório):
>    - Causa raíz: ErpMovementsCard.kt dibuja un OutlinedButton improvisado con emoji de texto plano que rompe la estética de la app.
>    - Solución: Rediseñarlo de forma limpia y consistente con el sistema de diseño de Trindade (Material 3, altura mínima de 48dp, estilo primario/secundario según corresponda y tipografía adecuada).
>
> 6. Mensajes de Acción en Diálogos Emergentes (Modales/Popups):
>    - Causa raíz: Los mensajes de resultado incrustados en línea (debajo de botones o banners) empujan la pantalla y no le dan certeza al operario.
>    - Solución: Todos los mensajes generados por acciones de botones (sincronización ERP, guardado de reporte, lanzamiento de masas, test de integración) deben presentarse en una ventana emergente (AlertDialog) con botones claros de "Fechar" / "OK".
>
> 7. Envío de 2 o más masas al mismo tiempo al ERP:
>    - Causa raíz: En dispatchToErp, cuando se lanzan varias masas, el bucle itera sobre cada una pero no le pasaba operatorName a AeroDispatchRequest (quedaba en null y caía en el fallback 1).
>    - Solución: Pasar operatorName = launch.displayName.ifBlank { launch.username } en cada item del lote, y reportar el resultado acumulado en la ventana emergente ("X massas sincronizadas com sucesso").
>
> Nota de entorno:
> Tenés acceso al emulador Android en la PC Ubuntu vía `ssh ubuntu` con adb en `/home/wilkin/Android/Sdk/platform-tools/adb` (dispositivo `emulator-5554` activo con la app instalada). Podés usarlo para instalar el APK compilado (`adb install -r`), correr pruebas y verificar capturas.
>
> Requisitos de entrega:
> - Tag y versión: mantener v0.7.0, subir solo versionCode a 7002.
> - Sustituir el APK en la release oficial de GitHub con `gh release upload v0.7.0 ... --clobber` y actualizar producción en el VPS y ~/Desktop.
> - Todo a main directo sin ramas.
>
> Por favor, como primer paso redactá el artefacto ODD en `odd/tasks/remediacion-android-paridad-dialogos-erp.md` detallando las tareas y los tests, y avisame para darte luz verde antes de empezar la implementación.

L2 — Estado del repositorio al abrir la feature: `main` en `7e47713`, alineado con `origin/main`; tag `v0.7.0` re-apuntado a ese commit; release `v0.7.0` con `trindade-0.7.0.apk` (`versionCode 7001`, sha256 `8f6156f2d5dfe8e5ad343ed01e52de629e4de5b8d9cd4c1304b38313435a8621`).

L3 — Causas raíz confirmadas en el código antes de escribir este documento:

- `MassasLaunchViewModel.loadDay` (`packages/android/app/src/main/java/com/trindade/app/massas/MassasLaunchViewModel.kt:220`) llama solo a `repository.day(date)`; `refreshMirror` (línea 176) queda sin invocar.
- `MassasLaunchScreen.kt:242` dibuja el refresco de la tarjeta de fecha y `:271` su etiqueta `massas_sync_now`; `:284` compone `MassasErpSyncCard`.
- `AdminIntegrationCard.kt:115` dibuja el input de `state.userCode` con la etiqueta `admin_integration_user_code`.
- `ReportGeneratorScreen.kt:229` dibuja todas las categorías raíz sin filtrar la 4; la Web filtra en `ReportsPage.tsx:395` con `usesErpReceipts`.
- `ErpMovementsCard.kt:77-86` usa `OutlinedButton` con `"🔄 " + stringResource(R.string.report_erp_sync)`.
- Mensajes en línea hoy: `ReportGeneratorScreen.kt:92` (`state.message`) y `:252` (`state.syncMessage`), `AdminIntegrationCard.kt:122` (`state.message`), tarjeta de sincronización de massas. El único diálogo existente es `resultDialogMessage` en `MassasLaunchScreen.kt:974`.
- `dispatchToErp` (`MassasLaunchViewModel.kt:403`) construye `AeroDispatchRequest` sin `operatorName`; el envío individual sí lo pasa (`:524`, `row.operatorName.ifBlank { launch.displayName.ifBlank { launch.username } }`), y `AeroDispatchRequest.operatorName` documenta que `null` cae en el usuario configurado.

L4 — Luz verde e instrucción sobre el tag, verbatim:

> Sobre tu consulta de S9:
> - Totalmente de acuerdo: el tag v0.7.0 se re-apunta al commit final una vez hecho el --clobber del APK en GitHub. Trunk-based y trazabilidad absoluta: el tag en el repositorio tiene que parir exactamente el binario que entregamos.
>
> Tenés LUZ VERDE para iniciar la implementación:
> - Arrancá por T1 con su test en RED.
> - Seguí la secuencia inline planificada.
> - Cualquier duda o bloqueo avisame, yo te sigo supervisando con la cadencia de 5 minutos. ¡Adelante!

L5 — Precisión de S1 al escribir el test: `refreshMirror` conserva el espejo anterior cuando el día no tiene snapshot, y `loadDay` ya resetea el estado que depende del día. Con la llamada incondicional, cambiar de día arrastraría los asientos de ayer a la tabla de hoy. La spec se ajusta: el espejo es del día y `loadDay` lo deja vacío antes de leer el snapshot, mientras `refreshMirror` mantiene su lectura conservadora (un fallo transitorio de la lectura no borra lo que hay en pantalla). Además `loadAeroSettings` deja de condicionar la lectura del espejo a `settings.ready`: es exactamente la condición que dejaba la tabla sin asientos.

L6 — Reordenamiento de S6 dentro de T2: quitar la tarjeta de sincronización sin más habría dejado el resultado de la sincronización invisible hasta que llegara T6. La sincronización de massas se rutea al diálogo que la pantalla ya tenía (`resultDialogMessage` + `resultDialogIsSuccess`) dentro de T2, y T6 se queda con las otras tres acciones (guardado de reporte, sincronización del relatório, test de integración) más la extracción del diálogo compartido.

L7 — Nota de evidencia: en T2 el composable `MassasDayHeader` es API nueva, así que el RED fue de compilación (el símbolo no existía al escribir el test) y no se corrió gradle para verlo; la primera corrida fue GREEN (`BUILD SUCCESSFUL`, `MassasDayHeaderTest` + `MassasLaunchViewModelTest`). De T3 en adelante el RED es de aserción, observado en corrida.

L8 — Nota de S4: el corte no es "el espejo tiene filas" sino la fecha `ERP_RECEIPT_SINCE` (`2026-10-29`), igual que la web y el backend. Android no tenía esa constante; quedó en `reports/ErpReceipts.kt` junto con `ERP_RECEIPT_CATEGORY_ID`. La lista cortada (`UiState.formCategories`) se usa para dibujar, para `missingReadings` y para `tasksById` del envío: ocultar solo lo dibujado habría dejado la categoría en el cuerpo y en la validación.
