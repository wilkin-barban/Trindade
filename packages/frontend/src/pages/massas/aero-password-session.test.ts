import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The password lives in the tab, so a tab can lose it mid-session -- and every path that needs it says so.
 *
 * Once the secret stopped being stored, «no configurado» stopped being the whole truth: the address and the
 * user are saved, and only the password of this session is missing. Both places that used to `return` in
 * silence -- the day's sync and the resend of a pending row -- read as a button that does nothing, which is
 * how an operator concludes the app is broken. The assertions read the wiring, because the behaviour of the
 * decision itself is covered in `lib/aero-integration.test.ts`.
 */
const launch = readFileSync(new URL('../MassasLaunchPage.tsx', import.meta.url), 'utf8');

function blockAfter(source: string, marker: string, size = 400): string {
  const index = source.indexOf(marker);
  assert.ok(index >= 0, `the source still contains «${marker}»`);
  return source.slice(index, index + size);
}

describe('a session without the ERP password', () => {
  it('tells the operator instead of returning without a word from the day sync', () => {
    const guard = blockAfter(launch, 'const handleSyncFromErp = () => {');

    assert.match(guard, /setNotice\(\{ type: 'error', message: erpNotReadyMessage/);
  });

  it('tells the operator when a pending row cannot be resent', () => {
    const guard = blockAfter(launch, 'const handleSendPendingLaunch = useCallback(');

    assert.match(guard, /setNotice\(\{ type: 'error', message: erpNotReadyMessage/);
  });

  it('separates a missing secret from a missing setup in the sentence it speaks', () => {
    const helper = blockAfter(launch, 'function erpNotReadyMessage(', 420);

    assert.match(helper, /aeroMissingSetup\(settings\) === 'password'/);
    assert.match(helper, /massas\.aero\.passwordNeeded/);
    assert.match(helper, /massas\.aero\.syncNeedsSetup/);
  });

  it('says the same thing under the switch, which is where the launch is decided', () => {
    const hint = blockAfter(launch, 'id="aero-sync-label"', 900);

    assert.match(hint, /aeroMissingSetup\(aeroSettings\) === 'password'/);
    assert.match(hint, /massas\.aero\.passwordPending/);
  });
});
