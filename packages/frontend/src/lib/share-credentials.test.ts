import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { passwordIssue } from './password-policy.js';
import {
  activeWorkerCandidates,
  generateTemporaryPassword,
  needsPasswordSave,
  type ShareCandidate,
} from './share-credentials.js';

const users: ShareCandidate[] = [
  { id: 1, display_name: 'Wilkin', username: 'wilkin', role_name: 'Administrador', is_active: 1 },
  { id: 2, display_name: 'Ana', username: 'ana', role_name: 'Trabalhador', is_active: 1 },
  { id: 3, display_name: 'Beto', username: 'beto', role_name: 'Trabalhador', is_active: 0 },
  { id: 4, display_name: 'Trindade', username: 'Trindade', role_name: 'Trabalhador', is_active: 1 },
  { id: 5, display_name: 'Carla', username: 'carla', role_name: 'Trabalhador', is_active: 1 },
];

describe('the temporary password for an existing worker', () => {
  it('satisfies the server policy on the first generated value', () => {
    const password = generateTemporaryPassword();

    assert.equal(passwordIssue(password), null, `${password} must satisfy the policy`);
    assert.ok([...password].length >= 15);
    assert.ok(new TextEncoder().encode(password).length <= 72);
  });

  it('is not the retired default and does not repeat between calls', () => {
    const generated = new Set(Array.from({ length: 20 }, () => generateTemporaryPassword()));

    assert.equal(generated.has('123456789'), false);
    assert.ok(generated.size > 15, 'twenty calls must not collapse to a handful of values');
  });

  it('regenerates when the first draw would be too short for the policy', () => {
    // A byte source that always yields 0 would build a password of the same character; the generator must not
    // hand back something the server refuses.
    const password = generateTemporaryPassword(() => new Uint8Array(32));

    assert.equal(passwordIssue(password), null);
  });
});

describe('the candidates for the existing mode', () => {
  it('keeps active workers only: no administrators, no inactive accounts, no guest', () => {
    const kept = activeWorkerCandidates(users);

    assert.deepEqual(kept.map((user) => user.username), ['ana', 'carla']);
  });

  it('treats a missing role or activity as not a candidate, so a partial answer cannot leak an admin', () => {
    const partial: ShareCandidate[] = [
      { id: 10, display_name: 'Sin rol', username: 'sinrol' },
      { id: 11, display_name: 'Sin estado', username: 'sinestado', role_name: 'Trabalhador' },
    ];

    assert.deepEqual(activeWorkerCandidates(partial), []);
  });
});

describe('when the password has to be saved', () => {
  const base = {
    mode: 'existing' as const,
    includeCredentials: true,
    selectedUserId: '2',
    password: 'Trindade-abcdefghijklm',
    saved: null,
  };

  it('saves once for the selected worker with the new password', () => {
    assert.equal(needsPasswordSave(base), true);
  });

  it('does not repeat the save for the same worker and the same password', () => {
    assert.equal(
      needsPasswordSave({ ...base, saved: { userId: '2', password: 'Trindade-abcdefghijklm' } }),
      false,
    );
  });

  it('saves again when the password is edited, and when the worker changes', () => {
    const saved = { userId: '2', password: 'Trindade-abcdefghijklm' };

    assert.equal(needsPasswordSave({ ...base, password: 'Trindade-otraclave1234', saved }), true);
    assert.equal(needsPasswordSave({ ...base, selectedUserId: '5', saved }), true);
  });

  it('never saves in the create mode, without credentials, without a worker or without a password', () => {
    assert.equal(needsPasswordSave({ ...base, mode: 'create' }), false);
    assert.equal(needsPasswordSave({ ...base, includeCredentials: false }), false);
    assert.equal(needsPasswordSave({ ...base, selectedUserId: '' }), false);
    assert.equal(needsPasswordSave({ ...base, password: '' }), false);
    assert.equal(needsPasswordSave({ ...base, password: '   ' }), false);
  });

  it('compares the password exactly: a trailing space is a different password', () => {
    assert.equal(
      needsPasswordSave({ ...base, saved: { userId: '2', password: 'Trindade-abcdefghijklm ' } }),
      true,
    );
  });
});
