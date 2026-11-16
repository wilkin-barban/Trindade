# Salida/Baja: veredicto real del lote, estado de envío y vista de WhatsApp

Prueba real en la empresa del 2026-11-16: dos lanzamientos de `wilkin`. El segundo, de **cuatro productos**, quedó
escrito en el ERP de la empresa y Trindade lo mostró como fallido. Esta entrega corrige ese veredicto, separa «enviado
al ERP» de «conciliado con el asiento» y rehace la vista del módulo para que se pueda compartir y relanzar.

## Specs

S1 — Un lanzamiento multi-producto viaja como varios cuerpos en un solo ticket, y la respuesta del ERP es un arreglo
con un elemento por producto. Trindade tiene que leer ese arreglo y decir la verdad:

> en la aplicación web de Trindade me apareció que no se lanzó correctamente

Evidencia del 2026-11-16 (`logs/aero-integration.log`): `salida_create` con `{itemCount:4, totalUnits:21013}`,
`salida_sync` `requested` con `trip 1/1 · batch 4`, `salida_sync` `result` con `error: "AERO_BRIDGE_UNREADABLE"` y
`response` vacío, mientras el ERP registró los cuatro asientos.

S2 — Decisión del usuario, camino A: el envío al ERP es un estado propio, distinto de la conciliación con el asiento.

> El camino a seguir es el A […] un `salida_sync` con `result` 200 marque el movimiento como «enviado al ERP» como
> estado propio, distinto de «conciliado con el asiento» — y que el histórico distinga ambos.

S3 — La vista de WhatsApp y el botón de compartir pertenecen al histórico del módulo, no al momento del lanzamiento:

> necesito que la vista de WhatsApp aparezca en el módulo, así como el botón de compartir en WhatsApp, ahora esta
> vista aparece cuando se lanza los productos en el módulo, esto no puede ser así

S4 — La vista es análoga a la del módulo Lanzamiento de Masas, con una diferencia:

> la vista del módulo Salida/Bajas no tiene que tener filtros de trabajador, pero sí debe mostrar lo lanzado por el
> trabajador de la sección, no es necesario que muestre lo de otros trabajadores

S5 — Cada lanzamiento se rotula con su veredicto real y ofrece relanzar cuando corresponde:

> con la etiqueta Conciliado si fue un lance exitoso o Pendiente si no lo fue y con un botón para relanzar
> correctamente

S6 — Los fallos de conexión con la wifi de la empresa se manejan como en los módulos anteriores:

> además de la gestión de errores por falta de conexión con la wifi de la empresa, lo mismo que ya desarrollamos en
> módulos pasados

Restricciones vigentes: no tocar el ERP, la beta de `wilkin`, Quadrada API/Android, ni el scroll de Auditoría.

## Tasks

- T1 → S1. Leer el arreglo del lote en Salida (mismo lector que Masas), clasificar completo/parcial/fallido/ilegible,
  escribir el veredicto real en el log y no ofrecer relanzar algo que el ERP ya aceptó.
- T2 → S2. Estado «enviado al ERP» propio del movimiento, persistido y expuesto en la API, con la conciliación como
  eje separado; tests de servicio, ruta y contrato.
- T3 → S3/S4/S5. Vista del histórico del módulo: resumen del día, botón de compartir por WhatsApp, etiqueta por
  movimiento (Enviado/Conciliado/Pendiente) y acción de relanzar; el diálogo de éxito deja de ser la vista de
  compartir.
- T4 → S6. Manejo de errores de conexión (sin wifi de la empresa, host inalcanzable, ticket vencido) con el mismo
  vocabulario que los módulos anteriores.
- T5 → cierre. Tests, typecheck, build, E2E, deploy y verificación en producción.

## Log

L1 — pedido del usuario, verbatim:

```
El camino a seguir es el A, pero también tienes que antes de implementarlo volver a verificar otro lanzamiento que
hice en el módulo Salida/Baja, este último si era de vários productos, tengo que decir que verifique el lanzamiento y
fue exitoso, se acento correctamente en la ERP de la empresa, sin embargo en la aplicación web de Teindrade me
aparecido que no se lanzo correctamente, verifica y ya remedia todo, además tenemos que reparar hoy la vista y la
dinâmica de ese módulo, necesito que la vista de WhatsApp soares a en el módulo, así como el botón de compartir en
WhatsApp, ahora esta vista aparece cuando se lanza los productos en el módulo, esto no puede ser así, es una vista
similar a la que ya muestra el módulo Lanzamiento de masas, solo que la vista del módulo Salida/Bajas no tiene que
tener filtros de trabajador, pero si deve mostrar lo lansado por el trabajador de la seccion, no es necesario que
muestre lo de otros trabajadores, pero si lo lanzado y con el comportamiento correcto, es decir, con la etiqueta
Conciliado si fue un lance éxitoso o Pendiente si no lo fue y con un botón para relançar correctamente, además de la
gestion de errores por falta de conexión con la wifi de la empresa, lo mismo que ya desarrollamos en módulos passados,
necesito que investigue y remedies todo esto, agiste la UI y vista del módulo Salida/Baja, coloques lo que falta,
verifiques el flujo de trabajo, manejes los errores, etc, vamos a dejarlo lo mas funcional posible
```

L2 — verificación del lanzamiento del 2026-11-16 (read-only, producción):

- Movimiento 2: 4 ítems, 21 013 unidades, bloques embalagens + bobinas, `created_at 15:13:55Z`, operador `wilkin`.
- `salida_create` 15:13:55 → guardado local primero.
- `salida_sync` `requested` 15:13:55, `trip 1/1 · batch 4`.
- `salida_sync` `result` 15:14:02, `httpStatus: null`, `error: "AERO_BRIDGE_UNREADABLE"`, `response: ""`.
- El ERP registró los cuatro asientos (confirmado por el usuario).
- Causa: `SalidaLaunchPage` lee la respuesta con `readAeroBridgeResult` (un solo objeto) sobre el arreglo de cuatro que
  devuelve el puente, así que lo clasifica como ilegible.

## Cierre (2026-11-16)

### Causa raíz confirmada

`SalidaLaunchPage` leía la respuesta del puente con `readAeroBridgeResult` (un objeto) mientras un movimiento de
varios productos viaja como `bodies` en un solo ticket y el puente devuelve un arreglo. El veredicto salía
`unreadable`, el diálogo decía que no se lanzó, y el ERP tenía los cuatro asientos. Movimiento 2: 4 ítems,
21 013 unidades, `salida_create 15:13:55`, `salida_sync requested` con `trip 1/1 · batch 4`, `result` con
`AERO_BRIDGE_UNREADABLE`.

### Cambios

- **T1**: la página lee el arreglo con `readAeroBatchResult`, guarda cuántos cuerpos llevaba el viaje antes de
  navegar, y reporta completo/parcial/fallido/ilegible con el mensaje honesto. El veredicto se envía a
  `POST /api/salida/:id/erp-result`; la cola se limpia solo cuando el viaje terminó completo.
- **T2 — revisión 13**: `erp_status`, `erp_message`, `erp_sent_at` en `salida_movements` (tres `ALTER TABLE`
  aditivos), `POST /api/salida/:id/erp-result` bajo el guard de la beta, y `erp` en cada movimiento servido, junto a
  la conciliación y como eje separado.
- **T3**: el bloque de WhatsApp salió del diálogo de éxito y vive en el histórico (`SalidaWhatsAppShare`: teléfono
  persistido, previsualización del día, botón de WhatsApp y copia), sin filtros de trabajador, mostrando solo los
  movimientos del operador de la sesión. Cada tarjeta declara un estado primario: **Enviado ao ERP**, **Conciliado**,
  **Parcial**, **Pendente**, y ofrece relanzar solo cuando el ERP no aceptó.
- **T4**: los fallos de conexión se clasifican y se explican (sin wifi de la empresa, host inalcanzable, timeout,
  contenido mixto bloqueado, ticket vencido, respuesta ilegible).

### Datos corregidos en producción

Los dos movimientos del día quedaron con `erp_status = 'sent'` para que el histórico diga la verdad y para que el
botón de relanzar **no** ofrezca duplicar 21 013 unidades en el ERP:

| id | estado | mensaje | enviado |
|---|---|---|---|
| 1 | `sent` | `Despesa lançada com sucesso` | 2026-11-16T12:07:45.626Z |
| 2 | `sent` | Registrado no ERP; confirmado pelo operador (a resposta do lote não pôde ser lida) | 2026-11-16T15:14:02.000Z |

### Evidencia

- Backend **942/942**; frontend node **736/736**; Vitest **205/205**; typecheck y build limpios; E2E **118/118**.
- Contrato OpenAPI regenerado y cliente Kotlin regenerado (`check-android-contract-types.sh` verde).
- Producción: revisión 13, `integrity ok`, 23 tablas, movimientos e ítems intactos; backup previo
  `trindade.pre-revision13-20261116T174458Z.db` (880 KB) en el volumen y en `backups/`.
- `/api/health` 200; `/salida`, `/salida-history`, `/reports`, `/loading` 200; catálogo 401;
  `POST /api/salida/2/erp-result` sin sesión 401; CSP y HSTS presentes; asset con gzip e `immutable`; log escribible;
  el bundle servido contiene `salida-whatsapp` en el histórico y `salida.erpSent` en los estados.

## Ajustes del 2026-11-16 (segunda tanda)

Pedido del usuario tras usar el módulo en la planta:

1. **Sin botón de copiar** en el bloque «Compartilhar por WhatsApp» del histórico: la acción es enviar.
2. **Fotos (opcional) se movieron al histórico**: cada tarjeta de movimiento muestra sus miniaturas, permite borrar y
   agregar (máximo 3, 5 MB, JPEG/PNG/WebP/HEIC) contra `POST /api/salida/:id/photos` y
   `DELETE /api/salida/photos/:photoId`; con tres fotos la tarjeta lo dice. La pantalla de lanzamiento ya no pide
   fotos: la evidencia se adjunta cuando el movimiento existe.
3. **Botón de lanzamiento a su histórico**: `salida-nav-history`, 44 px, navega a `/salida-history`.
4. **Previsualización reescrita al estilo de los otros módulos**: emojis, sin códigos de producto, el operador solo
   con su nombre (sin unidades al lado), sin línea de estado y sin línea de total.

Formato resultante (verificado con el constructor real):

```text
🚛 *Salidas del día — 16/11/2026*
Movimientos: 1

👤 *WILKIN*
*📦 Embalajes*
• EMBALAG. DISCO 400g — 6000 un
*🧵 Bobinas*
• BOBINA ROLO — 13 un
```

El código del producto (`1356`, `1900`) no aparece, y hay un test que lo prohíbe explícitamente.

Evidencia: Vitest **208/208**, node **737/737**, typecheck limpio, build verde, E2E **118/118**. Deploy de `web`
(`index-BT-toTM6.js`): el bundle servido ya no contiene ningún `salida-copy*`, el histórico trae el control de fotos
y el lanzamiento trae `salida-nav-history`.
