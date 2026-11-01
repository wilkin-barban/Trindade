# Contribuir a Trindade Massas

Esta guía explica cómo trabajar en el repositorio sin romper la operación: qué entorno preparar, cómo se
nombran los commits, qué pruebas ejecutar antes de publicar y cómo se mantiene la documentación.

## 1. Requisitos

- Node.js 24 o superior (`engines.node` y `.nvmrc`).
- npm 10 o superior.
- Docker y Docker Compose para pruebas de integración y builds reproducibles.
- JDK y Android SDK solo si vas a compilar el cliente Android fuera del contenedor oficial.

## 2. Puesta en marcha

```bash
git clone https://github.com/wilkinbarban/Trindade.git
cd Trindade
make install
cp .env.example .env
# Editar .env y definir JWT_SECRET (mínimo 32 caracteres)
make dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

## 3. Flujo de trabajo

El proyecto usa **trunk-based development**:

- Todo se integra en `main`. No se abren ramas de feature ni se dejan worktrees huérfanos.
- Cada commit debe ser una unidad revisable y coherente: código, pruebas y documentación juntos.
- Los commits atómicos no superan las **400 líneas brutas**.
- Los mensajes siguen [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/):
  `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- No se agregan trailers `Co-Authored-By` ni menciones a asistentes de IA.
- No se mueve ni se reutiliza un tag publicado.

Antes de commitear:

```bash
git status --short
git diff --check
```

## 4. Pruebas

### Compuerta completa en clon limpio

```bash
make ci-clone
```

Ejecuta build, typecheck, pruebas de backend, verificación de los CLIs de esquema, verificación del contrato
OpenAPI y Playwright E2E. Es la compuerta que corre GitHub Actions.

### Pruebas por workspace

```bash
# Backend
npm run test --workspace=packages/backend
npm run typecheck --workspace=packages/backend

# Frontend
npm run test --workspace=packages/frontend
npm run typecheck --workspace=packages/frontend

# E2E web
npm run test:e2e --workspace=packages/frontend
```

### Android

```bash
make ci-android
```

La lane compila, ejecuta la suite JVM/Compose y ensambla un release sin firma con versión de prueba. Si
trabajas con el SDK local:

```bash
cd packages/android
./gradlew :app:testDebugUnitTest
```

## 5. Base de datos y migraciones

- El esquema se versiona con `PRAGMA user_version`. La revisión vigente está en
  `packages/backend/src/db/schema-version.ts`.
- Una migración nueva necesita: archivo de migración, paso en `migrations.ts`, actualización de
  `SCHEMA_VERSION`, pruebas de migración y actualización de [docs/despliegue.md](docs/despliegue.md).
- El servidor **nunca** migra automáticamente al arrancar. La migración es un paso explícito del operador con
  la API detenida.
- No ejecutes `make db-reset` ni `db:reset` contra una base de producción.

## 6. Contrato OpenAPI

`packages/contracts/openapi.json` se genera desde los esquemas Zod del backend y se commitea.

```bash
npm run contracts:generate --workspace=packages/backend
bash scripts/verify-openapi-artifact.sh
```

No edites `openapi.json` a mano. Si cambias una ruta o un esquema de respuesta, regenera el contrato y
actualiza el cliente Android cuando corresponda.

## 7. Documentación

- La documentación del repositorio se escribe **en español**.
- Cada cambio de comportamiento actualiza el documento correspondiente y, si corresponde, `CHANGELOG.md`.
- El índice está en [docs/README.md](docs/README.md). Los procedimientos operativos viven en `docs/`; las
  tareas históricas, en `odd/tasks/`.
- Los nombres de pantalla en portugués se citan como identificadores; la explicación va en español.
- No se incluyen secretos, contraseñas, tokens ni rutas personales en documentos versionados.

## 8. Checklist antes de abrir un pull request

- [ ] El cambio está acotado y no mezcla refactors ajenos.
- [ ] `make ci-clone` pasa (o la lane equivalente, si el cambio es solo Android).
- [ ] `make ci-android` pasa si se tocó el cliente Android.
- [ ] Se agregaron o actualizaron pruebas para el comportamiento nuevo.
- [ ] La documentación y el `CHANGELOG.md` reflejan el cambio.
- [ ] No se agregaron secretos ni archivos generados innecesarios.
- [ ] El commit sigue Conventional Commits y no tiene atribución de IA.
- [ ] Si hay migración, está documentada y probada con una base existente.

## 9. Releases

- **Web:** el despliegue se documenta en [docs/despliegue.md](docs/despliegue.md).
- **Android:** la firma, el versionado y la publicación se documentan en
  [docs/release-android.md](docs/release-android.md). El histórico de builds está en
  [docs/release-android-historial.md](docs/release-android-historial.md).

## 10. Licencia

Al contribuir aceptás que tu aporte se distribuya bajo la licencia MIT del proyecto.
