import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * La pantalla que instala el puente, sin receta.
 *
 * El teléfono ya no arma veintitrés acciones a mano: importa un archivo una vez y desde ahí los botones de
 * Trindade abren Scriptable. Esta prueba lee el diálogo y los dos catálogos, porque lo que hay que sostener es
 * justamente lo que no está escrito: ni una receta numerada, ni un enlace de iCloud, ni una credencial.
 */
const dialog = readFileSync(new URL('./AeroScriptableDialog.tsx', import.meta.url), 'utf8');

const catalogues = ['es', 'pt-BR'].map((lang) => {
  const json = JSON.parse(
    readFileSync(new URL(`../../i18n/locales/${lang}.json`, import.meta.url), 'utf8'),
  ) as { massas: { aero: Record<string, string> }; aeroDevice: Record<string, string> };
  return { lang, aero: json.massas.aero, device: json.aeroDevice };
});

/** Toda clave que el diálogo pinta sale del catálogo: acá se recogen para verificarlas en los dos idiomas. */
const usedKeys = new Set(
  [...dialog.matchAll(/t\('massas\.aero\.([A-Za-z0-9_]+)'/g)].map((match) => match[1]),
);

/** Los controles que abren otra app, que son los que tienen que ser un dedo de alto. */
const links = [...dialog.matchAll(/<a\b[\s\S]*?className="([^"]*)"/g)].map((match) => match[1]);

describe('aero-scriptable dialog: install Scriptable and import the bridge', () => {
  it('links to the App Store page and to the importable script, through the shared constants', () => {
    // Ni una URL escrita a mano: la App Store y el asset son constantes de integración, y una prueba de
    // `aero-integration.test.ts` fija su valor.
    assert.ok(dialog.includes('href={AERO_SCRIPTABLE_APP_URL}'), 'the App Store link comes from the constant');
    assert.equal(dialog.includes('apps.apple.com'), false, 'the App Store URL is not written inline');
    assert.ok(dialog.includes('data-testid="aero-scriptable-app-store"'));
    assert.ok(dialog.includes('target="_blank"'));
    assert.ok(dialog.includes('rel="noopener noreferrer"'));

    assert.ok(dialog.includes('href={AERO_SCRIPTABLE_ASSET_PATH}'), 'the asset link comes from the constant');
    // `download` es lo que hace que el toque baje el archivo en vez de abrirlo como texto plano en Safari.
    assert.ok(/download=\{?/.test(dialog), 'the asset link downloads the file');
    assert.ok(dialog.includes('data-testid="aero-scriptable-asset"'));
    assert.equal(dialog.includes('Aero32Bridge.scriptable"'), false, 'the path is not written inline');
  });

  it('keeps the dialog conventions and its own test id', () => {
    assert.ok(dialog.includes('import { Dialog } from \'../../components/ui/dialog\''));
    assert.ok(dialog.includes('panelTestId="aero-scriptable-dialog"'));
    assert.equal(dialog.includes('aria-labelledby'), false, 'the shared Dialog owns the aria wiring');
    assert.ok(dialog.includes('labelledBy="aero-scriptable-title"'));
    assert.ok(dialog.includes('describedBy="aero-scriptable-intro"'));
  });

  it('presents the three steps in the order the phone needs them', () => {
    const install = dialog.indexOf("t('massas.aero.scriptableInstallTitle')");
    const importStep = dialog.indexOf("t('massas.aero.scriptableImportTitle')");
    const back = dialog.indexOf("t('massas.aero.scriptableReturnTitle')");

    assert.ok(install > 0, 'the App Store step is rendered');
    assert.ok(importStep > install, 'importing the file comes after installing the app');
    assert.ok(back > importStep, 'coming back to Trindade is the last step');
  });

  it('explains the share sheet and the fixed name the deep link addresses', () => {
    const scriptName = ['Aero32', 'Bridge'].join('');
    for (const { lang, aero } of catalogues) {
      const hint = aero.scriptableImportHint ?? '';
      // El archivo se descarga, se toca y se comparte con Scriptable: no se escribe nada a mano.
      assert.match(hint, /Compartir|Compartilhar/, `scriptableImportHint in ${lang} names the share step`);
      assert.match(hint, /Scriptable/, `scriptableImportHint in ${lang} names the app`);
      assert.ok(hint.includes(scriptName), `scriptableImportHint in ${lang} names the script`);
    }
  });

  it('opens Scriptable itself, without asking it to run anything', () => {
    assert.ok(dialog.includes('href="scriptable://"'), 'the open button uses the app scheme');
    assert.ok(dialog.includes('data-testid="aero-scriptable-open"'));
    // Abrir la app no es disparar el puente: el deep link de la app no lleva ticket, ni script, ni consulta.
    assert.equal(/href="scriptable:\/\/[^"]*\?/.test(dialog), false, 'opening the app carries no parameters');
    assert.equal(/scriptable:\/\/\/run/.test(dialog), false, 'the dialog never builds the bridge deep link');
  });

  it('fits a 375px phone: one column, no sideways scroll and thumb-sized controls', () => {
    // Cuatro controles tocables: los dos enlaces, «Abrir Scriptable» y «Cerrar».
    assert.ok(links.length >= 3, `expected the links to be real anchors, saw ${links.length}`);
    for (const className of links) {
      assert.ok(className.includes('min-h-[44px]'), `a link lost its 44px floor: ${className}`);
      assert.ok(className.includes('w-full'), `a link does not fill the column: ${className}`);
    }
    assert.equal(/w-\[\d+px\]/.test(dialog), false, 'no fixed pixel width that could overflow at 375px');
    assert.equal(/overflow-x/.test(dialog), false, 'no horizontal scroller');
    // Un solo scroll: la cabecera y los botones quedan quietos y el cuerpo se desplaza.
    assert.ok(dialog.includes('overflow-y-auto'));
  });

  it('carries no action recipe, no copy buttons and no credential', () => {
    for (const retired of [
      'shortcutStep',
      'StepItem',
      'shortcutBlock',
      'shortcutIcloud',
      'iCloud',
      'shortcutCopy',
      'navigator.clipboard',
      'Authorization',
      'password',
      'acceso directo',
      'atajo',
    ]) {
      assert.equal(dialog.includes(retired), false, `the dialog still carries ${retired}`);
    }
    // Ni un paso numerado de la receta vieja: los tres pasos son de instalación, no de acciones.
    assert.equal(/(Acción|Ação|Action)\s*\d/.test(dialog), false, 'no numbered actions are taught here');
  });

  it('reads every sentence it prints from both catalogues, in parity', () => {
    assert.ok(usedKeys.size >= 10, `expected the dialog copy to come from the catalogue, saw ${usedKeys.size}`);
    for (const { lang, aero } of catalogues) {
      for (const key of usedKeys) {
        assert.equal(typeof aero[key], 'string', `missing massas.aero.${key} in ${lang}`);
        assert.ok(aero[key].length > 0, `empty massas.aero.${key} in ${lang}`);
      }
    }
    // Mismas claves y en el mismo orden: un idioma que se queda atrás se lee como una pantalla rota.
    assert.deepEqual(
      Object.keys(catalogues[0]!.aero),
      Object.keys(catalogues[1]!.aero),
      'ES and PT must carry the same aero keys in the same order',
    );
    assert.deepEqual(
      Object.keys(catalogues[0]!.device),
      Object.keys(catalogues[1]!.device),
      'ES and PT must carry the same device keys in the same order',
    );
  });

  it('drops the keys the retired recipe needed', () => {
    const retired = [
      'shortcutName',
      'shortcutNameHint',
      'shortcutLaunchTitle',
      'shortcutHeadersTitle',
      'shortcutHeadersHint',
      'shortcutKeyLabel',
      'shortcutCopy',
      'shortcutCopied',
      'shortcutDone',
      'shortcutEndpointsTitle',
      'shortcutEndpointEntrada',
      'shortcutEndpointSaida',
      'shortcutEndpointMovimentos',
      'shortcutEndpointTest',
      'shortcutIcloudLegacyTitle',
      'shortcutIcloudLegacyBadge',
      'shortcutIcloudLegacyHint',
      'shortcutIcloudLegacyButton',
      'shortcutBlockUnpack',
      'shortcutBlockBatch',
      'shortcutBlockSingle',
      'shortcutBlockReturn',
      'shortcutStepInput',
      'shortcutStepTicketKey',
      'shortcutStepTicketUrlKey',
      'shortcutStepTicketRedeem',
      'shortcutStepTicketHeaders',
      'shortcutStepUrl',
      'shortcutStepHeaders',
      'shortcutStepAuthorization',
      'shortcutStepCallback',
      'shortcutStepBodiesCheck',
      'shortcutStepReset',
      'shortcutStepRepeat',
      'shortcutStepBatchFetch',
      'shortcutStepBatchCollect',
      'shortcutStepRepeatEnd',
      'shortcutStepJoin',
      'shortcutStepBracket',
      'shortcutStepBatchEncode',
      'shortcutStepElse',
      'shortcutStepBodyItem',
      'shortcutStepSingleFetch',
      'shortcutStepSingleEncode',
      'shortcutStepEndIf',
      'shortcutStepBack',
    ];
    for (const { lang, aero } of catalogues) {
      for (const key of retired) {
        assert.equal(key in aero, false, `massas.aero.${key} is still in ${lang}`);
      }
    }
  });

  it('names Scriptable everywhere the operator reads about the phone', () => {
    for (const { lang, aero, device } of catalogues) {
      for (const [key, value] of Object.entries({ ...aero, ...device })) {
        assert.equal(/Atajo|Atalho/i.test(value), false, `massas.aero.${key} in ${lang} still names the old app`);
        assert.equal(/iCloud/i.test(value), false, `massas.aero.${key} in ${lang} still points at iCloud`);
      }
      // Las tres frases que la persona ve al instalar, probar y sincronizar nombran la app que corre el script.
      for (const key of ['shortcutTitle', 'shortcutIntro', 'shortcutOpenApp', 'testShortcutOpening', 'syncSent']) {
        assert.match(aero[key] ?? '', /Scriptable/, `massas.aero.${key} in ${lang} must name Scriptable`);
      }
    }
  });
});
