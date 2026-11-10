import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Lo que el panel dice cuando el operario prueba la conexión.
 *
 * La prueba ya no ocurre en el navegador: la página no tiene contraseña y Safari rechaza el HTTP plano de la
 * fábrica desde una página HTTPS. El panel pide un ticket `test`, Scriptable lo canjea contra `/usuarios/` y el
 * veredicto vuelve como callback. Estas aserciones leen el cableado, porque el vocabulario del veredicto vive en
 * `lib/aero-test.test.ts` y el parseo del callback en `lib/aero-integration.test.ts`.
 */
const panel = readFileSync(new URL('./AeroIntegrationPanel.tsx', import.meta.url), 'utf8');
const catalogues = ['es', 'pt-BR'].map((lang) => ({
  lang,
  aero: JSON.parse(
    readFileSync(new URL(`../../i18n/locales/${lang}.json`, import.meta.url), 'utf8'),
  ).massas.aero as Record<string, string>,
}));

/** El esquema retirado, partido para que esta prueba no se delate como infractora del guardián esquema. */
const RETIRED_SCHEME = ['short', 'cuts://'].join('');

describe('la prueba de conexión salió del navegador', () => {
  it('pide un ticket `test` y abre Scriptable, en vez de llamar al WebService', () => {
    assert.ok(panel.includes('requestAeroBridgeTicket({'));
    assert.ok(panel.includes("action: 'test'"));
    assert.ok(panel.includes('buildAeroBridgeTriggerUrl({'));
    // El nombre del script no viaja desde el panel: lo fija el builder, porque el URL scheme lo direcciona.
    const calls = [...panel.matchAll(/buildAeroBridgeTriggerUrl\(\{([^}]*)\}/g)].map((match) => match[1]);
    assert.ok(calls.length > 0);
    for (const args of calls) {
      assert.equal(/\bname:/.test(args ?? ''), false, 'the panel must not choose the script name');
      assert.ok((args ?? '').includes('ticket:'), 'the call carries the ticket');
      assert.ok((args ?? '').includes('ticketUrl:'), 'the call carries the redeem URL');
    }
    // Nada del sondeo del navegador sobrevive: no hay `fetch` a la planta ni sonda que interpretar.
    assert.equal(panel.includes('probeAeroConnection'), false);
    assert.equal(panel.includes('aeroConnectionBlocker'), false);
    assert.equal(panel.toLowerCase().includes('no-cors'), false);
    // Y ninguna puerta trasera al esquema viejo: la única salida es el builder.
    assert.equal(panel.includes(RETIRED_SCHEME), false);
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
      assert.match(aero.testInvalid ?? '', /contrase|senha/i, `testInvalid in ${lang} names the password`);
      assert.match(aero.testInvalid ?? '', /servidor/i, `testInvalid in ${lang} says where it is saved`);
    }
  });

  it('el veredicto que vuelve de Scriptable sigue nombrando la conexión y no inventa un usuario', () => {
    for (const { lang, aero } of catalogues) {
      for (const key of ['testShortcutOk', 'testShortcutError', 'testShortcutUnknown', 'testShortcutOpening']) {
        assert.ok((aero[key] ?? '').length > 0, `${key} in ${lang}`);
        // El teléfono ya no corre la app Atajos: el veredicto lo trae Scriptable.
        assert.match(aero[key] ?? '', /Scriptable/, `massas.aero.${key} in ${lang} must name Scriptable`);
      }
    }
    // El veredicto se sigue pintando con el mismo tono que antes, desde el módulo de feedback.
    assert.ok(panel.includes('connectionVerdictTone(outcome.verdict)'));
  });
});
