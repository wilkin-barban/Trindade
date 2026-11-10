import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * El cableado del error de red del puente, leído como fuente.
 *
 * Cuando el iPhone no está en la Wi-Fi de la empresa, el script vuelve con `aero_error` en vez de con la
 * respuesta del ERP. Eso es un viaje que no llevó nada: la cola tiene que quedar como estaba, el intento
 * pendiente tiene que cerrarse para que un refresh no lo repita, y el aviso tiene que decir qué revisar.
 *
 * El comportamiento puro ya está probado en `lib/aero-bridge-error-flow.test.ts` y en
 * `lib/aero-movements-sync.test.ts`; acá se verifica que las pantallas usen esas piezas, porque montarlas en
 * node arrastraría `import.meta.env` a través del cliente de la API.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const launch = read('../MassasLaunchPage.tsx');
const mirror = read('../../lib/aero-mirror.ts');
const receipts = read('../../components/reports/ReceiptsSection.tsx');
const reports = read('../ReportsPage.tsx');

/** La fuente entre dos marcadores, para que una afirmación sobre una rama no la cumpla otra. */
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `falta el marcador: ${start}`);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, `falta el marcador ${end} después de ${start}`);
  return source.slice(from, to);
}

/** Los cuatro caminos que abren Scriptable desde la pantalla de lanzamientos. */
const launchPaths = {
  triggerAeroSync: () =>
    between(launch, 'const triggerAeroSync = useCallback(', 'const handleSendPendingLaunch = useCallback('),
  handleSendPendingLaunch: () =>
    between(launch, 'const handleSendPendingLaunch = useCallback(', 'const retryFailedLaunches = useCallback('),
  retryFailedLaunches: () =>
    between(launch, 'const retryFailedLaunches = useCallback(', 'const handleSyncFromErp = async () => {'),
  handleSyncFromErp: () =>
    between(launch, 'const handleSyncFromErp = async () => {', 'const handleMovementsCallback = useCallback('),
};

describe('el aviso de error del puente', () => {
  it('muestra el mensaje de Wi-Fi/ERP y no toca la cola ni los envíos pendientes', () => {
    const branch = between(launch, "if (parsed.kind === 'error') {", "if (parsed.kind === 'test') {");

    assert.ok(branch.includes("t('massas.aero.wifiRequiredTitle')"), 'el aviso necesita su título');
    assert.ok(branch.includes("t('massas.aero.wifiRequired')"), 'y la frase que dice qué revisar');
    // El intento se cierra acá: sin esto un refresh reabriría el aviso sobre trabajo que sigue pendiente.
    assert.ok(branch.includes('clearAeroPendingAttempt()'), 'el intento pendiente tiene que cerrarse');

    // Nada del trabajo del operador se pierde por un error de red.
    for (const forbidden of ['clearAeroQueue(', 'writeAeroQueue(', 'setSyncAwaiting(null)']) {
      assert.equal(branch.includes(forbidden), false, `un error de red no puede ejecutar ${forbidden}`);
    }
    // Y no se inventa un evento de bitácora: el par `requested`/`result` existente queda como está.
    assert.equal(branch.includes('postAeroAuditEvent('), false, 'sin eventos nuevos en la bitácora');
  });

  it('olvida la marca en cualquier callback, justo donde se limpia la query', () => {
    const stripped = launch.indexOf(
      "window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)",
    );
    assert.notEqual(stripped, -1, 'el callback tiene que limpiar la query');
    const after = launch.slice(stripped, launch.indexOf('if (parsed.kind ===', stripped));
    assert.ok(after.includes('clearAeroBridgePending()'), 'cualquier respuesta termina la espera de la marca');

    // Receipts cierra el mismo viaje por el mismo motivo.
    const receiptsStripped = receipts.indexOf('window.history.replaceState');
    assert.notEqual(receiptsStripped, -1);
    assert.ok(
      receipts.slice(receiptsStripped).includes('clearAeroBridgePending()'),
      'la consulta de movimientos también limpia la marca',
    );
  });

  it('lee el watchdog en mount y en visibility, y sólo avisa cuando la marca venció', () => {
    assert.ok(launch.includes('readAeroBridgePending()'), 'la página tiene que leer la marca');
    assert.ok(launch.includes('aeroBridgeMarkExpired('), 'y preguntar si ya venció');
    assert.ok(launch.includes("t('massas.aero.scriptableNoReturn')"), 'con la frase de Scriptable sin respuesta');

    const watchdog = between(launch, 'const armBridgeWatchdog = useCallback(() => {', 'useEffect(() => {');
    // Sólo una marca vencida avisa: la fresca únicamente arma la espera que le queda.
    const expiry = watchdog.indexOf('aeroBridgeMarkExpired(mark, Date.now())');
    const warning = watchdog.indexOf('warnBridgeDidNotReturn()');
    assert.ok(expiry > 0, 'la marca se pregunta por su edad');
    assert.ok(warning > expiry, 'el aviso vive dentro de la pregunta, no antes');

    assert.ok(
      launch.includes("document.addEventListener('visibilitychange', onVisibility)"),
      'volver a la pestaña tiene que revisar la marca',
    );
    // El aviso limpia la marca y el estado de envío: la pantalla no queda «enviando» para siempre.
    const warn = between(launch, 'const warnBridgeDidNotReturn = useCallback(', 'const armBridgeWatchdog = useCallback(');
    assert.ok(warn.includes('clearAeroBridgePending()'));
    assert.ok(warn.includes('setSyncAwaiting(null)'));
  });
});

describe('los disparadores preguntan por la red antes de abrir Scriptable', () => {
  it('los cuatro caminos de la pantalla de lanzamientos usan el guardián de conexión', () => {
    for (const [name, source] of Object.entries(launchPaths)) {
      assert.ok(
        source().includes('aeroCannotReachInternet()'),
        `${name} tiene que negarse a abrir Scriptable sin internet`,
      );
    }
    // El guardián pregunta a la plataforma y dice la frase que el operario lee.
    const guard = between(launch, 'const aeroCannotReachInternet = useCallback(() => {', 'const triggerAeroSync');
    assert.ok(guard.includes('navigator.onLine === false'));
    assert.ok(guard.includes("t('massas.aero.offline')"));
  });

  it('el espejo no navega sin red y deja la marca antes de salir', () => {
    const sync = between(mirror, 'export async function triggerAeroMovementsSync(', 'function snapshotText(');
    assert.ok(sync.includes('navigator.onLine === false'));
    const offline = sync.indexOf('navigator.onLine === false');
    const ticket = sync.indexOf('requestAeroBridgeTicket(');
    assert.ok(offline > 0 && offline < ticket, 'sin red no se pide ni el ticket');
    // La marca se escribe antes de navegar, y se borra si la navegación no llegó a ocurrir.
    const mark = sync.indexOf('markAeroBridgePending(');
    const navigate = sync.indexOf('options.navigate(url)');
    assert.ok(mark > 0 && mark < navigate, 'la marca es anterior a la salida');
    assert.ok(sync.includes('clearAeroBridgePending()'), 'una salida fallida no deja marca');
  });

  it('los caminos que lanzan dejan la marca con su acción y su día', () => {
    assert.ok(
      launchPaths.triggerAeroSync().includes('markAeroBridgePending({ action, date })'),
      'la entrada y el lote marcan la acción que viajó',
    );
    assert.ok(
      launchPaths.handleSyncFromErp().includes("markAeroBridgePending({ action: 'movimentos', date })"),
      'la consulta de movimientos marca su propio viaje',
    );
    for (const [name, source] of Object.entries(launchPaths)) {
      const body = source();
      const mark = body.indexOf('markAeroBridgePending(');
      const navigate = body.indexOf('buildAeroBridgeTriggerUrl(');
      if (mark === -1) continue;
      assert.ok(mark < navigate, `${name} tiene que marcar antes de navegar`);
      assert.equal(body.indexOf('clearAeroBridgePending(') > mark, false, `${name} no limpia lo que acaba de marcar`);
    }
  });
});

describe('Receipts y el reporte leen el error sin tocar el espejo', () => {
  it('muestra el aviso, no guarda un día vacío y deja el botón libre', () => {
    const branch = between(receipts, "if (parsed.kind === 'error') {", "if (parsed.kind !== 'bridge'");

    assert.ok(branch.includes("t('massas.aero.wifiRequired')"), 'el aviso de Wi-Fi/ERP');
    assert.ok(branch.includes('clearAeroBridgePending()'), 'el viaje terminó: la marca se va');
    // Ni espejo ni día vacío: el error de red no es una lectura de la planta.
    assert.equal(branch.includes('finishSync('), false, 'un error de red no puede guardar un día vacío');
    assert.equal(branch.includes('buildAeroMovementsSnapshot'), false);
    assert.equal(branch.includes('setLoading(true)'), false, 'nada queda cargando para siempre');
    assert.ok(branch.includes('setBridgeError('), 'el error necesita un diálogo que lo diga');

    // El resto del efecto sigue leyendo el callback de movimientos como siempre.
    assert.ok(receipts.includes("parsed.kind !== 'bridge' || parsed.action !== 'movimentos'"));
    assert.ok(receipts.includes('finishSync(parsed.data)'));
  });

  it('pregunta por la red antes de pedir el ticket, en la sección y en el reporte', () => {
    assert.ok(receipts.includes('navigator.onLine === false'));
    assert.ok(receipts.includes("t('massas.aero.offline')"));
    assert.ok(reports.includes('navigator.onLine === false'));
    assert.ok(reports.includes("t('massas.aero.offline')"));
    // El reporte sigue sin guardar estado del espejo: la única copia es la del backend.
    assert.equal(reports.includes('buildAeroMovementsSnapshot'), false);
  });
});
