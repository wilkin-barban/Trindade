import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SALIDA_ITEMS,
  SALIDA_BLOCKS,
  SALIDA_PRODUCTS,
  findSalidaProduct,
  salidaErpProductCode,
} from './salida.catalog.js';

describe('salida catalog (S3)', () => {
  it('holds exactly 19 products, split 11/3/5 across blocks', () => {
    assert.equal(SALIDA_PRODUCTS.length, 19);
    assert.equal(MAX_SALIDA_ITEMS, 19);

    const counts = Object.fromEntries(
      SALIDA_BLOCKS.map((block) => [
        block,
        SALIDA_PRODUCTS.filter((product) => product.block === block).length,
      ]),
    );
    assert.deepEqual(counts, {
      embalagens: 11,
      bobinas: 3,
      'materia-prima': 5,
    });
    assert.equal(new Set(SALIDA_PRODUCTS.map((product) => product.code)).size, 19);
  });

  it('permanently excludes 1474 and 1473 (nhoque embalagens) and 1040 (wheat flour)', () => {
    assert.equal(findSalidaProduct('1474'), undefined);
    assert.equal(findSalidaProduct('1473'), undefined);
    assert.equal(findSalidaProduct('1040'), undefined);

    assert.equal(SALIDA_PRODUCTS.some((p) => p.code === '1474'), false);
    assert.equal(SALIDA_PRODUCTS.some((p) => p.code === '1473'), false);
    assert.equal(SALIDA_PRODUCTS.some((p) => p.code === '1040'), false);
  });

  it('keeps the plant order with 1357 first in embalagens and 1673 listed once', () => {
    assert.equal(SALIDA_PRODUCTS[0]?.code, '1357');
    assert.equal(SALIDA_PRODUCTS[0]?.name, 'EMBALAG. DISCO 200g');
    assert.equal(SALIDA_PRODUCTS[0]?.block, 'embalagens');

    assert.equal(SALIDA_PRODUCTS[18]?.code, '1673');
    assert.equal(SALIDA_PRODUCTS[18]?.name, 'GORDURA VEGETAL');
    assert.equal(SALIDA_PRODUCTS[18]?.block, 'materia-prima');

    assert.equal(SALIDA_PRODUCTS.filter((p) => p.code === '1673').length, 1);
  });

  it('widens product codes to six digits for ERP', () => {
    assert.equal(salidaErpProductCode('1357'), '001357');
    assert.equal(salidaErpProductCode('1673'), '001673');
    assert.equal(salidaErpProductCode('001357'), '001357');
  });
});
