# Remediación de diseño Android: acciones, filtros, cabeceras y dashboard

Segunda pasada de diseño sobre la aplicación Android tras la entrega 7003. Cinco superficies ya
homogeneizadas piden ajustes de espacio y de forma, y el dashboard reordena sus accesos y su resumen.

## Specs

S1 — Acciones de las tarjetas de histórico, verbatim:

> en el histórico de carregamentos y relatorios, las tarjetas quedan más altas que en Massas porque llevan acciones que la referencia, quiero que estas acciones sean iconos representativos, mejorando el espacio en ellas para que no sean tan anchas y ocupen menos espacio

S2 — Filtro de fecha de los históricos, verbatim:

> ademas mejora el filtrado de la fecha, en la actualidad son dos botones inmensos, esto no es muy practico y rompe con el diseño

S3 — Cabecera y acción APK de Compartir App, verbatim (con la precisión de L2 sobre cómo se comparte):

> en el modulo Compartir App mejora el diseño de la parte superior, se ve vacio a la izquierda de donde esta el boton de Ayuda y agregale el boton "Compartir archivo APK" que esta presente en la aplicacion web

S4 — Campo de fecha del Histórico de Contagem, verbatim:

> en el modulo Historico de contagem, arregla el campo de escoger la fecha para filtrar, el texto esta muy pequeño comparado con el largo del campo, ajusta este diseño

S5 — Vista de cajas según el interruptor de Montagem das Caixas, verbatim:

> en el modulo Relatorio, al estar desactivado el suich en la opcion Montagen das caixas, se deve ocultar la vista de las caixas, al contrario cuando este havilitado se deve mostrar para elegir las caixas montadas

S6 — Accesos del Dashboard, verbatim:

> elimina del Dashboard el acceso a Historico de Contagem, y coloca el acceso a Compartir APP pero justo despues de Calculadora Assai

S7 — Resumen del Dashboard, verbatim (con la precisión de L2 sobre qué lo enriquece):

> la informacion ded resumen que muestra al final de Usuarios activos, Relatorios Totales y Historicos de Cargamentos Totales, resumelo todo en un mismo cuadro, no es necesario un cuadro para cada resumen, y de ser posible, enriquese mas este cuadro con otras informaciones relevantes

S8 — Entrega, verbatim:

> al crear la nueva app reemplaza por la existente en el ultimo releasse, suma un numero al versioncode y publica los cambios, usa el emulador si lo necesitas en ubuntu

## Tasks

- T1 | S1 | inline | acciones de las tarjetas de histórico como iconos (desactivar, eliminar) alineados a la derecha, sin fila propia — commit: `_pendiente_`
- T2 | S2 | inline | filtro de fecha compacto en una sola fila: día, mes y limpiar como chips — commit: `_pendiente_`
- T3 | S4 | inline | campo de fecha del histórico de contagem legible y de tamaño coherente — commit: `_pendiente_`
- T4 | S5 | inline | con el interruptor de un tipo de caja apagado, sus cajas no se dibujan — commit: `_pendiente_`
- T5 | S3 | inline | cabecera de Compartir App con título y subtítulo, y acción «Compartir arquivo APK» — commit: `_pendiente_`
- T6 | S6 | inline | Dashboard: fuera Histórico de Contagem, dentro Compartir App tras Calculadora de Assaí — commit: `_pendiente_`
- T7 | S7 | inline | un solo cuadro de resumen con las tres cifras y el día en curso — commit: `_pendiente_`
- T8 | S8 | inline | `versionCode` 7004, build firmado, verificación en `emulator-5554`, despliegue y reemplazo del asset de `v0.7.0` — commit: `_pendiente_`

## Log

L1 — Pedido original, verbatim:

> vamos a remediar algunos detalles del diseño que quedaron pendientes en la aplicacion android:
>
> -en el histórico de carregamentos y relatorios, las tarjetas quedan más altas que en Massas porque llevan acciones que la referencia, quiero que estas acciones sean iconos representativos, mejorando el espacio en ellas para que no sean tan anchas y ocupen menos espacio, ademas mejora el filtrado de la fecha, en la actualidad son dos botones inmensos, esto no es muy practico y rompe con el diseño
> -en el modulo Compartir App mejora el diseño de la parte superior, se ve vacio a la izquierda de donde esta el boton de Ayuda y agregale el boton "Compartir archivo APK" que esta presente en la aplicacion web
> -en el modulo Historico de contagem, arregla el campo de escoger la fecha para filtrar, el texto esta muy pequeño comparado con el largo del campo, ajusta este diseño
> -en el modulo Relatorio, al estar desactivado el suich en la opcion Montagen das caixas, se deve ocultar la vista de las cajas, al contrario cuando este havilitado se deve mostrar para elegir las caixas montadas
> -elimina del Dashboard el acceso a Historico de Contagem, y coloca el acceso a Compartir APP pero justo despues de Calculadora Assai, ademas la informacion ded resumen que muestra al final de Usuarios activos, Relatorios Totales y Historicos de Cargamentos Totales, resumelo todo en un mismo cuadro, no es necesario un cuadro para cada resumen, y de ser posible, enriquese mas este cuadro con otras informaciones relevantes
>
> al crear la nueva app reemplaza por la existente en el ultimo releasse, suma un numero al versioncode y publica los cambios, usa el emulador si lo necesitas en ubuntu

L2 — Corrección del usuario sobre T5 y T7, verbatim:

> T5: el botón «Compartir archivo APK» debe descargar /api/app/download-apk a cache/updates y compartir el archivo con FileProvider y mime application/vnd.android.package-archive, igual que la web. No compartas el APK instalado: file_paths.xml no expone /data/app.
> T7: además de las tres cifras y el día en curso, podés enriquecer el cuadro con reportsToday, higieneDone/Total y recepcionDone/Total; todo ya viene en DashboardSummary, sin tocar backend.

Nota: `versionCode` 7004, release `v0.7.0` con reemplazo de asset y notas, despliegue a producción y docs.
