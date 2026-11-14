import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readReportProducts } from './report-products';

describe('report products', () => {
  it('reads the two offers the server answers', () => {
    const products = readReportProducts({ assai: ['Nhoque Kg', 'Rolo kg'], normal: ['Nhoque 400g'] });

    assert.deepEqual(products, { assai: ['Nhoque Kg', 'Rolo kg'], normal: ['Nhoque 400g'] });
  });

  it('leaves Quadrada out of the Assaí task and keeps it in the small-box task', () => {
    // The plant does not count Quadrada for Assaí, but it does count it for Cajas pequeñas. The server still
    // offers the whole catalogue; dropping it from one task is this screen's decision.
    const products = readReportProducts({ assai: ['Nhoque Kg', 'Quadrada'], normal: ['Nhoque 400g', 'Quadrada'] });

    assert.deepEqual(products, { assai: ['Nhoque Kg'], normal: ['Nhoque 400g', 'Quadrada'] });
  });

  it('reads an Assaí offer of only Quadrada as empty, not as a failure', () => {
    const products = readReportProducts({ assai: ['Quadrada'], normal: [] });

    assert.deepEqual(products, { assai: [], normal: [] });
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
