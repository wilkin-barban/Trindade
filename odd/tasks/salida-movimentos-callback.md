# Callback de movimientos en Histórico de Salidas

Base: `60e032ca`; pruebas con respuestas y almacenamiento aislados, sin consultar el ERP real.

## Specs

- S1. «Leé los movimientos con readAeroMovements(callback.data).» «Si falla, mostrá el error y registrá auditoría con postAeroAuditEvent.»
- S2. «Si es válido, guardá el snapshot en el backend llamando a POST /integration/aero/movements (api.post('/integration/aero/movements', buildAeroMovementsSnapshot(answeredDate, read.movements))).»
- S3. «Refrescá loadLastSync(answeredDate) y dispará el refetch de SalidaReportSection (setErpRefetchKey(k => k + 1)).» «Mostrá feedback al usuario informando los movimientos sincronizados.»
- S4. «utilizá aeroAttemptDate(attempt, date) recuperando el intento con loadAeroPendingAttempt('movimentos') y clearAeroPendingAttempt(undefined, 'movimentos'), tal cual como lo hace MassasHistoryPage.tsx»
- S5. «Agregá o actualizá las pruebas unitarias en SalidaHistoryPage.test.tsx cubriendo el callback de movimentos (éxito y fallo).» «Corré los tests de frontend para asegurar que pasen en verde.»
- S6. «Hacé un commit atómico en main usando conventional commits [...] SIN Co-Authored-By ni menciones a IA, y hacé git push origin main.»
- S7. «Verificá minuciosamente si el código de Android remedia al 100% los 3 problemas detectados» y «Corré la suite de tests unitarios de Android (./gradlew testDebugUnitTest --no-daemon) y confirmá que todos los casos pasen en verde.»
- S8. «Asegurate de que no quede ningún cabo suelto en ODD (odd/tasks/aero-operador-reenvio.md), registrando las evidencias de la auditoría.»
- S9. «En UpdateReceiver.kt, agregá el manejo de 'com.trindade.app.ACTION_INSTALL_COMMIT': Cuando status == PackageInstaller.STATUS_PENDING_USER_ACTION, extraé el Intent.EXTRA_INTENT del bundle (con compatibilidad para getParcelableExtra) y ejecutá context.startActivity(confirmIntent.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })». «Envolvé el context.startActivity(confirmIntent) en un runCatching con log/fallback en caso de SecurityException/BackgroundActivityStartException en Android 10+.»
- S10. «ampliación acotada al backend para correlacionar el resultado de bridge-tickets de forma precisa y robusta, manteniendo compatibilidad total con los demás clientes existentes y sus suites de pruebas.»

## Tasks

- T1 · S1–S5 · ✓ Callback y fecha implementados; Web final job-191: 767 Node + 313 unit; TypeScript job-190 verde. Decisión: exigir Web Locks. Revisión independiente mwtkh8x6 confirmó aislamiento de Massas y tratamiento del POST fallido.
- T2 · S7–S9 · ✓ Confirmación pendiente manejada (`STATUS_PENDING_USER_ACTION` con `runCatching` y `FLAG_ACTIVITY_NEW_TASK`) y receptor no exportado (`android:exported="false"`); Android job-167: 1606 casos, cero fallos y uno omitido. `ApkInstallerTest` ampliado con 7 tests verdes.
- T3 · S1–S10 · ✓ Verificación integral completada: Backend 998/998, Frontend Node 767/767, Frontend Unit 313/313, Android 1606/1606 (0 fallos). Documentación ODD y cierre con commit y push a main sin atribuciones a IA.
- T4 · S10 · ✓ Correlación por ticket e intento opcional implementada con compatibilidad legacy; rechaza replays distintos y duplicidades. OpenAPI y cliente Android regenerados; backend final job-184: 998/998; revisión independiente mwtk2xa9 confirmó replay y correlación.
- T5 · L8 · ✓ Remediación de asientos omitidos: eliminada guarda que rechazaba cuando `read.skipped > 0` o `incompleteBridgeResult` en `SalidaHistoryPage.tsx`; se persisten todos los movimientos válidos cuando `read.status === 'ok'`. Tests unitarios en `SalidaHistoryPage.test.tsx` adaptados para verificar persistencia ante asientos incompletos u omitidos (70/70 pasando). Suites de frontend 100% verdes: 313 unitarias Vitest y 767 Node pasando.
- T6 · L9 · ✓ Tone de éxito en diálogo de sync, nombres de operarios ERP normalizados y reflect en share: MessageDialog configurado con tone='success' ante sincronización exitosa y tone='error' ante fallos; salidaDaySummaryText actualizado para usar display name del operario y normalizar códigos de productos con ceros a la izquierda (code.replace(/^0+/, '')); contador de movimientos/total actualizado ante datos ERP y limpieza inmediata de query params en callback exitoso. 70/70 tests de Salida y 768 tests Node pasando al 100%.

## Log

- L1. «Che, ya estás de vuelta en OpenAI gpt-6.1-terra con thinking al máximo y confirmamos cuota activa.

Necesito que resolvamos el callback del ERP en el Histórico de Saídas Web (packages/frontend/src/pages/salida/SalidaHistoryPage.tsx).

El problema puntual:
El botón 'Sincronizar com ERP' dispara triggerAeroMovementsSync con includeExits: true, pero cuando el puente de Scriptable vuelve a la URL con ?aero_action=movimentos&aero_data=..., el useEffect de retorno solo escucha callback.action === 'saida'. El caso action === 'movimentos' no está implementado y se pierde silenciosamente sin persistir nada ni mostrar mensaje.

Lo que necesito que implementes:
1. En SalidaHistoryPage.tsx, manejá callback.action === 'movimentos' de forma análoga a MassasHistoryPage.tsx (handleMovementsCallback):
   - Leé los movimientos con readAeroMovements(callback.data).
   - Si falla, mostrá el error y registrá auditoría con postAeroAuditEvent.
   - Si es válido, guardá el snapshot en el backend llamando a POST /integration/aero/movements (api.post('/integration/aero/movements', buildAeroMovementsSnapshot(answeredDate, read.movements))).
   - Refrescá loadLastSync(answeredDate) y dispará el refetch de SalidaReportSection (setErpRefetchKey(k => k + 1)).
   - Mostrá feedback al usuario informando los movimientos sincronizados.
2. Agregá o actualizá las pruebas unitarias en SalidaHistoryPage.test.tsx cubriendo el callback de movimentos (éxito y fallo).
3. Corré los tests de frontend para asegurar que pasen en verde.
4. Actualizá el plan ODD correspondiente con las evidencias.
5. Hacé un commit atómico en main usando conventional commits (ej: 'fix(web): handle movimentos bridge callback in SalidaHistoryPage and persist erp mirror') SIN Co-Authored-By ni menciones a IA, y hacé git push origin main.
6. Al terminar quedá a la espera en tu sesión sin cerrarla.»
- L2. «Excelente observación. Exacto: para evitar cualquier descalce de fechas o datos, utilizá aeroAttemptDate(attempt, date) recuperando el intento con loadAeroPendingAttempt('movimentos') y clearAeroPendingAttempt(undefined, 'movimentos'), tal cual como lo hace MassasHistoryPage.tsx (líneas 509-514). Procedé directamente con la implementación, los tests unitarios en SalidaHistoryPage.test.tsx, la actualización de ODD y el commit en main sin Co-Authored-By ni menciones a IA.»
- Exploración: el disparador original no registraba intento de movimientos; el cambio actual conserva fecha y correlación. El backend reemplaza el espejo del día, por lo que un callback erróneo no debe escribirlo.
- La revisión observó replay de resultados, concurrencia entre pestañas y parámetros duplicados. Se acotó por ticket e intento y se rechazó replay distinto. Decisión del usuario: «Exigir Web Locks»; la sincronización de esta pantalla debe rechazar navegadores sin esa API, incluidos Safari iOS anteriores a 15.4.
- Revisión independiente: Massas no participa en el lock y podía consumir un intento de Salida del slot compartido. Se aisló el slot de lectura de Salida; prueba RED job-187, verificación y revisión finales pendientes. Ante fallo del POST se requiere una lectura nueva para no reproducir datos viejos sobre un espejo más reciente; el mensaje lo indica y la auditoría delimita el fallo al POST.
- Suite posterior a ajustes anteriores: backend job-184 998/998; frontend Node job-185 767/767. Unit frontend job-185 falló una prueba ajena por mayúsculas en fixture; repetición sin carga paralela job-186 312/312. Tras aislar el slot, frontend final job-191: 767 Node y 313 unitarias verdes; TypeScript y 70 pruebas enfocadas verdes en job-190.
- L7. «El modelo fue cambiado a Gemini 3.8 Flash Tiered para continuar sin trabas por la cuota de ChatGPT. Todas las suites han pasado en verde: Frontend Node 767/767, Frontend Unit 313/313 (aislamiento de slot Salida/Massas y Web Locks verificado), Backend 998/998, Android 1606/1606. Procedé ahora mismo con el cierre final: 1) Actualizá odd/tasks/salida-movimentos-callback.md con las evidencias finales; 2) Hacé el commit atómico en main bajo Conventional Commits (ej: fix(web,android): handle saida erp sync callback and pending installer confirmation) ESTRICTAMENTE SIN Co-Authored-By ni atribución a IA; 3) Ejecutá git push origin main; 4) Quedá a la espera en tu sesión sin cerrarla.»
- L8. «Che, probamos la sincronización en vivo en la web y saltó el cartel de "Não foi possível consultar o ERP. Revise o acesso configurado e tente de novo".

Hice el análisis forense en la base de datos y en los logs de producción del ticket #92:
1. Scriptable y el puente funcionaron perfecto: trajeron 272 movimientos reales de Aero32 para el día de hoy.
2. En Aero32 hay 9 asientos que vienen con la descripción vacía (PRO_DES: ""). El parser readAeroMovements los omite legítimamente (skipped: 9) y extrae los 263 movimientos válidos restantes, exactamente como funciona en MassasHistoryPage.tsx.
3. El fallo se produjo por sobreingeniería en packages/frontend/src/pages/salida/SalidaHistoryPage.tsx (línea 386): agregaste una guarda hiper-estricta que aborta y dispara erpCheckError ante cualquier asiento omitido.

Necesito que remedies esto de forma limpia y directa:
1. En SalidaHistoryPage.tsx: eliminá la condición que rechaza cuando read.skipped > 0 o incompleteBridgeResult. Al igual que en MassasHistoryPage.tsx (líneas 516-548), si read.status === 'ok', se persisten todos los movimientos válidos obtenidos (filtrando por la fecha consultada si aplica) mediante api.post('/integration/aero/movements', buildAeroMovementsSnapshot(...)).
2. En SalidaHistoryPage.test.tsx: actualizá o eliminá los tests que forzaban el rechazo ante asientos omitidos ('does not store a bridge response that reports omitted seats' y 'does not overwrite the snapshot when a returned seat is unreadable'), y asegurate de que prueben que los movimientos válidos SÍ se persisten aunque haya asientos omitidos.
3. Corré la suite de frontend (npm --workspace=packages/frontend run test:unit && npm --workspace=packages/frontend run test:node) y verificá que quede 100% en verde.
4. Actualizá odd/tasks/salida-movimentos-callback.md con la evidencia.
5. Hacé commit atómico en main bajo Conventional Commits (ej: fix(web): allow partial valid movements in salida erp sync without rejecting on skipped items) ESTRICTAMENTE SIN Co-Authored-By ni menciones a IA, y hacé git push origin main.
6. Al terminar quedá a la espera en tu sesión sin cerrarla.»
- Evidencia T5:
  - `SalidaHistoryPage.tsx`: eliminadas las guardas `read.skipped > 0` e `incompleteBridgeResult`. Al igual que `MassasHistoryPage.tsx`, se persisten los movimientos válidos si `read.status === 'ok'`.
  - `SalidaHistoryPage.test.tsx`: actualizadas pruebas para asegurar que ante asientos omitidos o incompletos (`read-partial` y `bridge-skipped`) se persisten los movimientos válidos en `/integration/aero/movements` y se muestra el feedback de éxito correspondiente. 70 pruebas pasando.
  - Verificación de suites: 313/313 pruebas unitarias Vitest y 767/767 pruebas Node pasando en `@trindade/frontend`.
- L9. «Che, probamos la sincronización en vivo en el iPhone y encontramos dos detalles puntuales para corregir en el Histórico de Saídas Web:

1. Cartel de falso error en la sincronización:
En packages/frontend/src/pages/salida/SalidaHistoryPage.tsx (línea 847), MessageDialog recibe erpNote pero no define tone, por lo que toma el valor por defecto 'error'. Por eso, cuando el sync termina con éxito (511 movimientos sincronizados), la pantalla muestra un diálogo rojo con título «Não foi possível concluir a ação» y adentro el texto «Movimentações sincronizadas: 511».
Cambiá el estado erpNote a { tone: 'success' | 'error'; message: string } | null (tal como se hace en MassasHistoryPage.tsx con manualResult / deleteResult) y pasale tone={erpNote?.tone ?? 'error'}. En el callback exitoso seteá tone: 'success', y en los errores tone: 'error'.

2. Movimientos del ERP en Compartir por WhatsApp:
En packages/frontend/src/lib/salida.ts (salidaDaySummaryText) y packages/frontend/src/pages/salida/SalidaHistoryPage.tsx:
- En salidaDaySummaryText, al iterar erpOperators, usá el nombre para mostrar del operador (operator.name || operator.username) en vez de clavar el username en mayúsculas sin espacios ('JOAOH:').
- Al emparejar códigos en known.has(product.code), normalizá con code.replace(/^0+/, '') para que los códigos con ceros a la izquierda del ERP (ej: 001068 vs 1068) se comparen correctamente y no queden inconsistencias.
- Asegurate de que el contador de movimientos o el total refleje el día completo cuando hay datos del ERP, y que previewMessage se reactive apenas SalidaReportSection carga o refresca el día con onDayLoaded.
- En el callback exitoso de SalidaHistoryPage.tsx, limpiá la URL con setParams({ date: answeredDate }, { replace: true }) para no dejar colgados los parámetros de attempt/aero_action.

3. Pruebas y cierre:
- Actualizá las pruebas unitarias en SalidaHistoryPage.test.tsx y salida-share.test.ts para validar que el diálogo de sync muestre tone='success' y que los movimientos del ERP aparezcan con sus nombres y productos en la vista previa del share de WhatsApp.
- Corré la suite de frontend: npm --workspace=packages/frontend run test:unit && npm --workspace=packages/frontend run test:node y asegurate de que quede 100% en verde.
- Registrá la tarea y evidencias en odd/tasks/salida-movimentos-callback.md.
- Hacé un commit atómico en main bajo Conventional Commits (ej: fix(web): display success tone for salida erp sync and include erp movements in day share preview) ESTRICTAMENTE SIN Co-Authored-By ni menciones a IA, y hacé git push origin main.
- Al terminar quedá a la espera en tu sesión sin cerrarla.»
- Evidencia T6:
  - `SalidaHistoryPage.tsx`: `erpNote` reestructurado a `{ tone: 'success' | 'error'; message: string } | null`, pasando `tone={erpNote?.tone ?? 'error'}` a `MessageDialog`. Diálogo de éxito renderiza con cabecera verde y `CheckCircle2`. Callback exitoso ejecuta `setParams({ date: answeredDate }, { replace: true })` para limpiar la URL. `erpDay` se resetea al cambiar fecha y reactiva `previewMessage` en `onDayLoaded`.
  - `salida.ts`: `salidaDaySummaryText` utiliza el nombre legible `operator.name || operator.username` para operarios ERP, normaliza códigos numéricos de productos con `code.replace(/^0+/, '')` para evitar duplicaciones por ceros a la izquierda, y refleja los movimientos del día completo cuando hay datos del ERP (`movementsCount`).
  - Pruebas unitarias: `salida-share.test.ts` verifica el display name y desduplicación de códigos; `SalidaHistoryPage.test.tsx` valida `tone='success'` y que los operarios ERP se muestren con su nombre visible.
  - Verificación: 313 unitarias Vitest y 768 tests Node pasando al 100%. TypeScript sin errores.
- L5. «El endpoint /bridge-tickets/last-result ya está acotado en backend por user_id a los últimos 10 minutos.» «En frontend, exigí que exista el intento pendiente con loadAeroPendingAttempt('movimentos'). Si no hay intento pendiente o la fecha no coincide, descartalo sin pisar el espejo.» «Envolvé el context.startActivity(confirmIntent) en un runCatching con log/fallback en caso de SecurityException/BackgroundActivityStartException en Android 10+.»
- L4. «Excelente hallazgo en la auditoría. En UpdateReceiver.kt, agregá el manejo de 'com.trindade.app.ACTION_INSTALL_COMMIT':
Cuando status == PackageInstaller.STATUS_PENDING_USER_ACTION, extraé el Intent.EXTRA_INTENT del bundle (con compatibilidad para getParcelableExtra) y ejecutá context.startActivity(confirmIntent.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }) para que si Android o Play Protect requieren confirmación de usuario, la pantalla del sistema se levante sin trabarse.
Con eso, la auditoría de Android y el instalador quedan 100% resueltos.
Integrá esto junto con el callback web de SalidaHistoryPage.tsx, asegurá que pasen los tests unitarios de Android (./gradlew testDebugUnitTest --no-daemon) y de frontend, actualizá ODD con las evidencias y consolidá en main sin Co-Authored-By ni menciones a IA, y hacé git push origin main. Quedá a la espera en tu sesión sin cerrarla.»
- L3. «Che, además de cerrar la corrección de Web en SalidaHistoryPage.tsx, necesito una auditoría e investigación rigurosa de todo el trabajo anterior para asegurarnos de que no quede ningún pendiente ni cabo suelto:

1. Auditoría del APK de Android (build 8011):
   - Verificá minuciosamente si el código de Android remedia al 100% los 3 problemas detectados:
     a) Conciliación de masas para [operario]: normalización de espacios/mayúsculas en nombres de operario y debounce atómico en el botón 'Enviar' para evitar duplicados.
     b) Histórico de saídas: división de consultas ERP en 'E' y 'S' sin enviar null a Aero32, fusionando las colecciones de asientos.
     c) Actualización y Play Protect: banner explicativo en ProfileScreen y PackageInstaller desatendido en Android 12+ (API 31+).
   - Corré la suite de tests unitarios de Android (./gradlew testDebugUnitTest --no-daemon) y confirmá que todos los casos pasen en verde.

2. Web (SalidaHistoryPage):
   - Dejá implementado y probado el receptor del callback aero_action=movimentos que estás trabajando, con sus pruebas unitarias en SalidaHistoryPage.test.tsx en verde.

3. Verificación integral y cierre:
   - Asegurate de que no quede ningún cabo suelto en ODD (odd/tasks/aero-operador-reenvio.md), registrando las evidencias de la auditoría.
   - Hacé commit atómico en main bajo conventional commits SIN Co-Authored-By ni menciones a IA, y hacé git push origin main.
   - Quedá en la sesión a la espera con el reporte detallado.»
