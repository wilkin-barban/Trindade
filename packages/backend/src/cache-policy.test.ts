import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { TEST_VAULT_KEY } from './test-helper.js';

const PUBLIC_TOKEN = '0123456789abcdef0123456789abcdef';

/**
 * La política de caché se prueba sobre el servidor real, no sobre una copia del hook: `server.ts`
 * arranca igual que en producción y las respuestas se piden por HTTP. Cubre las dos mitades del
 * contrato — el JSON del API nunca se reutiliza, y el enlace público de foto conserva el `no-store`
 * privado que declara su propia ruta en vez de heredar el valor por defecto.
 */
describe('cache policy of the answers the API hands out', () => {
  const root = mkdtempSync(join(tmpdir(), 'trindade-cache-policy-'));
  const databasePath = join(root, 'trindade.db');
  const photosDir = join(root, 'photos');
  let child: ChildProcess | undefined;
  let baseUrl = '';
  let logs = '';

  before(async () => {
    const { NODE_TEST_CONTEXT: _nodeTestContext, ...inherited } = process.env;
    const spawned = spawn(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'server.ts')], {
      cwd: join(import.meta.dirname, '..'),
      env: {
        ...inherited,
        AERO_VAULT_KEY: TEST_VAULT_KEY,
        DATABASE_PATH: databasePath,
        PHOTOS_DIR: photosDir,
        JWT_SECRET: 'cache-policy-startup-secret-32-bytes',
        HOST: '127.0.0.1',
        // El puerto lo elige el sistema y se lee de la línea de arranque: así este test puede correr
        // junto a cualquier otro servidor que la suite levante sin elegir un número y colisionar.
        PORT: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child = spawned;

    baseUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not start: ${logs}`)), 30_000);
      const collect = (chunk: Buffer) => {
        logs += chunk.toString();
        const listening = /Server listening at http:\/\/127\.0\.0\.1:(\d+)/.exec(logs);
        if (listening) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${listening[1]}`);
        }
      };
      spawned.stdout?.on('data', collect);
      spawned.stderr?.on('data', collect);
      spawned.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`server exited with code ${code}: ${logs}`));
      });
    });
  });

  after(async () => {
    const running = child;
    if (running && running.exitCode === null) {
      running.kill('SIGKILL');
      await new Promise(resolve => running.once('exit', resolve));
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('refuses to let a browser reuse JSON, error answers included', async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'no-store', 'health JSON is reusable');

    // Un 401 también es una respuesta del API y no debe quedar en ninguna caché intermedia.
    const denied = await fetch(`${baseUrl}/api/salida/catalog`);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('cache-control'), 'no-store', 'rejected JSON is reusable');
  });

  it('leaves the public photo link to the policy its own route declares', async () => {
    writeFileSync(join(photosDir, 'fixture.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const db = new Database(databasePath);
    db.prepare("INSERT INTO reports (id, user_id, turno, report_date) VALUES (1, 1, 'tarde', '2026-01-01')").run();
    db.prepare(`INSERT INTO report_photos (id, report_id, file_path, file_size, mime_type, public_token)
      VALUES (1, 1, 'fixture.jpg', 4, 'image/jpeg', ?)`).run(PUBLIC_TOKEN);
    db.close();

    const photo = await fetch(`${baseUrl}/p/${PUBLIC_TOKEN}`);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('cache-control'), 'private, no-store', 'the route stopped owning its policy');
  });
});
