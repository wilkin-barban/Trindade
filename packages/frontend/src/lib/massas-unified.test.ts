import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canImportRow,
  canCreateOperatorRow,
  deriveDisplayName,
  seatNeedsReactivation,
  seatOwnerStatus,
  massasUnifiedRows,
  massasUnifiedOperators,
  massasUnifiedSummary,
  reconciledLaunchIds,
  type MassasUnifiedInput,
  type MassasUnifiedRow,
} from './massas-unified';
import type { AeroErpMovementItem } from './aero-integration';
import type { MassaIndividualLaunch } from './massas';

/**
 * The unified table, as a table.
 *
 * The browser only draws what this returns, so the states are decided here: what Trindade launched and the
 * ERP already has, what it launched and Delphi has not seen, and what the company tablet recorded with no
 * launch here at all. One box, one row.
 */

const PRODUCTS = [
  { code: '1045', name: 'MASSA CASEIRA', unitsPerBox: 10 },
  { code: '1047', name: 'MASSA ROLO 2KG', unitsPerBox: 6 },
];

const DATE = '2026-06-12';

function launch(args: Partial<MassaIndividualLaunch> & { id: number }): MassaIndividualLaunch {
  const product = PRODUCTS.find((candidate) => candidate.code === (args.product_code ?? '1045'))!;
  const boxes = args.boxes ?? 2;
  return {
    id: args.id,
    launch_date: DATE,
    product_code: args.product_code ?? '1045',
    product_name: product.name,
    boxes,
    units: args.units ?? boxes * product.unitsPerBox,
    user_id: args.user_id ?? 1,
    username: args.username ?? 'alice',
    display_name: args.display_name ?? 'Alice',
    ent_lan: args.ent_lan ?? null,
    created_at: `${DATE} 10:00:00`,
    updated_at: `${DATE} 10:00:00`,
  };
}

function seat(args: Partial<AeroErpMovementItem> & { entLan: number }): AeroErpMovementItem {
  return {
    entLan: args.entLan,
    productCode: args.productCode ?? '1045',
    productDesc: 'MASSA',
    quantity: args.quantity ?? 20,
    entryDate: DATE,
    operatorName: args.operatorName ?? 'ALICE',
    movementType: args.movementType ?? 'E',
    ownerUserId: args.ownerUserId ?? null,
    ownerStatus: args.ownerStatus,
  };
}

function input(overrides: Partial<MassasUnifiedInput> = {}): MassasUnifiedInput {
  return {
    launches: [],
    movements: [],
    products: PRODUCTS,
    ...overrides,
  };
}

describe('reconciledLaunchIds', () => {
  it('names the launches the ERP already has, and only those', () => {
    // A launch Delphi has seen is settled: editing or deleting it here would leave the plant's day and the
    // company's book disagreeing, with no screen able to say which one is right.
    const rows = massasUnifiedRows(
      input({
        launches: [launch({ id: 1 }), launch({ id: 2, product_code: '1047' })],
        movements: [seat({ entLan: 900 })],
      }),
    );

    assert.deepEqual([...reconciledLaunchIds(rows)].sort(), [1]);
  });

  it('leaves a pending launch manageable, and a day with no rows open', () => {
    const pending = massasUnifiedRows(input({ launches: [launch({ id: 7 })] }));
    assert.deepEqual([...reconciledLaunchIds(pending)], []);

    // The history screen reads past days and has no ERP half at all: nothing is settled there.
    assert.deepEqual([...reconciledLaunchIds(undefined)], []);
    assert.deepEqual([...reconciledLaunchIds([])], []);
  });

  it('settles every launch behind a reconciled row, not just the first', () => {
    // The row is built here: what this test is about is the helper reading the whole list, not how many
    // launches the matcher happens to pair with one seat.
    const rows: MassasUnifiedRow[] = [
      { ...massasUnifiedRows(input({ launches: [launch({ id: 3 })] }))[0], state: 'reconciled', launchIds: [3, 4] },
      { ...massasUnifiedRows(input({ launches: [launch({ id: 5 })] }))[0], state: 'pendingErp', launchIds: [5] },
    ];

    assert.deepEqual([...reconciledLaunchIds(rows)].sort(), [3, 4]);
  });
});

describe('massasUnifiedRows', () => {
  it('shows one reconciled row for a launch the ERP already has, not two', () => {
    const rows = massasUnifiedRows(input({ launches: [launch({ id: 1 })], movements: [seat({ entLan: 900 })] }));

    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, 'reconciled');
    assert.deepEqual(rows[0].launchIds, [1]);
    assert.equal(rows[0].units, 20);
  });

  /**
   * The production defect, as a row: the tablet recorded the seat under VICTOR, the import landed under
   * Wilkin, and the name comparison refused the pair. The seat stayed erpOnly, the Importar button stayed on
   * screen, and every click added another orphan launch to the day.
   */
  it('settles a seat imported by another operator, using the seat stored with the launch', () => {
    const rows = massasUnifiedRows(
      input({
        launches: [
          launch({ id: 90, product_code: '1047', boxes: 3, username: 'wilkin', display_name: 'Wilkin', ent_lan: 35937 }),
        ],
        movements: [seat({ entLan: 35937, productCode: '001047', quantity: 18, operatorName: 'VICTOR' })],
      }),
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, 'reconciled');
    assert.deepEqual(rows[0].launchIds, [90]);
    // No leftover erpOnly row means no leftover Importar button.
    assert.equal(rows.some((row) => row.state === 'erpOnly'), false);
  });

  it('keeps a launch Delphi has not seen as pending, and remembers the day it was already carried', () => {
    const pending = massasUnifiedRows(input({ launches: [launch({ id: 7 })] }));
    assert.equal(pending.length, 1);
    assert.equal(pending[0].state, 'pendingErp');
    assert.equal(pending[0].tabletAcked, false);

    const acked = massasUnifiedRows(input({ launches: [launch({ id: 7 })], ackedLaunchIds: [7] }));
    assert.equal(acked[0].tabletAcked, true);
    // Acknowledging it on this phone does not pretend Delphi has it.
    assert.equal(acked[0].state, 'pendingErp');
  });

  it('shows a seat nobody launched here as the operator who typed it, importable in whole boxes', () => {
    const rows = massasUnifiedRows(
      input({ movements: [seat({ entLan: 901, productCode: '1047', quantity: 18, operatorName: 'TIAGO' })] }),
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, 'erpOnly');
    assert.equal(rows[0].operatorName, 'TIAGO');
    assert.equal(rows[0].boxes, 3);
    assert.equal(rows[0].units, 18);
    assert.equal(rows[0].importable, true);
    assert.deepEqual(rows[0].entLans, [901]);
  });

  it('never offers to import a seat that does not fit whole boxes', () => {
    const rows = massasUnifiedRows(input({ movements: [seat({ entLan: 902, quantity: 15 })] }));
    assert.equal(rows[0].state, 'erpOnly');
    assert.equal(rows[0].importable, false);
  });

  it('never turns a stock exit or a supply into production', () => {
    const rows = massasUnifiedRows(
      input({
        movements: [
          seat({ entLan: 903, movementType: 'S' }),
          seat({ entLan: 904, productCode: '0500', productDesc: 'SACO' }),
        ],
      }),
    );
    assert.deepEqual(rows, []);
  });

  it('filters both sides at once by whichever name the operator is known by', () => {
    const day = input({
      launches: [
        launch({ id: 1, display_name: 'Alice', username: 'alice' }),
        launch({ id: 2, display_name: 'Bruno', username: 'bruno' }),
      ],
      movements: [seat({ entLan: 905, operatorName: 'TIAGO' })],
    });

    assert.deepEqual(
      massasUnifiedRows(day, 'alice').map((row) => row.key),
      ['launch-1'],
    );
    assert.deepEqual(
      massasUnifiedRows(day, 'BRUNO').map((row) => row.key),
      ['launch-2'],
    );
    assert.deepEqual(
      massasUnifiedRows(day, 'tiago').map((row) => row.key),
      ['seat-905'],
    );
    assert.equal(massasUnifiedRows(day, '').length, 3);
  });

  it('puts the rows that need an action first', () => {
    const rows = massasUnifiedRows(
      input({
        launches: [
          launch({ id: 1 }),
          // Bruno launched too and Delphi has no seat for him: this one is waiting on the plant.
          launch({ id: 2, display_name: 'Bruno', username: 'bruno', product_code: '1047' }),
        ],
        movements: [seat({ entLan: 900 }), seat({ entLan: 906, operatorName: 'TIAGO' })],
      }),
    );
    assert.deepEqual(
      rows.map((row) => row.state),
      ['pendingErp', 'erpOnly', 'reconciled'],
    );
  });
});

describe('the day the launch leaves owing', () => {
  /**
   * One read of the plant closes the loop the launch opened.
   *
   * The snapshot comes back with everything the ERP recorded -- ten massas and, in the same day, whatever
   * else the plant typed. The row the operator launched has to turn into a reconciled one, and the supply
   * has to stay out of this table without being thrown away: it is Recebimento's and Relatório's.
   */
  it('una lectura del día concilia el lote y no mete insumos', () => {
    const launches = [launch({ id: 1 }), launch({ id: 2, product_code: '1047', boxes: 1, units: 6 })];
    const movements = [
      seat({ entLan: 41001, quantity: 20, operatorName: 'ALICE' }),
      seat({ entLan: 41002, productCode: '1047', quantity: 6, operatorName: 'ALICE' }),
      // El insumo que el ERP guardó ese mismo día: existe en el espejo, no es una masa.
      seat({ entLan: 41003, productCode: '9001', productDesc: 'SACO', quantity: 3, movementType: 'E' }),
    ];

    const rows = massasUnifiedRows(input({ launches, movements }));

    assert.equal(rows.length, 2, 'el insumo no agrega fila');
    assert.ok(rows.every((row) => row.productCode !== '9001'), 'y su código no aparece en ninguna');
    assert.deepEqual(
      rows.map((row) => row.state),
      ['reconciled', 'reconciled'],
      'los dos lanzamientos quedaron conciliados con la lectura',
    );
    assert.deepEqual([...reconciledLaunchIds(rows)].sort(), [1, 2], 'la cola puede liquidar lo enviado');
  });
});

describe('the owner a row says it belongs to', () => {
  it('carries the seat owner the backend resolved, so a worker keeps their own button', () => {
    const rows = massasUnifiedRows(
      input({ movements: [seat({ entLan: 35937, operatorName: 'VICTOR', ownerUserId: 12 })] }),
    );
    const row = rows.find((candidate) => candidate.state === 'erpOnly')!;
    assert.equal(row.ownerUserId, 12);
    assert.equal(row.operatorName, 'VICTOR');
  });

  it('leaves the owner unknown when the name belongs to nobody here', () => {
    const rows = massasUnifiedRows(input({ movements: [seat({ entLan: 35939, operatorName: 'MARIA' })] }));
    const row = rows.find((candidate) => candidate.state === 'erpOnly')!;
    assert.equal(row.ownerUserId, null);
  });

  it('names the owner of a launch row too, so the table reads one field on both halves', () => {
    const rows = massasUnifiedRows(input({ launches: [launch({ id: 4, user_id: 17, display_name: 'Gustavo' })] }));
    assert.equal(rows[0].ownerUserId, 17);
  });
});

describe('who the table offers the import to', () => {
  const workerSeat = () =>
    massasUnifiedRows(input({ movements: [seat({ entLan: 35937, operatorName: 'VICTOR', ownerUserId: 12 })] })).find(
      (row) => row.state === 'erpOnly',
    )!;

  it('offers a worker their own seat and nobody else\'s', () => {
    const row = workerSeat();
    assert.equal(canImportRow(row, { userId: 12, isAdmin: false }), true);
    assert.equal(canImportRow(row, { userId: 17, isAdmin: false }), false);
  });

  it('offers every seat to an administrator only when the operator is already linked', () => {
    assert.equal(canImportRow(workerSeat(), { userId: 1, isAdmin: true }), true);
  });

  it('refuses import on a seat with no owner and offers operator creation to an administrator instead', () => {
    const orphan = massasUnifiedRows(input({ movements: [seat({ entLan: 35939, operatorName: 'MARIA' })] })).find(
      (row) => row.state === 'erpOnly',
    )!;
    // S14: backend removes fallback, an unlinked seat cannot be imported by anyone
    assert.equal(canImportRow(orphan, { userId: 17, isAdmin: false }), false);
    assert.equal(canImportRow(orphan, { userId: 1, isAdmin: true }), false);

    // S16, S19: inline creation is offered to administrator, not to worker
    assert.equal(canCreateOperatorRow(orphan, { isAdmin: true }), true);
    assert.equal(canCreateOperatorRow(orphan, { isAdmin: false }), false);
    // When already linked, creation is not offered
    assert.equal(canCreateOperatorRow(workerSeat(), { isAdmin: true }), false);
  });

  it('tells a deactivated operator from one nobody has ever registered', () => {
    // The mirror says why a seat has no owner. Deactivated means the login exists: offering to create it
    // would fail on the unique index and hide the fix, which is reactivating the account.
    const inactive = massasUnifiedRows(
      input({ movements: [seat({ entLan: 35952, ownerUserId: null, ownerStatus: 'inactive' })] }),
    ).find((row) => row.state === 'erpOnly')!;
    assert.equal(seatOwnerStatus(inactive), 'inactive');
    assert.equal(seatNeedsReactivation(inactive), true);
    assert.equal(canCreateOperatorRow(inactive, { isAdmin: true }), false, 'creating would duplicate the login');
    assert.equal(canImportRow(inactive, { userId: 1, isAdmin: true }), false);

    const absent = massasUnifiedRows(
      input({ movements: [seat({ entLan: 35947, ownerUserId: null, ownerStatus: 'missing' })] }),
    ).find((row) => row.state === 'erpOnly')!;
    assert.equal(seatOwnerStatus(absent), 'missing');
    assert.equal(seatNeedsReactivation(absent), false);
    assert.equal(canCreateOperatorRow(absent, { isAdmin: true }), true);

    // A launched row is owned by its author even when the mirror field is absent.
    assert.equal(seatOwnerStatus(workerSeat()), 'active');
  });

  it('derives display name in title case from uppercase ERP operator name', () => {
    assert.equal(deriveDisplayName('JEFFERSON'), 'Jefferson');
    assert.equal(deriveDisplayName('JOAO H'), 'Joao H');
    assert.equal(deriveDisplayName('MARIA DA SILVA'), 'Maria Da Silva');
  });

  it('never offers a seat that does not fit whole boxes, whoever asks', () => {
    const partial = massasUnifiedRows(input({ movements: [seat({ entLan: 35940, quantity: 15, ownerUserId: 12 })] })).find(
      (row) => row.state === 'erpOnly',
    )!;
    assert.equal(partial.importable, false);
    assert.equal(canImportRow(partial, { userId: 12, isAdmin: false }), false);
    assert.equal(canImportRow(partial, { userId: 1, isAdmin: true }), false);
  });
});

describe('massas boxes, operators and the two summary sections', () => {
  const QUADRADA = [{ code: '1192', name: 'MASSA QUADRADA', unitsPerBox: 15 }];

  it('rounds the boxes of a row up from its exact units', () => {
    // 182 units of a 15-unit box occupy 13 boxes: twelve closed and one open with two units. The units stay
    // 182 because they are what the company counted.
    const rows = massasUnifiedRows(
      input({
        products: QUADRADA,
        movements: [seat({ entLan: 35983, productCode: '001192', quantity: 182, operatorName: 'VINICIUS R' })],
      }),
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].boxes, 13);
    assert.equal(rows[0].units, 182);
    assert.equal(rows[0].unitsPerBox, 15);
    assert.equal(rows[0].openBoxUnits, 2);
  });

  it('counts a row that does not reach a box as one open box, never as zero', () => {
    // The phone truncated 3/10 to zero, telling the plant a box that left never existed.
    const rows = massasUnifiedRows(
      input({ movements: [seat({ entLan: 35949, productCode: '1045', quantity: 3, operatorName: 'JOAO H' })] }),
    );

    assert.equal(rows[0].boxes, 1);
    assert.equal(rows[0].openBoxUnits, 3);
    assert.equal(rows[0].importable, false, 'a partial still does not fit whole boxes');
  });

  it('offers every operator of the unified day, including the ones with no account', () => {
    const rows = massasUnifiedRows(
      input({
        launches: [launch({ id: 7, user_id: 3, display_name: 'Alice', product_code: '1045' })],
        movements: [
          seat({ entLan: 35983, productCode: '1045', quantity: 30, operatorName: 'VINICIUS R' }),
          seat({ entLan: 35984, productCode: '1045', quantity: 20, operatorName: 'ALICE' }),
        ],
      }),
    );

    const operators = massasUnifiedOperators(rows);

    assert.deepEqual(
      operators.map((operator) => operator.name),
      ['Alice', 'VINICIUS R'],
    );
    assert.equal(operators.find((operator) => operator.name === 'VINICIUS R')?.key, 'vinicius r');
  });

  it('consolidates one product from the exact units of every line, never from rounded lines', () => {
    // Two seats of three units in a ten-unit box are one open box, not two: summing the rows' boxes would
    // report a box the plant never packed.
    const rows = massasUnifiedRows(
      input({
        movements: [
          seat({ entLan: 9101, productCode: '1045', quantity: 3, operatorName: 'JOAO H' }),
          seat({ entLan: 9102, productCode: '1045', quantity: 3, operatorName: 'JOAO H' }),
        ],
      }),
    );

    const summary = massasUnifiedSummary(rows);

    assert.equal(summary.products.length, 1);
    assert.equal(summary.products[0].totalUnits, 6);
    assert.equal(summary.products[0].totalBoxes, 1);
    assert.equal(summary.products[0].openBoxUnits, 6);
    assert.equal(summary.workers[0].units, 6);
    assert.equal(summary.workers[0].boxes, 1);
    assert.deepEqual(summary.workerNamesByProduct.get('1045'), ['JOAO H']);
  });

  it('adds a worker boxes product by product, because each product has its own box', () => {
    const rows = massasUnifiedRows(
      input({
        products: [...PRODUCTS, ...QUADRADA],
        movements: [
          seat({ entLan: 9201, productCode: '1192', quantity: 182, operatorName: 'VINICIUS R' }),
          seat({ entLan: 9202, productCode: '1045', quantity: 940, operatorName: 'VINICIUS R' }),
        ],
      }),
    );

    const summary = massasUnifiedSummary(rows);
    const vinicius = summary.workers.find((worker) => worker.name === 'VINICIUS R');

    assert.ok(vinicius);
    assert.equal(vinicius.units, 1122);
    assert.equal(vinicius.boxes, 13 + 94);
    assert.equal(vinicius.openBoxUnits, 2);
  });
});
