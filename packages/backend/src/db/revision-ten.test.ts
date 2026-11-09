import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrateDatabase } from './migrations.js';
import {
  REVISION_TEN_TABLES,
  SCHEMA_TABLES,
  SCHEMA_VERSION,
  classifySchema,
  observeSchema,
  readSchemaReport,
  requiredTablesFor,
} from './schema-version.js';

const schema = readFileSync(join(import.meta.dirname, 'schema.sql'), 'utf-8');

/** Revision 9 as production has it: everything the supported build creates, minus the revision-10 tables. */
function revisionNineShape(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS aero_bridge_tickets');
  db.exec('DROP TABLE IF EXISTS aero_integration_settings');
  db.pragma('user_version = 9');
}

function schemaTables(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .pluck()
      .all() as string[]
  );
}

describe('schema revision 10', () => {
  it('is the supported revision and declares the two tables it adds', () => {
    assert.equal(SCHEMA_VERSION, 10);
    assert.deepEqual([...REVISION_TEN_TABLES].sort(), ['aero_bridge_tickets', 'aero_integration_settings']);
    for (const table of REVISION_TEN_TABLES) assert.ok(SCHEMA_TABLES.includes(table));
  });

  it('creates exactly the inventory the report describes, counted from schema.sql', () => {
    const db = new Database(':memory:');
    db.exec(schema);

    const tables = schemaTables(db);
    assert.equal(tables.length, SCHEMA_TABLES.length, 'schema.sql and SCHEMA_TABLES disagree on the table count');
    assert.deepEqual(tables, [...SCHEMA_TABLES].sort());
    db.close();
  });

  it('does not require the revision-10 tables from a database stamped at revision 9', () => {
    const requiredAtNine = requiredTablesFor(9);

    for (const table of REVISION_TEN_TABLES) {
      assert.equal(requiredAtNine.includes(table), false, `revision 9 must not be asked for ${table}`);
    }
    for (const table of REVISION_TEN_TABLES) assert.ok(requiredTablesFor(10).includes(table));
    assert.deepEqual([...requiredTablesFor(10)].sort(), [...SCHEMA_TABLES].sort());
  });

  it('classifies a healthy revision-9 database as outdated, never incompatible', () => {
    const report = classifySchema({ version: 9, integrity: 'ok', tables: [...requiredTablesFor(9)] });

    assert.equal(report.verdict, 'outdated');
    assert.deepEqual(report.missingTables, []);
  });

  it('classifies a revision-10 database as newer for a build that supports only 9, so it refuses to touch it', () => {
    const report = classifySchema(
      { version: 10, integrity: 'ok', tables: [...SCHEMA_TABLES] },
      9,
    );

    assert.equal(report.verdict, 'newer');
  });

  it('migrates 9 to 10 additively and leaves the database current', () => {
    const db = new Database(':memory:');
    db.exec(schema);
    revisionNineShape(db);
    assert.equal(readSchemaReport(db).verdict, 'outdated');

    const result = migrateDatabase(db);

    assert.equal(result.outcome, 'migrated');
    assert.equal(result.report.version, 10);
    assert.equal(db.pragma('user_version', { simple: true }), 10);
    for (const table of REVISION_TEN_TABLES) {
      assert.ok(schemaTables(db).includes(table), `${table} was not created`);
    }
    assert.equal(readSchemaReport(db).verdict, 'current');
    db.close();
  });

  it('is idempotent: migrating twice reports already-current and writes nothing', () => {
    const db = new Database(':memory:');
    db.exec(schema);
    // The subject of the case is the 9 → 10 step. Building from `schema.sql` and leaving the stamp at 0 would replay
    // the whole chain against a database whose later columns already exist, which is a different fixture (and a
    // pre-existing limitation of steps 3 and 4, unrelated to revision 10).
    revisionNineShape(db);
    migrateDatabase(db);

    const before = observeSchema(db);
    const second = migrateDatabase(db);

    assert.equal(second.outcome, 'already-current');
    assert.deepEqual(observeSchema(db), before);
    db.close();
  });

  it('gives both new tables the columns the vault and the ticket need', () => {
    const db = new Database(':memory:');
    db.exec(schema);

    const columnsOf = (table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name);

    assert.deepEqual(columnsOf('aero_integration_settings'), [
      'id',
      'user_id',
      'ws_url',
      'erp_username',
      'password_ciphertext',
      'password_iv',
      'password_tag',
      'key_version',
      'created_at',
      'updated_at',
    ]);
    assert.deepEqual(columnsOf('aero_bridge_tickets'), [
      'id',
      'token_hash',
      'user_id',
      'action',
      'endpoint',
      'body',
      'bodies',
      'callback_url',
      'expires_at',
      'used_at',
      'created_at',
    ]);

    // One vault row per owner, one ticket per token hash: both are enforced by the database, not by the service.
    const settingsIndexes = db.prepare('PRAGMA index_list(aero_integration_settings)').all() as { unique: number; name: string }[];
    const uniqueUser = settingsIndexes.some((index) => {
      const columns = (db.prepare(`PRAGMA index_info(${index.name})`).all() as { name: string }[]).map((row) => row.name);
      return index.unique === 1 && columns.join(',') === 'user_id';
    });
    assert.equal(uniqueUser, true, 'aero_integration_settings.user_id must be unique');

    const ticketIndexes = db.prepare('PRAGMA index_list(aero_bridge_tickets)').all() as { unique: number; name: string }[];
    const uniqueToken = ticketIndexes.some((index) => {
      const columns = (db.prepare(`PRAGMA index_info(${index.name})`).all() as { name: string }[]).map((row) => row.name);
      return index.unique === 1 && columns.join(',') === 'token_hash';
    });
    assert.equal(uniqueToken, true, 'aero_bridge_tickets.token_hash must be unique');
    db.close();
  });
});
