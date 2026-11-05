# Especificación de producto — Trindade Massas Operações

**Versión:** 3.1
**Estado:** vigente
**Reemplaza a:** PRD v3.0
**Última actualización:** 2026-11-05
**Implementación de referencia:** 0.7.4, build interno 7018 (Android), publicada el 2026-11-05

Esta especificación describe el producto que existe hoy: web responsive, aplicación Android nativa, integración con el ERP Aero32 y administración centralizada. Las decisiones técnicas de implementación están en [docs/arquitectura.md](../docs/arquitectura.md); los procedimientos operativos, en [docs/despliegue.md](../docs/despliegue.md) y [docs/release-android.md](../docs/release-android.md).

---

## 1. Visión y problema

La operación de Trindade Massas se reparte entre la fábrica, el patio de cargas y la administración. Antes de esta plataforma, los reportes de higiene y temperatura se escribían a mano, los horarios de carga se armaban en papel o en mensajes sueltos y el conteo de producción vivía en planillas separadas. Eso producía formatos inconsistentes, pérdida de tiempo y errores al programar fleteros.

**Visión:** una sola plataforma que registre la operación diaria con reglas explícitas, deje trazabilidad de quién hizo cada cosa y permita que la planta trabaje desde el teléfono o la tablet sin pasar por una computadora.

**Resultado esperado:** completar un reporte o un cronograma de carga en menos de dos minutos desde cualquier dispositivo, con el mismo resultado en web y Android.

---

## 2. Objetivos y métricas

| Objetivo | Métrica |
| --- | --- |
| Reducir el tiempo de elaboración de reportes y cronogramas | Menos de 2 minutos por operación |
| Eliminar formatos manuales inconsistentes | Un único formato generado por el sistema |
| Evitar errores al asignar fleteros | Validación de cupos y duplicados por horario |
| Mantener trazabilidad | Registro de autor, fecha, hora y auditoría por evento |
| Operar desde el terreno | Paridad funcional web/Android en los módulos de planta |
| Conciliar producción con la empresa | Espejo de movimientos del ERP y lanzamientos conciliados |

---

## 3. Usuarios y roles

| Rol | Puede | No puede |
| --- | --- | --- |
| **Administrador** | Gestionar usuarios, categorías, tareas, conductores, vehículos, horarios y auditoría; crear y editar reportes, cargas y lanzamientos; ver todo el histórico; configurar la integración con el ERP | Eludir las reglas de negocio ni editar un día cerrado |
| **Trabajador** | Crear reportes, cargas y lanzamientos propios; consultar históricos; agregar categorías y tareas cuando la política lo permita; copiar textos para WhatsApp | Crear o eliminar usuarios, administrar permisos, acceder a auditoría o editar registros de otros operarios |

Reglas transversales:

- La autoría de un lanzamiento de masas pertenece a quien lo creó. Editarlo o eliminarlo es potestad del autor en el día corriente; un administrador puede intervenir según la política del módulo.
- La auditoría es exclusiva del Administrador.
- Los catálogos de tareas y conductores son visibles para ambos roles; las secciones de administración restringidas solo se muestran al Administrador.

---

## 4. Alcance actual

### 4.1 Canales

| Canal | Estado | Notas |
| --- | --- | --- |
| Web responsive | Producción | Optimizada para móvil, tablet y escritorio |
| Android nativo | Producción | Kotlin + Jetpack Compose; misma API y mismas reglas |
| Integración ERP | Producción | Aero32 por WebService local y espejo de movimientos |

### 4.2 Superficies

- Panel operativo.
- Lanzamiento de masas e historial.
- Reportes: generación, detalle, edición e historial.
- Cronograma de carga, edición e historial.
- Stock: calculadora, historial y resumen colectivo.
- Calculadora de Assaí.
- Compartir app.
- Administración: usuarios, categorías, tareas, conductores, vehículos, horarios y auditoría.
- Perfil y seguridad de la cuenta.

---

## 5. Módulos y reglas de negocio

### 5.1 Panel

Muestra los indicadores del día, el cronograma activo, el acceso al lanzamiento de masas y los totales históricos. El día activo se calcula en la zona `America/Sao_Paulo` y respeta el corte operativo definido por el backend.

### 5.2 Lanzamiento de masas

- **Catálogo canónico:** sólo los diez códigos `1045, 39, 60, 84, 91, 1192, 5000, 1047, 22, 1616` son masas. Cualquier otro código del día es insumo, aunque su descripción empiece con «MASSA»; la clasificación es por código y no por nombre.
- **Carga por cajas enteras:** las unidades se calculan a partir de las cajas y del tamaño de caja del catálogo.
- **Cajas y unidades:** las cajas se calculan una sola vez por producto y operador, redondeando hacia arriba el total exacto de unidades (`182 un` de una caja de `15` son `13 cx`). Las unidades no se redondean ni se inventan. Cuando queda resto, se muestra un dato compacto —«1 caixa aberta · 5 un» / «1 caja abierta · 5 un»— y no una explicación larga.
- **Día unificado:** la tabla combina lanzamientos locales y asientos del espejo ERP, deduplicados por asiento y lanzamiento. Un operario que sólo existe en el ERP aparece en las secciones individual y colectiva, se puede filtrar por una clave estable de nombre (`operatorKey`) y suma su subtotal.
- **Asientos ERP-only:** se muestran en solo lectura. Un asiento con cajas enteras se puede importar conservando el operario del ERP; uno con unidades que no completan cajas no se importa, porque inventar la fracción produciría una caja que la planta no contó.
- **Resumen colectivo e historial:** resumen del día con desglose por producto y operario; historial cronológico por fecha.
- **Actualización pasiva:** cada 15 segundos mientras la pantalla está visible y no hay edición activa. Al reanudar la pantalla y en cada turno del polling se leen el día y el espejo juntos; una lectura vacía conserva lo ya dibujado y recargar la misma fecha no vacía el espejo.
- **Lectura automática del ERP:** después de un envío confirmado, Trindade lee el día completo una sola vez por lote o cola, sin exigir «Sincronizar com ERP». La lectura sólo corre para el día abierto, con credenciales completas y sin pisar el veredicto del envío.
- **Salida serializada:** el lote, el reintento de una fila y el drenaje de la cola comparten un único turno de despacho; el mismo lanzamiento no puede viajar dos veces. El pendiente se persiste antes de despachar, de modo que un cierre o una caída no pierde la caja que la planta todavía no registró.
- **Exportación a WhatsApp:** formato limpio, sin línea de total general; incluye a los operarios que sólo existen en el ERP y sus masas, y excluye los insumos. La lista se construye desde las filas unificadas y se deduplica por asiento y lanzamiento.
- **Días pasados en solo lectura:** no se crean, editan ni eliminan lanzamientos de fechas anteriores a hoy.
- **Conciliación con el ERP:** un lanzamiento que ya existe como asiento del ERP queda marcado como conciliado y no se edita ni se elimina desde Trindade. La conciliación se calcula comparando fecha, producto, unidades y operador; no se guarda una columna `reconciled_at`.
- **Autoría:** editar o eliminar un lanzamiento corresponde a su autor; el backend aplica la misma regla aunque la petición llegue por fuera de la interfaz. Un lanzamiento conciliado queda bloqueado para cualquier rol.

### 5.3 Reportes

- Formularios generados a partir de categorías y tareas configurables.
- Tipos de elemento: verificación (check), lista de selección, temperatura y cantidad.
- Fotos opcionales en formatos de imagen admitidos y con límite de tamaño.
- Texto final generado por el sistema y exportable a WhatsApp, TXT y PDF.
- Edición limitada a la ventana operativa; las fechas cerradas son solo lectura.
- El reporte puede incluir la tarjeta de movimientos del ERP del día, con **Masas** e **Insumos** en bloques separados, cada uno con su título, y una sola acción de sincronización.
- La clasificación de esos bloques usa el catálogo canónico de diez códigos: un producto con descripción «MASSA» pero código ajeno se muestra como insumo.
- El generador y el detalle releen el día y el espejo al reanudar la pantalla y después de sincronizar. La fecha del reporte manda, no el «hoy» del dispositivo; una lectura vacía conserva lo que ya estaba visible.
- Cada operario muestra su desglose por producto y el día cierra con el **Resumen colectivo**; `Só ERP` incluye a los operarios que sólo existen en el espejo.

### 5.4 Cronograma de carga

- Horarios configurables por el Administrador.
- Fleteros externos y conductores de la casa.
- Placa obligatoria para vehículos propios y opcional para fleteros.
- Límite indicativo de tres fleteros por horario: el sistema **no bloquea** al cuarto; lo acepta y marca el exceso para que logística decida.
- Exportación a WhatsApp en orden ascendente por horario.
- Envío directo, uno a uno, a cada fletero del lote que tenga teléfono conocido.
- Edición e historial por fecha. El borrado de un día completo del histórico es exclusivo del Administrador.

### 5.5 Stock y calculadoras

- **Calculadora de Assaí:** nueve productos; el pedido solo existe en cajas enteras y se exporta por WhatsApp con una línea por producto y el total.
- **Calculador de stock:** catálogo de veinticinco productos en dos secciones; acumulación de cajas por producto y unidades recalculadas a partir de ellas.
- **Historial de stock:** lectura de los días ya contados, con resumen colectivo, exportación y control de rol. El Trabajador lee; el Administrador corrige.
- La calculadora de stock opera siempre sobre el día corriente en São Paulo. Consultar un día pasado es tarea del historial.

### 5.6 Compartir app

- Enlaces oficiales de descarga para Android, iPhone/web o ambos.
- Credenciales de acceso visibles solo para el Administrador.
- Máscara telefónica progresiva y normalización internacional para abrir WhatsApp.
- Alta rápida de un operario desde la propia pantalla cuando el flujo lo requiere.

### 5.7 Administración y auditoría

- Usuarios: alta, aprobación, roles y protección contra la autoexclusión.
- Categorías y tareas de reportes.
- Conductores y vehículos.
- Horarios de carga.
- Auditoría paginada con filtros por acción, entidad y usuario.
- Configuración de la integración con Aero32.

### 5.8 Integración con Aero32

- El lanzamiento se guarda primero en Trindade; la empresa nunca es la única copia.
- La web usa un atajo de iOS como puente para alcanzar el WebService HTTP local de la fábrica desde una página HTTPS.
- Android llama al WebService directamente cuando está en la red de la planta.
- El snapshot de movimientos del ERP se guarda en `aero_movements` y se comparte con toda la planta.
- **Clasificación por código:** los diez códigos canónicos son masas; cualquier otro código es insumo. El espejo guarda todos los asientos y la separación Masas/Insumos se hace al leer, sin borrar ni migrar filas.
- **Conciliación derivada:** `aero_movements` es un espejo crudo. La conciliación con los lanzamientos locales se calcula al leer por fecha, producto, unidades y operador; no existe una columna persistida `reconciled_at`.
- **Lectura automática:** un lote confirmado dispara una lectura del día; la respuesta actualiza el espejo y las filas pasan a conciliadas. La lectura es una por lote o cola, sólo para hoy, con credenciales completas y sin tapar el veredicto del envío.
- **Cola y errores:** lo que no salió queda en una cola persistida con sus lanzamientos; una cola vencida o ilegible deja una línea de auditoría (`AERO_QUEUE_EXPIRED`/`AERO_QUEUE_MALFORMED`) en vez de desaparecer. El espejo distingue un fallo del backend (`AERO_SNAPSHOT_BACKEND_UNREACHABLE`) de un fallo de red.
- **Sesión:** cerrar sesión o dejar que expire elimina las credenciales del ERP y la marca de lectura pendiente; la siguiente persona no hereda una lectura que no pidió.
- La importación de un asiento conserva la identidad del operario que el ERP registró, no la de quien importa.
- Un asiento sin operario vinculado se rechaza con `MASSAS_OPERATOR_NOT_LINKED`; uno con la cuenta desactivada, con `MASSAS_OPERATOR_INACTIVE`.
- El detalle operativo está en [docs/integracion-aero-masas-web.md](../docs/integracion-aero-masas-web.md) y los contratos en [docs/registro-integracion-aero-webservice.md](../docs/registro-integracion-aero-webservice.md).

---

## 6. Idiomas y formatos

- La interfaz de usuario soporta **portugués de Brasil** y **español**, con detección automática del idioma del dispositivo o del navegador.
- La documentación del repositorio se mantiene **en español**.
- Las exportaciones para WhatsApp se generan **en portugués**, independientemente del idioma de la interfaz.
- Los nombres de productos y catálogos se conservan en portugués porque son los que usa la planta y el ERP.

---

## 7. Modelo de datos

Base SQLite con versionado atómico por `PRAGMA user_version`. La revisión vigente es la **9**, con 18 tablas agrupadas así:

| Dominio | Tablas |
| --- | --- |
| Seguridad y usuarios | `roles`, `users`, `auth_sessions` |
| Reportes | `report_categories`, `report_tasks`, `report_templates`, `reports`, `report_items`, `report_temperatures`, `report_photos` |
| Carga | `drivers`, `vehicles`, `loading_schedules` |
| Stock | `stock_counts` |
| Masas | `massa_launches` |
| Integración ERP | `aero_movements` |
| Auditoría y configuración | `audit_logs`, `settings` |

`aero_movements` conserva el snapshot crudo del ERP: fecha, asiento, producto, cantidad, operario, tipo de movimiento y hora de sincronización. No tiene una columna de conciliación; esa relación se deriva al leer.

El servidor nunca migra automáticamente al arrancar. Las migraciones son un paso explícito del operador y se ejecutan con la API detenida. El detalle está en [docs/despliegue.md](../docs/despliegue.md).

---

## 8. Requisitos no funcionales

| Requisito | Criterio |
| --- | --- |
| Rendimiento | Respuesta percibida menor a 1 segundo en operaciones normales |
| Compatibilidad web | Chrome, Edge y Safari actuales |
| Compatibilidad móvil | Android 8.0 o superior; iPhone por web |
| Seguridad | Autenticación con tokens, refresh rotativo, roles y auditoría |
| Disponibilidad | Contenedores Docker con healthcheck y reinicio automático |
| Recuperación | Copia consistente antes de cada cambio y procedimiento de rollback documentado |
| Accesibilidad | Objetivos de toque de 48 dp y contraste según Material 3 en Android |
| Idioma | Interfaz `pt-BR`/`es`; documentación en español |
| Actualización Android | Mismo `versionName` puede recibir un build interno nuevo; el detector compara `buildNumber` (`SAME_RELEASE_PATCH`) y no depende del tamaño del APK |

---

## 9. Criterios de aceptación

- [ ] Un operario puede completar un reporte y un cronograma de carga en menos de dos minutos.
- [ ] Web y Android aplican las mismas reglas de autoría, fechas y roles.
- [ ] Un día cerrado no admite altas, ediciones ni borrados desde ninguna interfaz.
- [ ] Un lanzamiento conciliado con el ERP no se puede editar ni eliminar.
- [ ] Sólo los diez códigos canónicos se cuentan como masas; cualquier otro código se muestra como insumo en Relatório.
- [ ] El resumen colectivo de masas coincide en web y Android para el mismo día, incluidos los operarios `Só ERP`.
- [ ] Las cajas se redondean una sola vez por producto/operador y la caja abierta se muestra como dato compacto.
- [ ] La exportación de WhatsApp sale en portugués, incluye operarios `Só ERP`, excluye insumos y no duplica asientos.
- [ ] Un lote confirmado dispara una lectura del ERP por lote/cola; `seats == saved` y las filas quedan conciliadas sin tocar «Sincronizar com ERP».
- [ ] La importación de un asiento ERP conserva el operario del asiento o se rechaza con el código correspondiente.
- [ ] `aero_movements` no expone una columna de conciliación persistida; la conciliación se verifica por la tabla unificada o el reporte.
- [ ] El esquema de base de datos se puede inspeccionar y migrar sin ambigüedad.
- [ ] El APK de producción se firma con el certificado oficial y se verifica antes de publicarse; un build interno nuevo puede actualizar a otro con el mismo `versionName`.

---

## 10. Fuera de alcance

- Facturación, notas fiscales y contabilidad dentro de Trindade.
- Escritura directa sobre las tablas fiscales del ERP Aero32.
- Reimplementar el protocolo móvil propietario del proveedor del ERP.
- Sincronización offline completa: la cola del atajo de iOS cubre el reintento de un lanzamiento, no la operación sin red.
- Traducción de la interfaz a idiomas distintos de portugués y español.

---

## 11. Referencias

- [docs/arquitectura.md](../docs/arquitectura.md) — mapa técnico del sistema.
- [docs/despliegue.md](../docs/despliegue.md) — despliegue, migraciones y rollback.
- [docs/release-android.md](../docs/release-android.md) — firma y publicación del APK.
- [docs/integracion-aero-masas-web.md](../docs/integracion-aero-masas-web.md) — integración operativa con Aero32.
- [docs/calculadoras.md](../docs/calculadoras.md) — reglas de Assaí y stock.
- [docs/verificacion-erp-tablet.md](../docs/verificacion-erp-tablet.md) — runbook de verificación real con la tablet y el ERP.
- [CHANGELOG.md](../CHANGELOG.md) — historial de versiones.
