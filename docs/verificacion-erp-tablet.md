# Verificación real del ERP desde la tablet

Runbook para comprobar, en la planta y con un día **abierto**, que el lanzamiento de Masas termina con una
lectura del día, que esa lectura deja el espejo completo y que las filas quedan conciliadas sin que nadie
pulse «Sincronizar com ERP».

> **Estado:** pendiente de ejecución real. Este documento se escribió desde una máquina que no alcanza
> `192.168.25.250:1453`; los pasos están listos para que los ejecute quien tenga la tablet en la LAN de la
> fábrica. Hasta que se corra, la verificación de punta a punta con el ERP real sigue abierta.

## 0. Antes de empezar

- Un día **abierto** (hoy en São Paulo), con al menos una caja pendiente de lanzar en Masas.
- La tablet con el build `0.7.2` instalado y la integración configurada: URL `http://192.168.25.250:1453/api`,
  usuario y contraseña del WebService, y el atajo `Aero32 Bridge` en la app Atajos.
- La tablet en la Wi-Fi de la planta. Sin esa red, el ERP no es alcanzable y todo lo que sigue falla con
  `AERO_NO_PLANT_WIFI` o `AERO_ERP_UNREACHABLE`.
- Acceso SSH al servidor de Trindade para leer el log y la base.

No hace falta tocar la base ni reparar nada para hacer esta prueba. Si algo falla, se anota y se corta: el
runbook no incluye acciones de reparación.

## 1. Lanzar un lote

1. Abrir **Masas** en la tablet y elegir el día de hoy.
2. Cargar **dos o más productos** con cajas pendientes (un lote, no una fila suelta).
3. Pulsar **Enviar ao ERP** una sola vez y esperar el veredicto.

Esperado: un solo diálogo de resultado, con el total del lote. Ningún aviso de «envío en curso» que se quede
pegado, ninguna caja repetida.

## 2. Confirmar que la lectura salió sola

Sin tocar «Sincronizar com ERP»:

1. Cerrar el diálogo de veredicto con **Fechar**.
2. Mirar la tarjeta del espejo ERP: debe mostrar la hora de la última lectura actualizada y el día completo.
3. Abrir **Relatórios** y comprobar que la tarjeta de movimientos ERP del día muestra los asientos recién
   lanzados, no los de ayer.

Esperado: la lectura ocurre **una vez por lote**, no una por producto, y termina después del envío. En la
tabla de Masas, las filas enviadas dejan de estar pendientes sin ninguna acción extra.

## 3. Revisar el log del servidor

```bash
ssh <servidor-trindade>
cd <ruta-del-proyecto>
jq -c 'select(.attemptId=="<attemptId-del-par>")' logs/aero-integration.log
```

Qué tiene que aparecer, en este orden:

1. `launch_sync` / `requested` / `client=android` — el lote que salió al ERP, con `launchId`.
2. `launch_sync` / `result` / `httpStatus=200` — el ERP aceptó el lote.
3. `read_history` / `requested` / `client=android` — la lectura automática, con `date=<día de hoy>`.
4. `read_history` / `result` / `httpStatus=200` / `note=… seats=N saved=N` — el ERP devolvió los asientos y el
   backend los guardó. `saved` tiene que ser igual a `seats`; si `saved=0`, el backend no guardó nada y la
   pantalla lo dice con su propio código (`AERO_SNAPSHOT_BACKEND_UNREACHABLE` o `AERO_SNAPSHOT_REFUSED`).

Un `read_history` con `error=AERO_SNAPSHOT_BACKEND_UNREACHABLE` significa que el ERP contestó y Trindade no
guardó: no es un problema de la planta y no se arregla reintentando contra el ERP. Uno con
`AERO_BACKEND_DAY_CLOSED` significa que el día ya estaba cerrado del lado de Trindade.

## 4. Comprobar el espejo en la base

```bash
sqlite3 <ruta-a-la-base> \
  "select date, count(*), sum(case when reconciled_at is not null then 1 else 0 end)
     from aero_movements where date = '<día-de-hoy>' group by date;"
```

Esperado: el día tiene los asientos que el ERP informó en `seats`, y las filas lanzadas aparecen conciliadas
(`reconciled_at` no nulo). El espejo guarda **todo** lo que el ERP devolvió —masas e insumos—; la tabla de
Masas oculta los insumos y eso no es un filtro de la base.

## 5. Qué mirar si falla

| Síntoma | Qué significa | Dónde mirar |
| --- | --- | --- |
| El diálogo no aparece o queda en «enviando» | El envío no terminó: la app espera la respuesta del ERP | `launch_sync` en el log, y la conexión de la tablet a la Wi-Fi de la planta |
| El veredicto dice error de red | La tablet no alcanza el ERP | Código `AERO_*` en el log; probar **Probar conexión** en Administración |
| El lote se envió y no hubo lectura | La marca de lectura no se consumió o el atajo no volvió | `read_history` en el log; si no hay línea, revisar que el atajo `Aero32 Bridge` esté instalado |
| `seats=N saved=0` | El ERP sí contestó; Trindade no guardó | `error` de la línea `read_history`, y estado de la API |
| Filas pendientes después de la lectura | El asiento no coincide con lo lanzado | Comparar `ent_lan` del log con el asiento del ERP; no editar la base |

## 6. Qué **no** hacer

- **No reparar el 03/11.** El día del incidente ya está cerrado; sus filas se quedan como están y la
  remediación no las reescribe. Cualquier diferencia de ese día se documenta, no se corrige a mano.
- No borrar ni editar líneas de `logs/aero-integration.log`: es la evidencia de la prueba.
- No reenviar el lote «por si acaso»: si el log muestra `launch_sync` con `httpStatus=200`, el ERP ya lo tomó y
  un segundo envío crea cajas de más.
- No cambiar la contraseña del WebService durante la prueba: la sesión de la tablet quedaría sin credencial y
  la lectura automática fallaría con `AERO_NOT_CONFIGURED`.
- No instalar el APK desde el emulador ni por `adb`: la tablet la actualiza el operador con el actualizador de
  la app.

## 7. Cómo se cierra

La prueba queda cerrada cuando los cuatro puntos anteriores se cumplen con el día de hoy: una lectura por
lote, `seats == saved`, el espejo con el día completo y las filas lanzadas conciliadas. Se anota la fecha, el
`attemptId` del par y el resultado en el historial de release.
