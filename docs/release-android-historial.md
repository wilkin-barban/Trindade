# Histórico de builds Android — Trindade Massas

Este documento conserva el rastro verificable de cada APK: versión, `versionCode`, fecha, estado de publicación y
hash. Es la referencia para responder "¿qué build tiene este teléfono?" y para comprobar una descarga.

La guía de firma y publicación está en [release-android.md](release-android.md).

## 1. Builds

| Versión | Build | Fecha | Estado | Cambios principales | SHA-256 del APK |
| --- | ---: | --- | --- | --- | --- |
| 0.4.0 | 400 | 2026-10-14 | No publicada | Teléfono del conductor, compartir nativo, envío directo y tarjeta de cronograma activo | `11d219393ae457e6776c0c675b9fed634f6850043e8c283658c214a18ecfc273` |
| 0.5.0 | 501 | 2026-10-20 | Publicada | Calculadoras de Assaí, stock e historial | `32ab931c338dd94700cfd79f91e7abb7d349c09b84d8ea0c811f77a18388adf1` |
| 0.5.1 | 506 | 2026-10-21 | Publicada | Base de 0.5.1: i18n automática y modo lectura en masas | `0d0912a9162c654154956916d50bccfc8ad3c9625ee51f34c896d2774c3a670b` |
| 0.5.1 | 507 | 2026-10-22 | Publicada | Paridad de masas web/Android y vista previa de WhatsApp | `3d03d5819423c05d9cc9bc61b28227363a4ce751bd86085bc8859cb725675cf7` |
| 0.5.1 | 508 | 2026-10-22 | Publicada | Exportación de reporte sin prefijo `MASSA` | `091f5cf7be05b3214fedf75ec29b8c56cda0d2da27608d3e894734301522ae19` |
| 0.5.1 | 509 | 2026-10-22 | Publicada | Remediación de auditoría, sesión y fechas | `1545739f45625f711ef6b4fbe05faa7fbdfb204d11f37d9c588b6a49ffb58fd5` |
| 0.5.1 | 510 | 2026-10-23 | Publicada | Mensajes administrativos internacionalizados | `4d8440dbc66ee17adee22916406ca9497b66a2a428031bd440194cf58bb94b55` |
| 0.5.1 | 511 | 2026-10-23 | Publicada | Stock sin código de producto y resumen del día | `04f3848bc2194fda7262bb3ce916122cb74942a96dba3fa6174995bd2554f593` |
| 0.5.2 | 512 | 2026-10-24 | Publicada | Navegación, iconos y panel de administración | `f302cf5dc33e0e82fad0341df2689c4bc5c7cda70b00c6ca8009294d9e26811a` |
| 0.5.2 | 513 | 2026-10-24 | Publicada | Material 3 en toda la interfaz | `f33393a0b31be905fd32b6427c3147cb4007aa0b7ccfc230fa9ef816dc4fc3ba` |
| 0.5.2 | 514 | 2026-10-24 | Publicada | Perfil, temperaturas, horarios e historial de stock | `f855dcff7b3fc5641711b578f2e31fec3058a44ac6bf45242c8a2d5f19013f6e` |
| 0.5.3 | 5003 | 2026-10-25 | Publicada | Misma entrega que 514, con tag propio | `b658a952a5863e3a7bba207e98f0781450e2087f9a70dd1b2bc480f7e1d1fb58` |
| 0.6.0 | 6000 | 2026-10-30 | Interna | Paridad Android con Aero32 | `1f5bb2dc7b880ca16033d65972358a22eb8b3f8519e67e2ab7155d8928d5eb10` |
| 0.6.1 | 6001 | 2026-10-30 | Interna | Importación por asiento y día pasado en solo lectura | `b2ccb9f165ab1d42090f236dc88e9b02a5ef6adfd4a597959de06ba215469736` |
| 0.6.2 | 6002 | 2026-10-30 | Interna | Códigos de error y atribución por asiento | `60a1d012087cfb2ca37d0b3b0ff64e53608c2c87757100b8b008c8b4b9b23750` |
| 0.6.3 | 6003 | 2026-10-31 | Interna | Contrato del reporte y alta de operario | `a0b2b4f6a1be0b4750d3c854c246bb9ca243928decd191be4082c1cef919e47e` |
| 0.7.0 | 7000 | 2026-10-31 | Reemplazada | Asset anterior de GitHub Release `v0.7.0` | `e8cee2d3857696e90094115ce7915258f79d7e883dd57bf85e221da373d28ffd` |
| 0.7.0 | 7001 | 2026-10-31 | No publicada | Build de respaldo; citada por las notas de la release | `8f6156f2d5dfe8e5ad343ed01e52de629e4de5b8d9cd4c1304b38313435a8621` |
| 0.7.0 | 7002 | 2026-10-31 | Reemplazada | Binario anterior servido por producción; nunca fue asset de GitHub | `bc038f2eeda605fb07bfdd26550c93cfc5a1a8b9c9b06408df0fe505c6ec2f4c` |
| 0.7.0 | 7003 | 2026-11-01 | Reemplazada | Homogeneización visual de Android; asset de GitHub y binario de producción hasta el build 7004 | `82fce07f17e98206a0ad6916463c80053154a87b5991b3679d47e001747e5810` |
| 0.7.0 | 7004 | 2026-11-01 | Reemplazada | Acciones y filtros de históricos, Compartilhar App con el APK y resumen único del inicio | `7622756da304157904a1e47eccacff04e65d97d46615ecc804d62d24f0d1674f` |
| 0.7.0 | 7005 | 2026-11-02 | Reemplazada | Paridad web/Android del ERP: cola drenada con ack reversible, multioperario por asiento y fallos de Aero unificados | `87f9a6a36166d0206031a23aa223bc1ea857e749304045ef79ea06877549ba75` |
| 0.7.0 | 7006 | 2026-11-02 | Reemplazada | Histórico de cargamento cerrado en solo lectura, reactivación de lote y reporte, selector de chapas libres, rechazos de tanda en un paso y sync ERP limitado al día abierto | `f77643b7a5442cf2a74d721f621a3977612ae074d2624c4fe735bb38441f3702` |
| 0.7.0 | — | 2026-11-03 | Reemplazada | Payload de movimientos alineado con el puente web, vista de solo lectura de días cerrados en el Histórico de Cargamento y orden de Lanzamiento de Masas de la web; asset de GitHub | `5dd77e331edb1aace6e2b656e899697819a506068dc375528c8dc6f5a5ade922` |
| 0.7.1 | — | 2026-11-03 | Reemplazada | Versión pública servida por `latest-release`; el endpoint expone el `buildNumber` interno y el detector lo usa cuando la versión no cambia | `41f87a148e28cc1f40bb2ac25a2e70f31587c598e806f2c65efa37411a46c545` |
| 0.7.1 | 7012 | 2026-11-03 | **Publicada** | Conciliación automática de Masas después de cada envío en Android y web, y contraseña del ERP en la sesión de la pestaña; asset de GitHub Release `v0.7.1` y binario de producción | `f325edb6d3c03eba2f058b7aa099961fa99ba12243c6ffbec2d8e44e7683de1f` |
| 0.7.4 | 7017 | 2026-11-04 | **Publicada** | Segunda sustitución de la 0.7.4 bajo la misma versión pública: el detalle de Relatório refrescaba su día al reanudar y escribía encima una lectura fallida, así que una red que parpadeaba podía dejar la pantalla en «nada se lanzó hoy». La lectura vacía ahora conserva lo que ya se leía. Asset de GitHub Release `v0.7.4` reemplazado con `--clobber` y binario de producción | `4e6da04819bb3bc1f7bdfe0de02ce590f2f5493d23d81a3401c5f9e339b21c79` |
| 0.7.4 | 7016 | 2026-11-04 | Reemplazada | Sustitución de la 0.7.4/7015 bajo la misma versión pública: el Android de Relatório relee las masas del día al reanudar la pantalla y tras sincronizar (espejo que sigue moviéndose), respeta la fecha del reporte en el detalle y dibuja el desglose por producto de cada operario y el resumen colectivo del día; sustituida el mismo día por 7017 al encontrarse que la lectura fallida borraba el día | `7b4ae3df7d632a55cfa2ed6c09444f000763e01a1703c1d638a08ad4b0df0851` |
| 0.7.4 | 7015 | 2026-11-04 | Reemplazada | Masa por código (diez del catálogo) frente a insumo, Relatório con bloques Masas/Insumos, WhatsApp del día desde las filas unificadas con operarios `(só ERP)` y caja abierta como dato compacto; sustituida el mismo día por 7016 | `cfde493af39b8a8ef749e4162b84f7a4a8a157c13d0ef14b76f04b1318175342` |
| 0.7.3 | 7014 | 2026-11-04 | **Publicada** | Redondeo único de cajas por producto, nota de caja abierta y secciones inferiores unificadas con los operarios que sólo existen en el ERP | `593ffc646efc01c4b0e7cedddfe728e9acb45544ec81a3bf4a6a1ba85576aa21` |
| 0.7.2 | 7013 | 2026-11-04 | **Publicada** | Remediación de los hallazgos de auditoría 7006/7007/0.7.1: espejo que distingue backend inalcanzable de rechazo, sesión que olvida la contraseña del ERP y la lectura pendiente, despacho serializado, cola con traza, borrado de lote sólo Administrador, intento correlacionado, histórico de Relatórios táctil y release atada al binario de producción | `0f7c2eef842510fbcce94bc82866fda4b91b9106bd10d2a70f14e9f2ed1c2cb3` |

Notas:

- **Interna** significa distribuida por `GET /api/app/download-apk`, sin tag ni release de GitHub.

- **Publicación del 2026-11-03 (0.7.1, build 7012):** la instancia de producción sirve
  `packages/backend/apk/trindade-0.7.1.apk` por `GET /api/app/download-apk` y
  `GET /api/app/latest-release` publica `v0.7.1` con el `buildNumber` interno. Digest
  `f325edb6d3c03eba2f058b7aa099961fa99ba12243c6ffbec2d8e44e7683de1f` (11.277.888 bytes), firmado con la
  huella oficial. El código de build es interno y no se publica. No se instaló en el emulador.

- **Publicación del 2026-11-04 (tag `v0.7.1`):** el tag anotado se creó sobre el commit de `main` con CI verde y
  el workflow `Android release` firmó, verificó la huella oficial y publicó la GitHub Release `v0.7.1`. El
  workflow adoptó como código de build el interno que producción servía en lugar del derivado del tag, que
  habría sido un downgrade. El asset que quedó es el binario de producción: mismo digest
  `f325edb6…`, publicado con su `.sha256`; el APK que compiló el propio workflow tenía la misma versión y la
  misma firma pero un digest distinto, así que se reemplazó para que release y producción coincidieran. Una
  sola release, sin assets heredados de `v0.7.0`, que no se movió.

- **Publicación del 2026-11-04 (0.7.2, build 7013):** la instancia de producción sirve
  `packages/backend/apk/trindade-0.7.2.apk` por `GET /api/app/download-apk` y `GET /api/app/latest-release`
  publica `v0.7.2` con el `buildNumber` interno. Digest
  `0f7c2eef842510fbcce94bc82866fda4b91b9106bd10d2a70f14e9f2ed1c2cb3` (11.278.564 bytes), firmado con la
  huella oficial `ee0e404b211052b311ae0e0730606e9c7d5554315463d02f9ef33c9573c431f6`. El workflow
  `Android release` publica ese mismo archivo como asset de la release `v0.7.2` y valida el sidecar, el
  `versionCode` y el certificado antes de subirlo. No se instaló en el emulador.

- **Publicación del 2026-11-04 (tag `v0.7.2`):** el tag anotado se creó sobre `8340215c` con CI verde. El
  primer run del workflow falló en el paso que prefiere el binario de producción, porque la huella esperada
  se declaraba en un sólo step y `set -u` abortó antes de subir el asset; el asset se subió después con
  `gh release upload`, verificado contra el binario que sirve producción: sha256
  `0f7c2eef842510fbcce94bc82866fda4b91b9106bd10d2a70f14e9f2ed1c2cb3`, publicado con su `.sha256`. El
  defecto quedó corregido en `main` (`4b398146`) y la suite de contrato del workflow rechaza ahora cualquier
  paso que lea una variable que nada declara. El tag no se movió; `v0.7.0` y `v0.7.1` conservan su asset.

- **Reemplazo del 2026-11-02 (build 7006):** la build **7006** reemplazó al asset de GitHub y al binario que
  servía producción. El asset, su `.sha256`, `packages/backend/apk/trindade-0.7.0.apk`, la copia de escritorio
  y `https://trindademasas.duckdns.org/api/app/download-apk` apuntaron al mismo digest
  `f77643b7a5442cf2a74d721f621a3977612ae074d2624c4fe735bb38441f3702` (11.260.812 bytes). Verificada en
  `emulator-5554` (Android 14) instalada sobre la 7005.

- **Reemplazo del 2026-11-01 (build 7004):** la build **7004** reemplazó al asset de GitHub y al binario que
  servía producción. El asset, su `.sha256`, `packages/backend/apk/trindade-0.7.0.apk` y
  `https://trindademasas.duckdns.org/api/app/download-apk` apuntan al mismo digest
  `7622756da304157904a1e47eccacff04e65d97d46615ecc804d62d24f0d1674f` (11.194.408 bytes).

- **Reemplazo del 2026-11-01 (build 7003):** la build **7003** reemplazó al asset anterior de GitHub y al
  binario que servía producción, con digest
  `82fce07f17e98206a0ad6916463c80053154a87b5991b3679d47e001747e5810` (11.187.920 bytes). La discrepancia previa
  (asset 7000 frente a notas que citaban 7001, producción en 7002) queda cerrada por este reemplazo.

- El tag `v0.7.0` no se movió. Un tag publicado no se mueve ni se reutiliza: si hace falta distribuir otra build,
  se reemplazan los assets de la misma release y se sube el `versionCode`, o se corta un tag nuevo.

- Si se reemplaza el asset de GitHub, actualizar esta tabla, el `.sha256` y las notas de la release en el mismo
  movimiento. La verificación de la descarga debe comparar el `versionCode` empaquetado, no solo el nombre del
  archivo.

## 2. Verificar una descarga

```bash
# 1. Descargar el APK de producción
curl -L https://trindademasas.duckdns.org/api/app/download-apk -o trindade-0.7.1.apk

# 2. Comprobar el hash contra el digest documentado
sha256sum trindade-0.7.1.apk

# 3. Comprobar la firma y el certificado
apksigner verify --verbose --print-certs trindade-0.7.1.apk

# 4. Comprobar la versión declarada
aapt2 dump badging trindade-0.7.1.apk | head -1
```

Resultado esperado para el APK actual de producción:

- `sha256sum -c` imprime `OK` y el digest es
  `f325edb6d3c03eba2f058b7aa099961fa99ba12243c6ffbec2d8e44e7683de1f`.
- `apksigner` reporta `Verifies` con APK Signature Scheme v2 y un solo firmante.
- El certificado SHA-256 es
  `ee0e404b211052b311ae0e0730606e9c7d5554315463d02f9ef33c9573c431f6`.
- `aapt2` reporta `versionName='0.7.1'`; el `versionCode` es interno, no se publica y debe ser mayor al
  instalado.
- El tamaño es de `11.277.888` bytes.

El APK servido por producción (`GET /api/app/download-apk`) es el **mismo build actual**: su `.sha256`,
`packages/backend/apk/trindade-0.7.1.apk`, la descarga de producción y el asset de la GitHub Release `v0.7.1`
comparten el digest `f325edb6d3c03eba2f058b7aa099961fa99ba12243c6ffbec2d8e44e7683de1f`. Verificar siempre con
`aapt2`, no solo con el nombre del archivo.

## 3. Verificar la instalación en un dispositivo

```bash
# Instalar sobre la versión anterior
adb install -r trindade-0.7.0.apk

# Confirmar el paquete y la versión
adb shell dumpsys package com.trindade.app | grep -E "versionName|versionCode"
```

La app muestra la versión en **Perfil → Versión de la aplicación**. Si el teléfono tenía una build anterior y
la instalación falla con `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, el APK no está firmado con la clave oficial:
detener la publicación y revisar el keystore.

## 4. Huella del certificado

| Dato | Valor |
| --- | --- |
| SHA-256 | `EE:0E:40:4B:21:10:52:B3:11:AE:0E:07:30:60:6E:9C:7D:55:54:31:54:63:D0:2F:9E:F3:3C:95:73:C4:31:F6` |
| SHA-256 sin separadores | `ee0e404b211052b311ae0e0730606e9c7d5554315463d02f9ef33c9573c431f6` |
| DN | `CN=Trindade Massas Operacoes, OU=Mobile, O=Trindade, L=Sao Paulo, ST=SP, C=BR` |
| Algoritmo | RSA 4096, autofirmado, válido hasta 2054 |

Esta huella es pública y es la que se compara en el workflow antes de publicar.
