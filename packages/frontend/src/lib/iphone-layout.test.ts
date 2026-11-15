import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * The mobile polish, as a regression pin.
 *
 * These are class-level fixes for defects the 390 px audit found in the markup, so there is no behaviour to drive
 * red-first: the red was the audit's `path:line` finding. What a test can do -- and what this file does -- is make
 * a future refactor notice it is undoing them: a 14 px input that makes iOS zoom on focus, a 36 px button that is
 * no longer a touch target, a table that stretches the page instead of scrolling inside its card.
 */
const page = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf-8');

describe('iPhone polish', () => {
  it('keeps the shared input at 16 px on a phone so iOS does not zoom on focus', () => {
    const input = page('components/ui/input.tsx');
    assert.match(input, /text-base/);
    assert.match(input, /sm:text-sm/);
    assert.doesNotMatch(input, /py-2 text-sm shadow-sm/);
  });

  it('keeps the report actions at 44 px instead of 36 px', () => {
    const report = page('pages/ReportViewPage.tsx');
    assert.doesNotMatch(report, /h-9 sm:h-11/);
    assert.match(report, /h-11/);
  });

  it('lets the new-report title wrap instead of crowding its help button', () => {
    assert.match(page('pages/ReportsPage.tsx'), /mb-1 flex flex-wrap items-center gap-2/);
  });

  it('keeps the dashboard help button beside its heading, never on top of it', () => {
    const dashboard = page('pages/DashboardPage.tsx');
    assert.match(dashboard, /mb-4 flex items-center justify-between gap-2/);
    assert.match(dashboard, /<div className="shrink-0">\s*<ModuleHelpModal/);
  });

  it('puts the two loading exports in one row on a phone', () => {
    for (const file of ['pages/LoadingSchedulePage.tsx', 'pages/LoadingEditPage.tsx']) {
      const source = page(file);
      assert.match(source, /grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3/, `${file} stacks its exports`);
      assert.equal(
        (source.match(/w-full[^"`]*sm:w-auto/g) ?? []).length >= 2,
        true,
        `${file} must let both buttons fill their own cell`,
      );
      assert.match(source, /text-xs/, `${file} keeps a phone-sized label`);
      assert.match(source, /sm:text-sm/, `${file} keeps the desktop label size`);
      assert.match(source, /whitespace-nowrap/, `${file} must not wrap «Exportar PDF»`);
    }
  });

  it('lays the Assai calculator out in three columns instead of a table that scrolls', () => {
    const assai = page('pages/AssaiCalculatorPage.tsx');
    // V3 replaced the four-column table (and its horizontal scroll) with a three-column grid whose name
    // column may shrink, so the row fits a 390 px phone without scrolling.
    assert.doesNotMatch(assai, /<table/);
    assert.doesNotMatch(assai, /overflow-x-auto/);
    assert.doesNotMatch(assai, /min-w-\[320px\]/);
    assert.match(assai, /data-testid="assai-grid-header"/);
    assert.match(assai, /grid-cols-\[minmax\(0,1fr\)_5\.5rem_3\.5rem\]/);
    assert.equal((assai.match(/pr-3/g) ?? []).length >= 2, true, 'the Caixas value and heading keep clear of the card edge');
  });

  it('puts the stock share actions side by side on a phone', () => {
    for (const file of ['pages/StockCalculatorPage.tsx', 'pages/StockHistoryPage.tsx']) {
      const source = page(file);
      assert.match(source, /grid grid-cols-2 gap-2/, `${file} must place WhatsApp and e-mail in one row`);
      assert.match(source, /shareWhatsappShort/, `${file} must use the short WhatsApp label`);
      assert.match(source, /shareEmailShort/, `${file} must use the short e-mail label`);
      assert.match(source, /min-h-\[44px\]/, `${file} keeps the 44 px touch target`);
      assert.match(source, /aria-label=\{t\('stock\.shareWhatsapp'\)\}/, `${file} keeps the full accessible WhatsApp name`);
      assert.match(source, /aria-label=\{t\('stock\.shareEmail'\)\}/, `${file} keeps the full accessible e-mail name`);
    }
  });
});
