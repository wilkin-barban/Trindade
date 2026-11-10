import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAeroCallback } from './aero-integration.js';
import type { StorageLike } from './aero-integration.js';
import { clearAeroPendingAttempt, loadAeroPendingAttempt, saveAeroPendingAttempt } from './aero-pending-attempt.js';
import { readAeroQueue, writeAeroQueue, type AeroQueue } from './aero-queue.js';
import { AERO_BRIDGE_MARK_KEY, clearAeroBridgePending, markAeroBridgePending } from './aero-watchdog.js';

/**
 * What the page owes the operator when the phone comes back without the ERP.
 *
 * The script cannot reach the plant -- the iPhone is out of the factory Wi-Fi or the ERP is down -- and
 * answers with `aero_error` instead of the ERP's reply. From the screen's side that is a round trip that
 * carried nothing: no seat was written, so nothing may be marked as sent and no queued product may be
 * dropped. What must go is the trip's paperwork: the attempt and the watchdog mark, because a pull to
 * refresh in the factory must not replay an error over work that is still pending.
 *
 * The page cannot be mounted here -- it drags `import.meta.env` in through the API client -- so this walks
 * the same storage helpers the error branch of `MassasLaunchPage` calls, in the same order.
 */

class FakeStorage implements StorageLike {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const DATE = '2026-11-03';

const queue: AeroQueue = {
  createdAt: new Date().toISOString(),
  date: DATE,
  items: [
    { productCode: '001192', productName: 'MASSA TRADICIONAL 500G', quantity: 90, operatorName: 'WILKIN' },
    { productCode: '001193', productName: 'MASSA CASEIRA 500G', quantity: 60 },
  ],
  inFlight: [],
};

/** The callback the script builds when the first POST to the plant fails by network or timeout. */
const ERROR_CALLBACK =
  '?aero_action=entrada' +
  '&aero_data=%7B%22codigo%22%3A0%7D' +
  '&aero_error=wifi_required' +
  '&aero_msg=No%20se%20pudo%20alcanzar%20el%20ERP';

describe('the network-error callback: a trip that carried nothing', () => {
  it('is read as an error before it is read as a bridge answer', () => {
    const parsed = parseAeroCallback(ERROR_CALLBACK);

    assert.equal(parsed?.kind, 'error');
    if (parsed?.kind !== 'error') return;
    assert.equal(parsed.code, 'wifi_required');
    assert.equal(parsed.message, 'No se pudo alcanzar el ERP');
    // Aunque el deep link viaje con `aero_action` y `aero_data`, no hay veredicto del ERP que leer: el
    // producto no se escribió en la planta.
    assert.equal(parseAeroCallback(ERROR_CALLBACK)?.kind === 'bridge', false);
  });

  it('keeps every queued product and forgets only the trip', () => {
    const storage = new FakeStorage();
    writeAeroQueue(queue, storage);
    saveAeroPendingAttempt(
      { action: 'entrada', attemptId: 'attempt-1', startedAt: Date.now(), date: DATE },
      storage,
    );
    markAeroBridgePending({ action: 'entrada', date: DATE }, storage);

    const parsed = parseAeroCallback(ERROR_CALLBACK);
    assert.equal(parsed?.kind, 'error');

    // The error branch of the page, in the order it runs: the trip is closed, the work is not touched.
    clearAeroBridgePending(storage);
    clearAeroPendingAttempt(storage);

    const stillPending = readAeroQueue(storage);
    assert.equal(stillPending?.items.length, 2, 'un callback de error no puede borrar la cola');
    assert.deepEqual(stillPending?.items, queue.items);
    assert.equal(
      loadAeroPendingAttempt(undefined, storage),
      null,
      'un refresh no puede volver a mostrar el mismo error',
    );
    assert.equal(storage.getItem(AERO_BRIDGE_MARK_KEY), null, 'el viaje terminó: la marca también');
  });
});
