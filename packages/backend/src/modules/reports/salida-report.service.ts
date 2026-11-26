import type Database from 'better-sqlite3';
import { z } from 'zod';
import { SalidaBlockSchema } from '../salida/salida.schema.js';
import { codeKey } from '../massas/massas-reconcile.js';
import { matchOperatorUserId, type OperatorCandidate } from '../massas/massas-operator.js';
import { repairErpText } from '../integration/aero-text.js';
import { SALIDA_PRODUCTS, type SalidaProduct } from '../salida/salida.catalog.js';

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

/** The catalogue's name and block for a code, which is the truth this plant controls. */
function catalogueProduct(code: string): SalidaProduct | null {
  const padded = code.replace(/^0+/, '');
  return SALIDA_PRODUCTS.find((product) => product.code === padded) ?? null;
}

export function salidaReportDayView(db: Database.Database, date: string): SalidaReportDayView {
  const countRow = db
    .prepare('SELECT COUNT(*) AS count FROM salida_movements WHERE movement_date = ?')
    .get(date) as { count: number } | undefined;
  const movementCount = countRow?.count ?? 0;

  // No early return on an empty local day: the company's book may still hold exits for it, and a card that says
  // «nothing left the plant» because Trindade recorded nothing would be lying with the operator's own data.

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
   * cannot count one exit twice.
   *
   * The rule the plant asked for: **only operators that exist in this application reach this block.** The
   * company's book carries every name that ever typed a movement -- TV sales, the front desk, people who never
   * touch Trindade -- and a report of this plant is not their ledger. A seat whose operator is not an active user
   * here is dropped, with its products: a product line without its operator would be an orphan row.
   */
  // La llave lleva la cuenta y no el nombre: el espejo escribe el nombre que la empresa conoce, y la misma persona
  // puede llegar escrita distinto en cada asiento. Emparejar por nombre dejaba pasar el mismo retiro dos veces.
  const localKeys = new Set<string>();
  for (const row of rows) {
    localKeys.add(
      [codeKey(row.product_code), Math.round(row.quantity * 1000) / 1000, row.user_id].join('|'),
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

  // Who is allowed in: the active accounts of this application, resolved with the very comparator the rest of the
  // mirror uses. A seat that signs `GUSTAVO H` belongs to the account `gustavo`; one that signs `TELEVENDAS`
  // belongs to nobody here, and the company's own ledger is not this report.
  const candidates = db
    .prepare('SELECT id, username, display_name FROM users WHERE is_active = 1 ORDER BY id')
    .all() as OperatorCandidate[];

  const erpOnlyIds = new Set<number>();
  for (const seat of seats) {
    const userId = matchOperatorUserId(candidates, seat.operator_name);
    if (userId === null) continue;

    const key = [codeKey(seat.product_code), Math.round(seat.quantity * 1000) / 1000, userId].join('|');
    if (localKeys.has(key)) continue;

    let op = operatorMap.get(userId);
    if (!op) {
      const account = candidates.find((candidate) => candidate.id === userId)!;
      op = {
        name: (account.display_name || account.username).trim(),
        username: account.username,
        products: new Map(),
      };
      operatorMap.set(userId, op);
      // La insignia dice «só ERP» cuando la persona entra al reporte únicamente por el libro de la empresa: si ya
      // había lanzado desde la tableta, no es sólo del ERP.
      erpOnlyIds.add(userId);
    }
    const existing = op.products.get(seat.product_code);
    if (existing) existing.units += seat.quantity;
    else {
      // A code this plant sells has a name this plant owns: the catalogue wins over whatever the book spelled,
      // which is also what frees the block from the ERP's charset.
      const known = catalogueProduct(seat.product_code);
      op.products.set(seat.product_code, {
        code: seat.product_code,
        name: known ? known.name : repairErpText(seat.product_desc),
        block: known ? known.block : 'embalagens',
        units: seat.quantity,
      });
    }
  }

  const operators: SalidaReportOperator[] = [...operatorMap.entries()]
    .map(([userId, op]) => {
      const products = [...op.products.values()];
      const units = products.reduce((sum, p) => sum + p.units, 0);
      return {
        name: op.name,
        username: op.username,
        units,
        products,
        erpOnly: erpOnlyIds.has(userId),
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
