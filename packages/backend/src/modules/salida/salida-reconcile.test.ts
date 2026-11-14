import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reconcileSalidaMovement, type SalidaReconcilableSeat } from './salida-reconcile.js';

/**
 * The matching rule between a salida Trindade launched and the exit seats the ERP recorded.
 *
 * The rule is a table and not a screen: every answer the history card can render — reconciled, partial,
 * pending — is decided here, without a database, so the cases the plant complained about can be transcribed
 * as rows. The seats mirror `/movimentoitem`, where a product's code arrives padded to six digits, the
 * operator's name arrives as they typed it on the Delphi screen, and a stock exit shares the day with the
 * supplies' entries.
 */

const DATE = '2026-11-13';

function seat(overrides: Partial<SalidaReconcilableSeat> = {}): SalidaReconcilableSeat {
  return {
    ent_lan: 1,
    product_code: '001474',
    quantity: 20,
    entry_date: DATE,
    operator_name: 'WILKIN',
    movement_type: 'S',
    ...overrides,
  };
}

interface Row {
  readonly who: string;
  readonly seats: SalidaReconcilableSeat[];
  readonly status: 'reconciled' | 'partial' | 'pending';
  readonly entLans: number[];
  readonly matched: number[];
  readonly unmatched: number[];
  /** The movement's items; the default pair when a row does not need its own. */
  readonly items?: { id: number; product_code: string; quantity: number }[];
}

const items = [
  { id: 1, product_code: '1474', quantity: 20 },
  { id: 2, product_code: '1900', quantity: 3 },
];

const rows: readonly Row[] = [
  {
    who: 'no seat at all leaves the movement pending',
    seats: [],
    status: 'pending',
    entLans: [],
    matched: [],
    unmatched: [1, 2],
  },
  {
    who: 'every item with a seat reconciles the movement',
    seats: [seat({ ent_lan: 41001 }), seat({ ent_lan: 41002, product_code: '1900', quantity: 3 })],
    status: 'reconciled',
    entLans: [41001, 41002],
    matched: [1, 2],
    unmatched: [],
  },
  {
    who: 'one of two items reconciles partially',
    seats: [seat({ ent_lan: 41001 })],
    status: 'partial',
    entLans: [41001],
    matched: [1],
    unmatched: [2],
  },
  {
    who: 'a supplies entry never reconciles a baixa',
    seats: [seat({ ent_lan: 41001, movement_type: 'E' })],
    status: 'pending',
    entLans: [],
    matched: [],
    unmatched: [1, 2],
  },
  {
    who: 'a padded code matches the four digits Trindade stores',
    seats: [seat({ ent_lan: 41001, product_code: '001474' })],
    status: 'partial',
    entLans: [41001],
    matched: [1],
    unmatched: [2],
  },
  {
    who: "the operator's name matches in any case",
    seats: [seat({ ent_lan: 41001, operator_name: 'wilkin' })],
    status: 'partial',
    entLans: [41001],
    matched: [1],
    unmatched: [2],
  },
  {
    who: 'a seat is consumed once, so two identical seats match two identical items',
    items: [
      { id: 1, product_code: '1474', quantity: 20 },
      { id: 2, product_code: '1474', quantity: 20 },
    ],
    seats: [seat({ ent_lan: 41001 }), seat({ ent_lan: 41002 })],
    status: 'reconciled',
    entLans: [41001, 41002],
    matched: [1, 2],
    unmatched: [],
  },
  {
    who: 'a single seat cannot settle two identical items',
    seats: [seat({ ent_lan: 41001 })],
    status: 'partial',
    entLans: [41001],
    matched: [1],
    unmatched: [2],
  },
  {
    who: 'a seat of another day is not the same movement',
    seats: [seat({ ent_lan: 41001, entry_date: '2026-11-12' })],
    status: 'pending',
    entLans: [],
    matched: [],
    unmatched: [1, 2],
  },
  {
    who: 'a seat of another quantity is not the same boxes',
    seats: [seat({ ent_lan: 41001, quantity: 19 })],
    status: 'pending',
    entLans: [],
    matched: [],
    unmatched: [1, 2],
  },
  {
    who: "a seat of another operator is somebody else's baixa",
    seats: [seat({ ent_lan: 41001, operator_name: 'ANA' })],
    status: 'pending',
    entLans: [],
    matched: [],
    unmatched: [1, 2],
  },
];

describe('the salida reconciliation rule', () => {
  for (const row of rows) {
    it(row.who, () => {
      const result = reconcileSalidaMovement({
        date: DATE,
        operatorNames: ['wilkin', 'Wilkin Admin'],
        items: row.items ?? items,
        seats: row.seats,
      });

      assert.equal(result.status, row.status);
      assert.deepEqual(result.entLans, row.entLans);
      assert.deepEqual(result.matchedItemIds, row.matched);
      assert.deepEqual(result.unmatchedItemIds, row.unmatched);
    });
  }

  it('answers pending for a movement with no items instead of crashing', () => {
    const result = reconcileSalidaMovement({
      date: DATE,
      operatorNames: ['wilkin', 'Wilkin Admin'],
      items: [],
      seats: [seat()],
    });

    assert.equal(result.status, 'pending');
    assert.deepEqual(result.entLans, []);
    assert.deepEqual(result.matchedItemIds, []);
    assert.deepEqual(result.unmatchedItemIds, []);
  });

  it('matches the display name as well as the username', () => {
    const result = reconcileSalidaMovement({
      date: DATE,
      operatorNames: ['wilkin', 'Wilkin Admin'],
      items,
      seats: [seat({ ent_lan: 41001, operator_name: 'wilkin admin' })],
    });

    assert.deepEqual(result.matchedItemIds, [1]);
    assert.deepEqual(result.entLans, [41001]);
  });

  it('lists the ent_lans once each, in seat order', () => {
    const result = reconcileSalidaMovement({
      date: DATE,
      operatorNames: ['wilkin'],
      items: [
        { id: 7, product_code: '1900', quantity: 3 },
        { id: 8, product_code: '1474', quantity: 20 },
      ],
      seats: [seat({ ent_lan: 41002, product_code: '1900', quantity: 3 }), seat({ ent_lan: 41001 })],
    });

    assert.deepEqual(result.entLans, [41002, 41001]);
    assert.deepEqual(result.matchedItemIds, [7, 8]);
  });
});
