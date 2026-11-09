import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * What the panel says when the operator proves the connection.
 *
 * The proof no longer happens in the browser: the page has no password and Safari refuses the plant's plain
 * HTTP from an HTTPS page. The panel asks the server for a `test` ticket, the shortcut redeems it and rings
 * `/usuarios/`, and the verdict comes back as a callback. These assertions read the wiring, because the
 * verdict vocabulary itself is covered in `lib/aero-test.test.ts` and the callback parsing in
 * `lib/aero-integration.test.ts`.
 */
const panel = readFileSync(new URL('./AeroIntegrationPanel.tsx', import.meta.url), 'utf8');
const catalogues = ['es', 'pt-BR'].map((lang) => ({
  lang,
  aero: JSON.parse(
    readFileSync(new URL(`../../i18n/locales/${lang}.json`, import.meta.url), 'utf8'),
  ).massas.aero as Record<string, string>,
}));

describe('la prueba de conexión salió del navegador', () => {
  it('pide un ticket `test` y abre el atajo, en vez de llamar al WebService', () => {
    assert.ok(panel.includes('requestAeroBridgeTicket({'));
    assert.ok(panel.includes("action: 'test'"));
    assert.ok(panel.includes('buildAeroBridgeTriggerUrl({'));
    // Nada del sondeo del navegador sobrevive: no hay `fetch` a la planta ni sonda que interpretar.
    assert.equal(panel.includes('probeAeroConnection'), false);
    assert.equal(panel.includes('aeroConnectionBlocker'), false);
    assert.equal(panel.toLowerCase().includes('no-cors'), false);
  });

  it('escribe la línea `requested` antes de salir y cierra la pareja con el callback', () => {
    assert.ok(panel.includes('aeroTestRequestedEvent('));
    assert.ok(panel.includes('postAeroAuditEvent('));
    assert.ok(panel.includes('aeroTestResultEvent('));
    // Un solo identificador para la pareja: la línea pedida y la respuesta son la misma acción.
    assert.ok(panel.includes('newAeroAttempt()'));
    assert.ok(panel.includes('...attempt'));
    // El callback se consume y se limpia para que un refresco no repita un veredicto ya leído.
    assert.ok(panel.includes('parseAeroCallback(window.location.search)'));
    assert.ok(panel.includes('window.history.replaceState('));
  });

  it('un intento sin contraseña en el cofre no llega a ser intento, y lo dice', () => {
    // La línea dice por qué la página se detuvo en vez de fingir un fallo del ERP.
    assert.ok(panel.includes("note: 'via=ticket reason=invalid_config'"));
    for (const { lang, aero } of catalogues) {
      assert.match(aero.testInvalid, /contrase|senha/i, `testInvalid in ${lang} names the password`);
      assert.match(aero.testInvalid, /servidor/i, `testInvalid in ${lang} says where it is saved`);
    }
  });

  it('el veredicto que vuelve del atajo sigue nombrando la conexión y no inventa un usuario', () => {
    for (const { lang, aero } of catalogues) {
      assert.ok(aero.testShortcutOk.length > 0, `testShortcutOk in ${lang}`);
      assert.ok(aero.testShortcutError.length > 0, `testShortcutError in ${lang}`);
      assert.ok(aero.testShortcutUnknown.length > 0, `testShortcutUnknown in ${lang}`);
      assert.ok(aero.testShortcutOpening.length > 0, `testShortcutOpening in ${lang}`);
    }
    // El veredicto se sigue pintando con el mismo tono que antes, desde el módulo de feedback.
    assert.ok(panel.includes('connectionVerdictTone(outcome.verdict)'));
  });
});
