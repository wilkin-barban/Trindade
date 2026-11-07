# Trindade Massas Operações

[![Release](https://img.shields.io/github/v/release/wilkin-barban/Trindade?label=Release&color=blue)](https://github.com/wilkin-barban/Trindade/releases/latest)
[![CI](https://img.shields.io/badge/CI-Passing-brightgreen)](https://github.com/wilkin-barban/Trindade/actions/workflows/ci.yml)
[![Android APK](https://img.shields.io/badge/Android-APK%20firmado-purple)](https://github.com/wilkin-barban/Trindade/releases/latest)
[![Licencia: MIT](https://img.shields.io/badge/Licencia-MIT-yellow.svg)](LICENSE)

Plataforma operativa de **Trindade Massas** para registrar la producción de masas, los reportes de higiene y temperatura, el cronograma de cargas, el conteo de stock y la administración de la planta. Funciona en web responsive y en una aplicación Android nativa con las mismas reglas de negocio, e integra los lanzamientos de producción con el ERP **Aero32** de la empresa.

> Los nombres de pantalla de la aplicación se muestran en portugués para el personal de planta. Esta documentación los traduce al español y conserva el nombre original solo cuando hace falta para identificar una pantalla o un campo.

## Estado actual

| Dato | Valor |
| --- | --- |
| Última versión publicada | `v0.7.5` (GitHub Release `v0.7.5`); `/api/app/latest-release` la anuncia al desplegarse la API |
| Aplicación Android | APK firmado, `com.trindade.app`, Android 8.0 o superior |
| Base de datos | SQLite, esquema **revisión 9** (18 tablas) |
| Producción web | <https://trindademasas.duckdns.org> |
| Integración ERP | Aero32 por WebService local, con espejo de movimientos en Trindade |
| Documentación | [Índice completo](docs/README.md) |

El detalle de cada entrega está en [CHANGELOG.md](CHANGELOG.md). El histórico de APKs, hashes y verificaciones está en [docs/release-android-historial.md](docs/release-android-historial.md).

## Qué resuelve

- **Producción de masas**: carga por producto y por caja, resumen colectivo del día, historial y envío por WhatsApp.
- **Reportes de planta**: checklists, temperaturas, cantidades y fotos, con edición limitada a la ventana operativa.
- **Cronograma de cargas**: horarios, fleteros, vehículos propios, control de cupos y envío directo por WhatsApp.
- **Stock y calculadoras**: pedido de Assaí en cajas enteras, conteo diario de stock e historial de solo lectura.
- **Administración**: usuarios, roles, catálogos, auditoría y configuración de la integración con el ERP.
- **App Android**: paridad funcional con la web para el trabajo en planta, con actualización firmada y verificación de versión.

## Módulos principales

| Módulo | Qué hace | Acceso |
| --- | --- | --- |
| Panel | Indicadores del día, cronograma activo, acceso a lanzamiento de masas y totales históricos | Administrador y Trabajador |
| Lanzamiento de masas | Entradas por caja, cálculo de unidades, resumen colectivo, historial y WhatsApp | Administrador y Trabajador |
| Reportes | Checklists, temperaturas, cantidades, fotos y exportación | Administrador y Trabajador |
| Cronograma de carga | Horarios, fleteros, vehículos, cupos y texto para WhatsApp | Administrador y Trabajador |
| Stock | Calculadora de stock, historial y resumen colectivo del día | Trabajador lee; Administrador corrige |
| Calculadora de Assaí | Pedido en cajas enteras con exportación por WhatsApp | Administrador y Trabajador |
| Compartir app | Enlaces de descarga, credenciales y alta rápida de operarios | Administrador y Trabajador |
| Administración | Usuarios, categorías, tareas, conductores, vehículos, horarios y auditoría | Administrador; catálogos según rol |
| Perfil | Cambio de contraseña, versión instalada y cierre de sesión | Administrador y Trabajador |

## Inicio rápido

### Requisitos

- Node.js 24 o superior
- npm 10 o superior
- Docker y Docker Compose (para pruebas de integración y builds reproducibles)

### Puesta en marcha

```bash
# 1. Clonar el repositorio
git clone https://github.com/wilkin-barban/Trindade.git
cd Trindade

# 2. Instalar dependencias de todos los workspaces
make install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env y definir un JWT_SECRET seguro (mínimo 32 caracteres)

# 4. Iniciar el entorno de desarrollo
make dev
```

- **Web**: `http://localhost:5173`
- **API**: `http://localhost:3000`

La guía de contribución y las reglas de trabajo están en [CONTRIBUTING.md](CONTRIBUTING.md). El despliegue y el rollback están en [docs/despliegue.md](docs/despliegue.md).

## Documentación

| Documento | Contenido |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Punto de entrada para agentes y reglas de trabajo |
| [docs/agents/trindade-development.md](docs/agents/trindade-development.md) | Guía completa de desarrollo, build Android, actualización y ERP |
| [docs/README.md](docs/README.md) | Índice, rutas rápidas y convenciones |
| [docs/arquitectura.md](docs/arquitectura.md) | Monorepo, módulos, datos y flujos |
| [docs/despliegue.md](docs/despliegue.md) | Despliegue, migraciones y rollback en producción |
| [docs/release-android.md](docs/release-android.md) | Firma, versionado y publicación del APK |
| [docs/release-android-historial.md](docs/release-android-historial.md) | Builds publicados, hashes y verificaciones |
| [docs/calculadoras.md](docs/calculadoras.md) | Reglas de Assaí, stock e historial |
| [docs/integracion-aero-masas-web.md](docs/integracion-aero-masas-web.md) | Flujo operativo con el ERP Aero32 |
| [docs/integracion-aero32.md](docs/integracion-aero32.md) | Auditoría técnica del WebService Aero32 |
| [docs/registro-integracion-aero-webservice.md](docs/registro-integracion-aero-webservice.md) | Contratos exactos de los endpoints |
| [doc/PRD_Trindade.md](doc/PRD_Trindade.md) | Especificación de producto y reglas de negocio |
| [CHANGELOG.md](CHANGELOG.md) | Historial de cambios por versión |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Flujo de trabajo, commits y pruebas |

## Estructura del repositorio

```text
Trindade/
├── packages/
│   ├── backend/      API Fastify + SQLite + migraciones
│   ├── frontend/     SPA React + Vite
│   ├── android/      Cliente Android nativo en Kotlin/Compose
│   └── contracts/    Contrato OpenAPI generado
├── docs/             Documentación operativa y técnica
├── docker/           Dockerfiles, Nginx y plantillas de despliegue
├── scripts/          CI, respaldos, contratos y utilidades
├── odd/              Tareas de ingeniería (histórico)
├── openspec/         Especificaciones y archivos de diseño (histórico)
└── Makefile          Atajos de desarrollo, CI y base de datos
```

## Calidad y CI

```bash
# Verificación completa en un clon limpio: build, tipos, tests y contrato
make ci-clone

# Suite Android en el contenedor oficial del SDK
make ci-android
```

Los workflows de GitHub Actions ejecutan la misma compuerta en cada push y pull request. El contrato OpenAPI se regenera y se compara en CI; no se edita a mano.

## Distribución Android

La instancia de producción sirve el APK firmado en `GET /api/app/download-apk` y publica la versión vigente en `GET /api/app/latest-release`; la app consulta ese endpoint y compara `versionName` y `buildNumber`. La release de GitHub `v0.7.5` publica el mismo binario que sirve la instancia, con el mismo sha256; `v0.7.4`, `v0.7.0` y `v0.7.1` conservan su asset histórico. El procedimiento de publicación está en [la guía de agentes](docs/agents/trindade-development.md).

## Licencia

Distribuido bajo la licencia **MIT**. Consultar [LICENSE](LICENSE).
