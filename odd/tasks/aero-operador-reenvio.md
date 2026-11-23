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

- T1 · S1,S3 · Implementado y con suites anteriores verdes; auditoría independiente detectó ambigüedad residual cuando faltan IDs y dos operadores comparten el mismo par de nombres. No se comprobó que ese estado sea posible en producción.
- T2 · S2,S3 · Implementado con pruebas previas verdes de reserva y botón; auditoría parcial, pendiente completar inspección de competencia entre cola y envío individual.
- T3 · S4,S6 · ✓ Completado: APK firmado oficial build 8011 verificado (SHA-256 c7b51faa64b44298175bdbbf56a972ece81e47fc6963dcabadcb8dfff1a3e5a2); metadatos en app.service.ts y docs en release-android-historial.md actualizados.
- T4 · S4,S5 · Usuario informó sustitución del asset y despliegue en producción; la auditoría verificó hash y firma de la APK local, no el artefacto descargado ni su correspondencia exacta con el código.
- T5 · S7 · Implementado y con test de combinación E+S verde; auditoría parcial, sin cobertura independiente confirmada para fallo en cada lado ni suma de `skipped`.
- T6 · S8 · Auditoría detectó que la confirmación pendiente no se manejaba y que el aviso de permiso aparece después de abrir ajustes. Se implementó manejo de confirmación con receptor no exportado en el trabajo posterior; quedan sin comprobar en dispositivo la apertura desde segundo plano, el fallo asíncrono y el retorno desde ajustes. Android puede exigir confirmación y Play Protect no se elimina.

## Log

- L1. El pedido original contiene datos personales y referencias a asientos reales; se omiten aquí por privacidad. Los requisitos literales no sensibles figuran en Specs.
- El usuario informó remediación previa de datos reales; no fue verificada por esta sesión y no se modificarán esos datos.
- Corrección del usuario: «Sumar la corrección de Histórico de Saídas a esta misma entrega para la build 8011.» El reporte de HTTP 500 y su causa son informados por el usuario; no consultar ERP real.
- Corrección del usuario: «Mejorar el flujo de actualización de la app Android para evitar la fricción y la alarma de "virus" / Play Protect en los teléfonos de los trabajadores.»
- Exploración: ambos clientes comparan el usuario, mientras el backend admite también el nombre visible. Las claves sin espacios pueden colisionar: no conciliar operadores ambiguos por heurística. El mutex Android serializa envíos, pero el botón no refleja el estado en vuelo.
