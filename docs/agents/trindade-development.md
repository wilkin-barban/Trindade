# Guía de desarrollo para agentes — Trindade Massas

Este documento es el manual operativo completo para desarrollar, probar, publicar y depurar las dos
aplicaciones de Trindade. El punto de entrada obligatorio es [AGENTS.md](../../AGENTS.md); si hay una
contradicción entre una costumbre y este documento, primero revisar el código, los tests y el estado real de
producción, y luego actualizar esta guía en el mismo cambio.

## 1. Qué es Trindade

Trindade Massas es una plataforma de operaciones de planta con tres piezas desplegables:

| Pieza | Tecnología | Rol |
| --- | --- | --- |
| API | Fastify + TypeScript + SQLite | Autoridad de reglas, permisos, persistencia, auditoría y release Android |
| Web | React + Vite + TypeScript | Consola responsive para Administrador y Trabajador |
| Android | Kotlin + Compose + Hilt + Retrofit | Cliente nativo para el trabajo en planta, con integración ERP directa |

El repositorio es un monorepo npm. `packages/contracts/openapi.json` es la frontera entre la API y Android.
`packages/android/contract/` es el cliente Kotlin generado desde ese contrato.

## 2. Puesta en marcha

Requisitos: Node.js 24+, npm 10+, Docker/Compose. Para pruebas Android se usa la imagen fijada del SDK.

```bash
make install
cp .env.example .env
# Definir JWT_SECRET; no commitear .env
make dev
```

- Web local: `http://localhost:5173`
- API local: `http://localhost:3000`
- API de e2e/Playwright: `http://localhost:3099/api`

No usar datos de producción en tests ni en una base local. La base de producción es el volumen externo
`trindade_sqlite_data`; no ejecutar `down -v` ni borrar el volumen.

## 3. Flujo de trabajo para un cambio

1. Leer `AGENTS.md`, esta guía y el módulo afectado.
2. Escribir o localizar el test que expresa la regla. Para permisos, el test debe cubrir la respuesta del
   servidor, no solo la visibilidad de un botón.
3. Cambiar la capa mínima necesaria.
4. Si cambia la API, actualizar Zod, ruta, tests y contrato OpenAPI.
5. Si cambia el contrato consumido por Android, regenerar el cliente Kotlin y compilar.
6. Si el flujo existe en web y Android, verificar ambos. La paridad es funcional, no una copia literal.
7. Ejecutar la suite afectada y revisar el diff.
8. Documentar la entrega en `CHANGELOG.md` y, si cambia la distribución, en los documentos de release.

## 4. Backend: reglas y patrones

### 4.1 Estructura

Cada módulo vive en `packages/backend/src/modules/<modulo>/` y normalmente separa:

- `*.routes.ts`: validación de entrada, autenticación y respuesta HTTP.
- `*.service.ts`: reglas de negocio y acceso a SQLite.
- `*.schema.ts`: contratos Zod compartidos con OpenAPI.
- `*.test.ts`: pruebas de ruta/servicio.

Los permisos se resuelven en el servidor. La UI recibe flags como `canEdit`, `canDelete`, `canActivate` y debe
dibujar lo que el servidor responde; no re-derivar el rol en el cliente. Un cambio de permisos debe actualizar
las pruebas de backend y, si aplica, los flags de los DTO.

### 4.2 Fechas y días operativos

La zona de la planta es **America/Sao_Paulo**. Usar los helpers de `src/lib/date` / equivalentes; no usar
`new Date().toISOString().slice(0,10)` como “hoy” de la planta. Un día cerrado no se edita ni se borra; el
turno noche puede conservar una ventana operativa distinta para reportes. Respetar las reglas existentes de
`history-permissions` y del servicio de carga/reportes.

### 4.3 Base de datos

- El esquema y las migraciones viven en `packages/backend/src/db/`.
- Una instalación existente no se migra, resetea ni siembra sola al arrancar.
- Los cambios de esquema necesitan migración y pruebas.
- Antes de tocar producción: backup y seguir [docs/despliegue.md](../despliegue.md).

### 4.4 Contrato

El contrato se genera desde Zod, nunca se edita a mano:

```bash
npm run contracts:generate --workspace=packages/backend
```

Después se regenera el cliente Android (sección 7). CI compara ambos; un contrato desactualizado falla la lane.

## 5. Web

### 5.1 Patrones

- SPA React con React Router; páginas en `packages/frontend/src/pages/`.
- Componentes compartidos en `components/ui` y componentes de dominio junto al módulo.
- i18n en `src/i18n/locales/es.json` y `pt-BR.json`; toda cadena nueva debe existir en ambos idiomas.
- Los datos de operaciones se leen del backend; no introducir estado persistente que duplique la verdad del
  servidor.
- Las acciones destructivas requieren confirmación y muestran el motivo de un rechazo del servidor.
- La API se llama por el cliente `src/api/client.ts`; no usar `fetch` suelto si ya existe el wrapper.

### 5.2 Fechas en iOS

No usar un `<input type="date">` desnudo en una superficie nueva: WebKit reclama ancho intrínseco y dibuja el
texto del sistema, lo que rompe los filtros. Usar `DateField` (y su variante `type="month"`). El control visible
es propio; el input nativo transparente encima conserva el picker, el foco y `min`/`max`.

### 5.3 Responsive

- Probar como mínimo **390 px** y **1440 px**.
- En teléfono, los controles de formulario ocupan una fila completa y tienen objetivo táctil de 48 px.
- Las tarjetas de histórico usan el patrón compacto: resumen clickeable, acciones por icono con target, metadatos
  en una línea propia. No introducir un botón de texto que deje un hueco muerto al lado de iconos.
- No ocultar información esencial por “limpieza” visual; el operario necesita fecha, estado, autor y acción.

### 5.4 Pruebas

```bash
npm --workspace=packages/frontend test:node
NODE_ENV=test npm --workspace=packages/frontend run test:unit
cd packages/frontend && npx playwright test --project=chromium
```

Los tests e2e comparten un servidor y un día de planta. Un test no debe asumir que un espejo está vacío; leer el
estado o aislar el dato que crea. Un fallo intermitente por estado compartido se corrige en el test, no se
“arregla” repitiendo el run.

## 6. Android: estructura y desarrollo

### 6.1 Stack y capas

- Kotlin + Jetpack Compose + Material 3.
- Hilt para inyección.
- Retrofit + OkHttp + kotlinx.serialization.
- ViewModels de pantalla, repositorios para red/almacenamiento, modelos generados en `packages/android/contract`.
- Las pantallas nuevas deben seguir los patrones existentes de estado/errores; no agregar una arquitectura
  paralela.

### 6.2 Paridad con la web

Un cambio de flujo debe implementarse en web y Android cuando el usuario final lo necesita en ambos. Revisar:

- mismo orden de operaciones y mismos nombres de pantalla;
- mismos permisos y reglas de solo lectura;
- mismos códigos de error/auditoría del ERP;
- misma semántica de fecha/día de planta.

No copiar un componente visual si el patrón nativo ya existe; adaptar la interacción al tamaño del teléfono.

### 6.3 Builds

La documentación de firma y keystore es [docs/release-android.md](../release-android.md). Reglas:

- Build release firmado, nunca debug para distribución.
- Obligatorios: `-PapiBaseUrl=https://.../`, `-PversionName=x.y.z`, `-PversionCode=N`,
  `-PrequireSigned=true`.
- La imagen Android fijada del proyecto se usa en CI; no cambiar la imagen sin actualizar la guía y el workflow.
- El `versionCode` es interno. Debe ser **mayor** al instalado para que Android acepte la actualización.
- Verificar `output-metadata.json`, `apksigner verify --print-certs` y `aapt2 dump badging`.
- Guardar el APK y su `.sha256`; no publicar credenciales ni el keystore.

Para una build local reproducible, usar el mismo contenedor y el archivo de entorno de firma que documenta el
workflow. El repo no guarda el keystore ni sus contraseñas.

### 6.4 Publicación y actualización

La app consulta `GET /api/app/latest-release`. La respuesta incluye:

```json
{
  "version": "v0.7.1",
  "apkUrl": "https://trindademasas.duckdns.org/api/app/download-apk",
  "apkName": "trindade.apk",
  "apkSize": 11277888,
  "buildNumber": 7011,
  "publishedAt": "2026-11-03T20:11:58.000Z",
  "webUrl": "https://trindademasas.duckdns.org"
}
```

`UpdateDetector` decide en este orden:

1. Versión pública más nueva → `NEW_RELEASE`.
2. Versión más vieja → nada.
3. Misma versión con `buildNumber` en ambos lados → actualización solo si el remoto es mayor.
4. Sin `buildNumber`, mismo tamaño → actualizado; tamaño distinto → patch.
5. Sin tamaño comparable → `publishedAt` posterior a la build instalada.

Por eso **cada build interna debe subir el `versionCode` y el `buildNumber` que publica la API**. Una rebuild que
solo cambia el código pero conserva ambos es invisible para clientes ya instalados.

### 6.5 Publicar un APK de producción

1. Compilar y firmar con `versionCode` mayor.
2. Copiar a `packages/backend/apk/trindade-<version>.apk` y generar el `.sha256`.
3. En `packages/backend/src/modules/app/app.service.ts` actualizar:
   - `LOCAL_APK_FILENAME`;
   - `LOCAL_APK_BUILD_NUMBER` (igual al `versionCode` del APK);
   - `FALLBACK_RELEASE.version`.
4. Actualizar `FALLBACK_UPSTREAM_APK_URL` si existe una release de GitHub que corresponda.
5. Reconstruir/desplegar la API.
6. Verificar `/latest-release`, descargar el APK y comparar SHA-256.
7. Actualizar `CHANGELOG.md`, `docs/release-android.md`, `docs/release-android-historial.md` y los hashes de
   `docs/auditoria-android.md`.
8. No mostrar el `versionCode` en notas públicas; el `buildNumber` se expone en la API porque el cliente lo
   necesita, pero no se publica como valor en la documentación de release.

Una build de la **misma versión pública** reemplaza el APK de producción y sube el código/build; una versión
pública nueva actualiza el `versionName`, el tag/release si se usa GitHub y la versión que devuelve la API. No
mover un tag ya publicado.

### 6.6 Instalación

No instalar un APK en un emulador o teléfono ajeno sin autorización explícita. Si se autoriza, `adb install -r`
sobre la build anterior y verificar el `versionCode` instalado en **Perfil → Versão do aplicativo**.

## 7. Contratos backend ↔ Android

```bash
npm run contracts:generate --workspace=packages/backend

docker run --rm --user "$(id -u):$(id -g)" \
  --env HOME=/gradle-home \
  --volume "$HOME/.cache/trindade-gradle:/gradle-home" \
  --volume "$PWD:/work" --workdir /work \
  ghcr.io/cirruslabs/android-sdk:35 \
  bash scripts/generate-android-contract.sh
```

- No editar `packages/contracts/openapi.json` ni `packages/android/contract/` a mano.
- Un campo nuevo que Android deba tolerar en respuestas antiguas debe ser opcional/nullable y tener fixture de
  decodificación.
- CI falla si el contrato generado no coincide con el commit.

## 8. Integración con el ERP Aero32

### 8.1 Por qué hay dos caminos

La web está en HTTPS y el WebService de la fábrica en HTTP plano dentro de la LAN. El navegador bloquea ese salto
por *mixed content* y *Private Network Access*. Por eso la web usa el atajo iOS `Aero32 Bridge`, que corre nativo y
devuelve la respuesta por callback. Android corre en la LAN y llama directo con OkHttp.

La excepción de cleartext del release Android es **solo** `192.168.25.250`; no habilitar HTTP global.

### 8.2 Configuración

- URL: `http://192.168.25.250:1453/api` (sin barra final duplicada).
- Usuario y contraseña del WebService se configuran por dispositivo; Android los guarda cifrados, la web en
  `localStorage` del iPhone.
- No hay un campo separado de código: el operario viaja como `ENT_USU`/`PED_USU` en mayúsculas.
- El código numérico que devuelve `/usuarios` es informativo.

### 8.3 Endpoints y payloads

Cabeceras:

```http
Authorization: Basic base64(usuario:senha)
Accept: application/json
Content-Type: application/json
```

- `POST /usuarios`: prueba de credenciales; **sin barra final** (una barra produce 301 → GET → 405).
- `POST /entradasitem`: alta de producción. Un producto por petición; `PRO_COD` a 6 dígitos, `PRO_QTD`
  multiplicado por 100, `PRO_CST="000"`, `ENT_SER="APL"`, `ENT_USU` en mayúsculas, `LOTES=[]`.
- `POST /saidasitem`: misma forma con prefijo `PED_*`; interfaz de Trindade pendiente.
- `POST /movimentoitem?_method=PATCH`: lectura del día.

El cuerpo de `/movimentoitem` que usa la web certificada y que Android debe enviar es:

```json
{
  "_method": "PATCH",
  "CODFOR": null,
  "NOMUSU": null,
  "CODPRO": null,
  "DTINI": "2026-11-03",
  "DTFIM": "2026-11-03",
  "ENTSAI": "E"
}
```

`_method` debe viajar **en el cuerpo y en la query**, `ENTSAI` debe ser `"E"` para entradas y los filtros abiertos
deben ser `null` explícitos. Omitir `_method` o mandar `ENTSAI:null` produjo un `HTTP 500`; no volver a esa forma.
El test de contrato Android y el test del puente web fijan este cuerpo.

### 8.4 Persistencia, cola y auditoría

- Guardar el lanzamiento en Trindade antes de llamar al ERP.
- Si el ERP no responde, mantener la cola/outbox y reintentar; no perder la producción.
- Un asiento ya confirmado por el ERP no se edita ni borra; se puede reconocer/deshacer según las reglas.
- Eventos canónicos: `launch_sync`, `read_history`, `test_connection`, `import`, `queue_rejected`.
- Cada intento emite `requested` y `result` con el mismo `attemptId`; incluir `httpStatus`, `durationMs`,
  `launchId` cuando aplique, `appVersion` y `buildNumber`.
- La auditoría no debe bloquear el lanzamiento. El outbox de Android reintenta sin guardar credenciales.
- Atribuir `client` con `X-Trindade-Client`; si falta, dejarlo `null`, nunca inventar Android.

### 8.5 Diagnóstico

Códigos estables: `AERO_NOT_CONFIGURED`, `AERO_NO_PLANT_WIFI`, `AERO_ERP_UNREACHABLE`,
`AERO_CLEARTEXT_BLOCKED`, `AERO_ERP_TIMEOUT`, `AERO_ERP_NO_ROUTE`, `AERO_ERP_CONNECTION_REFUSED`,
`AERO_ERP_REFUSED`, `AERO_SNAPSHOT_REFUSED`, `AERO_BACKEND_DAY_CLOSED`.

El log compartido está en `logs/aero-integration.log`. Para investigar:

```bash
jq -c 'select(.client=="android" and .event=="read_history")' logs/aero-integration.log
jq -c 'select(.attemptId=="<uuid>")' logs/aero-integration.log
jq -c 'select(.client=="android" and (.error // "" | startswith("AERO_")))' logs/aero-integration.log
```

Un `requested` sin `result` significa que el pedido no volvió. Un `HTTP 500` del ERP no es “sin conexión”:
significa que el host respondió y rechazó la operación.

## 9. Pruebas y CI

```bash
make ci                 # gate canónico web/API
make ci-clone           # clon limpio + overlays sucios, prueba de CI
make ci-android         # lane Android en imagen SDK
```

Antes de entregar:

- backend afectado en verde;
- frontend node/unit/e2e afectados en verde;
- Android tests y build release afectados en verde;
- OpenAPI y cliente Kotlin regenerados;
- contrato ERP probado si se tocó;
- diff sin secretos, artefactos temporales ni cambios de formato ajenos;
- documentos/hashes actualizados si se publicó.

## 10. Despliegue

La guía completa es [docs/despliegue.md](../despliegue.md). Para una entrega normal:

```bash
make ci-clone
docker compose build
docker compose up -d
docker compose ps
```

Antes de migraciones o cambios de esquema: backup y verificar el healthcheck. El rollback de datos no es una
limpieza opcional; seguir el procedimiento documentado y no borrar el volumen.

## 11. Errores ya pagados

- **No usar `grep` sobre XML sin quitar comentarios** para validar una política de seguridad: el comentario que
  documenta lo prohibido no es una declaración.
- **No confiar en el tamaño del APK** como única identidad de build: dos builds distintas pueden pesar exactamente
  lo mismo. Usar `versionCode`/`buildNumber`.
- **No dejar un test e2e dependiente de un espejo vacío** si la suite comparte el día de la planta.
- **No renderizar un `input type=date` crudo en iOS**; usar `DateField`.
- **No editar contratos generados** ni saltarse la regeneración.
- **No publicar el `versionCode` interno** en notas/documentación pública.
- **No habilitar cleartext global** en Android.
- **No llamar al ERP desde la web HTTPS** sin el atajo/callback cuando el WebService es HTTP privado.

## 12. Dónde mirar

- [AGENTS.md](../../AGENTS.md): reglas de entrada.
- [docs/arquitectura.md](../arquitectura.md): mapa técnico.
- [docs/despliegue.md](../despliegue.md): producción y rollback.
- [docs/release-android.md](../release-android.md): firma, versiones y publicación.
- [docs/release-android-historial.md](../release-android-historial.md): builds y hashes.
- [docs/integracion-aero-masas-web.md](../integracion-aero-masas-web.md): flujo operativo ERP.
- [docs/registro-integracion-aero-webservice.md](../registro-integracion-aero-webservice.md): contratos exactos.
- [docs/integracion-aero32.md](../integracion-aero32.md): auditoría del WebService.
- [docs/auditoria-android.md](../auditoria-android.md): log y eventos Android.
- [CONTRIBUTING.md](../../CONTRIBUTING.md): convenciones de commits y trabajo.
