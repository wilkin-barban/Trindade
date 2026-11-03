/**
 * The read of the plant's day that a launch owes, marked instead of fired.
 *
 * A launch that the ERP confirmed leaves an asiento the page has not seen yet: until someone reads
 * `/movimentoitem`, the row stays pending and the mirror shows yesterday's shape of today. The read cannot
 * start the moment the ERP answers, though, because the answer arrives while the verdict dialog is on
 * screen and the only way to read is through the shortcut, which leaves the page: the operator would come
 * back to a screen that forgot what it just told them.
 *
 * So the launch writes a mark, and closing the verdict spends it, once, for that same day. A mark is a
 * leftover after the shift, and a launch on another day replaces it instead of inheriting it.
 */
import type { StorageLike } from './aero-integration';

export const AERO_AUTO_READ_KEY = 'trindade.aero.auto-read.v1';

/** Marks die with the shift; an eight-hour-old mark belongs to a day nobody is looking at. */
export const AERO_AUTO_READ_TTL_MS = 8 * 60 * 60 * 1000;

interface AutoReadMark {
  /** The day the launch belonged to. */
  date: string;
  /** Epoch milliseconds of the launch, compared against the read that spends the mark. */
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
    storage?.removeItem(AERO_AUTO_READ_KEY);
  } catch {
    /* a storage that cannot forget is not a reason to fail the launch */
  }
}

function read(storage: StorageLike | null): AutoReadMark | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(AERO_AUTO_READ_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AutoReadMark>;
    if (typeof parsed.date !== 'string' || typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) {
      throw new Error('shape');
    }
    return { date: parsed.date, at: parsed.at };
  } catch {
    // Media marca no es una marca: se olvida aquí para no arrastrarla hasta el próximo cierre.
    forget(storage);
    return null;
  }
}

/**
 * Records that the day owes one read, replacing whatever a previous launch marked.
 *
 * Writing is best effort: a phone in private mode cannot keep the mark, and that costs the automatic
 * read, not the launch that already happened.
 */
export function armAeroAutoRead(
  date: string,
  storage: StorageLike | null = safeStorage(),
  now = Date.now()
): void {
  if (!storage) return;
  try {
    storage.setItem(AERO_AUTO_READ_KEY, JSON.stringify({ date, at: now } satisfies AutoReadMark));
  } catch {
    /* the launch is already saved; the mark is a convenience */
  }
}

/**
 * Spends the mark for `date`, answering whether this closing owes the read.
 *
 * A mark for another day, or one old enough to be a leftover, is dropped instead of spent: it would read a
 * day the operator is not looking at and leave the dialog's day as pending as before.
 */
export function consumeAeroAutoRead(
  date: string,
  storage: StorageLike | null = safeStorage(),
  now = Date.now()
): boolean {
  const mark = read(storage);
  if (!mark) return false;
  const age = now - mark.at;
  const fresh = Number.isFinite(age) && age >= 0 && age <= AERO_AUTO_READ_TTL_MS;
  if (mark.date !== date || !fresh) {
    forget(storage);
    return false;
  }
  forget(storage);
  return true;
}
