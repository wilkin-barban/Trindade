import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readReportProducts } from './report-products';

describe('report products', () => {
  it('reads the two offers the server answers', () => {
    const products = readReportProducts({ assai: ['Nhoque Kg', 'Quadrada'], normal: ['Nhoque 400g'] });

    assert.deepEqual(products, { assai: ['Nhoque Kg', 'Quadrada'], normal: ['Nhoque 400g'] });
  });

  it('reads an empty offer as an offer, not as a failure', () => {
    // A plant that stopped offering a product sent an empty list, and drawing nothing is the answer.
    const products = readReportProducts({ assai: [], normal: [] });

    assert.deepEqual(products, { assai: [], normal: [] });
  });

  it('refuses an answer without the two offers', () => {
    assert.equal(readReportProducts({ assai: ['Nhoque Kg'] }), null);
    assert.equal(readReportProducts({ normal: ['Nhoque Kg'] }), null);
  });

  it('refuses a list that is not a list of names', () => {
    assert.equal(readReportProducts({ assai: ['Nhoque Kg', 4], normal: [] }), null);
    assert.equal(readReportProducts({ assai: 'Nhoque Kg', normal: [] }), null);
    assert.equal(readReportProducts({ assai: ['Nhoque Kg', '  '], normal: [] }), null);
  });

  it('refuses anything that is not an object', () => {
    assert.equal(readReportProducts(null), null);
    assert.equal(readReportProducts([]), null);
    assert.equal(readReportProducts('assai'), null);
  });
});
