import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { massasMessage, type MassasLaunchDayView, type MassaIndividualLaunch } from './massas';
import { massasUnifiedRows } from './massas-unified';
import type { AeroErpMovementItem } from './aero-integration';

/**
 * The message the crew forwards at the end of the day.
 *
 * The plant records boxes on the company tablet and Trindade records the ones launched here. The WhatsApp
 * message is the summary of the whole day, so it is built from the unified rows -- both sources, deduplicated
 * once -- and not from the local launches alone: a worker who only exists in the ERP used to vanish from the
 * message, and his massas with him.
 */

const DATE = '2026-06-12';

const PRODUCTS = [
  { code: '1045', name: 'MASSA CASEIRA', unitsPerBox: 10 },
  { code: '1616', name: 'MASSA TOKO', unitsPerBox: 10 },
];

/** A day with the catalogue and no local launch: everything in it came from the ERP. */
function emptyDay(): MassasLaunchDayView {
  return {
    date: DATE,
    products: PRODUCTS.map((product) => ({
      code: product.code,
      name: product.name,
      unitsPerBox: product.unitsPerBox,
      totalBoxes: 0,
      totalUnits: 0,
      openBoxUnits: 0,
    })),
    launches: [],
    totalBoxes: 0,
    totalUnits: 0,
  };
}

function seat(args: { entLan: number; productCode: string; quantity: number; operatorName: string }): AeroErpMovementItem {
  return {
    entLan: args.entLan,
    productCode: args.productCode,
    productDesc: 'MASSA',
    quantity: args.quantity,
    entryDate: DATE,
    operatorName: args.operatorName,
    movementType: 'E',
  };
}

function launch(args: { id: number; productCode: string; units: number; entLan: number | null }): MassaIndividualLaunch {
  const product = PRODUCTS.find((candidate) => candidate.code === args.productCode)!;
  return {
    id: args.id,
    launch_date: DATE,
    product_code: args.productCode,
    product_name: product.name,
    boxes: Math.ceil(args.units / product.unitsPerBox),
    units: args.units,
    user_id: 7,
    username: 'jaime',
    display_name: 'Jaime',
    ent_lan: args.entLan,
    created_at: `${DATE} 10:00:00`,
    updated_at: `${DATE} 10:00:00`,
  };
}

describe('massasMessage from the unified rows', () => {
  it('lists an ERP-only worker with his massas and marks him as ERP-only', () => {
    const movements = [
      seat({ entLan: 51101, productCode: '1045', quantity: 20, operatorName: 'Jaime' }),
      seat({ entLan: 51102, productCode: '1616', quantity: 10, operatorName: 'Jaime' }),
    ];
    const rows = massasUnifiedRows({ launches: [], movements, products: PRODUCTS });

    const message = massasMessage(emptyDay(), rows);

    assert.match(message, /Jaime \(só ERP\)/);
    assert.match(message, /CASEIRA: 20 un \(2 cx\)/);
    assert.match(message, /TOKO: 10 un \(1 cx\)/);
    assert.match(message, /\*Resumo Coletivo:\*/);
    assert.match(message, /CASEIRA: 20 un \(2 cx\)/);
  });

  it('never lets a supply into the message, even when its description says MASSA', () => {
    const movements = [
      seat({ entLan: 51101, productCode: '1045', quantity: 10, operatorName: 'Jaime' }),
      // Not one of the ten: the description must not talk the message into calling it a massa.
      {
        entLan: 51200,
        productCode: '000777',
        productDesc: 'MASSA P PIZZA KIT',
        quantity: 4,
        entryDate: DATE,
        operatorName: 'JAIME',
        movementType: 'E',
      } as AeroErpMovementItem,
    ];
    const rows = massasUnifiedRows({ launches: [], movements, products: PRODUCTS });

    const message = massasMessage(emptyDay(), rows);

    assert.match(message, /CASEIRA: 10 un \(1 cx\)/);
    assert.doesNotMatch(message, /PIZZA/);
  });

  it('counts a reconciled local launch once', () => {
    const movements = [seat({ entLan: 51101, productCode: '1045', quantity: 20, operatorName: 'Jaime' })];
    const launches = [launch({ id: 1, productCode: '1045', units: 20, entLan: 51101 })];
    const rows = massasUnifiedRows({ launches, movements, products: PRODUCTS });

    const message = massasMessage({ ...emptyDay(), launches }, rows);

    // One line for Jaime's CASEIRA, not two: the ERP seat and the launch are the same twenty units.
    const workerSection = message.split('*Por Trabalhador:*')[1] ?? '';
    const caseira = workerSection.split('\n').filter((line) => line.includes('CASEIRA'));
    assert.equal(caseira.length, 1, message);
    assert.match(caseira[0], /20 un \(2 cx\)/);
    // One worker, not two spellings of the same one.
    assert.equal(workerSection.split('👤').length - 1, 1, message);
    // And Jaime has an account here, so he is not marked Só ERP.
    assert.doesNotMatch(message, /Jaime \(só ERP\)/);
  });

  it('keeps the local launches when no rows were computed yet', () => {
    const launches = [launch({ id: 1, productCode: '1045', units: 20, entLan: null })];
    const day: MassasLaunchDayView = {
      ...emptyDay(),
      products: [
        { code: '1045', name: 'MASSA CASEIRA', unitsPerBox: 10, totalBoxes: 2, totalUnits: 20, openBoxUnits: 0 },
      ],
      launches,
      totalBoxes: 2,
      totalUnits: 20,
    };

    const message = massasMessage(day);

    assert.match(message, /Jaime:/);
    assert.match(message, /CASEIRA: 20 un \(2 cx\)/);
  });
});
