import type Database from 'better-sqlite3';
import { stampSchemaVersion } from './schema-version.js';

/**
 * Revision 9 → 10 cutover: the encrypted ERP vault and the one-use bridge tickets.
 *
 * Both tables are additive: creating them rewrites nothing, so the step is safe against the live
 * database. `aero_integration_settings` keeps the erp password encrypted — ciphertext, iv and tag
 * here, the key in the environment — one row per owner so any tab or device of the same owner reads
 * the same secret. `aero_bridge_tickets` keeps only the sha256 of a ticket, so reading the table does
 * not let anyone redeem one. The tables are created and the revision stamped inside one immediate
 * transaction, and every statement is `IF NOT EXISTS`, so re-entering the step after a crash between
 * steps is a no-op rather than an error.
 */
export function migrateAeroVault(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS aero_integration_settings (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id             INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      ws_url              TEXT    NOT NULL,
      erp_username        TEXT    NOT NULL,
      password_ciphertext TEXT    NOT NULL,
      password_iv         TEXT    NOT NULL,
      password_tag        TEXT    NOT NULL,
      key_version         INTEGER NOT NULL DEFAULT 1,
      created_at          TEXT    NOT NULL,
      updated_at          TEXT    NOT NULL
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS aero_bridge_tickets (
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
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_aero_bridge_tickets_user ON aero_bridge_tickets(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_aero_bridge_tickets_expires ON aero_bridge_tickets(expires_at)`);
    stampSchemaVersion(db, 10);
  }).immediate();
}
