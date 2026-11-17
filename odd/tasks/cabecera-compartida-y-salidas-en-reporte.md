# Salida y Masas: cabecera compartida y las salidas dentro del reporte

Segunda pasada sobre el mismo par de módulos. La cabecera de `/salida` se vuelve la de los dos lanzamientos, los
históricos abren en el día que se puede gestionar y lo que sale de la planta entra en el reporte del día, por
operario, en la pantalla y en el texto que se comparte.

## Specs

S1 — La cabecera de Salida/Baja se lleva al lanzamiento de Masas, en la vista de iPhone:

> quiero la vista de la parte de arriba del modulo Saída / Baixa, la parte de la fecha, el boton de Historico y la
> parte que dice el nombre del operador, quiero que esta parte visual se lleve al modulo Lançamento de Massas, justo en
> la vista de iphone

Comprende la línea de fecha de planta, el botón al histórico y el operador de la sesión con su etiqueta «Sesión», con
la misma forma y el mismo alto de toque que en `/salida`.

S2 — `Histórico de Saídas` abre en el día de hoy:

> en Histórico de Saídas ve directamente a la fecha de Hoy, si aun no se ha lanzado nada muestra las tarjetas vacías
> o no las muestres directamente

Decisión de implementación: no se dibujan tarjetas vacías; se muestra el estado vacío con el acceso a lanzar.

S3 — En fechas pasadas, cada tarjeta pierde su botón de compartir por WhatsApp; el botón del final, el que comparte
el día completo, se queda:

> en la vista de fechas pasadas, quita el boton compartir por whatsapp de cada tarjeta, no es necesario en fechas
> pasadas ese boton, lo dejamos en modo lectura y deja el boton de Whatsapp del final, el que manda el relatorio
> completo de todas las tarjetas

S4 — Lo que se lanza en Salida/Baja entra en el módulo Relatório, con su resumen por operario, como ya ocurre con
«Massas do dia» e «Insumos» en Movimentações do ERP, y también en el texto que se comparte por WhatsApp:

> vincular el modulo Saída / Baixa al modulo Relatorio, dejando una opcion para mostrar su resumen por operario, de
> la misma forma que ya hacemos con las opciones Massas do dia e Insumos en Movimentações do ERP, vamos a incluir lo
> lanzado en Saída / Baixa en el modulo Relatorio y en lo compartido por whatsapp del modulo Relatorio

S5 — Todo queda documentado para el desarrollo Android:

> recuerda documentar todo para cuando estemos listos para el desarrollo de la proxima release de la aplicacion
> android, asi no tendremos que estar adivinando

## Decisiones del usuario

1. **Masas pierde el selector de fecha en el lanzamiento**: se lanza siempre el día de planta y el pasado se consulta
   en el histórico.
2. **El compartir por tarjeta se quita en los dos históricos** (Salida y Masas) cuando el día es pasado; el del día
   completo queda en ambos.
3. **El bloque de Salidas del reporte usa el `report_date`** del propio reporte, igual que Masas e Insumos.
4. **Solo el resumen**, sin fotos: las fotos siguen compartiéndose desde el histórico de Salidas.
5. **El bloque se muestra en** `/reports/:id` (donde ya está Masas), en el texto compartido y en la pantalla de
   creación `/reports` como previsualización.
6. **Operarios**: nombre visible y, cuando exista cuenta, el usuario entre paréntesis; los que solo existen en el ERP
   se marcan como hace Masas.

## Tasks

- T1 → S1. Extraer la cabecera a un componente reutilizable y montarla en `/salida` y `/massas-launch`; fuera el campo
  de fecha de Masas (decisión 1); tests de ambas pantallas y del componente.
- T2 → S2. `/salida-history` abre en el día de planta; día vacío sin tarjetas, con el estado vacío y el acceso a
  lanzar.
- T3 → S3. Sin compartir por tarjeta en días pasados, en los dos históricos (decisión 2); el compartir del día queda.
- T4 → S4. Servicio, endpoint, texto del WhatsApp y componente del reporte, con el `report_date` (decisión 3), solo
  resumen (decisión 4), montado en los tres lugares (decisión 5) y con el nombre y la marca de ERP (decisión 6).
- T5 → S5. Actualizar `docs/paridad-android-web.md` con todo lo de esta pasada.
- T6 → cierre. Suites, typecheck, build, E2E completo, contrato OpenAPI y Kotlin, deploy y verificación en producción.

## Log

L1 — pedido del usuario, verbatim:

```
quiero la vista de la parte de encima modulo Saída / Baixa, la parte de la fecha, el boton de Historico y la parte
que dice el nombre del operador, quiero que esta parte visual se lleve al modulo Lançamento de Massas, justo en la
vista de iphone, me gusta como se ve el modulo Saída / Baixa, vamos a llevar esta vista al modulo Lançamento de
Massas, en Histórico de Saídas ve directamente a la fecha de Hoy, si aun no se ha lanzadso nada muestra las tarjetas
vacias o no las muestres directamente, en la vista de fechas pasadas, quita el boton compartir por whatsapp de cada
tarjeta, no es necesario en fechas pasadas ese boton, lo dejamos en modo lectura y deja el boton de Whasapp del
final, el que manda el relatorio completo de todas las targetas, otra cosa que vas hacer en esta pasada es vincular
el modulo Saída / Baixa al modulo Relatorio, dejando una opcion para mostrar su resumen por operario, de la misma
forma que ya hacemos con las opciones Massas do dia e Insumos en Movimentações do ERP, vamos a incluir lo lanzado en
Saída / Baixa en el modulo Relatorio y en lo compartido por whatsapp del modulo Relatorio, dame un resumen de las
ideas y remediaciones quew quiero para ver si las entendiste bien antes de implementar nada
```

L2 — respuestas del usuario a las seis preguntas:

```
1-si, 2-los dos, 3-el que ya usan Masas e Insumos, 4-solo el resumen, 5-en la vista del reporte (/reports/:id, donde
ya está Masas) y en el texto compartido y También en la pantalla de creación del reporte (/reports), como
previsualización mientras se carga, 6-igual que Masas marca los que solo existen en el ERP. Otra cosa, recuerda
documentar todo para cuendo estemos listos para el desarrollo de la proxima relese ded la aplicacion android, asi no
tendremos que estar adivinando, puedes comensar con estas implementaciones en la aplicacion web en la vista de
iphone
```

## Paridad Android (lo que hay que replicar de esta pasada)

- **Cabecera de los dos lanzamientos**: línea de fecha de planta (día de São Paulo, no del teléfono), botón al
  histórico y operador de la sesión con su etiqueta. En Android, el equivalente es la barra superior de cada pantalla
  de lanzamiento, con el mismo orden y los mismos destinos.
- **Sin selector de fecha**: el lanzamiento es siempre el día de planta; el pasado se consulta en el histórico. En
  Android, el selector de fecha desaparece de la pantalla de lanzamiento de Masas y de Salida.
- **Históricos abren en hoy** y dibujan el día vacío como estado vacío, no como tarjetas vacías.
- **Días pasados**: solo lectura y sin el compartir por tarjeta; el compartir del día completo sigue disponible. Aplica
  a los dos históricos.
- **Reporte**: una sección `Saídas / Baixa` por operario, alimentada por el mismo día del reporte (`report_date`), con
  productos y unidades, sin códigos, sin fotos, y con el nombre visible más el usuario entre paréntesis; los
  operarios que solo existen en el ERP se marcan como en Masas. El texto que se comparte por WhatsApp la incluye en el
  mismo orden que la web (después de Masas).
- **Dónde se ve**: la vista del reporte y la previsualización de creación, con el mismo contenido.

## Estado de ejecución (2026-11-16)

| Tarea | Estado | Commit | Evidencia |
| --- | --- | --- | --- |
| T1 — cabecera compartida en los dos lanzamientos, Masas sin selector de fecha | hecho | `32fd90ce` | `DaySessionHeader` con prefijo de test ids (`salida-*`, `massas-*`); Masas lanza el día de planta |
| T2 — `/salida-history` abre en hoy, día vacío sin tarjetas | hecho | `32fd90ce` | abre en `saoPauloToday()`, valida `?date=`, estado vacío con acceso a lanzar |
| T3 — sin compartir por tarjeta en días pasados, en los dos históricos | hecho | `32fd90ce` | `SalidaMovementCard` (`!readOnly`) y el equivalente de Masas; el compartir del día queda |
| T4 — bloque de Salidas/Baixa en el reporte | hecho | `cff68334` | `salidaReportDayView`, `GET /api/reports/day/salidas`, sección `📤 *SAÍDAS / BAIXA*` en el texto, `SalidaReportSection` en `/reports/:id` y en `/reports` |
| T5 — paridad Android actualizada | hecho | `7bf2877f` | `docs/paridad-android-web.md`, sección nueva con cabecera, sin selector, históricos y bloque del reporte |
| T6 — cierre | en curso | — | suites, build, E2E, deploy y verificación |

Números al cerrar el código: backend **969/969**, Vitest **219/219** (29 archivos), node **749/749**, typecheck limpio,
contrato OpenAPI al día y cliente Kotlin regenerado (195 archivos).
