import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SALIDA_AUDIT_DESTINATION,
  SALIDA_BETA_USERNAME,
  SALIDA_TICKET_REFUSED,
  buildSalidaPayloads,
  buildSalidaTrips,
  salidaReadRequestedEvent,
  salidaReadResultEvent,
  salidaSyncRequestedEvent,
  salidaSyncResultEvent,
  clearSalidaOutbox,
  clearSalidaLastMovement,
  isSalidaVisible,
  readSalidaLastMovement,
  readSalidaOutbox,
  salidaDateLine,
  salidaEntLans,
  salidaItemsFromQuantities,
  salidaMovementBlocks,
  salidaPhotoRejection,
  salidaProductsByBlock,
  salidaQuantity,
  salidaReconciliationLabelKey,
  salidaReconciliationStatus,
  salidaSummaryText,
  salidaTodayLine,
  salidaTotalUnits,
  shareSalida,
  submitSalida,
  takeSalidaTrip,
  writeSalidaLastMovement,
  writeSalidaOutbox,
  SALIDA_FALLBACK_PRODUCTS,
  SALIDA_MAX_PHOTOS,
  type SalidaMovement,
  type SalidaProduct,
} from './salida.js';
import type { StorageLike } from './aero-integration';
import { AERO_RESPONSE_MAX, buildAeroAuditBody, type AeroAuditBody } from './aero-audit';
import { loadAeroPendingAttempt, saveAeroPendingAttempt } from './aero-pending-attempt';

/** A storage that behaves like the browser's, without one. */
function memoryStorage(): StorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

/** A day of the catalogue the backend serves, the way the tests want to read it. */
const CATALOG: SalidaProduct[] = [
  ...SALIDA_FALLBACK_PRODUCTS,
];

function movement(overrides: Partial<SalidaMovement> = {}): SalidaMovement {
  return {
    id: 12,
    movement_date: '2026-11-13',
    user_id: 1,
    username: 'wilkin',
    display_name: 'Wilkin',
    created_at: '2026-11-13T11:00:00.000Z',
    items: [
      {
        id: 1,
        product_code: '1474',
        product_name: 'EMBALAG. NHOQUE 1kg',
        block: 'embalagens',
        quantity: 20,
        position: 0,
      },
      {
        id: 2,
        product_code: '1673',
        product_name: 'GORDURA VEGETAL',
        block: 'materia-prima',
        quantity: 5,
        position: 1,
      },
    ],
    photos: [],
    total_units: 25,
    reconciliation: { status: 'pending', ent_lans: [], matched_item_ids: [] },
    ...overrides,
  };
}

describe('the fixed catalogue', () => {
  const grouped = salidaProductsByBlock(CATALOG);

  it('has 21 products split 13 / 3 / 5', () => {
    assert.equal(CATALOG.length, 21);
    assert.equal(grouped.embalagens.length, 13);
    assert.equal(grouped.bobinas.length, 3);
    assert.equal(grouped['materia-prima'].length, 5);
  });

  it('carries no 1040 and only one 1673', () => {
    assert.equal(CATALOG.some((product) => product.code === '1040'), false);
    assert.equal(CATALOG.filter((product) => product.code === '1673').length, 1);
  });

  it('keeps the Portuguese names the ERP knows', () => {
    assert.equal(grouped.bobinas[0]?.name, 'BOBINA ROLO');
    assert.equal(grouped['materia-prima'][3]?.name, 'AÇÚCAR 5kg');
    assert.equal(grouped.embalagens[0]?.name, 'EMBALAG. NHOQUE 1kg');
  });
});

describe('who sees the module', () => {
  it('is the exact account the server guards, and nobody else', () => {
    assert.equal(isSalidaVisible({ username: 'wilkin' }), true);
    // A stray space from storage is not another account: the value is trimmed before it is compared.
    assert.equal(isSalidaVisible({ username: ' wilkin ' }), true);
    // The server's `requireUsername('wilkin')` compares exactly. A `Wilkin` login would be shown both menu items
    // and then refused by every route, so the client rule is the same rule and not a friendlier one.
    assert.equal(isSalidaVisible({ username: 'Wilkin' }), false);
    assert.equal(isSalidaVisible({ username: 'WILKIN' }), false);
    assert.equal(isSalidaVisible({ username: 'wilkin2' }), false);
    assert.equal(isSalidaVisible({ username: 'admin' }), false);
    assert.equal(isSalidaVisible(null), false);
    assert.equal(isSalidaVisible({}), false);
  });

  it('names the beta account in the spelling the server uses', () => {
    assert.equal(SALIDA_BETA_USERNAME, 'wilkin');
  });
});

describe('quantities', () => {
  it('accepts only whole units above zero', () => {
    assert.equal(salidaQuantity('20'), 20);
    assert.equal(salidaQuantity(' 7 '), 7);
    assert.equal(salidaQuantity('0'), 0);
    assert.equal(salidaQuantity('12.5'), 0);
    assert.equal(salidaQuantity('1e3'), 0);
    assert.equal(salidaQuantity('-3'), 0);
    assert.equal(salidaQuantity(''), 0);
    assert.equal(salidaQuantity(null), 0);
    assert.equal(salidaQuantity(4), 4);
    assert.equal(salidaQuantity(4.5), 0);
  });

  it('builds the items of the active blocks only, in catalogue order', () => {
    const items = salidaItemsFromQuantities(
      { '1673': '5', '1474': '20', '1900': '3' },
      CATALOG,
      ['embalagens', 'materia-prima'],
    );
    assert.deepEqual(items, [
      { code: '1474', quantity: 20 },
      { code: '1673', quantity: 5 },
    ]);
  });

  it('counts the units of a launch', () => {
    assert.equal(salidaTotalUnits([{ quantity: 20 }, { quantity: 5 }]), 25);
    assert.equal(salidaTotalUnits([]), 0);
  });
});

describe('the ERP payload', () => {
  const payloads = buildSalidaPayloads(
    [
      { code: '1474', quantity: 20 },
      { code: '1673', quantity: 5 },
    ],
    { date: '2026-11-13', username: 'wilkin', products: CATALOG },
  );

  it('writes one payload per product, in the order given', () => {
    assert.equal(payloads.length, 2);
    assert.equal(payloads[0]?.PRO_COD, '001474');
    assert.equal(payloads[1]?.PRO_COD, '001673');
  });

  it('carries every field of S7 and none of the entry ones', () => {
    assert.deepEqual(payloads[0], {
      PRO_COD: '001474',
      PRO_DES: 'EMBALAG. NHOQUE 1kg',
      PRO_QTD: 2000,
      PED_DTA: '2026-11-13',
      PED_USU: 'WILKIN',
      PED_SER: 'APL',
      PED_DTANOT: '2026-11-13',
      PED_OBS: 'Saida de insumos via Trindade',
      LOTES: [],
    });
    assert.equal('PRO_CST' in (payloads[0] ?? {}), false);
    assert.equal('PED_DTMOVI' in (payloads[0] ?? {}), false);
  });

  it('multiplies units by 100 and pads the code to six digits', () => {
    const [single] = buildSalidaPayloads([{ code: '1012', quantity: 7 }], {
      date: '2026-11-13',
      username: 'wilkin',
      products: CATALOG,
    });
    assert.equal(single?.PRO_QTD, 700);
    assert.equal(single?.PRO_COD, '001012');
  });

  it('drops codes the catalogue does not carry and repeats', () => {
    const kept = buildSalidaPayloads(
      [
        { code: '1040', quantity: 4 },
        { code: '1474', quantity: 3 },
        { code: '1474', quantity: 9 },
      ],
      { date: '2026-11-13', username: 'wilkin', products: CATALOG },
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.PRO_QTD, 300);
  });
});

describe('the trips to the ERP', () => {
  const payloads = buildSalidaPayloads(
    SALIDA_FALLBACK_PRODUCTS.map((product) => ({ code: product.code, quantity: 1 })),
    { date: '2026-11-13', username: 'wilkin', products: CATALOG },
  );

  it('sends up to eight products per ticket', () => {
    const trips = buildSalidaTrips(payloads);
    assert.equal(payloads.length, 21);
    assert.deepEqual(trips.map((trip) => trip.payloads.length), [8, 8, 5]);
  });

  it('arms the saida action on every trip', () => {
    for (const trip of buildSalidaTrips(payloads)) {
      assert.equal(trip.action, 'saida');
    }
  });

  it('sends nothing when there is nothing to send', () => {
    assert.deepEqual(buildSalidaTrips([]), []);
  });

  it('never shares payload objects with the caller', () => {
    const [first] = buildSalidaTrips(payloads);
    assert.notEqual(first?.payloads[0], payloads[0]);
    assert.deepEqual(first?.payloads[0], payloads[0]);
  });
});

describe('the write order', () => {
  it('persists in Trindade, then uploads photos, then calls the ERP', async () => {
    const calls: string[] = [];
    const result = await submitSalida([{ code: '1474', quantity: 20 }], {
      create: async () => {
        calls.push('create');
        return movement();
      },
      uploadPhotos: async () => {
        calls.push('photos');
      },
      sendToErp: async () => {
        calls.push('erp');
        return true;
      },
    });

    assert.deepEqual(calls, ['create', 'photos', 'erp']);
    assert.equal(result.erp, 'sent');
    assert.equal(result.movement?.id, 12);
  });

  it('never calls the ERP when Trindade could not write', async () => {
    const calls: string[] = [];
    const result = await submitSalida([{ code: '1474', quantity: 20 }], {
      create: async () => {
        calls.push('create');
        throw new Error('sin conexión');
      },
      uploadPhotos: async () => {
        calls.push('photos');
      },
      sendToErp: async () => {
        calls.push('erp');
        return true;
      },
    });

    assert.deepEqual(calls, ['create']);
    assert.equal(result.movement, null);
    assert.equal(result.erp, 'pending');
    assert.match(result.error ?? '', /sin conexión/);
  });

  it('keeps the movement when the photos or the ERP fail', async () => {
    const result = await submitSalida([{ code: '1474', quantity: 20 }], {
      create: async () => movement(),
      uploadPhotos: async () => {
        throw new Error('foto grande');
      },
      sendToErp: async () => false,
    });

    assert.equal(result.movement?.id, 12);
    assert.equal(result.photoError, true);
    assert.equal(result.erp, 'pending');
  });
});

describe('photos', () => {
  const image = (size: number, type = 'image/jpeg') => ({ size, type });

  it('allows three photos and refuses the fourth', () => {
    assert.equal(SALIDA_MAX_PHOTOS, 3);
    assert.equal(salidaPhotoRejection([image(10), image(10)], 0), null);
    assert.equal(salidaPhotoRejection([image(10)], 2), null);
    assert.equal(salidaPhotoRejection([image(10)], 3), 'count');
    assert.equal(salidaPhotoRejection([image(10), image(10)], 2), 'count');
  });

  it('refuses a file over 5 MB and a type the server would not accept', () => {
    assert.equal(salidaPhotoRejection([image(5 * 1024 * 1024)], 0), null);
    assert.equal(salidaPhotoRejection([image(5 * 1024 * 1024 + 1)], 0), 'size');
    assert.equal(salidaPhotoRejection([image(10, 'image/gif')], 0), 'type');
    assert.equal(salidaPhotoRejection([image(10, 'image/webp')], 0), null);
  });
});

describe('the summary an operator forwards', () => {
  const text = salidaSummaryText(movement());

  it('names the day, the operator, every block, every product and the total', () => {
    assert.match(text, /13\/11\/2026/);
    assert.match(text, /WILKIN/);
    assert.match(text, /Embalagens/);
    assert.match(text, /Matéria-Prima/);
    assert.match(text, /1474 EMBALAG\. NHOQUE 1kg — 20 un/);
    assert.match(text, /1673 GORDURA VEGETAL — 5 un/);
    assert.match(text, /Total: 25 un/);
  });

  it('translates the block titles when the screen passes its dictionary', () => {
    const spanish = salidaSummaryText(movement(), {
      embalagens: 'Embalajes',
      bobinas: 'Bobinas',
      'materia-prima': 'Materia Prima',
    });
    assert.match(spanish, /Embalajes/);
    assert.match(spanish, /Materia Prima/);
    assert.doesNotMatch(spanish, /Embalagens/);
    // The product keeps its Portuguese name in both languages: it is the ERP's name.
    assert.match(spanish, /EMBALAG\. NHOQUE 1kg/);
  });

  it('copies the text when the platform cannot share files', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const written: string[] = [];
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        share: undefined,
        clipboard: { writeText: async (value: string) => void written.push(value) },
      },
    });
    try {
      const outcome = await shareSalida({ text, photos: [] });
      assert.equal(outcome, 'copied');
      assert.deepEqual(written, [text]);
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
      else Reflect.deleteProperty(globalThis, 'navigator');
    }
  });
});

describe('reconciliation badges', () => {
  it('reads the state the server sent', () => {
    assert.equal(salidaReconciliationStatus(movement()), 'pending');
    assert.equal(
      salidaReconciliationStatus({ reconciliation: { status: 'reconciled', ent_lans: [1], matched_item_ids: [1] } }),
      'reconciled',
    );
    assert.equal(salidaReconciliationStatus({ reconciliation: null }), 'pending');
  });

  it('names the badge in both languages through one key', () => {
    assert.equal(salidaReconciliationLabelKey('reconciled'), 'salida.erpOk');
    assert.equal(salidaReconciliationLabelKey('partial'), 'salida.erpPartial');
    assert.equal(salidaReconciliationLabelKey('pending'), 'salida.erpPending');
  });

  it('lists the ENT_LAN values once, smallest first', () => {
    assert.deepEqual(
      salidaEntLans({ reconciliation: { status: 'partial', ent_lans: [9, 4, 9], matched_item_ids: [] } }),
      [4, 9],
    );
    assert.deepEqual(salidaEntLans(null), []);
  });

  it('names the blocks a movement covers in screen order', () => {
    assert.deepEqual(salidaMovementBlocks(movement()), ['embalagens', 'materia-prima']);
  });
});

describe('the fixed date line', () => {
  it('is Hoje with the plant day as dd/mm/yyyy', () => {
    assert.equal(salidaDateLine('2026-11-13'), 'Hoje · 13/11/2026');
    // 01:30 UTC is still the previous day in São Paulo.
    assert.equal(salidaTodayLine(new Date('2026-11-13T01:30:00.000Z')), 'Hoje · 12/11/2026');
  });
});

describe('the trips that must survive leaving the page', () => {
  it('stores the remaining trips and hands them out one at a time', () => {
    const storage = memoryStorage();
    const trips = buildSalidaTrips(
      buildSalidaPayloads(
        SALIDA_FALLBACK_PRODUCTS.slice(0, 10).map((product) => ({ code: product.code, quantity: 1 })),
        { date: '2026-11-13', username: 'wilkin', products: CATALOG },
      ),
    );
    writeSalidaOutbox(
      { movementId: 12, date: '2026-11-13', trips, startedAt: '2026-11-13T11:00:00.000Z' },
      storage,
    );

    const stored = readSalidaOutbox(storage);
    assert.equal(stored?.trips.length, 2);

    const first = takeSalidaTrip(stored);
    assert.equal(first.trip?.payloads.length, 8);
    assert.equal(first.rest?.trips.length, 1);

    const second = takeSalidaTrip(first.rest);
    assert.equal(second.trip?.payloads.length, 2);
    assert.equal(second.rest, null);

    clearSalidaOutbox(storage);
    assert.equal(readSalidaOutbox(storage), null);
  });

  it('refuses an outbox it cannot trust', () => {
    const storage = memoryStorage();
    storage.setItem('trindade.salida.outbox.v1', '{not json');
    assert.equal(readSalidaOutbox(storage), null);
  });
});

describe('the movement the return dialog shows', () => {
  it('round-trips through the session and is dropped once shown', () => {
    const storage = memoryStorage();
    writeSalidaLastMovement(movement(), storage);
    const read = readSalidaLastMovement(storage);
    assert.equal(read?.id, 12);
    assert.equal(read?.total_units, 25);
    clearSalidaLastMovement(storage);
    assert.equal(readSalidaLastMovement(storage), null);
  });
});

describe('the audit pair of one trip (S13)', () => {
  const ATTEMPT = { attemptId: 'attempt-saida-1', startedAt: 1_700_000_000_000 };
  const payloads = buildSalidaPayloads(
    [
      { code: '1474', quantity: 20 },
      { code: '1673', quantity: 5 },
    ],
    { date: '2026-11-13', username: 'wilkin', products: CATALOG },
  );
  const trip = { index: 1, total: 2 };

  function body(event: Parameters<typeof buildAeroAuditBody>[0], at = ATTEMPT.startedAt): AeroAuditBody {
    return buildAeroAuditBody(event, at);
  }

  it('names the same attempt on the requested and the result line', () => {
    const requested = body(
      salidaSyncRequestedEvent({ payloads, trip, attempt: ATTEMPT, destinationUrl: SALIDA_AUDIT_DESTINATION }),
    );
    const result = body(
      salidaSyncResultEvent({ attempt: ATTEMPT, outcome: 'ok', message: 'Saidas enviadas', trip: { index: 1, total: 1 } }),
      ATTEMPT.startedAt + 2400,
    );

    assert.equal(requested.event, 'salida_sync');
    assert.equal(result.event, 'salida_sync');
    assert.equal(requested.phase, 'requested');
    assert.equal(result.phase, 'result');
    assert.equal(requested.attemptId, ATTEMPT.attemptId);
    assert.equal(result.attemptId, ATTEMPT.attemptId);
    assert.equal(requested.client, 'web');
    assert.equal(result.client, 'web');
    assert.equal(requested.destinationUrl, SALIDA_AUDIT_DESTINATION);
    assert.equal(result.destinationUrl, SALIDA_AUDIT_DESTINATION);
    // The trip says which of the batches it is, because a launch of more than eight products is more than one.
    assert.match(requested.note ?? '', /trip 1\/2/);
    assert.match(requested.note ?? '', /batch 2/);
    assert.match(result.note ?? '', /trip 1\/1/);
    assert.equal(result.durationMs, 2400);
  });

  it('carries the trip payloads, in order', () => {
    const requested = body(salidaSyncRequestedEvent({ payloads, trip, attempt: ATTEMPT }));
    assert.deepEqual(requested.payload, payloads);

    const single = body(salidaSyncRequestedEvent({ payloads: [payloads[0]!], trip: { index: 1, total: 1 }, attempt: ATTEMPT }));
    assert.deepEqual(single.payload, payloads[0]);
  });

  it('reports the ERP answer and the HTTP outcome of the result', () => {
    const ok = body(salidaSyncResultEvent({ attempt: ATTEMPT, outcome: 'ok', message: 'Saidas enviadas' }));
    assert.equal(ok.httpStatus, 200);
    assert.equal(ok.response, 'Saidas enviadas');
    assert.equal(ok.error, null);

    const refused = body(
      salidaSyncResultEvent({ attempt: ATTEMPT, outcome: 'error', message: 'Produto inexistente' }),
    );
    assert.equal(refused.httpStatus, null);
    assert.match(refused.error ?? '', /^AERO_/);
    assert.match(refused.error ?? '', /Produto inexistente/);
  });

  it('names a refused ticket before anything left the page', () => {
    const refused = body(
      salidaSyncRequestedEvent({
        payloads,
        trip: { index: 1, total: 3 },
        error: SALIDA_TICKET_REFUSED,
        note: 'batch 2 not sent',
      }),
    );
    assert.equal(refused.event, 'salida_sync');
    assert.equal(refused.phase, 'requested');
    assert.equal(refused.error, SALIDA_TICKET_REFUSED);
    assert.equal(refused.httpStatus, undefined);
    assert.match(refused.note ?? '', /not sent/);
  });

  it('trims the ERP sentence to the column the server enforces', () => {
    const long = 'X'.repeat(AERO_RESPONSE_MAX + 500);
    const result = body(salidaSyncResultEvent({ attempt: ATTEMPT, outcome: 'ok', message: long }));
    assert.ok((result.response ?? '').length <= AERO_RESPONSE_MAX);
  });

  it('writes the read pair of Conferir no ERP', () => {
    const requested = body(
      salidaReadRequestedEvent({
        date: '2026-11-13',
        payload: { date: '2026-11-13', entrySaida: 'S' },
        attempt: ATTEMPT,
      }),
    );
    const result = body(salidaReadResultEvent({ date: '2026-11-13', attempt: ATTEMPT, seats: 3, stored: 3 }));

    assert.equal(requested.event, 'read_history');
    assert.equal(requested.phase, 'requested');
    assert.equal(result.event, 'read_history');
    assert.equal(result.phase, 'result');
    assert.equal(requested.attemptId, ATTEMPT.attemptId);
    assert.equal(result.attemptId, ATTEMPT.attemptId);
    assert.equal(result.httpStatus, 200);
    assert.match(requested.note ?? '', /date=2026-11-13/);
    assert.match(result.note ?? '', /seats=3/);
    assert.match(result.note ?? '', /stored=3/);
  });

  it('reports a refused read with its code and no invented status', () => {
    const result = body(
      salidaReadResultEvent({ date: '2026-11-13', attempt: ATTEMPT, seats: null, error: 'movements_unreadable' }),
    );
    assert.equal(result.httpStatus, null);
    assert.match(result.error ?? '', /^AERO_MOVEMENTS_UNREADABLE/);
    assert.match(result.note ?? '', /refused/);
  });

  it('never writes a credential or an Authorization value', () => {
    const bodies = [
      body(salidaSyncRequestedEvent({ payloads, trip, attempt: ATTEMPT })),
      body(salidaSyncResultEvent({ attempt: ATTEMPT, outcome: 'ok', message: 'OK' })),
      body(salidaReadRequestedEvent({ date: '2026-11-13', payload: { date: '2026-11-13' }, attempt: ATTEMPT })),
      body(salidaReadResultEvent({ date: '2026-11-13', attempt: ATTEMPT, seats: 2, stored: 2 })),
    ];

    const forbiddenKey = /authorization|password|senha|credential|token|secret/i;
    const forbiddenText = /authorization|password|senha|basic\s/i;

    function walk(value: unknown, path: string): void {
      if (Array.isArray(value)) {
        for (const entry of value) walk(entry, path);
        return;
      }
      if (typeof value === 'object' && value !== null) {
        for (const [key, inner] of Object.entries(value)) {
          assert.equal(forbiddenKey.test(key), false, `credential-like key at ${path}.${key}`);
          walk(inner, `${path}.${key}`);
        }
        return;
      }
      if (typeof value === 'string') {
        assert.equal(forbiddenText.test(value), false, `credential-like text at ${path}`);
      }
    }

    for (const auditBody of bodies) walk(auditBody, 'body');
  });

  it('keeps a saida attempt in storage, apart from the entry trips', () => {
    const storage = memoryStorage();
    saveAeroPendingAttempt(
      { action: 'saida', attemptId: 'attempt-saida-9', startedAt: 5, date: '2026-11-13' },
      storage,
    );

    assert.deepEqual(loadAeroPendingAttempt('saida', storage), {
      action: 'saida',
      attemptId: 'attempt-saida-9',
      startedAt: 5,
      date: '2026-11-13',
    });
    // The launch page must not borrow the identifier of an entry that is still in flight, nor the reverse.
    assert.equal(loadAeroPendingAttempt('entrada', storage), null);
    assert.equal(loadAeroPendingAttempt('movimentos', storage), null);
  });
});

describe('salida i18n parity', () => {
  type Dictionary = { [key: string]: string | Dictionary };

  function read(locale: string): Dictionary {
    const url = new URL(`../i18n/locales/${locale}.json`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')) as Dictionary;
  }

  function flatten(node: Dictionary, prefix = ''): Map<string, string> {
    const flat = new Map<string, string>();
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') flat.set(path, value);
      else for (const [inner, text] of flatten(value, path)) flat.set(inner, text);
    }
    return flat;
  }

  const pt = flatten(read('pt-BR'));
  const es = flatten(read('es'));

  it('labels the reconciliation states in both languages', () => {
    for (const key of ['salida.erpOk', 'salida.erpPending', 'salida.erpPartial']) {
      assert.ok((pt.get(key) ?? '').trim().length > 0, `pt-BR is missing ${key}`);
      assert.ok((es.get(key) ?? '').trim().length > 0, `es is missing ${key}`);
    }
  });

  it('has the same salida keys on both sides', () => {
    const ptKeys = [...pt.keys()].filter((key) => key.startsWith('salida.'));
    const esKeys = [...es.keys()].filter((key) => key.startsWith('salida.'));
    assert.ok(ptKeys.length >= 30, `expected a full salida namespace, got ${ptKeys.length} keys`);
    assert.deepEqual(ptKeys.filter((key) => !es.has(key)), []);
    assert.deepEqual(esKeys.filter((key) => !pt.has(key)), []);
  });

  it('keeps the two navigation entries and their help entries in both languages', () => {
    for (const key of ['nav.salida', 'nav.salidaHistory', 'moduleHelp.salida.title', 'moduleHelp.salidaHistory.title']) {
      assert.ok((pt.get(key) ?? '').trim().length > 0, `pt-BR is missing ${key}`);
      assert.ok((es.get(key) ?? '').trim().length > 0, `es is missing ${key}`);
    }
  });
});
