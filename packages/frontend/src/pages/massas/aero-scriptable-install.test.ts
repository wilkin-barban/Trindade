import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * La pantalla que instala el puente, sin receta y sin descarga.
 *
 * Importar el `.scriptable` no funcionó en el iPhone: el archivo se abrió en el editor y Scriptable lo rechazó
 * por ser JSON. El camino que queda es copiar el JavaScript crudo y pegarlo en un script nuevo; esta prueba
 * lee el diálogo y el panel para sostener justamente eso -- ni una descarga, ni un enlace al `.scriptable`, ni
 * una receta numerada, ni una credencial -- y para exigir las dos puertas de la copia.
 */
const dialog = readFileSync(new URL('./AeroScriptableDialog.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('./AeroIntegrationPanel.tsx', import.meta.url), 'utf8');

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

/** El nombre del bundle, partido para que esta prueba no se delate a sí misma al leer las claves `*.scriptable*`. */
const BUNDLE_FILE = ['Aero32Bridge', 'scriptable'].join('.');

/** Los controles que abren otra app, que son los que tienen que ser un dedo de alto. */
const links = [...dialog.matchAll(/<a\b[\s\S]*?className="([^"]*)"/g)].map((match) => match[1]);

describe('aero-scriptable dialog: install Scriptable and copy the code', () => {
  it('no longer downloads the bundle nor points at it', () => {
    for (const [name, source] of [
      ['the dialog', dialog],
      ['the panel', panel],
    ] as const) {
      // Una sola puerta de entrada al script: el código copiado. Ni `download`, ni el asset JSON, ni su enlace.
      assert.equal(/download/i.test(source), false, `${name} still offers a download`);
      assert.equal(source.includes('AERO_SCRIPTABLE_ASSET_PATH'), false, `${name} still links the bundle`);
      assert.equal(source.includes(BUNDLE_FILE), false, `${name} still names the bundle file`);
      assert.equal(source.includes('aero-scriptable-asset'), false, `${name} still carries the bundle control`);
    }
  });

  it('links to the App Store page through the shared constant', () => {
    // Ni una URL escrita a mano: la App Store es una constante de integración, y `aero-integration.test.ts`
    // fija su valor.
    assert.ok(dialog.includes('href={AERO_SCRIPTABLE_APP_URL}'), 'the App Store link comes from the constant');
    assert.equal(dialog.includes('apps.apple.com'), false, 'the App Store URL is not written inline');
    assert.ok(dialog.includes('data-testid="aero-scriptable-app-store"'));
    assert.ok(dialog.includes('target="_blank"'));
    assert.ok(dialog.includes('rel="noopener noreferrer"'));
    assert.ok(panel.includes('href={AERO_SCRIPTABLE_APP_URL}'), 'the panel keeps the App Store link');
    assert.ok(panel.includes('data-testid="aero-scriptable-app-store"'));
  });

  it('copies the raw script from state, with the clipboard API and a textarea fallback', () => {
    // El código se carga al abrir el diálogo: el click no espera un `fetch`.
    assert.ok(dialog.includes('AERO_SCRIPTABLE_CODE_PATH'), 'the dialog fetches the raw script path');
    assert.ok(/fetch\(/.test(dialog), 'the dialog loads the code when it opens');
    assert.ok(/\.then\(/.test(dialog) && /\.text\(\)/.test(dialog), 'the dialog reads the response as text');
    // Primera puerta: la API del portapapeles, con el texto que ya está en memoria.
    assert.ok(dialog.includes('navigator.clipboard'), 'the copy uses the clipboard API');
    assert.ok(/clipboard[\s\S]{0,80}writeText/.test(dialog), 'the copy writes through `writeText`');
    // Segunda puerta: Safari, con un `textarea` fuera de pantalla y `execCommand`.
    assert.ok(dialog.includes("document.execCommand('copy')"), 'the fallback uses `execCommand`');
    assert.ok(dialog.includes('textarea'), 'the fallback builds its own textarea');
    assert.ok(dialog.includes('data-testid="aero-scriptable-copy"'), 'the copy button has its selector');
    // Y los dos desenlaces del click se pintan: el éxito y el error accionable.
    assert.ok(dialog.includes("t('massas.aero.scriptableCopied')"), 'the dialog shows the copied state');
    assert.ok(dialog.includes("t('massas.aero.scriptableCopyFailed')"), 'the dialog reports a failed copy');
  });

  it('opens the dialog from the panel instead of downloading anything', () => {
    // El panel no copia: abre el diálogo, que es el dueño del código y del estado de la copia.
    assert.ok(panel.includes('data-testid="aero-scriptable-copy-open"'), 'the panel has its own copy entry point');
    assert.ok(panel.includes("t('massas.aero.scriptableCopyButton')"), 'the entry point offers the copy path');
    assert.ok(panel.includes('setScriptableOpen(true)'), 'the entry point opens the dialog');
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
    const copy = dialog.indexOf("t('massas.aero.scriptableCopyButton')");
    const back = dialog.indexOf("t('massas.aero.scriptableReturnTitle')");

    assert.ok(install > 0, 'the App Store step is rendered');
    assert.ok(copy > install, 'copying the code comes after installing the app');
    assert.ok(back > copy, 'coming back to Trindade is the last step');
  });

  it('teaches the five steps of the copy path, with the fixed name the deep link addresses', () => {
    const scriptName = ['Aero32', 'Bridge'].join('');
    for (const { lang, aero } of catalogues) {
      const hint = aero.scriptableCopyHint ?? '';
      // Copiar, abrir la app, crear el script nuevo, pegar y renombrarlo: el camino que sí funcionó.
      assert.match(hint, /Copiar|Copie/, `scriptableCopyHint in ${lang} names the copy step`);
      assert.match(hint, /Scriptable/, `scriptableCopyHint in ${lang} names the app`);
      assert.ok(hint.includes('+'), `scriptableCopyHint in ${lang} names the new-script button`);
      assert.match(hint, /peg|col[ae]/i, `scriptableCopyHint in ${lang} names the paste step`);
      assert.ok(hint.includes(scriptName), `scriptableCopyHint in ${lang} names the script`);
      assert.match(hint, /renombr|renome/i, `scriptableCopyHint in ${lang} names the rename step`);
      // Y ninguna de las dos frases que llevaron al editor con el JSON.
      assert.equal(/[Dd]escarg|[Bb]aixe/.test(hint), false, `scriptableCopyHint in ${lang} still says download`);
      assert.equal(/Compartir|Compartilhar/.test(hint), false, `scriptableCopyHint in ${lang} still says share`);
      assert.equal(hint.includes('.scriptable'), false, `scriptableCopyHint in ${lang} still names the bundle`);
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
    // Tres controles tocables: el enlace a la App Store, «Abrir Scriptable» y «Cerrar»; y el botón de copiar.
    assert.ok(links.length >= 2, `expected the links to be real anchors, saw ${links.length}`);
    for (const className of links) {
      assert.ok(className.includes('min-h-[44px]'), `a link lost its 44px floor: ${className}`);
      assert.ok(className.includes('w-full'), `a link does not fill the column: ${className}`);
    }
    // El botón de copiar es el control central del paso 2: también un dedo de alto y todo el ancho.
    const copyButton = dialog.slice(dialog.indexOf('data-testid="aero-scriptable-copy"'));
    assert.ok(copyButton.slice(0, 400).includes('min-h-[44px]'), 'the copy button keeps its 44px floor');
    assert.ok(copyButton.slice(0, 400).includes('w-full'), 'the copy button fills the column');
    assert.equal(/w-\[\d+px\]/.test(dialog), false, 'no fixed pixel width that could overflow at 375px');
    assert.equal(/overflow-x/.test(dialog), false, 'no horizontal scroller');
    // Un solo scroll: la cabecera y los botones quedan quietos y el cuerpo se desplaza.
    assert.ok(dialog.includes('overflow-y-auto'));
  });

  it('carries no action recipe, no share sheet and no credential', () => {
    for (const retired of [
      'shortcutStep',
      'StepItem',
      'shortcutBlock',
      'shortcutIcloud',
      'iCloud',
      'shortcutCopy',
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
      // Y las tres frases que describían la descarga y el uso compartido del `.scriptable`.
      'scriptableImportTitle',
      'scriptableImportHint',
      'scriptableImportButton',
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
        // Ninguna frase del catálogo vuelve a ofrecer la descarga del bundle.
        assert.equal(/\.scriptable/i.test(value), false, `massas.aero.${key} in ${lang} still names the bundle`);
      }
      // Las tres frases que la persona ve al instalar, probar y sincronizar nombran la app que corre el script.
      for (const key of ['shortcutTitle', 'shortcutIntro', 'shortcutOpenApp', 'testShortcutOpening', 'syncSent']) {
        assert.match(aero[key] ?? '', /Scriptable/, `massas.aero.${key} in ${lang} must name Scriptable`);
      }
      // Y la ayuda del panel explica el camino de copiar, con la contraseña en el cofre del servidor.
      assert.match(aero.scriptablePanelHint ?? '', /copi/i, `scriptablePanelHint in ${lang} names the copy path`);
      assert.match(aero.scriptablePanelHint ?? '', /servidor/i, `scriptablePanelHint in ${lang} says where the password lives`);
    }
  });
});
