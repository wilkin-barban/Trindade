# Remediación de la auditoría Web ↔ Android

Base: `97436e32`. Corregir los hallazgos del informe en su orden y verificar antes de entregar. No publicar APK, tag ni release; la APK es para el emulador.

## Specs

- S1. «cuando Salva el horario no lanza las opciones de compartirlos por whatsapp, y al eliminar el horario de hoy, da error porque lo muestra en el modulo Horario».
- S2. «quiero ver si la paridad de las dos aplicaciones esta completa, si todas las consultas con ERP estan remediadas y son correctas, si todo lo desarrollado en la documentacion esta implementado correctamente en la web y en la aplicacion android».
- S3. «quiero buscar bug, mensajes de error y de exito que faltan, ver si todos los mensajes estan mostrados en ventanas emergentes y no dibujandose en la propia aplicacion».
- S4. «ver si los aspectos visuales estan corregidos, ver si todo el soporte i18n esta correcto (los nombres de productos e insumos, mercancias y lo que llega por ERP no se traducen)».
- S5. «al terminar deploy de la imagen de produccion y creacion del apk e instalacion en el emulador para pruebas, verificacion de todos los hallazgos endontrados».

## Tasks

- T1 · S1 · Android Cargamento: navegación al share e invalidación de grilla; inline; verificado (commit de esta unidad).
- T2 · S2 · Web Salida: veredicto del puente y retención del outbox; pendiente.
- T3 · S2 · Android: pares de auditoría de Salida y prueba de conexión; pendiente.
- T4 · S3 · Resultados de acción inline y validación de Relatório; pendiente.
- T5 · S2,S4 · Adjuntos por movimiento, i18n/encoding, Stock y verificación visual; pendiente.
- T6 · S2–S5 · Alinear documentación, pruebas ERP en aislamiento y aceptación por cliente; pendiente.
- T7 · S5 · Verificación independiente, deploy con rollback y APK de prueba en Ubuntu con respaldo; pendiente.

## Log

- L1. «vamos en orden recomendado, remedia todo, al terminar deploy de la imagen de produccion y creacion del apk e instalacion en el emulador para pruebas, verificacion de todos los hallazgos endontrados».
- Base limpia. El informe anterior separa hallazgos comprobados en código y pruebas todavía pendientes; no usar datos reales para pruebas destructivas.
- T1 RED, job-66: Gradle exit 1, dos pruebas de cableado fallaron antes del cambio. Ambos accesos al Horario ahora comparten la acción de guardar; al abrir Historial se marca la grilla para releerla al regresar. GREEN job-67: exit 0, 39 pruebas, cero fallos (cableado, flujo de día, grilla e histórico). Falta prueba de aceptación en emulador al final.
