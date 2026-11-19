import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openWhatsAppText, shareOrCopy, whatsappTextLink } from './whatsapp';
import { shareReportMessage } from './report-share';

/**
 * El botón de compartir nunca se queda sin hacer nada.
 *
 * El dueño reportó que en el Relatório el botón «Compartilhar no WhatsApp» no hacía nada. La causa: el navegador
 * no tenía hoja nativa y el portapapeles tampoco estaba o lo rechazaba, y el ayudante devolvía `failed` sin abrir
 * nada. Ahora, cuando las dos vías fallan, el texto va en el enlace de WhatsApp -- que no necesita ninguna de las
 * dos -- y el resultado dice por dónde salió.
 */
describe('compartir con respaldo de WhatsApp', () => {
  const originalNavigator = globalThis.navigator;

  function withNavigator(value: { share?: unknown; clipboard?: unknown }) {
    Object.defineProperty(globalThis, 'navigator', {
      value,
      configurable: true,
      writable: true,
    });
  }

  beforeEach(() => {
    withNavigator(originalNavigator as unknown as { share?: unknown; clipboard?: unknown });
  });

  it('encodes the text into the link', () => {
    assert.equal(whatsappTextLink('Hola & chau'), 'https://api.whatsapp.com/send?text=Hola%20%26%20chau');
  });

  it('opens the link when the sheet does not exist and the clipboard is missing', async () => {
    withNavigator({});
    const calls: string[] = [];
    const outcome = await shareOrCopy('Relatório do dia', (url) => calls.push(url));

    assert.equal(outcome, 'whatsapp');
    assert.deepEqual(calls, [`https://api.whatsapp.com/send?text=${encodeURIComponent('Relatório do dia')}`]);
  });

  it('opens the link when the sheet fails and the clipboard rejects', async () => {
    withNavigator({
      share: async () => {
        throw new Error('NotAllowedError');
      },
      clipboard: { writeText: async () => Promise.reject(new Error('denied')) },
    });
    let opened = 0;

    assert.equal(await shareOrCopy('texto', () => (opened += 1)), 'whatsapp');
    assert.equal(opened, 1);
  });

  it('keeps the clipboard when it works, which is the cheaper path', async () => {
    withNavigator({ clipboard: { writeText: async () => undefined } });

    assert.equal(await shareOrCopy('texto'), 'copied');
  });

  it('a dismissed sheet copies nothing and opens nothing', async () => {
    withNavigator({
      share: async () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      },
      clipboard: { writeText: async () => undefined },
    });
    let opened = 0;

    assert.equal(await shareOrCopy('texto', () => { opened += 1; }), 'cancelled');
    assert.equal(opened, 0);
  });

  it('a blocked window says failed instead of pretending it opened', async () => {
    withNavigator({});
    assert.equal(await shareOrCopy('texto', () => null), 'failed');
    assert.equal(openWhatsAppText('texto', () => undefined), false);
  });

  it('the report message carries the same fallback, photos or not', async () => {
    withNavigator({});
    let opened = 0;

    assert.equal(await shareReportMessage({ text: 'Relatório', open: () => (opened += 1) }), 'whatsapp');
    assert.equal(opened, 1);
  });
});
