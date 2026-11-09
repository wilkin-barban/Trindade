# Calculadoras y módulos operativos

Trindade reúne cuatro superficies de cálculo y conteo que comparten la misma regla de negocio entre web y
Android: **Lanzamiento de Masas**, **Calculadora de Assaí**, **Calculador de Stock** e **Historial de Stock**.
La regla vive en módulos puros con pruebas propias; el catálogo y los totales los entrega el servidor, no una
copia local de cada cliente.

## 1. Lanzamiento de Masas

Ruta web: `/massas-launch`. Pantalla Android: `MassasLaunchScreen`.

- Catálogo de diez productos de masas.
- Entrada por cajas enteras, con cálculo automático de unidades.
- Resumen colectivo del día con el detalle de cada lanzamiento, su hora y su operario.
- Edición y borrado reservados al autor del lanzamiento en el día corriente; el backend aplica la misma regla
  aunque la petición llegue por fuera de la interfaz.
- Actualización pasiva cada 15 segundos mientras la pantalla está visible y no hay edición activa.
- Exportación a WhatsApp con el formato `🍝 *Lançamento de Massas — DD/MM/AAAA*`, una línea por producto y el
  pie `*Lançado por:*`. No incluye línea de total general.
- Historial en `/massas-history`, con navegación por fecha.

### Días pasados

Cuando la fecha no es hoy en `America/Sao_Paulo`:

- Se oculta la calculadora y los campos de caja.
- Se desactivan edición y borrado.
- Se suspende el polling.
- Se muestra el aviso de modo lectura y un retorno al historial.

La regla se aplica en el servidor: un día cerrado no admite altas, ediciones ni borrados, sin importar el rol.

### ERP

El reporte del día se alimenta del espejo de movimientos de Aero32 (`aero_movements`), no de
`massa_launches`. El catálogo de masas son **diez códigos** (`1045, 39, 60, 84, 91, 1192, 5000, 1047, 22,
1616`): ésos son producción y cualquier otro código del día es **Insumo**, incluidos los productos terceirizados
que la planta revende. La regla vive en `isMassa(code)` y no mira la descripción, así que un asiento descrito
«MASSA P PIZZA KIT» con un código ajeno sigue siendo insumo. El detalle está en
[integracion-aero-masas-web.md](integracion-aero-masas-web.md).

## 2. Calculadora de Assaí

Ruta web: `/assai-calculator`. Android: `AssaiCalculatorScreen`.

Regla en `packages/frontend/src/lib/assai.ts` (web) y `com.trindade.app.assai.AssaiOrder` (Android):

- Un pedido solo existe en **cajas enteras**. Una cantidad que no completa cajas se rechaza; no se redondea,
  porque redondear produciría un número que no corresponde a lo que llega al portón.
- El aviso por producto aparece **después de salir del campo** y se borra al volver a entrar para corregir.
- La exportación sale con una línea por producto y el total, sin la cantidad por caja.
- Selector opcional de día de la semana: martes, jueves, viernes o sábado. Se refleja en el encabezado
  `🛒 Pedido Assaí <Día>`.

## 3. Calculador de Stock

Ruta web: `/stock-calculator`. Android: `StockCalculatorScreen`.

- Catálogo de **25 productos** en dos secciones: Tercerizados y Masas. Llega del servidor por
  `GET /api/stock?date=YYYY-MM-DD`, que devuelve todos los productos, incluso los que están en cero.
- Las cajas se acumulan y las **unidades se recalculan a partir de ellas en cada escritura**, de modo que los
  dos números no pueden discrepar.
- Cada entrada y cada reset quedan en el registro de la fila, con el total acumulado después de cada operación.
  Un reset pone los totales en cero sin borrar lo que ya se había contado.
- Un día que no se pudo leer es **nada**, no un día vacío: mostrar cero cajas para un servidor inalcanzable
  sería mentir sobre la estantería.
- La calculadora opera siempre sobre **hoy** en São Paulo y no ofrece selector de fecha. Consultar o corregir un
  día anterior es tarea del Historial de Stock.

## 4. Historial de Stock

Ruta web: `/stock-history`. Android: `StockHistoryScreen`.

- Es una **lectura** en web y Android.
- Muestra el **Resumen Colectivo del Día** que sumó el servidor, solo con los productos contados y con las cajas
  y unidades de cada uno.
- Ofrece enviar el resumen por WhatsApp o correo.
- No tiene calculadora, campos de cantidad, botones de agregar ni de resetear: el conteo se corrige donde se
  hace.
- El calendario acepta hoy y los treinta días anteriores.
- Los `POST` de stock (`/api/stock/add-entry` y `/api/stock/reset-product`) son del Administrador; la pantalla de
  historial no los llama.

## 5. Exportaciones y destinos

- **WhatsApp:** enlace canónico `https://api.whatsapp.com/send?phone=...&text=...`, con la hoja de compartir del
  sistema y el área de transferencia como respaldo.
- **Correo del stock:** va a la dirección de la planta (`xmitrindade@hotmail.com`).
- **Marca de agua del autor:** «Desenvolvido por Wilkin Barban Rosabal» y «E-mail: wilkin.barban@gmail.com», en
  el pie de las pantallas principales. Es independiente del correo del stock.

## 6. Persistencia

- `stock_counts` guarda el conteo por fecha y producto, con `UNIQUE(count_date, product_code)`.
- Cada fila conserva el nombre y las unidades por caja **del momento en que se contó**, para que un cambio
  futuro del catálogo no reescriba una contabilidad pasada.
- `massa_launches` guarda el lanzamiento local y su vínculo con el asiento del ERP (`ent_lan`) cuando existe.
- El esquema vigente es la **revisión 10**. Las migraciones son explícitas y se ejecutan con la API detenida; ver
  [despliegue.md](despliegue.md).

## 7. Verificación en Android

```bash
# Pruebas de los módulos operativos
cd packages/android
./gradlew :app:testDebugUnitTest --tests "com.trindade.app.massas.*"
./gradlew :app:testDebugUnitTest --tests "com.trindade.app.assai.*"
./gradlew :app:testDebugUnitTest --tests "com.trindade.app.stock.*"

# APK de debug para el emulador
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

El APK de release exige `-PapiBaseUrl`, `-PversionName` y `-PversionCode`, y no tiene valores por defecto. La
firma se realiza en la lane de release con el keystore oficial; ver [release-android.md](release-android.md).
