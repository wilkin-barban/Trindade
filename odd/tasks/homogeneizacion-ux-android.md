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
- T2 | S6 | inline | histórico de estoque como superposición del módulo (el foco deja de caer en Dashboard) — commit: _pendiente_
- T3 | S7 | inline | tarjetas de Compartir App a ancho completo — commit: _pendiente_
- T4 | S8 | inline | componentes compartidos de histórico (`HistoryHeader`, `HistoryRecordCard`, `HistoryPagination`) y Massas como referencia migrada — commit: _pendiente_
- T5 | S2, S8 | inline | histórico de Relatório sobre los componentes compartidos — commit: _pendiente_
- T6 | S5, S8 | inline | histórico de Horário sobre los componentes compartidos — commit: _pendiente_
- T7 | S6, S8 | inline | histórico de Estoque con el mismo encabezado y tarjetas — commit: _pendiente_
- T8 | S1 | inline | interruptores por tipo de caja en "Montagem das Caixas" — commit: _pendiente_
- T9 | S3 | inline | modal de motoristas con dos pestañas y chapa para los de la casa — commit: _pendiente_
- T10 | S4 | inline | tabla de motoristas del horario con papelera alineada — commit: _pendiente_
- T11 | S8 | inline | pasada visual general (botones, iconos, espaciados) en el resto de las pantallas — commit: _pendiente_
- T12 | S10, S11 | inline | `versionCode` 7003, build firmado, verificación en `emulator-5554`, reemplazo del release y despliegue — commit: _pendiente_

## Log

L1 — Pedido original, verbatim: ver S1–S11; pedido completo transcripto por secciones en `## Specs`, con luz verde explícita: "Tienes **luz verde para comenzar la implementación**. No te limites a analizar o proponer cambios: implementa, prueba en el emulador, corrige cualquier problema que encuentres y deja el proyecto funcionando y listo para la actualización."
L2 — Diseño (skill `gentle-design`): `design/system.md` + `design/system.html` sincronizados desde `ui/theme/Theme.kt` y `res/values/colors.xml`; diseño `design/android-homogeneizacao-ux/` con cuatro tableros — `01-historico-unificado.html`, `02-modal-fleteros.html`, `03-casa-y-tabla.html`, `04-relatorio-caixas.html`. No son direcciones alternativas: el pedido fija la referencia (Histórico de Massas), así que cada tablero aplica ese lenguaje a una superficie distinta.
L3 — T1 cerrada: `AeroAudit.testRequest` + prefijo `Android App / ERP · client=android · via=native`; el panel escribe una línea `test` por intento con dirección. Prueba unitaria verde; la prueba de extremo a extremo (línea real en `logs/aero-integration.log`) queda en T12 contra el emulador.
