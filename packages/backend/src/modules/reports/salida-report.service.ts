import type Database from 'better-sqlite3';
import { z } from 'zod';
import { SalidaBlockSchema } from '../salida/salida.schema.js';

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

  const operators: SalidaReportOperator[] = [...operatorMap.values()]
    .map((op) => {
      const products = [...op.products.values()];
      const units = products.reduce((sum, p) => sum + p.units, 0);
      return {
        name: op.name,
        username: op.username,
        units,
        products,
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
