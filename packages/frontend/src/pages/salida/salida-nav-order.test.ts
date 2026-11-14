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
  it('places Salida/Baja and its history right below Lanzamiento de Masas', () => {
    const launch = indexOf('/massas-launch');
    const salida = indexOf('/salida');
    const history = indexOf('/salida-history');
    const assai = indexOf('/assai-calculator');
    const stock = indexOf('/stock-calculator');
    const massasHistory = indexOf('/massas-history');

    assert.ok(launch < salida, 'Salida/Baja must come after Lanzamiento de Masas');
    assert.ok(salida < history, 'Histórico de Salidas must come after Salida/Baja');
    assert.ok(history < assai, 'the calculators must come after the salida pair');
    assert.ok(assai < stock, 'the Assaí calculator keeps its place before the stock one');
    assert.ok(stock < massasHistory, 'the massas history keeps its place after the calculators');
  });

  it('keeps both items behind the wilkin gate', () => {
    const before = shell.slice(0, indexOf('/salida'));
    const guard = before.lastIndexOf('isSalidaVisible(user)');
    assert.notEqual(guard, -1, 'the salida items must still be rendered only for wilkin');
    const between = shell.slice(guard, indexOf('/salida-history'));
    assert.match(between, /isSalidaVisible\(user\) && \(/);
  });
});
