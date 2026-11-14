import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { aeroMovementsTableExists, listAeroMovements } from '../integration/aero.movements.service.js';
import { getSaoPauloDateString } from '../../utils/date.js';
import { findSalidaProduct } from './salida.catalog.js';
import { reconcileSalidaMovement } from './salida-reconcile.js';
import type {
  SalidaHistoryDay,
  SalidaItem,
  SalidaItemInput,
  SalidaMovement,
  SalidaPhoto,
} from './salida.schema.js';

/**
 * The salida (baixa) rules: what a movement is, how it is read back, and how its photos are kept.
 *
 * Every read here is read-only by construction -- there is no update and no delete of a movement, in this
 * module or anywhere else, because a baixa that already left the plant is a record of what happened and not
 * a draft. The only writes are the launch and the optional photos that belong to it.
 */

/** A movement carries at most three photos. Without photos it is still a valid movement. */
export const MAX_SALIDA_PHOTOS = 3;

/** How long a photo's public token is. Long enough that guessing it is not a way to read the plant's photos. */
const PUBLIC_TOKEN_BYTES = 16;

interface MovementRow {
  id: number;
  movement_date: string;
  user_id: number;
  created_at: string;
  username: string;
  display_name: string;
}

interface ItemRow {
  id: number;
  movement_id: number;
  product_code: string;
  product_name: string;
  block: SalidaItem['block'];
  quantity: number;
  position: number;
}

/** A stored photo as the table keeps it, which is what serving its bytes needs. */
export interface SalidaPhotoRow {
  id: number;
  movement_id: number;
  file_path: string;
  file_size: number;
  mime_type: string;
  public_token: string | null;
  created_at: string;
}

const PHOTO_COLUMNS = 'id, movement_id, file_path, file_size, mime_type, public_token, created_at';

/** The authenticated route of one photo, which is what the movement card draws from. */
function photoUrl(photoId: number): string {
  return `/api/salida/photos/${photoId}`;
}

/**
 * The tokenised route of one photo.
 *
 * It is built from the deployment's public origin because the link is meant to be handed to somebody without
 * a session -- that is the whole point of the token -- and a relative path is useless in a share sheet.
 */
function photoPublicUrl(token: string, publicBaseUrl?: string): string {
  const path = `/api/salida/photos/public/${token}`;
  return publicBaseUrl ? `${publicBaseUrl.replace(/\/+$/, '')}${path}` : path;
}

function toSalidaPhoto(row: SalidaPhotoRow, publicBaseUrl?: string): SalidaPhoto {
  return {
    id: row.id,
    file_path: row.file_path,
    file_size: row.file_size,
    mime_type: row.mime_type,
    url: photoUrl(row.id),
    publicUrl: photoPublicUrl(row.public_token ?? '', publicBaseUrl),
    created_at: row.created_at,
  };
}

function readPhotoRow(db: Database.Database, where: string, value: string | number): SalidaPhotoRow | null {
  const row = db.prepare(`SELECT ${PHOTO_COLUMNS} FROM salida_photos WHERE ${where} = ?`).get(value) as
    | SalidaPhotoRow
    | undefined;
  return row ?? null;
}

/** Whether the movement exists, which the photo routes ask before answering 404 or a count. */
export function salidaMovementExists(db: Database.Database, movementId: number): boolean {
  const row = db.prepare('SELECT 1 AS present FROM salida_movements WHERE id = ?').get(movementId);
  return row !== undefined;
}

function seatsForDate(db: Database.Database, date: string) {
  // The mirror is created by `db:migrate`, never at startup, so a deployment can be serving before an
  // operator migrates. Asking first turns that into "nothing reconciled yet" instead of a SQL error on a
  // screen that is only trying to draw a card.
  if (!aeroMovementsTableExists(db)) return [];
  return listAeroMovements(db, date);
}

/**
 * One day of movements, projected whole: the header, its ordered items, its photos and the reconciliation
 * against the ERP's own seats of that day.
 *
 * The reconciliation is computed on every read and never stored, for the same reason Masas does it that way:
 * the seats belong to the company and can arrive hours after the baixa, so a stored verdict would tell the
 * operator "Pendente" forever on a movement the plant already recorded.
 */
function readMovementsOfDate(db: Database.Database, date: string, publicBaseUrl?: string): SalidaMovement[] {
  const movements = db
    .prepare(
      `SELECT m.id, m.movement_date, m.user_id, m.created_at, u.username, u.display_name
         FROM salida_movements m
         JOIN users u ON u.id = m.user_id
        WHERE m.movement_date = ?
        ORDER BY m.id ASC`,
    )
    .all(date) as MovementRow[];
  if (movements.length === 0) return [];

  const ids = movements.map((movement) => movement.id);
  const placeholders = ids.map(() => '?').join(', ');
  const itemRows = db
    .prepare(
      `SELECT id, movement_id, product_code, product_name, block, quantity, position
         FROM salida_movement_items
        WHERE movement_id IN (${placeholders})
        ORDER BY movement_id ASC, position ASC`,
    )
    .all(...ids) as ItemRow[];
  const photoRows = db
    .prepare(
      `SELECT ${PHOTO_COLUMNS}
         FROM salida_photos
        WHERE movement_id IN (${placeholders})
        ORDER BY movement_id ASC, id ASC`,
    )
    .all(...ids) as SalidaPhotoRow[];

  const itemsByMovement = new Map<number, SalidaItem[]>();
  for (const { movement_id: movementId, ...item } of itemRows) {
    const list = itemsByMovement.get(movementId);
    if (list) list.push(item);
    else itemsByMovement.set(movementId, [item]);
  }

  const photosByMovement = new Map<number, SalidaPhoto[]>();
  for (const row of photoRows) {
    const photo = toSalidaPhoto(row, publicBaseUrl);
    const list = photosByMovement.get(row.movement_id);
    if (list) list.push(photo);
    else photosByMovement.set(row.movement_id, [photo]);
  }

  const seats = seatsForDate(db, date);

  return movements.map((movement) => {
    const items = itemsByMovement.get(movement.id) ?? [];
    // The reconciliation's own vocabulary is the rule's (`entLans`, `matchedItemIds`); the wire keeps the
    // Spanish snake_case the rest of this module answers with, so the projection is explicit.
    const reconciliation = reconcileSalidaMovement({
      date: movement.movement_date,
      // A baixa answers to both names the account has, because the seat carries the name the operator
      // typed on the tablet and not necessarily the login they use here.
      operatorNames: [movement.username, movement.display_name],
      items: items.map((item) => ({
        id: item.id,
        product_code: item.product_code,
        quantity: item.quantity,
      })),
      seats,
    });

    return {
      id: movement.id,
      movement_date: movement.movement_date,
      user_id: movement.user_id,
      username: movement.username,
      display_name: movement.display_name,
      created_at: movement.created_at,
      items,
      photos: photosByMovement.get(movement.id) ?? [],
      total_units: items.reduce((sum, item) => sum + item.quantity, 0),
      reconciliation: {
        status: reconciliation.status,
        ent_lans: reconciliation.entLans,
        matched_item_ids: reconciliation.matchedItemIds,
      },
    };
  });
}

/** The movements of one plant day, oldest launch first. */
export function listSalidaMovements(
  db: Database.Database,
  input: { date: string; publicBaseUrl?: string },
): SalidaMovement[] {
  return readMovementsOfDate(db, input.date, input.publicBaseUrl);
}

/** One movement by id, or `null` when it does not exist. */
export function readSalidaMovement(
  db: Database.Database,
  movementId: number,
  publicBaseUrl?: string,
): SalidaMovement | null {
  const row = db.prepare('SELECT movement_date FROM salida_movements WHERE id = ?').get(movementId) as
    | { movement_date: string }
    | undefined;
  if (!row) return null;
  return readMovementsOfDate(db, row.movement_date, publicBaseUrl).find(({ id }) => id === movementId) ?? null;
}

/**
 * Persist one launch: the header, then every item with the position the operator typed it in.
 *
 * Both writes are one immediate transaction, so a failure half way leaves no header pointing at nothing and
 * no items belonging to no movement. The date is the plant's today and the operator is the session; neither
 * is a field of the request, which is what keeps a client from backdating a baixa. The product's name and
 * block are copied into the item, so renaming the catalogue tomorrow cannot rewrite what was launched today.
 */
export function createSalidaMovement(
  db: Database.Database,
  input: { items: readonly SalidaItemInput[]; userId: number; date?: string; publicBaseUrl?: string },
): SalidaMovement {
  const movementDate = input.date ?? getSaoPauloDateString();
  const createdAt = new Date().toISOString();

  const movementId = db.transaction(() => {
    const inserted = db
      .prepare('INSERT INTO salida_movements (movement_date, user_id, created_at) VALUES (?, ?, ?)')
      .run(movementDate, input.userId, createdAt);
    const id = Number(inserted.lastInsertRowid);

    const insertItem = db.prepare(
      `INSERT INTO salida_movement_items (movement_id, product_code, product_name, block, quantity, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    input.items.forEach((item, position) => {
      const product = findSalidaProduct(item.code);
      if (!product) throw new Error(`unknown product: ${item.code}`);
      insertItem.run(id, product.code, product.name, product.block, item.quantity, position);
    });

    return id;
  }).immediate();

  const movement = readSalidaMovement(db, movementId, input.publicBaseUrl);
  if (!movement) throw new Error(`the movement ${movementId} vanished while it was being written`);
  return movement;
}

/**
 * The days that carry movements, newest first, each with its total and the movements themselves.
 *
 * A day is a day of launches, not a calendar day: only dates with something in them answer, which is what the
 * history chips need in order to offer "hoy / ayer / 7 días" without inventing an empty row per day.
 */
export function salidaHistory(db: Database.Database, input: { publicBaseUrl?: string } = {}): SalidaHistoryDay[] {
  const days = db
    .prepare('SELECT DISTINCT movement_date AS date FROM salida_movements ORDER BY movement_date DESC')
    .all() as { date: string }[];

  return days.map(({ date }) => {
    const movements = readMovementsOfDate(db, date, input.publicBaseUrl);
    return {
      date,
      total_units: movements.reduce((sum, movement) => sum + movement.total_units, 0),
      movements,
    };
  });
}

// --------------- Photos ---------------

export function countSalidaPhotos(db: Database.Database, movementId: number): number {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM salida_photos WHERE movement_id = ?').get(movementId) as {
      count: number;
    }
  ).count;
}

export function listSalidaPhotos(
  db: Database.Database,
  movementId: number,
  publicBaseUrl?: string,
): SalidaPhoto[] {
  const rows = db
    .prepare(`SELECT ${PHOTO_COLUMNS} FROM salida_photos WHERE movement_id = ? ORDER BY id ASC`)
    .all(movementId) as SalidaPhotoRow[];
  return rows.map((row) => toSalidaPhoto(row, publicBaseUrl));
}

/**
 * Store one already-written photo's metadata.
 *
 * The token is minted here and never handed to the caller as a credential: it is only ever a path, and the
 * bytes are answered to whoever holds it. That is the same trade the reports module makes, and it is why the
 * path cannot be guessed from the movement.
 */
export function saveSalidaPhoto(
  db: Database.Database,
  input: { movementId: number; filePath: string; fileSize: number; mimeType: string; publicBaseUrl?: string },
): SalidaPhoto {
  const token = randomBytes(PUBLIC_TOKEN_BYTES).toString('hex');
  const inserted = db
    .prepare(
      `INSERT INTO salida_photos (movement_id, file_path, file_size, mime_type, public_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.movementId, input.filePath, input.fileSize, input.mimeType, token, new Date().toISOString());

  const row = readPhotoRow(db, 'id', Number(inserted.lastInsertRowid));
  if (!row) throw new Error('the photo vanished while it was being written');
  return toSalidaPhoto(row, input.publicBaseUrl);
}

/** The stored photo by id, with the columns serving its bytes needs. */
export function getSalidaPhotoById(db: Database.Database, photoId: number): SalidaPhotoRow | null {
  return readPhotoRow(db, 'id', photoId);
}

/** The stored photo behind a public token, which is the credential of the unauthenticated route. */
export function getSalidaPhotoByPublicToken(db: Database.Database, token: string): SalidaPhotoRow | null {
  return readPhotoRow(db, 'public_token', token);
}

/** Remove the row and answer what it described, so the caller can delete the file as best it can. */
export function deleteSalidaPhoto(db: Database.Database, photoId: number): SalidaPhotoRow | null {
  const row = readPhotoRow(db, 'id', photoId);
  if (!row) return null;
  db.prepare('DELETE FROM salida_photos WHERE id = ?').run(photoId);
  return row;
}
