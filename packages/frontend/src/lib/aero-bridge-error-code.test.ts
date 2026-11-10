import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The bridge error message is chosen by its code, not by the fact that it is an error.
 *
 * The script emits exactly one code today (`wifi_required`), but the web is what decides which sentence the
 * operator reads. Mapping every `aero_error` to the Wi-Fi sentence would tell someone to check the network when
 * the bridge failed for another reason, and the code is the only stable thing to branch on.
 */
function read(...parts: string[]): string {
  return readFileSync(new URL(parts.join('/'), import.meta.url), 'utf8');
}

const consumers = [
  ['Massas', read('..', 'pages', 'MassasLaunchPage.tsx')],
  ['Panel', read('..', 'pages', 'massas', 'AeroIntegrationPanel.tsx')],
  ['Relatório', read('..', 'components', 'reports', 'ReceiptsSection.tsx')],
] as const;

describe('the bridge error message', () => {
  it('asks the code before choosing the Wi-Fi sentence, in every screen that shows it', () => {
    for (const [name, source] of consumers) {
      assert.ok(
        source.includes("parsed.code === 'wifi_required'"),
        `${name} must branch on the error code before showing the Wi-Fi message`,
      );
      assert.ok(
        source.includes("t('massas.aero.bridgeError')"),
        `${name} needs the generic sentence for the other codes`,
      );
    }
  });

  it('keeps both sentences in the locales, with parity', () => {
    const es = read('..', 'i18n', 'locales', 'es.json');
    const pt = read('..', 'i18n', 'locales', 'pt-BR.json');

    for (const source of [es, pt]) {
      assert.ok(source.includes('wifiRequired'), 'the Wi-Fi sentence must exist');
      assert.ok(source.includes('bridgeError'), 'the generic sentence must exist');
    }
  });
});
