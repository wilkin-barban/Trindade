import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/**
 * El generador es un `.mjs` sin tipos y el tsconfig del paquete no incluye `allowJs`, así que se importa
 * por URL dinámica y se tipa el único contrato que esta prueba necesita.
 */
async function loadGenerator(): Promise<{ buildScriptableAsset: (source: string) => string }> {
  return (await import(GENERATOR_URL)) as { buildScriptableAsset: (source: string) => string };
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
