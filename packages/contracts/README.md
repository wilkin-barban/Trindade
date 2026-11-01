# Contrato OpenAPI de Trindade

`openapi.json` es el contrato legible por máquina de la API de Trindade Massas. Se genera desde los esquemas Zod
que validan las rutas del backend y existe para que un cliente —especialmente Android— pueda leer la superficie de
la API sin compilar ni ejecutar el servidor.

## 1. No editar `openapi.json` a mano

El archivo se regenera desde el código:

```bash
npm run contracts:generate --workspace=packages/backend
```

La compuerta de CI regenera el documento y falla si el artefacto versionado difiere. Un cambio de esquema no se
puede mergear sin regenerar. Editar el JSON a mano sería sobrescrito por la próxima ejecución y, peor, describiría
una API que no existe.

## 2. Cobertura actual

El documento cubre **59 paths** y **81 operaciones**:

| Superficie | Paths | Incluye |
| --- | ---: | --- |
| `/api/reports` | 12 | Categorías, productos, reportes, historial, exportación y fotos |
| `/api/admin` | 12 | Usuarios, categorías, tareas, conductores, vehículos, horarios y auditoría |
| `/api/loading` | 10 | Cronogramas, historial, exportación, conductores, vehículos y horarios |
| `/api/auth` | 9 | Login, refresh, perfil, cambio de contraseña, logout, registro y setup |
| `/api/stock` | 4 | Catálogo, entradas, reset e historial |
| `/api/massas-launch` | 4 | Lanzamientos, reporte e historial |
| `/api/integration` | 2 | Bitácora y espejo de movimientos del ERP |
| `/api/app` | 2 | Última release y descarga de APK |
| `/api/dashboard` | 1 | Resumen operativo |
| `/api/users` | 1 | Opciones de usuario |
| `/api/health` | 1 | Liveness |
| `/p/{token}` | 1 | Foto pública por token |

Una ruta registrada en el backend y ausente del contrato es una brecha, no una omisión admitida. La prueba de
cobertura falla en ese caso.

Los paths usan la forma de plantilla OpenAPI `{param}`. Fastify declara sus rutas como `:param`, y el generador no
traduce entre las dos formas: el registro hace la conversión a propósito. `:id` no es una plantilla OpenAPI válida y
un generador de clientes no reconocería el parámetro. La prueba de cobertura normaliza `{param}` de vuelta a
`:param` al comparar contra las rutas que Fastify registró.

## 3. Qué está garantizado y qué no

- Los esquemas de respuesta son esquemas Zod, no interfaces TypeScript. La suite parsea respuestas reales de la app
  contra ellos; una forma que se desvía falla una prueba en lugar de llegar a un cliente.
- Son `.strict()`: un `z.object` común aceptaría y descartaría campos extra en silencio, de modo que una ruta podría
  devolver algo que el documento no describe sin que nadie lo note. Los objetos estrictos obligan a que la prueba
  demuestre que el servidor envía **exactamente** los campos documentados.
- El costo es deliberado: agregar un campo de respuesta exige regenerar el contrato en lugar de dejarlo pasar.
- `details` en el sobre de error queda intencionalmente sin restringir. Lleva la salida de `flatten()` de Zod como
  texto de diagnóstico para una persona y no es un objetivo de parseo estable.

## 4. Verificación

```bash
# Regenerar el contrato
npm run contracts:generate --workspace=packages/backend

# Comprobar que el artefacto versionado coincide con los esquemas
bash scripts/verify-openapi-artifact.sh

# Generar el contrato Kotlin que consume Android
bash scripts/generate-android-contract.sh

# Comprobar que los tipos Android están al día
bash scripts/check-android-contract-types.sh
```

El contrato Kotlin generado se commitea en `packages/android/contract/src/main/kotlin`. La lane Android lo verifica
en CI.

## 5. Cómo agregar o cambiar una ruta

1. Definir o actualizar el esquema Zod de request y response en el módulo del backend.
2. Registrar la ruta en el registro OpenAPI con su método, path y esquema.
3. Regenerar `openapi.json`.
4. Actualizar el contrato Kotlin si el cambio afecta a Android.
5. Agregar o ajustar las pruebas de contrato y de respuesta real.
6. Ejecutar `make ci-clone` y `make ci-android` si corresponde.

## 6. Referencias

- [README del repositorio](../../README.md) — visión general y puesta en marcha.
- [docs/arquitectura.md](../../docs/arquitectura.md) — módulos y rutas del backend.
- [docs/despliegue.md](../../docs/despliegue.md) — despliegue y migraciones.
