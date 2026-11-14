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

  it('stacks the loading actions full width on a phone', () => {
    const loading = page('pages/LoadingSchedulePage.tsx');
    assert.match(loading, /mt-6 mb-8 flex flex-col gap-3 sm:flex-row sm:justify-end/);
    assert.equal((loading.match(/className="w-full sm:w-auto"/g) ?? []).length >= 2, true);
  });

  it('scrolls the Assai table inside its card instead of stretching the page', () => {
    const assai = page('pages/AssaiCalculatorPage.tsx');
    assert.match(assai, /<div className="overflow-x-auto">\s*<table/);
  });
});
