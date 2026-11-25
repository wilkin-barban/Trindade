# Release Android v0.8.7 y Despliegue de Auto-Update

Publicación de la versión oficial v0.8.7 (build 8012) para distribuir en producción la corrección de serialización de SaidaItemPayload y el reenvío resiliente de bajas al ERP Aero32.

## Specs

S1 — Metadatos de Release y Documentación:
- Actualizar `packages/backend/src/modules/app/app.service.ts`:
  - `LOCAL_APK_BUILD_NUMBER = 8012`
  - `FALLBACK_RELEASE.version = 'v0.8.7'`
  - `FALLBACK_UPSTREAM_APK_URL = 'https://github.com/wilkin-barban/Trindade/releases/download/v0.8.7/trindade-0.8.7.apk'`
  - `LOCAL_APK_FILENAME = 'trindade-0.8.7.apk'`
- Actualizar pruebas unitarias en `packages/backend/src/modules/app/app.routes.test.ts` (7/7 verdes).
- Registrar la nueva entrada en `docs/release-android-historial.md`.

S2 — Tag Git y Construcción de APK Firmado:
- Crear commit atómico en `main` sin `Co-Authored-By`.
- Crear tag `v0.8.7` (`git tag -a v0.8.7 -m "Trindade Android v0.8.7"`) y pushear a `origin` para disparar el workflow de GitHub Actions `.github/workflows/android-release.yml`.
- Validar que el workflow compile y firme el APK con el certificado oficial del proyecto (SHA-256 `EE:0E:40:4B:21:10:52:B3:11:AE:0E:07:30:60:6E:9C:7D:55:54:31:54:63:D0:2F:9E:F3:3C:95:73:C4:31:F6`).

S3 — Alojamiento Local y Redespliegue:
- Una vez publicada la release en GitHub, descargar `trindade-0.8.7.apk` en `packages/backend/apk/` y generar su `trindade-0.8.7.apk.sha256`.
- Recompilar y reiniciar el contenedor `trindade-api-1` (`docker compose build api && docker compose up -d api`).
- Verificar que `GET /api/app/latest-release` responda `v0.8.7` con build `8012` y que `GET /api/app/download-apk` entregue el nuevo binario.

## Tasks

- [x] T1 — Metadatos en `app.service.ts` (`v0.8.7`, `trindade-0.8.7.apk`, build 8012), aserciones en `app.routes.test.ts` e historial actualizado.
- [x] T2 — Commit `2b4b6af7` en `main`, tag anotado `v0.8.7` y push a `origin`.
- [x] T3 — Run [45604529854](https://github.com/wilkin-barban/Trindade/actions/runs/45604529854) en verde: release `v0.8.7` publicado con `trindade-0.8.7.apk` (11.627.150 bytes) y su `.sha256`.
- [x] T4 (parcial) — APK descargado en `packages/backend/apk/` con su `trindade-0.8.7.apk.sha256`. **Redespliegue pendiente de validación del usuario.**
- [ ] T5 — Verificar salud del contenedor y respuesta de actualización en producción.

## Evidencia

- **Verificación del binario publicado** (`aapt2 dump badging` / `apksigner verify`, build-tools 35 del contenedor): `package: name='com.trindade.app' versionCode='8012' versionName='0.8.7'`.
- **Firma**: `Signer #1 certificate SHA-256 digest: ee0e404b211052b311ae0e0730606e9c7d5554315463d02f9ef33c9573c431f6`, que coincide con la huella histórica del proyecto `EE:0E:40:4B:…:73:C4:31:F6` y con `EXPECTED_CERT_SHA256` del workflow.
- **SHA-256 del APK**: `73313fb8b4dab32727f986d98a06103516e956af640990a4cd54164d3641e80a`, idéntico al asset `.sha256` publicado por el workflow y al archivo local descargado.
- **versionCode**: el tag v0.8.7 deriva 8007 y el workflow toma el mayor contra `LOCAL_APK_BUILD_NUMBER = 8012` del commit tagueado, así que publica 8012. Instalado en la planta hay 8011: la actualización es ascendente.

## Invariantes

- Trunk-based directo a `main`. Prohibición total de `Co-Authored-By` o autoría de IA.
- El versionCode del APK debe ser 8012 (superior a 8011) para que Android admita la actualización sin downgrade.
- La firma debe coincidir estrictamente con el certificado histórico del proyecto.
