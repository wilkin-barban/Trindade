# WhatsApp del Relatório — abreviaturas aprobadas

Pasada del 2026-11-17. Fuente de verdad: la propuesta aprobada por el dueño del producto
(`whatsapp-abbreviations-approved.md`, tabla agresiva de catálogo y tareas, versión moderada para tareas con
`Org.` / `Receb.`).

## Specs

- **S1.** Solo cambia el texto que exporta `generateWhatsAppText`
  (`packages/backend/src/modules/reports/export.service.ts`) y un helper nuevo. La UI, el catálogo, las APIs de datos
  y la ingesta del ERP no se tocan. Masas e Insumos conservan su comportamiento de datos: solo cambia cómo se
  escribe su nombre en el mensaje.
- **S2.** Reglas del mensaje, textuales de la propuesta aprobada:
  - «Nombre de producto/tarea: **≤ 20 caracteres**. Línea de producto: apuntar a **≤ 32**.»
  - «Las **cantidades no se abrevian**: se mantiene el número exacto y `un`.»
  - «Se conservan emojis, encabezados de sección, agrupación por operario y diseño.»
  - «Listas con prefijo `- ` (se quita el `   - ` actual).»
  - «Recebimento se **agrupa por operario** (como Salida): `👤 NOMBRE:` y debajo `- producto: cantidad un`; se
    quita el `(OPERADOR)` de cada línea.»
  - «Código de producto solo si la abreviatura es ambigua o el nombre se recorta.»
  - «En Recebimento se corrige localmente `PĂO` → `PÃO` (solo en el texto de WhatsApp; no en la ingesta
    compartida).»
- **S3.** Tabla de catálogo (Salida / Masas), versión agresiva aprobada:

  | Actual | Abreviatura |
  | --- | --- |
  | EMBALAG. DISCO 200g | DISCO 200g |
  | EMBALAG. DISCO 400g | DISCO 400g |
  | EMBALAG. DISCO 500g | DISCO 500g |
  | EMBALAG. LASANHA | LASANHA |
  | EMBALAG. CASEIRA | CASEIRA |
  | EMBALAG. QUADRADA | QUADRADA |
  | EMBALAG. ROLO 1kg | ROLO 1kg |
  | EMBALAG. TOKO | TOKO |
  | EMBALAG. ROLO 500g | ROLO 500g |
  | EMBALAG. ROLO 2kg | ROLO 2kg |
  | EMBALAG. TEMPERO | TEMPERO |
  | BOBINA ROLO | BOBINA ROLO |
  | BOBINA LASANHA | BOB. LASANHA |
  | BOBINA DISCO | BOB. DISCO |
  | SORBATO | SORBATO |
  | PROPIONATO | PROPIONATO |
  | MICRO SAL | MICRO SAL |
  | AÇÚCAR 5kg | AÇÚCAR 5kg |
  | GORDURA VEGETAL | GORDURA |

- **S4.** Tabla de nombres del ERP / Recebimento, versión agresiva aprobada:

  | Actual | Abreviatura |
  | --- | --- |
  | MASSA P PIZZA TRINDADE UNIT FAMILIA 200 G | FAMÍLIA 200g |
  | 320 G PĂO DE ALHO TRINDADE TRADICIONAL | PÃO ALHO 320g |
  | MASSA PARA PASTEL TRINDADE CASEIRA 1 KG | CASEIRA 1kg |
  | PĂO DE ALHO TRINDADE 400G TRADICIONAL | PÃO ALHO 400g |
  | 320 G PĂO DE ALHO TRINDADE CALABRESA | PÃO ALHO 320g CAL |
  | BATATA PALHA EXTRA FINA TRINDADE 220g | BATATA 220g |
  | MASSA P PIZZA TRINDADE BROTINHO 55 G | BROT 55g |
  | PĂO DE ALHO TRINDADE 400G CALABRESA | PÃO ALHO 400g CAL |
  | 320 G PĂO DE ALHO TRINDADE PICANTE | PÃO ALHO 320g PIC |
  | CANUDO PARA RECHEAR TRINDADE 200 G | CANUDO 200g |
  | TOKO - MASSA PARA PASTEL ROLO 1 KG | TOKO 1kg |
  | MASSA P PIZZA TRINDADE UNIT. 160G | UNIT 160g |
  | PĂO DE ALHO TRINDADE 400G PICANTE | PÃO ALHO 400g PIC |
  | QUEIJO RALADO GROSSO TRINDADE 40G | QUEIJO 40g |
  | MASSA PARA PASTEL QUADRADA 2 KG | QUADRADA 2kg |
  | SALGADINHO CHEDDAR TRINDADE 70G | SALGADINHO 70g |
  | CAIXA DE PAPELAO PEQUENA MISTA | CX PAP P |
  | CAIXA PAPELAO PEQUENA 2KG E 2K | CX PAP 2kg |
  | EMBALAGEM PLÁSTICA DISCO 400G | DISCO 400g |
  | EMBALAGEM PLÁSTICA LASANHA 50 | LASANHA |
  | NHOQUE DE BATATA TRINDADE 1 KG | NHOQUE 1kg |
  | NHOQUE DE BATATA TRINDADE 400G | NHOQUE 400g |
  | FARINHA DE TRIGO DIVERSAS | FARINHA |
  | FILME STRETCH 50 CM | FILME 50 |

- **S5.** Tabla de tareas largas, versión moderada: se conservan `Org.` y `Receb.`

  | Actual | Abreviatura |
  | --- | --- |
  | Organização da Câmara F. Principal | Câmara Principal |
  | Carregamento dos caminhões da casa | Carreg. caminhões |
  | Organização da saída dos produtos | Org. saída produtos |
  | Organização caixas usadas x itens | Org. caixas usadas |
  | Organização das caixas plásticas | Org. caixas plást. |
  | Liberação de espaço contêineres | Lib. contêineres |
  | Guardar massa nas câmaras frias | Guardar massa câm. |
  | Organização do contêiner Pizzas | Contêiner Pizzas |
  | Organização da área da farinha | Org. área farinha |
  | Recebimento de cajas de carton | Receb. caixas cartón |
  | Retirar massa dos contêineres | Retirar massa cont. |
  | Montagem de caixas Produção | Montagem caixas |
  | Organização da área do lixo | Org. área lixo |
  | Organização do pão de alho | Org. pão de alho |
  | Organização dos brinquedos | Org. brinquedos |
  | Abastecimento da produção | Abastec. produção |
  | Abastecimento de temperos | Abastec. temperos |
  | Recebimento de salgadinho | Receb. salgadinho |
  | Recebimento de propionato | Receb. propionato |
  | Recebimento de embalagem | Receb. embalagem |
  | Recebimento de brinquedo | Receb. brinquedo |
  | Recebimento de Pão alho | Receb. pão alho |
  | Separação dos romaneios | Sep. romaneios |
  | Colocação de plaquinhas | Coloc. plaquinhas |
  | Organização dos canudos | Org. canudos |
  | Organização das batatas | Org. batatas |
  | Organização do barracão | Org. barracão |
  | Organização das pizzas | Org. pizzas |
  | Recebimento de farinha | Receb. farinha |
  | Recebimento de sorbato | Receb. sorbato |

- **S6.** Fallback determinístico para nombres nuevos del ERP: mismas entradas, mismas salidas. Quita palabras de
  ruido (`MASSA`, `PARA`, `DE`, `DA`, `DO`, `EMBALAGEM`, `PLÁSTICA`, `TRINDADE`), conserva el peso/volumen, une con
  un espacio, recorta a 20 y, **si recortó o la abreviatura puede confundirse**, agrega el código del producto.
- **S7.** Recebimento corrige `PĂO` → `PÃO` solo en el texto; la ingesta y el espejo quedan como están.
- **S8.** Paridad Android (normativa): el mensaje compartido debe ser **idéntico** en web y Android — mismas
  abreviaturas, mismo orden, mismos emojis, encabezados, cantidades y agrupación. Esta tabla es la fuente de verdad
  y el fixture dorado del reporte 80 es la referencia para replicarlo. Android no se implementa en esta pasada.

## Tasks

| ID | Specs | Tarea | Commit |
| --- | --- | --- | --- |
| T1 | S1-S8 | Documento de la pasada con tablas, reglas y paridad Android | (este commit) |
| T2 | S3, S4, S6 | Helper `whatsapp-abbreviations.ts`: mapa por código de catálogo, mapa de nombres del ERP, mapa de tareas, fallback determinístico y reparación local de `PĂO` | |
| T3 | S2, S5, S7 | `generateWhatsAppText`: Recebimento agrupado por operario sin `(OPERADOR)`, tareas y productos seleccionados, Masas y Salidas con `- ` y abreviaturas; cantidades y emojis intactos | |
| T4 | S2, S3, S4, S6 | Tests del helper: cada fila de las tres tablas, cantidades intactas, límite de 20, fallback estable y código solo cuando recorta | |
| T5 | S2, S3-S7 | Golden del reporte 80 (o seed equivalente) con el texto esperado, y actualización de los tests que hoy afirman nombres completos | |
| T6 | S8 | `docs/paridad-android-web.md`: la regla y las tablas como normativa, con el golden como fixture para Android | |
| T7 | S1 | Backend, typecheck y build; deploy del API; verificación en producción con nombres largos | |
| T8 | S9 | Quitar `Conferir no ERP` del histórico de Salida: botón, handler, estado y rama del callback `movimentos`; tests y ayuda del módulo | |

## S9 — El histórico de Salida no lee el ERP

- **S9.** El módulo **Histórico de Saídas** muestra lo que el operario autenticado lanzó y **no** lee el espejo del
  ERP: se elimina el botón `Conferir no ERP`, su handler, el estado `checking`/`checkError` que solo él usaba y la
  rama del callback `movimentos` que quedaba exclusiva de ese botón. El sync del ERP vive en **un solo lugar**, el
  **Relatório** (`ReportsPage` con `triggerAeroMovementsSync` y `includeExits: true`). `Reenviar ao ERP`, el callback
  `saida`, `aero-mirror` y `requestAeroBridgeTicket` no cambian. Android replica la misma regla: su histórico de
  Saídas tampoco muestra el botón.

## Log

**L1 (pedido del humano, textual):**

> El usuario aprobó la propuesta de abreviaturas para el WhatsApp del Relatório. La fuente de verdad está en
> `/tmp/commandcode-1001/-home-wilkin-Desktop/624c5b0d-e530-4430-9a16-577beedba468/scratchpad/whatsapp-abbreviations-approved.md`;
> leelo completo antes de tocar nada. Alcance: SOLO el texto que exporta `generateWhatsAppText` en
> `packages/backend/src/modules/reports/export.service.ts` (y un helper nuevo). No toques la UI, el catálogo, las
> APIs de datos ni la ingesta del ERP; no toques Masas/Insumos. Requisitos: 1) Crear el ODD de esta pasada
> (`odd/tasks/whatsapp-abbreviations.md` o similar) con las tablas aprobadas, las reglas, tareas y la sección de
> paridad Android; commitearlo antes de implementar. 2) Implementar el helper: mapa por código para catálogo, mapa
> de tareas largas con la tabla moderada (conservando `Org.`/`Receb.`), fallback determinístico para nombres nuevos
> del ERP. Aplicarlo en Recebimento (agrupado por operario, sin `(OPERADOR)` por línea), tareas, productos
> seleccionados, Masas y Salidas. Prefijo `- `, cantidades exactas, emojis/encabezados intactos, nombre ≤20, código
> solo para ambiguos. 3) Corregir localmente `PĂO`→`PÃO` en Recebimento, solo en el texto de WhatsApp. 4) Tests:
> tabla de abreviaturas, cantidades intactas, límite de nombre, fallback y un golden del reporte 80 (o seed
> equivalente) con el texto esperado; actualizar los tests que hoy afirman nombres completos. 5) Documentar la regla
> y las tablas en `docs/paridad-android-web.md` como normativa: el mensaje de WhatsApp debe ser idéntico en web y
> Android; dejar el fixture/ejemplo golden para que Android lo replique. No implementes Android. 6) Correr backend
> tests, typecheck y build; desplegar el API (el export es backend); verificar en producción generando/exportando
> un reporte con nombres largos y comparando el texto; commitear y pushear. No cierres hasta que todo esté verde,
> desplegado y pusheado.
