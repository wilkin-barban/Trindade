# Salida y Masas: lanzar hacia el ERP y trabajar desde el histórico

Tercera pasada de diseño sobre los dos módulos de lanzamiento. Las dos pantallas de lanzamiento se quedan con lo que
se hace en el momento; el día vivido se gestiona desde su histórico, y el pasado se lee.

## Specs

S1 — El botón de lanzar dice cuántos productos van, como el de Masas dice cuántas cajas:

> quiero que el botón de Lançar saída del modulo Saída / Baixa muestre la cantidad de productos que se van a lanzar,
> como mismo lo muestra el mismo botón del modulo Lanzamiento de masas

Formato confirmado por el usuario: `Lanzar salida (4)` con **productos**, no unidades.

S2 — La vuelta de Scriptable aterriza en el histórico de cada módulo:

> quiero que al recresar del programa Scriptable en ves de regresar al modulo Saída / Baixa regrese al modulo de su
> historico (Histórico de Saídas)

> cambia tambien el comportamiento del boton Lançar del modulo Lançamento de Massas para que al recresar del
> Scriptable valla a su historico

S3 — Dos productos salen del catálogo de Salida/Baja y solo de ahí:

> elimines EMBALAG. NHOQUE 1kg y EMBALAG. NHOQUE 400g de la opcion Embalagens en el modulo Saída / Baixa

Confirmado: definitivo para lanzamientos nuevos, únicamente en Salida/Baja. El catálogo queda en 19 productos
(Embalagens 11, Bobinas 3, Matéria-prima 5).

S4 — El módulo de Masas adopta la forma de Salida: el lanzamiento se queda con la carga y el botón, y lo del día se
muda al histórico.

> quiero sacar las opciones Produção do dia, Lançamentos Individuais, Resumo Coletivo do Dia y Compartilhar por
> WhatsApp y colocarlas en el Histórico de Lançamento de Massas

S5 — `Produção do dia` se muda y se re-estiliza como tarjetas, para que los dos históricos se lean igual (decisión
del usuario).

S6 — La barra de lanzar queda fija en la vista de iPhone también en Masas:

> hoy el boton Lançar saída en el modulo Saída / Baixa se ve fijo en la vista de iphone, quiero eso mismo en el modulo
> Lançamento de Massas

S7 — Desaparece el interruptor de sincronización del lanzamiento: si la conexión está configurada, se lanza contra el
ERP siempre.

> elimina el boton o seleccion Sincronizar com o ERP da Empresa en el modulo Lançamento de Massas, esto no es
> necesario, ya que si la aplicacion detecta que esta configurada la conexion con ERP siempre los lanzamientos seran
> contra el ERP de la empresa

S8 — La sincronización con el ERP (lectura del espejo del día) se muda al histórico de Masas:

> tambien mueve el boton Sincronizar con ERP del modulo Lançamento de Massas hacia el modulo Histórico de Lançamento
> de Massas, ya que es aqui donde tiene sentido ese boton

S9 — Regla común de los dos históricos:

> la vista de (hoy) sera la que podamos gestionar, con las opciones de compartir por whatsapp, opciones de relanzar
> […] pero al pasar a fechas del pasado, ya hay se muestra en modo solo lectura, es solo para visualizar el historial
> de los cambios acontecidos en dias pasados

Decisiones del usuario sobre esta regla: compartir sigue disponible en el pasado (no muta nada); relanzar, editar y
fotografías se bloquean; los permisos de Masas en la vista de hoy quedan como están.

S10 — Todo lo de la web/iPhone queda documentado para la paridad con Android:

> quiero todo documentado, cada cambio que hemos hecho en la aplicacion web iphone para cuanbdo estemos ya en el
> desarrollo de la aplicacion android no olvidar cada y que quede bien la paridad entre esas dos aplicaiones

## Tasks

- T1 → S3. Catálogo de Salida sin `1473`/`1474`; contadores y tests a 19 / 11-3-5. Solo backend y sus tests.
- T2 → S1. Botón de Salida con el conteo de productos, sin paréntesis en cero.
- T3 → S2. Callback de `saida` a `/salida-history`; el diálogo del veredicto se abre en el histórico.
- T4 → S4/S5. Masas: sacar las cuatro secciones del lanzamiento y montarlas en el histórico como tarjetas.
- T5 → S6. Barra de lanzar fija (sticky) en Masas, igual que Salida.
- T6 → S7/S8. Sin interruptor de sincronización en el lanzamiento; el botón de sincronizar vive en el histórico.
- T7 → S2. Callback de `lanzamiento` a `/massas-history`.
- T8 → S9. Hoy editable / pasado solo lectura en los dos históricos.
- T9 → S10. Documento de paridad Android con todo el comportamiento de la web.
- T10 → cierre. Tests, typecheck, build, E2E, deploy y verificación en producción.

## Log

L1 — pedido del usuario, verbatim (unificado de los dos envíos, que son idénticos salvo el corte del primero):

```
vamos a remediar algunas cosas, quiero que el boton de Lançar saída del modulo Saída / Baixa, quiero que muestre la
cantidad de productos que se van a lanzar, como mismo lo muestra el mismo boton del modulo Lanzamiento de masas,
ademas quiero que al recresar del programa Scriptable en ves de regresar al modulo Saída / Baixa regrese al modulo de
su historico (Histórico de Saídas), otra cosa que quiero que hagas es que elimines EMBALAG. NHOQUE 1kg y EMBALAG.
NHOQUE 400g de la opcion Embalagens en el modulo Saída / Baixa. Otras cosas que quiero mejorar y remediar en esta
pasada es lo siguiente, me gusto como se implemento los modulos Saída / Baixa y su historico Histórico de Saídas,
quiero llevar este diseno al modulo Lançamento de Massas y su historico, Histórico de Lançamento de Massas, que vamos
hacer, quiero sacar las opciones Produção do dia, Lançamentos Individuais, Resumo Coletivo do Dia y Compartilhar por
WhatsApp y colocarlas en el Histórico de Lançamento de Massas, en los hisatoricos Histórico de Lançamento de Massas y
Histórico de Saídas la vista de (hoy) sera la que podamos gestionar, con las opciones de compartir por whatsapp,
opciones de relanzar, en fin, es la vista que podemos trabajar todos los roles de la misma forma que ya se ha
implementado, pero al pasar a fechas del pasado, ya hay se muestra en modo solo lectura, es solo para visualizar el
historial de los cambios acontecidos en dias pasados, ese sera el comportamiento de los historicos de los modulos que
vamos a trabajar ahora, documenta esto para cuando vayamos a trabajar la aplicacion android tambien desarrollar esto
en los modulos correspondientes, quiero todo documentado, cada cambio que hemos hecho en la aplicacion web iphone para
cuanbdo estemos ya en el desarrollo de la aplicacion android no olvidar cada y que quede bien la paridad entre esas
dos aplicaiones, por el momento el trabajo lo vamos y estamos desarrollando en la aplicacion web iphone, dime si
entendiste bien los cambios, remediaciones e implementaciones de esta pasada, listame la lista de cambios antes de
implementar nada para evaluar si entendiste bien la idea que quiero desarrollar ahora
```

L2 — decisiones del usuario sobre las preguntas de la lista:

```
Compartir en fechas pasadas tal y como me sugieres, Produção do dia vamos con tu propuesta: mover el contenido y
re-estilizarlo como tarjetas, para que los dos históricos se lean igual, Permisos en Masas se mantiene igual en la
vista de hoy, el Botón con cantidad: Lanzar salida (4) = productos, Confirmo productos y no unidades, Sacar los dos
nhoque del catálogo es definitivo para lanzamientos nuevos, esto es solamente en el modulo Saída / Baixa

hoy el boton Lançar saída en el modulo Saída / Baixa se ve fijo en la vista de iphone, quiero eso mismo en el modulo
Lançamento de Massas, ademas elimina el boton o seleccion Sincronizar com o ERP da Empresa en el modulo Lançamento de
Massas […] si la aplicacion detecta que esta configurada la conexion con ERP siempre los lanzamientos seran contra el
ERP de la empresa […] tambien mueve el boton Sincronizar con ERP del modulo Lançamento de Massas hacia el modulo
Histórico de Lançamento de Masas […] cambia tambien el comportamiento del boton Lançar del modulo Lançamento de
Massas para que al recresar del Scriptable valla a su historico
```

## Estado de ejecución (2026-11-16)

| Tarea | Estado | Commit | Evidencia |
| --- | --- | --- | --- |
| T1 — catálogo 19 (11/3/5) | hecho | `daef671d` | catálogo 4/4, service 19/19, rutas 69/69, backend 962/962; `1473`/`1474` rechazados con `SALIDA_UNKNOWN_PRODUCT` |
| T2 — botón con productos | hecho | `7c5678d3` | `Lanzar salida (4)`, sin paréntesis en cero; Salida 47/47 |
| T3 — callback de Salida al histórico | hecho | `7c5678d3` | `aeroBridgeCallbackFor('saida', '/salida-history')`; el diálogo del veredicto se abre allí |
| T4 — secciones de Masas al histórico, como tarjetas | hecho | `f4844564` | `MassasHistoryPage` renderiza Produção do dia, Lançamentos Individuais, Resumo Coletivo e WhatsApp; `MassasUnifiedTable` con tarjetas |
| T5 — barra fija en Masas | hecho | `f4844564` | `sticky bottom-0 … sm:static` en `MassasLaunchGrid`, con el total de cajas |
| T6 — sin interruptor de sincronización | hecho | `f4844564` | `syncEnabled` ya no se pregunta en el lanzamiento; si falta configuración, aviso con enlace |
| T7 — botón de sincronizar en el histórico | hecho | `f4844564` | `massas-sync-erp` junto al selector de día |
| T8 — callback de Masas al histórico | hecho | `f4844564` | `aeroBridgeCallbackFor('entrada'/'entrada_lote', '/massas-history')` |
| T9 — hoy gestionable / pasado solo lectura | hecho | `7c5678d3` (Salida) y `f4844564` (Masas) | `isSalidaReadOnly` y `isPastDay`; compartir se mantiene, mutaciones ocultas, nota visible |
| T10 — paridad Android documentada | hecho | `6d3bf62b` | `docs/paridad-android-web.md` (234 líneas, 34 rutas verificadas) |
| T11 — cierre | hecho | `af29dc17` + deploy | E2E **118/118 dos veces consecutivas**; deploy `api`+`web`; producción verificada |

### Integración de la entrega de Masas

El worker de Masas se expandió a siete tests de Aero/Masas y dejó cuatro errores de tipos y una aserción de
lectura de fuente desactualizada. Se cortó su alcance, se tomaron la integración y las suites en el padre, y antes de
commitear se corrigieron:

- `readAeroMovementsSnapshot(body)` — el lector recibe solo el cuerpo; el snapshot trae su fecha.
- `destinationUrl` de las tres líneas de auditoría con `?? aeroSettings.wsUrl ?? ''`, porque `aeroDestination()`
  devuelve `null` cuando no hay conexión configurada y la columna exige texto.
- `aero-bridge-wiring.test.ts`: el veredicto del puente se lee ahora en el histórico, y la rama legacy `sync` vive en
  el parser (`lib/aero-integration.ts`); la aserción apunta ahí.

### Números al cerrar el código

Backend **962/962**, Vitest **212/212** (27 archivos), node **749/749**, `tsc` sin errores.

### E2E: los specs también se mudaron

El rediseño movió el día del lanzamiento al histórico, y siete specs seguían entrando por la puerta vieja. Se
actualizaron sin cambiar lo que afirman:

- `massas-history` (commit `f4890b01`): la ventana del archivo cierra en hoy y la página abre en hoy, porque hoy es el
  día gestionable — la premisa anterior era la regla de solo lectura.
- `massas-sync-header` (`f4890b01`): sync, línea de último contacto y su ausencia en un día pasado, en el histórico.
- `erp-result-dialogs` y `massas-unified` (`f4890b01`): los callbacks aterrizan en el histórico; el día unificado se
  afirma **después** de que el test siembra sus filas, porque en el historial un día vacío no dibuja nada y antes se
  apoyaba en lo que dejaba otro spec.
- `auto-read-after-launch`, `aero-vault-new-tab`, `aero-sync-lenses` y `aero-scriptable-dialog`: pendientes en la
  corrida completa (107/118), con el mismo patrón de puerta vieja y de dependencia de restos de otros specs. Se
  atacan en una pasada dedicada.

### Cierre (2026-11-16)

- **E2E**: 118/118 en dos corridas consecutivas (`7m 26s` y `7m 43s`), después de mudar nueve specs a la puerta nueva
  sin borrar aserciones, sin reintentos y sin `skip`. Commits `f4890b01`, `af29dc17`.
- **Deploy**: `docker compose up -d --build api web`, ambas healthy; arranque en `revision 14`, integridad `ok`, 23
  tablas.
- **Producción verificada**: `/api/health` 200; `/salida`, `/salida-history`, `/massas-launch`, `/massas-history`,
  `/reports`, `/loading` 200; catálogo sin sesión 401; catálogo desplegado con **19 productos y sin ninguno de los dos
  nhoque**; CSP, HSTS, `nosniff`, `DENY`, HTML `no-cache`, asset gzip + `immutable`, API `no-store`; log escribible.
- **Bundles**: el histórico de Masas sirve `massas-history-readonly`, `massas-sync-erp` y `massas-whatsapp`; el
  lanzamiento ya no trae `aero-sync-switch`; el de Salida conserva `salida-nav-history`.

Números finales de la pasada: backend **962/962**, Vitest **212/212**, node **749/749**, typecheck y build limpios,
E2E **118/118 ×2**.
