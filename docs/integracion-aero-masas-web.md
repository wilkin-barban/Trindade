# Integración Aero32 — Lanzamiento de Masas y espejo del ERP

Esta guía describe la integración operativa entre Trindade y el ERP **Aero32**: cómo se configura, cómo viaja un
lanzamiento desde la web o Android hasta el WebService de la fábrica, cómo se guarda el espejo del día y qué
reglas se aplican al importar un asiento. Los contratos exactos de los endpoints están en
[registro-integracion-aero-webservice.md](registro-integracion-aero-webservice.md); la auditoría del ERP, en
[integracion-aero32.md](integracion-aero32.md).

## 1. Alcance y principios

- La integración es **exclusiva del usuario `wilkin` con rol Administrador**. Para cualquier otro usuario el panel
  no se renderiza, el interruptor no aparece y el backend rechaza la bitácora con `403`. La autoridad es la base
  de datos, no el cuerpo de la petición ni el estado del navegador.
- **La contraseña del ERP vive en el servidor.** Se escribe una vez en el panel, se guarda cifrada con
  AES-256-GCM en `aero_integration_settings` y no vuelve nunca al navegador. La web recibe un ticket de un solo
  uso y el Atajo lo canjea por el sobre del pedido. Cerrar sesión no borra el cofre: solo **Limpiar** lo elimina.
- **Trindade guarda primero.** El lanzamiento se persiste en Trindade antes de intentar el ERP. Si la empresa no
  responde, la producción no se pierde.
- **La empresa manda en lo que ya registró.** Un asiento del ERP es de solo lectura en Trindade. Importarlo crea un
  lanzamiento local nuevo, nunca modifica el asiento de la empresa.
- **La identidad del asiento se conserva.** El operario es el que el ERP registró, no quien importa.
- **El espejo es de la planta.** El snapshot del día se guarda en Trindade y lo puede leer cualquier operario
  autenticado; es una copia de lo que la empresa ya registró.

## 2. Por qué la web usa un atajo y Android no

La web corre en `https://trindademasas.duckdns.org`. El WebService de la fábrica escucha en HTTP plano sobre la red
interna (`http://192.168.25.250:1453/api`). Safari bloquea ese salto por dos capas: *mixed content* (contenido
inseguro dentro de una página segura) y *Private Network Access* (una página pública no puede alcanzar direcciones
privadas). No es un error de configuración que se arregle con cabeceras: es una negativa del navegador antes de
emitir el paquete.

Un atajo de iOS corre como proceso nativo, sin origen de página. Puede hablar HTTP plano contra la IP interna
cuando el teléfono está en el Wi-Fi de la fábrica. Por eso la web delega el `POST` en el atajo y recibe la respuesta
por un callback. Lo que la página le entrega al atajo es un **ticket de un solo uso**, no la credencial: el sobre
con el `Authorization: Basic` lo arma el servidor, que es el único que puede descifrar la contraseña guardada.

Android no tiene ese problema: la app corre en la red de la planta y llama al WebService directamente, con
`OkHttp` y Basic Auth leída del almacén cifrado. La configuración release solo permite HTTP hacia
`192.168.25.250`; el resto del tráfico exige HTTPS.

## 3. Flujo completo

```mermaid
sequenceDiagram
    actor Operario
    participant UI as Web o Android
    participant API as Trindade API
    participant Cola as Cola local
    participant Atajo as Atajo iOS
    participant ERP as Aero32

    Operario->>UI: Carga cajas por producto
    UI->>API: POST /api/massas-launch
    API-->>UI: Lanzamiento guardado
    alt Web
        UI->>API: POST /api/integration/aero/bridge-tickets
        API-->>UI: { ticket, ticketUrl, expiresAt }
        UI->>Cola: Encola una entrada por producto
        Cola->>Atajo: shortcuts://run-shortcut?name=Aero32 Bridge
        Atajo->>API: POST /bridge-tickets/redeem + X-Trindade-Ticket
        API-->>Atajo: Sobre { url, method, headers, body, callback }
        Atajo->>ERP: POST /entradasitem
        ERP-->>Atajo: Respuesta
        Atajo-->>UI: Callback con aero_action=aero_data
    else Android
        UI->>ERP: POST /entradasitem directo
        ERP-->>UI: Respuesta
    end
    UI->>API: POST /api/integration/aero/movements
    API-->>UI: Snapshot del día actualizado
```

`/entradasitem` acepta **un producto por petición** (o hasta ocho en el sobre de lote). Un lanzamiento de tres
productos son tres idas y vueltas. La cola en `localStorage` evita que la segunda se pierda si iOS abre la vuelta en
otra pestaña.

Cada entrada de la cola lleva **su operario**. `ENT_USU` es la persona que cargó las cajas, no la que configuró el
teléfono: el lanzamiento pendiente de Jaime sale como `JAIME` aunque el navegador esté configurado con el usuario de
Wilkin. Una entrada sin operario, de una cola vieja, firma con el usuario configurado como respaldo.

El botón **Enviar ao ERP** de una fila pendiente y el interruptor de sincronización al lanzar son dos caminos
distintos: el botón de la fila arma una cola con ese producto, sus unidades, sus lanzamientos y su operario, y
dispara `entradasitem` (`launch_sync`); el botón **Sincronizar com ERP** de la cabecera consulta `movimentoitem`
(`read_history`) y no escribe nada en la empresa.

### 3.1 La lectura que el lanzamiento deja debiendo

Conciliar no es enviar: es leer. Cuando el ERP confirma un lanzamiento, la fila todavía no puede saberse
conciliada, porque la única prueba de que la empresa lo tiene es el asiento en `/movimentoitem`. Hasta esta
versión ese segundo viaje lo hacía el operario a mano, con **Sincronizar com ERP**, cuando se acordaba.

Ahora lo dispara el propio lanzamiento, sin pedirle nada:

1. El envío vuelve y la cola del día queda **vacía**: no hay nada más que mandar.
2. La página muestra el **veredicto** y lo deja leer. Todavía no viaja: la lectura no puede tapar la respuesta
   que el operario está esperando.
3. Al cerrar el veredicto — el `onClose` del diálogo o el botón **Fechar**, el mismo cierre — la página gasta
   la marca del día y dispara el viaje de `movimentos` con el mismo sobre de siempre.
4. La vuelta guarda el día completo en `POST /api/integration/aero/movements` y la tabla se reconcilia sola: la
   fila del lote pasa de **pendiente** a **conciliada** por fecha + producto + unidades + operario.

Guardas, todas verificadas en pruebas:

- Sólo el **día abierto** (hoy). Un día pasado no se lee ni se reescribe.
- Sólo con las **credenciales completas**; sin contraseña la página lo dice en vez de fallar en silencio.
- Sólo si **algo se envió**: un lote rechazado entero no deja lectura pendiente.
- Un **lote parcial** no arma la lectura: lo que falló sigue en la cola y su reintento arma su propio veredicto.
- **Una lectura a la vez.** Si el botón está leyendo, el camino automático no abre otra.
- Un **viaje que no vuelve** (el operario cancela el atajo) no se reintenta solo; el botón sigue ahí.

Si la lectura falla, el veredicto del envío queda intacto, la fila sigue pendiente y el motivo se ve en el
aviso. La lectura nunca deshace un lanzamiento.

En la bitácora del servidor cada lectura deja su par `read_history` `requested`/`result` con el mismo
`attemptId` y la fecha en `note`, igual que el botón. Es la forma de distinguir «el operario leyó» de «la
lectura automática no llegó».

Lo que el espejo guarda es **todo** lo que el ERP devolvió ese día, insumos incluidos. La clasificación es una
sola regla por código, `isMassa(code)` en `packages/backend/src/modules/stock/stock.catalog.ts`: **los diez
códigos de masa** (`1045, 39, 60, 84, 91, 1192, 5000, 1047, 22, 1616`) son producción; **cualquier otro código es
insumo**, aunque su descripción empiece con «MASSA P PIZZA». La descripción no decide nunca. Masas muestra esos
diez; los insumos son de **Insumos** (Recebimento) y **Relatório**. Ocultarlos en una tabla no es filtrarlos en la
base: el espejo se guarda completo y se clasifica al leer.

## 3.1 El mensaje de WhatsApp del día

El botón **Compartilhar** de Lançamento de Massas arma el mensaje desde las **filas unificadas**, no desde
`launches`: los lanzamientos locales y los asientos del espejo, deduplicados por asiento (`ent_lan`) y por
lanzamiento. Por eso un trabajador que sólo existe en el ERP —la tableta lo registró y Trindade no lo lanzó—
aparece en el mensaje con su nombre marcado «(só ERP)», sus productos y sus cajas. La lista se filtra por los diez
códigos del catálogo, así que un insumo nunca entra aunque su descripción diga «MASSA». Web y Android generan el
mismo texto para el mismo día.

## 4. Configuración en la web

Dentro de **Lanzamiento de Masas**, debajo de la grilla, hay una tarjeta colapsable. Arranca abierta solo cuando
todavía no hay nada configurado. El panel pide **tres datos**:

| Campo | Qué es | Dónde se guarda | Validación |
| --- | --- | --- | --- |
| URL del WebService | Base del WebService, por ejemplo `http://192.168.25.250:1453/api` | Servidor (cofre) | Debe empezar con `http://` o `https://` y tener host; máximo 2048 caracteres |
| Usuario de la empresa | Usuario del WebService | Servidor (cofre) | No vacío; máximo 64 caracteres |
| Contraseña de la empresa | Contraseña del WebService | Servidor, **cifrada** | No vacía la primera vez; una vacía conserva la guardada |

No hay campo de código de usuario: `ENT_USU` viaja con el **usuario en mayúsculas**, que es lo que manda el binario
Delphi de `base.apk`. El `CODIGO` numérico que devuelve el ERP no se pide ni se guarda.

Datos que resuelve el sistema:

| Dato | Cómo se obtiene |
| --- | --- |
| Usuario del asiento (`ENT_USU`) | El usuario del panel, en mayúsculas |
| Cantidad (`PRO_QTD`) | Siempre en unidades: `cajas × unidades por caja` |
| Serie del asiento (`ENT_SER`, `PED_SER`) | Fija en `APL`, la que trae el binario Delphi |
| Situación tributaria (`PRO_CST`) | `000` (tributada integralmente de fabricación propia) |

El servidor es la autoridad de la configuración. El panel lee `GET /api/integration/aero/settings` al montar y
muestra **Configurado** cuando `hasPassword` es verdadero. El campo de contraseña arranca **siempre vacío**: nunca se
rellena desde el servidor, porque el servidor nunca la devuelve ni la devolverá. La frase **«Senha guardada no
servidor»** es la confirmación de que está ahí.

- Guardar con la contraseña **vacía** conserva la existente: se puede cambiar URL o usuario sin reescribir el
  secreto. Si no hay contraseña previa y no viene una nueva, el servidor responde `400` con un código accionable
  (`AERO_VAULT_PASSWORD_REQUIRED`).
- Guardar con una contraseña **nueva** la reemplaza, cifrada de nuevo.
- **Limpiar** llama `DELETE /api/integration/aero/settings` y solo entonces limpia el estado local; si falla, la
  pantalla no miente. Ese borrado elimina también los tickets pendientes del owner.
- En `localStorage` quedan solo preferencias no secretas: el nombre del atajo, el interruptor de sincronización y
  la fecha de la última sincronización. La URL y el usuario vienen del servidor.

**La contraseña nunca vuelve al navegador.** Ninguna respuesta del API devuelve la contraseña, el ciphertext, el IV
ni el tag; tampoco se escribe en `localStorage`, en `sessionStorage`, en una cookie, en la bitácora, en un log ni en
una URL. Lo que la web puede pedir es un **ticket**: 32 bytes aleatorios con 120 s de vida, un solo uso, del que la
base guarda solo el SHA-256. El Atajo canjea el ticket por el sobre ya armado.

Consecuencia práctica: una pestaña nueva —el callback del Atajo, una pestaña duplicada, otro dispositivo del mismo
owner— consulta, lanza y lee **sin volver a pedir la contraseña**. El cofre no se borra al cerrar sesión; solo
**Limpiar** lo elimina.

## 5. Prueba de conexión

La prueba hace `POST {URL}/usuarios` con Basic Auth y traduce el resultado a una frase útil. La ruta no lleva barra
final: la barra provocaba un `301` que convertía el `POST` en `GET` y devolvía `405`.

El panel no puede armar ese `POST`: no tiene la contraseña ni la alcanza la red de la fábrica. Por eso **Probar
conexión** pide un ticket de acción `test`; el servidor lo mapea a `/usuarios` y arma el sobre con el
`Authorization: Basic` descifrado en memoria, y el Atajo hace el `POST` como en cualquier lanzamiento.

| Veredicto | Significado |
| --- | --- |
| `success = true` | La empresa respondió y aceptó las credenciales |
| `success = false` | El endpoint respondió y rechazó el login (`401`) |
| Sin veredicto | El operario volvió sin ejecutar el atajo, el atajo se cortó o el ticket venció a los 120 s |

Cada intento se registra en la bitácora del backend en dos líneas: `requested` antes de que el teléfono salga y
`result` cuando vuelve. Una línea `requested` sin `result` significa que el pedido nunca salió del teléfono. Ni el
ticket ni la contraseña aparecen en esas líneas: el ticket viaja solo en el header `X-Trindade-Ticket` del canje.

Si el cofre todavía no tiene contraseña, el panel lo dice con una frase accionable
(`AERO_VAULT_NOT_CONFIGURED` la primera vez) en vez de fallar en silencio.

## 6. Atajo `Aero32 Bridge`

Un archivo `.shortcut` tiene que estar firmado por el dispositivo que lo instala, e iOS solo acepta enlaces
oficiales de iCloud. Por eso el panel entrega los valores copiables y el enlace profundo a la app, no un archivo.

Es **un solo atajo**. El nombre debe coincidir exactamente con el que invoca la página; se puede cambiar en el
panel, campo «nombre del atajo».

El atajo no sabe de masas ni de stock: recibe un **ticket**, lo canjea por un sobre, hace el `POST` y devuelve la
respuesta. El diccionario que entrega la página tiene solo dos claves:

```json
{
  "ticket": "<token de un solo uso>",
  "ticketUrl": "https://trindademasas.duckdns.org/api/integration/aero/bridge-tickets/redeem"
}
```

El sobre que devuelve el canje es el mismo de siempre, armado por el servidor y con `body` y `bodies` como **texto
JSON**:

```json
{
  "url": "http://192.168.25.250:1453/api/entradasitem",
  "method": "POST",
  "headers": { "Authorization": "Basic …", "Content-Type": "application/json", "Accept": "application/json" },
  "body": "{\"PRO_COD\":\"001192\",\"PRO_DES\":\"MASSA QUADRADA\",\"PRO_QTD\":1500,\"PRO_CST\":\"000\",\"ENT_DTA\":\"2026-10-28\",\"ENT_USU\":\"WILKIN\",\"ENT_SER\":\"APL\",\"ENT_OBS\":\"\"}",
  "callback": "https://trindademasas.duckdns.org/massas-launch?aero_action=entrada&aero_data="
}
```

| Clave del sobre | Qué es | Dónde se usa |
| --- | --- | --- |
| `url` | Endpoint completo del ERP | Campo URL del `POST` |
| `method` | Siempre `POST` | Método del pedido |
| `headers` | `Authorization: Basic …`, `Content-Type` y `Accept` | Encabezados del pedido |
| `body` | JSON del pedido serializado como texto | Cuerpo de la petición → Texto |
| `bodies` | Lista de textos JSON, solo en el lote | Cuerpo de cada repetición |
| `callback` | Vuelta a la página, con la acción ya puesta | Acción Abrir URLs al final |

Receta — la entrada cambia, el resto se conserva:

1. Abrir **Atajos** → `+` y nombrarlo `Aero32 Bridge`.
2. **Obtener diccionario de la entrada** (la página entrega `{ ticket, ticketUrl }`).
3. **Obtener valor del diccionario**, clave `ticket`.
4. **Obtener valor del diccionario**, clave `ticketUrl`.
5. **Obtener contenido de URL**: URL = valor `ticketUrl`; método `POST`; encabezado `X-Trindade-Ticket` = valor
   `ticket`; `Accept: application/json`; **sin cuerpo**. La respuesta es el sobre.
6. Desde aquí siguen las acciones del ERP —`url`, `headers`, `Authorization`, `callback`, `bodies`, el `POST` y el
   callback—, pero leyendo el **sobre devuelto por el canje** en lugar del diccionario de entrada.

El delta numerado completo, con cada acción y su nueva posición, está en
[integracion-aero32.md §0.2](integracion-aero32.md).

Detalles que importan:

- **El `body` del sobre va como texto, no como diccionario.** Si llegara como objeto y el teléfono lo insertara en
  el cuerpo, iOS lo convertiría en una lista de propiedades y el ERP recibiría algo que no es JSON.
- **La credencial ya no viaja al teléfono desde la página.** Cambiar la contraseña en el panel no obliga a volver a
  tocar el iPhone, y el ticket — que sí viaja — vive 120 s, sirve una sola vez y no entrega la contraseña.
- **El ticket va en el header, no en la URL.** El canje lee `X-Trindade-Ticket`; un ticket en la query quedaría en
  los logs del proxy, en el historial de Shortcuts y en cualquier captura de red.
- **La respuesta vuelve por el callback.** La página separa el prefijo, decodifica y lee el cuerpo real. La acción
  viaja en `aero_action`: `entrada`, `saida`, `movimentos` o `test`. Los parámetros se leen y se borran de la URL
  con `replaceState`, así que un *pull-to-refresh* no vuelve a procesar el mismo resultado.

## 7. Contratos del WebService

Cabeceras en todas las llamadas:

```http
Authorization: Basic base64(usuario:senha)
Accept: application/json
Content-Type: application/json
```

| Endpoint | Método | Uso |
| --- | --- | --- |
| `/usuarios` | `POST` | Prueba de credenciales y obtención del `CODIGO` |
| `/entradasitem` | `POST` | Entrada de producción (lanzamiento de masas) |
| `/saidasitem` | `POST` | Baja o consumo de stock (contrato listo, interfaz pendiente) |
| `/movimentoitem` | `POST` | Consulta de movimientos por usuario, producto y rango de fechas |

Reglas de payload:

- `PRO_COD` va a **6 dígitos con ceros a la izquierda**.
- `PRO_QTD` se escala **×100** en el pedido para que Firebird no lo grabe como decimal; la respuesta de
  `/movimentoitem` vuelve en unidades humanas, no escalada.
- `ENT_USU` y `PED_USU` van en mayúsculas.
- `ENT_SER` y `PED_SER` van fijos en `APL`.
- Las fechas van en `YYYY-MM-DD` y en la zona de São Paulo.

Los JSON completos, los campos de `/saidasitem` y el mapeo de `/movimentoitem` están en
[registro-integracion-aero-webservice.md](registro-integracion-aero-webservice.md).

## 8. Espejo del día y conciliación

El atajo corre en un solo teléfono, pero el espejo lo lee toda la planta. La respuesta del ERP se guarda como
snapshot del día en `aero_movements` para que cualquier dispositivo la vea sin volver a ejecutar el atajo.

- `POST /api/integration/aero/movements` — cuerpo `{ date, movements }`, un elemento por asiento con `ent_lan`,
  `product_code`, `product_desc`, `quantity`, `entry_date`, `operator_name` y `movement_type` (`"E"` o `"S"`).
  Responde `201 { saved }`. Un cuerpo inválido se rechaza con `400 INVALID_MOVEMENTS` y no escribe nada.
- `GET /api/integration/aero/movements?date=YYYY-MM-DD` — responde `{ date, movements }` ordenado por `ent_lan`.
  Cualquier operario autenticado puede leerlo.
- La clave única es `(movement_date, ent_lan, product_code)`: una segunda sincronización del mismo día actualiza
  los asientos que reconoce en lugar de duplicarlos. Los asientos que la respuesta ya no menciona **no** se borran.
- `operator_name` se normaliza a mayúsculas al guardar.
- La tabla es la revisión **7** del esquema y se migra explícitamente; contra una base sin migrar los endpoints
  responden `503 AERO_MOVEMENTS_NOT_MIGRATED`.
- `synced_at` es cuándo Trindade supo del ERP, no cuándo ocurrió el movimiento.

**Un lanzamiento conciliado no se toca.** Cuando el asiento del ERP y el lanzamiento local describen la misma
producción —misma fecha, código, cantidad y operario—, la fila queda conciliada y deja de ofrecer editar y
eliminar, para cualquier rol. No es una restricción de permisos sino de consistencia: Delphi ya asentó esa entrada.
El backend rechaza `PUT` y `DELETE` aunque se los pida por fuera de la interfaz.

**La importación conserva la identidad del asiento.** `POST /api/massas-launch` acepta `ent_lan`, y el operario
viaja **por ítem** en `items[].operator_name`: un lote de la tableta puede ser el trabajo de dos personas, y el
dueño de cada fila es quien la escribió. El lanzamiento guarda el asiento en `massa_launches.ent_lan` y el
operario como dueño cuando ese nombre resuelve a un usuario activo. La forma vieja, un `operator_name` en el
cuerpo para todo el lote, se sigue aceptando: es el respaldo de los clientes que todavía no se actualizaron, y un
ítem que no nombra a nadie hereda el del cuerpo. La conciliación empareja primero por `ent_lan`, sin mirar el
nombre. Un asiento ya importado se rechaza con `409 MASSAS_ALREADY_IMPORTED`.

**Importar es de quien es el asiento.** El backend resuelve el dueño en `aero_movements`, no en el cuerpo de la
petición, y responde `403 MASSAS_FORBIDDEN` cuando un trabajador intenta importar el asiento de otro operario. Un
administrador puede importar el asiento de cualquier operario que exista en Trindade.

**Nadie hereda un asiento que no puede atribuir.** Si el nombre del asiento no resuelve a ningún usuario, el
import se rechaza con `409 MASSAS_OPERATOR_NOT_LINKED`, también para un administrador. Si resuelve a una cuenta
desactivada, el rechazo es `409 MASSAS_OPERATOR_INACTIVE`. La pantalla ofrece `+ Crear Operario` en lugar de
`Importar` para esas filas.

## 9. Errores y mensajes

Toda negativa del módulo de masas viaja con dos campos y en portugués: `code` es el hecho y `error` es la frase que
el operario puede leer. El código decide antes que la frase, porque una frase se reescribe y un código no.

| `code` | HTTP | Lo que dice la pantalla |
| --- | --- | --- |
| `MASSAS_HISTORY_FROZEN` | 409 | El histórico de masas es de solo lectura: los días pasados no se pueden alterar |
| `MASSAS_FORBIDDEN` | 403 | Este lanzamiento pertenece a otro operario |
| `MASSAS_ALREADY_IMPORTED` | 409 | Este lanzamiento del ERP ya fue importado |
| `MASSAS_RECONCILED` | 409 | Esta producción ya fue conciliada con el ERP y no se puede alterar |
| `MASSAS_OPERATOR_NOT_LINKED` | 409 | El asiento no tiene un operario vinculado en Trindade |
| `MASSAS_OPERATOR_INACTIVE` | 409 | El operario del asiento está desactivado |
| `MASSAS_FUTURE_DATE` | 400 | No se puede lanzar en fechas futuras |
| `MASSAS_NOT_FOUND` | 404 | Lanzamiento no encontrado |
| `MASSAS_INVALID_BOXES` | 400 | Cantidad de cajas inválida |
| `MASSAS_CREATE_FAILED`, `…_UPDATE_FAILED`, `…_DELETE_FAILED` | 400 | No se pudo registrar, actualizar o eliminar |

El resto de los códigos (`MASSAS_INVALID_DATE_FORMAT`, `MASSAS_INVALID_LAUNCH_DATA`, `MASSAS_EMPTY_ITEMS`,
`MASSAS_INVALID_ID`) siguen la misma regla y tienen su frase en la tabla de i18n de la web.

El cofre y los tickets usan su propia familia, con la misma forma (`code` + frase accionable):

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `AERO_VAULT_NOT_CONFIGURED` | 503 | Falta `AERO_VAULT_KEY` o no hay contraseña usable guardada |
| `AERO_VAULT_INVALID_SETTINGS` | 400 | URL sin `http://`/`https://` o sin host, o usuario vacío |
| `AERO_VAULT_PASSWORD_REQUIRED` | 400 | Primera vez, sin contraseña previa y sin una nueva |
| `AERO_BRIDGE_INVALID_ACTION` | 400 | Acción fuera de `entrada`, `entrada_lote`, `movimentos`, `test` |
| `AERO_BRIDGE_INVALID_PAYLOADS` | 400 | Cantidad o tamaño de payloads fuera de rango |
| `AERO_BRIDGE_INVALID_CALLBACK` | 400 | El callback no comparte origen con `PUBLIC_APP_URL` |
| `AERO_TICKET_MISSING` | 401 | Falta `X-Trindade-Ticket` en el canje |
| `AERO_TICKET_NOT_FOUND` | 404 | El hash del ticket no existe |
| `AERO_TICKET_UNUSABLE` | 410 | Ticket ya usado o vencido; la respuesta no distingue cuál de los dos fue |

## 10. Procedimiento de prueba en fábrica

Antes de ir:

- [ ] `docker compose ps` con `api` y `web` sanos, y `https://trindademasas.duckdns.org` respondiendo 200.
- [ ] El iPhone tiene el atajo `Aero32 Bridge` creado y actualizado al delta del ticket (`{ ticket, ticketUrl }`).
      El enlace iCloud viejo apunta al atajo de 20 acciones y queda marcado como legacy: no sirve como «listo para
      instalar».
- [ ] El iPhone está en el Wi-Fi de la fábrica; el atajo no funciona por datos móviles porque la IP es interna.

En la fábrica:

1. Abrir la web en Safari e iniciar sesión como `wilkin`.
2. **Lanzamiento de Masas → Configuración Integración Empresa**: URL y usuario; la contraseña se escribe una sola
   vez y queda cifrada en el servidor. El campo vuelve a aparecer vacío y la tarjeta dice «Senha guardada no
   servidor».
3. **Probar conexión**. El botón pide un ticket `test` y abre el atajo, que canjea el ticket por el sobre de
   `/usuarios`; al volver, la tarjeta dice si la empresa respondió. Lo que importa es que no quede en «sin
   veredicto».
4. Cargar **un** producto, una caja, y confirmar con el interruptor **Sincronizar con ERP** activo.
5. iOS abre el atajo; al volver, la tarjeta de confirmación debe desaparecer y aparecer el resultado.
6. Cerrar el veredicto y esperar el segundo viaje: iOS abre el atajo de `movimentos`, la página guarda el día y
   la fila pasa a **conciliada** sin tocar **Sincronizar com ERP**. En el log quedan dos pares: `launch_sync`
   del envío y `read_history` de la lectura.
7. Verificar en el ERP que la entrada existe y en el log del servidor las dos líneas (`requested` y `result`).
8. Repetir con dos productos para comprobar que la cola envía el segundo después del retorno del primero.
9. Probar el fallo: apagar el Wi-Fi, lanzar y confirmar que el lanzamiento **igual** quedó guardado en Trindade.

## 11. Límites conocidos

- El atajo necesita el teléfono en la red de la fábrica; no hay acceso remoto al WebService.
- Sin retorno del atajo (el operario lo cancela), la página no puede adivinar el resultado: lo pregunta.
- La URL, el usuario y la contraseña viven en el servidor, una vez por instalación. El nombre del atajo, el
  interruptor de sincronización y la fecha de la última sincronización siguen siendo preferencias del dispositivo.
- El ticket vive **120 s** y sirve una sola vez. Si el teléfono tarda en volver o el operario repite el canje, el
  API responde `410` y la página pide un ticket nuevo; el lanzamiento ya está guardado en Trindade y no se pierde.
- La prueba de conexión ya no sale del navegador: pide un ticket `test` y va por el atajo, igual que un lanzamiento.
- La respuesta vuelve por la URL del callback: un rango de movimientos muy grande puede superar lo que iOS está
  dispuesto a abrir. Es un motivo más para no pedir historiales largos desde el teléfono.
- El `Authorization: Basic` sigue viajando al ERP porque el ERP no ofrece otro mecanismo, y el atajo es el único
  proceso que habla con la red de la fábrica. Lo que se eliminó es la contraseña del navegador, no el Basic Auth
  del pedido.
- La integración no escribe en las tablas fiscales del ERP ni reemplaza la operación de la empresa.

## 12. Estado de las piezas

| Pieza | Estado |
| --- | --- |
| Cofre cifrado del ERP en el servidor (AES-256-GCM) | Implementada |
| Ticket de un solo uso para el Atajo | Implementada |
| Prueba de conexión `/usuarios` | Implementada por ticket `test` |
| Lanzamiento de masas `/entradasitem` | Implementada |
| Espejo `/movimentoitem` | Implementada |
| Reporte del día desde el ERP | Implementada |
| Importación de asiento y conciliación | Implementada |
| Alta de operario desde el asiento | Implementada |
| Bajas de stock `/saidasitem` | Contrato listo; interfaz pendiente |
| Escritura directa en Firebird | Descartada; se usa el WebService |

## 13. Referencias

- [registro-integracion-aero-webservice.md](registro-integracion-aero-webservice.md) — contratos JSON completos.
- [integracion-aero32.md](integracion-aero32.md) — auditoría del ERP y alternativas.
- [calculadoras.md](calculadoras.md) — reglas de masas y stock.
- [arquitectura.md](arquitectura.md) — mapa técnico del sistema.
