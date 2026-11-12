import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The wiring of the Share screen for an existing worker, read as source.
 *
 * The behaviour that matters cannot be observed without a browser and a server: a popup opened before the await,
 * a PATCH that runs before the message leaves, a QR that waits. The pure decisions live in `share-credentials.ts`
 * and are tested there; this file holds the page to the order of its own statements.
 */
const page = readFileSync(new URL('../pages/ShareAppPage.tsx', import.meta.url), 'utf8');

function block(start: string, end: string): string {
  const from = page.indexOf(start);
  assert.ok(from >= 0, `missing block: ${start}`);
  const to = page.indexOf(end, from);
  assert.ok(to > from, `missing end of block: ${end}`);
  return page.slice(from, to);
}

describe('the Share screen and the existing worker password', () => {
  it('starts with no password at all, so the retired default cannot come back', () => {
    assert.equal(page.includes('123456789'), false, 'the invalid default must not survive anywhere');
    assert.ok(page.includes("const [password, setPassword] = useState<string>('');"));
  });

  it('offers active workers only and never the raw list', () => {
    assert.ok(page.includes('activeWorkerCandidates(users)'));
    assert.ok(page.includes('candidates.map('), 'the select must render the filtered list');
    assert.equal(/users\.map\(\(u\)/.test(page), false, 'the unfiltered list must not reach the select');
  });

  it('persists the password with the selected worker id before opening, copying or sharing', () => {
    const open = block('const handleOpenWhatsApp = async () => {', 'const handleCopy = async () => {');
    const copy = block('const handleCopy = async () => {', 'const handleShareApk = async () => {');
    const apk = block('const handleShareApk = async () => {', '\n  return (');

    for (const [name, source] of [['open', open], ['copy', copy], ['apk', apk]] as const) {
      assert.ok(
        source.includes('await ensurePasswordSaved()'),
        `${name} must save before it continues`,
      );
      assert.match(
        source,
        /if \(!\(await ensurePasswordSaved\(\)\)\) return;|if \(!saved\) \{/,
        `${name} must abort when the save fails`,
      );
    }

    assert.ok(page.includes('patchWorkerPassword(api, selectedUserId, password)'));
  });

  it('opens the window in the gesture, before the await, and closes it when the save fails', () => {
    const open = block('const handleOpenWhatsApp = async () => {', 'const handleCopy = async () => {');
    const popupAt = open.indexOf("window.open('', '_blank')");
    const awaitAt = open.indexOf('await ensurePasswordSaved()');

    assert.ok(popupAt >= 0, 'the blank window must be opened synchronously');
    assert.ok(awaitAt > popupAt, 'the window must exist before the request starts');
    assert.ok(open.includes('popup?.close()'), 'a failed save must not leave a window open');
    assert.ok(open.includes('popup.location.href = waLink'), 'the chat is navigated to only after the save');
    assert.equal(open.includes("window.open(waLink, '_blank', 'noopener,noreferrer')"), true,
      'without a handle, the fallback still opens the chat');
  });

  it('keeps the QR blocked while the password is pending', () => {
    const qr = block('if (passwordPending || passwordUnusable) {', 'const handleCreateWorker');
    assert.ok(qr.includes('if (passwordPending || passwordUnusable)'), 'the QR effect must stop while the password is pending or unusable');
    assert.ok(page.includes("data-testid=\"share-qr-pending\""));
  });

  it('never patches in the create mode or without credentials, because the decision owns that rule', () => {
    assert.ok(page.includes('needsPasswordSave({'));
    assert.equal(
      /credentialMode === 'existing'[\s\S]{0,80}api\.patch/.test(page),
      false,
      'the page must not call the API directly',
    );
  });
});

describe('the guards the approved change added', () => {
  const ensure = block('const ensurePasswordSaved = async (): Promise<boolean> => {', 'const handleOpenWhatsApp');

  it('checks the policy before the round trip, and the server remains the authority', () => {
    const policyAt = ensure.indexOf('passwordIssue(password)');
    const patchAt = ensure.indexOf('patchWorkerPassword(');

    assert.ok(policyAt >= 0, 'the policy must be checked locally first');
    assert.ok(patchAt > policyAt, 'no PATCH can happen before the local policy check');
    assert.ok(ensure.includes("setPasswordNotice({ tone: 'error'"), 'a refused policy must be explained');
  });

  it('does not let two clicks fire two PATCHes', () => {
    assert.ok(ensure.includes('savingRef.current'), 'a ref is what two clicks in the same tick can see');
    assert.ok(ensure.indexOf('if (savingRef.current) return false;') < ensure.indexOf('patchWorkerPassword('));
    assert.ok(ensure.includes('savingRef.current = false;'), 'the guard must be released on failure too');
  });

  it('closes the existing mode when the list came from the fallback', () => {
    assert.ok(
      /setUsers\(res\.users\);\s*\n\s*setUsersError\(true\);/.test(page),
      'the role-less fallback must raise the error the existing mode shows',
    );
    for (const name of ['handleOpenWhatsApp', 'handleCopy', 'handleShareApk']) {
      const source = block(`const ${name} = async () => {`, '};');
      assert.ok(source.includes('if (usersError)'), `${name} must refuse while the worker list is unavailable`);
    }
  });

  it('blocks the QR for an unusable password, not only for a pending pair', () => {
    assert.ok(page.includes('passwordPending || passwordUnusable'));
    assert.ok(page.includes("password.trim() === '' || passwordIssue(password) !== null"));
  });
});
