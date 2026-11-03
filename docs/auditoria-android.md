# Auditoría Android / ERP

Este documento describe el contrato y las consultas del log compartido de integración con el ERP. El archivo
vive en `logs/aero-integration.log` (o el directorio que indique `AERO_LOG_DIR`) y se escribe mediante
`POST /api/integration/aero/log`.

## 1. Identidad

Toda línea emitida por el APK Android lleva:

- `client: "android"`
- `note` con el prefijo `Android App / ERP · client=android · via=native`
- `attemptId` UUID
- `appVersion` (`BuildConfig.APP_VERSION_NAME`)
- `buildNumber` (`BuildConfig.APP_VERSION_CODE`)

La versión y el build son lo que permiten separar un comportamiento de un APK de otro. El ERP también recibe
`User-Agent: Trindade-Android/<version>`, pero el log del proyecto guarda los dos campos estructurados.

## 2. Eventos canónicos

Android emite los mismos nombres que la web:

| Acción | Evento |
| --- | --- |
| Enviar una masa al ERP | `launch_sync` |
| Consultar el día del ERP | `read_history` |
| Probar credenciales/host | `test_connection` |
| Importar un asiento del ERP a Trindade | `import` |
| Descartar un pendiente de cola | `queue_rejected` |

El backend conserva los alias históricos `dispatch`, `sync`, `test` e `import` para APKs viejos. No se
reescriben las líneas viejas: son auditoría. Una consulta debe incluir ambos vocabularios mientras existan
líneas anteriores al cambio.

## 3. Par de un intento

Cada intento contra el ERP emite dos líneas con el mismo `attemptId`:

1. `phase: "requested"` antes del preflight o del request.
2. `phase: "result"` al terminar, con `httpStatus`, `durationMs` y `error` cuando corresponda.

Ejemplo de una consulta:

```json
{"event":"read_history","phase":"requested","client":"android","attemptId":"0f6c...","destinationUrl":"http://192.168.25.250:1453/api/movimentoitem","appVersion":"0.7.0","note":"Android App / ERP · client=android · via=native · date=2026-11-03"}
```

```json
{"event":"read_history","phase":"result","client":"android","attemptId":"0f6c...","destinationUrl":"http://192.168.25.250:1453/api/movimentoitem","appVersion":"0.7.0","httpStatus":200,"durationMs":850,"note":"Android App / ERP · client=android · via=native · date=2026-11-03 · seats=8 · saved=8"}
```

Un `launch_sync` lleva además `launchId` en ambas líneas. Un `test_connection` lleva el código de fallo de red
en `error` cuando no llegó a probar credenciales.

## 4. Códigos de error

Los códigos estables del log son:

- `AERO_NOT_CONFIGURED`
- `AERO_NO_PLANT_WIFI`
- `AERO_ERP_UNREACHABLE`
- `AERO_CLEARTEXT_BLOCKED`
- `AERO_ERP_TIMEOUT`
- `AERO_ERP_NO_ROUTE`
- `AERO_ERP_CONNECTION_REFUSED`
- `AERO_ERP_REFUSED`
- `AERO_SNAPSHOT_REFUSED`
- `AERO_BACKEND_DAY_CLOSED`

La UI traduce el código; el log conserva el código y no la frase traducida.

## 5. Outbox

`AeroAuditOutbox` guarda hasta 200 líneas durante 7 días antes de enviarlas. Una línea se elimina solo cuando
el backend responde 2xx; un 400/404/422 se descarta porque el cuerpo no es válido; un 401/5xx o un fallo de
transporte queda para el próximo intento. El envío se reintenta al abrir Masas y antes de un nuevo evento.

La entrega es *at-least-once*: si se pierde la respuesta después de que el servidor escribió la línea, el
reintento puede duplicarla. El `attemptId` permite reconocer el par y la repetición.

## 6. Consultas

```bash
# Consultas ERP desde Android, nuevas y viejas
jq -c 'select(.client=="android" and (.event=="read_history" or .event=="sync"))' \
  logs/aero-integration.log

# Lanzamientos Android con id estructurado
jq -c 'select(.client=="android" and .event=="launch_sync" and .launchId!=null)' \
  logs/aero-integration.log

# Un intento completo
jq -c 'select(.client=="android" and .attemptId=="0f6c...")' \
  logs/aero-integration.log

# Fallos de red, por código
jq -c 'select(.client=="android" and (.error // "" | startswith("AERO_")))' \
  logs/aero-integration.log

# Versión/build que escribió las líneas
jq -r 'select(.client=="android") | [.appVersion,.buildNumber] | @tsv' \
  logs/aero-integration.log | sort | uniq -c
```

## 7. Verificación del build publicado

- APK final: `versionName 0.7.0`, sha256
  `b863bb265af7bb047d25aaac91c9824bb1e50904b4719fe4595b78b0c09ac055`, firmado con la huella oficial.
- La lectura de movimientos usa el cuerpo certificado de la web: `_method: PATCH`, `ENTSAI: "E"` y los
  filtros abiertos en `null`. El test de contrato de `AeroErpClientTest` fija ese cuerpo exacto.
- Para verificar el log sin publicar el build se instaló una variante de prueba `0.7.1`: el detector de
  actualización la considera más nueva que el `v0.7.0` que sirve producción y no bloquea la app.
- La sincronización ERP generó el par:
  - `read_history` / `requested` / `client=android` / `appVersion=0.7.1`;
  - `read_history` / `result` / mismo `attemptId` / `httpStatus=null` / `durationMs=2687` /
    `error=AERO_ERP_UNREACHABLE`.
- El `buildNumber` viaja en la línea para diagnóstico interno; no se documenta ni publica su valor.
- Verificación: backend **712/712**, Android **1336/1336**, `BUILD SUCCESSFUL`.
- El APK final `0.7.0` queda en `packages/android/app/build/outputs/apk/release/app-release.apk` y en
  Desktop. Producción sirve ese mismo binario en `GET /api/app/download-apk`, y `latest-release` informa
  `apkSize: 11277888`; una instalación del build final ya no recibe el bloqueo de actualización.

## 8. Límites

- No se guardan contraseñas, `Authorization` ni cuerpos con credenciales.
- El log se rota a los 2 MB y conserva una generación anterior.
- `sync_refused` del backend usa el header `X-Trindade-Client`; si falta, escribe `client: null` en lugar de
  atribuir la línea a Android.
- La lectura del espejo almacenado en Trindade no es una consulta al ERP y no se audita con `read_history`.
