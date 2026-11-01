# Homogeneización UX/UI Android y mejoras funcionales (Relatório, Horário, Estoque, Compartilhar, logs ERP)

Feature: `homogeneizacion-ux-android`. Release: mismo `v0.7.0` del repo, reemplazado; `versionCode` 7003 (+1 sobre 7002), `versionName` sin tocar.

## Specs

S1 — Sección "Montagem das Caixas" del Relatório, verbatim del pedido:

> Quiero agregar un **switch (activar/desactivar)** para cada tipo de caja.
>
> La idea es que el usuario pueda decidir qué tipos de cajas se utilizarán en cada relatório, ya que no siempre se montan ambos tipos.
>
> Por ejemplo:
>
> - Caixas Pequenas: activado → mostrar y permitir marcar las cajas pequeñas.
> - Caixas Assaí: desactivado → ocultar o deshabilitar las opciones correspondientes.
>
> El objetivo es evitar mostrar opciones que no serán utilizadas y hacer que el manejo del módulo "Relatório" sea más sencillo, claro y satisfactorio.
>
> El comportamiento debe integrarse de forma natural con el flujo actual, sin romper la información ya registrada ni la lógica existente.

S2 — Histórico de Relatório, verbatim:

> El diseño actual del Histórico de "Relatório" presenta problemas visuales y algunos elementos parecen estar desalineados o rotos.
>
> Quiero rediseñarlo utilizando la **skill de diseño instalada en el proyecto**.
>
> Utiliza como referencia el diseño actual del:
>
> **Histórico → Lanzamento de Massas**
>
> Quiero utilizar ese mismo lenguaje visual, estructura, espaciado, jerarquía, botones, tarjetas, tipografía y comportamiento para que ambos históricos se sientan parte de la misma aplicación.

S3 — Selección de motoristas desde el horario, verbatim:

> Quiero modificarlo para que, al seleccionar un horario, se abra directamente una ventana/modal donde sea posible seleccionar los motoristas correspondientes a ese horario.
>
> La ventana debe tener **dos pestañas**:
>
> ### Pestaña 1 — Fleteros
>
> Debe mostrar los motoristas disponibles que son fleteros.
>
> El usuario debe poder seleccionar:
>
> - 1 motorista
> - 2 motoristas
> - varios motoristas
>
> según corresponda al horario.
>
> ### Pestaña 2 — Motoristas da Casa
>
> Debe mostrar los motoristas propios/de la casa.
>
> Para estos motoristas también debe existir la posibilidad de seleccionar la **chapa del camión** correspondiente.
>
> Todo el proceso debe realizarse dentro de la misma ventana/modal.
>
> La ventana debe contar con botones claramente definidos para:
>
> - **Aceptar**
> - **Cancelar**
>
> Al confirmar, los motoristas seleccionados deben quedar asociados al horario elegido.

S4 — Visualización de los motoristas seleccionados, verbatim:

> - Elementos desalineados.
> - Botón de eliminar demasiado grande.
> - Distribución poco organizada.
> - Espaciado inconsistente.
> - Apariencia poco integrada con el resto de la aplicación.
>
> Quiero reorganizar esta sección utilizando una estructura similar a una **tabla visual/invisible**, donde cada motorista ocupe una fila correctamente alineada.
>
> Cada fila debería contener de forma organizada la información correspondiente y, al lado, una acción para eliminar.
>
> En lugar de utilizar un botón grande con texto para eliminar, utilizar un **icono de papelera** pequeño, limpio y correctamente alineado.

S5 — Histórico de Horário, verbatim:

> También quiero rediseñar completamente el Histórico de este módulo.
>
> Debe seguir el mismo lenguaje visual utilizado en el Histórico de "Lanzamento de Massas".
>
> […] Los botones deben ser más pequeños, trabajados y correctamente posicionados.
>
> No quiero elementos visualmente grandes o desproporcionados.

S6 — Navegación del Histórico de Calculadora de Estoque, verbatim:

> El Histórico se muestra correctamente, pero después de abrirlo el **cursor/foco de navegación se mueve hacia el Dashboard**.
>
> Esto debe corregirse.
>
> Cuando el usuario entre en:
>
> **Calculadora de Estoque → Histórico**
>
> el foco, cursor o posición de navegación debe permanecer dentro del **módulo padre "Calculadora de Estoque"**, respetando la navegación actual.
>
> No debe producirse ningún salto automático hacia el Dashboard.
>
> Revisar también si existe algún problema similar en otros módulos y corregirlo si se encuentra.

S7 — Vista de WhatsApp en Compartir App, verbatim:

> Quiero que la vista de WhatsApp:
>
> - ocupe correctamente todo el ancho disponible;
> - respete los mismos márgenes y padding que el resto de la interfaz;
> - mantenga la misma alineación horizontal;
> - sea responsive;
> - no genere espacios laterales innecesarios.

S8 — Lenguaje visual único, verbatim (extracto que manda):

> Todos los Históricos deben compartir el mismo diseño.
>
> Los botones deben utilizar los mismos patrones.
>
> Los iconos deben mantener el mismo estilo.
>
> Las tarjetas deben seguir una estructura consistente.
>
> Los formularios deben mantener los mismos patrones.
>
> Las tablas deben compartir criterios de diseño.
>
> Los diálogos/modales deben seguir el mismo estándar.
>
> Los márgenes y espaciados deben ser consistentes.
>
> La jerarquía visual debe mantenerse entre módulos.
>
> […] El objetivo es **homogeneizar toda la aplicación tomando como referencia las partes que actualmente tienen mejor diseño**, especialmente el Histórico de "Lanzamento de Massas".

S9 — Logs de consultas al ERP, verbatim:

> Todas las consultas al ERP deben quedar registradas en el archivo `.log` correspondiente del proyecto.
>
> Es importante que estos registros permitan identificar claramente que se trata de **logs generados por la aplicación Android**.
>
> […] Los logs deben tener información suficiente para poder entender qué ocurrió, pero sin registrar información sensible innecesaria.
>
> Utiliza un formato consistente para estos registros y deja claramente identificada la procedencia como:
>
> **Android App / ERP**
>
> Revisa también si actualmente existen consultas al ERP que no están siendo registradas y, si es así, intégralas al sistema de logging existente en lugar de crear mecanismos duplicados.

S10 — Reglas de entrega, verbatim:

> - **No crees ramas nuevas.**
> - Realiza todo el trabajo directamente en **`main`**.
> - **No crees un nuevo release.**
> - Sustituye el release anterior por la nueva versión.
> - Incrementa únicamente en **+1 el `versionCode`**, para que los dispositivos reconozcan correctamente la nueva versión como una actualización.
> - No modifiques innecesariamente el `versionName` ni otros valores de versionado.

S11 — Emulador como verificación, verbatim:

> Utiliza el emulador que tienes disponible en la PC Ubuntu, accediendo mediante **SSH (`ssh ubuntu`)**, para realizar las pruebas, tests y capturas de pantalla.
>
> Quiero que el emulador sea **tus ojos durante la implementación**.

## Tasks

- T1 | S9 | inline | logs ERP: evento `test` de la integración y prefijo de procedencia `Android App / ERP` en el log compartido — commit: `507d5ad` (tests `AeroTestAuditTest` + `AeroDispatcherTest` verdes)
- T2 | S6 | inline | histórico de estoque como superposición del módulo (el foco deja de caer en Dashboard) — commit: `81676c0` (tests de navegación de estoque verdes)
- T3 | S7 | inline | tarjetas de Compartir App a ancho completo — commit: `096db89` (`SectionCard` + `ShareAppSectionsTest`)
- T4 | S8 | inline | componentes compartidos de histórico (`HistoryHeader`, `HistoryRecordCard`, `HistoryPager`, `HistoryStates`, `MonthPickerDialog`) y Massas como referencia migrada — commit: `31f9c89` (`HistoryComponentsTest`)
- T5 | S2, S8 | inline | histórico de Relatório sobre los componentes compartidos — commit: `8d32764`
- T6 | S5, S8 | inline | histórico de Horário sobre los componentes compartidos — commit: `ef21d56`
- T7 | S6, S8 | inline | histórico de Estoque con el mismo encabezado y tarjetas — commit: `d2be2e4` (`StockHistoryScreenTest`)
- T8 | S1 | inline | interruptores por tipo de caja en "Montagem das Caixas" — commit: `a255e1e` (`ReportBoxTypeSwitchTest`, `ReportFormTest`, `ReportGeneratorViewModelTest`)
- T9 | S3 | inline | modal de motoristas con dos pestañas y chapa para los de la casa — commit: `ce68fa3` (`LoadingViewModelTest`, `LoadingScreenTest`; la chapa se elige por motorista y se nombra el que falta)
- T10 | S4 | inline | tabla de motoristas del horario con papelera alineada — commit: `881759d` (`LoadingScreenTest`: alineación de chapa y papelera, glifo de 20 dp, objetivo de 48 dp)
- T11 | S8 | inline | pasada visual general (botones, iconos, espaciados) en el resto de las pantallas — commit: _pendiente_
- T12 | S10, S11 | inline | `versionCode` 7003, build firmado, verificación en `emulator-5554`, reemplazo del release y despliegue — commit: _pendiente_

## Log

L1 — Pedido original, verbatim: ver S1–S11; pedido completo transcripto por secciones en `## Specs`, con luz verde explícita: "Tienes **luz verde para comenzar la implementación**. No te limites a analizar o proponer cambios: implementa, prueba en el emulador, corrige cualquier problema que encuentres y deja el proyecto funcionando y listo para la actualización."
L2 — Diseño (skill `gentle-design`): `design/system.md` + `design/system.html` sincronizados desde `ui/theme/Theme.kt` y `res/values/colors.xml`; diseño `design/android-homogeneizacao-ux/` con cuatro tableros — `01-historico-unificado.html`, `02-modal-fleteros.html`, `03-casa-y-tabla.html`, `04-relatorio-caixas.html`. No son direcciones alternativas: el pedido fija la referencia (Histórico de Massas), así que cada tablero aplica ese lenguaje a una superficie distinta.
L3 — T1 cerrada: `AeroAudit.testRequest` + prefijo `Android App / ERP · client=android · via=native`; el panel escribe una línea `test` por intento con dirección. Prueba unitaria verde; la prueba de extremo a extremo (línea real en `logs/aero-integration.log`) queda en T12 contra el emulador.
L4 — T2–T8 cerradas; cada una con su commit en `main` y sus pruebas: foco del histórico de estoque dentro del módulo (`81676c0`), tarjetas a ancho completo (`096db89`), componentes compartidos de histórico y Massas migrado (`31f9c89`), Relatório (`8d32764`), Horário (`ef21d56`) y Estoque (`d2be2e4`) sobre esos componentes.
L5 — T8: el interruptor de tipo de caja no se limita a ocultar; apaga y deshabilita el bloque y descarta lo ya respondido para ese tipo, porque el cuerpo del reporte lleva una entrada por tarea y una selección que quedaba en el mapa se habría guardado como caja montada. La fila completa de 48 dp es el control: el nombre se anuncia como el del interruptor y el `Switch` se dibuja sin manejador para no contestar dos veces el mismo toque.
L6 — T9: el selector reemplaza al formulario en línea. Una pestaña por tipo de flota (el reparto es el de la flota, no una preferencia: el fletero trae su vehículo y el de la casa no puede asignarse sin chapa), casillas porque la respuesta es una lista, y la chapa es un menú en la fila del propio motorista de la casa. Al confirmar se envía una fila por elegido, de a una: el servidor rechaza un motorista repetido en la fecha, así que dos envíos en paralelo convertirían un duplicado visible en un conflicto invisible. Lo que se guardó sale del selector y lo que falló se queda con el mensaje del rechazo.
L7 — T10: la fila del horario es una fila. Nombre arriba y, debajo, chapa y vehículo empezando en la misma x en todas las filas del horario; las acciones al final de la fila. La chapa comparte la celda con el vehículo en vez de reclamar una columna propia: es una palabra que no se parte y a 320 dp con la fuente al doble una columna suya se mediría contra los botones de al lado. La papelera es un glifo de 20 dp con su nombre como descripción y un objetivo de 48 dp, que es lo que pide el dedo. Commit `881759d`.
