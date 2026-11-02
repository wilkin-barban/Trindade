/** Three fleteros, one shift. Past three the day still takes them; the screen only says the hour is full. */
export const QUOTA_MAX = 3;

/** The part of a load that decides which shift it belongs to. */
export interface ShiftRow {
  id: number;
  time_slot: string;
  driver_type: 'fletero' | 'casa';
}

/** A slot as minutes since midnight, which is the only way two slots can be compared. */
export function toMinutes(slot: string): number {
  const [hours, minutes] = slot.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * How many fleteros share the shift of `slot`: everyone within the hour, on both sides.
 *
 * The hour is open in both ends on purpose. 03:00 and 05:00 are the shifts before and after, so a load at
 * 04:00 belongs to neither, and a load at 04:59 still leaves with the 04:00 trucks. Counting by exact slot --
 * what the grid used to draw -- split one shift into three and let thirteen drivers pass as four.
 */
export function countInWindow(
  schedules: readonly ShiftRow[],
  slot: string,
  excludeId?: number
): number {
  const target = toMinutes(slot);
  return schedules.filter((entry) => {
    if (entry.driver_type !== 'fletero' || entry.id === excludeId) return false;
    return Math.abs(toMinutes(entry.time_slot) - target) < 60;
  }).length;
}

/**
 * The quota a row would find in `targetSlot`, with the row itself counted where it is going.
 *
 * The row is left out of the window's count first: it may already be inside that window, and counting it there
 * and then adding it again is how moving a row onto its own slot used to invent a fourth fletero.
 */
export function quotaIfMoved(
  schedules: readonly ShiftRow[],
  moving: ShiftRow,
  targetSlot: string
): number {
  const others = countInWindow(schedules, targetSlot, moving.id);
  return others + (moving.driver_type === 'fletero' ? 1 : 0);
}

/** Whether the shift is past the three places, which is a warning and never a refusal. */
export function isQuotaExceeded(quota: number): boolean {
  return quota > QUOTA_MAX;
}
