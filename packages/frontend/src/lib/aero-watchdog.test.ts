import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StorageLike } from './aero-integration';
import {
  AERO_BRIDGE_MARK_KEY,
  AERO_BRIDGE_MARK_TTL_MS,
  aeroBridgeMarkExpired,
  clearAeroBridgePending,
  markAeroBridgePending,
  readAeroBridgePending,
} from './aero-watchdog';

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

  get size(): number {
    return this.store.size;
  }
}

/** A private window or a locked profile: every call throws, and the caller must survive it. */
function throwingStorage(): StorageLike {
  const refuse = (): never => {
    throw new Error('storage is not available');
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

/** Noon on the plant's day, so a 150 s wait never crosses midnight and flips the date under the test. */
const NOW = 1_793_718_000_000;
const DATE = '2026-11-03';

describe('aero-watchdog: the mark Scriptable owes us an answer for', () => {
  it('keeps the action and the day of the launch that left the page', () => {
    const storage = new FakeStorage();
    markAeroBridgePending({ action: 'entrada', date: DATE, at: NOW }, storage);

    assert.deepEqual(readAeroBridgePending(NOW, storage), { action: 'entrada', date: DATE, at: NOW });
  });

  it('survives while the phone may still be working, and is garbage after the ttl', () => {
    const storage = new FakeStorage();
    markAeroBridgePending({ action: 'entrada_lote', date: DATE, at: NOW }, storage);

    assert.deepEqual(readAeroBridgePending(NOW + 149_000, storage), {
      action: 'entrada_lote',
      date: DATE,
      at: NOW,
    });

    // Una marca vieja es basura, no estado: leerla la borra para que no vuelva a dispararse.
    assert.equal(readAeroBridgePending(NOW + AERO_BRIDGE_MARK_TTL_MS + 1_000, storage), null);
    assert.equal(storage.size, 0);
  });

  it('never trusts a value it cannot read as a mark', () => {
    const storage = new FakeStorage();
    for (const raw of ['not json', '{}', '[]', 'null', '{"action":"entrada","date":123,"at":"x"}', '"entrada"']) {
      storage.setItem(AERO_BRIDGE_MARK_KEY, raw);
      assert.equal(readAeroBridgePending(NOW, storage), null, `${raw} must not be read as a mark`);
    }
    // Una marca escrita por otra mano tampoco es una marca.
    storage.setItem(AERO_BRIDGE_MARK_KEY, JSON.stringify({ action: 'entrada', date: DATE, at: 'now' }));
    assert.equal(readAeroBridgePending(NOW, storage), null);
  });

  it('does not fire for a mark left by another day', () => {
    const storage = new FakeStorage();
    markAeroBridgePending({ action: 'entrada', date: '2026-11-02', at: NOW }, storage);

    assert.equal(readAeroBridgePending(NOW, storage), null);
  });

  it('takes the mark away when any callback comes back', () => {
    const storage = new FakeStorage();
    markAeroBridgePending({ action: 'movimentos', date: DATE, at: NOW }, storage);
    clearAeroBridgePending(storage);

    assert.equal(readAeroBridgePending(NOW, storage), null);
    assert.equal(storage.getItem(AERO_BRIDGE_MARK_KEY), null);
  });

  it('never throws for a storage that refuses every operation', () => {
    const storage = throwingStorage();

    assert.doesNotThrow(() => markAeroBridgePending({ action: 'test', date: DATE, at: NOW }, storage));
    assert.equal(readAeroBridgePending(NOW, storage), null);
    assert.doesNotThrow(() => clearAeroBridgePending(storage));
    // Sin almacenamiento no hay marca, y eso no es un error: sólo el aviso que no se puede dar.
    assert.equal(readAeroBridgePending(NOW, null), null);
    assert.doesNotThrow(() => markAeroBridgePending({ action: 'test', date: DATE }, null));
    assert.doesNotThrow(() => clearAeroBridgePending(null));
  });

  it('answers expiry as a pure question about the age of the mark', () => {
    const mark = { action: 'entrada', date: DATE, at: NOW };

    assert.equal(aeroBridgeMarkExpired(null, NOW), false);
    assert.equal(aeroBridgeMarkExpired(mark, NOW + AERO_BRIDGE_MARK_TTL_MS), false);
    assert.equal(aeroBridgeMarkExpired(mark, NOW + AERO_BRIDGE_MARK_TTL_MS + 1), true);
    // El reloj de un teléfono puede ir hacia atrás; una marca del futuro no está vencida.
    assert.equal(aeroBridgeMarkExpired(mark, NOW - 1_000), false);
  });
});
