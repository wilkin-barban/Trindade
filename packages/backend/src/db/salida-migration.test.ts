import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrateDatabase } from './migrations.js';
import {
  REVISION_ELEVEN_TABLES,
  SCHEMA_TABLES,
  SCHEMA_VERSION,
  classifySchema,
  readSchemaReport,
  requiredTablesFor,
} from './schema-version.js';

const schema = readFileSync(join(import.meta.dirname, 'schema.sql'), 'utf-8');

/**
 * A schema-only database with one operator. `buildTestApp` seeds its own users, but a migration case needs the
 * database a migration actually meets: the schema plus the rows that reference it, no application fixtures.
 */
function freshDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.exec(schema);
  db.exec(`INSERT INTO roles (name) VALUES ('Administrador')`);
  db.exec(`INSERT INTO users (username, password_hash, display_name, role_id) VALUES ('wilkin', 'x', 'Wilkin', 1)`);
  return db;
}

function schemaTables(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .pluck()
      .all() as string[]
  );
}

/**
 * Revision 10 as production has it: the schema before the salida module, including the ticket table whose
 * `CHECK` still refuses the new action. Rebuilding it here is the point of the fixture — a migration that only
 * added tables would never prove the `CHECK` was widened.
 */
function revisionTenShape(db: Database.Database): void {
  for (const table of REVISION_ELEVEN_TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
  db.exec(`
    DROP INDEX IF EXISTS idx_aero_bridge_tickets_user;
    DROP INDEX IF EXISTS idx_aero_bridge_tickets_expires;
    ALTER TABLE aero_bridge_tickets RENAME TO aero_bridge_tickets_revision10;
    CREATE TABLE aero_bridge_tickets (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash   TEXT    NOT NULL UNIQUE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action       TEXT    NOT NULL CHECK (action IN ('entrada','entrada_lote','movimentos','test')),
      endpoint     TEXT    NOT NULL,
      body         TEXT    NOT NULL,
      bodies       TEXT,
      callback_url TEXT    NOT NULL,
      expires_at   TEXT    NOT NULL,
      used_at      TEXT,
      created_at   TEXT    NOT NULL
    );
    CREATE INDEX idx_aero_bridge_tickets_user ON aero_bridge_tickets(user_id);
    CREATE INDEX idx_aero_bridge_tickets_expires ON aero_bridge_tickets(expires_at);
  `);
  db.pragma('user_version = 10');
}

function insertTicket(db: Database.Database, tokenHash: string, action: string): void {
  db.prepare(
    `INSERT INTO aero_bridge_tickets
       (token_hash, user_id, action, endpoint, body, bodies, callback_url, expires_at, used_at, created_at)
     VALUES (?, (SELECT id FROM users ORDER BY id LIMIT 1), ?, 'entradasitem', '{}', NULL,
             'https://example.test/massas-launch', '2030-01-01T00:00:00.000Z', NULL, '2026-11-13T10:00:00.000Z')`,
  ).run(tokenHash, action);
}

describe('schema revision 11', () => {
  it('is the supported revision and declares the three salida tables', () => {
    assert.equal(SCHEMA_VERSION, 11);
    assert.deepEqual([...REVISION_ELEVEN_TABLES].sort(), [
      'salida_movement_items',
      'salida_movements',
      'salida_photos',
    ]);
    for (const table of REVISION_ELEVEN_TABLES) assert.ok(SCHEMA_TABLES.includes(table));
  });

  it('creates the salida tables from schema.sql and accepts the new bridge action there', () => {
    const db = freshDatabase();

    assert.deepEqual(schemaTables(db), [...SCHEMA_TABLES].sort());
    insertTicket(db, 'fresh-ticket', 'saida');
    assert.throws(() => insertTicket(db, 'fresh-bogus', 'desconocida'), /CHECK/);
    db.close();
  });

  it('does not require the revision-11 tables from a database stamped at revision 10', () => {
    const requiredAtTen = requiredTablesFor(10);
    for (const table of REVISION_ELEVEN_TABLES) {
      assert.equal(requiredAtTen.includes(table), false, `revision 10 must not be asked for ${table}`);
    }
    for (const table of REVISION_ELEVEN_TABLES) assert.ok(requiredTablesFor(11).includes(table));
    assert.deepEqual([...requiredTablesFor(11)].sort(), [...SCHEMA_TABLES].sort());
  });

  it('classifies a healthy revision-10 database as outdated, never incompatible', () => {
    const report = classifySchema({ version: 10, integrity: 'ok', tables: [...requiredTablesFor(10)] });

    assert.equal(report.verdict, 'outdated');
    assert.deepEqual(report.missingTables, []);
  });

  it('migrates 10 to 11, creates the tables and keeps every pending ticket row', () => {
    const db = freshDatabase();
    revisionTenShape(db);
    insertTicket(db, 'legacy-entrada', 'entrada');
    insertTicket(db, 'legacy-lote', 'entrada_lote');

    assert.equal(readSchemaReport(db).verdict, 'outdated');

    const result = migrateDatabase(db);

    assert.equal(result.outcome, 'migrated');
    assert.equal(result.report.version, 11);
    for (const table of REVISION_ELEVEN_TABLES) assert.ok(schemaTables(db).includes(table));

    const preserved = db
      .prepare('SELECT token_hash, action FROM aero_bridge_tickets ORDER BY token_hash')
      .all() as { token_hash: string; action: string }[];
    assert.deepEqual(preserved, [
      { token_hash: 'legacy-entrada', action: 'entrada' },
      { token_hash: 'legacy-lote', action: 'entrada_lote' },
    ]);

    // The widened CHECK is the other half of the step: a migrated database accepts the new action and still
    // refuses anything the enum does not name.
    insertTicket(db, 'new-saida', 'saida');
    assert.throws(() => insertTicket(db, 'new-bogus', 'desconocida'), /CHECK/);

    // The rebuilt table must come back with its own indexes, or every redemption loses its lookup.
    const indexes = (db.prepare('PRAGMA index_list(aero_bridge_tickets)').all() as { name: string }[]).map(
      (row) => row.name,
    );
    assert.ok(indexes.includes('idx_aero_bridge_tickets_user'));
    assert.ok(indexes.includes('idx_aero_bridge_tickets_expires'));
    assert.equal(readSchemaReport(db).verdict, 'current');
    db.close();
  });

  it('is a no-op the second time and preserves the salida rows it already wrote', () => {
    const db = freshDatabase();
    revisionTenShape(db);
    migrateDatabase(db);

    db.prepare(
      `INSERT INTO salida_movements (movement_date, user_id, created_at)
       VALUES ('2026-11-13', (SELECT id FROM users ORDER BY id LIMIT 1), '2026-11-13T10:00:00.000Z')`,
    ).run();

    const second = migrateDatabase(db);

    assert.equal(second.outcome, 'already-current');
    const count = db.prepare('SELECT COUNT(*) AS n FROM salida_movements').pluck().get();
    assert.equal(count, 1);
    db.close();
  });

  it('enforces the item shape the operator screen relies on', () => {
    const db = freshDatabase();

    const userId = (db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').pluck().get() as number);
    const movementId = Number(
      db
        .prepare(`INSERT INTO salida_movements (movement_date, user_id, created_at) VALUES ('2026-11-13', ?, 'now')`)
        .run(userId).lastInsertRowid,
    );

    const insertItem = db.prepare(
      `INSERT INTO salida_movement_items (movement_id, product_code, product_name, block, quantity, position)
       VALUES (?, '1474', 'EMBALAG. NHOQUE 1kg', ?, ?, 1)`,
    );

    insertItem.run(movementId, 'embalagens', 3);
    assert.throws(() => insertItem.run(movementId, 'embalagens', 0), /CHECK/);
    assert.throws(() => insertItem.run(movementId, 'inventado', 1), /CHECK/);
    db.close();
  });
});
