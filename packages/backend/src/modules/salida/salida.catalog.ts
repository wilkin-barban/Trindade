/**
 * The fixed list of products a salida can give baixa, transcribed from the list the plant handed over.
 *
 * It lives in code and not in a table for the same reason the counting catalogue does: it describes the
 * product, not the movement. A row of `salida_movement_items` keeps the code, the name and the block of the
 * moment it was launched, so renaming a product here tomorrow cannot rewrite what a movement said yesterday.
 *
 * No CRUD on purpose. The list is invariable in this delivery: 21 products, in this order, and the screen
 * renders them in it. `1040` (FARINHA TRIGO) is deliberately absent and `1673` (GORDURA VEGETAL) appears
 * once; both are invariants the suite asserts, because the plant's own sheet already carried that mistake.
 */

/** The three blocks the launch screen switches on independently. */
export const SALIDA_BLOCKS = ['embalagens', 'bobinas', 'materia-prima'] as const;

export type SalidaBlock = (typeof SALIDA_BLOCKS)[number];

export interface SalidaProduct {
  /** Four digits, the way the operator reads it on the block. The ERP wants six. */
  code: string;
  /** The plant's Portuguese name, exact. Bound strings are translated; product names are not. */
  name: string;
  block: SalidaBlock;
}

/** How many product codes one movement may carry: the whole catalogue is the ceiling. */
export const MAX_SALIDA_ITEMS = 21;

export const SALIDA_PRODUCTS: readonly SalidaProduct[] = [
  { code: '1474', name: 'EMBALAG. NHOQUE 1kg', block: 'embalagens' },
  { code: '1473', name: 'EMBALAG. NHOQUE 400g', block: 'embalagens' },
  { code: '1357', name: 'EMBALAG. DISCO 200g', block: 'embalagens' },
  { code: '1356', name: 'EMBALAG. DISCO 400g', block: 'embalagens' },
  { code: '1355', name: 'EMBALAG. DISCO 500g', block: 'embalagens' },
  { code: '1358', name: 'EMBALAG. LASANHA', block: 'embalagens' },
  { code: '1359', name: 'EMBALAG. CASEIRA', block: 'embalagens' },
  { code: '1361', name: 'EMBALAG. QUADRADA', block: 'embalagens' },
  { code: '1307', name: 'EMBALAG. ROLO 1kg', block: 'embalagens' },
  { code: '1625', name: 'EMBALAG. TOKO', block: 'embalagens' },
  { code: '1354', name: 'EMBALAG. ROLO 500g', block: 'embalagens' },
  { code: '1528', name: 'EMBALAG. ROLO 2kg', block: 'embalagens' },
  { code: '1781', name: 'EMBALAG. TEMPERO', block: 'embalagens' },
  { code: '1900', name: 'BOBINA ROLO', block: 'bobinas' },
  { code: '1899', name: 'BOBINA LASANHA', block: 'bobinas' },
  { code: '1898', name: 'BOBINA DISCO', block: 'bobinas' },
  { code: '1012', name: 'SORBATO', block: 'materia-prima' },
  { code: '1011', name: 'PROPIONATO', block: 'materia-prima' },
  { code: '1068', name: 'MICRO SAL', block: 'materia-prima' },
  { code: '1074', name: 'AÇÚCAR 5kg', block: 'materia-prima' },
  { code: '1673', name: 'GORDURA VEGETAL', block: 'materia-prima' },
];

const BY_CODE = new Map<string, SalidaProduct>(SALIDA_PRODUCTS.map((product) => [product.code, product]));

/** The product behind a code, or `undefined` when the list does not offer it. */
export function findSalidaProduct(code: string): SalidaProduct | undefined {
  return BY_CODE.get(String(code).trim());
}

/**
 * The code as the ERP writes it: six digits, zero padded.
 *
 * The plant names a product with four digits and Firebird stores it with six, so the widening has to
 * happen exactly once, here, instead of at every call site that builds a payload.
 */
export function salidaErpProductCode(code: string): string {
  return String(code).trim().padStart(6, '0');
}
