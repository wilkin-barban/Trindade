import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { WHATSAPP_TABLES } from './whatsapp-abbreviations.js';

/**
 * Las tablas del backend y el artefacto compartido son lo mismo.
 *
 * `packages/frontend/src/lib/whatsapp-abbreviations.table.json` es lo que lee el navegador para escribir los
 * históricos de Masas y Salidas, y se compara contra estas tablas. Si alguien cambia una fila en un solo lado,
 * este test lo dice; el del navegador comprueba el otro extremo.
 */
interface SharedTables {
  catalogueByCode: Record<string, string>;
  catalogueByName: Record<string, string>;
  erpByName: Record<string, string>;
  taskByName: Record<string, string>;
}

const shared = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../../frontend/src/lib/whatsapp-abbreviations.table.json'), 'utf-8'),
) as SharedTables;

describe('las tablas del backend contra el artefacto compartido', () => {
  it('tiene las mismas filas, con las mismas palabras', () => {
    const sections: [keyof typeof WHATSAPP_TABLES, Record<string, string>][] = [
      ['catalogueByCode', shared.catalogueByCode],
      ['catalogueByName', shared.catalogueByName],
      ['erpByName', shared.erpByName],
      ['taskByName', shared.taskByName],
    ];

    let rows = 0;
    for (const [section, artifact] of sections) {
      const mine = WHATSAPP_TABLES[section] as Map<string, string>;
      assert.equal(mine.size, Object.keys(artifact).length, `${section}: mismo número de filas`);
      for (const [key, value] of Object.entries(artifact)) {
        assert.equal(mine.get(key), value, `${section}: ${key}`);
        rows += 1;
      }
    }
    assert.ok(rows >= 100, `se compararon ${rows} filas`);
  });
});
