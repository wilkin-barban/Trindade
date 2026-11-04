# Contratos del WebService Aero32

Referencia de los endpoints que Trindade consume del WebService de la fábrica. El flujo operativo, la
configuración y las reglas de negocio están en [integracion-aero-masas-web.md](integracion-aero-masas-web.md).
La auditoría del ERP está en [integracion-aero32.md](integracion-aero32.md).

> Este documento se conserva con la misma ruta porque los comentarios de `packages/frontend/src/lib/aero-integration.ts`
> y su test lo citan. Si cambia un contrato, actualizar aquí y en el código que lo implementa.

## 1. Autenticación y cabeceras

Todas las llamadas usan **HTTP Basic Authentication**. No se requiere IMEI, serial ni identificador de hardware.

```http
Authorization: Basic base64(usuario:senha)
Accept: application/json
Content-Type: application/json
```

- El WebService de producción escucha en `http://192.168.25.250:1453/api`.
- Las credenciales se configuran por dispositivo y se guardan cifradas en Android. En la web, la dirección y el
  usuario viven en el `localStorage` del iPhone y la contraseña en el `sessionStorage` de la pestaña, que no
  sobrevive al cierre de sesión.
- El `CODIGO` numérico que devuelve `/usuarios` es informativo. El campo `ENT_USU` viaja con el **nombre de usuario
  en mayúsculas**, igual que en el binario Delphi.

## 2. `POST /usuarios` — autenticación y prueba de conexión

- La ruta **no lleva barra final**. Una barra provoca un `301` que convierte el `POST` en `GET` y devuelve `405`.
- Solo acepta `POST`.

```json
{
  "success": true,
  "data": {
    "CODIGO": 12,
    "SENHA": "…",
    "NOME": "WILKIN"
  }
}
```

Si las credenciales fallan, responde `success: false` o un mensaje del tipo «Senha ou usuario não conferem».

## 3. Consulta de productos

| Endpoint | Uso |
| --- | --- |
| `GET /produtoconsultaunico/{codigo}` | Consulta un producto por código |
| `GET /produtoconsulta?produto={codigo}&status=A` | Búsqueda o listado |

```json
{
  "success": true,
  "data": {
    "PRO_COD": "001192",
    "PRO_DES": "MASSA TRADICIONAL 500G"
  }
}
```

## 4. `POST /entradasitem` — entrada de producción

Registra una entrada de stock. Es el endpoint que usa el lanzamiento de masas.

```json
{
  "PRO_COD": "001192",
  "PRO_DES": "MASSA QUADRADA",
  "PRO_QTD": 1500,
  "PRO_CST": "000",
  "ENT_DTA": "2026-10-28",
  "ENT_USU": "WILKIN",
  "ENT_SER": "APL",
  "ENT_DTANOT": "2026-10-28",
  "ENT_DTMOVI": "2026-10-28",
  "ENT_OBS": "Lancamento de massas via Trindade",
  "LOTES": []
}
```

Reglas:

- `PRO_COD`: 6 dígitos con ceros a la izquierda (`001192`). Sin los ceros, el trigger de Firebird no encuentra el
  producto y aborta con `EXC_CST Favor informar a CST do Item`.
- `PRO_QTD`: entero escalado **×100** (`1500` = 15 unidades). La respuesta de consulta vuelve en unidades humanas.
- `PRO_CST`: `000` (tributada integralmente de fabricación propia), requerido por el trigger
  `ENTRADADET_BIU_SPED_VERIFICA`.
- `ENT_USU`: nombre de usuario en mayúsculas.
- `ENT_SER`: fijo en `APL`.
- `LOTES`: array vacío si no se manejan lotes.

Respuesta:

```json
{
  "success": true,
  "message": "Gravado com sucesso"
}
```

## 5. `POST /saidasitem` — baja o consumo de stock

Mismo mecanismo que `/entradasitem`, pero decrementa stock. El contrato está listo; la interfaz de Trindade para
dispararlo está pendiente.

```json
{
  "PRO_COD": "001192",
  "PRO_DES": "MASSA QUADRADA",
  "PRO_QTD": 1500,
  "PED_DTA": "2026-10-28",
  "PED_USU": "WILKIN",
  "PED_SER": "APL",
  "PED_DTANOT": "2026-10-28",
  "PED_OBS": "Saida de massas via Trindade",
  "LOTES": []
}
```

Diferencias con `/entradasitem`:

| Campo | Entrada | Salida |
| --- | --- | --- |
| Prefijo de cabecera | `ENT_*` | `PED_*` |
| Fecha de movimiento | `ENT_DTMOVI` presente | No existe `PED_DTMOVI` |
| Código de producto | 6 dígitos | 6 dígitos |
| Cantidad | ×100 | ×100 |
| Usuario | `ENT_USU` en mayúsculas | `PED_USU` en mayúsculas |
| Serie | `APL` | `APL` |
| Lotes | `[]` | `[]` |

Respuesta:

```json
{
  "success": true,
  "message": "Gravado com sucesso"
}
```

## 6. `POST /movimentoitem` — consulta de movimientos

Permite recuperar los asientos registrados en el ERP para conciliarlos con Trindade.

```json
{
  "CODFOR": null,
  "NOMUSU": "WILKIN",
  "CODPRO": "001192",
  "DTINI": "2026-10-28",
  "DTFIM": "2026-10-28",
  "ENTSAI": "E"
}
```

| Campo | Significado |
| --- | --- |
| `CODFOR` | Código de proveedor o cliente; `null` para movimientos internos |
| `NOMUSU` | Nombre de usuario en mayúsculas; `null` para todos los operarios |
| `CODPRO` | Código de producto a 6 dígitos; `null` para todos |
| `DTINI`, `DTFIM` | Rango de fechas en `YYYY-MM-DD` |
| `ENTSAI` | `"E"` entradas, `"S"` salidas, `null` ambos |

Respuesta:

```json
{
  "success": true,
  "data": [
    {
      "ENT_LAN": 10542,
      "PRO_COD": "001192",
      "PRO_DES": "MASSA TRADICIONAL 500G",
      "PRO_QTD": 90.0,
      "ENT_DTA": "2026-10-28",
      "ENT_USU": "WILKIN",
      "ENTSAI": "E"
    }
  ]
}
```

Mapeo de campos:

| Campo JSON | Significado | Formato |
| --- | --- | --- |
| `ENT_LAN` | Número de asiento del ERP | Entero |
| `PRO_COD` | Código de producto | 6 dígitos con ceros |
| `PRO_DES` | Descripción | Texto |
| `PRO_QTD` | Cantidad registrada | Unidades humanas, máscara `##0.00` |
| `ENT_DTA` | Fecha del asiento | `YYYY-MM-DD` en São Paulo |
| `ENT_USU` | Operario responsable | Mayúsculas |
| `ENTSAI` | Tipo de movimiento | `"E"` o `"S"` |

**`PRO_QTD` vuelve en unidades humanas, no escalado.** El pedido va ×100 porque Firebird necesita el entero; la
respuesta trae `90.0` para 90 unidades. Comparar contra el valor escalado produce diferencias de 100× en cualquier
conciliación.

## 7. Errores y diagnóstico

| Situación | Respuesta | Acción |
| --- | --- | --- |
| Credenciales inválidas | `success: false` o mensaje de login | Revisar usuario y contraseña en el panel |
| Método incorrecto en `/usuarios` | `405 Supported methods: POST` | Usar `POST` y quitar la barra final |
| `PRO_COD` sin ceros | Trigger `EXC_CST` | Enviar 6 dígitos |
| `PRO_CST` ausente | Trigger `ENTRADADET_BIU_SPED_VERIFICA` | Enviar `000` |
| Fecha futura en Trindade | `MASSAS_FUTURE_DATE` | Usar la fecha corriente en São Paulo |
| Base sin migrar | `503 AERO_MOVEMENTS_NOT_MIGRATED` | Ejecutar la migración de esquema |
| Cuerpo de espejo inválido | `400 INVALID_MOVEMENTS` | Revisar el contrato de `/api/integration/aero/movements` |

## 8. Notas de implementación

- El cliente web usa un atajo de iOS para alcanzar HTTP local desde HTTPS; Android llama directo desde la red de
  la planta. La explicación está en [integracion-aero-masas-web.md](integracion-aero-masas-web.md).
- La cola de lanzamientos vive en `localStorage` y sobrevive a la ida y vuelta del atajo.
- La bitácora del backend registra `requested` y `result` por intento; nunca escribe la cabecera `Authorization`.
- Los secretos no se versionan. La huella del certificado Android es pública y se documenta en
  [release-android.md](release-android.md).
