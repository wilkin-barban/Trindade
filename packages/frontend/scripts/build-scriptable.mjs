#!/usr/bin/env node
// Genera el asset que se importa en Scriptable.
//
// El `.scriptable` es JSON con el JavaScript adentro de un string, y un JSON escapado no se lee. Por eso
// la fuente vive legible en `scriptable/Aero32Bridge.js` y este generador produce
// `public/Aero32Bridge.scriptable`, determinista: mismo fuente, mismos bytes.
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

/** Escribe el asset sólo si cambió, y dice qué hizo. */
export async function writeScriptableAsset({
  sourcePath = SCRIPTABLE_SOURCE_PATH,
  assetPath = SCRIPTABLE_ASSET_PATH,
} = {}) {
  const source = await readFile(sourcePath, 'utf8');
  const next = buildScriptableAsset(source);
  const current = existsSync(assetPath) ? await readFile(assetPath, 'utf8') : null;

  if (current === next) {
    return { wrote: false, assetPath };
  }

  await writeFile(assetPath, next, 'utf8');
  return { wrote: true, assetPath };
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const { wrote, assetPath } = await writeScriptableAsset();
  console.log(wrote ? `escrito: ${assetPath}` : `sin cambios: ${assetPath}`);
}
