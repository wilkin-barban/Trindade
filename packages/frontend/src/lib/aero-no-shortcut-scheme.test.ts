import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * El guardián del cambio: en `src` no queda forma de abrir el Atajo.
 *
 * La entrega depende de esto y no de la pantalla: un solo `href` viejo, o un módulo que vuelva a construir el
 * deep link de `shortcuts://`, deja los botones de la fábrica abriendo una app que ya no tiene el puente. El
 * esquema retirado se escribe acá partido en dos a propósito: un guardián que se nombra a sí mismo se delata
 * como infractor en la primera pasada.
 *
 * Tres exclusiones, todas con motivo:
 *
 * - `src/__e2e__`: los specs de Playwright tienen otro dueño en este cambio y no se tocan desde acá.
 * - las pruebas (`*.test.ts`, `*.test.tsx`): una prueba que demuestra la ausencia tiene que nombrar el patrón.
 * - las líneas de comentario: la prosa que cuenta la historia del Atajo no abre nada, y este guardián lee
 *   código, no relato.
 */
const RETIRED_SCHEME = ['short', 'cuts://'].join('');
const RETIRED_ACTION = ['run', 'shortcut'].join('-');

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Los símbolos que sostenían el puente viejo y ya no pueden existir en ningún módulo de `src`. */
const RETIRED_SYMBOLS = ['aeroShortcutTriggerUrl', 'aeroBridgeShortcutRecipe', 'AERO_SHORTCUT_ICLOUD_URL'];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__e2e__') continue;
      sourceFiles(full, found);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    found.push(full);
  }
  return found;
}

/** Un comentario no ejecuta nada: se descarta la línea entera antes de mirar el código. */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !(trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'));
    })
    .join('\n');
}

const files = sourceFiles(SRC);

describe('aero: the retired shortcut scheme is gone', () => {
  it('scans the whole production tree, so the assertions below are not vacuous', () => {
    // Si un refactor moviera `src`, este guardián pasaría sin mirar nada y no protegería nada.
    assert.ok(files.length > 80, `expected the guard to read the modules of src, saw ${files.length}`);
    assert.ok(
      files.some((file) => file.endsWith(path.join('pages', 'massas', 'AeroScriptableDialog.tsx'))),
      'the dialog that installs the bridge is inside the scanned tree',
    );
    assert.ok(
      files.some((file) => file.endsWith(path.join('pages', 'massas', 'AeroIntegrationPanel.tsx'))),
      'the panel that opens it is inside the scanned tree',
    );
  });

  it('leaves no module that opens the shortcut scheme or runs a shortcut', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      if (code.includes(RETIRED_SCHEME) || code.includes(RETIRED_ACTION)) {
        offenders.push(path.relative(SRC, file));
      }
    }
    assert.deepEqual(offenders, [], 'these modules still open the shortcut scheme');
  });

  it('leaves no module that names the retired bridge, its recipe or its iCloud link', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      for (const symbol of RETIRED_SYMBOLS) {
        if (code.includes(symbol)) offenders.push(`${path.relative(SRC, file)}: ${symbol}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('keeps the dialog file named after the app that replaced the shortcut', () => {
    const dialogs = files.filter((file) => path.basename(file) === 'AeroShortcutDialog.tsx');
    assert.deepEqual(dialogs, [], 'the shortcut dialog still exists under its old name');
  });
});
