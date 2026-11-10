import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8');

/** El esquema retirado, partido para que esta prueba no se delate como infractora del guardián del esquema. */
const RETIRED_SCHEME = ['short', 'cuts://'].join('');

const panel = read('AeroIntegrationPanel.tsx');
const launch = read('..', 'MassasLaunchPage.tsx');
const collective = read('MassasCollectiveTable.tsx');
const unified = read('MassasUnifiedTable.tsx');
const admin = read('..', 'admin', 'AdminDashboard.tsx');

describe('aero bridge wiring: the panel asks for three things and dispatches the bridge', () => {
  it('asks the operator for the address, the user and the password, and nothing else', () => {
    const fields = [...panel.matchAll(/data-testid="aero-(ws-url|ws-user|ws-pass|user-code)"/g)].map((m) => m[1]);
    assert.deepEqual(fields, ['ws-url', 'ws-user', 'ws-pass']);
    // Lo que el ERP informa en la prueba (`CODIGO`) se muestra y se registra, pero no se pide ni se guarda.
    assert.equal(panel.includes('draft.userCode'), false);
    assert.equal(panel.includes('settings.userCode'), false);
    assert.equal(panel.includes('aero-user-code'), false);
  });

  it('asks the server for a `test` ticket instead of ringing the ERP from the browser', () => {
    // El panel ya no arma sobres: pide un ticket de la acción `test` y el atajo canjea. La contraseña vive
    // cifrada en el servidor y esta página no la tiene, así que el sondeo del navegador dejó de existir.
    assert.ok(panel.includes('requestAeroBridgeTicket('));
    assert.ok(panel.includes("action: 'test'"));
    assert.ok(panel.includes('payloads: [{}]'));
    // The test comes back to the tab that asked, not to the launch page: the panel lives in Admin now, so
    // a callback aimed at /massas-launch lands on a page that cannot draw the verdict.
    assert.ok(panel.includes("aeroBridgeCallbackFor('test', `${window.location.pathname}?tab=integration`)"));
    assert.equal(panel.includes("aeroBridgeCallbackFor('test')"), false);
    assert.ok(panel.includes('buildAeroBridgeTriggerUrl({'));
    assert.ok(panel.includes('ticket: ticket.ticket'));
    assert.ok(panel.includes('ticketUrl: ticket.ticketUrl'));
    // Nada del diseño partido sobrevive en el panel.
    assert.equal(panel.includes('aeroTestShortcutTriggerUrl'), false);
    assert.equal(panel.includes('testShortcutName'), false);
  });

  it('pairs the request and the answer of each bridge trip with one attempt', () => {
    // The page leaves for the shortcut and comes back with an answer: anything held in React state is gone
    // by then, so the identifier is written down before leaving and read back on return. Without it the log
    // holds two lines about one action and no way to tell they belong together.
    assert.match(
      launch,
      /saveAeroPendingAttempt\(\{ action: 'movimentos', \.\.\.attempt, date \}\)/,
      'the movements read must remember its attempt and the day it asked for before leaving the page',
    );
    // The page returns in a fresh document: the answer is stored under the day the trip asked for, never
    // under whatever the clock says on return.
    assert.match(
      launch,
      /const answeredDate = aeroAttemptDate\(attempt, date\);/,
      'the movements answer must be filed under the day the read was armed for',
    );
    assert.match(
      launch,
      /buildAeroMovementsSnapshot\(answeredDate, read\.movements\)/,
      'the snapshot must carry the day the bridge asked for',
    );
    assert.match(
      launch,
      /loadAeroPendingAttempt\('movimentos'\)/,
      'the movements answer must close the line the page opened',
    );
    assert.match(
      launch,
      /loadAeroPendingAttempt\('entrada_lote'\)/,
      'a batch answer must close the batch line, not the movements one',
    );
    // Both lines of a pair carry `client: 'web'` and the same identifier: the first from memory, the second
    // from storage.
    assert.match(launch, /client: 'web',\s*\.\.\.attempt,/);
    assert.match(launch, /client: 'web' as const \}/);
    assert.match(launch, /\.\.\.pairing,/);
  });

  it('reads the verdict the shortcut brought back to this tab', () => {
    // The panel that asked is the one that must answer: reading the callback here is what makes the trip
    // through the shortcut end on the screen the operator left.
    assert.ok(panel.includes('parseAeroCallback(window.location.search)'));
    assert.ok(panel.includes('postAeroAuditEvent('));
    assert.ok(panel.includes('aeroTestResultEvent('));
    assert.ok(panel.includes('window.history.replaceState('));
  });

  it('opens the integration tab the shortcut came back to', () => {
    // The callback names `?tab=integration`; a page that ignores it leaves the operator on Categories with a
    // verdict nobody drew.
    assert.ok(admin.includes("new URLSearchParams(window.location.search).get('tab')"));
    assert.ok(admin.includes("window.history.replaceState("));
  });

  it('never sends the ERP request from the browser, in the panel or in the launch screen', () => {
    // S12: ningún sobre con Authorization en el cliente. El sondeo del navegador hablaba con la planta usando
    // la contraseña, y su módulo entero se fue con el cofre.
    for (const source of [panel, launch]) {
      assert.equal(source.includes('probeAeroConnection'), false);
      assert.equal(source.includes('aero-connection'), false);
      assert.equal(source.includes('basicAuthHeader'), false);
      assert.equal(/Authorization: Basic/.test(source), false);
      // Nadie lee una contraseña de la configuración ni del cofre: no existen esas propiedades.
      assert.equal(source.includes('settings.password'), false);
      assert.equal(source.includes('aeroSettings.password'), false);
      assert.equal(source.includes('vault.password'), false);
    }
    // La página de lanzamiento no tiene contraseña del ERP ni siquiera como borrador: la única que menciona
    // es la clave temporal que genera al dar de alta un operario.
    assert.equal(/draft\.password|aeroSettings\.password/.test(launch), false);
  });
});

describe('aero bridge wiring: every door opens Scriptable', () => {
  const callers = [
    { name: 'the panel', source: panel },
    { name: 'the launch page', source: launch },
    { name: 'the ERP mirror', source: read('..', '..', 'lib', 'aero-mirror.ts') },
  ];

  it('hands the ticket to the builder with no name, because the URL scheme addresses the script', () => {
    // El nombre del script es una constante de integración: si un llamador lo eligiera, un teléfono con el
    // script importado se quedaría con botones que abren Scriptable y no encuentran nada.
    for (const { name, source } of callers) {
      const calls = [...source.matchAll(/buildAeroBridgeTriggerUrl\(\{([^}]*)\}\)/g)].map((match) => match[1] ?? '');
      assert.ok(calls.length > 0, `${name} must open the bridge through the builder`);
      for (const args of calls) {
        assert.equal(/\bname:/.test(args), false, `${name} must not choose the script name`);
        assert.ok(args.includes('ticket:'), `${name} must hand over the ticket`);
        assert.ok(args.includes('ticketUrl:'), `${name} must hand over the redeem URL`);
      }
      assert.equal(source.includes(RETIRED_SCHEME), false, `${name} must not open the retired scheme`);
    }
  });

  it('opens the dialog that installs the bridge, under the name of the app that replaced the shortcut', () => {
    assert.ok(fs.existsSync(path.resolve(__dirname, 'AeroScriptableDialog.tsx')));
    assert.equal(fs.existsSync(path.resolve(__dirname, 'AeroShortcutDialog.tsx')), false);
    assert.ok(panel.includes("from './AeroScriptableDialog'"));
    assert.ok(panel.includes('<AeroScriptableDialog'));
    assert.equal(panel.includes('AeroShortcutDialog'), false);
    // El diálogo es el único lugar que copia: el panel no toca el portapapeles.
    assert.equal(panel.includes('clipboard'), false, 'the panel must not own the copy');
  });

  it('offers the App Store, the copy entry point and the instructions in the panel', () => {
    // Los tres controles del camino nuevo, y ninguno de ellos descarga un archivo ni pide armar acciones.
    assert.ok(panel.includes('AERO_SCRIPTABLE_APP_URL'));
    assert.ok(panel.includes('data-testid="aero-scriptable-app-store"'));
    // La copia la hace el diálogo: el panel sólo lo abre, así que el asset JSON ya no aparece por acá.
    assert.ok(panel.includes('data-testid="aero-scriptable-copy-open"'));
    assert.equal(panel.includes('AERO_SCRIPTABLE_ASSET_PATH'), false, 'the panel no longer links the bundle');
    assert.equal(panel.includes('data-testid="aero-scriptable-asset"'), false, 'the download control is gone');
    // El botón de instrucciones conserva su selector -- otras vistas lo consultan -- y abre el diálogo nuevo.
    assert.ok(panel.includes('data-testid="aero-shortcut-open"'));
    assert.ok(panel.includes('setScriptableOpen(true)'));
  });
});

describe('aero bridge wiring: a reconciled launch is settled', () => {
  it('never offers to edit or delete a launch the ERP already has', () => {
    // Delphi holds the seat. Changing its boxes or removing it here would leave the plant's day and the
    // company's book disagreeing, so the rule is drawn into the row instead of trusted to the operator.
    // The row carries the state now: a reconciled row is drawn without controls, and its launch is looked up
    // only to render the number and the author.
    assert.ok(collective.includes("const reconciled = row.state === 'reconciled'"));
    assert.ok(collective.includes('!reconciled'));
    // Y el listado del historial, que no tiene mitad ERP, no se vuelve de sólo lectura por esto.
    assert.ok(collective.includes('const canManage = '));
  });
});

describe('aero bridge wiring: the launch hands the bridge a full envelope', () => {
  it('signs the entry with the username in uppercase and no stored code', () => {
    assert.equal(launch.includes('userCode:'), true);
    assert.equal(launch.includes('aeroSettings.userCode'), false);
    assert.ok(launch.includes('aeroSettings.username?.trim() || user?.username?.trim() || null'));
  });

  it('asks for an `entrada` ticket with its own callback instead of building the request', () => {
    assert.ok(launch.includes('requestAeroBridgeTicket({'));
    assert.ok(launch.includes('payloads: trip.payloads'));
    assert.ok(launch.includes('callbackPath: trip.callbackPath'));
    assert.ok(launch.includes("action: trip.action"));
    // Una entrada y un lote piden callbacks distintos; el viaje que decide la acción también trae el suyo.
    assert.ok(launch.includes("singleCallbackPath: aeroBridgeCallbackFor('entrada')"));
    assert.ok(launch.includes("batchCallbackPath: aeroBridgeCallbackFor('entrada_lote')"));
    assert.ok(launch.includes('buildAeroBridgeTriggerUrl({'));
    assert.ok(launch.includes('ticket: ticket.ticket'));
    assert.equal(launch.includes('aeroShortcutTriggerUrl('), false);
    // The request body of the ERP is not assembled here any more: the server serializes it.
    assert.equal(launch.includes('buildAeroBridgeEnvelope('), false);
  });

  it('reads the ERP answer the bridge brought back instead of trusting the visit', () => {
    assert.ok(launch.includes('readAeroBridgeResult(parsed.data)'));
    assert.ok(launch.includes("parsed.kind === 'bridge'"));
    assert.ok(launch.includes("parsed.action !== 'entrada'"));
    // La rama legacy sigue viva mientras un teléfono no rehaga el atajo.
    assert.ok(launch.includes("parsed.kind !== 'sync'"));
  });
});

describe('aero bridge wiring: a launch of many products leaves once', () => {
  it('splits the queue into one ticket and keeps what does not fit waiting', () => {
    assert.ok(launch.includes('takeAeroBatch(queue, AERO_BATCH_MAX)'));
    assert.ok(launch.includes('buildAeroLaunchTrips({'));
    assert.ok(launch.includes('writeAeroQueue({ ...taken.rest, inFlight: taken.batch })'));
    // El ticket se pide antes de escribir la cola: si el servidor lo niega, nada salió y nada quedó en vuelo.
    const ticketIndex = launch.indexOf('requestAeroBridgeTicket({');
    const queueIndex = launch.indexOf('writeAeroQueue({ ...taken.rest, inFlight: taken.batch })');
    assert.ok(ticketIndex > 0 && queueIndex > ticketIndex, 'the queue is written only after the ticket arrives');
  });

  it('reads the batch answer against the products that were in the phone', () => {
    assert.ok(launch.includes("parsed.action === 'entrada_lote'"));
    assert.ok(launch.includes('readAeroBatchResult(parsed.data, expected)'));
    assert.ok(launch.includes('const sent = queue?.inFlight ?? []'));
    assert.ok(launch.includes('batchSyncFeedback(batch)'));
  });

  it('puts only the refused products back at the front of the queue', () => {
    assert.ok(launch.includes('batch.failedIndexes'));
    assert.ok(launch.includes('batch.state === \'complete\' ? [] : batch.state === \'partial\' ? failedItems : sent'));
    assert.ok(launch.includes('{ ...queue, items: [...retryItems, ...queue.items], inFlight: [] }'));
  });

  it('logs one line per trip instead of one per product', () => {
    assert.ok(launch.includes('`batch ok=${batch.ok} failed=${batch.failed} · via=bridge`'));
    assert.ok(launch.includes('`batch ${payloads.length}'));
  });

  it('closes the single-product trip instead of draining an empty queue', () => {
    // Un producto viaja por `entrada` y vuelve confirmado: la cola ya no tiene nada pendiente. Antes el
    // cierre miraba sólo `items`, que ahora está vacío porque el producto espera en `inFlight`, y el
    // operario volvía a una pantalla sin veredicto.
    assert.ok(launch.includes('const rest = { ...queue, inFlight: [] };'));
    assert.ok(launch.includes('if (rest.items.length > 0) {'));
    assert.ok(launch.includes("message: outcome.message ?? t('massas.aero.syncConfirmYes')"));
  });

  it('returns a refused single product to the queue instead of dropping it', () => {
    assert.ok(launch.includes("items: [...queue.inFlight, ...queue.items]"));
    // El rechazo queda en la bitácora como error, no como una respuesta cualquiera.
    assert.ok(launch.includes("error: outcome.status === 'error' ? outcome.message ?? 'bridge_unreadable' : null"));
  });

  it('offers the retry to the operator and never sends it by itself', () => {
    assert.ok(launch.includes('const retryFailedLaunches = useCallback'));
    assert.ok(launch.includes('onClick={retryFailedLaunches}'));
    assert.ok(launch.includes('data-testid="massa-result-retry"'));
    // El reintento sólo reencola y drena lo que el operario pidió: nada de un segundo viaje automático.
    assert.equal(launch.includes('setTimeout(() => triggerAeroSync'), false);
  });
});

describe('aero bridge wiring: the ERP mirror', () => {
  it('asks for a `movimentos` ticket, with its own callback', () => {
    assert.ok(launch.includes('aeroMovementsPayload({ date, userName: null })'));
    assert.ok(launch.includes("action: 'movimentos'"));
    assert.ok(launch.includes("aeroBridgeCallbackFor('movimentos')"));
    assert.ok(launch.includes("parsed.action === 'movimentos'"));
    // La consulta se publica como lectura del historial, no como lanzamiento.
    assert.ok(launch.includes("event: 'read_history'"));
    // La lectura automática que sigue al lanzamiento entra por el mismo camino: un solo `handleSyncFromErp`.
    assert.ok(launch.includes('consumeAeroAutoRead(date)'));
    assert.ok(launch.includes('void handleSyncFromErp()'));
  });

  it('keeps the day in Trindade, so the plant reads it without running the shortcut', () => {
    assert.ok(launch.includes("'/integration/aero/movements'"));
    assert.ok(launch.includes('/integration/aero/movements?date='));
    assert.ok(launch.includes('buildAeroMovementsSnapshot('));
    assert.ok(launch.includes('readAeroMovementsSnapshot('));
  });

  it('says the installation is not migrated instead of showing an empty day', () => {
    assert.ok(launch.includes('err.status === 503'));
    assert.ok(launch.includes("t('massas.erp.notMigrated')"));
  });

  it('imports a seat as a new local launch and never writes to the company record', () => {
    assert.match(launch, /api\.post\(\s*'\/massas-launch'/);
    // El cuerpo lleva el asiento y su operador: sin ellos el lanzamiento queda a nombre de quien apretó el
    // botón y no hay forma de conciliarlo con la tableta.
    assert.ok(launch.includes('aeroImportPayload('));
    assert.equal(/api\.(put|del)\(`\/integration\/aero/.test(launch), false);
    assert.equal(/integration\/aero\/movements`\s*,\s*\{?\s*method: 'PUT'/.test(launch), false);
  });

  it('quotes the local launch ids to the ERP so a doubtful seat can be traced back', () => {
    // El atajo manda el cuerpo tal cual: la huella viaja sin tocar la receta certificada.
    assert.ok(launch.includes('launchIds: item.launchIds'));
    assert.ok(launch.includes(".filter((launch) => launch.product_code === i.product_code)"));
    assert.ok(launch.includes('trindadeObservation(') === false);
  });

  it('shows one reconciled table instead of a local tab and an ERP tab', () => {
    // El día se lee una sola vez: las dos listas dejaban al operario eligiendo cuál creer.
    assert.equal(collective.includes('role="tablist"'), false);
    assert.equal(collective.includes('data-testid="massas-tab-erp"'), false);
    assert.equal(collective.includes('<ErpMirrorCard'), false);
    assert.ok(collective.includes('<MassasUnifiedTable'));
    // El historial no tiene espejo y no debe inventar una tabla vacía.
    assert.ok(collective.includes('unifiedRows?:'));
    assert.ok(launch.includes('massasUnifiedRows({'));
    assert.ok(launch.includes('loadAckedLaunchIds('));
  });

  it('keeps the unified table read-only and every control at the 44px touch floor', () => {
    // La tabla muestra el día; editar y borrar siguen siendo del desglose por operario.
    assert.equal(unified.includes('onDelete'), false);
    assert.equal(unified.includes('onStartEdit'), false);
    const buttons = [...unified.matchAll(/<button[\s\S]*?className="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(buttons.length > 0);
    for (const className of buttons) {
      assert.ok(className.includes('min-h-[44px]'), `a unified control lost its 44px floor: ${className}`);
    }
  });
});
