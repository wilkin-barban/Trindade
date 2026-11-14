import type Database from 'better-sqlite3';
import { stampSchemaVersion } from './schema-version.js';

/**
 * Revision 10 → 11 cutover: the salida (baixa) module and its bridge action.
 *
 * Three additive tables hold what the operator loads: one movement per launch, its items in the order they were
 * typed, and up to three optional photos. Creating them rewrites nothing, so the step is safe against the live
 * database.
 *
 * `aero_bridge_tickets` is the only table this revision touches, and only to widen its `action` CHECK so the
 * shortcut can be armed for `saida`. SQLite cannot alter a CHECK in place, so the table is rebuilt exactly as
 * revision 8 rebuilt the ERP mirror: copy every row, count the copy, and only then drop the original. The count is
 * compared before the drop, inside the same immediate transaction, so an interrupted migration leaves the old
 * table untouched instead of losing a redeemable ticket. The two indexes the original carried are recreated
 * because dropping a table drops its indexes.
 *
 * Re-entering the step is a no-op: the tables are created with `IF NOT EXISTS` and the rebuild is skipped when the
 * stored DDL already admits `saida`.
 */
export function migrateSalida(db: Database.Database): void {
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS salida_movements (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        movement_date TEXT    NOT NULL,
        user_id       INTEGER NOT NULL REFERENCES users(id),
        created_at    TEXT    NOT NULL
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_salida_movements_date ON salida_movements(movement_date)`);

      db.exec(`CREATE TABLE IF NOT EXISTS salida_movement_items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        movement_id  INTEGER NOT NULL REFERENCES salida_movements(id) ON DELETE CASCADE,
        product_code TEXT    NOT NULL,
        product_name TEXT    NOT NULL,
        block        TEXT    NOT NULL CHECK (block IN ('embalagens', 'bobinas', 'materia-prima')),
        quantity     INTEGER NOT NULL CHECK (quantity > 0),
        position     INTEGER NOT NULL
      )`);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_salida_movement_items_movement ON salida_movement_items(movement_id)`,
      );

      db.exec(`CREATE TABLE IF NOT EXISTS salida_photos (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        movement_id  INTEGER NOT NULL REFERENCES salida_movements(id) ON DELETE CASCADE,
        file_path    TEXT    NOT NULL,
        file_size    INTEGER NOT NULL,
        mime_type    TEXT    NOT NULL,
        public_token TEXT,
        created_at   TEXT    NOT NULL
      )`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_salida_photos_movement ON salida_photos(movement_id)`);

      widenTicketActionCheck(db);

      stampSchemaVersion(db, 11);
    }).immediate();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Rebuild `aero_bridge_tickets` with `saida` in its CHECK, preserving every row.
 *
 * The stored DDL is the flag: a database that already admits the action needs nothing, which is what makes the
 * step safe to re-enter after a crash between the stamp and the next step.
 */
function widenTicketActionCheck(db: Database.Database): void {
  const stored = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'aero_bridge_tickets'")
    .get() as { sql: string } | undefined;
  if (!stored || stored.sql.includes("'saida'")) return;

  const before = (db.prepare('SELECT COUNT(*) AS n FROM aero_bridge_tickets').get() as { n: number }).n;

  db.exec(`CREATE TABLE aero_bridge_tickets_revision11 (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash   TEXT    NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action       TEXT    NOT NULL CHECK (action IN ('entrada','entrada_lote','saida','movimentos','test')),
    endpoint     TEXT    NOT NULL,
    body         TEXT    NOT NULL,
    bodies       TEXT,
    callback_url TEXT    NOT NULL,
    expires_at   TEXT    NOT NULL,
    used_at      TEXT,
    created_at   TEXT    NOT NULL
  )`);

  db.exec(`INSERT INTO aero_bridge_tickets_revision11
    (id, token_hash, user_id, action, endpoint, body, bodies, callback_url, expires_at, used_at, created_at)
    SELECT id, token_hash, user_id, action, endpoint, body, bodies, callback_url, expires_at, used_at, created_at
    FROM aero_bridge_tickets`);

  const after = (db.prepare('SELECT COUNT(*) AS n FROM aero_bridge_tickets_revision11').get() as { n: number }).n;
  if (after !== before) {
    throw new Error(`aero_bridge_tickets rebuild copied ${after} of ${before} rows; refusing to drop the original`);
  }

  db.exec('DROP TABLE aero_bridge_tickets');
  db.exec('ALTER TABLE aero_bridge_tickets_revision11 RENAME TO aero_bridge_tickets');
  db.exec('CREATE INDEX IF NOT EXISTS idx_aero_bridge_tickets_user ON aero_bridge_tickets(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_aero_bridge_tickets_expires ON aero_bridge_tickets(expires_at)');
}
