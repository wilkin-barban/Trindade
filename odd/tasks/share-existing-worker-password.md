# Compartir: contraseña temporal del trabajador existente

El módulo Compartir genera credenciales en la vista previa pero no las persiste: el trabajador existente recibe una
contraseña que su cuenta no tiene. La entrega la guarda con `PATCH /api/admin/users/:id` antes de abrir WhatsApp,
copiar o compartir el APK. Solo web; sin endpoint nuevo, sin OpenAPI, sin Android.

## Specs

S1 — Modo «Seleccionar existente»: al elegir un trabajador activo se genera una contraseña temporal **válida**
(`passwordIssue(password) === null`, ≥15 grafemas, ≤72 bytes, fuera de la lista débil) y se muestra en el campo
visible, editable. Se elimina el valor por defecto `123456789` y todo fallback silencioso a él.

S2 — La lista de candidatos sale de `GET /api/admin/users` y se filtra a **trabajadores activos**: `role_name ===
'Trabajador'`, `is_active === 1`, `username !== invitado`. Nunca administradores, invitados ni inactivos. El
fallback `/api/users/options` no se usa para credenciales: si `/admin/users` falla, el modo con credenciales falla
**cerrado** (aviso, sin lista, sin PATCH).

S3 — Antes de abrir WhatsApp, copiar o compartir el APK, si `includeCredentials` está activo y hay un trabajador
existente seleccionado, se hace `PATCH /api/admin/users/:id` con `{ password }` y se espera la respuesta. Si falla,
**no se abre ni se copia nada** y se muestra un error accionable (red, política, permisos o usuario inexistente).

S4 — Con el PATCH exitoso, el mensaje, el enlace de WhatsApp y el QR usan **exactamente** esa contraseña, y la misma
queda registrada como guardada.

S5 — No se repite el PATCH si el mismo usuario y la misma contraseña ya se guardaron. Si el admin edita la
contraseña (o cambia de usuario), vuelve a quedar **pendiente**.

S6 — «Abrir chat» abre una ventana en blanco **de forma síncrona** antes del `await` y navega a WhatsApp recién
cuando el PATCH terminó bien; si falla, cierra la ventana. Nunca se abre un chat con una clave no persistida ni se
depende del permiso de popups después del `await`.

S7 — El QR del modo existente queda **bloqueado** mientras la contraseña esté pendiente (aviso visible) y recién
después de guardar se genera con el mensaje real. No se entrega por QR una contraseña que todavía no existe en el
usuario.

S8 — La UI indica «Guardando contraseña…», «Contraseña actualizada», y los errores de red, política, permisos y
usuario inexistente. Aclara que abrir o copiar **cambia la contraseña y revoca las sesiones** del trabajador.

S9 — «Crear nuevo operário» conserva su flujo (crea la cuenta con `quickWorkerPassword`, exige crearla antes de
compartir). El comportamiento nuevo es solo para existentes.

S10 — Sin trabajador seleccionado o con credenciales desactivadas no hay PATCH. El modo crear tampoco lo hace.

S11 — Pruebas frontend: PATCH con el usuario y la contraseña correctos; sin PATCH en modo crear, sin credenciales o
sin usuario; bloqueo cuando el PATCH falla; contraseña generada válida; filtro de trabajadores activos; QR no
habilitado con contraseña pendiente. Se reutilizan los tests backend de reset/revocación/política.

S12 — Cierre: `typecheck`, tests backend y frontend, build y `make ci-clone`. Backup de recuperación antes de
desplegar (no hay migración). Imagen `web` y, si el diff lo pide, `api`. Verificación de `/api/health`,
contenedores y página. Usuario temporal de producción creado y eliminado por la vía administrativa con evidencia;
sin credenciales en logs, commits ni archivos. `CHANGELOG.md` y este ODD con hashes.

## Tasks

| ID | RED (test que falla primero) | GREEN (cambio mínimo) | Archivos | Aceptación | Riesgo | Rollback | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | — | Este ODD, solo docs | `odd/tasks/share-existing-worker-password.md` | Existe antes de todo código | Ninguno | `git revert` | pendiente | 06ce4efd |
| T2 | `share-credentials.test.ts`: la contraseña generada pasa `passwordIssue`, no es débil y no es la de antes | Generador de contraseña temporal | `lib/share-credentials.ts`, tests | Válida, aleatoria, ≥15 grafemas | Ninguno | Revertir commit | pendiente | bed0889f |
| T3 | Decisión de guardado: pendiente/guardada por usuario+contraseña | Función pura de decisión | `lib/share-credentials.ts`, tests | Sin PATCH repetido; editar reabre | Ninguno | Revertir commit | pendiente | bed0889f |
| T4 | Filtro de trabajadores activos | Filtro sobre `/admin/users` y fallo cerrado | `pages/ShareAppPage.tsx`, tests | Solo activos, nunca admin/invitado | 3 (permisos) | Revertir commit | pendiente | cdbddffd |
| T5 | PATCH antes de abrir/copiar/compartir; popup síncrono; QR bloqueado | Handlers y estado de guardado | `pages/ShareAppPage.tsx`, tests | Nada sale sin persistir; QR solo tras guardar | 3 (contraseñas) | Revertir commit | pendiente | cdbddffd |
| T6 | i18n ES/PT de estados y errores | Textos nuevos | `i18n/locales/es.json`, `pt-BR.json` | Paridad exacta | Ninguno | Revertir commit | pendiente | cdbddffd |
| T7 | — | CHANGELOG y ODD con evidencia | `CHANGELOG.md`, ODD | Registro completo | Ninguno | Revertir commit | pendiente | 95c86bfb |
| T8 | — | Suites, typecheck, build, CI | — | Todo verde | Ninguno | — | pendiente | pendiente |
| T9 | — | Deploy `web` y verificación en producción | producción | `web` healthy, health 200, página nueva | 5 (despliegue) | Imagen anterior | pendiente | pendiente |
| T10 | — | Usuario temporal creado, validado y eliminado | producción | Contraseña vieja inválida, nueva válida; usuario ausente al final | 1 (datos) | Borrado administrativo | pendiente | bloqueado |

## Log

L1 — Pedido del usuario (verbatim):

> Che, aprobaron el cambio del módulo Compartir de Trindade. Necesito que lo implementes en la web y lo lleves hasta producción con evidencia, sin tocar Android.
>
> Contexto que ya revisé:
> - `packages/frontend/src/pages/ShareAppPage.tsx` hoy no persiste la contraseña. “Abrir chat” y “Copiar mensaje” solo usan el estado local; la contraseña únicamente entra al mensaje.
> - El backend ya tiene `PATCH /api/admin/users/:id` con `password` opcional, `adminGuard`, bcrypt, auditoría y revocación de sesiones. No quiero un endpoint nuevo, ni cambios de OpenAPI, ni cambios Android.
> - La contraseña por defecto `123456789` no cumple la política: el backend exige 15 grafemas, máximo 72 bytes y rechaza débiles. Hay que generar una temporal válida y validar con `passwordIssue` antes de enviar.
> - `GET /api/admin/users` excluye al invitado pero incluye administradores e inactivos. El frontend no filtra por rol. Para este flujo quiero solo trabajadores activos, nunca administradores, invitados ni inactivos.
> - El fallback `/api/users/options` no devuelve rol ni username; no lo uses para credenciales. Si falla `/admin/users`, el modo existente debe fallar cerrado.
> - El QR se genera desde la vista previa y hoy no dispara ningún guardado. No debe entregar una contraseña que todavía no exista en el usuario.
> - No hay un botón literal “Enviar mensaje”: los caminos son “Abrir chat”, “Copiar mensaje” y “Compartir APK”, que además cae en copiar. Los tres deben guardar antes de continuar.
>
> Quiero este comportamiento:
> 1. En el modo “Seleccionar existente”, al elegir un trabajador activo, generá una contraseña temporal válida y editable, y mostrala en el campo visible. Nada de `123456789` ni de fallback silencioso a esa clave.
> 2. Antes de abrir WhatsApp, copiar o compartir el APK, si hay credenciales activas y un trabajador existente seleccionado, hacé `PATCH /api/admin/users/:id` con `{ password }` y esperá la respuesta. Si falla, no abras ni copies nada: mostrá un error accionable. Si tiene éxito, el mensaje y el QR deben usar exactamente esa contraseña.
> 3. Evitá repetir el PATCH si el mismo usuario y la misma contraseña ya se guardaron; si el admin edita la contraseña, marcala como pendiente otra vez.
> 4. Para “Abrir chat”, abrí una ventana en blanco de forma síncrona antes del `await` y navegá a WhatsApp recién cuando el PATCH haya terminado bien; si falla, cerrala. No quiero que el navegador bloquee el popup ni que se abra un mensaje con una clave no persistida.
> 5. El QR del modo existente debe quedar bloqueado o mostrar un aviso mientras la contraseña esté pendiente; después de guardar, puede usar el mensaje real.
> 6. La UI debe indicar “Guardando contraseña…”, “Contraseña actualizada” y los errores de red, política, permisos o usuario inexistente. Aclarhá que abrir o copiar cambia la contraseña y revoca las sesiones del trabajador.
> 7. No cambies el flujo “Crear nuevo operário” salvo lo necesario para no romperlo. Ese modo ya crea la cuenta con `quickWorkerPassword`; el nuevo comportamiento es para existentes.
> 8. Si el trabajador no está seleccionado o las credenciales están desactivadas, no debe haber PATCH.
>
> Disciplina de trabajo:
> - Creá el ODD en `odd/tasks/share-existing-worker-password.md` antes de codificar, con tareas, tests y criterios de aceptación.
> - Trabajá directo en `main`, sin ramas ni worktrees; commits atómicos de hasta 400 líneas, convención del repo, sin atribución de IA.
> - Leé `AGENTS.md` y la guía de agentes antes de editar. No toques archivos no relacionados.
> - Agregá tests frontend para: PATCH con el usuario/contraseña correctos; no PATCH en modo crear, sin credenciales o sin usuario; bloqueo si el PATCH falla; contraseña válida; filtro de trabajadores activos; QR no habilitado con contraseña pendiente. Reutilizá los tests backend existentes de reset/revocación/política.
> - Corré typecheck, tests backend y frontend, build y `make ci-clone`. Si algo falla, corregilo antes de desplegar.
> - Actualizá `CHANGELOG.md` y el ODD con hashes y evidencia.
>
> Producción:
> - Antes de desplegar, capturá una copia de recuperación de la base con el procedimiento del repo. No hay migración nueva.
> - Construí la imagen web y, si el diff lo requiere, la API; desplegá con `docker compose` y verificá `/api/health`, contenedores y la página.
> - El usuario autorizó crear **un usuario de prueba en producción** para validar, y eliminarlo después. Creá un único trabajador temporal con credenciales aleatorias y seguras, usado solo para la prueba; no crees un administrador temporal, no cambies la contraseña de un administrador real y no envíes mensajes reales por WhatsApp. Si no tenés una sesión administrativa válida para crear/eliminar el usuario, no inventes credenciales: reportá el bloqueo y pedime acceso.
> - Validá con el usuario temporal que, después del cambio, la contraseña vieja ya no sirve y la nueva sí, y que el flujo de Copiar/Abrir deja el mensaje y la base coherentes. Al terminar, eliminá el usuario temporal por la vía administrativa y verificá que ya no exista. No dejes usuarios, tokens ni contraseñas en logs, commits ni archivos del repo.
> - Verificá producción al final y dejá evidencia de los tests, build, deploy, usuario temporal creado/eliminado y cualquier limitación.
>
> Cuando termines, actualizá el ODD, hacé push a `main`, quedate idle y no cierres el panel de Herdr. Reportá hashes, comandos y evidencia concreta; si te bloqueás, reportá el punto exacto sin inventar resultados.

L2 — Lo que ya existe y no se toca. El `PATCH /api/admin/users/:id` ya valida `password` con la política Zod, hashea con
bcrypt, escribe la auditoría y revoca las sesiones del usuario; no hace falta endpoint ni contrato nuevo, y por eso
tampoco hay cambio de OpenAPI ni de Android. `passwordIssue` del frontend refleja exactamente esa política, así que
la contraseña se puede validar antes del viaje y el error de política se evita en origen.

L3 — Decisión de generación. La contraseña temporal se arma con `crypto.getRandomValues` y un prefijo estable, y se
verifica con `passwordIssue` antes de mostrarla: si por longitud o por lista débil no pasara, se regenera. No se
deriva del nombre de usuario porque eso la volvería adivinable y además podría caer en la lista débil.

L4 — Decisión sobre el popup. `window.open` se llama antes de cualquier `await`, sobre `about:blank`, y la URL de
WhatsApp se asigna después del PATCH exitoso. Si el PATCH falla, la ventana se cierra. Así el navegador ve la
apertura como parte del gesto del usuario y nunca se muestra un mensaje con una clave que la cuenta no tiene.

L5 — Fallo cerrado. Si `GET /api/admin/users` falla, el modo existente no ofrece lista y no emite PATCH: el fallback
`/api/users/options` no trae rol ni estado, así que usarlo sería adivinar quién es trabajador activo. El QR y los
botones quedan bloqueados con un aviso accionable.

L6 — Riesgo. Cambiar la contraseña de un trabajador revoca sus sesiones: es el comportamiento pedido y la UI lo dice.
El riesgo real es de orden: si se abriera WhatsApp antes del PATCH, el trabajador recibiría una clave falsa; si se
repitiera el PATCH, se revocarían sesiones sin necesidad. Las pruebas fijan las dos cosas.

L7 — Correcciones pedidas en revisión, todas del mismo día. El guard de `usersError` cerraba también el modo crear:
ahora se limita a `credentialMode === 'existing' && includeCredentials`, porque crear un operario no depende de la
lista de candidatos. La contraseña se rechaza si tiene espacios al principio o al final: el mensaje recorta y el
PATCH no, así que `Trindade-abc ` habría quedado guardada con el espacio y entregada sin él; una prueba compara el
texto del mensaje con el cuerpo del PATCH para el caso válido y otra fija el rechazo. El placeholder de ES estaba en
portugués y se corrigió. El fallback de `/users/options` ahora marca `usersError` además de guardar la lista, así el
modo existente no ofrece candidatos sin aviso.

L8 — El CI de GitHub falló por el runner, no por el cambio: `ubuntu-latest` pasó a resolver a **Ubuntu 26.04** y
Playwright 1.60 se niega a instalar Chromium ahí (`Playwright does not support chromium on ubuntu26.04-x64`), de modo
que el paso E2E moría antes de correr un test. Se fijó `runs-on: ubuntu-24.04` en los dos jobs, con el motivo escrito
en el archivo y en un commit aparte: es la misma clase de decisión deliberada que el digest de la imagen Android. El
gate local `make ci-clone` ya había pasado entero (117 E2E) sobre el mismo árbol.

L9 — Bloqueo declarado en producción. La validación con usuario temporal requiere una sesión `Administrador`; no
existe una en este host y no se creó un administrador temporal (prohibido por el pedido) ni se inventaron
credenciales. Queda pendiente de acceso: crear un único trabajador `tmp-share-*`, verificar que la contraseña vieja
deja de servir y la nueva funciona, comprobar el flujo de copiar/abrir sin enviar WhatsApp y eliminarlo por la vía
administrativa. El resto de la entrega (código, tests, backup, deploy web, verificación de salud y página) se
completó sin ese acceso.
