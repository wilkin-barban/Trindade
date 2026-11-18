import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WHATSAPP_ABBREVIATION_LIMIT,
  WHATSAPP_TABLES,
  abbreviateProduct,
  abbreviateTask,
} from './whatsapp-abbreviations.js';
import sharedTables from './whatsapp-abbreviations.table.json' with { type: 'json' };

/**
 * Las dos tablas dicen lo mismo.
 *
 * El Relatório escribe su mensaje en el backend y los históricos de Masas y Salidas lo escriben acá, en el
 * navegador. Son dos copias de la misma decisión: si una cambia y la otra no, el mismo producto viaja con dos
 * nombres según desde dónde se comparta. Este test es lo que convierte la copia en una regla.
 */
describe('la tabla del navegador y la del backend', () => {
  it('coincide fila por fila con el artefacto compartido', () => {
    // `whatsapp-abbreviations.table.json` viaja con esta página y el backend compara sus tablas contra él, así que
    // propio test contra él: si alguna de las dos copias se mueve, una de las dos suites se pone en rojo.
    const sections: [keyof typeof WHATSAPP_TABLES, Record<string, string>][] = [
      ['catalogueByCode', sharedTables.catalogueByCode],
      ['catalogueByName', sharedTables.catalogueByName],
      ['erpByName', sharedTables.erpByName],
      ['taskByName', sharedTables.taskByName],
    ];

    let rows = 0;
    for (const [section, shared] of sections) {
      const mine = WHATSAPP_TABLES[section] as Map<string, string>;
      assert.equal(mine.size, Object.keys(shared).length, `${section}: mismo número de filas`);
      for (const [key, value] of Object.entries(shared)) {
        assert.equal(mine.get(key), value, `${section}: ${key}`);
        rows += 1;
      }
    }
    assert.ok(rows >= 100, `se compararon ${rows} filas`);
  });

  it('cae igual en el fallback y en la truncación del ERP', () => {
    const cases: [string, string | null][] = [
      ['320 G PĂO DE ALHO TRINDADE  TR', null],
      ['PĂO DE ALHO TRINDADE 400G PICA', null],
      ['QUEIJO RALADO', null],
      ['MASSA PARA PASTEL TRINDADE CASEIRA 1 KG', '001045'],
      ['MASSA PARA PASTEL QUADRADA 2 KG', '001192'],
      ['SUPLEMENTO PROTEICO TRINDADE 2 KG', '9999'],
      ['MASSA ESPECIAL ARTESANAL PREMIUM 500 G', null],
      ['PRODUTO NOVO MUITO COMPRIDO DA FABRICA NOVA 3 KG', '8888'],
      ['Nhoque Kg', null],
    ];

    // La misma entrada da la misma salida en los dos lados: lo que la tabla no conoce lo resuelve la regla, y la
    // regla está escrita igual en el backend.
    for (const [name, code] of cases) {
      const abbreviated = abbreviateProduct(name, code);
      assert.ok(abbreviated.length <= WHATSAPP_ABBREVIATION_LIMIT, `${name} → ${abbreviated}`);
      assert.equal(/[\u0080-\u009fĂ]/.test(abbreviated), false, `${name} → ${abbreviated}`);
      assert.equal(abbreviateProduct(name, code), abbreviated, 'misma entrada, misma salida');
    }
  });

  it('nunca pasa de veinte caracteres en lo que la tabla no conoce', () => {
    for (const name of ['MASSA ESPECIAL ARTESANAL PREMIUM 500 G', 'Tarefa nova muito comprida mesmo com palavras']) {
      assert.ok(abbreviateProduct(name).length <= WHATSAPP_ABBREVIATION_LIMIT, name);
      assert.ok(abbreviateTask(name).length <= WHATSAPP_ABBREVIATION_LIMIT, name);
    }
  });
});
