import type Database from 'better-sqlite3';
import type {
  CreateScheduleBody,
  CreateDriverBody,
  UpdateScheduleBody,
  ScheduleRow,
  DriverRow,
  Vehicle,
  HistoryQuery,
  LoadingBatchHistoryItem,
} from './loading.schema.js';
import { projectHistoryPermissions, type HistoryActor } from '../history-permissions.js';
import { getSaoPauloDateString } from '../../utils/date.js';

// ---- Schedule CRUD ----

/**
 * A write the calendar refuses.
 *
 * The `code` is the part the clients branch on: the message is Portuguese prose that the web and the
 * Android app already translate, and matching on prose is what made a renamed string a silent
 * behaviour change in three clients at once. `LOADING_HISTORY_FROZEN` is the loading counterpart of
 * the massas `MASSAS_HISTORY_FROZEN`, so a client needs one rule for every closed day.
 */
export interface LoadingRefusal {
  error: string;
  status: number;
  /** Stable, translatable-free name of the refusal. Absent only where a code is not yet defined. */
  code?: string;
}

/**
 * Refuses any write dated before the operators' today, in São Paulo.
 *
 * The day is closed when the clock passes midnight there, not when a row is one hour old: the plant
 * closes a batch by deactivating it, and rewriting yesterday's production after the fact is the thing
 * the audit trail exists to prevent. Deactivation and reactivation stay allowed -- they are the
 * lifecycle the history exposes -- but creation, editing, moving into the past and physical deletion
 * do not. A future day is still a draft, so only `date < today` is refused.
 */
function closedDayRefusal(date: string): LoadingRefusal | null {
  if (date >= getSaoPauloDateString()) return null;
  return { error: 'HISTORY_FROZEN', status: 409, code: 'LOADING_HISTORY_FROZEN' };
}

export function listByDate(
  db: Database.Database,
  date: string,
  actor?: HistoryActor,
  options: { includeInactive?: boolean } = {}
): ScheduleRow[] {
  // Opt-in, so the operational grid keeps its contract: an inactive row that reappears there reads as
  // an assignment that still stands. Only the history asks for the day as it was.
  const activeClause = options.includeInactive ? '' : ' AND ls.is_active = 1';
  const rows = db
    .prepare(
      `SELECT ls.id, ls.schedule_date, ls.time_slot, ls.driver_type,
              ls.driver_id, d.name AS driver_name, d.license_plate,
              ls.vehicle_id, v.description AS vehicle_description,
              v.license_plate AS vehicle_plate, ls.user_id, ls.created_at, ls.updated_at, ls.is_active, u.display_name AS creator_name
       FROM loading_schedules ls
       LEFT JOIN drivers d ON ls.driver_id = d.id
       LEFT JOIN vehicles v ON ls.vehicle_id = v.id
       LEFT JOIN users u ON ls.user_id = u.id
       WHERE ls.schedule_date = ?${activeClause}
       ORDER BY ls.time_slot ASC, ls.driver_type, ls.id`
    )
    .all(date) as (ScheduleRow & { creator_name?: string | null; is_active?: number })[];
  return rows.map((row) => projectScheduleRow(row, actor));
}

/**
 * One date, plus whether the day still has an active batch.
 *
 * The flag is what lets a client tell "this day has no schedules yet" from "this day was deactivated":
 * both used to arrive as an empty list, and the history could not offer to reopen the second one.
 */
export function readDay(
  db: Database.Database,
  date: string,
  actor?: HistoryActor,
  options: { includeInactive?: boolean } = {}
): { schedules: ScheduleRow[]; dayActive: boolean } {
  const schedules = listByDate(db, date, actor, options);
  const active = db
    .prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ? AND is_active = 1')
    .get(date) as { count: number };
  return { schedules, dayActive: active.count > 0 };
}

export function create(
  db: Database.Database,
  data: CreateScheduleBody,
  actor: HistoryActor
): ScheduleRow | LoadingRefusal {
  const closed = closedDayRefusal(data.schedule_date);
  if (closed) return closed;

  const tx = db.transaction(() => {
    // A day kept only as history cannot receive a new draft: reopening it is an explicit act, and the
    // old answer was the duplicate message, which pointed the operator at the wrong problem.
    const totalCount = db
      .prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ?')
      .get(data.schedule_date) as { count: number };

    const activeCount = db
      .prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ? AND is_active = 1')
      .get(data.schedule_date) as { count: number };

    if (totalCount.count > 0 && activeCount.count === 0) {
      throw Object.assign(
        new Error('This loading day was deactivated. Reopen the batch before adding entries.'),
        { status: 409, code: 'LOADING_BATCH_DEACTIVATED' }
      );
    }

    // Validate driver is active
    if (data.driver_id === undefined || data.driver_id === null) {
      throw Object.assign(new Error('Motorista é obrigatório.'), { status: 400 });
    }
    const driver = db
      .prepare('SELECT is_active, driver_type FROM drivers WHERE id = ?')
      .get(data.driver_id) as { is_active: number; driver_type: 'casa' | 'fletero' } | undefined;
    if (!driver || driver.is_active !== 1) {
      throw Object.assign(
        new Error('Motorista inativo ou não encontrado.'),
        { status: 400 }
      );
    }

    const resolvedDriverType = driver.driver_type;

    // Validate vehicle constraints based on driver_type
    if (resolvedDriverType === 'casa') {
      if (data.vehicle_id === undefined || data.vehicle_id === null) {
        throw Object.assign(
          new Error('Veículo é obrigatório para motorista da casa.'),
          { status: 400 }
        );
      }
    } else {
      // fletero
      if (data.vehicle_id !== undefined && data.vehicle_id !== null) {
        throw Object.assign(
          new Error('Motorista terceirizado não deve possuir veículo próprio.'),
          { status: 400 }
        );
      }
    }

    // Validate vehicle is active if provided
    if (data.vehicle_id !== undefined && data.vehicle_id !== null) {
      const activeVehicle = db
        .prepare('SELECT is_active FROM vehicles WHERE id = ?')
        .get(data.vehicle_id) as { is_active: number } | undefined;
      if (!activeVehicle || activeVehicle.is_active !== 1) {
        throw Object.assign(
          new Error('Veículo inativo ou não encontrado.'),
          { status: 400 }
        );
      }
    }

    // Duplicate prevention: same driver in the same active batch date
    if (data.driver_id) {
      const duplicate = db
        .prepare(
          `SELECT id FROM loading_schedules
           WHERE schedule_date = ? AND driver_id = ? AND is_active = 1`
        )
        .get(data.schedule_date, data.driver_id) as
        | { id: number }
        | undefined;

      if (duplicate) {
        throw Object.assign(
          new Error('Motorista já agendado neste lote de carregamento.'),
          { status: 409 }
        );
      }
    }

    // Same vehicle duplicate prevention on the same date
    if (data.vehicle_id) {
      const duplicate = db
        .prepare(
          `SELECT id FROM loading_schedules
           WHERE schedule_date = ? AND vehicle_id = ? AND is_active = 1`
        )
        .get(data.schedule_date, data.vehicle_id) as
        | { id: number }
        | undefined;

      if (duplicate) {
        throw Object.assign(
          new Error('Veículo já agendado nesta data.'),
          { status: 409 }
        );
      }
    }

    const result = db
      .prepare(
        `INSERT INTO loading_schedules (schedule_date, time_slot, driver_id, vehicle_id, driver_type, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.schedule_date,
        data.time_slot,
        data.driver_id,
        data.vehicle_id ?? null,
        resolvedDriverType,
        actor.sub
      );

    return result.lastInsertRowid as number;
  });

  try {
    const id = tx();
    // Projected exactly like `listByDate`, so a schedule has one shape wherever it appears.
    // Returning the raw row here is what made a single declared type mean three different
    // runtime objects: the mutation responses carried neither `creator` nor the permission
    // flags, and the cast hid it.
    const row = db
      .prepare(
        `SELECT ls.id, ls.schedule_date, ls.time_slot, ls.driver_type,
                ls.driver_id, d.name AS driver_name, d.license_plate,
                ls.vehicle_id, v.description AS vehicle_description,
                v.license_plate AS vehicle_plate, ls.user_id, ls.created_at, ls.updated_at,
                ls.is_active, u.display_name AS creator_name
         FROM loading_schedules ls
         LEFT JOIN drivers d ON ls.driver_id = d.id
         LEFT JOIN vehicles v ON ls.vehicle_id = v.id
         LEFT JOIN users u ON ls.user_id = u.id
         WHERE ls.id = ?`
      )
      .get(id) as ScheduleRow & { creator_name?: string | null };
    return projectScheduleRow(row, actor);
  } catch (err: unknown) {
    if (err instanceof Error && 'status' in err) {
      return {
        error: err.message,
        status: (err as Error & { status: number }).status,
        code: (err as Error & { code?: string }).code ?? err.message,
      };
    }
    throw err;
  }
}

export function update(
  db: Database.Database,
  id: number,
  data: UpdateScheduleBody,
  actor: HistoryActor
): ScheduleRow | LoadingRefusal {
  const existing = db
    .prepare(
      `SELECT id, schedule_date, time_slot, driver_type, driver_id, vehicle_id, user_id, created_at, is_active
       FROM loading_schedules WHERE id = ?`
    )
    .get(id) as
    | { id: number; schedule_date: string; time_slot: string; driver_type: string; driver_id: number | null; vehicle_id: number | null; user_id: number | null; created_at: string; is_active: number }
    | undefined;

  if (!existing) {
    return { error: 'Schedule entry not found', status: 404, code: 'SCHEDULE_NOT_FOUND' };
  }

  // The closed day answers before the ownership check: a Trabalhador who owns yesterday's row would
  // otherwise be told to ask the creator, when nobody can edit it.
  const closed = closedDayRefusal(existing.schedule_date);
  if (closed) return closed;

  const permissions = projectHistoryPermissions(actor, { ...existing, day_date: existing.schedule_date }, 'one-hour');
  if (!permissions.canEdit) {
    return { error: 'Registro somente leitura. Apenas o criador pode editar durante a primeira hora.', status: 403, code: 'SCHEDULE_READ_ONLY' };
  }

  // Resolve effective values (new or keep existing)
  const effectiveDate = data.schedule_date !== undefined ? data.schedule_date : existing.schedule_date;
  const effectiveSlot = data.time_slot !== undefined ? data.time_slot : existing.time_slot;

  const movingClosed = effectiveDate === existing.schedule_date ? null : closedDayRefusal(effectiveDate);
  if (movingClosed) return movingClosed;

  let effectiveDriverId = data.driver_id !== undefined ? data.driver_id : existing.driver_id;
  if (effectiveDriverId === null || effectiveDriverId === undefined) {
    return { error: 'Motorista é obrigatório.', status: 400 };
  }

  // Get driver type for effective driver
  const driver = db
    .prepare('SELECT is_active, driver_type FROM drivers WHERE id = ?')
    .get(effectiveDriverId) as { is_active: number; driver_type: 'casa' | 'fletero' } | undefined;
  if (!driver || driver.is_active !== 1) {
    return { error: 'Motorista inativo ou não encontrado.', status: 400 };
  }

  const effectiveType = driver.driver_type;
  let effectiveVehicleId = data.vehicle_id !== undefined ? data.vehicle_id : existing.vehicle_id;

  if (effectiveType === 'fletero') {
    effectiveVehicleId = null;
  } else if (effectiveType === 'casa') {
    if (effectiveVehicleId === null || effectiveVehicleId === undefined) {
      return { error: 'Veículo é obrigatório para motorista da casa.', status: 400 };
    }
  }

  // Validate active status of vehicle if provided
  if (effectiveVehicleId !== null && effectiveVehicleId !== undefined) {
    const activeVehicle = db
      .prepare('SELECT is_active FROM vehicles WHERE id = ?')
      .get(effectiveVehicleId) as { is_active: number } | undefined;
    if (!activeVehicle || activeVehicle.is_active !== 1) {
      return { error: 'Veículo inativo ou não encontrado.', status: 400 };
    }
  }

  // Wrap everything in a single transaction for atomicity
  const tx = db.transaction(() => {
    // Duplicate prevention: same driver in the same active batch date (excluding self)
    if (effectiveDriverId) {
      const dup = db
        .prepare(
          `SELECT id FROM loading_schedules
           WHERE schedule_date = ? AND driver_id = ? AND is_active = 1 AND id != ?`
        )
        .get(effectiveDate, effectiveDriverId, id) as
        | { id: number }
        | undefined;

      if (dup) {
        throw Object.assign(
          new Error('Motorista já agendado neste lote de carregamento.'),
          { status: 409 }
        );
      }
    }

    // Same vehicle duplicate prevention on the same date (excluding self)
    if (effectiveVehicleId) {
      const dup = db
        .prepare(
          `SELECT id FROM loading_schedules
           WHERE schedule_date = ? AND vehicle_id = ? AND is_active = 1 AND id != ?`
        )
        .get(effectiveDate, effectiveVehicleId, id) as
        | { id: number }
        | undefined;

      if (dup) {
        throw Object.assign(
          new Error('Veículo já agendado nesta data.'),
          { status: 409 }
        );
      }
    }

    // Perform the update
    db.prepare(
      `UPDATE loading_schedules
       SET schedule_date = ?, time_slot = ?, driver_type = ?,
           driver_id = ?, vehicle_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      effectiveDate,
      effectiveSlot,
      effectiveType,
      effectiveDriverId,
      effectiveVehicleId,
      id
    );
  });

  try {
    tx();
  } catch (err: unknown) {
    if (err instanceof Error && 'status' in err) {
      return {
        error: err.message,
        status: (err as Error & { status: number }).status,
        code: (err as Error & { code?: string }).code ?? err.message,
      };
    }
    throw err;
  }

  // Projected exactly like `listByDate` and `create`, so a schedule has one shape wherever it
  // appears.
  const row = db
    .prepare(
      `SELECT ls.id, ls.schedule_date, ls.time_slot, ls.driver_type,
              ls.driver_id, d.name AS driver_name, d.license_plate,
              ls.vehicle_id, v.description AS vehicle_description,
              v.license_plate AS vehicle_plate, ls.user_id, ls.created_at, ls.updated_at, ls.is_active, u.display_name AS creator_name
       FROM loading_schedules ls
       LEFT JOIN drivers d ON ls.driver_id = d.id
       LEFT JOIN vehicles v ON ls.vehicle_id = v.id
       LEFT JOIN users u ON ls.user_id = u.id
       WHERE ls.id = ?`
    )
    .get(id) as ScheduleRow & { creator_name?: string | null };
  return projectScheduleRow(row, actor);
}

export function remove(db: Database.Database, id: number): boolean | LoadingRefusal {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, schedule_date FROM loading_schedules WHERE id = ?').get(id) as
      | { id: number; schedule_date: string }
      | undefined;
    if (!existing) return false;
    const closed = closedDayRefusal(existing.schedule_date);
    if (closed) return closed;
    db.prepare('DELETE FROM loading_schedules WHERE id = ?').run(id);
    return true;
  });
  return tx();
}

export function deactivate(db: Database.Database, id: number): boolean {
  const result = db.prepare("UPDATE loading_schedules SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Brings a single row back into the day. Deactivation is the reversible half of the lifecycle, and
 * the calendar does not refuse it: a past day is frozen to content edits, not to its state.
 */
export function activate(db: Database.Database, id: number): boolean {
  const result = db.prepare("UPDATE loading_schedules SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Brings every row of one date back into the day.
 *
 * The existence check is what separates "there is no batch on that date" from "every row was already
 * active": SQLite reports the matched rows, so the second UPDATE is a success too.
 */
export function activateBatch(db: Database.Database, date: string): boolean {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ?').get(date) as { count: number };
    if (existing.count === 0) return false;
    db.prepare("UPDATE loading_schedules SET is_active = 1, updated_at = datetime('now') WHERE schedule_date = ?").run(date);
    return true;
  });
  return tx();
}

export function deactivateBatch(db: Database.Database, date: string): boolean {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ?').get(date) as { count: number };
    if (existing.count === 0) return false;
    db.prepare("UPDATE loading_schedules SET is_active = 0, updated_at = datetime('now') WHERE schedule_date = ?").run(date);
    return true;
  });
  return tx();
}

export function removeBatch(db: Database.Database, date: string): boolean | LoadingRefusal {
  const closed = closedDayRefusal(date);
  if (closed) return closed;
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT COUNT(*) AS count FROM loading_schedules WHERE schedule_date = ?').get(date) as { count: number };
    if (existing.count === 0) return false;
    db.prepare('DELETE FROM loading_schedules WHERE schedule_date = ?').run(date);
    return true;
  });
  return tx();
}

function projectScheduleRow(row: ScheduleRow & { creator_name?: string | null; is_active?: number }, actor?: HistoryActor): ScheduleRow {
  const permissions = actor
    ? projectHistoryPermissions(
        actor,
        { user_id: row.user_id ?? null, created_at: row.created_at ?? '', is_active: row.is_active, day_date: row.schedule_date },
        'one-hour',
      )
    : {};
  // The raw columns are this projection's input, not its output. Dropping them here is what lets a
  // generated client exist at all: `is_active` and `isActive` differ only by case, so a generator
  // that camelCases the JSON names would emit the same property twice.
  const { creator_name: _creatorName, is_active: _isActive, ...projected } = row;
  return {
    ...projected,
    ...(permissions as Partial<ScheduleRow>),
    creator: row.user_id ? { id: row.user_id, display_name: row.creator_name ?? '' } : null,
  };
}

export function listScheduleHistory(
  db: Database.Database,
  query: HistoryQuery,
  actor: HistoryActor
): { items: LoadingBatchHistoryItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.date) {
    where.push('ls.schedule_date = ?');
    params.push(query.date);
  }
  if (query.month) {
    where.push("ls.schedule_date >= ? AND ls.schedule_date < date(?, '+1 month')");
    params.push(`${query.month}-01`, `${query.month}-01`);
  }
  if (query.userId) {
    where.push('ls.user_id = ?');
    params.push(query.userId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM (SELECT ls.schedule_date FROM loading_schedules ls ${whereSql} GROUP BY ls.schedule_date) batches`).get(...params) as { count: number }).count;
  const page = query.page;
  const pageSize = query.pageSize;

  const rows = db.prepare(`
    SELECT
      ls.schedule_date AS batch_date,
      CASE strftime('%w', ls.schedule_date)
        WHEN '5' THEN ls.schedule_date
        ELSE date(ls.schedule_date, '+1 day')
      END AS loading_date,
      COUNT(*) AS total_loadings,
      MIN(ls.created_at) AS created_at,
      MAX(ls.updated_at) AS updated_at,
      MAX(ls.is_active) AS is_active,
      (
        SELECT lsu.user_id
        FROM loading_schedules lsu
        WHERE lsu.schedule_date = ls.schedule_date AND lsu.user_id IS NOT NULL
        ORDER BY lsu.created_at ASC, lsu.id ASC
        LIMIT 1
      ) AS user_id,
      (
        SELECT u.display_name
        FROM loading_schedules lsu
        JOIN users u ON u.id = lsu.user_id
        WHERE lsu.schedule_date = ls.schedule_date AND lsu.user_id IS NOT NULL
        ORDER BY lsu.created_at ASC, lsu.id ASC
        LIMIT 1
      ) AS creator_name
    FROM loading_schedules ls
    ${whereSql}
    GROUP BY ls.schedule_date
    ORDER BY ls.schedule_date DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as Array<{
    batch_date: string;
    loading_date: string;
    total_loadings: number;
    created_at: string | null;
    updated_at: string | null;
    is_active: number;
    user_id: number | null;
    creator_name: string | null;
  }>;

  const items = rows.map((row) => {
    const permissions = projectHistoryPermissions(
      actor,
      {
        user_id: row.user_id,
        created_at: row.created_at ?? '',
        is_active: row.is_active,
        day_date: row.batch_date,
      },
      'one-hour',
    );

    return {
      batch_date: row.batch_date,
      loading_date: row.loading_date,
      total_loadings: row.total_loadings,
      created_at: row.created_at,
      updated_at: row.updated_at,
      isActive: row.is_active === 1,
      isClosedDay: Boolean(permissions.isClosedDay),
      readOnly: Boolean(permissions.readOnly),
      canEdit: Boolean(permissions.canEdit),
      canDeactivate: Boolean(permissions.canDeactivate),
      canActivate: Boolean(permissions.canActivate),
      canDelete: Boolean(permissions.canDelete),
      creator: row.user_id ? { id: row.user_id, display_name: row.creator_name ?? '' } : null,
    } satisfies LoadingBatchHistoryItem;
  });

  return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

// ---- Driver Management ----

export function listDrivers(db: Database.Database): DriverRow[] {
  return db
    .prepare(
      `SELECT id, name, license_plate, phone, driver_type
       FROM drivers
       WHERE is_active = 1
       ORDER BY name ASC`
    )
    .all() as DriverRow[];
}

export function createDriver(
  db: Database.Database,
  data: CreateDriverBody
): DriverRow {
  const result = db
    .prepare(
      `INSERT INTO drivers (name, license_plate, phone, driver_type)
       VALUES (?, ?, ?, 'fletero')`
    )
    .run(data.name, data.license_plate ?? null, data.phone ?? null);

  return db
    .prepare(
      `SELECT id, name, license_plate, phone, driver_type
       FROM drivers
       WHERE id = ?`
    )
    .get(result.lastInsertRowid as number) as DriverRow;
}

export function listActiveVehicles(db: Database.Database): Vehicle[] {
  return db
    .prepare(
      `SELECT id, description, license_plate
       FROM vehicles
       WHERE is_active = 1
       ORDER BY description ASC`
    )
    .all() as Vehicle[];
}

// ---- Time Slots ----

/**
 * Returns the configured loading time slots from the settings table.
 * Falls back to a hardcoded default if the setting is missing.
 */
const DEFAULT_TIME_SLOTS = [
  '04:00',
  '04:30',
  '05:00',
  '05:30',
  '06:00',
  '06:30',
  '07:00',
];

export function getTimeSlots(db: Database.Database): string[] {
  const row = db
    .prepare(`SELECT value FROM settings WHERE key = 'loading_time_slots'`)
    .get() as { value: string } | undefined;

  if (!row) return DEFAULT_TIME_SLOTS;

  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    // fall through
  }

  return DEFAULT_TIME_SLOTS;
}
