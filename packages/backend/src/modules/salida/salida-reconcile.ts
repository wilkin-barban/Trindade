import { codeKey, operatorKey } from '../massas/massas-reconcile.js';

/**
 * The matching rule between a salida Trindade launched and the exit seats the ERP recorded.
 *
 * Both sides describe the same product leaving the plant, from different ends: Trindade stores one movement
 * per launch with the units the operator typed, Aero32 answers one seat per document line. This module is
 * the one place that decides when both describe the same baixa, and it works without a database so the rule
 * can be tested as a table.
 *
 * The rule is the same one Masas uses, and it is deliberately re-used rather than reinvented: `codeKey` drops
 * the leading zeros the ERP pads and `operatorKey` folds the case a Delphi screen does not, so a code typed
 * here as `1474` and answered there as `001474` are the same product, and `wilkin` and `WILKIN` are the same
 * person. What is new is the direction: only an `S` seat can settle a baixa. A supplies entry (`E`) is the
 * plant receiving material, and pairing it with an exit would mark as reconciled a movement nobody sent.
 */

/** The minimum a launch item has to expose to be reconciled. */
export interface SalidaReconcilableItem {
  id: number;
  product_code: string;
  quantity: number;
}

/** The minimum a seat has to expose; `AeroMovement` already satisfies it. */
export interface SalidaReconcilableSeat {
  ent_lan: number;
  product_code: string;
  quantity: number;
  entry_date: string;
  operator_name: string;
  movement_type: 'E' | 'S';
}

export interface SalidaReconciliation {
  status: 'reconciled' | 'partial' | 'pending';
  /** The `ENT_LAN` of every matched seat, once each, in seat order. */
  entLans: number[];
  matchedItemIds: number[];
  unmatchedItemIds: number[];
}

/** Same tolerance as the Masas rule: a unit that differs by a rounding hair is the same unit. */
function roundUnits(value: number): number {
  return Math.round(Number(value) * 1000) / 1000;
}

/**
 * The same boxes written as one comparable string: the day, the code without padding, the units and who
 * recorded them.
 *
 * The operator is part of the identity, not a detail: two operators can meaningfully record the same
 * quantity of the same product on the same day, and pairing one baixa with the other's seat would mark the
 * wrong person as reconciled.
 */
function seatKey(date: string, code: string, quantity: number, operator: string): string {
  return [String(date).slice(0, 10), codeKey(code), roundUnits(quantity), operatorKey(operator)].join('|');
}

/**
 * Pairs the ERP's exit seats with the items Trindade already has.
 *
 * Each seat is consumed at most once and the items are walked in their stored order, so two identical
 * seats mean the operator gave baixa twice and the second item keeps looking for a seat of its own. The
 * same seat can never settle two items, which is what makes `partial` mean "one of them is missing" rather
 * than "one of them matched twice".
 */
export function reconcileSalidaMovement(args: {
  date: string;
  operatorNames: readonly (string | null | undefined)[];
  items: readonly SalidaReconcilableItem[];
  seats: readonly SalidaReconcilableSeat[];
}): SalidaReconciliation {
  const { date, items, seats } = args;
  const operatorNames = args.operatorNames.map((name) => String(name ?? '').trim()).filter((name) => name !== '');

  // Seat indexes per key, in seat order, so a key with two identical seats can settle two identical items.
  const seatIndexesByKey = new Map<string, number[]>();
  for (let index = 0; index < seats.length; index += 1) {
    const seat = seats[index];
    if (seat.movement_type !== 'S') continue;
    // The seat carries its own day and the movement carries its own: a baixa of the 13th cannot be settled
    // by a seat the ERP recorded on the 12th, even when everything else was typed identically.
    if (String(seat.entry_date).slice(0, 10) !== String(date).slice(0, 10)) continue;
    const key = seatKey(date, seat.product_code, seat.quantity, seat.operator_name);
    const list = seatIndexesByKey.get(key);
    if (list) list.push(index);
    else seatIndexesByKey.set(key, [index]);
  }

  const consumed = new Set<number>();
  const matchedSeatIndexes: number[] = [];
  const matchedItemIds: number[] = [];
  const unmatchedItemIds: number[] = [];

  for (const item of items) {
    let matchedIndex: number | undefined;
    for (const operatorName of operatorNames) {
      const candidates = seatIndexesByKey.get(seatKey(date, item.product_code, item.quantity, operatorName));
      matchedIndex = candidates?.find((index) => !consumed.has(index));
      if (matchedIndex !== undefined) break;
    }

    if (matchedIndex === undefined) {
      unmatchedItemIds.push(item.id);
      continue;
    }
    consumed.add(matchedIndex);
    matchedSeatIndexes.push(matchedIndex);
    matchedItemIds.push(item.id);
  }

  // In seat order and once each: two lines of one document share an `ENT_LAN`, and the card lists the
  // document, not the line.
  const entLans: number[] = [];
  for (const index of [...matchedSeatIndexes].sort((a, b) => a - b)) {
    const entLan = seats[index].ent_lan;
    if (!entLans.includes(entLan)) entLans.push(entLan);
  }

  const status: SalidaReconciliation['status'] =
    items.length === 0 || matchedItemIds.length === 0
      ? 'pending'
      : matchedItemIds.length === items.length
        ? 'reconciled'
        : 'partial';

  return { status, entLans, matchedItemIds, unmatchedItemIds };
}
