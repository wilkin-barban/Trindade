import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AERO_PENDING_ATTEMPT_STORAGE_KEY,
  aeroAttemptDate,
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

  it('comes back with the day it was armed for, even after midnight', () => {
    // The page leaves for the shortcut with one day in hand and returns in a fresh document. Reading
    // today's clock there would store the plant's answer under the next day, and the mirror would show
    // a date whose boxes are still pending.
    const storage = memoryStorage();
    saveAeroPendingAttempt(
      { action: 'movimentos', attemptId: 'attempt-7', startedAt: 1_700_000_000_000, date: '2026-11-03' },
      storage,
    );

    const attempt = loadAeroPendingAttempt('movimentos', storage);
    assert.equal(attempt?.date, '2026-11-03');
    assert.equal(aeroAttemptDate(attempt, '2026-11-04'), '2026-11-03');
    assert.equal(aeroAttemptDate(null, '2026-11-04'), '2026-11-04');
  });

  it('keeps reading an attempt stored before dates were carried', () => {
    // A tab that left with the previous build has a record without a date. It is still the attempt of
    // that trip, so the identifier pairs; only the day falls back to the page's own.
    const storage = memoryStorage();
    storage.setItem(
      AERO_PENDING_ATTEMPT_STORAGE_KEY,
      JSON.stringify({ action: 'movimentos', attemptId: 'attempt-6', startedAt: 1_700_000_000_000 }),
    );

    const attempt = loadAeroPendingAttempt('movimentos', storage);
    assert.equal(attempt?.attemptId, 'attempt-6');
    assert.equal(attempt?.date, undefined);
    assert.equal(aeroAttemptDate(attempt, '2026-11-04'), '2026-11-04');
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
