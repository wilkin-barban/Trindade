# Changelog — Trindade Massas

Todos los cambios relevantes del proyecto se documentan en este archivo. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado usa
[SemVer](https://semver.org/lang/es/).

Las versiones **0.6.x** se distribuyeron por `GET /api/app/download-apk` y no tienen tag propio en GitHub.
La release **v0.7.0** es la primera de la línea 0.7.x publicada en GitHub Releases. El detalle de builds,
hashes y verificaciones está en [docs/release-android-historial.md](docs/release-android-historial.md).

---

## [0.7.0] — 2026-11-03

### Corregido

- **La lectura de movimientos del ERP desde Android usa el mismo cuerpo certificado que la web.** El payload
  envía `_method: PATCH` dentro del cuerpo y pide solo entradas (`ENTSAI: "E"`); antes omitía ambos y el ERP
  respondía `HTTP 500` a la sincronización del día.
- **Un día cerrado del Histórico de Cargamento se puede abrir para consulta.** La tarjeta ofrece
  **Ver cronograma** y abre la distribución completa en solo lectura, con las filas inactivas incluidas; no
  ofrece agregar, editar ni eliminar.

### Cambiado

- **Lanzamiento de Masas en Android sigue el orden de la web.** Data de Produção y sincronización, cajas,
  Produção do dia, lançamentos individuales, resumo colectivo y WhatsApp, en ese orden.

### Distribución Android

- El asset de GitHub Release `v0.7.0` (`trindade-0.7.0.apk` y su `.sha256`) y el APK de producción son el
  mismo binario: `versionName 0.7.0`, 11.277.888 bytes y sha256
  `5dd77e331edb1aace6e2b656e899697819a506068dc375528c8dc6f5a5ade922`. El código de build es interno.
- El tag `v0.7.0` no se movió y no se creó una release nueva.

---

## [0.7.0+7006] — 2026-11-02

### Cambiado

- **Un día de cargamento cerrado ya no se puede tocar, y se lee entero.** La grilla de un día pasado abre en
  solo lectura y explica por qué; un lote desactivado se muestra completo, con sus tandas y sus horarios, en
  lugar de aparecer vacío. El servidor rechaza cualquier mutación sobre un día cerrado con `409` y el código
  estable `LOADING_HISTORY_FROZEN`, en vez de aceptarla y dejar el histórico inconsistente.
- **Un administrador puede reactivar un lote o un reporte desde el histórico.** La tarjeta inactiva ofrece la
  reactivación, con confirmación explícita, y el día vuelve para todo el mundo como estaba, con los mismos
  lanzamientos. La misma operación existe en la web y en la aplicación.
- **El selector de motoristas ofrece solo chapas libres y explica las ocupadas.** Una chapa ya asignada al día
  o a la tanda en curso no se repite, y un conductor ocupado dice a qué hora: "já está nas HH:MM". La tanda
  descarta duplicados antes de salir.
- **Una tanda rechazada se informa fila por fila en un solo paso.** El resultado deja de ser un mensaje que se
  pierde al releer el día: el diálogo conserva la lista de rechazos —conductor ocupado, vehículo ocupado— y el
  resto de la tanda se carga igual.
- **La sincronización con el ERP se limita al día abierto.** En un día pasado el botón no aparece y la cola
  descarta el envío en lugar de reintentarlo contra un día congelado; el lanzamiento responde `409`
  `MASSAS_HISTORY_FROZEN` si alguien lo fuerza.
- **El botón de Histórico es el mismo en todos los módulos.** Relatório usa la píldora compartida de Horários y
  Massas, en la misma posición y con el mismo tamaño.

### Corregido

- **Editar un cargamento pasado ya no es posible desde la web.** El histórico deja de abrir el editor en un día
  cerrado y el resultado de la tanda se muestra dentro de la misma ventana.
- **El histórico de la carga dejó de mostrar respuestas viejas.** Abrir el selector relee el día antes de
  ofrecer nombres, y las pestañas descartan la respuesta de una consulta anterior que llega tarde.
- **La placa del fletero ya no ocupa la grilla ni el editor.** Se conserva en la respuesta y en el PDF, y deja
  de competir con la fila de la empresa.
- **El registro de auditoría del ERP recibe lo que los emisores reales mandan.** El contrato se fija con los
  cuerpos de la web y del backend, incluido el par `attemptId`, en lugar de fixtures inventados.

### Distribución Android

- Build **7006** es el asset de GitHub Release `v0.7.0` (`trindade-0.7.0.apk` y su `.sha256`) y la que sirve
  `GET /api/app/download-apk`, con `versionCode 7006`, `versionName 0.7.0`, 11.260.812 bytes y sha256
  `f77643b7…`.
- El tag `v0.7.0` no se movió: se reemplazaron los assets de la misma release.

---

## [0.7.0+7005] — 2026-11-02

### Cambiado

- **La cola de envíos al ERP se vacía entera y se puede deshacer.** El lote se drena en tandas de ocho con
  corte en el primer fallo, así que veinte lanzamientos pendientes salen en una sola apertura de la
  aplicación y lo que sigue no viaja a un servidor que acaba de no contestar. El botón de la pantalla muestra
  cuántos quedan y reintenta los pendientes, y una fila marcada como enviada ofrece **Desfazer** en lugar de
  volver a marcarse.
- **El asiento sin cajas enteras dice por qué no se puede importar.** "3 un não fecham caixas inteiras de 10
  un", "produto desconhecido" y "saída de stock" se explican en la propia fila, con el tamaño de caja del
  catálogo, en vez de ofrecer un botón que el backend iba a rechazar.
- **Una cuenta dada de baja en el ERP no se ofrece para crear.** El estado del operario se lee del espejo y
  del ERP (`owner_status`) y manda sobre la tabla local de vínculos.
- **Guardar la integración ERP responde.** El botón queda en progreso y la pantalla dice si quedó guardado,
  si falta un dato o si el backend rechazó la configuración; el lanzamiento de masas avisa cuando se guardó
  local sin ERP.
- **Una sola forma de contar un fallo de Aero.** El diagnóstico de red, el timeout y el rechazo del
  WebService llegan como una frase propia de la aplicación, con el aviso de Wi-Fi separado de la dirección
  mal escrita.
- **El operario de cada asiento viaja con el asiento.** `items[].operator_name` resuelve el dueño por ítem
  antes de abrir la transacción, con la confirmación de la pestaña como respaldo para clientes anteriores: un
  lote de dos operarios deja de quedar a nombre de quien lo envió.

### Corregido

- **Una conexión probada sin usuario ya no se atribuye a nadie.** El panel HTTP y la aplicación dejaron de
  rellenar el nombre de la cuenta de fábrica cuando el ERP confirmaba las credenciales sin decir de quién
  son, y la importación de un asiento ya no dibuja el texto crudo del servidor: se traduce por código y, si
  no hay uno conocido, queda el mensaje genérico.

### Distribución Android

- Build **7005** es el asset de GitHub Release `v0.7.0` (`trindade-0.7.0.apk` y su `.sha256`) y la que sirve
  `GET /api/app/download-apk`, con `versionCode 7005`, `versionName 0.7.0`, 11.220.352 bytes y sha256
  `87f9a6a3…`.
- El tag `v0.7.0` no se movió: se reemplazaron los assets de la misma release.

---

## [0.7.0+7004] — 2026-11-01

### Cambiado

- **Las decisiones de un histórico se dibujan como iconos.** Desactivar y eliminar ocupaban el ancho de dos
  botones de texto en cada tarjeta, así que la decisión menor de la lista era lo que más pesaba en ella.
  Ahora son dos glifos de 20 dp en la línea de cierre, cada uno dentro de un toque de 48 dp, con la acción
  destructiva en rojo.
- **El filtro de fecha de los históricos es una sola línea de chips.** Día, mes y limpiar conviven en una
  barra compacta que dice qué fecha está aplicada, en lugar de dos campos apilados que empujaban la lista
  media pantalla hacia abajo.
- **El Histórico de Contagem lee la fecha en un panel propio.** La fecha estaba en un campo de texto de
  cuerpo pequeño al lado de un botón aparte. Ahora la superficie entera es el control: la etiqueta arriba,
  la fecha en tipografía de titular y el calendario al extremo.
- **Montagem das Caixas muestra solo los tipos encendidos.** Con el interruptor de un tipo apagado, su grilla
  de cajas desaparece en lugar de seguir ocupando la pantalla sin poder seleccionarse.
- **Compartilhar App explica qué hace y comparte el archivo.** La cabecera tenía el título pegado a la
  izquierda y un vacío hasta Ajuda; ahora lleva título y subtítulo balanceados. La pantalla suma
  **Compartilhar arquivo APK**, que descarga `GET /api/app/download-apk` en la caché de la aplicación y abre
  la hoja de compartir del sistema con el tipo `application/vnd.android.package-archive`, sin exponer rutas
  internas del paquete instalado.
- **El inicio dejó de ofrecer el atajo al Histórico de Contagem** y **Compartilhar App** quedó inmediatamente
  después de **Calculadora de Assaí**, en el orden en que se usan.
- **El resumen del inicio es un solo cuadro.** Tres tarjetas separadas —usuarios activos, relatórios totales y
  historial de cargamentos— pasaron a un panel **Resumo** que además muestra higiene y recepción como
  `hecho/total`, para leer el día sin bajar por la pantalla.

### Distribución Android

- Build **7004** es el asset de GitHub Release `v0.7.0` (`trindade-0.7.0.apk` y su `.sha256`) y la que sirve
  `GET /api/app/download-apk`, con `versionCode 7004`, 11.194.408 bytes y sha256 `7622756d…`.
- El tag `v0.7.0` no se movió: se reemplazaron los assets de la misma release.

---

## [0.7.0+7003] — 2026-11-01

### Cambiado

- **Los cuatro históricos comparten un solo dibujo.** Massas era el único legible; Horário, Relatório y
  Estoque tenían cada uno su cabecera, su tarjeta y su forma de decir que la lectura falló. Ahora usan los
  mismos componentes (`HistoryHeader`, `HistoryRecordCard`, `HistoryPager`, `HistoryStates`): la tarjeta a
  ancho completo con la acción en el cierre, la paginación abajo y el error con reintento.
- **La fecha de la tarjeta dejó de ser un emoji.** El emoji de calendario se dibuja como una hoja con una
  fecha fija impresa, así que todas las tarjetas mostraban el mismo "17 JUL" al lado de fechas distintas.
  Ahora es `ic_calendar` del propio proyecto (`HistoryDateLabel`).
- **Los números concuerdan con lo que cuentan.** "1 produtos lançados · 1 operadores" pasa a
  "1 produto lançado · 1 operador"; igual para cajas, unidades, cargas y días registrados (`<plurals>`).
- **Desactivar y eliminar dejaron de ser los botones más grandes de la tarjeta.** Pasaron de las píldoras de
  administración a acciones de texto (`HistoryActionButton`), con la destructiva en rojo y 48 dp de toque.
- **Montagem das Caixas separa los tipos de caja** con un interruptor por tipo, que limpia la selección del
  anterior en lugar de mezclar las dos cuentas.
- **El horario elige motorista en dos pestañas y con chapa.** Fleteros y Motoristas da Casa son pestañas
  separadas, la marca es múltiple y cada motorista recibe la chapa del camión en la misma pasada.
- **La tabla del horario alinea motorista, vehículo y chapa**, y la lixeira es un icono de 20 dp dentro de un
  toque de 48 dp.
- **El Histórico de Contagem ya no saca al operario del módulo**: abre como overlay de stock y volver lleva a
  la calculadora.
- **Las tarjetas de Compartilhar App ocupan el ancho completo** (`SectionCard`).
- **Las llamadas al ERP se identifican como `Android App / ERP`** también en el test de conexión, con
  `client=android · via=native`, para que el ERP distinga el aplicativo del navegador en su auditoría.

### Distribución Android

- Build **7003** fue el asset de GitHub Release `v0.7.0` hasta el reemplazo por el build 7004, con
  `versionCode 7003`, 11.187.920 bytes y sha256 `82fce07f…`.
- El tag `v0.7.0` no se movió: se reemplazaron los assets de la misma release.

---

## [0.7.0+7000] — 2026-10-31

### Añadido

- **Reporte con el ERP como única fuente de verdad.** El reporte del día se alimenta de `aero_movements` y
  separa los diez códigos de masas de todo lo demás, que se clasifica como **Recepción de Insumos**. Ambos
  bloques viven bajo una sola tarjeta y una sola acción de sincronización.
- **Operarios por asiento del ERP.** Cada asiento conserva el operario que la empresa registró. Si el nombre
  no resuelve a una cuenta, la fila ofrece `+ Crear Operario` en línea; si la cuenta existe pero está
  desactivada, se rechaza con `MASSAS_OPERATOR_INACTIVE`.
- **Alta explícita de operarios.** El botón `+ Registrar Operario` crea la cuenta con rol Trabajador, login
  sin puntos y contraseña de al menos 15 caracteres.
- **Espejo ERP en web y Android.** El snapshot del día queda disponible para toda la planta, con chips por
  operario, conciliación por número de asiento y lectura de solo lectura para los asientos de la empresa.
- **Vista móvil de iPhone** para el espejo y el panel de integración, con el panel de configuración reducido a
  URL, usuario y contraseña.

### Cambiado

- El **Reporte** dejó de leer `massa_launches`: la comparación de balance ya no se dibuja allí y queda en
  Lanzamiento de Masas, que es donde tiene sentido.
- La **importación de un asiento** se rechaza con `MASSAS_OPERATOR_NOT_LINKED` cuando el asiento no tiene
  operario vinculado, en lugar de atribuirlo a quien importa.
- La **verificación de actualización** de Android consulta `GET /api/app/latest-release` en lugar de la API
  anónima de GitHub.
- La tarjeta ERP apila título y acción por debajo de 420 dp para que quepan en pantalla de teléfono.

### Distribución Android (builds históricas)

- Build **7000** fue el asset inicial de GitHub Release `v0.7.0`; quedó reemplazada por la 7003.
- Build **7001** existe en respaldos; no fue publicada.
- Build **7002** fue el binario anterior de producción; quedó reemplazada por la 7003.
- Build **7003** es el asset actual y el binario de producción (ver la entrada `0.7.0+7003`). El tag `v0.7.0`
  no se movió.

---

## [0.6.3+6003] — 2026-10-31

### Corregido

- La tarjeta de reporte de masas interpreta correctamente la respuesta del backend (`name`/`displayName`,
  `erpOnly`/`onlyErp`, `operatorKey` y `entLans`), que antes quedaba vacía porque el contrato Kotlin no
  aceptaba el cuerpo.
- La pantalla **Compartir App** crea el operario antes de enviar el mensaje, con login sugerido desde el
  nombre y contraseña generada.

### Distribución Android

- Build **6003** distribuida por `/api/app/download-apk`; sin tag ni release en GitHub.

---

## [0.6.2+6002] — 2026-10-30

### Corregido

- Las negativas del módulo de masas llegan con `errorCode` y frase en portugués; Android resuelve primero el
  código, de modo que un `409` ya no aparece como un número de estado sin contexto.
- Un lanzamiento importado se atribuye al operario que nombra el asiento del ERP, con `erpOnly` cuando esa
  persona no tiene cuenta en Trindade, en lugar de atribuirlo a quien importó.

### Distribución Android

- Build **6002** distribuida por `/api/app/download-apk`; sin tag ni release en GitHub.

---

## [0.6.1+6001] — 2026-10-30

### Añadido

- La tabla unificada de masas solo ofrece la importación en el asiento que el backend atribuye al lector
  (`canImportRow`, sobre `owner_user_id`).
- Un día pasado es de solo lectura también en el teléfono, igual que en el servidor.

### Distribución Android

- Build **6001** distribuida por `/api/app/download-apk`; sin tag ni release en GitHub.

---

## [0.6.0+6000] — 2026-10-30

### Añadido

- **Paridad Android con el trabajo de Aero32 de la web:** llamadas nativas al WebService por OkHttp con Basic
  Auth leída del almacén cifrado, tabla única de masas sobre los tres estados del día, barra de balance y
  filtro universal por operario.
- Sincronización nativa del día hacia el espejo ERP y tarjeta permanente de masas en las dos pantallas de
  reportes.
- Sección **Integración ERP / Aero32** en el panel de administración.
- Regla de inmutabilidad: un lanzamiento que el ERP ya registró no ofrece editar ni eliminar, para ningún rol.

### Distribución Android

- Build **6000** distribuida por `/api/app/download-apk`; sin tag ni release en GitHub.

---

## [0.5.3+5003] — 2026-10-25

### Distribución Android

- La misma entrega de la build 514, cortada como `v0.5.3` porque la build 514 quedó sobre el tag `v0.5.2`,
  cuyos assets se reemplazaron dos veces. El tag publicado no se mueve ni se reutiliza.
- El workflow del tag construye, firma, verifica la huella del certificado y el `versionCode` empaquetado, y
  publica el APK junto al `.sha256` calculado sobre los bytes enviados.

### Mantenimiento

- Compuerta de pruebas verde en Android, backend y frontend.
- Documentación de la derivación de versión corregida a `major*1000000 + minor*1000 + patch`.
- Contrato OpenAPI regenerado con `MassasErrorResponse`.
- Corregido un test de lanzamiento de masas que dejaba el `viewModelScope` activo entre pruebas.

---

## [0.5.2+514] — 2026-10-24

### Mejorado

- **Perfil:** título en el encabezado junto a Volver y botón de descarga solo cuando existe una actualización
  real o una lectura que se puede reintentar.
- **Temperaturas:** el signo `-` solo existe al inicio; `±` reescribe el valor con un único signo y el campo
  acepta un solo separador decimal.
- **Horario de carga:** teclado numérico, máscara `HH:mm` y selector de hora del sistema.
- **Historial de stock:** lectura del resumen colectivo del día, con envío por WhatsApp o correo y calendario
  limitado a hoy y los treinta días anteriores.
- **Material 3:** sin colores literales fuera del tema y objetivos de toque de 48 dp.

### Distribución Android

- Build **514** publicada sobre `v0.5.2`; assets reemplazados dos veces.

---

## [0.5.2+513] — 2026-10-24

### Mejorado

- Toda la interfaz Android pasa a los tokens de Material 3: colores del esquema, superficies tonales, radio
  de 12 dp y objetivos de toque de 48 dp.
- Los seis paneles de administración confirman antes de escribir y muestran un diálogo de resultado.
- Perfil reorganizado en tarjetas.
- Calculadora de Assaí con título y ayuda en la misma línea.

### Distribución Android

- Build **513** publicada sobre `v0.5.2`.

---

## [0.5.2+512] — 2026-10-24

### Mejorado

- **Navegación Android:** diecisiete iconos vectoriales propios, encabezado sin texto, ocho pestañas raíz,
  menú lateral de trece entradas agrupadas en Operaciones y Administración.
- **Panel de administración:** Tareas y Conductores pasan a ser tarjetas para ambos roles.
- **Módulos raíz:** sin título repetido ni botón Volver en la raíz; las acciones de Historial y Ayuda quedan
  en la barra.
- **Calculador de stock:** opera siempre sobre hoy en São Paulo; la corrección de un día anterior es tarea
  del Historial de stock.
- **Distribución Android:** build **512**, publicada sobre `v0.5.2` con la derivación de versión corregida.

### Mantenimiento

- Se corrigió la derivación de `versionCode` que producía `502` para `v0.5.2` y habría sido un downgrade
  frente al `511` ya instalado.
- El `.sha256` lo genera el propio job de publicación sobre los bytes que sube.

---

## [0.5.1+511] — 2026-10-23

### Mejorado

- **Stock:** el mensaje y el correo dejan de incluir el código de producto; se añade el Resumen Colectivo del
  Día con el total del día.
- **Paridad web/Android** en la ausencia del código y en el resumen colectivo.

### Distribución Android

- Build **511** publicada sobre `v0.5.1`.

---

## [0.5.1+510] — 2026-10-23

### Mejorado

- Los ViewModels de administración (Usuarios, Vehículos, Categorías, Conductores, Tareas, Horarios y
  Auditoría) usan recursos de texto y resuelven el idioma activo en la pantalla.
- Doce claves nuevas por idioma con paridad `pt`/`es`.

### Distribución Android

- Build **510** publicada sobre `v0.5.1`.

---

## [0.5.1+509] — 2026-10-22

### Mejorado

- **Web:** renovación transparente de la sesión con refresh token y reintento único de la petición original.
- **Android:** pantallas administrativas traducidas y mensajes de error modelados como recursos.
- **Permisos:** editar y eliminar un lanzamiento de masas queda restringido al autor en la fecha corriente.
- **Fechas:** el backend rechaza lanzamientos futuros (`MASSAS_FUTURE_DATE`) y los selectores abren en
  `America/Sao_Paulo`.
- **Errores visibles:** las lecturas de vehículos y de versión/QR muestran el fallo con opción de reintentar.

### Distribución Android

- Build **509** publicada sobre `v0.5.1`.

---

## [0.5.1+508] — 2026-10-22

### Corregido

- La exportación de WhatsApp del reporte elimina el prefijo `MASSA` de los nombres de producto en
  `Por Operario:` y `Resumen Colectivo:`.

### Distribución Android

- Build **508** publicada sobre `v0.5.1`.

---

## [0.5.1+507] — 2026-10-22

### Mejorado

- **Lanzamiento de masas:** lanzamientos individuales por encima del resumen colectivo, filtro simultáneo por
  trabajador, nombres por producto, sin total general y con tarjetas ámbar.
- **WhatsApp:** vista previa con resumen colectivo y bloque `Por Trabajador:`; se elimina el prefijo `MASSA`.
- **Distribución Android:** build **507** publicada sobre `v0.5.1`.

---

## [0.5.1] — 2026-10-21

### Añadido

- **Módulo Lanzamiento de Masas** en web y Android: diez productos, resumen colectivo del día, historial,
  polling pasivo cada 15 segundos y exportación a WhatsApp.
- **Modo lectura** en fechas pasadas: sin calculadora, sin edición, sin polling y con retorno al historial.
- **Ayuda contextual** en los módulos principales.
- **Internacionalización** `pt-BR`/`es` con detección automática del locale y paridad de claves.
- **Detector de actualización** basado en digest y tamaño del binario instalado.
- **Panel:** tarjeta de Lanzamiento de Masas en tercera posición y encabezado simplificado.

### Distribución Android

- Builds **506** y **507** publicadas sobre `v0.5.1`.

---

## [0.5.0] — 2026-10-15

### Añadido

- **Calculadora de Assaí:** nueve productos, pedido solo en cajas enteras, validación al salir del campo y
  exportación por WhatsApp.
- **Calculador de stock:** catálogo de veinticinco productos en dos secciones, acumulación de cajas y
  unidades recalculadas, reset por producto y totales del día.
- **Historial de stock:** ruta propia, solo productos contados, selector de fecha, exportación y control de
  rol.
- **Paridad Android** de las tres superficies sobre el contrato publicado.

### Cambiado

- Correo del stock a la dirección de la planta.
- Sesión de acceso de dos horas; la ventana de intentos de login se mantiene en quince minutos.
- **Esquema revisión 5:** tabla `stock_counts`, aditiva y sin reescribir datos.

---

## [0.4.0] — 2026-10-14

### Añadido

- **Teléfono del conductor y del fletero** (`drivers.phone`), opcional, en web y Android.
- **Compartir nativo por WhatsApp** en el cronograma y en el reporte.
- **Envío directo, uno a uno,** a cada fletero del lote con teléfono conocido.
- **Tarjeta del cronograma activo** en el panel.

### Cambiado

- Ventana operativa de quince horas; después del corte, el día activo apunta a la próxima fecha de carga.
- Contrato del panel con `activeScheduleDate`, `activeScheduleCount` y `activeScheduleBatchDate`.

### Base de datos

- **Revisión 4:** columna `drivers.phone`, migración aditiva que no invalida sesiones.

---

## [0.3.0] — 2026-09-29

### Añadido

- **Paridad Android–Web completa:** once pantallas más Perfil, con navegación adaptativa, roles y catálogos.
- **Control de acceso por rol** centralizado en `RolePolicy`, alineado con los guards del backend.

### Base de datos

- **Revisión 3:** `users.security_version` con invalidación atómica de sesiones y refresh tokens.

### Seguridad

- Rate limiting y control de admisión en login y refresh.
- Revocación atómica de sesiones ante cambios administrativos y cambio de contraseña.
- Contratos OpenAPI para las operaciones administrativas y de auditoría.

---

## [0.2.1] — 2026-09-20

- Corrección de la verificación de actualización en Android y alineación de los digests del SDK de build.
- Visualización de la versión instalada en Perfil.

## [0.2.0] — 2026-09-20

- Primera versión pública del APK Android con firma oficial y automatización de release en GitHub Actions.
- Reportes de producción y cronograma de carga con exportación a WhatsApp.

## [0.1.0] — 2026-09-17

- Lanzamiento inicial de la plataforma web y de la infraestructura de producción de Trindade Massas.
