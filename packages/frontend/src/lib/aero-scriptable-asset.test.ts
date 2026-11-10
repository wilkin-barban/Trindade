import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * The asset Scriptable imports, and the readable source it is built from.
 *
 * El `.scriptable` es JSON con el JavaScript escapado adentro: nadie lo puede leer, así que la fuente de
 * verdad vive en `scriptable/Aero32Bridge.js` y el asset se genera. Esta prueba es el candado: si alguien
 * edita la fuente y no regenera -- o regenera y edita el JSON a mano -- falla acá, no en el teléfono del
 * operario cuando el botón no abre nada.
 */

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, '..', '..');
const SOURCE_PATH = resolve(frontendRoot, 'scriptable', 'Aero32Bridge.js');
const ASSET_PATH = resolve(frontendRoot, 'public', 'Aero32Bridge.scriptable');
// El asset que el operario copia y pega en Scriptable: JavaScript crudo, no el JSON del `.scriptable`.
const RAW_ASSET_PATH = resolve(frontendRoot, 'public', 'Aero32Bridge.js');
// Se resuelve desde este archivo, no desde el cwd del test runner.
const GENERATOR_URL = new URL('../../scripts/build-scriptable.mjs', import.meta.url).href;

interface ScriptableAsset {
  name: string;
  script: string;
  icon: { color: string; glyph: string };
  always_run_in_app: boolean;
  share_sheet_inputs: string[];
}

const source = readFileSync(SOURCE_PATH, 'utf8');
const assetText = readFileSync(ASSET_PATH, 'utf8');
const asset = JSON.parse(assetText) as ScriptableAsset;
// Se lee con guarda para que un asset crudo faltante sea un fallo con mensaje, no un error de importación.
const rawAssetText = existsSync(RAW_ASSET_PATH) ? readFileSync(RAW_ASSET_PATH, 'utf8') : '';

/**
 * El contrato que esta prueba necesita del generador. Es un `.mjs` sin tipos y el tsconfig del paquete no
 * incluye `allowJs`, así que se importa por URL dinámica y se tipa acá.
 */
interface ScriptableGenerator {
  buildScriptableAsset: (source: string) => string;
  writeScriptableAsset: () => Promise<{ wrote: boolean; assetPath: string; rawAssetPath: string }>;
}

async function loadGenerator(): Promise<ScriptableGenerator> {
  return (await import(GENERATOR_URL)) as ScriptableGenerator;
}

describe('aero-scriptable-asset: the file Scriptable imports', () => {
  it('is valid JSON with the exact name, icon and run options the URL scheme depends on', () => {
    assert.equal(asset.name, 'Aero32Bridge', 'el URL scheme busca este nombre exacto, sin espacio');
    assert.equal(asset.always_run_in_app, true);
    assert.deepEqual(asset.share_sheet_inputs, ['text']);
    assert.equal(asset.icon.color, 'blue');
    assert.equal(asset.icon.glyph, 'arrow.triangle.2.circlepath');
    assert.equal(typeof asset.script, 'string');
    assert.ok(asset.script.length > 0);
  });

  it('ships the source byte for byte, so what was reviewed is what the phone runs', () => {
    assert.equal(asset.script, source);
  });

  it('is exactly what the deterministic generator produces, so the asset cannot drift', async () => {
    const { buildScriptableAsset } = await loadGenerator();

    // Dos corridas, mismo resultado: el generador no depende del reloj, del cwd ni del orden del objeto.
    const first = buildScriptableAsset(source);
    const second = buildScriptableAsset(source);
    assert.equal(first, second);
    assert.equal(first, assetText, 'el asset commiteado no coincide: corré scripts/build-scriptable.mjs');
  });
});

describe('aero-scriptable-asset: the raw asset the operator copies', () => {
  it('exists as plain JavaScript, not as the JSON of the .scriptable', () => {
    assert.ok(
      rawAssetText.length > 0,
      'falta public/Aero32Bridge.js: corré `node scripts/build-scriptable.mjs` desde packages/frontend',
    );
    // Pegar el JSON en Scriptable muere en el primer `:` de `"name"`; el asset tiene que ser el script.
    assert.ok(rawAssetText.startsWith('// Puente Aero32'), 'el asset crudo empieza con el comentario del puente');
    assert.equal(rawAssetText.trimStart().startsWith('{'), false, 'el asset crudo no es un objeto JSON');
    assert.doesNotMatch(rawAssetText, /"name":/);
    assert.doesNotMatch(rawAssetText, /"script":/);
    assert.match(rawAssetText, /Script\.complete/, 'el asset crudo es el script que Scriptable ejecuta');
  });

  it('is the source byte for byte, and the same text the .scriptable embeds', () => {
    assert.equal(rawAssetText, source, 'el asset crudo se genera desde la fuente, no se copia a mano');
    assert.equal(rawAssetText, asset.script, 'el asset crudo y el `script` del .scriptable son el mismo texto');
    assert.ok(readFileSync(RAW_ASSET_PATH).equals(readFileSync(SOURCE_PATH)), 'mismos bytes, no sólo mismo texto');
  });
});

describe('aero-scriptable-asset: the generator writes both assets deterministically', () => {
  it('leaves two runs with identical bytes, and the second run rewrites nothing', async () => {
    const { writeScriptableAsset } = await loadGenerator();

    await writeScriptableAsset();
    const firstRaw = readFileSync(RAW_ASSET_PATH);
    const firstBundle = readFileSync(ASSET_PATH);

    const second = await writeScriptableAsset();
    const secondRaw = readFileSync(RAW_ASSET_PATH);
    const secondBundle = readFileSync(ASSET_PATH);

    assert.ok(firstRaw.equals(secondRaw), 'el asset crudo cambió entre corridas');
    assert.ok(firstBundle.equals(secondBundle), 'el .scriptable cambió entre corridas');
    assert.equal(second.wrote, false, 'con los assets al día, el generador no reescribe nada');
    assert.ok(secondRaw.equals(readFileSync(SOURCE_PATH)), 'el asset crudo sigue siendo la fuente');
  });
});

describe('aero-scriptable-asset: the bridge never leaves the page waiting', () => {
  const script = asset.script;

  it('caps the redeem request and every ERP POST with an explicit timeout', () => {
    // Sin timeout propio, una red que no responde deja la pantalla en «enviando» hasta que iOS decide.
    assert.match(script, /const TIEMPO_LIMITE = \d+;/, 'el límite se declara una sola vez');
    assert.match(script, /timeoutInterval/);
    // Scriptable mide `timeoutInterval` en segundos: el valor tiene que caer en la ventana 8–10 s.
    const limite = Number(script.match(/const TIEMPO_LIMITE = (\d+);/)?.[1]);
    assert.ok(limite >= 8 && limite <= 10, `timeoutInterval está en segundos: ${limite} fuera de 8–10`);
  });

  it('reports an unreachable ERP with a stable code and message instead of retrying the batch', () => {
    assert.match(script, /aero_error=wifi_required/);
    assert.match(
      script,
      /No se pudo alcanzar el ERP\. Verificá que el iPhone esté en la Wi-Fi Trindade Expedicao y que la red de la fábrica esté disponible\./,
      'el mensaje de red es estable: la web traduce el código, el texto viaja igual',
    );
    assert.match(script, /indice === 0/, 'sólo el primer cuerpo prueba el alcance del ERP');
  });

  it('still keeps no secret on the way back', () => {
    assert.doesNotMatch(script, /password/i);
    assert.doesNotMatch(script, /Authorization: Basic/);
    assert.doesNotMatch(script, /console\.log/);
  });
});

describe('aero-scriptable-asset: what the bridge script must contain', () => {
  const script = asset.script;

  it('reads the ticket from the deep link and redeems it with its own header', () => {
    assert.match(script, /args\.queryParameters/, 'el ticket y su URL llegan por query del deep link');
    assert.match(script, /X-Trindade-Ticket/, 'el canje se autentica con el ticket, no con una contraseña');
  });

  it('uses the plant HTTP network on purpose, and comes back to the page', () => {
    // El ERP de la planta es HTTP dentro de la LAN: sin esta bandera el script no puede hablar con él.
    assert.match(script, /allowInsecureRequest/);
    assert.match(script, /Safari\.open/);
    assert.match(script, /Script\.complete/);
  });

  it('sends one body or a batch, and answers through the callback the server wrote', () => {
    assert.match(script, /bodies/);
    assert.match(script, /callback/);
    // `Request` de Scriptable, no el `fetch` del navegador: ahí no hay política de contenido mixto.
    assert.match(script, /new Request\(/);
  });
});

describe('aero-scriptable-asset: the bridge carries no secret', () => {
  const script = asset.script;

  it('never mentions a password, a basic authorization or the browser fetch it replaces', () => {
    assert.doesNotMatch(script, /password/i);
    assert.doesNotMatch(script, /Authorization: Basic/);
    assert.doesNotMatch(script, /Basic /);
    assert.doesNotMatch(script, /fetch\(/);
    assert.doesNotMatch(script, /console\.log/, 'el script no registra el sobre ni sus encabezados');
  });

  it('holds no literal credential, only the ticket that the deep link brings at run time', () => {
    // Nada que parezca un secreto escrito en el archivo: el ticket se canjea, no se guarda.
    assert.doesNotMatch(script, /(?:ticket|token|senha|secret)\s*[:=]\s*['"][^'"]+['"]/i);
    assert.doesNotMatch(script, /[A-Za-z0-9+/=_-]{32,}/, 'no hay valores largos que puedan ser un token literal');
  });

  it('is not a Shortcuts recipe any more', () => {
    assert.equal(/\bshortcuts:\/\//.test(script), false);
  });
});
