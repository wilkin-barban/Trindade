import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Creating a worker from an unlinked ERP seat (S16-S19).
 *
 * An unlinked seat has ownerUserId === null. For an administrator, the table shows the inline button
 * "+ Criar Operário: <NAME>" which creates the user and refreshes the mirror. For a non-administrator,
 * the creation button is never rendered and an explanation is shown instead.
 */
const table = readFileSync(new URL('./MassasUnifiedTable.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../MassasHistoryPage.tsx', import.meta.url), 'utf8');

describe('operator creation from ERP seat (S16-S19)', () => {
  it('shows inline button + Criar Operário: <NOMBRE> for administrator when seat has no owner', () => {
    assert.ok(table.includes('canCreateOperatorRow'));
    assert.ok(table.includes('massas-create-operator-'));
    assert.ok(table.includes("t('massas.unified.createOperator'"));
  });

  it('keeps creation controls at the 44px touch floor and shows spinner while creating', () => {
    assert.ok(table.includes('data-testid={`massas-create-operator-${row.entLans[0]}`'));
    const creationButtonMatch = table.match(/<button[\s\S]*?data-testid=\{`massas-create-operator-[\s\S]*?>/);
    assert.ok(creationButtonMatch, 'creation button must exist');
    assert.ok(creationButtonMatch[0].includes('min-h-[44px]'));
    assert.ok(table.includes('creatingOperatorEntLan === row.entLans[0]'));
  });

  it('wires creation in MassasHistoryPage with username, display name, deterministic password and role 2', () => {
    assert.ok(page.includes('handleCreateOperator'));
    assert.ok(page.includes('deriveUsername'));
    assert.ok(page.includes('deriveDisplayName'));
    assert.ok(page.includes('quickWorkerPassword'));
    assert.ok(page.includes('QUICK_WORKER_ROLE_ID'));
    assert.ok(page.includes("api.post('/admin/users'"));
  });

  it('never offers creation on a deactivated operator, and says what to do instead (S19)', () => {
    // The mirror says the account exists and is off. Creating it would be refused by the unique index after
    // the administrator tried, so the row names the reactivation instead.
    assert.ok(table.includes('seatNeedsReactivation(row)'));
    assert.ok(table.includes('massas-reactivate-'));
    assert.ok(table.includes("t('massas.unified.operatorInactive'"));
    assert.equal(
      table.includes("row.ownerUserId === null && row.importable"),
      false,
      'the unlinked hint must ask the owner status, not only the null owner',
    );
  });

  it('refreshes both the launches and the mirror immediately after creation (S18)', () => {
    assert.ok(page.includes('await Promise.all([loadDay(date), loadMirror(date)])'));
  });

  it('stacks the row on mobile so the creation button cannot crush the operator and product', () => {
    // On a 390 px phone the action block used to take more than half the row and leave the info column in a
    // ~100 px strip: the row stacks and the horizontal layout comes back from `sm` on.
    assert.ok(table.includes('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2'));
    assert.ok(table.includes('min-w-0 w-full sm:w-auto sm:flex-1'));
    assert.ok(table.includes('flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:shrink-0 sm:items-end'));
  });

  it('gives every action a full-width, thumb-sized target on mobile and keeps it natural on desktop', () => {
    for (const testId of ['massas-import-', 'massas-create-operator-', 'massas-unified-send', 'massas-ack-']) {
      assert.ok(table.includes(testId), `${testId} must still be rendered`);
    }
    const responsiveControl = 'min-h-[44px] w-full items-center justify-center gap-1.5';
    const count = table.split(responsiveControl).length - 1;
    assert.equal(count, 4, 'every row action keeps its 44 px floor and goes full width on mobile');
    assert.ok(table.includes('sm:w-auto sm:justify-start'));
  });

  it('lets the explanatory notes read fluidly on mobile and keeps the narrow column on desktop', () => {
    assert.ok(table.includes("className=\"w-full text-left text-[11px] text-amber-600 sm:max-w-[9rem] sm:w-auto sm:text-right\""));
    const fluidNotes = table.split('w-full text-left text-[11px] text-gray-500 sm:max-w-[9rem] sm:w-auto sm:text-right').length - 1;
    assert.equal(fluidNotes, 2, 'both gray notes drop the fixed width on mobile');
  });
});
