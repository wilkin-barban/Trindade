import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { salidaDaySummaryText, salidaPhotoFiles, shareSalida } from './salida.js';
import type { SalidaMovement } from './salida.js';

/**
 * The day's share is the one action the operator could not find on the phone.
 *
 * These cases pin the three things that make it useful: a day summary that names what left (and not only a total),
 * the photos travelling as files when the browser can carry them, and a fallback that opens WhatsApp instead of
 * silently copying into a clipboard nobody sees.
 */
function movement(overrides: Partial<SalidaMovement> & { id: number }): SalidaMovement {
  return {
    movement_date: '2026-11-14',
    user_id: 1,
    username: 'wilkin',
    display_name: 'Wilkin',
    created_at: '2026-11-14T11:00:00.000Z',
    items: [
      {
        id: overrides.id * 10,
        product_code: '1474',
        product_name: 'EMBALAG. NHOQUE 1kg',
        block: 'embalagens',
        quantity: 20,
        position: 0,
      },
    ],
    photos: [],
    total_units: 20,
    reconciliation: { status: 'pending', ent_lans: [], matched_item_ids: [] },
    ...overrides,
  };
}

const labels = {
  title: 'Salidas del día',
  movements: 'Movimientos',
  total: 'Total',
  operator: 'Operador',
  blocks: { embalagens: 'Embalajes', bobinas: 'Bobinas', 'materia-prima': 'Materia Prima' },
  status: { reconciled: 'ERP OK', partial: 'Parcial', pending: 'Pendente' },
} as const;

describe('salidaDaySummaryText', () => {
  it('names the day, how many movements it holds and their total', () => {
    const text = salidaDaySummaryText(
      [movement({ id: 1 }), movement({ id: 2, total_units: 5, items: [{
        id: 20,
        product_code: '1900',
        product_name: 'BOBINA ROLO',
        block: 'bobinas',
        quantity: 5,
        position: 0,
      }] })],
      { date: '2026-11-14', labels },
    );

    assert.match(text, /Salidas del día/);
    assert.match(text, /14\/11\/2026/);
    assert.match(text, /Movimientos: 2/);
    // The products keep their Portuguese names; only the labels come from the dictionary.
    assert.match(text, /EMBALAG\. NHOQUE 1kg/);
    assert.match(text, /BOBINA ROLO/);
    assert.match(text, /Embalajes/);
    assert.match(text, /Bobinas/);
    assert.match(text, /Total: 25 un/);
  });

  it('carries the operator and the reconciliation state of each movement', () => {
    const text = salidaDaySummaryText(
      [
        movement({ id: 1, reconciliation: { status: 'reconciled', ent_lans: [4242], matched_item_ids: [10] } }),
        movement({ id: 2, reconciliation: { status: 'partial', ent_lans: [5151], matched_item_ids: [] } }),
      ],
      { date: '2026-11-14', labels },
    );

    assert.match(text, /WILKIN/);
    assert.match(text, /ERP OK/);
    assert.match(text, /Parcial/);
    assert.match(text, /4242/);
  });

  it('answers an empty day with a text that says so instead of a bare total', () => {
    const text = salidaDaySummaryText([], { date: '2026-11-14', labels });
    assert.match(text, /Movimientos: 0/);
    assert.match(text, /Total: 0 un/);
  });
});

describe('salidaPhotoFiles', () => {
  it('turns the record photos into files the share sheet can carry', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      assert.equal(url, 'https://example.test/api/salida/photos/public/abc');
      return { ok: true, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) };
    }) as typeof fetch;
    try {
      const files = await salidaPhotoFiles([
        { id: 7, mime_type: 'image/jpeg', publicUrl: 'https://example.test/api/salida/photos/public/abc' },
      ]);
      assert.equal(files.length, 1);
      assert.equal(files[0]!.name, 'salida-7.jpg');
      assert.equal(files[0]!.type, 'image/jpeg');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('leaves out a photo that cannot be fetched instead of losing the whole share', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    try {
      const files = await salidaPhotoFiles([
        { id: 1, mime_type: 'image/jpeg', publicUrl: 'https://example.test/a.jpg' },
        { id: 2, mime_type: 'image/jpeg', url: '/b.jpg' },
      ]);
      assert.deepEqual(files, []);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('shareSalida fallbacks', () => {
  function withBrowser(options: { share?: unknown; clipboard?: unknown; open?: unknown }, fn: () => Promise<void>) {
    return async () => {
      const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: options.share === undefined && options.clipboard === undefined
          ? {}
          : { share: options.share, clipboard: options.clipboard },
      });
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: options.open } });
      try {
        await fn();
      } finally {
        if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
        else Reflect.deleteProperty(globalThis, 'navigator');
        if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
        else Reflect.deleteProperty(globalThis, 'window');
      }
    };
  }

  it('opens WhatsApp when the browser has no share sheet', withBrowser(
    { open: () => ({}) },
    async () => {
      const opened: string[] = [];
      Object.defineProperty(globalThis.window, 'open', {
        configurable: true,
        value: (url: string) => {
          opened.push(url);
          return {};
        },
      });

      const outcome = await shareSalida({ text: 'Hola planta' });

      assert.equal(outcome, 'shared');
      assert.equal(opened.length, 1);
      assert.match(opened[0]!, /^https:\/\/api\.whatsapp\.com\/send\?text=/);
      assert.match(opened[0]!, /Hola%20planta/);
    },
  ));

  it('copies the text when the WhatsApp popup is blocked', withBrowser(
    { open: () => null, clipboard: { writeText: async () => {} } },
    async () => {
      const outcome = await shareSalida({ text: 'Hola planta' });
      assert.equal(outcome, 'copied');
    },
  ));

  it('prefers the share sheet with the files when the platform can carry them', withBrowser(
    { share: async (data: ShareData) => { assert.equal(data.files?.length, 1); assert.equal(data.text, 'Hola'); } },
    async () => {
      const file = new File([new Uint8Array([1])], 'salida-1.jpg', { type: 'image/jpeg' });
      Object.defineProperty(globalThis.navigator, 'canShare', { configurable: true, value: () => true });
      const outcome = await shareSalida({ text: 'Hola', photos: [file] });
      assert.equal(outcome, 'shared');
    },
  ));
});
