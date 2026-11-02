import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AERO_PENDING_ATTEMPT_STORAGE_KEY,
  clearAeroPendingAttempt,
  loadAeroPendingAttempt,
  saveAeroPendingAttempt,
} from './aero-pending-attempt.js';

/** A `Storage` stand-in: the real one is a browser, and the rule is about what survives the trip. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('the attempt the bridge carries away', () => {
  it('comes back with the same identifier and start time', () => {
    const storage = memoryStorage();
    saveAeroPendingAttempt({ action: 'movimentos', attemptId: 'attempt-7', startedAt: 1_700_000_000_000 }, storage);

    assert.deepEqual(loadAeroPendingAttempt('movimentos', storage), {
      action: 'movimentos',
      attemptId: 'attempt-7',
      startedAt: 1_700_000_000_000,
    });
  });

  it('is not borrowed by a callback of another trip', () => {
    const storage = memoryStorage();
    saveAeroPendingAttempt({ action: 'entrada_lote', attemptId: 'attempt-8', startedAt: 1 }, storage);

    assert.equal(loadAeroPendingAttempt('movimentos', storage), null);
  });

  it('is forgotten once its result line is written', () => {
    const storage = memoryStorage();
    saveAeroPendingAttempt({ action: 'entrada', attemptId: 'attempt-9', startedAt: 1 }, storage);

    clearAeroPendingAttempt(storage);

    assert.equal(storage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY), null);
    assert.equal(loadAeroPendingAttempt('entrada', storage), null);
  });

  it('ignores a stored value that is not an attempt', () => {
    const storage = memoryStorage();
    storage.setItem(AERO_PENDING_ATTEMPT_STORAGE_KEY, '{"action":"movimentos"}');

    assert.equal(loadAeroPendingAttempt('movimentos', storage), null);
  });
});
