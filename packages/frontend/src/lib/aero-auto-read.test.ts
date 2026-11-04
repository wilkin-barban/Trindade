import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AERO_AUTO_READ_KEY,
  AERO_AUTO_READ_TTL_MS,
  armAeroAutoRead,
  clearAeroAutoRead,
  consumeAeroAutoRead,
} from './aero-auto-read';

/** A storage double: the mark is only ever a string under one key. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const NOW = Date.parse('2026-11-03T12:00:00.000Z');

describe('aero auto read', () => {
  it('spends the mark once, on the closing that follows the launch', () => {
    const storage = memoryStorage();
    armAeroAutoRead('2026-11-03', storage, NOW);

    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW), true);
    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW), false);
    assert.equal(storage.data.has(AERO_AUTO_READ_KEY), false);
  });

  it('owes nothing when the launch never marked the day', () => {
    const storage = memoryStorage();
    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW), false);
  });

  it('does not spend another day’s mark on this closing', () => {
    const storage = memoryStorage();
    armAeroAutoRead('2026-11-02', storage, NOW);

    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW), false);
    // Dropped instead of kept: the day it belonged to is not on screen any more.
    assert.equal(storage.data.has(AERO_AUTO_READ_KEY), false);
  });

  it('drops a mark that outlived the shift', () => {
    const storage = memoryStorage();
    armAeroAutoRead('2026-11-03', storage, NOW - AERO_AUTO_READ_TTL_MS - 1);

    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW), false);
    assert.equal(storage.data.has(AERO_AUTO_READ_KEY), false);
  });

  it('keeps the newest launch: a second one replaces the mark instead of adding a read', () => {
    const storage = memoryStorage();
    armAeroAutoRead('2026-11-03', storage, NOW);
    armAeroAutoRead('2026-11-03', storage, NOW + 1000);

    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW + 2000), true);
    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW + 2000), false);
  });

  it('forgets a corrupt mark instead of reading the plant for it', () => {
    const storage = memoryStorage({ [AERO_AUTO_READ_KEY]: '{"date":"2026-11-03"}' });

    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW), false);
    assert.equal(storage.data.has(AERO_AUTO_READ_KEY), false);
  });

  it('forgets the mark on demand, so a closed session cannot fire the read later', () => {
    // Logging out leaves the tab's storage behind; a mark that survived would read the plant the next
    // time this person signed in, for a launch nobody remembers making.
    const storage = memoryStorage();
    armAeroAutoRead('2026-11-03', storage, NOW);

    clearAeroAutoRead(storage);

    assert.equal(storage.data.has(AERO_AUTO_READ_KEY), false);
    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW), false);
  });

  it('survives a phone whose storage refuses to write', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };

    assert.doesNotThrow(() => armAeroAutoRead('2026-11-03', storage, NOW));
    assert.equal(consumeAeroAutoRead('2026-11-03', storage, NOW), false);
  });
});
