# AGENTS.md — Trindade Massas

Punto de entrada obligatorio para cualquier agente que trabaje en este repositorio. La guía operativa
detallada está en [docs/agents/trindade-development.md](docs/agents/trindade-development.md); este archivo fija
las reglas que no se deben redescubrir ni contradecir.

## 1. Antes de tocar código

1. Leer este archivo y la guía de agentes.
2. Identificar si el cambio afecta **web**, **API**, **Android**, **contratos**, **ERP** o varias capas.
3. Leer los tests y la documentación del módulo antes de editar. No proponer cambios sobre código que no se leyó.
4. Comprobar `git status` y no pisar trabajo ajeno.
5. Respetar datos reales, credenciales, tokens y logs: nunca incluirlos en commits, fixtures ni respuestas.

## 2. Mapa del proyecto

- `packages/backend/`: API Fastify, SQLite, migraciones, reglas de permisos, integración ERP y auditoría.
- `packages/frontend/`: SPA React + Vite. Español/portugués, diseño responsive y pruebas Playwright.
- `packages/android/`: Kotlin + Jetpack Compose + Hilt + Retrofit + kotlinx.serialization.
- `packages/contracts/openapi.json`: contrato generado desde los esquemas Zod del backend.
- `packages/android/contract/`: cliente Kotlin generado desde ese OpenAPI. **No editar a mano.**
- `packages/backend/apk/`: APK servido por producción y su sidecar `.sha256`.
- `docs/`: arquitectura, despliegue, release Android, ERP y auditoría.

## 3. Reglas de producto que no se negocian

- **Primero Trindade, después el ERP.** Persistir el lanzamiento local antes de intentar la red de la empresa.
- **La empresa manda sobre lo que ya registró.** Un asiento del ERP es de solo lectura; importarlo crea un
  lanzamiento local nuevo.
- **Permisos en el servidor.** La UI puede ocultar, pero el backend decide. Un histórico cerrado no se edita ni se
  borra; el Administrador puede desactivar/reactivar según las reglas existentes.
- **Fechas de planta en São Paulo.** No usar la zona horaria del navegador o del teléfono como autoridad.
- **Precedencia de datos:** el día, el espejo del ERP y las reglas del backend son la verdad; no crear una tercera
  copia de estado en la UI.

## 4. Web y API

- La web es una SPA React. Mantener las cadenas de planta en portugués y la documentación/UX en español cuando
  corresponda; no hardcodear textos que ya tienen clave i18n.
- Validar diseños en **390 px** y **1440 px** además de los tests unitarios.
- Los endpoints nuevos necesitan: esquema Zod, ruta, pruebas de permisos y contrato OpenAPI.
- Ejecutar, según el alcance:
  ```bash
  npm --workspace=packages/backend test
  npm --workspace=packages/frontend test:node
  NODE_ENV=test npm --workspace=packages/frontend run test:unit
  npx playwright test --project=chromium
  ```
- No agregar lógica de permisos solo en el cliente. Un `403`/`409` del servidor debe mostrarse como una frase
  accionable, no como una excepción sin manejar.

## 5. Android

- La app debe mantener paridad funcional con la web, no una copia visual ciega. Un cambio de flujo se implementa
  en ambos clientes y se prueba en ambos.
- Usar Compose, ViewModel y repositorios existentes; no introducir otra arquitectura o librería sin necesidad.
- Respetar los códigos de error y la auditoría de Aero (`docs/auditoria-android.md`).
- Un build release **exige** `-PapiBaseUrl`, `-PversionName`, `-PversionCode` y `-PrequireSigned=true`.
- El `versionCode` es interno y debe ser **mayor al instalado**. No publicarlo en notas ni documentación pública.
- Verificar el APK con `aapt2 dump badging` y `apksigner verify --print-certs`, y comparar el SHA-256.

La guía detallada de build, firma, actualización y publicación está en
[docs/agents/trindade-development.md](docs/agents/trindade-development.md).

## 6. Contratos

El contrato no se edita a mano:

```bash
# Backend Zod -> OpenAPI
npm run contracts:generate --workspace=packages/backend

# OpenAPI -> cliente Kotlin, dentro de la imagen Android
docker run --rm --user "$(id -u):$(id -g)" \
  --env HOME=/gradle-home \
  --volume "$HOME/.cache/trindade-gradle:/gradle-home" \
  --volume "$PWD:/work" --workdir /work \
  ghcr.io/cirruslabs/android-sdk:35 \
  bash scripts/generate-android-contract.sh
```

Después de regenerar, compilar y correr los tests de contrato. CI compara ambos artefactos; un contrato
desactualizado es un fallo, no un aviso.

## 7. Integración ERP Aero32

- Web: no puede llamar HTTP privado desde HTTPS por *mixed content*/*Private Network Access*; en el iPhone usa
  **Scriptable** (`scriptable:///run/Aero32Bridge?ticket=…&ticketUrl=…`) y callback. El script `Aero32Bridge` se
  instala una sola vez **copiando el código** de `/Aero32Bridge.js` (JS crudo servido por la web), creando un script
  nuevo en Scriptable con **+**, pegando y renombrando a `Aero32Bridge`. No se descarga el `.scriptable` (es JSON y
  pegado en el editor falla con `SyntaxError: Unexpected token ':'`), no hay receta de acciones, botones de copiar ni
  enlace de iCloud.
- Android: llama directo al WebService con OkHttp y Basic Auth desde el almacén cifrado del dispositivo.
- Host de producción: `http://192.168.25.250:1453/api`. No habilitar cleartext global; la excepción release es solo
  ese host.
- Endpoints: `/usuarios`, `/entradasitem`, `/saidasitem`, `/movimentoitem`.
- `/entradasitem`: `PRO_COD` a 6 dígitos, `PRO_QTD` ×100, `PRO_CST="000"`, `ENT_SER/PED_SER="APL"`, usuario en
  mayúsculas, fecha `YYYY-MM-DD` de São Paulo.
- `/movimentoitem`: enviar **`_method: "PATCH"` en el cuerpo y en la query**, `ENTSAI:"E"` para entradas y los
  filtros abiertos explícitamente en `null`. Ese es el cuerpo certificado de la web y el que evita el `HTTP 500`
  del ERP.
- La sincronización del día es una lectura; **no** envía lanzamientos. El botón de una fila y la cola son los
  caminos de escritura.
- Un fallo de red/host se clasifica; no se convierte en “sin conexión” genérico. La auditoría emite pares
  `requested`/`result` con el mismo `attemptId`.
- No guardar contraseñas, `Authorization` ni cuerpos con credenciales en el log.

Los contratos exactos y el flujo operativo están en:
[docs/integracion-aero-masas-web.md](docs/integracion-aero-masas-web.md),
[docs/registro-integracion-aero-webservice.md](docs/registro-integracion-aero-webservice.md),
[docs/integracion-aero32.md](docs/integracion-aero32.md) y
[docs/auditoria-android.md](docs/auditoria-android.md).

## 8. Build, actualización y publicación Android

Para una build nueva:

1. Elegir `versionName` público y un `versionCode` interno **mayor** al instalado.
2. Compilar y firmar el release. No usar el build debug para distribuir.
3. Verificar `versionName`/`versionCode` en `output-metadata.json`, firma y SHA-256.
4. Copiar el APK a `packages/backend/apk/trindade-<version>.apk` y regenerar su `.sha256`.
5. Actualizar en `packages/backend/src/modules/app/app.service.ts`:
   - `LOCAL_APK_FILENAME`;
   - `LOCAL_APK_BUILD_NUMBER` con el **mismo** entero que el `versionCode`;
   - `FALLBACK_RELEASE.version`.
6. Reconstruir y desplegar la API. Verificar:
   ```bash
   curl -fsS https://trindademasas.duckdns.org/api/app/latest-release
   curl -fsSL https://trindademasas.duckdns.org/api/app/download-apk -o /tmp/trindade.apk
   sha256sum /tmp/trindade.apk
   ```
7. Actualizar `CHANGELOG.md`, `docs/release-android.md`, `docs/release-android-historial.md` y el hash de
   `docs/auditoria-android.md`. No mostrar el `versionCode` en notas públicas.

**Cómo decide la app:** `UpdateDetector` compara primero la versión pública; si es mayor, es `NEW_RELEASE`. Si es
igual, compara `buildNumber` cuando ambos lados lo conocen; solo si falta cae al tamaño del APK y luego a
`publishedAt`. Por eso cada build debe subir `versionCode` **y** el `buildNumber` que publica `/latest-release`.

No instalar un APK en un emulador/dispositivo ajeno sin pedido explícito. No mover tags publicados ni reutilizar
uno: una rebuild interna sube el código, no el tag.

## 9. Verificación antes de entregar

- Ejecutar la suite afectada y el contrato.
- Probar los dos clientes si el comportamiento es compartido.
- Revisar el diff, no incluir secretos ni artefactos temporales.
- Si se publica, verificar el artefacto **descargado**, no solo el archivo local.
- Dejar constancia del cambio en `CHANGELOG.md` cuando corresponda.

## 10. Documentos de referencia

- [Guía completa para agentes](docs/agents/trindade-development.md)
- [Arquitectura](docs/arquitectura.md)
- [Despliegue y rollback](docs/despliegue.md)
- [Release Android](docs/release-android.md)
- [Historial de builds](docs/release-android-historial.md)
- [Integración ERP](docs/integracion-aero-masas-web.md)
- [Contratos ERP](docs/registro-integracion-aero-webservice.md)
- [Auditoría Android](docs/auditoria-android.md)
- [Contribución](CONTRIBUTING.md)
