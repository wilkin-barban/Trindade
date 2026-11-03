# Documentación de Trindade Massas

Este directorio reúne la documentación operativa y técnica del proyecto. La portada del repositorio
([README.md](../README.md)) explica qué es Trindade y cómo levantarlo; aquí está el detalle.

## Rutas rápidas

| Quiero… | Ir a |
| --- | --- |
| Trabajar en el repo como agente | [../AGENTS.md](../AGENTS.md) y [agents/trindade-development.md](agents/trindade-development.md) |
| Entender cómo está armado el sistema | [arquitectura.md](arquitectura.md) |
| Desplegar una versión web | [despliegue.md](despliegue.md) |
| Publicar un APK Android | [release-android.md](release-android.md) |
| Ver qué se publicó y con qué hash | [release-android-historial.md](release-android-historial.md) |
| Entender las reglas de Assaí y stock | [calculadoras.md](calculadoras.md) |
| Integrar o depurar Aero32 | [integracion-aero-masas-web.md](integracion-aero-masas-web.md) |
| Leer los contratos exactos del WebService | [registro-integracion-aero-webservice.md](registro-integracion-aero-webservice.md) |
| Revisar la auditoría técnica del ERP | [integracion-aero32.md](integracion-aero32.md) |
| Conocer el producto y sus reglas de negocio | [../PRD_Trindade.md](../PRD_Trindade.md) |
| Contribuir al repositorio | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| Ver cambios por versión | [../CHANGELOG.md](../CHANGELOG.md) |

## Índice

| Documento | Para quién | Qué responde |
| --- | --- | --- |
| [../AGENTS.md](../AGENTS.md) | Agentes y desarrollo | Reglas de entrada, mapa y puertas de calidad |
| [agents/trindade-development.md](agents/trindade-development.md) | Agentes y desarrollo | Guía completa de web, Android, build, actualización y ERP |
| [arquitectura.md](arquitectura.md) | Desarrollo | Monorepo, módulos, rutas, datos y flujos |
| [despliegue.md](despliegue.md) | Operaciones | Despliegue, migraciones, verificación y rollback |
| [release-android.md](release-android.md) | Mobile | Firma, versionado, build y publicación del APK |
| [release-android-historial.md](release-android-historial.md) | Mobile | Builds publicados, versionCodes, hashes y estado |
| [calculadoras.md](calculadoras.md) | Producto | Reglas de Assaí, stock, historial y exportaciones |
| [integracion-aero-masas-web.md](integracion-aero-masas-web.md) | Producto y backend | Flujo operativo con Aero32, atajo de iOS y espejo ERP |
| [integracion-aero32.md](integracion-aero32.md) | Backend | Auditoría de ingeniería inversa del ERP |
| [registro-integracion-aero-webservice.md](registro-integracion-aero-webservice.md) | Backend | Contratos JSON de los endpoints del WebService |
| [design/system.md](../design/system.md) | Diseño | Tokens y criterios visuales del sistema |

## Convenciones

- **Idioma:** la documentación se escribe en español. Los nombres de pantalla y de producto que la planta ve
  en portugués se citan como identificadores; la explicación va en español.
- **Código y comandos:** rutas, variables de entorno, nombres de archivos y fragmentos de código se mantienen
  literales.
- **Fuente de verdad:** el código y el esquema versionado mandan sobre la documentación. Si un documento y el
  repositorio discrepan, se corrige el documento.
- **Datos volátiles:** las cifras de pruebas, versiones de build y hashes viven en
  [release-android-historial.md](release-android-historial.md) y en [CHANGELOG.md](../CHANGELOG.md), no
  repetidos en cada guía.
- **Seguridad:** no se documentan valores de secretos, contraseñas, tokens ni rutas personales. La huella
  pública del certificado Android sí se documenta porque es el dato que se compara al verificar un APK.

## Cómo actualizar la documentación

1. Cambiar el comportamiento en código.
2. Actualizar el documento afectado y, si corresponde, `CHANGELOG.md`.
3. Ejecutar la verificación de enlaces y la compuerta de CI.
4. Revisar que no queden referencias a documentos eliminados ni afirmaciones de versiones viejas.

El estado de cada release y el procedimiento de firma son sensibles: cualquier cambio en el workflow de
Android o en el esquema de base de datos debe reflejarse en `release-android.md` y `despliegue.md` en el mismo
commit.
