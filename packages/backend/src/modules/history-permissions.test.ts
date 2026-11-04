import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isWithinOneHour,
  isWithinReportsEditWindow,
  projectBatchDeletePermission,
  projectHistoryPermissions,
} from './history-permissions.js';

const now = new Date('2026-08-24T12:00:00.000Z');

describe('history permissions', () => {
  describe('the loading window, one hour after creation', () => {
    it('allows only non-future timestamps inside the one-hour edit window', () => {
      const cases = [
        ['under one hour', '2026-08-24 11:00:00.001', true],
        ['exactly one hour', '2026-08-24 11:00:00.000Z', false],
        ['over one hour', '2026-08-24T10:59:59.999Z', false],
        ['future', '2026-08-24T12:00:00.001Z', false],
        ['invalid', 'not-a-timestamp', false],
        ['explicit timezone', '2026-08-24T08:30:00-03:00', true],
      ] as const;

      for (const [name, createdAt, expected] of cases) {
        assert.strictEqual(isWithinOneHour(createdAt, now), expected, name);
      }
    });
  });

  describe('the reports window, the current or the previous São Paulo day', () => {
    // 09:00 in São Paulo, so the São Paulo day is 2026-09-17 and yesterday is 2026-09-16.
    const midday = new Date('2026-09-17T12:00:00.000Z');

    it('allows a report created earlier the same São Paulo day', () => {
      assert.strictEqual(isWithinReportsEditWindow('2026-09-17T11:00:00.000Z', midday), true);
    });

    it('allows a report created the previous São Paulo day', () => {
      assert.strictEqual(isWithinReportsEditWindow('2026-09-16T12:00:00.000Z', midday), true);
    });

    it('rejects a report created two São Paulo days ago', () => {
      assert.strictEqual(isWithinReportsEditWindow('2026-09-15T12:00:00.000Z', midday), false);
    });

    it('fails closed for a future timestamp, which a date comparison alone would allow', () => {
      // Tomorrow is not today or yesterday, so this case is caught by the day check; the timestamp
      // that matters is the one later the same day, which the guard is really there for.
      assert.strictEqual(isWithinReportsEditWindow('2026-09-17T12:00:00.001Z', midday), false);
      assert.strictEqual(isWithinReportsEditWindow('2026-09-17T23:59:59.000Z', midday), false);
      assert.strictEqual(isWithinReportsEditWindow('2026-09-18T12:00:00.000Z', midday), false);
    });

    it('rejects an invalid timestamp', () => {
      assert.strictEqual(isWithinReportsEditWindow('not-a-timestamp', midday), false);
    });

    it('compares São Paulo days rather than UTC dates', () => {
      // 23:00 on the 15th in São Paulo is already the 16th in UTC, so a UTC-date comparison would
      // call this editable while the operator sees a two-day-old report. This is the assertion
      // that makes the conversion load-bearing rather than decorative.
      assert.strictEqual(isWithinReportsEditWindow('2026-09-16T02:00:00.000Z', midday), false);

      // And the mirror image: 22:00 in São Paulo on the 16th is the 17th in UTC, which a UTC
      // comparison would also misread, this time refusing an edit that is allowed.
      assert.strictEqual(isWithinReportsEditWindow('2026-09-17T01:00:00.000Z', midday), true);
    });
  });

  it('gives one timestamp two different answers, one per domain', () => {
    // The load-bearing test for splitting the window into an argument: a timestamp five hours old
    // is outside the loading window and inside the reports one. If a future change collapses the
    // two rules back into a shared default, exactly one of these two lines breaks.
    const createdAt = '2026-08-24T07:00:00.000Z';

    assert.strictEqual(isWithinOneHour(createdAt, now), false);
    assert.strictEqual(isWithinReportsEditWindow(createdAt, now), true);
  });

  it('fails closed for future history rows without changing delete permission', () => {
    const permissions = projectHistoryPermissions(
      { sub: 1, role: 'Trabalhador' },
      { user_id: 1, created_at: '2026-08-24T12:00:00.001Z', is_active: 1 },
      'one-hour',
      now
    );

    assert.strictEqual(permissions.canEdit, false);
    assert.strictEqual(permissions.readOnly, true);
    assert.strictEqual(permissions.canDelete, true);
  });

  it('marks a past loading day read only even inside the one-hour window', () => {
    const permissions = projectHistoryPermissions(
      { sub: 1, role: 'Trabalhador' },
      { user_id: 1, created_at: '2026-08-24T11:30:00.000Z', is_active: 1, day_date: '2026-08-23' },
      'one-hour',
      now
    );

    assert.strictEqual(permissions.isClosedDay, true);
    assert.strictEqual(permissions.canEdit, false, 'the window cannot reopen a day the calendar closed');
    assert.strictEqual(permissions.readOnly, true);
  });

  it('forbids deleting a past row even for an Administrador', () => {
    const past = { user_id: 1, created_at: '2026-08-24T11:30:00.000Z', is_active: 1, day_date: '2026-08-20' };
    const today = { ...past, day_date: '2026-08-24' };

    assert.strictEqual(projectHistoryPermissions({ sub: 1, role: 'Administrador' }, past, 'one-hour', now).canDelete, false);
    assert.strictEqual(projectHistoryPermissions({ sub: 1, role: 'Administrador' }, today, 'one-hour', now).canDelete, true);
  });

  it('offers activate only to an Administrador on an inactive row', () => {
    const inactive = { user_id: 1, created_at: '2026-08-24T11:30:00.000Z', is_active: 0, day_date: '2026-08-20' };
    const active = { ...inactive, is_active: 1 };

    assert.strictEqual(projectHistoryPermissions({ sub: 1, role: 'Administrador' }, inactive, 'one-hour', now).canActivate, true);
    assert.strictEqual(projectHistoryPermissions({ sub: 1, role: 'Administrador' }, active, 'one-hour', now).canActivate, false);
    assert.strictEqual(projectHistoryPermissions({ sub: 1, role: 'Trabalhador' }, inactive, 'one-hour', now).canActivate, false);
  });

  it('scopes a worker\'s delete to the rows they authored', () => {
    const own = { user_id: 7, created_at: '2026-08-24T11:30:00.000Z', is_active: 1, day_date: '2026-08-24' };
    const someoneElse = { ...own, user_id: 8 };
    const ownPast = { ...own, day_date: '2026-08-23' };
    const worker = { sub: 7, role: 'Trabalhador' };

    assert.strictEqual(projectHistoryPermissions(worker, own, 'one-hour', now).canDelete, true);
    assert.strictEqual(
      projectHistoryPermissions(worker, someoneElse, 'one-hour', now).canDelete,
      false,
      'a worker may not erase a row another operator wrote'
    );
    assert.strictEqual(
      projectHistoryPermissions(worker, ownPast, 'one-hour', now).canDelete,
      false,
      'authorship does not reopen a day the calendar closed'
    );

    // The administrator keeps the whole day, and still loses the past one above.
    assert.strictEqual(projectHistoryPermissions({ sub: 1, role: 'Administrador' }, someoneElse, 'one-hour', now).canDelete, true);
  });

  it('scopes a worker\'s delete in the reports window the same way', () => {
    const own = { user_id: 7, created_at: '2026-08-24T07:00:00.000Z', is_active: 1, day_date: '2026-08-24' };
    const worker = { sub: 7, role: 'Trabalhador' };

    assert.strictEqual(projectHistoryPermissions(worker, own, 'sao-paulo-current-and-previous-day', now).canDelete, true);
    assert.strictEqual(
      projectHistoryPermissions(worker, { ...own, user_id: 8 }, 'sao-paulo-current-and-previous-day', now).canDelete,
      false
    );
  });

  it('keeps today editable within the window and leaves rows without a day untouched', () => {
    const today = { user_id: 1, created_at: '2026-08-24T11:30:00.000Z', is_active: 1, day_date: '2026-08-24' };
    const permissions = projectHistoryPermissions({ sub: 1, role: 'Trabalhador' }, today, 'one-hour', now);
    assert.strictEqual(permissions.isClosedDay, false);
    assert.strictEqual(permissions.canEdit, true);
    assert.strictEqual(permissions.readOnly, false);

    // A report carries its date elsewhere; without `day_date` the projection keeps its own window.
    const report = { user_id: 1, created_at: '2026-08-20T11:30:00.000Z', is_active: 1 };
    assert.strictEqual(projectHistoryPermissions({ sub: 1, role: 'Trabalhador' }, report, 'sao-paulo-current-and-previous-day', now).isClosedDay, false);
  });

  describe('a whole batch, which only an administrator may erase', () => {
    // The batch routes check the role before they look at the date, so a flag derived from authorship
    // would offer a Trabalhador a control whose only answer is 403. Row-level erasing keeps its own
    // rule: the worker erases what they wrote, and the administrator erases anything.
    const today = { user_id: 7, created_at: '2026-08-24T11:30:00.000Z', is_active: 1, day_date: '2026-08-24' };
    const past = { ...today, day_date: '2026-08-20' };

    it('is offered to an administrator on an open day and to nobody on a past one', () => {
      assert.strictEqual(projectBatchDeletePermission({ sub: 1, role: 'Administrador' }, today, now), true);
      assert.strictEqual(projectBatchDeletePermission({ sub: 1, role: 'Administrador' }, past, now), false);
    });

    it('is never offered to a worker, even for a batch they created today', () => {
      assert.strictEqual(projectBatchDeletePermission({ sub: 7, role: 'Trabalhador' }, today, now), false);
      // The row-level answer is unchanged: the worker still erases what they wrote.
      assert.strictEqual(projectHistoryPermissions({ sub: 7, role: 'Trabalhador' }, today, 'one-hour', now).canDelete, true);
    });

    it('closes a day whose erasing date is behind, even for an administrator', () => {
      const reportDay = { ...today, day_date: '2026-08-24', erase_day_date: '2026-08-20' };
      assert.strictEqual(projectBatchDeletePermission({ sub: 1, role: 'Administrador' }, reportDay, now), false);
    });
  });

  it('projects the reports window when asked for it', () => {
    const row = { user_id: 1, created_at: '2026-08-24T07:00:00.000Z', is_active: 1 };
    const actor = { sub: 1, role: 'Trabalhador' };

    assert.strictEqual(projectHistoryPermissions(actor, row, 'one-hour', now).canEdit, false);
    assert.strictEqual(
      projectHistoryPermissions(actor, row, 'sao-paulo-current-and-previous-day', now).canEdit,
      true
    );
  });
});
