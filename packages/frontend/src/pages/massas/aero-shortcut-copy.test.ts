import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dialogPath = path.resolve(__dirname, 'AeroShortcutDialog.tsx');
const source = fs.readFileSync(dialogPath, 'utf8');
/** La parte del diálogo que describe la receta; el resto es el marco del `Dialog`. */
// La receta está en cuatro bloques numerados: el corte va del primer bloque al último. No sirve cortar por
// `<ol>`, porque el helper `StepBlock` también los declara y el corte quedaría en el componente vacío.
const root = source.slice(source.indexOf('<StepBlock'), source.lastIndexOf('</StepBlock>'));

const catalogues = ['pt-BR', 'es'].map((lang) => ({
  lang,
  aero: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../i18n/locales', `${lang}.json`), 'utf8')).massas
    .aero as Record<string, string>,
}));

describe('aero-shortcut dialog: the one bridge the phone has to build', () => {
  it('numbers exactly the twenty-three actions the recipe takes, and nothing else', () => {
    const steps = [...source.matchAll(/<StepItem n=\{(\d+)\}/g)].map((match) => Number(match[1]));
    // Cuatro bloques: ticket y sobre (1-9), lote (10-18), individual (19-21) y retorno (22-23). Tres acciones
    // nuevas al frente -- las dos claves y el canje -- y las veinte que el atajo ya tenía, renumeradas.
    assert.deepEqual(steps, Array.from({ length: 23 }, (_, index) => index + 1));
    // El título no escribe el número a mano: lo lee del recipe, así que no puede quedar desactualizado.
    assert.ok(source.includes("t('massas.aero.shortcutLaunchTitle', { count: recipe.actionCount })"));
    for (const { lang, aero } of catalogues) {
      assert.ok(
        aero.shortcutLaunchTitle.includes('{{count}}'),
        `massas.aero.shortcutLaunchTitle in ${lang} must read the count it is given`,
      );
    }
  });

  it('shows the three ticket steps before the envelope, in the order the phone runs them', () => {
    // Paso 2 y 3: las dos claves del diccionario de entrada. Paso 4: el canje, cuya respuesta es el sobre.
    const ticketKey = source.indexOf("t('massas.aero.shortcutStepTicketKey')");
    const ticketUrlKey = source.indexOf("t('massas.aero.shortcutStepTicketUrlKey')");
    const redeem = source.indexOf("t('massas.aero.shortcutStepTicketRedeem')");
    const envelopeUrl = source.indexOf("t('massas.aero.shortcutStepUrl')");

    assert.ok(ticketKey > 0 && ticketUrlKey > ticketKey, 'the two keys are read in order');
    assert.ok(redeem > ticketUrlKey, 'the redemption comes after the two keys');
    assert.ok(envelopeUrl > redeem, 'the envelope steps read the answer of the redemption');
    for (const { lang, aero } of catalogues) {
      for (const key of ['shortcutStepTicketKey', 'shortcutStepTicketUrlKey', 'shortcutStepTicketRedeem']) {
        assert.equal(typeof aero[key], 'string', `missing massas.aero.${key} in ${lang}`);
      }
      // La receta dice de dónde sale el ticket y con qué cabecera se canjea; el token no se escribe acá.
      assert.ok(aero.shortcutStepTicketHeaders.includes('X-Trindade-Ticket'), `step 4 headers in ${lang}`);
    }
  });

  it('reads the dictionary keys the answer carries, and takes the Authorization from inside headers', () => {
    // Las claves las arma `aeroBridgeShortcutRecipe`; el diálogo las muestra con su botón de copiar. El
    // Authorization no es una clave de la respuesta: se lee del diccionario `headers`, que es lo que viaja.
    for (const key of ['ticket', 'ticketUrl', 'url', 'headers', 'authorization', 'body', 'bodies', 'callback']) {
      assert.ok(root.includes(`id="${key}"`), `missing copyable key ${key}`);
    }
    for (const key of ['url', 'headers', 'authorization', 'body', 'bodies', 'callback']) {
      assert.ok(
        root.includes(`value={recipe.keys.${key}}`),
        `the ${key} step must show the key name it copies`,
      );
    }
    // Las dos claves del ticket viven en su propio par del recipe, no entre las del sobre.
    assert.ok(root.includes('value={recipe.ticketKey}'));
    assert.ok(root.includes('value={recipe.ticketUrlKey}'));
    // La receta anterior pedía una clave `auth` que el sobre nunca trajo.
    assert.equal(root.includes('id="auth"'), false);
    assert.equal(root.includes('value="auth"'), false);
    assert.equal(root.includes('id="endpoint"'), false);
  });

  it('marks the old iCloud shortcut as legacy instead of offering it as the install', () => {
    // Ese enlace apunta al atajo de veinte acciones: instalarlo deja un atajo que nunca canjea un ticket, así
    // que no puede presentarse como «listo para instalar».
    const legacy = source.indexOf('data-testid="aero-shortcut-icloud-legacy"');
    assert.ok(legacy > 0, 'the old link is presented as legacy');
    assert.ok(legacy < source.indexOf('<StepBlock'), 'the legacy note comes before the manual steps');

    const card = source.slice(legacy, legacy + 1400);
    assert.ok(card.includes('href={AERO_SHORTCUT_ICLOUD_URL}'), 'the link still points at the old shortcut');
    assert.ok(card.includes('target="_blank"'));
    assert.ok(card.includes('rel="noopener noreferrer"'));
    assert.ok(card.includes('data-testid="aero-shortcut-icloud-link"'));
    // Un enlace que se abre en otra app no puede ser un renglón de texto: es un botón de 44 px.
    assert.ok(/min-h-\[44px\]/.test(card), 'the reference control is thumb-sized');
    for (const { lang, aero } of catalogues) {
      assert.ok(
        /obsolet|antigu|anterior|legacy/i.test(aero.shortcutIcloudLegacyBadge ?? '') ||
          /anterior|antigu/i.test(aero.shortcutIcloudLegacyTitle ?? ''),
        `the legacy card is labelled in ${lang}`,
      );
      assert.equal(
        /listo para instalar|pronto para instalar/i.test(aero.shortcutIcloudLegacyTitle ?? ''),
        false,
        `the legacy card must not claim it is ready to install in ${lang}`,
      );
    }
  });

  it('groups the manual recipe in four blocks so the operator knows where each step belongs', () => {
    for (const block of ['shortcutBlockUnpack', 'shortcutBlockBatch', 'shortcutBlockSingle', 'shortcutBlockReturn']) {
      assert.ok(source.includes(`t('massas.aero.${block}')`), `missing block title ${block}`);
    }
  });

  it('warns in the body step that the variable is renamed to body_item', () => {
    // iOS resuelve variables por nombre: `body` en la misma receta que `bodies` termina mandando el último
    // elemento de la repetición como cuerpo del producto suelto.
    assert.ok(root.includes("t('massas.aero.shortcutStepBodyItem')"));
    for (const { lang, aero } of catalogues) {
      assert.ok(
        aero.shortcutStepBodyItem.includes('body_item'),
        `massas.aero.shortcutStepBodyItem in ${lang} must name the renamed variable`,
      );
      assert.ok(
        aero.shortcutStepBodyItem.toLowerCase().includes('bodies'),
        `massas.aero.shortcutStepBodyItem in ${lang} must say what it is not`,
      );
    }
  });

  it('never shows a credential, a password or a ready-made envelope', () => {
    // Es la razón de ser del ticket: no hay nada sobre la fábrica que este diálogo pueda mostrar o copiar.
    assert.equal(/Authorization: Basic/.test(source), false);
    assert.equal(source.includes('basicAuthHeader'), false);
    assert.equal(source.includes('sampleEnvelope'), false);
    assert.equal(source.includes('recipe.authorization'), false);
    assert.equal(/https?:\/\/\d+\.\d+\.\d+\.\d+/.test(source), false);
  });

  it('no longer mentions a second shortcut nor a user code to fill in', () => {
    assert.equal(source.includes('testShortcutName'), false);
    assert.equal(source.includes('shortcutTest'), false);
    assert.equal(source.includes('userCode'), false);
    assert.equal(/t\('massas\.aero\.userCode(Label|Hint)'\)/.test(source), false);
  });

  it('defines every copy it renders in both catalogues', () => {
    const used = new Set([...source.matchAll(/t\('massas\.aero\.([A-Za-z0-9_]+)'/g)].map((match) => match[1]));
    assert.ok(used.size > 15, `expected the dialog to render its copy from the catalogue, saw ${used.size} keys`);
    for (const { lang, aero } of catalogues) {
      for (const key of used) {
        assert.equal(typeof aero[key], 'string', `missing massas.aero.${key} in ${lang}`);
        assert.ok(aero[key].length > 0, `empty massas.aero.${key} in ${lang}`);
      }
    }
  });

  it('keeps both catalogues free of the copy the split design needed', () => {
    for (const { lang, aero } of catalogues) {
      for (const key of [
        'shortcutTestTitle',
        'shortcutTestIntro',
        'userCodeLabel',
        'userCodeHint',
        // Las frases del sondeo por navegador y del sobre de prueba describían un camino que ya no existe.
        'testOk',
        'testOkNoUser',
        'testHttpError',
        'testNoCors',
        'testBlockedMixed',
        'testBlockedScheme',
        'testNetwork',
        'testTimeout',
        'shortcutSampleTitle',
        'shortcutSampleHint',
        'passwordEverySession',
      ]) {
        assert.equal(key in aero, false, `massas.aero.${key} is still in ${lang}`);
      }
      // Sólo sobreviven los avisos del panel, que siguen nombrando el resultado de la prueba.
      for (const key of ['testShortcutOpening', 'testShortcutOk', 'testShortcutError', 'testShortcutUnknown']) {
        assert.equal(typeof aero[key], 'string', `missing massas.aero.${key} in ${lang}`);
      }
      // La contraseña guardada se anuncia, y se anuncia como del servidor.
      assert.match(aero.passwordStored ?? '', /servidor/i, `passwordStored in ${lang} names the server`);
    }
  });
});
