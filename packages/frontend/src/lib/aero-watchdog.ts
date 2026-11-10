/**
 * The mark the page leaves when it hands the launch to Scriptable, and the question it asks on the way back.
 *
 * The bridge leaves the page: the phone runs a script that talks to the plant's ERP and comes back through a
 * deep link. When the iPhone is not on the factory Wi-Fi, that answer never arrives, and before this mark the
 * screen stayed on «enviando» for as long as the operator was willing to believe it. A mark with the action and
 * the day turns «nothing came back» into something the page can say out loud, once, after a wait long enough
 * that a slow ERP is not mistaken for a phone that never returned.
 *
 * A mark is per day and per action, and it is worth nothing after the TTL: it describes one trip to
 * Scriptable, not a state the integration is in.
 */
import type { StorageLike } from './aero-integration';

export const AERO_BRIDGE_MARK_KEY = 'trindade.aero.bridge-pending.v1';

/** 150 s: long enough for a slow ERP, short enough that the screen does not lie for minutes. */
export const AERO_BRIDGE_MARK_TTL_MS = 150_000;

export interface AeroBridgeMark {
  /** The bridge action that left the page: `entrada`, `entrada_lote`, `movimentos`, `test`… */
  action: string;
  /** The plant day the launch belonged to, `YYYY-MM-DD`. */
  date: string;
  /** Epoch milliseconds of the moment the page navigated away. */
  at: number;
}

function safeStorage(): StorageLike | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function forget(storage: StorageLike | null): void {
  try {
    storage?.removeItem(AERO_BRIDGE_MARK_KEY);
  } catch {
    /* a storage that cannot forget is not a reason to fail the screen that is open */
  }
}

/**
 * Records that the bridge left the page, replacing whatever a previous launch marked.
 *
 * Writing is best effort: a phone in private mode cannot keep the mark, and that costs the warning about a
 * Scriptable that never came back -- never the launch itself.
 */
export function markAeroBridgePending(
  mark: { action: string; date: string; at?: number },
  storage: StorageLike | null = safeStorage(),
): void {
  if (!storage) return;
  const written: AeroBridgeMark = {
    action: mark.action,
    date: mark.date,
    at: typeof mark.at === 'number' && Number.isFinite(mark.at) ? mark.at : Date.now(),
  };
  try {
    storage.setItem(AERO_BRIDGE_MARK_KEY, JSON.stringify(written));
  } catch {
    /* the trip already started; the mark is a reminder, not a requirement */
  }
}

/**
 * Forgets the mark: any callback means the phone came back, whatever it brought.
 *
 * Called on every parse of a callback. A mark that survived a real answer would fire the warning a few
 * minutes later over a launch that succeeded.
 */
export function clearAeroBridgePending(storage: StorageLike | null = safeStorage()): void {
  forget(storage);
}

/**
 * Answers whether a mark is old enough to mean «Scriptable did not come back».
 *
 * Pure, so the screen can decide between renders without touching storage. A clock that went backwards gives
 * a negative age: a mark from the future is not expired, it is simply not believable yet, and the alternative
 * -- warning about a trip that just started -- is worse.
 */
export function aeroBridgeMarkExpired(mark: AeroBridgeMark | null, now: number): boolean {
  if (!mark) return false;
  const age = now - mark.at;
  if (!Number.isFinite(age) || age < 0) return false;
  return age > AERO_BRIDGE_MARK_TTL_MS;
}

/**
 * Reads the mark this page still owes an answer for, or `null` when there is nothing to warn about.
 *
 * Absent, malformed, expired or from another day: all of it is `null`. A stale mark is garbage, not state, so
 * it is deleted on the way out instead of being re-read on every mount of the screen.
 */
export function readAeroBridgePending(
  now = Date.now(),
  storage: StorageLike | null = safeStorage(),
): AeroBridgeMark | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(AERO_BRIDGE_MARK_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let mark: AeroBridgeMark | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('shape');
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.action !== 'string' ||
      typeof record.date !== 'string' ||
      typeof record.at !== 'number' ||
      !Number.isFinite(record.at)
    ) {
      throw new Error('shape');
    }
    mark = { action: record.action, date: record.date, at: record.at };
  } catch {
    // Media marca no es una marca: se olvida aquí para no arrastrarla hasta el próximo aviso.
    forget(storage);
    return null;
  }

  const today = plantDay(now);
  if (mark.date !== today || aeroBridgeMarkExpired(mark, now)) {
    forget(storage);
    return null;
  }
  return mark;
}

/**
 * The plant day of a timestamp, in São Paulo, without pulling a date library into a browser module.
 *
 * The mark belongs to the factory's shift, not to the phone's timezone: a phone that auto-updated its clock on
 * a flight would otherwise carry yesterday's mark into today.
 */
function plantDay(at: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
  return parts;
}
