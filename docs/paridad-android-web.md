# Paridad Android ↔ Web / iPhone

Este documento establece la lista de verificación (checklist) técnica y operativa que el desarrollo de
la aplicación nativa Android debe seguir para alcanzar paridad funcional con la aplicación Web (optimizada
para iPhone / Safari) en los módulos de **Salida/Baja**, **Lanzamiento de Masas**, **Históricos**, **Integración ERP Aero32**,
**Sesiones** y **Auditoría**.

Cada sección identifica el archivo web que implementa o fija la regla de referencia para facilitar la comparación
directa de código, pruebas y comportamiento. **Última actualización: 2026-11-18**; la sección final consolida las
remediaciones de esa etapa y el checklist que Android debe cumplir.

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
  2. Scriptable canjea el ticket mediante `POST /api/integration/aero/bridge-tickets/redeem` enviando la cabecera `X-Trindade-Ticket`. Recibe las credenciales, payloads, `resultUrl` y opcionalmente `steps` para sobre multi-paso.
  3. Scriptable llama al ERP. En lanzamiento de masas (`entrada` y `entrada_lote`), ejecuta en un solo viaje:
     - Paso 1: lanzamiento (`/entradasitem`).
     - Paso 2: consulta de movimientos del día (`/movimentoitem?_method=PATCH`).
     Devuelve el resultado compuesto `{ launch, read }`.
  4. Para evitar el fallo **HTTP 414 Request-URI Too Large** (cuando respuestas grandes desbordaban la query string del callback Safari), Scriptable almacena el resultado en el servidor vía `POST /api/integration/aero/bridge-tickets/result` (enviando `X-Trindade-Ticket`). Cuenta además con guarda de 2 MB: si el compuesto excede el tamaño, descarta `read` y conserva `launch`.
  5. Scriptable regresa a Safari con el callback corto `?aero_result=stored`.
  6. La web resuelve el marcador llamando a `GET /api/integration/aero/bridge-tickets/last-result?action=<action>` dentro de una ventana de 10 minutos.
  7. Si `read` viene presente y válido, concilia el espejo inmediatamente sin segundo viaje a Safari. Si falta (script legacy sin `steps`) o falla, cae automáticamente al auto-read como fallback.
  8. Compatibilidad retroactiva: si un dispositivo corre un script antiguo que viaja con `aero_data=...` en la URL o sin `steps`, la web aún lo procesa y ejecuta el segundo viaje de auto-read tras cerrar el veredicto.

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

## 9. Puntos abiertos del repositorio (histórico)

La lista vigente está en **11. Open Items actualizados**, al final del documento. La beta de Salida y la
implementación Android que figuraban en esta sección ya fueron reemplazadas por esa lista.

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
- Los días pasados son de solo lectura y **sin el compartir por tarjeta individual**; el compartir del día completo
  sigue disponible: en Salida, el botón del final; en Masas, el bloque de WhatsApp, que se muestra siempre y queda
  deshabilitado con la prévia vacía si no hay datos. La vista de detalle del histórico es la `ShareCard` de solo
  lectura, con botón Volver y sin Editar salvo el día de hoy, que ofrece Editar si el servidor todavía permite
  corregirlo (ver sección 2026-11-18).
- El histórico de Salidas conserva además sus fotos (máximo 3) y el relanzar al ERP cuando el envío no fue aceptado.

### Bloque de Salidas dentro del reporte

- **Datos**: `GET /api/reports/day/salidas?date=YYYY-MM-DD`, con sesión y **cualquier rol** (el reporte lo lee todo el
  mundo; `/api/salida` sigue siendo la beta privada de un usuario). Devuelve `{ date, operators[], totalUnits,
  movementCount }`, cada operario con `{ name, username, units, products[{ code, name, block, units }], erpOnly }`.
- **Salida abierta (2026-11-18)**: la web admite a cualquier cuenta autenticada en Salida / Baixa y su histórico; la
  beta de `wilkin` terminó y el servidor ya no filtra por nombre. Android sigue la misma regla: el módulo nació sin
  beta y su histórico tampoco muestra `Conferir no ERP`, porque el sync del ERP es del Relatório. El invitado
  conserva su regla de solo lectura, que es de la cuenta y no del módulo.
- **Administración en diálogo (normativa)**: el alta y la edición de `categories`, `tasks`, `drivers`, `vehicles`,
  `timeSlots` y `workers` usan un diálogo modal con `Aceptar` / `Cancelar`, nunca un formulario inline. El trabajador
  limitado sigue viendo solo `tasks` y `drivers`, y en el teléfono el diálogo abre, scrollea y tiene botones de
  44 px.
- **WhatsApp de Masas y Salidas (normativa)**: los históricos escriben el mismo texto que el Relatório — misma tabla
  de abreviaturas, `- nombre corto: N un`, `👤 Operador:`, `📦` en el resumen colectivo y cantidades exactas. La
  tabla compartida es `packages/frontend/src/lib/whatsapp-abbreviations.table.json`; el backend y el navegador la comparan fila por
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
3. La **vista de lectura** completa sigue existiendo para el detalle directo sin flag; conserva sus botones de
   export y su diálogo. El **Histórico de Relatórios** abre la `ShareCard` con `?share=1`, no la vista de lectura.

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
- **Vista de solo lectura del histórico**: el “Ver horário de carregamento” abre la `ShareCard` con
  `/loading?share=1&date=…&from=history`; no muestra Editar y tiene un botón Volver al histórico. El botón
  `Salvar Horário` no existe en esa vista (solo en el editor).
- **Fleteros con teléfono**: la lista uno a uno vive en la tarjeta del día, no en la grilla. El editor tiene
  **una sola acción**, `Salvar Horário`; el texto, el PDF y los chips de cada fletero con número se dibujan en
  la pantalla de compartir, junto a la tarjeta.
- **Sin botón de copiar**, igual que en el reporte.

Para Android: el texto sale del mismo endpoint (no reconstruirlo), el compartir es `ACTION_SEND` con el texto, el PDF
se genera del mismo texto y la tarjeta no se dispara sola al guardar un turno. La grilla no dibuja el flujo de envío:
`LoadingScreen` conserva `Salvar Horário` como única acción del día y `LoadingShareScreen` dibuja, junto a la
`ShareCard`, los fleteros del día cuyo número permite abrir el chat.

---

## Remediaciones consolidadas 2026-11-18 (normativa para Android)

Esta sección consolida las remediaciones, cambios y decisiones de la etapa cerrada el 2026-11-18. El resto del
documento sigue vigente; si una sección anterior contradice esta, mandan esta sección, el código y los tests.

### 1. Salida / Baixa abierta y reglas de rol

- **Sin beta por nombre**: `/salida`, `/salida-history` y las nueve rutas de `/api/salida*` aceptan cualquier cuenta
  autenticada. Un anónimo sigue recibiendo **401**; el invitado conserva la regla de solo lectura de su cuenta.
- **Puente**: la acción `saida` del ticket también acepta cualquier usuario autenticado. Se eliminaron
  `SAIDA_BETA_USERNAME`, `SAIDA_FORBIDDEN_MESSAGE` y el `403` por nombre. `entrada`, `entrada_lote`, `movimentos` y
  `test` no cambian.
- **Histórico**: no tiene `Conferir no ERP`. El sync del espejo es **solo del Relatório** (`ReportsPage` con
  `triggerAeroMovementsSync` e `includeExits: true`). `Reenviar ao ERP` sigue disponible solo cuando
  `canRelaunchSalida(movement)` lo permite; si el ERP ya aceptó todo o parte, se bloquea para no duplicar asientos.
- **Contrato**: el OpenAPI describe la superficie como autenticada y `SalidaReportOperator` lleva `erpOnly`; el
  artefacto `packages/contracts/openapi.json` y el cliente Kotlin se regeneran en el mismo commit. Android debe
  consumir esos modelos generados, no copiarlos a mano.
- **Android**: nace sin beta, sin `Conferir no ERP` y con el mismo reparto de acciones. El invitado sigue siendo
  solo lectura.

### 2. Administración: alta y edición en diálogo

- **Seis pestañas con alta**: `categories`, `tasks`, `drivers`, `vehicles`, `timeSlots` y `workers`.
- El botón `+ Nuevo` abre un **diálogo modal** con `Aceptar` / `Cancelar`; ya no alterna a un formulario inline.
- `Editar` reutiliza el mismo diálogo con los campos cargados. `Aceptar` ejecuta el handler de siempre; `Cancelar`
  cierra y limpia. Se conservan campos, validaciones, estados de carga, mensajes de éxito/error, reset y visibilidad
  por rol.
- El trabajador limitado sigue viendo solo `tasks` y `drivers`. En iPhone el diálogo abre, scrollea y sus botones
  tienen **44 px**.
- **Android**: usar un modal o bottom sheet con el mismo contenido, las mismas validaciones y botones de 44 dp; no
  agregar formularios inline nuevos.

### 3. WhatsApp: una sola tabla y un solo formato

- **Fuente única**: `packages/frontend/src/lib/whatsapp-abbreviations.table.json` publica la tabla aprobada. El
  backend la refleja en `whatsapp-abbreviations.ts`; el navegador la consume desde
  `packages/frontend/src/lib/whatsapp-abbreviations.ts`. Los tests `whatsapp-abbreviations.contract.test.ts` y
  `whatsapp-abbreviations.parity.test.ts` comparan las copias fila por fila; no se aceptan duplicados sin test.
- **Tablas**: catálogo/ERP con la versión agresiva aprobada (`EMBALAG. CASEIRA` → `CASEIRA`, `QUEIJO RALADO GROSSO
  TRINDADE 40G` → `QUEIJO 40g`, etc.) y tareas largas con la versión moderada que conserva `Org.` y `Receb.`.
- **Reglas del mensaje**: nombre de producto/tarea **≤ 20 caracteres**; línea de producto apuntando a **≤ 32**;
  cantidades exactas con `un`; prefijo `- `; emojis, encabezados, agrupación por operario y diseño intactos;
  Recebimento agrupado por operario (`👤 NOMBRE:`) sin `(OPERADOR)` por línea; código de producto solo si la
  abreviatura recorta o queda ambigua; `PĂO` → `PÃO` corregido **solo en el texto**.
- **Precedencia**: el nombre que la planta escribió en el asiento manda sobre la abreviatura del catálogo por código
  (`001045 … CASEIRA 1 KG` → `CASEIRA 1kg`); el código queda como respaldo. Para un código ajeno al catálogo, el
  texto del ERP se repara al leerlo; no se toca la ingesta compartida.
- **Históricos**: Masas y Salidas escriben el mismo texto que el Relatório (mismos nombres cortos, `- nombre: N un`,
  `👤 Operador:`, `📦` en el resumen colectivo y cantidades exactas). La fecha, la cantidad de movimientos y las
  cajas de Masas se conservan.
- **Estado vacío de Massas**: cuando no hay lanzamientos ni filas del espejo, el bloque `Compartilhar por WhatsApp`
  **se muestra igual**, con la prévia vacía (`Sem lançamentos para compartilhar`) y el botón de WhatsApp
  **deshabilitado**. No se muestra un mensaje con solo el encabezado. El botón `Copiar Relatório` fue eliminado: la
  hoja nativa ya lleva el texto.
- **Sin botón de copiar** en las superficies de compartir; la copia queda solo como fallback cuando el navegador no
  puede abrir la hoja nativa.
- **Android**: debe consumir la misma tabla JSON y el mismo golden
  (`packages/backend/src/modules/reports/whatsapp-golden.test.ts`), no reconstruir el texto con nombres completos.
  Mismos nombres, orden, emojis, encabezados, cantidades, agrupación y estado vacío.

### 4. Masas: un solo viaje a Safari y resultado compuesto

- **Alcance**: solo `entrada` y `entrada_lote`. No cambia `saida`, el Relatório ni la app Android.
- `buildBridgeEnvelope` agrega `steps` al sobre del ticket:
  1. lanzamiento: el `url`/`method`/`body`/`bodies` del ticket;
  2. lectura del día: `movimentoitem?_method=PATCH`, con `CODFOR: null`, `NOMUSU: null`, `CODPRO: null`, `DTINI` y
     `DTFIM` desde el `ENT_DTA` del primer payload, `ENTSAI: 'E'` y `_method: 'PATCH'`.
- `Aero32Bridge.js` v2 ejecuta los pasos en orden en el mismo viaje, con timeout por paso y cuidado de errores, y
  envía un resultado compuesto `{ launch, read }` a `resultUrl`. El sobre conserva `url`/`body`/`bodies` legacy para
  que un script viejo siga lanzando.
- **Límite**: si el compuesto supera **2 MB**, se descarta `read` y se conserva `launch`; el callback vuelve corto.
- **Consumo web**: `MassasHistoryPage` usa `launch` para el veredicto y `read` para el espejo. Si `read` viene
  presente y válido, **no** arma ni consume el auto-read ni pide un segundo `movimentos`; si falta o falló, cae al
  auto-read actual. Se conservan la cola, el reintento de lotes parciales y el diálogo de veredicto.
- **Receta**: el código copiable está en **Administración → Integração ERP / Aero32**
  (`AeroScriptableDialog` → `packages/frontend/scriptable/Aero32Bridge.js`, publicado en
  `packages/frontend/public/Aero32Bridge.js`). Si el script ya existía, se reemplaza **todo** el código y se guarda
  manteniendo el nombre `Aero32Bridge`.
- **Auditoría**: se conservan `launch_sync` y `read_history`, con `attemptId` correlacionador y fases `requested` /
  `result`.
- **Android**: no usa el puente ni tickets; llama directo por OkHttp/Retrofit con Basic Auth. Debe replicar el mismo
  significado: `launch` para el veredicto, `read` para el espejo, sin segundo auto-read si `read` es válido, con el
  mismo fallback y las mismas líneas de auditoría.

### 5. Históricos: `ShareCard`, solo lectura y Volver

La tarjeta canónica de compartir es `packages/frontend/src/components/reports/ShareCard.tsx`: título, subtítulo,
texto del servidor, estado de carga/error y acciones de WhatsApp/PDF, con `Editar` opcional y botón de cierre.

- **Relatório**: al guardar, `/reports/:id?saved=1` muestra la `ShareCard` con `Editar` y `Cerrar` a `/reports`.
  El **Histórico de Relatórios** abre `/reports/:id?share=1`: misma tarjeta, sin `Editar`, con un botón **Volver** a
  `/reports/history`. El detalle de lectura completo sigue existiendo para el acceso directo sin flag.
- **Carregamento**: el editor usa `/loading?share=1&date=…` y conserva `Editar`/`Cerrar`. El **Histórico de
  Carregamento** abre `/loading?share=1&date=…&from=history`: misma tarjeta, sin `Editar`, con **Volver** a
  `/loading/history`. El botón `Salvar Horário` no existe en la vista de solo lectura; sí en el editor.
- **Sin copiar**: la tarjeta no tiene botón de copiar; la hoja nativa es la acción primaria.
- **Estados**: si el día no tiene datos, el histórico muestra su estado vacío y, en Masas, el bloque de compartir
  deshabilitado con la prévia vacía. Si la lectura falla, se muestra el error, nunca “no hubo datos”.
- **Android**: la vista de detalle de un histórico es una pantalla de solo lectura con el texto del servidor, acciones
  de compartir/PDF y un botón Volver; no es el formulario de edición ni una grilla editable. El botón Volver y los
  destinos deben coincidir con los de la web.
- **Fechas rápidas de los históricos**: la fila ofrece siempre **las cinco fechas de calendario inmediatamente
  anteriores a hoy** (`hoy-1 … hoy-5`, hoy aparte) y «Todas as datas» para el archivo completo. No son las cinco
  primeras del archivo: con un archivo de 18, 17, 16, 13 y 12/11 esas serían las ofrecidas y se saltarían el 15 y
  el 14, que son las dos fechas pasadas más recientes. Un chip sin producción abre su estado vacío —que es una
  respuesta— y el pasado es de solo lectura; «Todas as datas» no se rellena, muestra lo que el servidor reportó.
- **Editar en el día de hoy**: la tarjeta dibuja `Editar` cuando quien la abre lo ofrece, sea cual sea la puerta. Si un
  día se puede corregir es un hecho de ese día y de quien lo mira — hoy, y permitido por el servidor —, no de si se
  llegó desde el archivo. En el informe manda `report.canEdit && report_date == hoy`; en el cargamento, el día es hoy
  y su lote sigue activo. `Editar` abre el editor del día, no una copia de la tarjeta.
- **Implementación**: la pasada web de estas dos vistas se estaba cerrando al escribir este documento; la norma de
  arriba es la que Android debe replicar una vez validada por el E2E de 390 px.

### 6. Menú y textos

- Se eliminó la sección **Futuro** y el ítem deshabilitado **Exportación WhatsApp** del menú web. No quedan
  placeholders de funciones ya implementadas.
- **Android**: el menú no debe mostrar secciones “Futuro” ni entradas deshabilitadas para funciones que ya existen.

### 7. i18n: no borrar claves compartidas

La limpieza de las claves de Massas eliminó por error `reports.copied` y `loading.copied`, y el E2E de
`report-view-export` detectó que el botón de copiar del Relatório dejó de decir «¡Copiado!». La regla es:

- Borrar solo las claves propias del cambio (`massas.copyReport`, `massas.copied`).
- No tocar claves compartidas por Report/Loading (`reports.copied`, `loading.copied`, `stock.copied`,
  `share.copied`).
- Android debe mantener los mismos textos visibles y el mismo comportamiento; si usa recursos propios, la paridad se
  valida contra los textos de la web, no contra una traducción nueva.

### 8. Evidencia de la etapa

| Cambio | Commits / evidencia |
| --- | --- |
| Salida abierta a todos los roles web | `527e459e`; rutas 401 sin sesión; E2E no-wilkin y 390 px |
| Administración en diálogo | `c0a4650f`; seis pestañas, `admin-<tab>-modal`, Aceptar/Cancelar |
| WhatsApp de los históricos con la tabla del Relatório | `e076e51e`; tabla compartida y tests de paridad |
| Sobre multi-paso de Masas | `b5454bc3`, `cf6cc0f3`, `2bd0fea1`, `2691b405`, `4b66d3a5`; E2E del viaje único |
| Fix del wiring del veredicto compuesto | `347dba08` |
| Dashboard con siete tarjetas | `9ace21f1` |
| Tabla de abreviaturas dentro del paquete frontend | `fdbea06b`, `39ab31eb`; build de Docker autocontenido |
| Tres arreglos de UI: Massas vacío, Loading solo lectura, menú | `c8452fe5`, `e04e0e7b`, `d0f01754`, `98613fc7`, `b57c5383` |
| Verificación | Vitest **232/232**, node **753/753**, `tsc` limpio, build **15.21 s**, E2E **129/129** (6.4 m), CI **success**; deploy `StartedAt` 10:51, bundle `assets/index-Bp5uU5_M.js` con «Sin lanzamientos para compartir» y sin «Copiar Reporte» / «Exportación WhatsApp» |

La pasada del sobre multi-paso y las abreviaturas dejó además backend **974/974**, contrato OpenAPI regenerado y
cliente Kotlin con `erpOnly` y `AeroBridgeStep`. El E2E de 390 px cubre Salida, modales de Administración, share de
históricos, Masas vacío, Loading solo lectura y menú.

### 9. Ideas incorporadas (no perder)

- **Un solo mensaje**: el texto de WhatsApp se genera en el servidor (o se lee de la tabla compartida); Android no
  reconstruye nombres ni totales por su cuenta.
- **Una sola tarjeta**: `ShareCard` es la vista de compartir del Relatório, de Horario y de los históricos. No crear
  una variante nueva por pantalla.
- **Una sola tabla**: las abreviaturas viven en un JSON compartido y se validan por los dos lados; la copia que usa
  el navegador viaja dentro del paquete frontend para que el build de Docker sea autocontenido.
- **Estado vacío visible**: si no hay nada que compartir, la tarjeta se muestra con la prévia vacía y la acción
  deshabilitada; no se oculta el bloque ni se inventa un mensaje de solo encabezado.
- **Solo lectura es una vista, no un formulario apagado**: el detalle del histórico es la tarjeta de compartir con
  Volver, no la pantalla de edición con los controles deshabilitados.
- **Un viaje, con fallback**: el sobre multi-paso de Masas evita el segundo viaje a Safari, pero un script viejo y
  una lectura ausente siguen funcionando con el auto-read.
- **Primero Trindade, después el ERP**: el registro local existe antes de cualquier despacho; el histórico no
  reemplaza esa garantía.
- **El sync del ERP es del Relatório**: ni Salida ni Masas Histórico consultan el espejo por su cuenta.
- **44 px y 390 px**: los botones, modales y tarjetas se prueban en el teléfono, no solo en escritorio.
- **Contrato generado e i18n compartido**: Kotlin sale del OpenAPI; las claves compartidas no se borran al limpiar
  un módulo.

### 10. Checklist de paridad para Android

Antes de dar una pantalla por terminada, verificar:

- [ ] **Contratos**: modelos generados desde `packages/contracts/openapi.json`; no editar a mano `SalidaReportOperator`
  (`erpOnly`), `AeroBridgeEnvelope` ni `AeroBridgeStep`.
- [ ] **Texto de WhatsApp**: sale del servidor o de la tabla compartida; mismas abreviaturas, orden, emojis,
  encabezados, cantidades y agrupación. Comparar contra el golden del Relatório.
- [ ] **Compartir**: `ACTION_SEND` con el texto (y fotos cuando el módulo las tenga); sin botón de copiar como acción
  primaria; copia solo como fallback.
- [ ] **Estado vacío**: el bloque de compartir de Masas se muestra con la prévia vacía y el botón deshabilitado; no
  se inventa un mensaje con solo el encabezado.
- [ ] **Históricos**: detalle de solo lectura con `ShareCard`/texto del servidor y con Volver; **Editar solo el día
  de hoy** y solo si el servidor lo permite (`canEdit` en el informe; día activo y de hoy en el cargamento). El pasado
  no se edita: es el registro de lo que la planta hizo. El editor sigue siendo el único lugar con Salvar.
- [ ] **Días pasados**: sin compartir por tarjeta individual; el compartir del día completo sigue disponible.
- [ ] **Roles**: Salida/Baixa para toda cuenta autenticada; invitado solo lectura; sin beta por nombre; Administración
  con el mismo alcance por rol.
- [ ] **ERP**: sync del espejo solo desde el Relatório; sin `Conferir no ERP`; `Reenviar ao ERP` solo si
  `canRelaunchSalida`.
- [ ] **Masas**: `launch` para veredicto y `read` para espejo; sin segundo auto-read si `read` es válido; fallback y
  auditoría equivalentes.
- [ ] **Fechas**: día de planta en São Paulo, no la zona del teléfono; callbacks y flags de navegación equivalentes
  (`?saved=1`, `?share=1`, `from=history`).
- [ ] **UI**: objetivos de 44 dp, vista de 390 px, modales que abren/scrollean, sin desbordes.
- [ ] **Datos**: operarios solo si son cuentas activas de Trindade; nombre canónico para códigos del catálogo;
  reparación local de encoding sin tocar la ingesta.
- [ ] **Auditoría**: `attemptId`, fases `requested`/`result`, códigos `AERO_*`, sin credenciales ni payloads sensibles.
- [ ] **Tests**: golden de WhatsApp, paridad de tabla, E2E de 390 px y de solo lectura.

### 11. Open Items actualizados

1. **HEIC/HEIF en iPhone real**: backend y frontend validan las firmas; falta la prueba física de captura en planta.
2. **Cabecera `Server`**: la terminación TLS la hace el reverse proxy del host; fuera del alcance de este repo.
3. **Pantallas Android** — **cerrado**: existen y están en uso las pantallas Compose, ViewModels y repositorios de
   Salida, Masas, Horario, Relatório y Administración. Lo que queda se mide con el checklist de arriba (§10) y con
   los históricos de `ShareCard`, no con «falta la pantalla».
4. **Vistas de histórico web** — **cerrado**: la `ShareCard` de solo lectura de Carregamento y Relatórios está
   implementada en los dos clientes; Android la replica en `LoadingShareScreen` y en el historial de Reportes, con
   `Volver` y `Editar` sólo hoy (§5 «Editar en el día de hoy»).
5. **Medición real del sobre de 2 MB**: conviene medir un día de Masas con muchos movimientos en producción para
   confirmar que el compuesto no descarta `read` con frecuencia.
6. **Verificación con cuenta no-wilkin en producción**: la matriz de rutas está cubierta por tests, pero falta una
   sesión real de planta para la comprobación manual.
7. **Higiene de i18n**: no volver a borrar claves compartidas al limpiar un módulo; el E2E del botón de copiar del
   Relatório es la guarda.
