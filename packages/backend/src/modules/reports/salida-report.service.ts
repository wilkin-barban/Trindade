import type Database from 'better-sqlite3';
import { z } from 'zod';
import { SalidaBlockSchema } from '../salida/salida.schema.js';
import { codeKey, operatorKey } from '../massas/massas-reconcile.js';
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
/**
 * The ERP's name, as the company wrote it.
 *
 * The WebService answers without declaring a charset and the shortcut reads the body as UTF-8; when the guess falls
 * to ISO-8859-2, the bytes of `Ç` come out as `Ă` plus a control character. The repair lives here, in the report's
 * exit block, and not in the shared mirror: the mirror keeps what the bridge brought, and every other reader of it
 * is out of this change's scope.
 */
function repairErpName(value: string): string {
  if (!/[\u0080-\u009f]/.test(value)) return value;
  const decoder = new TextDecoder('iso-8859-2');
  const bytes = new Map<string, number>();
  for (let byte = 0; byte < 256; byte += 1) {
    const character = decoder.decode(new Uint8Array([byte]));
    if (!bytes.has(character)) bytes.set(character, byte);
  }
  const out: number[] = [];
  for (const character of value) {
    const byte = bytes.get(character);
    if (byte === undefined) return value;
    out.push(byte);
  }
  try {
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(out));
    return /[\u0080-\u009f]/.test(repaired) ? value : repaired;
  } catch {
    return value;
  }
}

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

  // Who is allowed in: the active accounts of this application, keyed by their username and by their display name,
  // because the ERP writes the name the company knows and Trindade stores both.
  const accounts = db
    .prepare('SELECT username, display_name FROM users WHERE is_active = 1')
    .all() as { username: string; display_name: string | null }[];
  const accountByKey = new Map<string, { username: string; name: string }>();
  for (const account of accounts) {
    const entry = { username: account.username, name: (account.display_name || account.username).trim() };
    accountByKey.set(operatorKey(account.username), entry);
    if (account.display_name) accountByKey.set(operatorKey(account.display_name), entry);
  }

  const erpOnlyKeys = new Set<string>();
  for (const seat of seats) {
    const key = [codeKey(seat.product_code), Math.round(seat.quantity * 1000) / 1000, operatorKey(seat.operator_name)].join('|');
    if (localKeys.has(key)) continue;

    const erpKey = operatorKey(seat.operator_name);
    const account = accountByKey.get(erpKey);
    // Not an operator of this application: the seat belongs to the company's own ledger, not to this report.
    if (!account) continue;

    // Keyed by the account, not by the name the ERP wrote: the badge, and the group, follow the operator and not
    // the spelling. Searching by the ERP's spelling made a name like «JOAO H» open a new group per seat.
    const accountKey = operatorKey(account.username);
    erpOnlyKeys.add(accountKey);

    let op = [...operatorMap.entries()].find(([, candidate]) => operatorKey(candidate.username) === accountKey)?.[1];
    if (!op) {
      op = { name: account.name, username: account.username, products: new Map() };
      operatorMap.set(-(operatorMap.size + 1), op);
    }
    const existing = op.products.get(seat.product_code);
    if (existing) existing.units += seat.quantity;
    else {
      // A code this plant sells has a name this plant owns: the catalogue wins over whatever the book spelled,
      // which is also what frees the block from the ERP's charset.
      const known = catalogueProduct(seat.product_code);
      op.products.set(seat.product_code, {
        code: seat.product_code,
        name: known ? known.name : repairErpName(seat.product_desc),
        block: known ? known.block : 'embalagens',
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
