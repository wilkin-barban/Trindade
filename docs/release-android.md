# Release Android — Trindade Massas

Este documento explica cómo se firma, versiona, construye y publica la aplicación Android de Trindade. El
histórico de builds, hashes y verificaciones está en [release-android-historial.md](release-android-historial.md).

## 1. Principio fundamental: la firma no se puede reemplazar

Un APK de producción tiene una restricción que ningún otro artefacto del repositorio tiene: **una vez instalado
en un teléfono, solo puede actualizarse con un APK firmado por el mismo certificado**. Android rechaza la
instalación con `INSTALL_FAILED_UPDATE_INCOMPATIBLE` si la clave cambia.

Consecuencias:

- Un APK firmado con la clave equivocada, o sin firmar, no es una release defectuosa: **no es una release**.
- La clave de producción se respalda y se custodia fuera del repositorio.
- La huella del certificado se verifica antes de publicar.
- Un tag publicado no se mueve ni se reutiliza.

## 2. Versionado desde el tag

La versión no se edita a mano en el código. El workflow la deriva del tag de Git, que es la única fuente de
verdad para `versionName` y `versionCode`.

Para un tag `v<major>.<minor>.<patch>`:

```text
versionName = <major>.<minor>.<patch>
versionCode = major * 1000000 + minor * 1000 + patch
```

| Tag | `versionName` | `versionCode` |
| --- | --- | --- |
| `v0.0.1` | `0.0.1` | `1` |
| `v0.5.3` | `0.5.3` | `5003` |
| `v0.6.0` | `0.6.0` | `6000` |
| `v0.7.0` | `0.7.0` | `7000` |
| `v1.2.3` | `1.2.3` | `1002003` |
| `v2.0.0` | `2.0.0` | `2000000` |

### El build interno de producción

El tag fija el `versionName` y el **piso** del `versionCode`. El número que la release lleva es el mayor entre lo
que deriva el tag y el build interno que la instancia de producción ya sirve:

```text
versionCode = max(major * 1000000 + minor * 1000 + patch, LOCAL_APK_BUILD_NUMBER)
```

`LOCAL_APK_BUILD_NUMBER` vive en `packages/backend/src/modules/app/app.service.ts` y es la misma constante que
`/api/app/latest-release` publica como `buildNumber` y la que describe al APK de `/api/app/download-apk`. El
workflow la lee del commit etiquetado, así que el APK de la release y el binario que anuncia la producción no
pueden discrepar: son el mismo literal.

- **El build interno es mayor que el código del tag:** la release lo adopta. Es el caso de una reconstrucción de
  la misma versión pública — `v0.7.1` deriva `7001` y producción ya servía `7012`, así que la release lleva
  `7012`. Publicar `7001` habría sido un downgrade para quien ya instaló la reconstrucción, y Android lo
  rechaza como tal.
- **Es igual o menor:** manda el tag. Toda versión nueva lo supera, porque el código del tag es mayor que el de
  la versión anterior.
- **No es un entero decimal positivo, o el archivo no está:** el job falla cerrado en lugar de adivinar. Un
  fallback silencioso al código del tag es exactamente el downgrade que esta regla evita.
- **Límite conocido:** los builds internos de la línea `0.x` viven por encima del código de su tag, así que una
  seguidilla de reconstrucciones puede adelantarse al código de un `patch` alto del futuro — `7012` es el mismo
  número que derivaría `v0.7.12`. El `max` garantiza monotonía, no unicidad: antes de taggear, el build interno
  tiene que superar el último código publicado.

Reglas:

- `versionCode` es lo que Android compara para decidir si un APK es una actualización. La fórmula ancha evita
  que la línea `0.x` produzca códigos menores que builds ya instaladas. La fórmula anterior,
  `major * 10000 + minor * 100 + patch`, produjo `502` para `v0.5.2` mientras el `511` ya estaba en campo:
  Android habría rechazado esa release como un downgrade.
- `minor` y `patch` tienen tres dígitos cada uno. `v1.1000.0` codificaría `2000000`, el mismo código que
  `v2.0.0`; el workflow lo rechaza en lugar de publicar una colisión. Para superar el límite, subir el major.
- El `versionCode` final nunca es menor que el build interno que producción sirve; ver *El build interno de
  producción*. El `versionName` sí sale sólo del tag.
- La `v` pertenece al tag, no al `versionName`. Un `-PversionName` con `v` inicial falla la validación del
  build.
- Una build release **exige** `-PversionName` y `-PversionCode`. No hay valores por defecto para release, así
  que un APK no puede salir con una versión inventada por el build.
- Una build debug usa el placeholder **`0.6.3` / `6003`**, definido en `packages/android/app/build.gradle.kts`.

Los dos números se calculan una sola vez en `build.gradle.kts` y alimentan tanto el manifiesto como
`BuildConfig`. La app muestra la versión en **Perfil → Versión de la aplicación**.

## 3. Releases y builds

| Versión | Build | Estado | Nota |
| --- | --- | --- | --- |
| 0.5.0 | 501 | Publicada | Primera release con calculadoras |
| 0.5.1 | 506–511 | Publicada | Varias builds bajo el mismo `versionName` |
| 0.5.2 | 512–514 | Publicada | Assets reemplazados; la derivación del tag se corrigió |
| 0.5.3 | 5003 | Publicada | Misma entrega que 514, con un tag propio |
| 0.6.0 | 6000 | Interna | Paridad Android con Aero32 |
| 0.6.1 | 6001 | Interna | Importación por asiento y día pasado en solo lectura |
| 0.6.2 | 6002 | Interna | Códigos de error y atribución por asiento |
| 0.6.3 | 6003 | Interna | Contrato del reporte y alta de operario |
| 0.7.0 | 7000 | Reemplazada | Build histórica; fue el asset inicial de GitHub Release `v0.7.0` |
| 0.7.0 | 7001 | No publicada | Build de respaldo; citada por notas anteriores |
| 0.7.0 | 7002 | Reemplazada | Binario anterior de producción; nunca fue asset de GitHub |
| 0.7.0 | 7003 | Reemplazada | Asset anterior de GitHub Release `v0.7.0` |
| 0.7.0 | 7004 | Reemplazada | Acciones y filtros de históricos, Compartilhar App y resumen del inicio |
| 0.7.0 | 7005 | Reemplazada | Paridad web/Android del ERP: cola drenada con ack reversible, multioperario por asiento, fallos de Aero unificados y errores traducidos |
| 0.7.0 | 7006 | Reemplazada | Histórico de cargamento cerrado en solo lectura, reactivación de lote y reporte, chapas libres sin duplicados, rechazos de tanda en un paso y sync ERP solo del día abierto |
| 0.7.0 | — | Reemplazada | Auditoría ERP Android, payload de movimientos alineado con el puente web, vista de solo lectura para días cerrados del Histórico de Cargamento y orden de Lanzamiento de Masas; asset de GitHub Release `v0.7.0`. El código de build es interno. |
| 0.7.1 | — | **Publicada** | Actualización por `buildNumber` en `/latest-release`, versión pública servida por producción y asset de GitHub Release `v0.7.1`. El código de build es interno. |
| 0.7.3 | 7014 | 2026-11-04 | **Publicada** | Las cajas del día se calculan con el total del producto (redondeo único), la caja abierta se anota en palabras y las dos secciones inferiores se alimentan de las filas unificadas, de modo que un operario que sólo existe en el ERP aparece, se filtra y suma su subtotal. |
| 0.7.2 | 7013 | 2026-11-04 | **Publicada** | Remediación de los hallazgos de auditoría 7006/7007/0.7.1: espejo distinto de backend inalcanzable, sesión que olvida la contraseña del ERP, despacho serializado, cola con traza, borrado de lote sólo Administrador, intento correlacionado y histórico táctil. |
| 0.7.4 | 7016 | 2026-11-04 | **Publicada** | Sustitución de la 0.7.4/7015 sin mover la versión pública: Relatório relee las masas del día al reanudar la pantalla y después de sincronizar, el detalle respeta la fecha del reporte y cada operario muestra su desglose por producto junto al resumen colectivo del día. |
| 0.7.4 | 7015 | 2026-11-04 | Reemplazada | La masa se decide por código: sólo los diez del catálogo son producción y el resto es insumo, así que Relatório separa Masas de Insumos, el WhatsApp del día incluye a los operarios Só ERP desde las filas unificadas y la tableta muestra la caja abierta como un dato compacto (`1 caixa aberta · N un`) en lugar de la explicación larga. |

Las builds 0.6.x se distribuyeron por `GET /api/app/download-apk`, no por un tag de GitHub. Los hashes y las
verificaciones completas están en [release-android-historial.md](release-android-historial.md).

> **Estado final del 2026-11-04.** La versión **0.7.4** (build 7016) es la publicada: `packages/backend/apk/trindade-0.7.4.apk`
> son 11.296.176 bytes, sha256 `7b4ae3df7d632a55cfa2ed6c09444f000763e01a1703c1d638a08ad4b0df0851`, firmada con el mismo
> certificado del proyecto, y la GitHub Release `v0.7.4` publica ese mismo binario con su `.sha256`
> (`https://github.com/wilkinbarban/Trindade/releases/tag/v0.7.4`). El tag `v0.7.4` no se movió: sus assets se
> reemplazaron con `--clobber`, porque la 0.7.4/7015 mostraba en Relatório la foto del espejo ERP que había al
> abrir la pantalla y no la de los operarios que llegaban después. La release anterior (0.7.3, build 7014)
> sigue intacta como asset de `v0.7.3`.
>
> **Estado anterior, 2026-11-04.** La versión **0.7.4** (build 7015) fue la publicada esa mañana:
> `packages/backend/apk/trindade-0.7.4.apk` eran 11.295.724 bytes, sha256
> `cfde493af39b8a8ef749e4162b84f7a4a8a157c13d0ef14b76f04b1318175342`, firmada con el mismo certificado del
> proyecto. Sustituida el mismo día por el build 7016 bajo la misma versión pública; una instalación de 7015 lo
> detecta por la comparación de `buildNumber` que publica `/api/app/latest-release`
> (`SAME_RELEASE_PATCH`), no por el tamaño ni por la versión.
>
> **Estado anterior, 2026-11-04.** La versión **0.7.3** (build 7014) es la publicada: `packages/backend/apk/trindade-0.7.3.apk`
> son 11.295.876 bytes, sha256 `593ffc646efc01c4b0e7cedddfe728e9acb45544ec81a3bf4a6a1ba85576aa21`, firmada con el mismo
> certificado del proyecto. La release anterior (0.7.2, build 7013) sigue intacta como asset de `v0.7.2`.
>
> **Estado anterior, 2026-11-04.** La instancia de producción publicó la versión **0.7.2** en
> `GET /api/app/latest-release`, sirve el APK `packages/backend/apk/trindade-0.7.2.apk` en
> `GET /api/app/download-apk` y la GitHub Release `v0.7.2` publica ese mismo binario: `versionName 0.7.2`,
> 11.278.564 bytes, sha256 `0f7c2eef842510fbcce94bc82866fda4b91b9106bd10d2a70f14e9f2ed1c2cb3`. La respuesta
> incluye el `buildNumber` interno para que una rebuild futura sea detectable aunque conserve la versión y el
> tamaño. El código de build no se publica en las notas. Las releases `v0.7.0` y `v0.7.1` no se movieron:
> conservan su asset histórico. El primer run del workflow sobre el tag falló antes de subir nada —un paso
> leía una variable que sólo declaraba su vecino—; el asset se subió verificado y el defecto quedó corregido
> en `main`, con una prueba que rechaza cualquier paso que lea una variable que nadie declara.

## 4. Workflow de publicación

El workflow es `.github/workflows/android-release.yml`.

### 4.1 Disparadores

- Push de un tag `v*`: construye, firma, verifica y **publica**.
- Push a la rama de reparación `feature/android-v0.3.0-ux-repair`: construye y firma una build de prueba
  (`0.3.0` / `301`), pero **no publica**. Es un disparador heredado; no se usa para releases nuevas.

### 4.2 Contenedor

El build corre en la imagen oficial del SDK, fijada por digest:

```text
ghcr.io/cirruslabs/android-sdk:35@sha256:c724009e305b4607157287624033ab97f319af44c244bfc9f73b6293f3bb01b9
```

El mismo digest se usa en `Makefile`, `.github/workflows/ci.yml`, `.github/workflows/android-release.yml` y en
este documento. Si cambia la imagen, hay que actualizar todas las copias.

### 4.3 Pasos del job `build`

1. Checkout del commit del tag.
2. Lectura de `LOCAL_APK_BUILD_NUMBER` desde `app.service.ts`; si falta la declaración con la forma esperada, el
   job falla cerrado.
3. Derivación de `versionName` y `versionCode`, que es el mayor entre el código del tag y ese build interno;
   rechazo de tags mal formados y de `minor`/`patch` mayores a 999.
4. Decodificación del keystore desde `ANDROID_KEYSTORE_BASE64` a un directorio temporal del runner, nunca al
   workspace; se borra al final del job.
5. `:app:assembleRelease` con `-PapiBaseUrl`, `-PversionName`, `-PversionCode` y `-PrequireSigned=true`.
6. Verificación de que el artefacto es `app-release.apk` y no `app-release-unsigned.apk`.
7. `apksigner verify` y comparación de la huella SHA-256 del certificado con la fijada en el workflow.
8. `aapt2 dump badging` para confirmar que el APK declara el `versionName` y el `versionCode` que la release
   decidió.
9. Publicación del artifact para el job `publish`.

### 4.4 Job `publish`

- Calcula el `.sha256` sobre los bytes exactos que va a subir.
- Publica `trindade-<version>.apk` y `trindade-<version>.apk.sha256`.
- Si la release ya existe, actualiza los assets con `--clobber`; nunca crea una release duplicada.
- Si el tag no existe todavía como release, la crea con notas generadas.

### 4.5 Secretos y variables

Configurar una vez en GitHub, en *Settings → Secrets and variables → Actions*:

| Secreto | Contenido |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Keystore de release codificado en base64, en una sola línea |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del keystore |
| `ANDROID_KEY_ALIAS` | Alias de la clave: `trindade` |
| `ANDROID_KEY_PASSWORD` | **Opcional**. Solo si la clave usa una contraseña distinta de la del store; en PKCS12 normalmente no se define |

Variable de repositorio:

| Variable | Contenido |
| --- | --- |
| `ANDROID_API_BASE_URL` | URL base del APK, por ejemplo `https://trindademasas.duckdns.org/`. Debe ser `https://`, con host y barra final |

Si la variable no está definida, el workflow usa `https://trindademasas.duckdns.org/`. Una URL inválida hace
fallar el build en lugar de publicar un APK apuntando al loopback de desarrollo.

La huella del certificado no es un secreto: es el dato público que permite verificar que el APK fue firmado por
la clave del proyecto.

## 5. Build y firma local

El keystore y su contraseña se pasan desde fuera del repositorio, por propiedades `-P`, variables de entorno o
un `keystore.properties` ignorado por Git.

| Propiedad `-P` | Variable de entorno | Clave en `keystore.properties` |
| --- | --- | --- |
| `trindadeKeystorePath` | `TRINDADE_KEYSTORE_PATH` | `trindadeKeystorePath` |
| `trindadeKeystorePassword` | `TRINDADE_KEYSTORE_PASSWORD` | `trindadeKeystorePassword` |
| `trindadeKeyAlias` | `TRINDADE_KEY_ALIAS` | `trindadeKeyAlias` |
| `trindadeKeyPassword` | `TRINDADE_KEY_PASSWORD` | `trindadeKeyPassword` |

Precedencia: `-P` gana sobre la variable de entorno, que gana sobre el archivo.

Ejemplo de build firmado en el contenedor oficial:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  --env GRADLE_USER_HOME=/gradle-home --env HOME=/gradle-home \
  --env TRINDADE_KEYSTORE_PATH=/keys/trindade-release.jks \
  --env TRINDADE_KEYSTORE_PASSWORD=<contraseña-del-store> \
  --env TRINDADE_KEY_ALIAS=trindade \
  --volume "$HOME/.cache/trindade-gradle:/gradle-home" \
  --volume "$HOME/.cache/trindade-android-sdk:/opt/android-sdk-linux" \
  --volume "$HOME/.android-keystores:/keys" \
  --volume "$(git rev-parse --show-toplevel):/work" \
  --workdir /work/packages/android \
  ghcr.io/cirruslabs/android-sdk:35@sha256:c724009e305b4607157287624033ab97f319af44c244bfc9f73b6293f3bb01b9 \
  bash -c './gradlew :app:assembleRelease --no-daemon -PapiBaseUrl=https://trindade.example/ -PversionName=1.0.0 -PversionCode=1000000 -PrequireSigned=true'
```

El host de `-PapiBaseUrl` es un placeholder a propósito: lo que este build verifica es la firma, no el endpoint.

### `-PrequireSigned=true`

- Sin keystore, `assembleRelease` produce `app-release-unsigned.apk`. Eso es lo que usa la lane de CI para
  comprobar que el camino de release compila sin clave.
- Con `-PrequireSigned=true`, un keystore irresoluble es fatal. El workflow lo pasa; la lane de CI no.
- Un keystore parcialmente configurado también es fatal aunque no se pase `-PrequireSigned=true`: si falta una
  de las tres propiedades o el archivo no se puede leer, el build falla y nombra lo que falta.

### Verificación manual

```bash
# Firma y certificado
$ANDROID_HOME/build-tools/<versión>/apksigner verify --verbose --print-certs \
  app/build/outputs/apk/release/app-release.apk

# Versión declarada por el APK
$ANDROID_HOME/build-tools/<versión>/aapt2 dump badging \
  app/build/outputs/apk/release/app-release.apk | head -1
```

## 6. La clave y la huella oficial

| Dato | Valor |
| --- | --- |
| Archivo | `~/.android-keystores/trindade-release.jks` (fuera del repositorio) |
| Tipo / alias | PKCS12 / `trindade` |
| Clave | RSA 4096, autofirmada, válida hasta 2054 |
| DN del certificado | `CN=Trindade Massas Operacoes, OU=Mobile, O=Trindade, L=Sao Paulo, ST=SP, C=BR` |
| **Huella SHA-256** | `EE:0E:40:4B:21:10:52:B3:11:AE:0E:07:30:60:6E:9C:7D:55:54:31:54:63:D0:2F:9E:F3:3C:95:73:C4:31:F6` |
| SHA-1 (informativa) | `D4:8B:1B:D4:D9:8D:76:24:ED:1D:74:BA:BA:C6:9B:11:9A:1A:33:DF` |

`keytool` imprime la huella con dos puntos; `apksigner` la imprime como hex minúsculo sin separadores. Comparar
siempre SHA-256.

```bash
keytool -list -v -keystore ~/.android-keystores/trindade-release.jks -alias trindade | grep SHA256

apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk | grep 'certificate SHA-256'
```

Si la huella del APK no coincide, **no publicar y no instalar**. La clave equivocada es el único error que no se
puede reparar después.

### Respaldo del keystore

Perder el keystore significa que ninguna copia instalada de la app podrá actualizarse nunca más. Hay que:

- Respaldar el `.jks` **y su contraseña**, por separado, en al menos dos lugares fuera del repositorio y fuera de
  la máquina que construye releases.
- No copiar el keystore al checkout ni escribir la contraseña en un archivo versionado.
- Recordar que no hay rotación posible que conserve la actualizabilidad de las apps instaladas.

## 7. Distribución

Hay dos vías:

1. **GitHub Releases:** <https://github.com/wilkinbarban/Trindade/releases/latest>. El asset se llama
   `trindade-<versión>.apk` y va acompañado de su `.sha256`.
2. **Instancia de producción:** `GET /api/app/download-apk`, que sirve el APK incluido en
   `packages/backend/apk/`. La app consulta `GET /api/app/latest-release` para verificar la versión.

En el teléfono, abrir el enlace, descargar el APK y permitir la instalación desde esa fuente la primera vez. La
versión instalada se lee en **Perfil → Versión de la aplicación**.

## 8. Lane de CI

`scripts/ci-android.sh` (`make ci-android` y el job `android` de `ci.yml`) compila un release **sin firma y sin
keystore**:

- Pasa `-PversionName=0.0.1 -PversionCode=1`, placeholders consistentes.
- Pasa `-PapiBaseUrl=https://ci.invalid/`, una URL válida pero deliberadamente irresoluble.
- No pasa `-PrequireSigned=true`, para ejercitar el camino sin firma.
- Verifica que un release sin `-PapiBaseUrl` falla con el mensaje de la guarda.
- Verifica el `network_security_config.xml` y el contrato Android.

La única lane con keystore es el workflow de release, y la única forma de que la versión deje de ser un
placeholder es un tag.

## 9. Checklist de release

- [ ] El commit a etiquetar está verde en `ci.yml`.
- [ ] El tag sigue el formato `v<major>.<minor>.<patch>`.
- [ ] `minor` y `patch` están entre 0 y 999.
- [ ] El tag no existe ni se mueve.
- [ ] Los secretos de firma están configurados.
- [ ] `ANDROID_API_BASE_URL` termina en `/` y usa `https://`.
- [ ] El workflow construye, verifica la huella y publica APK + `.sha256`.
- [ ] La descarga publicada se verifica con `sha256sum -c` y `apksigner`.
- [ ] Las notas de la release declaran el mismo `versionName` y hash que el asset publicado. El `versionCode`
      es interno: no se publica como valor.
- [ ] El APK se instala sobre la versión anterior con `adb install -r`.
- [ ] El histórico de builds se actualiza con la versión, el build y el hash.

## 10. Problemas frecuentes

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | APK firmado con otra clave | Detener la publicación; recuperar el keystore correcto |
| El workflow falla al decodificar el keystore | `ANDROID_KEYSTORE_BASE64` vacío o con formato inválido | Regenerar el base64 en una sola línea |
| `A release build requires -PversionName` | Faltan las propiedades de versión | Pasar `-PversionName` y `-PversionCode` |
| `A release build requires -PapiBaseUrl=` | Falta la URL base o no es `https` | Configurar `ANDROID_API_BASE_URL` con barra final |
| `versionCode` menor que el instalado | Tag o fórmula incorrectos, o el build interno quedó por debajo de lo publicado | Revisar la fórmula y `LOCAL_APK_BUILD_NUMBER`; subir el build interno o usar un tag superior; no mover el tag |
| El APK no aparece en la release | Job `publish` falló o no se ejecutó | Revisar logs del job y reejecutarlo |
| El `.sha256` no coincide | Asset reemplazado por una build distinta | Regenerar el sidecar desde el job de publicación |
