import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrateAuthSessions } from './auth-sessions-migration.js';
import { openDatabase } from './index.js';
import { migrateDatabase } from './migrations.js';
import { SCHEMA_VERSION, readSchemaReport } from './schema-version.js';

const schema = readFileSync(join(import.meta.dirname, 'schema.sql'), 'utf8');
const seed = readFileSync(join(import.meta.dirname, 'seed.sql'), 'utf8');
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * Build the revision 1 shape: the current schema minus the table revision 2 introduces,
 * stamped at revision 1. This is what a database written by the previous build looks
 * like, and it is the fixture that proves the 1 → 2 step is reachable at all.
 */
function makeRevisionOneShape(db: Database.Database): void {
  db.exec('DROP TABLE auth_sessions');
  db.exec('ALTER TABLE users DROP COLUMN security_version');
  withoutDriverPhone(db);
  db.pragma('user_version = 1');
}

/** Insert an administrator and return its id, for fixtures that need a report owner. */
function insertUser(db: Database.Database, username: string): number {
  const roleId = db.prepare("SELECT id FROM roles WHERE name = 'Administrador'").pluck().get() as number;
  return Number(
    db
      .prepare('INSERT INTO users (username, password_hash, display_name, role_id) VALUES (?,?,?,?)')
      .run(username, 'fixture-hash', username, roleId).lastInsertRowid,
  );
}

/**
 * Build the revision 7 shape: `aero_movements` keyed by `(movement_date, ent_lan)` only.
 *
 * That key came from reading one seat as one product. A document that carries several products under
 * the same `ENT_LAN` collapsed into a single row, so revision 8 rekeys the table.
 */
function makeRevisionSevenShape(db: Database.Database): void {
  db.exec('DROP TABLE aero_movements');
  db.exec(`CREATE TABLE aero_movements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    movement_date   TEXT NOT NULL,
    ent_lan         INTEGER NOT NULL,
    product_code    TEXT NOT NULL,
    product_desc    TEXT NOT NULL,
    quantity        REAL NOT NULL,
    entry_date      TEXT NOT NULL,
    operator_name   TEXT NOT NULL,
    movement_type   TEXT NOT NULL CHECK (movement_type IN ('E', 'S')),
    synced_at       TEXT NOT NULL,
    UNIQUE(movement_date, ent_lan)
  )`);
  db.exec('CREATE INDEX idx_aero_movements_date ON aero_movements(movement_date)');
  db.pragma('user_version = 7');
}

/**
 * Build the revision 11 shape of `report_photos`: the table whose `mime_type` CHECK names only JPEG, PNG and WebP.
 *
 * SQLite cannot widen a CHECK in place, so revision 12 rebuilds the table, and this fixture is the only way to prove
 * the rebuild meets the shape production actually has instead of the one `schema.sql` now declares.
 */
function makeRevisionElevenPhotosShape(db: Database.Database): void {
  db.pragma('foreign_keys = OFF');
  try {
    db.exec('DROP INDEX IF EXISTS idx_report_photos_report_id');
    db.exec(`CREATE TABLE report_photos_revision11 (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id    INTEGER NOT NULL REFERENCES reports(id),
      file_path    TEXT    NOT NULL,
      file_size    INTEGER NOT NULL,
      mime_type    TEXT    NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
      public_token TEXT    UNIQUE,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`INSERT INTO report_photos_revision11
      (id, report_id, file_path, file_size, mime_type, public_token, created_at)
      SELECT id, report_id, file_path, file_size, mime_type, public_token, created_at FROM report_photos`);
    db.exec('DROP TABLE report_photos');
    db.exec('ALTER TABLE report_photos_revision11 RENAME TO report_photos');
    db.exec('CREATE INDEX idx_report_photos_report_id ON report_photos(report_id)');
  } finally {
    db.pragma('foreign_keys = ON');
  }
  db.pragma('user_version = 11');
}

/** Insert a report and return its id, for cases whose subject is a table that references one. */
function insertReport(db: Database.Database, userId: number): number {
  return Number(
    db
      .prepare(`INSERT INTO reports (user_id, turno, report_date) VALUES (?, 'tarde', '2026-11-14')`)
      .run(userId).lastInsertRowid,
  );
}

/** Replace report_temperatures with the pre-`reading_index` shape it had before versioning. */function makeLegacyShape(db: Database.Database): void {
  db.pragma('foreign_keys = OFF');
  try {
    db.exec('DROP TABLE report_temperatures');
    db.exec(`
      CREATE TABLE report_temperatures (
        id INTEGER PRIMARY KEY,
        report_id INTEGER NOT NULL REFERENCES reports(id),
        location TEXT NOT NULL,
        value REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(report_id, location)
      );
    `);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Drop a column when the schema declares it, so a fixture describing an older revision builds either
 * way: before the column exists there is nothing to drop, and after it exists the fixture is the older
 * shape the migration has to widen.
 */
function dropColumnIfPresent(db: Database.Database, table: string, column: string): void {
  const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name);
  if (columns.includes(column)) db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

/**
 * A database written before revision 4 has no `drivers.phone`, whatever else its shape is, so every
 * fixture below that describes an older revision drops it. Without this the revision 4 step meets a
 * column that already exists and refuses with a duplicate-column error, and the fixture would be lying
 * about the revision it claims to be.
 */
function withoutDriverPhone(db: Database.Database): void {
  dropColumnIfPresent(db, 'drivers', 'phone');
}

const migrateScript = join(import.meta.dirname, 'migrate.ts');

function runMigrate(databasePath: string): Promise<{ code: number | null | 'timeout'; output: string }> {
  const { NODE_TEST_CONTEXT: _nodeTestContext, ...env } = process.env;
  const child = spawn(process.execPath, ['--import', 'tsx', migrateScript, databasePath], {
    cwd: join(import.meta.dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill(); resolve({ code: 'timeout', output }); }, 30_000);
    child.once('exit', (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
}

describe('schema migration', () => {
  const roots: string[] = [];
  const fixtureRoot = () => {
    const root = mkdtempSync(join(tmpdir(), 'trindade-schema-migrate-'));
    roots.push(root);
    return root;
  };

  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

  it('is a no-op on a current database', () => {
    const db = openDatabase(join(fixtureRoot(), 'current.db'));
    const result = migrateDatabase(db);
    assert.equal(result.outcome, 'already-current');
    assert.equal(result.report.verdict, 'current');
    db.close();
  });

  it('rebuilds a legacy unversioned database, stamps the revision, and is idempotent', () => {
    const path = join(fixtureRoot(), 'legacy.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    makeLegacyShape(build);
    build.exec('ALTER TABLE users DROP COLUMN security_version');
    withoutDriverPhone(build);
    build.close();

    const db = new Database(path);
    assert.equal(readSchemaReport(db).verdict, 'unversioned');

    const result = migrateDatabase(db);
    if (result.outcome !== 'migrated') assert.fail(`expected migrated, got ${result.outcome}`);
    assert.equal(result.rebuiltTemperatures, true);
    assert.equal(result.from, 0);
    assert.equal(result.to, SCHEMA_VERSION);
    assert.equal(result.report.verdict, 'current');

    const columns = (db.prepare('PRAGMA table_info(report_temperatures)').all() as { name: string }[]).map((c) => c.name);
    assert.ok(columns.includes('reading_index'), 'the legacy table was not rebuilt');
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);

    assert.equal(migrateDatabase(db).outcome, 'already-current');
    db.close();
  });

  it('stamps without rebuilding when the legacy shape is already migrated', () => {
    const path = join(fixtureRoot(), 'production-shape.db');
    const fresh = openDatabase(path);
    fresh.exec('ALTER TABLE users DROP COLUMN security_version');
    withoutDriverPhone(fresh);
    fresh.pragma('user_version = 0'); // revision 2 shape before versioning
    fresh.close();

    const db = new Database(path);
    assert.equal(readSchemaReport(db).verdict, 'unversioned');
    const result = migrateDatabase(db);
    if (result.outcome !== 'migrated') assert.fail(`expected migrated, got ${result.outcome}`);
    assert.equal(result.rebuiltTemperatures, false);
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
    db.close();
  });

  it('refuses a newer database without writing', () => {
    const path = join(fixtureRoot(), 'newer.db');
    const fresh = openDatabase(path);
    fresh.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
    fresh.close();
    const before = digest(path);

    const db = new Database(path);
    const result = migrateDatabase(db);
    assert.equal(result.outcome, 'refused');
    assert.match(result.reason, /newer/);
    db.close();

    assert.equal(digest(path), before, 'refusing a newer database modified it');
    assert.equal(new Database(path, { readonly: true }).pragma('user_version', { simple: true }), SCHEMA_VERSION + 1);
  });

  it('refuses an incompatible database without writing', () => {
    const path = join(fixtureRoot(), 'broken.db');
    const fresh = openDatabase(path);
    fresh.pragma('foreign_keys = OFF');
    fresh.exec('DROP TABLE settings');
    fresh.pragma('foreign_keys = ON');
    fresh.close();
    const before = digest(path);

    const db = new Database(path);
    const result = migrateDatabase(db);
    assert.equal(result.outcome, 'refused');
    assert.match(result.reason, /missing tables: settings/);
    db.close();

    assert.equal(digest(path), before, 'refusing an incompatible database modified it');
  });

  // The reason revision 2 exists: a database written by the previous build must be
  // migratable. Requiring `auth_sessions` of a revision 1 database would classify it
  // `incompatible`, and the migrate command refuses that verdict without ever opening
  // the file for writing, so the step that adds the table could never run.
  it('migrates a revision 1 database to the supported revision and preserves its rows', () => {
    const path = join(fixtureRoot(), 'revision-one.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    const userId = insertUser(build, 'legacy-admin');
    const reportId = Number(
      build
        .prepare("INSERT INTO reports (user_id, turno, report_date) VALUES (?,'tarde','2026-07-01')")
        .run(userId).lastInsertRowid,
    );
    makeRevisionOneShape(build);
    build.close();

    const db = new Database(path);
    assert.equal(readSchemaReport(db).verdict, 'outdated');

    const result = migrateDatabase(db);
    if (result.outcome !== 'migrated') assert.fail(`expected migrated, got ${result.outcome}`);
    assert.equal(result.from, 1);
    assert.equal(result.to, SCHEMA_VERSION);
    assert.equal(result.rebuiltTemperatures, false, 'a revision 1 database must skip the legacy rebuild');
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .all() as string[];
    assert.ok(tables.includes('auth_sessions'), 'the revision 2 step did not create auth_sessions');

    assert.deepEqual(db.prepare('SELECT username, display_name, is_active, security_version FROM users WHERE id = ?').get(userId), {
      username: 'legacy-admin',
      display_name: 'legacy-admin',
      is_active: 1,
      security_version: 1,
    });
    assert.deepEqual(db.prepare('SELECT user_id, turno, report_date FROM reports WHERE id = ?').get(reportId), {
      user_id: userId,
      turno: 'tarde',
      report_date: '2026-07-01',
    });
    db.close();
  });

  it('applies the revision 2 step idempotently', () => {
    const path = join(fixtureRoot(), 'revision-one-idempotent.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    makeRevisionOneShape(build);
    build.close();

    const db = new Database(path);
    if (migrateDatabase(db).outcome !== 'migrated') assert.fail('the revision 1 fixture did not migrate');
    const userId = insertUser(db, 'session-owner');
    db.prepare('INSERT INTO auth_sessions (user_id, token_hash, family_id, expires_at) VALUES (?,?,?,?)')
      .run(userId, 'token-hash-one', 'family-one', '2999-01-01 00:00:00');

    // A resumed migration re-enters a step after a crash between steps, so re-running it
    // must be a no-op rather than an error, and must not discard session rows.
    assert.doesNotThrow(() => migrateAuthSessions(db));
    assert.doesNotThrow(() => migrateAuthSessions(db));
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
    assert.equal(db.prepare('SELECT COUNT(*) FROM auth_sessions').pluck().get(), 1);
    assert.equal(migrateDatabase(db).outcome, 'already-current');

    const columns = (db.prepare('PRAGMA table_info(auth_sessions)').all() as { name: string }[]).map((c) => c.name);
    assert.deepEqual(columns, [
      'id',
      'user_id',
      'token_hash',
      'family_id',
      'expires_at',
      'revoked_at',
      'replaced_by',
      'created_at',
      'last_used_at',
      'ip_address',
    ]);
    db.close();
  });

  it('adds the driver phone column to a revision 3 database and keeps its rows', () => {
    const path = join(fixtureRoot(), 'revision-three-phone.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    // The revision 3 shape: a drivers table without the column a later revision adds, and rows that
    // already exist in it, because the migration's job is to widen the table and not to rewrite it.
    dropColumnIfPresent(build, 'drivers', 'phone');
    build.exec(
      "INSERT INTO drivers (name, license_plate, driver_type) VALUES ('Fletero Anterior', 'OLD-0001', 'fletero')," +
        " ('Casa Anterior', NULL, 'casa')",
    );
    build.pragma('user_version = 3');
    build.close();

    const db = new Database(path);
    const before = readSchemaReport(db);
    assert.equal(before.verdict, 'outdated');
    assert.equal(before.version, 3);

    const result = migrateDatabase(db);
    if (result.outcome !== 'migrated') assert.fail(`expected migrated, got ${result.outcome}`);
    assert.equal(result.from, 3);
    assert.equal(result.to, SCHEMA_VERSION);
    assert.equal(result.report.verdict, 'current');

    const columns = db.prepare('PRAGMA table_info(drivers)').all() as {
      name: string;
      notnull: number;
    }[];
    const phone = columns.find((column) => column.name === 'phone');
    assert.ok(phone, 'the migration must add drivers.phone');
    assert.equal(phone.notnull, 0, 'the phone is optional, so the column is nullable');

    const kept = db
      .prepare("SELECT name, driver_type, phone FROM drivers WHERE name = 'Fletero Anterior'")
      .get() as { name: string; driver_type: string; phone: string | null };
    assert.equal(kept.driver_type, 'fletero', 'the migration must not rewrite the rows it widens');
    assert.equal(kept.phone, null, 'a driver that existed before the migration has no phone');
    assert.equal(db.prepare("SELECT COUNT(*) FROM drivers WHERE name IN ('Fletero Anterior','Casa Anterior')").pluck().get(), 2);
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);

    assert.equal(migrateDatabase(db).outcome, 'already-current');
    db.close();
  });

  it('carries legacy temperature readings forward as reading_index 1 when migrating from revision 0', () => {
    const path = join(fixtureRoot(), 'legacy-readings.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    makeLegacyShape(build);
    build.exec('ALTER TABLE users DROP COLUMN security_version');
    withoutDriverPhone(build);
    const userId = insertUser(build, 'legacy-reader');
    const reportId = Number(
      build
        .prepare("INSERT INTO reports (user_id, turno, report_date) VALUES (?,'noite','2026-06-30')")
        .run(userId).lastInsertRowid,
    );
    build.prepare('INSERT INTO report_temperatures (report_id, location, value) VALUES (?,?,?)')
      .run(reportId, 'Câmara Principal', -18);
    build.close();

    const db = new Database(path);
    assert.equal(readSchemaReport(db).verdict, 'unversioned');

    const result = migrateDatabase(db);
    if (result.outcome !== 'migrated') assert.fail(`expected migrated, got ${result.outcome}`);
    assert.equal(result.from, 0);
    assert.equal(result.to, SCHEMA_VERSION);
    assert.equal(result.rebuiltTemperatures, true);
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);

    assert.deepEqual(
      db.prepare('SELECT location, value, reading_index FROM report_temperatures WHERE report_id = ?').all(reportId),
      [{ location: 'Câmara Principal', value: -18, reading_index: 1 }],
    );
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .all() as string[];
    assert.ok(tables.includes('auth_sessions'), 'a revision 0 migration must also reach revision 2');
    assert.ok(tables.includes('massa_launches'), 'a revision 0 migration must also reach revision 6');
    assert.ok(tables.includes('aero_movements'), 'a revision 0 migration must also reach revision 7');
    db.close();
  });

  it('creates massa_launches for a revision 5 database and reaches revision 6', () => {
    const path = join(fixtureRoot(), 'revision-five.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    build.exec('DROP TABLE massa_launches');
    build.pragma('user_version = 5');
    build.close();

    const db = new Database(path);
    assert.equal(readSchemaReport(db).version, 5);
    const result = migrateDatabase(db);
    assert.equal(result.outcome, 'migrated');
    assert.equal(result.from, 5);
    assert.equal(result.to, SCHEMA_VERSION);
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .all() as string[];
    assert.ok(tables.includes('massa_launches'), 'revision 6 must add massa_launches');
    db.close();
  });

  it('creates aero_movements for a revision 6 database and reaches the supported revision', () => {
    const path = join(fixtureRoot(), 'revision-six.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    build.exec('DROP TABLE aero_movements');
    build.pragma('user_version = 6');
    build.close();

    const db = new Database(path);
    assert.equal(readSchemaReport(db).version, 6);
    const result = migrateDatabase(db);
    assert.equal(result.outcome, 'migrated');
    assert.equal(result.from, 6);
    assert.equal(result.to, SCHEMA_VERSION);
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .all() as string[];
    assert.ok(tables.includes('aero_movements'), 'revision 7 must add aero_movements');

    // Creating a table rewrites nothing: the seats are the only new thing, and an empty table is
    // the correct starting point because the ERP is the authority for them.
    assert.deepEqual(db.prepare('SELECT COUNT(*) AS n FROM aero_movements').get(), { n: 0 });
    db.close();
  });

  it('rekeys aero_movements so one seat can carry several line items (revision 8)', () => {
    const path = join(fixtureRoot(), 'revision-seven.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    makeRevisionSevenShape(build);
    build
      .prepare(
        `INSERT INTO aero_movements
           (movement_date, ent_lan, product_code, product_desc, quantity, entry_date, operator_name, movement_type, synced_at)
         VALUES ('2026-10-29', 35911, '001774', 'CAIXA DE PAPELAO PEQUENA MISTA', 3606, '2026-10-29', 'VIVIANE', 'E', '2026-10-29T18:00:00.000Z')`,
      )
      .run();
    build.close();

    const db = new Database(path);
    assert.equal(readSchemaReport(db).version, 7);
    const result = migrateDatabase(db);
    assert.equal(result.outcome, 'migrated');
    assert.equal(result.from, 7);
    assert.equal(result.to, SCHEMA_VERSION);

    // The one seat the plant had already mirrored survives the rebuild untouched.
    assert.deepEqual(db.prepare('SELECT ent_lan, product_code, quantity FROM aero_movements').all(), [
      { ent_lan: 35911, product_code: '001774', quantity: 3606 },
    ]);

    // A document with two products now keeps both lines of the same seat instead of collapsing them.
    db.prepare(
      `INSERT INTO aero_movements
         (movement_date, ent_lan, product_code, product_desc, quantity, entry_date, operator_name, movement_type, synced_at)
       VALUES ('2026-10-29', 35911, '000084', 'MASSA PARA PASTEL DISCO 500G', 500, '2026-10-29', 'VIVIANE', 'E', '2026-10-29T18:00:00.000Z')`,
    ).run();
    assert.deepEqual(db.prepare('SELECT COUNT(*) AS n FROM aero_movements').get(), { n: 2 });

    // The key is the seat plus the product: the same line stored twice is still refused.
    assert.throws(() =>
      db
        .prepare(
          `INSERT INTO aero_movements
             (movement_date, ent_lan, product_code, product_desc, quantity, entry_date, operator_name, movement_type, synced_at)
           VALUES ('2026-10-29', 35911, '001774', 'CAIXA DE PAPELAO PEQUENA MISTA', 3606, '2026-10-29', 'VIVIANE', 'E', '2026-10-29T18:05:00.000Z')`,
        )
        .run(),
    );
    db.close();
  });

  it('gives an imported seat its own identity on the launch (revision 9)', () => {
    const path = join(fixtureRoot(), 'revision-eight.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    // The revision 8 shape has no seat column and no seat index, whatever the current baseline declares.
    // The index goes first: SQLite refuses to drop a column an index still names.
    build.exec('DROP INDEX IF EXISTS uq_massa_launches_ent_lan');
    dropColumnIfPresent(build, 'massa_launches', 'ent_lan');
    build.pragma('user_version = 8');
    const userId = insertUser(build, 'revision-eight');
    build
      .prepare(
        `INSERT INTO massa_launches (launch_date, product_code, boxes, user_id, created_at, updated_at)
         VALUES ('2026-10-30', '22', 2, ?, '2026-10-30T11:00:00.000Z', '2026-10-30T11:00:00.000Z')`,
      )
      .run(userId);
    build.close();

    const db = new Database(path);
    assert.equal(readSchemaReport(db).version, 8);
    const result = migrateDatabase(db);
    assert.equal(result.outcome, 'migrated');
    assert.equal(result.from, 8);
    assert.equal(result.to, SCHEMA_VERSION);
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);

    const columns = (db.prepare('PRAGMA table_info(massa_launches)').all() as { name: string }[]).map((c) => c.name);
    assert.ok(columns.includes('ent_lan'), 'revision 9 must add massa_launches.ent_lan');

    // Widening a table rewrites nothing: the launches typed before this build are still here, and the
    // column is empty for them because nobody knows which seat they came from.
    assert.deepEqual(db.prepare('SELECT product_code, boxes, ent_lan FROM massa_launches').all(), [
      { product_code: '22', boxes: 2, ent_lan: null },
    ]);
    db.close();
  });

  it('refuses a second launch for the same seat and allows many unseated ones (revision 9)', () => {
    const path = join(fixtureRoot(), 'revision-eight-seats.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    build.exec('DROP INDEX IF EXISTS uq_massa_launches_ent_lan');
    dropColumnIfPresent(build, 'massa_launches', 'ent_lan');
    build.pragma('user_version = 8');
    build.close();

    const db = new Database(path);
    migrateDatabase(db);
    const userId = insertUser(db, 'seats');
    const insert = db.prepare(
      `INSERT INTO massa_launches (launch_date, product_code, boxes, user_id, ent_lan, created_at, updated_at)
       VALUES ('2026-10-30', ?, 1, ?, ?, '2026-10-30T12:00:00.000Z', '2026-10-30T12:00:00.000Z')`,
    );

    // A launch typed by hand has no seat, and there can be as many of those as the day needs.
    insert.run('22', userId, null);
    insert.run('22', userId, null);
    insert.run('5000', userId, 35937);

    // The same seat twice is the duplicated import this revision exists to prevent.
    assert.throws(() => insert.run('5000', userId, 35937), /UNIQUE constraint failed/);
    assert.deepEqual(db.prepare('SELECT COUNT(*) AS n FROM massa_launches').get(), { n: 3 });
    db.close();
  });

  // Revision 12 widens one CHECK on an existing table, which SQLite cannot do in place: the table is rebuilt, every
  // row copied, and the copy counted before the original is dropped. The case is about the rows that survive it.
  it('widens report_photos.mime_type for HEIC and keeps every row (revision 12)', () => {
    const path = join(fixtureRoot(), 'revision-eleven-photos.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    makeRevisionElevenPhotosShape(build);
    const userId = insertUser(build, 'revision-twelve');
    const reportId = insertReport(build, userId);
    build
      .prepare(
        `INSERT INTO report_photos (id, report_id, file_path, file_size, mime_type, public_token, created_at)
         VALUES (9201, ?, 'kept.jpg', 4096, 'image/jpeg', 'kept-token', '2026-11-14 10:00:00')`,
      )
      .run(reportId);
    // The shape being replaced has to refuse the type, or the case would prove nothing about the rebuild.
    assert.throws(
      () =>
        build
          .prepare(`INSERT INTO report_photos (report_id, file_path, file_size, mime_type) VALUES (?, 'x.heic', 10, 'image/heic')`)
          .run(reportId),
      /CHECK/,
    );
    build.close();

    const db = new Database(path);
    assert.equal(readSchemaReport(db).version, 11);
    const result = migrateDatabase(db);
    assert.equal(result.outcome, 'migrated');
    assert.equal(result.from, 11);
    assert.equal(result.to, SCHEMA_VERSION);
    assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);

    // The row is the same row: same id, same mime, same size, same token, same timestamps. A rebuilt table that
    // renumbered it would break every link an operator already has.
    assert.deepEqual(
      db.prepare('SELECT id, report_id, file_path, file_size, mime_type, public_token, created_at FROM report_photos').all(),
      [
        {
          id: 9201,
          report_id: reportId,
          file_path: 'kept.jpg',
          file_size: 4096,
          mime_type: 'image/jpeg',
          public_token: 'kept-token',
          created_at: '2026-11-14 10:00:00',
        },
      ],
    );

    // Widened: the two types the iPhone writes are stored as themselves...
    db.prepare(`INSERT INTO report_photos (report_id, file_path, file_size, mime_type) VALUES (?, 'iphone.heic', 10, 'image/heic')`).run(reportId);
    db.prepare(`INSERT INTO report_photos (report_id, file_path, file_size, mime_type) VALUES (?, 'iphone.heif', 10, 'image/heif')`).run(reportId);
    // ...and the CHECK still refuses anything it does not name, which is the half a rebuild can silently lose.
    assert.throws(
      () =>
        db
          .prepare(`INSERT INTO report_photos (report_id, file_path, file_size, mime_type) VALUES (?, 'bogus.gif', 10, 'image/gif')`)
          .run(reportId),
      /CHECK/,
    );

    // The index the original carried comes back: dropping a table drops its indexes.
    const indexes = (db.prepare('PRAGMA index_list(report_photos)').all() as { name: string }[]).map((row) => row.name);
    assert.ok(indexes.includes('idx_report_photos_report_id'), `expected the report_id index, got ${indexes.join(', ')}`);

    // AUTOINCREMENT survives the rename: a new row takes an id above the highest one copied.
    const heicId = db.prepare("SELECT id FROM report_photos WHERE mime_type = 'image/heic'").pluck().get() as number;
    assert.ok(heicId > 9201, `a row written after the rebuild must take a fresh id, got ${heicId}`);

    // The unique token is still enforced, so a rebuild did not quietly drop a constraint.
    assert.throws(
      () =>
        db
          .prepare(`INSERT INTO report_photos (report_id, file_path, file_size, mime_type, public_token) VALUES (?, 'dup.jpg', 1, 'image/jpeg', 'kept-token')`)
          .run(reportId),
      /UNIQUE/,
    );

    assert.equal(readSchemaReport(db).verdict, 'current');
    db.close();
  });

  // A crash between the revision-12 stamp and the next step leaves a database stamped 11 whose table already admits
  // HEIC (`schema.sql` builds it that way). Rebuilding again would rewrite rows for nothing.
  it('leaves report_photos untouched when the stored CHECK already admits HEIC (revision 12)', () => {
    const db = new Database(':memory:');
    db.exec(schema);
    db.exec(seed);
    db.pragma('user_version = 11');
    const reportId = insertReport(db, insertUser(db, 'revision-twelve-reentry'));
    db.prepare(
      `INSERT INTO report_photos (id, report_id, file_path, file_size, mime_type, public_token, created_at)
       VALUES (9301, ?, 'only.png', 512, 'image/png', 'only-token', '2026-11-14 11:00:00')`,
    ).run(reportId);
    const ddlBefore = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'report_photos'").pluck().get();

    const result = migrateDatabase(db);

    assert.equal(result.outcome, 'migrated');
    assert.equal(result.from, 11);
    assert.equal(result.to, SCHEMA_VERSION);
    assert.equal(
      db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'report_photos'").pluck().get(),
      ddlBefore,
      'the step rebuilt a table that was already widened',
    );
    assert.deepEqual(db.prepare('SELECT id, mime_type, public_token FROM report_photos').all(), [
      { id: 9301, mime_type: 'image/png', public_token: 'only-token' },
    ]);

    // And the step is gone for good once stamped.
    assert.equal(migrateDatabase(db).outcome, 'already-current');
    db.close();
  });

  // A fresh installation must not need the rebuild: revision 11's shape plus the two new types, in schema.sql.
  it('creates report_photos from schema.sql already admitting HEIC, so a fresh install needs no rebuild', () => {
    const db = new Database(':memory:');
    db.exec(schema);
    db.exec(seed);
    const reportId = insertReport(db, insertUser(db, 'fresh-heic'));

    db.prepare(`INSERT INTO report_photos (report_id, file_path, file_size, mime_type) VALUES (?, 'a.heic', 1, 'image/heic')`).run(reportId);
    db.prepare(`INSERT INTO report_photos (report_id, file_path, file_size, mime_type) VALUES (?, 'a.heif', 1, 'image/heif')`).run(reportId);
    assert.throws(
      () => db.prepare(`INSERT INTO report_photos (report_id, file_path, file_size, mime_type) VALUES (?, 'a.bmp', 1, 'image/bmp')`).run(reportId),
      /CHECK/,
    );
    db.close();
  });

  // Guards the stepwise list against drifting from SCHEMA_VERSION: a build that supports
  // a revision its steps cannot reach would leave every migrated database stamped low.
  it('leaves every lower revision stamped at exactly the supported revision', () => {
    const cases: ReadonlyArray<{ from: number; prepare: (db: Database.Database) => void }> = [
      { from: 0, prepare: (db) => { db.exec('ALTER TABLE users DROP COLUMN security_version'); withoutDriverPhone(db); db.pragma('user_version = 0'); } },
      { from: 1, prepare: (db) => { makeRevisionOneShape(db); } },
    ];

    for (const testCase of cases) {
      const path = join(fixtureRoot(), `lower-revision-${testCase.from}.db`);
      const fresh = openDatabase(path);
      testCase.prepare(fresh);
      fresh.close();

      const db = new Database(path);
      const result = migrateDatabase(db);
      if (result.outcome !== 'migrated') {
        assert.fail(`from revision ${testCase.from}: expected migrated, got ${result.outcome}`);
      }
      assert.equal(
        db.pragma('user_version', { simple: true }),
        SCHEMA_VERSION,
        `from revision ${testCase.from} did not reach the supported revision`,
      );
      assert.equal(readSchemaReport(db).verdict, 'current', `from revision ${testCase.from} did not end current`);
      db.close();
    }
  });

  it('CLI: migrates a revision 1 database and exits zero', async () => {
    const path = join(fixtureRoot(), 'revision-one-cli.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    makeRevisionOneShape(build);
    build.close();

    const { code, output } = await runMigrate(path);
    assert.equal(code, 0, output);
    assert.match(output, /before  verdict: outdated/);
    assert.match(output, /migrate: legacy report_temperatures already current/);
    assert.match(output, new RegExp(`migrate: stamped user_version = ${SCHEMA_VERSION}`));
    assert.match(output, /after  verdict: current/);
  });

  it('CLI: migrates a legacy database and exits zero', async () => {
    const path = join(fixtureRoot(), 'legacy.db');
    const build = new Database(path);
    build.exec(schema);
    build.exec(seed);
    makeLegacyShape(build);
    build.exec('ALTER TABLE users DROP COLUMN security_version');
    withoutDriverPhone(build);
    build.close();

    const { code, output } = await runMigrate(path);
    assert.equal(code, 0, output);
    assert.match(output, /migrate: rebuilt legacy report_temperatures/);
    assert.match(output, new RegExp(`migrate: stamped user_version = ${SCHEMA_VERSION}`));
    assert.match(output, /after  verdict: current/);
  });

  it('CLI: refuses a newer database and exits non-zero', async () => {
    const path = join(fixtureRoot(), 'newer.db');
    const fresh = openDatabase(path);
    fresh.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
    fresh.close();

    const { code, output } = await runMigrate(path);
    assert.equal(code, 1, output);
    assert.match(output, new RegExp(`refused — revision ${SCHEMA_VERSION + 1} is newer`));
  });
});
