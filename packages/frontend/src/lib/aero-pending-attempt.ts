/**
 * The attempt that is currently travelling through the shortcut.
 *
 * The bridge is a full-page navigation: the page hands an envelope to the phone and leaves, and the phone
 * comes back with the ERP's answer in the URL. Anything the page keeps in React state is gone by then, so
 * the identifier that pairs the `requested` line with its `result` has to be written down before leaving and
 * read back on return. Without it the log holds two lines about one action and no way to tell they belong
 * together -- which is exactly the hole the audit trail was supposed to close.
 *
 * One slot is enough: a phone can only be away on one trip at a time, and a newer trip overwrites the older
 * one instead of pairing the answer with the wrong request.
 */

export const AERO_PENDING_ATTEMPT_STORAGE_KEY = 'trindade.aero.pending-attempt.v1';

/**
 * Which bridge trip the attempt belongs to. The page names it, the callback checks it.
 *
 * `saida` is the stock exit of Salida / Baixa: it shares the bridge with the entries and the movements read,
 * and it is a third trip because a page must never close an answer with an identifier that belongs to
 * another one still in flight.
 */
export type AeroPendingAction = 'movimentos' | 'entrada' | 'entrada_lote' | 'saida';

export interface AeroPendingAttempt {
  action: AeroPendingAction;
  attemptId: string;
  startedAt: number;
  /**
   * The day the trip was armed for.
   *
   * The page leaves with one day in hand and returns in a fresh document, which is why the date cannot
   * be read from the clock on return: a trip that comes back after midnight would store the plant's
   * answer under the next day and leave today's mirror empty. Optional because an attempt written by an
   * older build has no date, and that record is still the attempt of its trip.
   */
  date?: string;
}

/**
 * The day a returned attempt belongs to.
 *
 * The attempt's own date wins over whatever the page was showing when the answer arrived; the page's
 * day is the fallback for an attempt stored before dates were carried, or for a callback with none.
 */
export function aeroAttemptDate(
  attempt: Pick<AeroPendingAttempt, 'date'> | null | undefined,
  pageDate: string,
): string {
  return attempt?.date ?? pageDate;
}

function storageOf(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null) {
  if (storage !== undefined) return storage;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/** Writes the attempt down before the page leaves for the shortcut. */
export function saveAeroPendingAttempt(
  attempt: AeroPendingAttempt,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
): void {
  const target = storageOf(storage);
  if (target) {
    target.setItem(AERO_PENDING_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  }
}

/**
 * Reads the attempt the callback is closing, if it is the one the page expected.
 *
 * A callback of another kind -- a test, or an older shortcut that comes back without one -- gets null
 * instead of a borrowed identifier, so the result line is written with its own generated attempt rather
 * than pairing with an unrelated request.
 */
export function loadAeroPendingAttempt(
  action?: AeroPendingAction,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
): AeroPendingAttempt | null {
  const target = storageOf(storage);
  if (!target) return null;
  const raw = target.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const { action: storedAction, attemptId, startedAt, date } = parsed;
    if (
      storedAction !== 'movimentos' &&
      storedAction !== 'entrada' &&
      storedAction !== 'entrada_lote' &&
      storedAction !== 'saida'
    ) {
      return null;
    }
    if (typeof attemptId !== 'string' || attemptId.length === 0) return null;
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null;
    if (action !== undefined && storedAction !== action) return null;
    if (date !== undefined && typeof date !== 'string') return null;
    return { action: storedAction, attemptId, startedAt, ...(date ? { date } : {}) };
  } catch {
    return null;
  }
}

/** Forgets the attempt once its result line has been written. */
export function clearAeroPendingAttempt(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
): void {
  const target = storageOf(storage);
  if (target) {
    target.removeItem(AERO_PENDING_ATTEMPT_STORAGE_KEY);
  }
}
