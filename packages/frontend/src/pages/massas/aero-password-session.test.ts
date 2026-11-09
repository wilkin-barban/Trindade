import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The vault is on the server, so «no configurado» is never the whole truth.
 *
 * Once the password moved into the encrypted vault, the address and the user can be saved while the secret is
 * missing -- and every path that needs it must say so. Both places that used to `return` in silence -- the
 * day's sync and the resend of a pending row -- read as a button that does nothing, which is how an operator
 * concludes the app is broken. The assertions read the wiring, because the behaviour of the decision itself is
 * covered in `lib/aero-integration.test.ts`.
 */
const launch = readFileSync(new URL('../MassasLaunchPage.tsx', import.meta.url), 'utf8');

function blockAfter(source: string, marker: string, size = 400): string {
  const index = source.indexOf(marker);
  assert.ok(index >= 0, `the source still contains «${marker}»`);
  return source.slice(index, index + size);
}

describe('an integration whose vault has no password', () => {
  it('tells the operator instead of returning without a word from the day sync', () => {
    const guard = blockAfter(launch, 'const handleSyncFromErp = async () => {');

    assert.match(guard, /setNotice\(\{ type: 'error', message: erpNotReadyMessage/);
  });

  it('tells the operator when a pending row cannot be resent', () => {
    const guard = blockAfter(launch, 'const handleSendPendingLaunch = useCallback(');

    assert.match(guard, /setNotice\(\{ type: 'error', message: erpNotReadyMessage/);
  });

  it('separates a missing password in the vault from a missing setup in the sentence it speaks', () => {
    const helper = blockAfter(launch, 'function erpNotReadyMessage(', 480);

    assert.match(helper, /aeroMissingSetup\(settings\) === 'password'/);
    assert.match(helper, /massas\.aero\.passwordNeeded/);
    assert.match(helper, /massas\.aero\.syncNeedsSetup/);
  });

  it('says the same thing under the switch, which is where the launch is decided', () => {
    const hint = blockAfter(launch, 'id="aero-sync-label"', 900);

    assert.match(hint, /aeroMissingSetup\(aeroSettings\) === 'password'/);
    assert.match(hint, /massas\.aero\.passwordPending/);
  });

  it('never keeps or reads a password, and asks the server for a ticket instead', () => {
    // La página no tiene la contraseña ni la pide: lee el cofre al montar y, cuando toca hablar con el ERP,
    // pide un ticket. El estado del secreto es un booleano del servidor.
    assert.equal(/draft\.password|aeroSettings\.password/.test(launch), false);
    assert.ok(launch.includes('hasPassword'));
    assert.ok(launch.includes('fetchAeroVaultSettings'));
    assert.ok(launch.includes('requestAeroBridgeTicket({'));
    // La lectura automática que cierra el veredicto de un lanzamiento entra por el mismo camino.
    assert.ok(launch.includes('consumeAeroAutoRead(date)'));
  });
});
