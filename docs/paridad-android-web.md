# Paridad Android ↔ Web / iPhone

Este documento establece la lista de verificación (checklist) técnica y operativa que el desarrollo de
la aplicación nativa Android debe seguir para alcanzar paridad funcional con la aplicación Web (optimizada
para iPhone / Safari) en los módulos de **Salida/Baja**, **Lanzamiento de Masas**, **Históricos**, **Integración ERP Aero32**,
**Sesiones** y **Auditoría**.

Cada sección identifica el archivo web que implementa o fija la regla de referencia para facilitar la comparación
directa de código, pruebas y comportamiento.

---

## 1. Mapeo de archivos y responsabilidades

| Dominio / Comportamiento | Archivo Web / Backend de referencia | Archivo Android equivalente o destino |
| --- | --- | --- |
| Catálogo Salida/Baja (19 productos, 11/3/5) | `packages/backend/src/modules/salida/salida.catalog.ts`<br>`packages/frontend/src/lib/salida.ts` | `packages/android/contract/src/main/kotlin/com/trindade/app/contract/models/SalidaProduct.kt`<br>`SalidaCatalog.kt` |
| Creación y contratos Salida | `packages/backend/src/modules/salida/salida.routes.ts`<br>`packages/backend/src/modules/salida/salida.schema.ts` | `packages/android/contract/src/main/kotlin/com/trindade/app/contract/models/SalidaCreateRequest.kt` |
| Lotes ERP y veredicto lote | `packages/frontend/src/lib/aero-batch.ts`<br>`packages/frontend/src/lib/aero-feedback.ts` | `packages/android/app/src/main/java/com/trindade/app/aero/AeroLogic.kt` |
| Transmisión ERP vs Conciliación Salida | `packages/backend/src/modules/salida/salida-reconcile.ts`<br>`packages/frontend/src/lib/salida.ts` | `packages/android/contract/src/main/kotlin/com/trindade/app/contract/models/SalidaMovementErp.kt` |
| Tarjeta de movimiento y fotos en histórico | `packages/frontend/src/components/salida/SalidaMovementCard.tsx`<br>`packages/frontend/src/components/salida/SalidaPhotoPicker.tsx` | `SalidaMovementCard.kt` |
| Compartir WhatsApp Salida | `packages/frontend/src/components/salida/SalidaWhatsAppShare.tsx`<br>`packages/frontend/src/lib/salida.ts` | `SalidaWhatsAppShare.kt` |
| Pantallas Salida (Lanzamiento e Histórico) | `packages/frontend/src/pages/salida/SalidaLaunchPage.tsx`<br>`packages/frontend/src/pages/salida/SalidaHistoryPage.tsx` | `SalidaLaunchScreen.kt`<br>`SalidaHistoryScreen.kt` |
| Pantallas Masas (Lanzamiento e Histórico) | `packages/frontend/src/pages/MassasLaunchPage.tsx`<br>`packages/frontend/src/pages/MassasHistoryPage.tsx` | `packages/android/app/src/main/java/com/trindade/app/massas/MassasLaunchScreen.kt`<br>`packages/android/app/src/main/java/com/trindade/app/massas/MassasHistoryScreen.kt` |
| Tickets de puente web vs OkHttp directo | `packages/backend/src/modules/integration/aero.vault.routes.ts`<br>`packages/backend/src/modules/integration/aero.tickets.service.ts` | `packages/android/app/src/main/java/com/trindade/app/aero/AeroErpApi.kt`<br>`packages/android/app/src/main/java/com/trindade/app/aero/AeroErpClient.kt` (directo sin puente) |
| Sesión: cookie vs body y ventana de gracia | `packages/backend/src/modules/auth/auth.cookies.ts`<br>`packages/backend/src/modules/auth/auth.sessions.service.ts`<br>`packages/backend/src/modules/auth/auth.routes.ts` | `packages/android/app/src/main/java/com/trindade/app/auth/AuthInterceptor.kt`<br>`packages/android/app/src/main/java/com/trindade/app/auth/AuthRepository.kt` |
| Log de auditoría y códigos de error | `packages/backend/src/modules/integration/aero.schema.ts`<br>`packages/frontend/src/lib/aero-audit.ts`<br>`docs/auditoria-android.md` | `packages/android/app/src/main/java/com/trindade/app/aero/AeroAudit.kt`<br>`packages/android/app/src/main/java/com/trindade/app/aero/AeroAuditOutbox.kt` |

---

## 2. Salida / Baixa

### 2.1 Catálogo fijo de 19 productos (división 11 / 3 / 5)
- **Referencia web**: `packages/backend/src/modules/salida/salida.catalog.ts` y fallback en `packages/frontend/src/lib/salida.ts`.
- **Estructura**: Sin CRUD ni edición. El catálogo consta de exactamente 19 productos distribuidos en 3 bloques:
  - **Embalagens (11 productos)**: `1357` EMBALAG. DISCO 200g, `1356` EMBALAG. DISCO 400g, `1355` EMBALAG. DISCO 500g, `1358` EMBALAG. LASANHA, `1359` EMBALAG. CASEIRA, `1361` EMBALAG. QUADRADA, `1307` EMBALAG. ROLO 1kg, `1625` EMBALAG. TOKO, `1354` EMBALAG. ROLO 500g, `1528` EMBALAG. ROLO 2kg, `1781` EMBALAG. TEMPERO. *(Los códigos `1474` y `1473` de Nhoque fueron retirados definitivamente).*
  - **Bobinas (3 productos)**: `1900` BOBINA ROLO, `1899` BOBINA LASANHA, `1898` BOBINA DISCO.
  - **Matéria-prima (5 productos)**: `1012` SORBATO, `1011` PROPIONATO, `1068` MICRO SAL, `1074` AÇÚCAR 5kg, `1673` GORDURA VEGETAL. *(No incluye `1040` FARINHA TRIGO; `1673` aparece una única vez).*
- **Formatos de código**: 4 dígitos en la UI de planta (`1356`), ensanchados a 6 dígitos con ceros a la izquierda hacia el ERP (`001356`).

### 2.2 Botón de lanzamiento con conteo de productos
- **Referencia web**: `packages/frontend/src/pages/salida/SalidaLaunchPage.tsx`.
- **Texto**: Muestra la cantidad de productos distintos a lanzar, **no** la suma de unidades.
  - Con productos seleccionados (> 0): `Lanzar salida (4)`.
  - En cero: `Lanzar salida` (sin paréntesis).

### 2.3 Persistencia local obligatoria antes del ERP
- **Regla de oro**: "Primero Trindade, después el ERP".
- **Flujo**: El movimiento se crea localmente primero vía `POST /api/salida` con los ítems seleccionados. La respuesta del servidor confirma el `movement.id`. Solo tras almacenar el registro en Trindade se procede al despacho hacia el WebService del ERP. Si el ERP falla o no hay red, el movimiento local ya existe con estado pendiente y nunca se pierde.

### 2.4 Lotes de envío (batch de hasta 8 productos) y veredicto `readAeroBatchResult`
- **Referencia web**: `packages/frontend/src/lib/aero-batch.ts` (`AERO_BATCH_MAX = 8`) y `packages/frontend/src/lib/aero-feedback.ts`.
- **Chunking**: Si un movimiento tiene más de 8 productos, se divide en viajes (*trips*) de máximo 8 ítems en orden.
- **Lector de resultados**: `readAeroBatchResult(data, expected)` analiza el arreglo devuelto por el ERP:
  - `complete`: todos los ítems fueron procesados con éxito (`failed === 0`).
  - `partial`: algunos ítems fallaron y otros fueron aceptados (`ok > 0 && failed > 0`).
  - `failed`: todos los ítems fueron rechazados (`ok === 0`).
  - `unreadable`: la respuesta no es un arreglo o no pudo interpretarse.
  - `legacy`: si devuelve un único objeto no-arreglo (comportamiento de compatibilidad).

### 2.5 Estado de transmisión ERP separado de la conciliación
- **Referencia web**: `packages/backend/src/modules/salida/salida.routes.ts` (`POST /api/salida/:id/erp-result`) y `packages/backend/src/modules/salida/salida.schema.ts`.
- **Doble eje de estado en el movimiento**:
  - `erp`: `{ status: 'sent' | 'partial' | 'failed', message: string | null, sentAt: string }`. Representa el resultado directo del envío HTTP/WebService.
  - `reconciliation`: `{ status: 'reconciled' | 'partial' | 'pending', ent_lans: number[], matched_item_ids: number[] }`. Representa la conciliación contra el asiento registrado en el espejo `/movimentoitem`.
- Tras el intento de despacho al ERP, el cliente reporta el resultado mediante `POST /api/salida/:id/erp-result`.

### 2.6 Diálogo de éxito sin compartir
- **Referencia web**: `packages/frontend/src/components/salida/SalidaSuccessDialog.tsx`.
- El diálogo tras el lanzamiento confirma la persistencia local y el veredicto del ERP, pero **no** incluye previsualización ni botón de WhatsApp. La gestión y compartición se trasladaron por completo al histórico.

### 2.7 Fotografías en el histórico
- **Referencia web**: `packages/frontend/src/components/salida/SalidaMovementCard.tsx`, `packages/frontend/src/components/salida/SalidaPhotoPicker.tsx`, `packages/backend/src/modules/salida/salida.routes.ts` (`POST /api/salida/:id/photos`, `DELETE /api/salida/photos/:photoId`).
- **Restricciones**:
  - Máximo 3 fotos por movimiento.
  - Tamaño máximo 5 MB por archivo.
  - Formatos admitidos: JPEG, PNG, WebP y HEIC/HEIF.
- **Ubicación**: Viven en las tarjetas del histórico; la pantalla de lanzamiento ya no pide fotos. Se adjuntan como evidencia sobre un movimiento ya creado.

### 2.8 Estados por tarjeta y relanzamiento
- **Referencia web**: `salidaPrimaryStatus` y `canRelaunchSalida` en `packages/frontend/src/lib/salida.ts`.
- **Precedencia del rótulo principal**:
  1. Si `erp.status === 'sent'` → **Enviado ao ERP** (`salida.erpSent`).
  2. Si `reconciliation.status === 'reconciled'` → **Conciliado** (`salida.reconciled`).
  3. Si `erp.status === 'partial' || reconciliation.status === 'partial'` → **Parcial** (`salida.erpPartial`).
  4. De lo contrario → **Pendente** (`salida.erpPending`).
- **Botón `Reenviar ao ERP`**: Se ofrece **únicamente** si `canRelaunchSalida(movement)` es verdadero:
  - Permitido solo cuando `reconciliation.status` no es ni `reconciled` ni `partial`, Y `erp.status` es nulo o `failed`.
  - Si el ERP ya aceptó el movimiento en todo o en parte (`sent`, `partial` o `reconciled`), el botón de relanzar se bloquea para impedir duplicar asientos en el ERP.

### 2.9 Bloque de compartir por WhatsApp
- **Referencia web**: `packages/frontend/src/components/salida/SalidaWhatsAppShare.tsx` y `packages/frontend/src/lib/salida.ts`.
- **Comportamiento**:
  - Entrada de teléfono de destino recordada/persistida localmente.
  - Previsualización en vivo del resumen del día.
  - Botón de acción directo para abrir WhatsApp (`https://api.whatsapp.com/send?phone=...&text=...`).
  - **Sin botón de copiar**: la única acción en planta es enviar.
- **Formato estricto de previsualización (`salidaDaySummaryText`)**:
  ```text
  🚛 *Salidas del día — 16/11/2026*
  Movimientos: 1

  👤 *WILKIN*
  *📦 Embalajes*
  • EMBALAG. DISCO 400g — 6000 un
  *🧵 Bobinas*
  • BOBINA ROLO — 13 un
  ```
  - Emojis por categoría: `🚛` cabecera, `👤` operador, `*📦 Embalajes*`, `*🧵 Bobinas*`, `*🧪 Matéria-Prima*`.
  - Operador: nombre de usuario en mayúsculas solo (sin total de unidades al lado).
  - **Invariante estricto**: Sin códigos de producto (`1356`, `1900`), sin etiquetas de estado del ERP y sin línea de total general.

---

## 3. Módulo de Masas

### 3.1 Paridad estructural con Salida
- **Referencia web**: `packages/frontend/src/pages/MassasLaunchPage.tsx` y `packages/frontend/src/pages/MassasHistoryPage.tsx`.
- **Mudas al histórico**: Las secciones `Produção do dia`, `Lançamentos Individuais`, `Resumo Coletivo do Dia` y `Compartilhar por WhatsApp` salieron de la pantalla de lanzamiento y se incorporaron en `MassasHistoryPage.tsx`.
- **Diseño de tarjetas**: La sección `Produção do dia` se re-estiliza como tarjetas individuales de lanzamiento en el histórico, homologando la lectura visual con las tarjetas de Salida.
- **Barra de lanzamiento fija (sticky)**: En vista móvil, el botón/barra de lanzamiento se fija al pie de la pantalla (`bottom-0 sticky`).
- **Sin interruptor de sincronización**: Se elimina el switch `Sincronizar com o ERP da Empresa` de la pantalla de lanzamiento. Si la conexión con el ERP está configurada en los ajustes, todos los lanzamientos se envían automáticamente al ERP.
- **Botón `Sincronizar com ERP` en histórico**: Se reubica en la cabecera de `MassasHistoryPage.tsx`, ya que consultar el espejo del día corresponde a la gestión del histórico.
- **Callback**: El retorno de la operación aterriza en `/massas-history` (en lugar de volver a la pantalla de captura).

---

## 4. Regla común de históricos (Hoje vs Pasado)

- **Referencia web**: `odd/tasks/salida-masas-erp-first.md` (S9), `SalidaHistoryPage.tsx` y `MassasHistoryPage.tsx`.
- **Vista de HOY (`Hoje` / Fecha de planta en São Paulo)**:
  - Vista de gestión activa.
  - Opciones de compartir por WhatsApp habilitadas.
  - Opciones de relanzar hacia el ERP activas para movimientos pendientes/fallidos.
  - Gestión de fotos (agregar y eliminar) habilitada en Salida.
  - En Masas: permisos de edición y anulación vigentes según el rol del operador (Administrador vs Trabajador).
- **Vista de fechas del PASADO**:
  - Modo **solo lectura** estricto.
  - Compartir por WhatsApp **sigue disponible** (es una lectura no destructiva que no muta datos).
  - Bloqueo total de mutaciones: se ocultan o deshabilitan los botones de relanzar al ERP, controles de edición, anulación y carga/borrado de fotografías.

---

## 5. Contrato del puente Web vs Comunicación directa en Android

### 5.1 Flujo del puente web (iOS / Scriptable)
- **Problema en Web**: Safari HTTPS no puede invocar directamente un WebService HTTP privado (`http://192.168.25.250:1453/api`) por restricciones de *Mixed Content* y *Private Network Access*.
- **Solución web**: Utiliza la app Scriptable mediante tickets cifrados:
  1. `POST /api/integration/aero/bridge-tickets`: genera un ticket efímero.
  2. Scriptable canjea el ticket mediante `POST /api/integration/aero/bridge-tickets/redeem` enviando la cabecera `X-Trindade-Ticket`. Recibe las credenciales, payloads y `resultUrl`.
  3. Scriptable llama al ERP.
  4. Para evitar el fallo **HTTP 414 Request-URI Too Large** (cuando respuestas grandes desbordaban la query string del callback Safari), Scriptable almacena el resultado en el servidor vía `POST /api/integration/aero/bridge-tickets/result` (enviando `X-Trindade-Ticket`).
  5. Scriptable regresa a Safari con el callback corto `?aero_result=stored`.
  6. La web resuelve el marcador llamando a `GET /api/integration/aero/bridge-tickets/last-result?action=<action>` dentro de una ventana de 10 minutos.
  7. Compatibilidad retroactiva: si un dispositivo corre un script antiguo que viaja con `aero_data=...` en la URL, la web aún lo procesa.

### 5.2 Comunicación directa en Android (sin puente)
- **Android corre en la LAN nativa**: Dispone de conectividad directa con el WebService en `http://192.168.25.250:1453/api`.
- **Sin puente**: Android **no** utiliza Scriptable ni solicita tickets a `/bridge-tickets`. Llama directo mediante Retrofit/OkHttp usando Basic Auth con las credenciales almacenadas de forma cifrada en el dispositivo.
- **Obligación de evidencia**: Al llamar directo, Android es responsable de emitir exactamente las mismas líneas de auditoría que la web emite mediante el puente, garantizando la trazabilidad idéntica en `logs/aero-integration.log`.

---

## 6. Sesión y autenticación

- **Referencia web**: `packages/backend/src/modules/auth/auth.cookies.ts`, `auth.sessions.service.ts` y `auth.routes.ts`.
- **Web**: El token de refresco viaja en una cookie segura `HttpOnly`, `SameSite=Strict`, `Path=/api/auth` llamada `trindade_refresh`. El cliente web declara la cabecera `X-Trindade-Client: web`. El código JavaScript no tiene acceso al token.
- **Android**: Android carece de jar de cookies estándar y mantiene el flujo por cuerpo JSON: envía `{ "refreshToken": "..." }` a `POST /api/auth/refresh`. Cuando la cabecera `X-Trindade-Client` está ausente o indica `native`, el servidor procesa el token desde el cuerpo.
- **Ventana de gracia de rotación (`ROTATION_RETRY_GRACE_SECONDS = 60`)**:
  - Cuando se refresca una sesión, el token anterior se revoca y se enlaza a su sucesor.
  - Si un reintento por pérdida de paquete o una llamada concurrente vuelve a presentar el token anterior dentro de los 60 segundos posteriores a su rotación (`is_recently_rotated`), el servidor responde `reused-within-grace`: emite un nuevo `access_token` sin revocar la familia de sesiones y sin generar un nuevo token de refresco.
  - Si un token ya rotado se presenta **después** de los 60 segundos, el servidor lo clasifica como ataque de repetición (`reused`), revocando de inmediato toda la familia de sesiones del usuario (`revokeFamily`).

---

## 7. Vocabulario de fallos y códigos de error

Tanto la UI como el log de auditoría deben mapear los fallos a los siguientes códigos estables con prefijo `AERO_`:

| Situación | Código de error en auditoría | Mensaje / Manejo al usuario |
| --- | --- | --- |
| Dispositivo fuera de la red de planta | `AERO_NO_PLANT_WIFI` | Solicitar conexión a la Wi-Fi corporativa. |
| Host `192.168.25.250` inalcanzable | `AERO_ERP_UNREACHABLE` (o `AERO_UNREACHABLE`) | Servidor ERP fuera de línea o sin ruta LAN. |
| Tiempo de espera agotado (timeout) | `AERO_ERP_TIMEOUT` (o `AERO_TIMEOUT`) | Tiempo de espera agotado contactando al ERP. |
| Bloqueo por tráfico cleartext HTTP | `AERO_CLEARTEXT_BLOCKED` (o `AERO_BLOCKED_MIXED_CONTENT`) | Tráfico HTTP no permitido fuera de la excepción autorizada. |
| Ticket de puente vencido (> 10 min) | `AERO_TICKET_EXPIRED` | El ticket de sincronización expiró. |
| Respuesta de ERP no parseable/dañada | `AERO_BRIDGE_UNREADABLE` (o `AERO_MOVEMENTS_UNREADABLE`) | La respuesta del lote no pudo ser leída. |
| Credenciales no configuradas | `AERO_NOT_CONFIGURED` | Configurar usuario y contraseña del WebService. |
| Credenciales inválidas (HTTP 401) | `AERO_UNAUTHORIZED` | Usuario o contraseña del ERP incorrectos. |
| Error interno del WebService (HTTP 5xx) | `AERO_ERP_ERROR` | Error devuelto por el WebService de la empresa. |

---

## 8. Contrato de auditoría

- **Referencia**: `packages/backend/src/modules/integration/aero.schema.ts`, `docs/auditoria-android.md`, `packages/android/app/src/main/java/com/trindade/app/aero/AeroAudit.kt`.
- **Archivo de destino**: `logs/aero-integration.log` (gestionado por `POST /api/integration/aero/log`).
- **Eventos locales de servidor (sin fase)**:
  - `salida_create`: creación de movimiento local de Salida.
  - `salida_photo`: subida de foto asociada a Salida.
  - `report_create`: creación de reporte de producción.
  - `report_photo`: subida de foto en reporte.
- **Eventos de integración ERP emitidos por clientes (con fases `requested` y `result`)**:
  - `launch_sync`: despacho de lanzamiento de masas a `/entradasitem`.
  - `salida_sync`: despacho de movimiento de baja/salida a `/saidasitem`.
  - `read_history`: consulta del espejo de movimientos a `/movimentoitem`.
  - `test_connection`: prueba de conectividad y credenciales.
  - `import`: importación de asiento ERP a Trindade.
  - `queue_rejected`: descarte de elemento en cola local.
- **Campos obligatorios por línea de auditoría**:
  - `event`: nombre canónico del evento.
  - `phase`: `'requested'` (antes de la llamada) o `'result'` (al retornar o fallar).
  - `attemptId`: UUID correlacionador idéntico para el par `requested`/`result`.
  - `client`: `"android"` (en la app móvil) o `"web"`.
  - `destinationUrl`: URL del endpoint destino (`http://192.168.25.250:1453/api/...`).
  - `durationMs`: entero en milisegundos (en fase `result`).
  - `httpStatus`: código HTTP entero devuelto por el ERP (o `null` si hubo fallo de red).
  - `error`: código estable `AERO_...` en caso de error.
  - `note`: prefijo estructurado, por ejemplo: `Android App / ERP · client=android · via=native · ...` (máx. 256 caracteres).
  - `appVersion` y `buildNumber`: versión pública (`versionName`) y código de compilación (`versionCode`).
  - **Seguridad**: Prohibido registrar contraseñas, encabezados `Authorization` o payloads no sanitizados.

---

## 9. Puntos abiertos del repositorio (Open Items)

1. **Verificación de campo con fotografías HEIC en iPhone real**:
   - Backend y frontend validan firmas y tipos MIME para HEIC/HEIF (`ftypheic`, `ftypmif1` en `salida.service.ts` y `reports.service.ts`), pero la prueba física de captura directa desde la cámara/galería de iOS en producción sigue pendiente de confirmación en planta.
2. **Cabecera externa `Server: nginx/1.27.5`**:
   - La directiva `server_tokens off` está activa en el contenedor de Trindade, pero la cabecera `Server: nginx/1.27.5` sigue visible porque la terminación TLS la realiza el reverse proxy perimetral del host (`portfolio-nginx`), que está fuera del alcance de este repositorio.
3. **Liberación de la beta privada de Salida**:
   - El módulo Salida/Baja está actualmente restringido al usuario `wilkin` (`isBetaWorker` en servidor y cliente). Su apertura a todos los roles y trabajadores se realizará en una entrega posterior.
4. **Implementación de vistas Android para Salida**:
   - El contrato Kotlin ya cuenta con los modelos generados en `packages/android/contract/src/main/kotlin/com/trindade/app/contract/models/SalidaMovement.kt` (junto con `SalidaCreateRequest.kt`, `SalidaProduct.kt`, etc.), pero aún deben construirse las pantallas Jetpack Compose (`SalidaLaunchScreen`, `SalidaHistoryScreen`), sus ViewModels y el repositorio correspondiente en `packages/android/app/`.

## Históricos y reporte (pasada del 2026-11-16)

### Cabecera de los dos lanzamientos

Las pantallas de lanzamiento (Salida/Baja y Masas) comparten la misma cabecera: la línea con el día de planta
(`Hoje · dd/mm/aaaa`, calculado en São Paulo, nunca con la zona del teléfono), el botón que lleva al histórico del
módulo y el operador de la sesión con su etiqueta «Sesión»/«Sessão». En Android: la barra superior de cada pantalla de
lanzamiento, con ese orden y esos destinos.

### Sin selector de fecha en el lanzamiento

Desde esta pasada, un lanzamiento es siempre el día de planta. El selector de fecha desapareció de las dos pantallas
de lanzamiento; el pasado se consulta en el histórico. En Android, lo mismo: sin selector, con el día del servidor.

### Históricos

- Abren en el día de planta.
- Si el día está vacío no se dibujan tarjetas: se muestra el estado vacío con el acceso a lanzar.
- Los días pasados son de solo lectura y **sin el compartir por tarjeta**; el botón del final, que comparte el día
  completo, sigue disponible. Hoy conserva los dos.
- El histórico de Salidas conserva además sus fotos (máximo 3) y el relanzar al ERP cuando el envío no fue aceptado.

### Bloque de Salidas dentro del reporte

- **Datos**: `GET /api/reports/day/salidas?date=YYYY-MM-DD`, con sesión y **cualquier rol** (el reporte lo lee todo el
  mundo; `/api/salida` sigue siendo la beta privada de un usuario). Devuelve `{ date, operators[], totalUnits,
  movementCount }`, cada operario con `{ name, username, units, products[{ code, name, block, units }], erpOnly }`.
- **Salida abierta (2026-11-18)**: la web admite a cualquier cuenta autenticada en Salida / Baixa y su histórico; la
  beta de `wilkin` terminó y el servidor ya no filtra por nombre. Android no se toca todavía: cuando implemente el
  módulo, su histórico tampoco muestra `Conferir no ERP`, porque el sync del ERP es del Relatório. El invitado
  conserva su regla de solo lectura, que es de la cuenta y no del módulo.
- **Administración en diálogo (normativa)**: el alta y la edición de `categories`, `tasks`, `drivers`, `vehicles`,
  `timeSlots` y `workers` usan un diálogo modal con `Aceptar` / `Cancelar`, nunca un formulario inline. El trabajador
  limitado sigue viendo solo `tasks` y `drivers`, y en el teléfono el diálogo abre, scrollea y tiene botones de
  44 px.
- **WhatsApp de Masas y Salidas (normativa)**: los históricos escriben el mismo texto que el Relatório — misma tabla
  de abreviaturas, `- nombre corto: N un`, `👤 Operador:`, `📦` en el resumen colectivo y cantidades exactas. La
  tabla compartida es `packages/contracts/whatsapp-abbreviations.json`; el backend y el navegador la comparan fila por
  fila en sus propias suites, y Android debe consumir esa misma tabla y compararse contra el golden del Relatório
  (`packages/backend/src/modules/reports/whatsapp-golden.test.ts`).
- **Abreviaturas del WhatsApp del Relatório (normativa)**: el texto que se comparte por WhatsApp lo produce el
  backend (`generateWhatsAppText`) y **debe ser idéntico en web y Android**: mismas abreviaturas, mismo orden, mismos
  emojis, encabezados, cantidades y agrupación por operario. Las tablas aprobadas -- catálogo por código, nombres del
  ERP y tareas largas con `Org.`/`Receb.` conservados -- están en `odd/tasks/whatsapp-abbreviations.md` y en
  `packages/backend/src/modules/reports/whatsapp-abbreviations.ts`. Reglas: nombre ≤ 20 caracteres, prefijo `- `,
  cantidades exactas con `un`, código de producto solo cuando la abreviatura recorta o queda ambigua, Recebimento
  agrupado por operario (sin `(OPERADOR)` por línea) y `PĂO` → `PÃO` corregido **solo** en el mensaje. El fixture
  dorado para replicarlo en Android es `packages/backend/src/modules/reports/whatsapp-golden.test.ts` (el reporte 80
  del 17/11, texto esperado incluido).
- **El sync del ERP es del Relatório**: el histórico de Salidas muestra lo que el operario lanzó y no consulta el
  espejo. En web no hay botón `Conferir no ERP`; en Android tampoco debe existir. La lectura del día se pide desde
  el Relatório (`triggerAeroMovementsSync`), que es el único lugar donde se sincroniza.
- **Nombres de producto (encoding)**: el WebService de la empresa **no declara charset** y el puente lee el cuerpo
  como UTF-8. Cuando la heurística cae en ISO-8859-2, los bytes UTF-8 de `Ç` llegan como `Ă` más un carácter de
  control (`AĂ…UCAR 5 KG`), y queda así guardado en `aero_movements`. Regla obligatoria: **un código que existe en el
  catálogo de Salida se nombra con el nombre canónico del catálogo** (1074 → `AÇÚCAR 5kg`), nunca con el texto del
  espejo; y para un código ajeno al catálogo, el texto del ERP se repara al leerlo (mapear cada carácter a su byte
  ISO-8859-2 y decodificar esos bytes como UTF-8, aceptando el resultado solo si no queda ningún carácter de control).
  No se toca la ingesta compartida: el espejo guarda lo que trajo el puente y la reparación es de quien muestra.
- **Regla de operarios (obligatoria)**: el bloque une los lanzamientos de Trindade con **las salidas que la empresa
  registró en su ERP**, emparejando por producto + unidades + operador para no contar dos veces la misma salida, y
  **solo acepta asientos cuyo operario sea una cuenta activa de Trindade** (por usuario o por nombre visible). Un
  nombre que solo existe en el libro de la empresa —TELEVENDAS, recepción, cualquiera que nunca usó la app— se
  descarta junto con sus productos. La app Android debe aplicar la misma regla al pintar el bloque.
- **Pantalla**: una tarjeta por operario con sus productos y unidades, el total del día, el estado vacío cuando no hubo
  salidas y un aviso cuando el día no se pudo leer (nunca “no hubo salidas” si falló la lectura).
- **Dónde se ve**: en la vista del reporte y en la pantalla de creación, como previsualización.
- **Texto compartido**: después de `🍝 *LANÇAMENTO DE MASSAS*` y antes de las notas,
  `📤 *SAÍDAS / BAIXA*`, `Por Operário:`, `👤 NOMBRE:` con una línea por producto (`   - PRODUCTO: N un`), y
  `📊 Total: N un`. Sin códigos de producto. Si el día no tuvo salidas, el bloque no aparece.
- **Día**: el `report_date` del propio reporte, el mismo que usan Masas e Insumos.

## Reporte: al guardar, la tarjeta del mensaje (2026-11-16)

El flujo de un reporte en la web/iPhone termina en el mensaje que el grupo recibe, no en el formulario:

1. La pantalla de creación guarda el reporte y **navega a la tarjeta de compartir** (`/reports/:id?saved=1`).
2. La tarjeta muestra el **texto del servidor** (`GET /reports/:id/export`), exacto al que se envía, con cuatro
   acciones de 44 px:
   - **Compartir en WhatsApp**: hoja nativa del sistema con el texto y, cuando el navegador admite archivos, las
     fotos del reporte; si no hay hoja, copia el texto al portapapeles.
   - **PDF**: genera el documento desde ese mismo texto con el generador del cliente (`relatorio-<id>.pdf`).
   - **Editar**: vuelve a la pantalla de edición (`/reports/:id/edit`).
   - **Cerrar**: sale a `/reports`.
   - **No hay botón de copiar**: la hoja de compartir ya lleva el texto.
3. La **vista de lectura** completa sigue existiendo y se abre al entrar al reporte sin el flag (por ejemplo desde
   el histórico); conserva sus botones de export y su diálogo.

Notas para Android: el texto sale del mismo endpoint, así que la app nativa debe pintar ese texto en vez de
reconstruirlo; el compartir es el `Intent.ACTION_SEND` con el texto y, cuando el reporte tiene fotos, con
`EXTRA_STREAM` múltiple si el proveedor lo admite; el PDF se genera desde el mismo texto para que el documento y el
mensaje no diverjan; «Editar» y «Cerrar» son navegación, sin estado propio. La tarjeta es reutilizable: el módulo
Horario de Cargamento la montará con su propio texto y su propio PDF cuando se implemente allí.

## Horario de Cargamento: la misma tarjeta de compartir

El módulo usa la misma tarjeta que el reporte, con su propio texto y su propio documento:

- La acción primaria del día es **Salvar Horário** (44 px, a todo el ancho en teléfono), y es la **única** acción de
  la pantalla: el PDF vive dentro de la tarjeta que abre (`/loading?share=1&date=…`). La grilla sigue guardando cada turno en cuanto se elige el chofer —ese tablero vivo es
  el sentido de la pantalla—, así que «Salvar» cierra, no persiste.
- **Compartir en WhatsApp**: texto de `GET /loading/export?date=` (el mismo que sale al grupo), con la hoja nativa y
  la copia como respaldo.
- **PDF**: `horario-<fecha>.pdf`, generado desde ese mismo texto.
- **Editar**: vuelve a la pantalla de edición del día. **Cerrar**: vuelve a la grilla del mismo día, conservando la
  fecha en la URL. La pantalla de edición lleva el mismo botón Salvar y desemboca en la misma tarjeta.
- **Sin botón de copiar**, igual que en el reporte.

Para Android: el texto sale del mismo endpoint (no reconstruirlo), el compartir es `ACTION_SEND` con el texto, el PDF
se genera del mismo texto y la tarjeta no se dispara sola al guardar un turno.
