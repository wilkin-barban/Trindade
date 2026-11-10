#!/usr/bin/env node
// Genera los assets del puente Aero32 a partir de una sola fuente.
//
// El `.scriptable` es JSON con el JavaScript adentro de un string, y un JSON escapado no se lee: pegarlo en
// Scriptable muere en el primer `:` de `"name"`. Por eso la fuente vive legible en `scriptable/Aero32Bridge.js`
// y este generador produce, deterministas y desde el mismo texto:
//
//   public/Aero32Bridge.js           JavaScript crudo, lo que el operario copia y pega.
//   public/Aero32Bridge.scriptable   JSON, artefacto interno de importación/registro.
//
// Sólo escribe cuando el contenido cambia, para que correr el build no mueva el mtime del asset.
// Las rutas se resuelven desde la ubicación de este archivo, nunca desde el directorio de trabajo.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const SCRIPTABLE_SOURCE_PATH = resolve(here, '..', 'scriptable', 'Aero32Bridge.js');
export const SCRIPTABLE_ASSET_PATH = resolve(here, '..', 'public', 'Aero32Bridge.scriptable');
// El asset que se copia y se pega: mismo texto que la fuente, sin JSON ni escapado.
export const SCRIPTABLE_RAW_ASSET_PATH = resolve(here, '..', 'public', 'Aero32Bridge.js');

/**
 * El asset completo, tal como se commitea.
 *
 * El nombre es exactamente `Aero32Bridge`, sin espacio, porque el URL scheme lo usa para encontrar el
 * script. Las claves van en este orden fijo para que el archivo no derive entre corridas.
 */
export function buildScriptableAsset(source) {
  return (
    JSON.stringify(
      {
        name: 'Aero32Bridge',
        script: source,
        icon: { color: 'blue', glyph: 'arrow.triangle.2.circlepath' },
        always_run_in_app: true,
        share_sheet_inputs: ['text'],
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * Escribe los dos assets sólo si cambiaron, y dice qué hizo.
 *
 * El crudo se copia como bytes, sin pasar por texto: si la fuente es válida, el archivo que se pega en el
 * teléfono es exactamente el que se revisó. El JSON se arma desde el mismo buffer para que ambos coincidan.
 */
export async function writeScriptableAsset({
  sourcePath = SCRIPTABLE_SOURCE_PATH,
  assetPath = SCRIPTABLE_ASSET_PATH,
  rawAssetPath = SCRIPTABLE_RAW_ASSET_PATH,
} = {}) {
  const sourceBytes = await readFile(sourcePath);
  const next = buildScriptableAsset(sourceBytes.toString('utf8'));
  const current = existsSync(assetPath) ? await readFile(assetPath) : null;
  const currentRaw = existsSync(rawAssetPath) ? await readFile(rawAssetPath) : null;

  const wroteAsset = !current || !current.equals(Buffer.from(next, 'utf8'));
  const wroteRaw = !currentRaw || !currentRaw.equals(sourceBytes);

  if (wroteAsset) {
    await writeFile(assetPath, next, 'utf8');
  }

  if (wroteRaw) {
    await writeFile(rawAssetPath, sourceBytes);
  }

  return { wrote: wroteAsset || wroteRaw, wroteAsset, wroteRaw, assetPath, rawAssetPath };
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const { assetPath, rawAssetPath, wroteAsset, wroteRaw } = await writeScriptableAsset();
  console.log(`${wroteRaw ? 'escrito' : 'sin cambios'}: ${rawAssetPath}`);
  console.log(`${wroteAsset ? 'escrito' : 'sin cambios'}: ${assetPath}`);
}
