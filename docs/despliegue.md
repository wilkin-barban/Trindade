# Despliegue y rollback en producción — Trindade Massas

Este runbook define el procedimiento para desplegar una versión web de Trindade Massas con consistencia
verificable en SQLite, sin pérdida accidental de datos y con rollback inmediato. Se aplica a la instancia de
producción en <https://trindademasas.duckdns.org>.

## 1. Invariantes de la arquitectura

- **Topología:** producción corre detrás de un proxy inverso compartido. El contenedor web se une a la red
  externa de Docker `portafolio_default`, y el Nginx de ese proyecto lo alcanza **por nombre de contenedor**
  (`proxy_pass http://trindade-web-1:80`). La red es externa a este compose.
- **Servicios:** definidos en `docker-compose.yml`.
  - `trindade-api-1`: API Fastify sobre Node 24.
  - `trindade-web-1`: SPA servida por Nginx.
- **Volumen de datos:** volumen nombrado `trindade_sqlite_data`, declarado `external: true`, montado en
  `/app/packages/backend/data`.
  - Base: `/app/packages/backend/data/trindade.db` (SQLite en modo WAL).
  - Fotos de reportes: `/app/packages/backend/data/photos`.
  - Al ser externo, `docker compose down -v` no puede borrar la base de producción y Compose falla si el
    volumen no existe, en lugar de crear uno vacío en silencio.
- **Compuerta de inmutabilidad:** el arranque del servidor **nunca** ejecuta migraciones, seeds ni alteraciones
  de esquema. Solo clasifica la base y reporta su estado. El arranque sí ejecuta dos limpiezas de retención de
  30 días: fotos de reportes vencidas y sesiones muertas.
- **Compuerta de recuperación:** antes de cualquier cambio en producción se captura una instantánea consistente
  y se comprueba su restauración en un entorno aislado. Una copia directa del archivo `.db` no alcanza: en modo
  WAL puede haber páginas sin checkpoint en el sidecar `-wal`.
- **Cofre del ERP:** la contraseña del WebService ya no se guarda en el navegador. Vive cifrada en SQLite con
  AES-256-GCM y la clave `AERO_VAULT_KEY` en el entorno de la API; nunca en la base, el repositorio, los logs ni
  una respuesta HTTP. Perder esa clave obliga a cargar la contraseña una vez más (sección 14).

### Orden de despliegue

El orden es siempre el mismo:

1. Detener la API antes de la copia final y de la migración.
2. Capturar la copia final consistente.
3. Aplicar la migración de forma aislada y explícita.
4. Validar el esquema con la imagen nueva.
5. Recién entonces levantar la API nueva.

**Nunca ejecutes un binario viejo contra una base nueva.** Una imagen anterior clasifica la base como `newer`
y se niega a tocarla; esa negativa es la compuerta funcionando.

### Efecto de las migraciones sobre las sesiones

| Paso | Efecto |
| --- | --- |
| **9 → 10** (release actual) | **Ninguno.** Crea `aero_integration_settings` y `aero_bridge_tickets` con sus índices. Aditiva: conserva todas las sesiones, incluidas las de administradores. |
| **8 → 9** | Ninguno. Agrega la columna opcional `massa_launches.ent_lan`. |
| **3 → 4** | Ninguno. Agrega `drivers.phone`. |
| **2 → 3** | **Invalida todas las sesiones y refresh tokens**: se sella `users.security_version` y se revocan las sesiones. Los operarios deben volver a iniciar sesión. |

Una base que todavía está en la revisión 2 pasa por `2 → 3` y por todos los pasos siguientes hasta la 10. En ese
caso sí hay que volver a iniciar sesión. Una base en revisión 9 solo ejecuta `9 → 10` y no lo requiere.

## 2. Primer administrador

`POST /api/auth/setup` está retirado y responde siempre `410`. `GET /api/auth/setup/status` solo informa si
existen usuarios. Ningún cliente web o móvil puede crear el primer administrador: se aprovisiona desde el
contenedor del operador, después de una copia de recuperación aprobada y con `db:status` en `current` para la
revisión que soporta la imagen.

El CLI rechaza un usuario existente, una base ausente o un esquema de sesiones obsoleto, y vuelve a comprobar
esas condiciones dentro de una transacción SQLite inmediata. Se ejecuta solo en la instalación vacía prevista;
**nunca** contra producción existente. La contraseña no debe pasar por argumentos, variables de entorno,
historial de shell ni logs.

Ejemplo de aprovisionamiento seguro en una terminal privada:

```bash
(
  set +x
  cleanup_admin_password() {
    stty echo
    unset ADMIN_PASSWORD
  }
  trap cleanup_admin_password EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  set -o pipefail
  stty -echo || exit 1
  IFS= read -r ADMIN_PASSWORD || exit 1
  stty echo || exit 1
  printf '\n'
  printf '%s\n' "$ADMIN_PASSWORD" | docker compose run --rm --no-deps -T --entrypoint node api \
    packages/backend/dist/db/provision-admin.js /app/packages/backend/data/trindade.db owner 'Administrator'
)
```

Confirmar el login por la vía normal antes de continuar. Si el aprovisionamiento falla, inspeccionar el estado
del esquema y el conteo de usuarios sin volcar material de contraseñas.

## 3. Compuerta previa al despliegue

1. **Árbol limpio en la máquina de despliegue:**

   ```bash
   git status --porcelain
   # Debe devolver vacío
   ```

2. **Compuerta de CI en un clon limpio:**

   ```bash
   make ci-clone
   ```

   Criterios de aceptación:
   - Build de todos los workspaces.
   - Typecheck de backend y frontend.
   - Pruebas de backend.
   - CLIs de esquema verificados (`scripts/verify-schema-clis.sh`).
   - Contrato OpenAPI versionado igual al generado (`scripts/verify-openapi-artifact.sh`).
   - Playwright E2E, salvo que se ejecute con `SKIP_E2E=1`.

   `make ci-clone` clona HEAD, superpone archivos sucios con un aviso explícito y ejecuta `scripts/ci.sh` en
   `node:24-bookworm-slim`. Un run con archivos superpuestos no es una prueba de clon limpio: desplegar solo
   desde un árbol limpio.

3. **Estado de producción (solo lectura):**

   ```bash
   make db-status
   # O dentro del contenedor en ejecución:
   docker exec trindade-api-1 node packages/backend/dist/db/status.js
   curl -sS https://trindademasas.duckdns.org/api/health
   ```

   Confirmar que el servicio está sano y registrar la revisión de la base y la revisión que soporta la imagen
   en ejecución. La imagen vieja puede reportar `current` en su propia revisión; eso no significa que la imagen
   nueva no tenga una migración pendiente. La sección 6 reclasifica la base detenida con la imagen nueva.

## 4. Copia de recuperación

Capturar una copia preliminar antes de tocar imágenes o archivos. Después de detener la API se captura la
**copia final**, que es la frontera de rollback del cutover.

```bash
make db-backup BACKUP_DIR=./backups/recovery-$(date -u +%Y%m%dT%H%M%SZ)
```

`db-backup.sh` requiere que el destino no exista y que el host tenga `node_modules` y
`packages/backend/dist/recovery.js`; si no, ejecutar `npm ci && npm run build` antes. El script:

1. Monta el volumen en modo estrictamente read-only y usa `db.backup()` de `better-sqlite3` para obtener un
   `snapshot.db` consistente, incluidas las páginas WAL.
2. Copia las fotos de `/photos` a `/assets` dentro del conjunto de recuperación.
3. Escribe `manifest.json` con identificador, timestamps, tamaños, SHA-256 de la base, del snapshot y de cada
   asset.
4. Restaura el snapshot en un directorio temporal, ejecuta `PRAGMA integrity_check`, enumera tablas y filas y
   verifica los digests de los assets.
5. Comprueba en el host que el snapshot coincide con el SHA-256 del manifiesto.
6. Imprime `Status: APPROVED FOR ROLLBACK BASELINE` con el `setId`.

Criterios de aceptación:

- El script termina con código 0.
- Existen `manifest.json` y `snapshot.db`.
- La prueba aislada devuelve `integrity: "ok"`.

## 5. Construir las imágenes nuevas

Construir mientras la API vieja sigue sirviendo:

```bash
docker compose build
```

No se redespliega nada todavía. Antes de continuar, confirmar que la imagen nueva soporta la revisión **10**.
El comando de clasificación de la sección 6 imprime `schema revision: <n> (this build supports <m>)`. Si `<m>`
no es 10, la imagen está desactualizada y se negará a migrar.

Si la imagen en ejecución o la nueva reportan `incompatible` o `newer`, **detenerse**. Ninguno de esos estados
se arregla desplegando, y el comando de migración los rechaza.

## 6. Cutover controlado a la revisión 10

Agendar una ventana de mantenimiento. Detener la API **antes** de la copia final y de la migración. No permitir
otros escritores de la base durante la ventana.

> **Importante:** no ejecutar migraciones sin el conjunto de recuperación aprobado de la sección 4. Las
> migraciones mutan datos de producción y deben ser un paso explícito del operador.

1. **Detener la API y capturar la copia final:**

   ```bash
   docker compose stop api
   make db-backup BACKUP_DIR=./backups/recovery-$(date -u +%Y%m%dT%H%M%SZ)
   ```

   Registrar el `setId` aprobado y verificar la prueba de restauración aislada. No continuar sin ella.

2. **Clasificar la base en solo lectura, desde la imagen nueva:**

   ```bash
   docker compose run --rm --no-deps --entrypoint node api \
     packages/backend/dist/db/status.js
   ```

   Comparar la **revisión de la base**, no solo el veredicto. Una base en revisión 2 puede ser `current` para la
   imagen vieja y `outdated` para la nueva. `docker compose run` monta el mismo volumen y hereda
   `DATABASE_PATH`, así que inspecciona la base real de producción. No usar `docker exec` aquí: la imagen nueva
   todavía no está corriendo y la vieja lleva el código y las migraciones viejas.

3. **Ejecutar la migración:**

   ```bash
   docker compose run --rm --no-deps --entrypoint node api \
     packages/backend/dist/db/migrate.js
   ```

   El runner abre la base en solo lectura para clasificarla, imprime el estado inicial, rechaza bases
   `incompatible` o `newer` sin abrirlas en escritura y ejecuta los pasos pendientes según la revisión
   reportada. Un run interrumpido se reanuda en el siguiente paso pendiente.

   | Paso | Qué hace |
   | --- | --- |
   | 0 → 1 | Reconstruye `report_temperatures` en la forma `reading_index`. Idempotente. |
   | 1 → 2 | Crea `auth_sessions` y sus índices. |
   | 2 → 3 | Agrega `users.security_version`, revoca refresh sessions y sella la revisión 3. |
   | 3 → 4 | Agrega `drivers.phone` opcional. Aditivo, sin invalidar sesiones. |
   | 4 → 5 | Agrega `stock_counts`. Aditivo. |
   | 5 → 6 | Agrega `massa_launches`. Aditivo. |
   | 6 → 7 | Agrega `aero_movements`. Aditivo. |
   | 7 → 8 | Re-clava `aero_movements` por asiento y producto. |
   | 8 → 9 | Agrega `massa_launches.ent_lan` y su índice único parcial. Aditivo. |
   | 9 → 10 | Crea `aero_integration_settings` y `aero_bridge_tickets` con sus dos índices. Aditivo: no reescribe filas existentes ni invalida sesiones. |

   Una base en revisión 3 ejecuta **todos** los pasos desde `3 → 4` hasta `9 → 10`; no solo `3 → 4`. Una base en
   revisión 9 ejecuta únicamente `9 → 10`. La migración no crea ni descifra la contraseña del ERP: eso lo hace el
   panel después del despliegue, con la clave de la sección 14 presente en el entorno.

4. **Confirmar el esquema:**

   ```bash
   docker compose run --rm --no-deps --entrypoint node api \
     packages/backend/dist/db/status.js
   ```

   Debe salir con código 0 e imprimir `verdict: current` en la revisión 10 con **20 tablas**. **No arrancar la API
   hasta que lo haga.**

5. Si la migración o la validación fallan, mantener la API detenida y usar el rollback de la sección 9,
   escenario B, con la copia final. No arrancar un binario viejo contra una base migrada.

## 7. Despliegue y verificación

1. **Levantar los contenedores:**

   ```bash
   docker compose up -d
   ```

2. **Confirmar estado y salud:**

   ```bash
   docker compose ps
   ```

   `trindade-api-1` y `trindade-web-1` deben estar `Up` y `(healthy)`.

3. **Revisar el aviso de esquema al arrancar:**

   ```bash
   docker logs trindade-api-1 | grep "database schema notice"
   ```

   Para una base migrada debe verse `level=30` (info), `verdict=current`, `revision=10`. Un `level=40` (warn) con
   `verdict=outdated` o `newer` significa que el rollout corre contra el esquema equivocado: detener la API e
   investigar. En producción la API además exige `AERO_VAULT_KEY` válida para arrancar: si falta o no decodifica a
   32 bytes, el contenedor no levanta y no arranca en modo degradado.

4. **Healthcheck:**

   ```bash
   curl -sS https://trindademasas.duckdns.org/api/health
   ```

   HTTP 200 con `{"status":"ok","timestamp":"..."}`.

5. **Sesiones:** la migración 9 → 10 es aditiva y **no** invalida sesiones. Una base que venía de revisión 2 o
   anterior sí pasó por `2 → 3`, que revoca todas las sesiones; en ese caso los usuarios deben iniciar sesión de
   nuevo. Verificar un login real por HTTPS sin poner credenciales ni tokens en el historial de shell, la salida
   de terminal o los logs.

6. **Cofre del ERP:**

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' \
     https://trindademasas.duckdns.org/api/integration/aero/settings
   ```

   Debe responder `401` sin token. Entrar con `wilkin` (Administrador), abrir el panel de integración y comprobar
   que `GET /api/integration/aero/settings` responde `configured: false` la primera vez. La contraseña real del ERP
   la carga el usuario desde el iPhone: el operador del despliegue no la pide, no la carga y no la imprime.

## 8. Checklist posterior al despliegue

- [ ] `curl -I http://trindademasas.duckdns.org` devuelve 301 a HTTPS.
- [ ] `curl -I https://trindademasas.duckdns.org` devuelve 200 sin advertencias TLS.
- [ ] `curl -sS https://trindademasas.duckdns.org/api/health` devuelve 200 con `status: "ok"`.
- [ ] La SPA responde y contiene la marca Trindade.
- [ ] Un login real funciona y devuelve `refreshToken`.
- [ ] `GET /api/integration/aero/settings` sin token devuelve `401`.
- [ ] `make db-status` (o el comando equivalente en el contenedor) sale 0 con `current` en la revisión 10.
- [ ] `docker logs --tail 30 trindade-api-1` no muestra errores ni rechazos no manejados.
- [ ] La descarga del APK responde (`GET /api/app/download-apk`) y la versión publicada es la esperada.

## 9. Rollback

### Escenario A: rollback solo de código

Se usa si el contenedor nuevo no arranca, se cae o muestra una regresión de frontend, **antes** de ejecutar la
migración de esta release.

1. Volver al commit o tag anterior:

   ```bash
   git checkout <commit-o-tag-anterior>
   ```

2. Reconstruir y redesplegar:

   ```bash
   docker compose build
   docker compose up -d
   ```

3. Verificar salud:

   ```bash
   curl -sS https://trindademasas.duckdns.org/api/health
   ```

Si la migración ya se ejecutó, no usar este escenario. Una base en revisión **10** es `newer` para la imagen
anterior, que se niega a abrirla en escritura, y ningún *downgrade* de esquema está soportado: el único camino de
vuelta es el escenario B, restaurando el backup aprobado previo al cutover y levantando la imagen anterior.

### Escenario B: rollback completo de datos

Se usa si la migración falló, los datos se corrompieron o hay que volver atrás después de escrituras en la base.

1. **Detener la API** para liberar locks y evitar escrituras concurrentes:

   ```bash
   docker compose stop api
   ```

2. **Restaurar la copia final previa al cutover**, con aprobación por la pérdida de escrituras posteriores al
   snapshot:

   ```bash
   make db-restore BACKUP_DIR="./backups/recovery-<timestamp>" CONFIRM=--confirm
   # O directamente:
   ./scripts/db-restore.sh "./backups/recovery-<timestamp>" --confirm
   ```

   El script verifica el manifiesto y los SHA-256 antes de tocar el volumen, sobrescribe `trindade.db`, elimina
   los sidecars `-wal` y `-shm` obsoletos, sincroniza las fotos, comprueba la integridad y el estado del esquema.
   Solo reinicia `trindade-api-1` si estaba corriendo al invocarlo; la API debe estar detenida y debe seguir
   detenida después del restore.

3. **Revocar sesiones restauradas y rotar `JWT_SECRET`** antes de levantar la API. Revocar solo los refresh
   tokens no invalida los access JWT ya emitidos; rotar el secreto de firma sí. Es una compuerta obligatoria del
   rollback, no una limpieza opcional.

   ```bash
   docker compose run --rm --no-deps --entrypoint node api -e \
     'const Database = require("better-sqlite3"); const db = new Database(process.env.DATABASE_PATH); db.prepare("UPDATE auth_sessions SET revoked_at = datetime(\x27now\x27) WHERE revoked_at IS NULL").run(); db.close()'
   ```

   Verificar que la actualización se aplicó y que el nuevo `JWT_SECRET` está configurado antes de devolver
   tráfico.

4. **Volver el código** al commit anterior y reconstruir, si el rollback requiere la versión previa:

   ```bash
   git checkout <commit-o-tag-anterior>
   docker compose build
   docker compose up -d
   ```

5. Confirmar salud y esquema:

   ```bash
   docker exec trindade-api-1 node packages/backend/dist/db/status.js
   curl -sS https://trindademasas.duckdns.org/api/health
   ```

## 10. Recuperación manual de emergencia

Si fallan los scripts o Docker Compose:

1. Inspeccionar el volumen:

   ```bash
   docker volume inspect trindade_sqlite_data
   ```

2. Copia manual de emergencia:

   ```bash
   docker run --rm -v trindade_sqlite_data:/data:ro -v "$PWD":/backup alpine \
     tar czf /backup/emergency-backup-$(date +%s).tar.gz -C /data .
   ```

3. Restauración manual:

   ```bash
   docker compose stop api
   docker run --rm \
     -v trindade_sqlite_data:/data \
     -v "$PWD/backups/recovery-<timestamp>":/backup:ro \
     alpine sh -c '
       cp /backup/snapshot.db /data/trindade.db && \
       rm -f /data/trindade.db-wal /data/trindade.db-shm && \
       rm -rf /data/photos && \
       cp -r /backup/assets /data/photos
     '
   # No arrancar la API: primero completar el paso 3 del escenario B
   # (revocar sesiones y rotar JWT_SECRET), restaurar el código correspondiente y validar.
   ```

## 11. Instalación standalone en un VPS nuevo

Esta sección describe una instalación alternativa, **no** la producción actual. Producción usa la red externa
`portafolio_default` y el proxy compartido.

En un host nuevo, crear primero la red y el volumen externos:

```bash
docker network create portafolio_default
docker volume create trindade_sqlite_data
```

Luego:

```bash
git clone https://github.com/wilkin-barban/Trindade.git
cd Trindade
cp .env.example .env
# Editar .env:
#   JWT_SECRET=<secreto-fuerte-de-32-caracteres-o-más>
#   AERO_VAULT_KEY=$(openssl rand -base64 32)
#   PUBLIC_APP_URL=https://trindademasas.duckdns.org
#   WEB_BIND=127.0.0.1
#   WEB_PORT=8080
#   REFRESH_TOKEN_TTL_DAYS=30
```

`AERO_VAULT_KEY` no es opcional en producción: sin ella la API no arranca. El procedimiento completo está en la
sección 14.

Variables opcionales que lee `docker-compose.yml`: `API_PORT`, `DATABASE_PATH`, `PHOTOS_DIR`, `LOG_LEVEL` y
`AERO_LOG_DIR`.

Para TLS con Nginx del host, usar `docker/nginx-standalone-host.conf.example` en dos pasos: primero HTTP para el
desafío ACME, luego HTTPS. Certbot:

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot -d trindademasas.duckdns.org
```

Renovación diaria:

```bash
(sudo crontab -l 2>/dev/null; echo "17 3 * * * /home/wilkin/proyectos/Trindade/scripts/renew-certbot.sh >> /var/log/trindade-certbot.log 2>&1") | sudo crontab -
```

## 12. Problemas frecuentes

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `verdict: outdated` al arrancar | La migración no se ejecutó o la imagen es vieja | Detener la API, clasificar y migrar con la imagen nueva |
| `verdict: newer` | Binario viejo contra base nueva | No arrancar; restaurar la copia final y el código correspondiente |
| `db-backup.sh` falla porque el destino existe | El directorio ya estaba creado | Usar un `BACKUP_DIR` nuevo con timestamp |
| `db-restore` no restaura y pide `--confirm` | Se pasó `CONFIRM=true` en lugar de `CONFIRM=--confirm` | Repetir con `CONFIRM=--confirm` |
| La API no levanta tras migrar | Migración incompleta o esquema incompatible | Mantener detenida y ejecutar el escenario B |
| La API no arranca en producción y el log nombra `AERO_VAULT_KEY` | La clave falta o no decodifica a 32 bytes | Generar una con `openssl rand -base64 32`, cargarla en el `.env` del host y reiniciar `api` (sección 14) |
| `AERO_VAULT_KEY` cambió o se perdió | El ciphertext guardado ya no se descifra | Volver a guardar la contraseña del ERP desde el panel con `wilkin` |
| El healthcheck devuelve error | Contenedor no iniciado o base inaccesible | `docker compose ps` y `docker logs trindade-api-1` |
| El APK no descarga | El archivo no está en `packages/backend/apk/` o la imagen no se reconstruyó | Verificar el artefacto y reconstruir `api` |

## 13. Checklist del operador

- [ ] Árbol limpio y CI verde.
- [ ] Copia preliminar aprobada.
- [ ] API detenida antes de la copia final.
- [ ] Copia final aprobada y con `setId` registrado.
- [ ] `AERO_VAULT_KEY` presente en el entorno de la API, sin haberse impreso ni commiteado.
- [ ] Imagen nueva construida y compatible con la revisión 10.
- [ ] Migración ejecutada y `verdict: current` en revisión 10 con 20 tablas.
- [ ] API y web levantadas y saludables.
- [ ] Login real verificado.
- [ ] `GET /api/integration/aero/settings` sin token responde `401`.
- [ ] Cofre del ERP visible en el panel; la contraseña la carga el usuario, no el operador.
- [ ] Healthcheck, SPA y descarga de APK verificados.
- [ ] Logs sin errores.

## 14. Clave del cofre del ERP (`AERO_VAULT_KEY`)

La contraseña del WebService de la fábrica ya no se guarda en el navegador. El servidor la cifra con
**AES-256-GCM** (IV aleatorio de 12 bytes, auth tag y `key_version = 1`) y la deja en la tabla
`aero_integration_settings`. `AERO_VAULT_KEY` es la clave simétrica de 32 bytes, codificada en **base64**, que
permite descifrarla.

### 14.1 Generación

```bash
openssl rand -base64 32
```

El resultado tiene 44 caracteres; cualquier otra longitud que no decodifique a 32 bytes se rechaza. Generar la
clave directamente sobre el host de producción y **no imprimir el valor** en la salida de terminal compartida, el
historial de shell ni el canal de CI.

### 14.2 Dónde vive

| Dónde | Estado |
| --- | --- |
| `.env` de producción, junto al compose | **Sí.** Está gitignored y no se versiona. |
| `docker-compose.yml` | **Sí**, como variable de entorno del servicio `api`. |
| `.env.example` | Vacía, con la instrucción `openssl rand -base64 32`. |
| Base de datos, repositorio, logs, auditoría, respuestas HTTP | **Nunca.** En SQLite quedan solo ciphertext, IV y tag. |

Si la clave ya existe en el `.env` de producción, **no se rota** en un despliegue normal. Rotarla sin volver a
guardar la contraseña deja el cofre ilegible.

### 14.3 Arranque y verificación

- En producción la API valida la clave al arrancar: si falta o no decodifica a 32 bytes, **falla con un mensaje
  claro y no arranca**. No hay modo degradado.
- En pruebas se inyecta una clave fija de test; la de producción nunca viaja al entorno de pruebas.
- Verificación posterior al despliegue: `GET /api/integration/aero/settings` sin token responde `401` y el mismo
  endpoint con sesión de `wilkin` responde `configured`, `wsUrl`, `username`, `hasPassword` y `updatedAt`, jamás la
  contraseña ni el ciphertext.

### 14.4 Backups, pérdida y deuda declarada

- El ciphertext de los backups **no sirve sin la clave**: restaurar una base sin el `AERO_VAULT_KEY` que la cifró
  deja la contraseña ilegible. Guardar la clave en el gestor de secretos del operador, separada del backup de la
  base, es parte de la copia de recuperación.
- Si la clave se pierde, la contraseña del ERP se vuelve a cargar una vez desde el panel con `wilkin`
  (Administrador). No se pierde ningún otro dato: la contraseña no se reutiliza en Trindade.
- **Deuda declarada:** no hay rotación multi-clave. `key_version = 1` está preparado para una rotación futura por
  generaciones, que esta entrega no implementa.
