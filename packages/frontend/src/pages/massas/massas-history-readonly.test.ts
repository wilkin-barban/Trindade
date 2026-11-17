import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Today is manageable, earlier days are read-only (S9 / T8).
 *
 * For the plant's today: keep sharing, individual edit/delete, relaunching, sync.
 * For earlier days: hide every mutation (edit, delete, relaunch, sync) and keep WhatsApp share,
 * with one visible read-only line instead of silently disabled controls.
 */
const historyPage = readFileSync(new URL('../MassasHistoryPage.tsx', import.meta.url), 'utf8');

describe('massas history is read-only on past days, manageable today (S9)', () => {
  it('hands the day table read-only mode for past days', () => {
    assert.match(historyPage, /readOnly=\{isPastDay\}/);
    assert.match(historyPage, /const isPastDay = date < today;/);
    assert.match(historyPage, /const isToday = date === today;/);
  });

  it('reconciles the day with the ERP mirror, like the launch screen does', () => {
    // Without the mirror the history only knows what Trindade recorded, so a launch the ERP already received
    // reads as pending and the day's balance is short by exactly those boxes.
    assert.ok(historyPage.includes('/integration/aero/movements?date='));
    assert.ok(historyPage.includes('massasUnifiedRows('));
    assert.ok(historyPage.includes('unifiedRows={unifiedRows}'));
    assert.ok(historyPage.includes('unifiedDate={date}'));
  });

  it('guards editing, deleting, syncing and relaunching behind isToday, and shows read-only notice on past days', () => {
    assert.ok(historyPage.includes('onStartEdit={isToday ? startEditing : undefined}'));
    assert.ok(historyPage.includes('onDelete={isToday ? handleDeleteLaunch : undefined}'));
    assert.ok(historyPage.includes('onSendToErp={isToday ? handleSendPendingLaunch : undefined}'));
    assert.ok(historyPage.includes('data-testid="massas-history-readonly"'));
  });
});
