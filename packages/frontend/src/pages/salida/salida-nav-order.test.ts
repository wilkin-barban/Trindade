import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * The navigation is an order, not a set, and the plant reads it as a sequence.
 *
 * `Salida/Baja` and its history were appended after `Historico de Masas`, which left the module at the bottom of
 * the actions an operator opens every day. The rule is one sentence -- right below `Lancamento de Massas`, the
 * screen it continues -- and the cheapest honest way to pin an order inside a JSX list is to read the list.
 *
 * The second assertion is the one that matters as much as the order: the block is still gated by
 * `isSalidaVisible`, so moving it did not open the beta to anybody else.
 */
const shell = readFileSync(join(import.meta.dirname, '../../components/layout/AppShell.tsx'), 'utf-8');

function indexOf(href: string): number {
  const position = shell.indexOf(`href="${href}"`);
  assert.notEqual(position, -1, `${href} is not rendered by AppShell.tsx`);
  return position;
}

describe('salida navigation order', () => {
  it('follows the order the plant reads: each salida item below its massas counterpart', () => {
    const expected = [
      '/massas-launch',
      '/salida',
      '/assai-calculator',
      '/stock-calculator',
      '/massas-history',
      '/salida-history',
      '/stock-history',
      '/loading/reports-history',
      '/loading/history',
      '/compartir',
    ];
    const positions = expected.map((href) => indexOf(href));
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(
        positions[index - 1]! < positions[index]!,
        `${expected[index - 1]} must come before ${expected[index]}`,
      );
    }
  });

  it('keeps both items behind the wilkin gate', () => {
    for (const href of ['/salida', '/salida-history']) {
      const before = shell.slice(0, indexOf(href));
      const guard = before.lastIndexOf('isSalidaVisible(user)');
      assert.notEqual(guard, -1, `${href} must still be rendered only for wilkin`);
      // The guard wraps the single item, so nothing between it and the href can close the JSX expression.
      const between = shell.slice(guard, indexOf(href));
      assert.match(between, /isSalidaVisible\(user\) && \(/);
      assert.ok(!between.includes(')}'), `${href} escaped the guard`);
    }
  });
});
