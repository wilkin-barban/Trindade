# Design system — Trindade

Tokens extraídos del tema Compose de la app Android. Fuente única: `packages/android/app/src/main/java/com/trindade/app/ui/theme/Theme.kt`, con los literales de color en `packages/android/app/src/main/res/values/colors.xml`. La tipografía y las elevaciones son la base Material 3 (no hay `Type.kt` propio). Nada de lo que sigue fue inventado: cada valor existe en la fuente citada.

## Color

| Token | Valor | Uso |
| --- | --- | --- |
| `primary` | `#B42025` | Marca, acción principal, énfasis de selección. `colors.xml#brand_red_primary`, `ic_launcher_background` y `theme-color` del SPA |
| `onPrimary` | `#FFFFFF` | Texto/ícono sobre primario (6.6:1, AA) |
| `primaryContainer` | `#FFDAD6` | Fondo de selección suave, chips activos |
| `onPrimaryContainer` | `#410005` | Texto sobre `primaryContainer` |
| `secondary` | `#855400` | Acento cálido (dorado), etiquetas secundarias |
| `onSecondary` | `#FFFFFF` | Texto sobre `secondary` |
| `secondaryContainer` | `#FFDDB3` | Fondo de acento suave |
| `onSecondaryContainer` | `#2B1700` | Texto sobre `secondaryContainer` |
| `tertiary` | `#775653` | Tercer nivel, metadatos |
| `onTertiary` | `#FFFFFF` | Texto sobre `tertiary` |
| `tertiaryContainer` | `#FFDAD6` | Fondo terciario suave |
| `onTertiaryContainer` | `#2D1513` | Texto sobre `tertiaryContainer` |
| `error` | `#BA1A1A` | Error, validación, acción destructiva |
| `onError` | `#FFFFFF` | Texto sobre `error` |
| `errorContainer` | `#FFDAD6` | Fondo de error |
| `onErrorContainer` | `#410002` | Texto sobre `errorContainer` |
| `background` | `#FFF8F6` | Fondo de pantalla |
| `onBackground` | `#221919` | Texto principal |
| `surface` | `#FFF8F6` | Superficie base |
| `onSurface` | `#221919` | Texto sobre superficie |
| `surfaceVariant` | `#F4DDDA` | Superficie alterna (bloques internos) |
| `onSurfaceVariant` | `#534341` | Texto secundario, metadatos |
| `outline` | `#857371` | Bordes fuertes, íconos de contorno |
| `outlineVariant` | `#D8C2BF` | Divisores, bordes suaves |
| `surfaceContainer` | `#FBEBE8` | Tarjeta sobre fondo |
| `surfaceContainerHigh` | `#F5E5E2` | Tarjeta anidada |
| `surfaceContainerHighest` | `#EFE0DC` | Nivel más alto de anidado |
| `HelpAmber` | `#D97706` | Acción de ayuda (fuera del esquema M3, vive en `Theme.kt`) |
| `SuccessGreen` | `#2E7D32` | Confirmación/éxito |

## Tipografía (base Material 3)

| Estilo | Tamaño / línea | Peso | Uso |
| --- | --- | --- | --- |
| `headlineSmall` | 24 / 32 | 400 | Título de pantalla |
| `titleLarge` | 22 / 28 | 400 | Encabezado de sección grande |
| `titleMedium` | 16 / 24 | 500 | Nombre de categoría, título de tarjeta |
| `titleSmall` | 14 / 20 | 500 | Etiquetas de campo, subtítulo de tarjeta |
| `bodyLarge` | 16 / 24 | 400 | Texto de contenido |
| `bodyMedium` | 14 / 20 | 400 | Texto secundario |
| `bodySmall` | 12 / 16 | 400 | Metadatos, notas al pie |
| `labelLarge` | 14 / 20 | 500 | Texto de botón |
| `labelMedium` | 12 / 16 | 500 | Chips, insignias |

## Espaciado

Múltiplos de 4 dp usados en las pantallas de referencia: `4`, `6`, `8`, `10`, `12`, `16`, `20`, `24`. Padding de pantalla: `12 dp` horizontal en las pantallas densas (históricos y carga) y `16 dp` en las de formulario. Separación entre tarjetas de un listado: `12 dp`. Separación interna de una tarjeta: `12 dp`, con `6 dp` entre líneas de un mismo bloque.

## Radio

| Token | Valor | Uso |
| --- | --- | --- |
| `shapes.medium` | `12 dp` | Toda tarjeta (`Card`) y diálogo |
| campos y botones | base M3 (`8 dp` / pill) | Sin override |

## Elevación / sombra

Baja y constante: tarjeta `1 dp`, tarjeta elevada `3 dp`, diálogo modal `6 dp`. No se usan sombras decorativas ni bordes con degradado.

## Componentes

- **Tarjeta de registro**: `Card` con `surfaceContainer`, radio 12, padding 12, sin borde. Primera línea = identificador + estado (chips); segunda = metadatos en `bodySmall`/`onSurfaceVariant`; pie = acciones alineadas a la derecha.
- **Botón primario**: `Button` pill, `primary`, alto mínimo 48 con `defaultMinSize`, texto `labelLarge`.
- **Botón secundario**: `OutlinedButton` con `outline`, misma altura que el primario.
- **Acción destructiva**: `OutlinedButton` con `error` en texto e ícono; en filas de tabla, `IconButton` de 40 dp con ícono de papelera y `contentDescription`.
- **Chip de filtro**: `FilterChip`, alto compacto, seleccionado `secondaryContainer`/`onSecondaryContainer`.
- **Interruptor**: `Switch` M3 a la derecha del título de grupo; etiqueta a la izquierda en `titleMedium`; grupo apagado no dibuja sus opciones.
- **Pestañas**: `TabRow`/`PrimaryTabRow` dentro del diálogo, con `primary` como indicador y `titleSmall` en la etiqueta.
- **Tabla**: filas de 48 dp mínimo, columnas alineadas por pesos fijos, divisor `outlineVariant`, encabezado en `labelMedium`/`onSurfaceVariant`.
- **Diálogo**: `AlertDialog` con título `titleLarge`, cuerpo `bodyMedium`, acciones alineadas a la derecha; el modal de selección múltiple usa `Aceptar` primario y `Cancelar` secundario.
- **Campo de texto**: `OutlinedTextField` de una línea, etiqueta flotante, error con `isError` y `supportingText`.

## Estados

Vacío, cargando y error se dibujan con el mismo patrón en todas las pantallas: título en `titleMedium`, explicación en `bodySmall`, acción primaria única, centrado vertical con padding 24.
