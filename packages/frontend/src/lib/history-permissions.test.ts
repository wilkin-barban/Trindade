import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyAffordances, historyActionErrorMessageKey, type HistoryServerPermissions } from './history-permissions.js';

/** Rows as the API projects them; the client renders this projection and infers nothing. */
const workerCanDeleteButNotDeactivate: HistoryServerPermissions = {
  isActive: true, readOnly: true, canEdit: false, canDeactivate: false, canDelete: true,
};
const adminOnActiveReport: HistoryServerPermissions = {
  isActive: true, readOnly: true, canEdit: false, canDeactivate: true, canDelete: true,
};
const adminOnAClosedDay: HistoryServerPermissions = {
  // What the fixed backend sends for a past day: still retirable, no longer erasable.
  isActive: true, isClosedDay: true, readOnly: true, canEdit: false, canDeactivate: true, canDelete: false, canActivate: false,
};

test('affordances follow the server projection instead of a client-invented role rule', () => {
  // A Trabalhador the server lets delete keeps the delete control: the backend is the authority.
  assert.deepEqual(historyAffordances(workerCanDeleteButNotDeactivate), {
    showEdit: false, showDeactivate: false, showDelete: true, showReactivate: false, closedDay: false,
  });
  assert.deepEqual(historyAffordances(adminOnActiveReport), {
    showEdit: false, showDeactivate: true, showDelete: true, showReactivate: false, closedDay: false,
  });
  assert.deepEqual(historyAffordances({ canEdit: true, canDeactivate: true, canDelete: true }), {
    showEdit: true, showDeactivate: true, showDelete: true, showReactivate: false, closedDay: false,
  });
});

test('a closed day is not editable, and keeps the retire the server offered for it', () => {
  // The calendar closes writing: a past day the server still reports as editable is rendered read-only,
  // because rewriting a day the plant already reported is the failure this rule closes. Retiring is not
  // writing content, and Q4 keeps it available on a past day, so the server's flag is drawn as it arrives.
  assert.deepEqual(historyAffordances(adminOnAClosedDay), {
    showEdit: false, showDeactivate: true, showDelete: false, showReactivate: false, closedDay: true,
  });
});

test('a closed day never shows the erase, because the server withholds it', () => {
  // The row below is what the backend answers for a past day: canDelete false. The client has no second
  // rule of its own on top of that -- it draws the flag -- and the erase disappears because the answer did.
  assert.equal(historyAffordances({ isClosedDay: true, canDelete: false }).showDelete, false);
  assert.equal(historyAffordances({ isClosedDay: true, canActivate: true }).showReactivate, true);
});

test('only an inactive row the server offered offers reactivate', () => {
  assert.deepEqual(historyAffordances({ isActive: false, canActivate: true }), {
    showEdit: false, showDeactivate: false, showDelete: false, showReactivate: true, closedDay: false,
  });
  assert.equal(historyAffordances({ isActive: false, canActivate: false }).showReactivate, false);
  // The flag and not the row's own `isActive`: the server sends canActivate only on a retired row, and a
  // client-side second opinion would be the same rule written twice.
  assert.equal(historyAffordances({ isActive: true, canActivate: true }).showReactivate, true);
});

test('a missing or non-boolean flag hides the control rather than guessing', () => {
  const empty = { showEdit: false, showDeactivate: false, showDelete: false, showReactivate: false, closedDay: false };
  assert.deepEqual(historyAffordances({}), empty);
  const partial = { canDelete: true } as HistoryServerPermissions;
  assert.deepEqual(historyAffordances(partial), { ...empty, showDelete: true });
  const undefinedFlags = { canEdit: undefined, canDeactivate: undefined, canDelete: undefined };
  assert.deepEqual(historyAffordances(undefinedFlags), empty);
});

test('a refusal becomes an actionable message key instead of an unhandled rejection', () => {
  assert.equal(historyActionErrorMessageKey({ status: 403 }), 'history.actionForbidden');
  assert.equal(historyActionErrorMessageKey({ status: 404 }), 'history.actionMissing');
  assert.equal(historyActionErrorMessageKey({ status: 500 }), 'history.actionFailed');
  assert.equal(historyActionErrorMessageKey(new TypeError('Failed to fetch')), 'history.actionFailed');
  assert.equal(historyActionErrorMessageKey(undefined), 'history.actionFailed');
  assert.equal(historyActionErrorMessageKey({ status: '403' }), 'history.actionFailed', 'only numeric statuses are trusted');
});
