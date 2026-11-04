import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Masas and insumos are two blocks with two lists, not one list with a heading.
 *
 * The browser run in `__e2e__/erp-movements-blocks.spec.ts` proves what a person sees; this reads the wiring so
 * a refactor cannot quietly put the receipts back inside the massas block or invent a local product list.
 */
const reportsPage = readFileSync(new URL('../../pages/ReportsPage.tsx', import.meta.url), 'utf8');
const receiptsSection = readFileSync(new URL('./ReceiptsSection.tsx', import.meta.url), 'utf8');
const massasSection = readFileSync(new URL('./MassasReportSection.tsx', import.meta.url), 'utf8');

function locale(name: string): { reports: Record<string, string> } {
  return JSON.parse(readFileSync(new URL(`../../i18n/locales/${name}.json`, import.meta.url), 'utf8'));
}

describe('ERP movements: massas and insumos are separate blocks', () => {
  it('draws each block in its own container with its own test id', () => {
    assert.ok(reportsPage.includes('data-testid="massas-block"'), 'the massas block has its own container');
    assert.ok(reportsPage.includes('data-testid="receipts-block"'), 'the insumos block has its own container');

    const massasAt = reportsPage.indexOf('data-testid="massas-block"');
    const receiptsAt = reportsPage.indexOf('data-testid="receipts-block"');
    const massasSectionAt = reportsPage.indexOf('<MassasReportSection');
    const receiptsSectionAt = reportsPage.indexOf('<ReceiptsSection');

    assert.ok(massasAt < massasSectionAt, 'the massas section lives inside the massas block');
    assert.ok(receiptsAt < receiptsSectionAt, 'the receipts section lives inside the insumos block');
    assert.ok(massasSectionAt < receiptsAt, 'the massas block closes before the insumos block opens');
  });

  it('calls the second block Insumos and says what it holds', () => {
    for (const name of ['es', 'pt-BR']) {
      const reports = locale(name).reports;
      assert.equal(reports.receiptsTitle, 'Insumos', `${name}: the block is called Insumos`);
      assert.match(
        reports.receiptsSubtitle ?? '',
        /(no son masa|não são massa)/i,
        `${name}: the subtitle says the block holds products that are not massas`,
      );
      assert.match(reports.receiptsSubtitle ?? '', /(terceirizad)/i, `${name}: it names the third-party products`);
    }
    assert.ok(receiptsSection.includes("t('reports.receiptsSubtitle'"), 'the subtitle is rendered');
  });

  it('does not claim the card is only massas and receipts, nor share one list between them', () => {
    assert.equal(
      reportsPage.includes("t('reports.erpMovementsTitle', 'Movimentações do ERP (Massas e Recebimento)')"),
      false,
      'the card title no longer bundles both names',
    );
    // The massas block renders the massas products and the receipts block renders the receipt lines: neither
    // section reads the other's array.
    assert.ok(massasSection.includes('day?.products'));
    assert.equal(massasSection.includes('receipts'), false);
    assert.ok(receiptsSection.includes('day?.receipts'));
  });

  it('reads the products from the backend instead of a local code list', () => {
    assert.equal(/\b(1045|1192|1616)\b/.test(reportsPage), false, 'no hardcoded massa code in the report page');
    assert.equal(/\b(1045|1192|1616)\b/.test(massasSection), false, 'no hardcoded massa code in the massas section');
    assert.equal(/\b(1045|1192|1616)\b/.test(receiptsSection), false, 'no hardcoded massa code in the receipts');
  });
});
