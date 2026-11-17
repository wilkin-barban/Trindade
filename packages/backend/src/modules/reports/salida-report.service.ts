import type Database from 'better-sqlite3';
import { z } from 'zod';
import { SalidaBlockSchema } from '../salida/salida.schema.js';
import { codeKey, operatorKey } from '../massas/massas-reconcile.js';

export const SalidaReportProductSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    block: SalidaBlockSchema,
    units: z.number().int().nonnegative(),
  })
  .strict();

export type SalidaReportProduct = z.infer<typeof SalidaReportProductSchema>;

export const SalidaReportOperatorSchema = z
  .object({
    name: z.string(),
    username: z.string(),
    units: z.number().int().nonnegative(),
    products: z.array(SalidaReportProductSchema),
    /** True when the name only exists in the company's book: nobody launched it from Trindade. */
    erpOnly: z.boolean(),
  })
  .strict();

export type SalidaReportOperator = z.infer<typeof SalidaReportOperatorSchema>;

export const SalidaReportDayViewSchema = z
  .object({
    date: z.string(),
    operators: z.array(SalidaReportOperatorSchema),
    totalUnits: z.number().int().nonnegative(),
    movementCount: z.number().int().nonnegative(),
  })
  .strict();

export type SalidaReportDayView = z.infer<typeof SalidaReportDayViewSchema>;

interface RawMovementItemRow {
  user_id: number;
  username: string;
  display_name: string;
  product_code: string;
  product_name: string;
  block: string;
  quantity: number;
}

/**
 * Reads a day of salidas and groups launches by operator.
 * Product names are kept as stored, operators are ordered alphabetically by name.
 * Empty day returns empty arrays, never null.
 */
export function salidaReportDayView(db: Database.Database, date: string): SalidaReportDayView {
  const countRow = db
    .prepare('SELECT COUNT(*) AS count FROM salida_movements WHERE movement_date = ?')
    .get(date) as { count: number } | undefined;
  const movementCount = countRow?.count ?? 0;

  if (movementCount === 0) {
    return {
      date,
      operators: [],
      totalUnits: 0,
      movementCount: 0,
    };
  }

  const rows = db
    .prepare(
      `SELECT m.user_id, u.username, u.display_name,
              i.product_code, i.product_name, i.block, i.quantity
         FROM salida_movements m
         JOIN users u ON u.id = m.user_id
         JOIN salida_movement_items i ON i.movement_id = m.id
        WHERE m.movement_date = ?
        ORDER BY m.id ASC, i.position ASC`,
    )
    .all(date) as RawMovementItemRow[];

  const operatorMap = new Map<
    number,
    {
      name: string;
      username: string;
      products: Map<string, SalidaReportProduct>;
    }
  >();

  for (const row of rows) {
    let op = operatorMap.get(row.user_id);
    if (!op) {
      op = {
        name: (row.display_name || row.username).trim(),
        username: row.username,
        products: new Map(),
      };
      operatorMap.set(row.user_id, op);
    }

    const existingProduct = op.products.get(row.product_code);
    if (existingProduct) {
      existingProduct.units += row.quantity;
    } else {
      op.products.set(row.product_code, {
        code: row.product_code,
        name: row.product_name,
        block: row.block as any,
        units: row.quantity,
      });
    }
  }

  /**
   * The exits the company recorded that Trindade never saw.
   *
   * A seat is the company's own line, and it can exist without a launch here: somebody typed it in the ERP, or a
   * day was posted before this module existed. A seat whose product, units and operator match an item already
   * counted is the same exit and is skipped -- the pairing rule is the one reconciliation uses, so the report
   * cannot count one exit twice. Everything else joins its operator, marked as ERP-only.
   */
  const localKeys = new Set<string>();
  for (const row of rows) {
    localKeys.add(
      [codeKey(row.product_code), Math.round(row.quantity * 1000) / 1000, operatorKey(row.username)].join('|'),
    );
  }

  const seats = db
    .prepare(
      `SELECT ent_lan, product_code, product_desc, quantity, operator_name
         FROM aero_movements
        WHERE movement_date = ? AND movement_type = 'S'
        ORDER BY ent_lan ASC`,
    )
    .all(date) as {
    ent_lan: number;
    product_code: string;
    product_desc: string;
    quantity: number;
    operator_name: string;
  }[];

  const erpOnlyKeys = new Set<string>();
  for (const seat of seats) {
    const key = [codeKey(seat.product_code), Math.round(seat.quantity * 1000) / 1000, operatorKey(seat.operator_name)].join('|');
    if (localKeys.has(key)) continue;

    const erpKey = operatorKey(seat.operator_name);
    erpOnlyKeys.add(erpKey);

    let op = [...operatorMap.entries()].find(([, candidate]) => operatorKey(candidate.username) === erpKey)?.[1];
    if (!op) {
      op = { name: seat.operator_name.trim(), username: seat.operator_name.trim(), products: new Map() };
      operatorMap.set(-(operatorMap.size + 1), op);
    }
    const existing = op.products.get(seat.product_code);
    if (existing) existing.units += seat.quantity;
    else {
      op.products.set(seat.product_code, {
        code: seat.product_code,
        name: seat.product_desc,
        block: 'embalagens',
        units: seat.quantity,
      });
    }
  }

  const operators: SalidaReportOperator[] = [...operatorMap.values()]
    .map((op) => {
      const products = [...op.products.values()];
      const units = products.reduce((sum, p) => sum + p.units, 0);
      return {
        name: op.name,
        username: op.username,
        units,
        products,
        erpOnly: erpOnlyKeys.has(operatorKey(op.username)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.username.localeCompare(b.username));

  const totalUnits = operators.reduce((sum, op) => sum + op.units, 0);

  return {
    date,
    operators,
    totalUnits,
    movementCount,
  };
}
