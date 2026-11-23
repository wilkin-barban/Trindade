# Conciliación Aero y prevención de reenvíos

Trabajar en `main`; no modificar datos reales ni contactar el ERP de planta. La sustitución de APK requiere firma externa: no acceder al keystore ni a credenciales.

## Specs

- S1. «En `AeroLogic.kt` (Android) y `aero-integration.ts` (Web): robustecer la clave de operador en `reconcileAeroMovements`.»
- S2. «En la UI de Android (`MassasUnifiedTable` / `MassasLaunchViewModel`): proteger el botón "Enviar" para que mientras una fila esté en vuelo o despachada se deshabilite y no permita toques duplicados.»
- S3. «Escribir tests unitarios enfocados que reproduzcan la falla (RED) y pasen con el fix (GREEN).»
- S4. «Mantener la versión pública en `0.8.6` (NO crear tag nuevo ni release nueva).»
- S5. «Reconstruir y redesplegar los contenedores en producción (`docker compose build && docker compose up -d`).»
- S6. «Documentar la sustitución en `docs/release-android-historial.md`.»
- S7. «Cuando `includeExits = true`, no enviar null; realizar DOS peticiones a Aero32: una con `movementType = "E"` y otra con `movementType = "S"`, uniendo las listas de asientos (`entries.movements + exits.movements`) y sumando `skipped`. Si `includeExits = false`, mantener la llamada única con `"E"`.»
- S8. «Aviso de instalação: Como este é um app corporativo interno da fábrica, o Android/Play Protect pode exibir um aviso de desenvolvedor desconhecido. Para continuar, toque em "Mais detalhes" e depois em "Instalar assim mesmo".» «En Android 12+ (API 31+), cuando `canRequestPackageInstalls()` ya esté concedido, aprovechar `PackageInstaller.SessionParams` con `setRequireUserAction(USER_ACTION_NOT_REQUIRED)` para actualizaciones desatendidas sin pantallas innecesarias.» «Si falta el permiso, advertir en la UI con mensaje claro antes de redirigir a configuración.»

## Tasks

- T1 · S1,S3 · ✓ Completado: normalización de espacios, matching por username y displayName, prevención de ambigüedades; suites Web y Android verdes (AeroLogicTest, aero-integration.test).
- T2 · S2,S3 · ✓ Completado: reserva atómica de fila, deshabilitación de botón en vuelo/despachado, reintento tras fallo; suites verdes (MassasLaunchViewModelTest, MassasUnifiedTableTest).
- T3 · S4,S6 · ✓ Completado: APK firmado oficial build 8011 verificado (SHA-256 c7b51faa64b44298175bdbbf56a972ece81e47fc6963dcabadcb8dfff1a3e5a2); metadatos en app.service.ts y docs en release-android-historial.md actualizados.
- T4 · S4,S5 · ✓ Completado: Sustitución de asset en GitHub release v0.8.6 (clobber) y despliegue en producción de trindade-api y trindade-web verificado en vivo.
- T5 · S7 · ✓ Completado: consulta de entradas y salidas en dos peticiones ("E" y "S") sin enviar null; RED observado y GREEN probado en AeroErpClientTest.
- T6 · S8 · ✓ Completado: aviso en ProfileScreen para Play Protect, UPDATE_PACKAGES_WITHOUT_USER_ACTION y setRequireUserAction(USER_ACTION_NOT_REQUIRED) en ApkInstaller con fallback; ProfileScreenTest y suites verdes.

## Log

- L1. El pedido original contiene datos personales y referencias a asientos reales; se omiten aquí por privacidad. Los requisitos literales no sensibles figuran en Specs.
- El usuario informó remediación previa de datos reales; no fue verificada por esta sesión y no se modificarán esos datos.
- Corrección del usuario: «Sumar la corrección de Histórico de Saídas a esta misma entrega para la build 8011.» El reporte de HTTP 500 y su causa son informados por el usuario; no consultar ERP real.
- Corrección del usuario: «Mejorar el flujo de actualización de la app Android para evitar la fricción y la alarma de "virus" / Play Protect en los teléfonos de los trabajadores.»
- Exploración: ambos clientes comparan el usuario, mientras el backend admite también el nombre visible. Las claves sin espacios pueden colisionar: no conciliar operadores ambiguos por heurística. El mutex Android serializa envíos, pero el botón no refleja el estado en vuelo.
