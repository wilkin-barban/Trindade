# Release 0.8.6 y sincronización pública

Base de tag solicitada: `27924e63`. Publicación y documentación autorizadas por el usuario.

## Specs

- S1. «Publicación de la Release v0.8.6 en GitHub»
- S2. «Documentación del proyecto»
- S3. «Sincronización en GitHub y Portafolio»

## Tasks

- T1 · S1 · status: partial. CI remota `44921524947` falló; luego se ajustaron los E2E: backend 996/996 y Playwright 132/132 locales. Prueba independiente de aapt2/apksigner no disponible en el verificador por herramientas fuera de PATH; el usuario acepta la validación técnica previa y la aceptación en vivo en emulador (commit 27924e63), sin inventar un pass. La prueba independiente sigue sin comprobarse; tag y release pendientes.
- T2 · S1,S2 · Metadatos, APK y documentación preparados; RED 2 fallos y GREEN backend 996/996. Commit pendiente de CI verde.
- T3 · S3 · Sincronizar Portafolio y perfil; inline; commits pendientes.

## Log

- L1. «Wilkin autorizó la publicación de la release oficial 0.8.6 y la actualización de documentación. Procedamos con estos pasos:

1. Publicación de la Release v0.8.6 en GitHub:
   - Hacé el push de main a origin: git push origin main.
   - Creá el tag v0.8.6 en el commit actual de main y pushealo: git tag -a v0.8.6 -m "Trindade Android v0.8.6" && git push origin v0.8.6.
   - Publicá la release con GitHub CLI adjuntando el APK firmado:
     gh release create v0.8.6 /home/wilkin/Desktop/trindade-0.8.6-8010.apk#trindade-0.8.6.apk --title "Trindade Android v0.8.6" --notes-file <(echo -e "## Novedades de Trindade v0.8.6\n\n- **Cargamento (S1)**: Flujo de guardado con share directo a WhatsApp en formato DD/MM/YYYY e invalidación de grilla tras borrado.\n- **Salida / Baixa (S2)**: Paridad de consultas ERP y persistencia selectiva de outbox.\n- **Diálogos Modales (S3)**: Errores y confirmaciones en popups modales (ActionResultDialog/Confirmar saída), sin texto inline.\n- **Adjuntos y Cuota (S4)**: Selector fotográfico del sistema, cuota máxima de 3 fotos y render de miniaturas.\n- **i18n y ERP**: Nombres de insumos y productos preservados sin traducir.\n\n**Artefacto**: `trindade-0.8.6.apk` (build 8010) firmado oficialmente.\n**SHA-256**: `8efc23c90b26d0ad5ceb3ea52506d2dbe7dc94fe4679f14aac86ec92bb9084a6`")
   - En packages/backend/src/modules/app/app.service.ts actualizá LOCAL_APK_BUILD_NUMBER = 8010 y FALLBACK_RELEASE.version = 'v0.8.6'.
   - En docs/release-android-historial.md actualizá la tabla agregando la fila de 0.8.6 / 8010 como **Publicada**.

2. Documentación del proyecto:
   - Cargá y aplicá la skill cognitive-doc-design (/home/wilkin/.agents/skills/cognitive-doc-design/SKILL.md) para redactar las notas de la release y actualizar el README.md del proyecto con foco en baja carga cognitiva.
   - Dejá todo consolidado en main con commit limpio.

3. Sincronización en GitHub y Portafolio:
   - Una vez finalizada la release de Trindade, activá la skill portfolio-project-sync (/home/wilkin/.agents/skills/portfolio-project-sync/SKILL.md) para actualizar la ficha de Trindade (versión 0.8.6, stack y novedades) en /home/wilkin/proyectos/Portafolio y en el README de perfil de GitHub de Wilkin.

Avanzá con la publicación de la release y la documentación, y contame cómo va el proceso.»
