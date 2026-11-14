/**
 * Salida / Baixa: what the screen knows before any network, in one place.
 *
 * The module is pure on purpose. The catalogue, the payload the ERP reads, how many products fit in one ticket,
 * the message an operator forwards and the order in which a launch is written are decisions, not layout, and a
 * decision that only lives inside a 400-line component is a decision nobody can test. Everything here runs in
 * node and the pages only assemble.
 *
 * The write contract is S7 of `odd/tasks/salida-baixa-module.md`: a stock exit is not the entry mirror. It
 * carries `PED_*` on the header, a six-digit `PRO_COD`, units × 100 in `PRO_QTD`, the operator uppercased and the
 * series `APL`; it carries no `PRO_CST` and no `PED_DTMOVI`, because the Firebird trigger that demands the CST
 * hangs off the entry detail table.
 */
import { saoPauloToday, formatDateLabel } from './date';
import { AERO_BATCH_MAX } from './aero-batch';
import { buildSaidaItemPayload, type AeroSaidaPayload, type StorageLike } from './aero-integration';
import type { AeroAuditEvent } from './aero-audit';
import type { ShareOutcome } from './whatsapp';

// ---- Catalogue (S1) ----

export type SalidaBlock = 'embalagens' | 'bobinas' | 'materia-prima';

export interface SalidaProduct {
  /** Four digits in the UI, six towards the ERP. */
  code: string;
  /** Fixed Portuguese name. It never travels through i18n: the ERP knows the product by this string. */
  name: string;
  block: SalidaBlock;
}

/**
 * The 21 products, in the order the backend serves them.
 *
 * This copy exists only as the fallback for a catalogue that could not be read, and a test pins it against the
 * server's list: a fallback that drifts is a screen that silently launches a product the backend does not have.
 * `1040` FARINHA TRIGO is deliberately absent and `1673` appears once.
 */
export const SALIDA_FALLBACK_PRODUCTS: readonly SalidaProduct[] = [
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

/** The three blocks, in the order the screen draws them. */
export const SALIDA_BLOCKS: readonly SalidaBlock[] = ['embalagens', 'bobinas', 'materia-prima'];

/** Portuguese block titles, for the message an operator forwards. The screen translates its own. */
export const SALIDA_BLOCK_LABELS_PT: Record<SalidaBlock, string> = {
  embalagens: 'Embalagens',
  bobinas: 'Bobinas',
  'materia-prima': 'Matéria-Prima',
};

/** The products of each block, keeping the catalogue order the server sent. */
export function salidaProductsByBlock(
  products: readonly SalidaProduct[],
): Record<SalidaBlock, SalidaProduct[]> {
  const grouped: Record<SalidaBlock, SalidaProduct[]> = {
    embalagens: [],
    bobinas: [],
    'materia-prima': [],
  };
  for (const product of products) {
    if (product && SALIDA_BLOCKS.includes(product.block)) grouped[product.block].push(product);
  }
  return grouped;
}

/** The one account inside the private beta. The name is the server's `BETA_USERNAME`, spelled the same. */
export const SALIDA_BETA_USERNAME = 'wilkin';

/**
 * Whether this account is inside the private beta.
 *
 * The server is the authority and answers 403 to everybody else; this only decides whether the menu items and
 * the routes are drawn at all. The comparison is therefore the server's own: trimmed and case-sensitive. Being
 * *more* permissive here is not a harmless nicety -- a `Wilkin` account would be shown both menu items and then
 * refused by every route, which is the UI advertising access the authority denies.
 */
export function isSalidaVisible(user: { username?: string } | null | undefined): boolean {
  return String(user?.username ?? '').trim() === SALIDA_BETA_USERNAME;
}

// ---- Date (S3) ----

/** `Hoje · dd/mm/yyyy`, the fixed line the launch screen shows instead of a date field. */
export function salidaDateLine(date: string): string {
  return `Hoje · ${formatDateLabel(date)}`;
}

/** The same line for the plant's today, so no caller reaches for the device clock. */
export function salidaTodayLine(now: Date = new Date()): string {
  return salidaDateLine(saoPauloToday(now));
}

/**
 * The hour of a movement, read on the plant's clock.
 *
 * The stored timestamp is UTC and the phone may be anywhere; the factory reads its own clock, so the card shows
 * `HH:MM` in São Paulo and never the browser's zone. An unreadable timestamp answers a dash instead of a guess.
 */
export function salidaTimeLabel(createdAt: string, timeZone = 'America/Sao_Paulo'): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
}

// ---- Quantities (S5) ----

/**
 * A quantity is a whole number of units, or nothing.
 *
 * `12.5`, `-3`, `'1e3'` and an empty field are all `0`: the operator counts units, and a fraction is not a count
 * the plant can receive. Parsing leniently with `parseInt` would turn `12.5` into twelve units of a product
 * nobody counted.
 */
export function salidaQuantity(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
  }
  const text = String(raw ?? '').trim();
  if (!/^\d+$/.test(text)) return 0;
  const value = Number.parseInt(text, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export interface SalidaItemInput {
  code: string;
  quantity: number;
}

/** Everything the operator asked to leave, in catalogue order, across the blocks that are switched on. */
export function salidaItemsFromQuantities(
  quantities: Readonly<Record<string, string>>,
  products: readonly SalidaProduct[],
  activeBlocks: readonly SalidaBlock[],
): SalidaItemInput[] {
  const active = new Set(activeBlocks);
  const items: SalidaItemInput[] = [];
  for (const product of products) {
    if (!active.has(product.block)) continue;
    const quantity = salidaQuantity(quantities[product.code]);
    if (quantity > 0) items.push({ code: product.code, quantity });
  }
  return items;
}

/** The units of a launch, which is what the ERP and the summary count. */
export function salidaTotalUnits(items: readonly { quantity: number }[]): number {
  return items.reduce((total, item) => total + salidaQuantity(item.quantity), 0);
}

// ---- ERP payload (S7) ----

/** The sentence the ERP keeps for a supply exit launched here. */
export const SALIDA_OBSERVATION = 'Saida de insumos via Trindade';

/**
 * One ERP payload per product, exactly S7.
 *
 * A code the catalogue does not carry is dropped instead of sent: the ERP resolves `PRO_COD` against its own
 * table, and a guessed description would create an entry nobody can find. A repeated code keeps its first
 * quantity, because the backend refuses duplicates and a launch has one line per product.
 */
export function buildSalidaPayloads(
  items: readonly SalidaItemInput[],
  options: { date: string; username: string; products: readonly SalidaProduct[] },
): AeroSaidaPayload[] {
  const byCode = new Map(options.products.map((product) => [product.code, product]));
  const seen = new Set<string>();
  const payloads: AeroSaidaPayload[] = [];

  for (const item of items) {
    const code = String(item.code ?? '').trim();
    const product = byCode.get(code);
    const quantity = salidaQuantity(item.quantity);
    if (!product || quantity <= 0 || seen.has(code)) continue;
    seen.add(code);
    payloads.push(
      buildSaidaItemPayload({
        productCode: product.code,
        productName: product.name,
        quantity,
        exitDate: options.date,
        userCode: options.username,
        observation: SALIDA_OBSERVATION,
      }),
    );
  }

  return payloads;
}

// ---- Ticket chunking (S9) ----

/** One trip to the Atajos app: the action the server arms and the payloads it carries. */
export interface SalidaTrip {
  action: 'saida';
  payloads: Record<string, unknown>[];
}

/** Groups of eight, in order: the ceiling a Shortcut deep link has been certified with. */
export const SALIDA_TRIP_MAX = AERO_BATCH_MAX;

export function buildSalidaTrips(payloads: readonly AeroSaidaPayload[]): SalidaTrip[] {
  const trips: SalidaTrip[] = [];
  for (let start = 0; start < payloads.length; start += SALIDA_TRIP_MAX) {
    trips.push({
      action: 'saida',
      payloads: payloads.slice(start, start + SALIDA_TRIP_MAX).map((payload) => ({ ...payload })),
    });
  }
  return trips;
}

// ---- Movement shape the backend serves ----

export type SalidaReconciliationStatus = 'reconciled' | 'partial' | 'pending';

export interface SalidaReconciliation {
  status: SalidaReconciliationStatus;
  ent_lans: number[];
  matched_item_ids: number[];
}

export interface SalidaMovementItem {
  id: number;
  product_code: string;
  product_name: string;
  block: SalidaBlock;
  quantity: number;
  position: number;
}

export interface SalidaPhoto {
  id: number;
  file_path: string;
  file_size: number;
  mime_type: string;
  /** Same-origin path the page draws the photo from. */
  url: string;
  /** Tokenised public path, when the server issued one. */
  publicUrl?: string | null;
  created_at: string;
}

export interface SalidaMovement {
  id: number;
  movement_date: string;
  user_id: number;
  username: string;
  display_name?: string | null;
  created_at: string;
  items: SalidaMovementItem[];
  photos: SalidaPhoto[];
  total_units: number;
  reconciliation?: SalidaReconciliation | null;
}

/** The status of a movement whose reconciliation the server never answered reads as pending, not as agreed. */
export function salidaReconciliationStatus(
  movement: Pick<SalidaMovement, 'reconciliation'> | null | undefined,
): SalidaReconciliationStatus {
  const status = movement?.reconciliation?.status;
  return status === 'reconciled' || status === 'partial' ? status : 'pending';
}

/** The i18n key of the badge: `ERP OK`, `Pendente` or `Parcial`. */
export function salidaReconciliationLabelKey(status: SalidaReconciliationStatus): string {
  if (status === 'reconciled') return 'salida.erpOk';
  if (status === 'partial') return 'salida.erpPartial';
  return 'salida.erpPending';
}

/** The `ENT_LAN` values of the seats this movement was matched with, smallest first and never repeated. */
export function salidaEntLans(movement: Pick<SalidaMovement, 'reconciliation'> | null | undefined): number[] {
  const raw = movement?.reconciliation?.ent_lans;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const value of raw) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) seen.add(value);
  }
  return [...seen].sort((a, b) => a - b);
}

/** The blocks a movement covers, in screen order, so a card names them once. */
export function salidaMovementBlocks(movement: Pick<SalidaMovement, 'items'>): SalidaBlock[] {
  const present = new Set(movement.items.map((item) => item.block));
  return SALIDA_BLOCKS.filter((block) => present.has(block));
}

// ---- Photos (S8) ----

/** Three photos per movement: enough to prove what left, few enough that the record stays one card. */
export const SALIDA_MAX_PHOTOS = 3;

/** The same ceiling the report photos carry. */
export const SALIDA_MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const SALIDA_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type SalidaPhotoRejection = 'count' | 'size' | 'type';

/**
 * Why a selection of files cannot be added, or `null` when it can.
 *
 * The count is checked before the individual files so a fourth photo is refused as a fourth photo instead of
 * being blamed on its size, which is the sentence that would make an operator retry the same tap.
 */
export function salidaPhotoRejection(
  files: readonly { size: number; type: string }[],
  existing: number,
): SalidaPhotoRejection | null {
  if (existing + files.length > SALIDA_MAX_PHOTOS) return 'count';
  for (const file of files) {
    if (!Number.isFinite(file.size) || file.size > SALIDA_MAX_PHOTO_BYTES) return 'size';
    if (!SALIDA_PHOTO_TYPES.includes(file.type as (typeof SALIDA_PHOTO_TYPES)[number])) return 'type';
  }
  return null;
}

// ---- Share (S12) ----

/**
 * The message an operator forwards.
 *
 * Product names stay in Portuguese -- they are the ERP's names and the plant's names -- while the block titles
 * come in from the caller's dictionary. No URL is invented: the photos travel as files when the browser can
 * share them, or as the record's own images.
 */
export function salidaSummaryText(
  movement: Pick<SalidaMovement, 'movement_date' | 'username' | 'display_name' | 'items'>,
  labels: Record<SalidaBlock, string> = SALIDA_BLOCK_LABELS_PT,
): string {
  const lines: string[] = [];
  lines.push(`*Salida / Baixa — ${formatDateLabel(movement.movement_date)}*`);
  lines.push(`Operador: ${String(movement.username ?? '').toUpperCase()}`);
  lines.push('');

  const grouped = salidaProductsByBlock(
    movement.items.map((item) => ({
      code: item.product_code,
      name: item.product_name,
      block: item.block,
    })),
  );
  const quantities = new Map(movement.items.map((item) => [item.product_code, item.quantity]));

  for (const block of SALIDA_BLOCKS) {
    const products = grouped[block];
    if (products.length === 0) continue;
    lines.push(`*${labels[block]}*`);
    for (const product of products) {
      lines.push(`• ${product.code} ${product.name} — ${salidaQuantity(quantities.get(product.code))} un`);
    }
    lines.push('');
  }

  lines.push(`Total: ${salidaTotalUnits(movement.items)} un`);
  return lines.join('\n').trimEnd();
}

/** The labels a day summary needs; the page passes its dictionary, the module invents none. */
export interface SalidaDaySummaryLabels {
  title: string;
  movements: string;
  total: string;
  operator: string;
  blocks: Record<SalidaBlock, string>;
  status: Record<'reconciled' | 'partial' | 'pending', string>;
}

/** One movement as the day summary reads it: what left, who launched it and what the company answered. */
export type SalidaDayShareMovement = Pick<
  SalidaMovement,
  'movement_date' | 'username' | 'display_name' | 'items' | 'reconciliation'
>;

function productsOf(items: SalidaDayShareMovement['items'], labels: Record<SalidaBlock, string>): string[] {
  const grouped = salidaProductsByBlock(
    items.map((item) => ({ code: item.product_code, name: item.product_name, block: item.block })),
  );
  const quantities = new Map(items.map((item) => [item.product_code, item.quantity]));
  const lines: string[] = [];
  for (const block of SALIDA_BLOCKS) {
    const products = grouped[block];
    if (products.length === 0) continue;
    lines.push(`*${labels[block]}*`);
    for (const product of products) {
      lines.push(`• ${product.code} ${product.name} — ${salidaQuantity(quantities.get(product.code))} un`);
    }
  }
  return lines;
}

/**
 * The whole day in one message: the date, how many movements it holds, each of them with its operator, its
 * blocks, its products and its state, and the total units at the end.
 *
 * The total is computed from the items and not from a field: the day summary is the operator's account of what
 * left, and a total that disagrees with the lines below it is worse than no total.
 */
export function salidaDaySummaryText(
  movements: readonly SalidaDayShareMovement[],
  args: { date: string; labels: SalidaDaySummaryLabels },
): string {
  const { labels } = args;
  const lines: string[] = [];
  lines.push(`*${labels.title} — ${formatDateLabel(args.date)}*`);
  lines.push(`${labels.movements}: ${movements.length}`);
  lines.push('');

  let total = 0;
  movements.forEach((movement, index) => {
    const units = movement.items.reduce((sum, item) => sum + salidaQuantity(item.quantity), 0);
    total += units;
    lines.push(`*${index + 1}. ${String(movement.username ?? '').toUpperCase()} — ${units} un*`);
    lines.push(`${labels.operator}: ${String(movement.display_name ?? movement.username ?? '')}`);
    lines.push(...productsOf(movement.items, labels.blocks));
    const status = salidaReconciliationStatus({ reconciliation: movement.reconciliation });
    const entLans = salidaEntLans({ reconciliation: movement.reconciliation });
    const suffix = entLans.length > 0 ? ` (ENT_LAN ${entLans.join(', ')})` : '';
    lines.push(`*${labels.status[status]}*${suffix}`);
    lines.push('');
  });

  lines.push(`${labels.total}: ${total} un`);
  return lines.join('\n').trimEnd();
}

/** A photo the record keeps, in the two links the module already serves. */
export interface SalidaShareablePhoto {
  id: number;
  mime_type?: string | null;
  url?: string | null;
  publicUrl?: string | null;
}

/**
 * The record's photos as files the share sheet can carry.
 *
 * A photo that cannot be fetched is left out instead of failing the share: the summary is the message, and the
 * grid under it still offers every photo on its own. The name is derived from the id so two photos of the same
 * movement never collide in the sheet.
 */
export async function salidaPhotoFiles(photos: readonly SalidaShareablePhoto[]): Promise<File[]> {
  const files: File[] = [];
  for (const photo of photos) {
    const url = photo.publicUrl || photo.url;
    if (!url) continue;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const blob = await response.blob();
      const type = photo.mime_type || blob.type || 'image/jpeg';
      const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
      files.push(new File([blob], `salida-${photo.id}.${extension}`, { type }));
    } catch {
      /* one unreadable photo is not a reason to lose the summary */
    }
  }
  return files;
}

/**
 * Shares the summary, with the photos when the platform can take files.
 *
 * A sheet that cannot carry files is not a reason to lose the summary: the text is copied instead, and the
 * screen keeps every photo downloadable on its own, which is the fallback S12 asks for.
 */
/** WhatsApp's canonical endpoint with no number: the channel the plant forwards to, chosen by the operator. */
export const SALIDA_WHATSAPP_ENDPOINT = 'https://api.whatsapp.com/send?text=';

/**
 * Opens WhatsApp in a new tab with the text, and answers whether a tab was actually opened.
 *
 * A blocked popup returns `null` (or throws), and a `null` here is the signal that the text still has to go
 * somewhere: the caller copies it instead of leaving the operator with a button that did nothing.
 */
function openWhatsApp(text: string): boolean {
  const windowLike = (globalThis as { window?: { open?: (url: string, target?: string) => unknown } }).window;
  if (typeof windowLike?.open !== 'function') return false;
  try {
    return Boolean(windowLike.open(`${SALIDA_WHATSAPP_ENDPOINT}${encodeURIComponent(text)}`, '_blank'));
  } catch {
    return false;
  }
}

export async function shareSalida(args: {
  text: string;
  photos?: readonly File[];
}): Promise<ShareOutcome> {
  const navigatorLike = (globalThis as { navigator?: Navigator }).navigator;
  const photos = args.photos ?? [];

  if (photos.length > 0 && typeof navigatorLike?.share === 'function') {
    const data: ShareData = { text: args.text, files: [...photos] };
    const canShare = typeof navigatorLike.canShare === 'function' ? navigatorLike.canShare(data) : false;
    if (canShare) {
      try {
        await navigatorLike.share(data);
        return 'shared';
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
      }
    }
  }

  if (typeof navigatorLike?.share === 'function') {
    try {
      await navigatorLike.share({ text: args.text });
      return 'shared';
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }

  // No sheet, or a sheet that refused the text: WhatsApp is where the plant sends it, and the link is the only
  // way to hand a message to that app from a desktop browser.
  if (openWhatsApp(args.text)) return 'shared';

  const clipboard = navigatorLike?.clipboard;
  if (!clipboard) return 'failed';
  try {
    await clipboard.writeText(args.text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// ---- Write order (S6) ----

export interface SalidaSubmitDeps {
  /** `POST /api/salida`, the only step that must never be skipped. */
  create: (items: SalidaItemInput[]) => Promise<SalidaMovement>;
  /** `POST /api/salida/:id/photos`, once per file. Optional: zero photos is a valid movement. */
  uploadPhotos?: (movement: SalidaMovement) => Promise<void>;
  /** The trip to the ERP. Answers `false` when nothing left the page. */
  sendToErp?: (movement: SalidaMovement) => Promise<boolean>;
}

export interface SalidaSubmitResult {
  /** The movement Trindade wrote, or `null` when it could not be written at all. */
  movement: SalidaMovement | null;
  /** `sent` when a trip was armed; `pending` when the ERP still has to hear about it. */
  erp: 'sent' | 'pending';
  /** The photos could not be uploaded; the movement is still valid, because photos are optional. */
  photoError: boolean;
  error: string | null;
}

/**
 * Writes a launch in the only order that cannot lose it: Trindade first, photos second, the ERP last.
 *
 * Every failure after the first step degrades instead of aborting. A photo the server refused is a photo the
 * record does not have; an ERP trip that never started is a movement the history will show as pending with a
 * button to resend. What is never acceptable is the other order, where a launch that the plant dropped leaves
 * the company's books with an exit nobody can explain.
 */
export async function submitSalida(
  items: readonly SalidaItemInput[],
  deps: SalidaSubmitDeps,
): Promise<SalidaSubmitResult> {
  if (items.length === 0) {
    return { movement: null, erp: 'pending', photoError: false, error: 'empty' };
  }

  let movement: SalidaMovement;
  try {
    movement = await deps.create([...items]);
  } catch (error) {
    return {
      movement: null,
      erp: 'pending',
      photoError: false,
      error: error instanceof Error ? error.message : String(error ?? ''),
    };
  }

  let photoError = false;
  if (deps.uploadPhotos) {
    try {
      await deps.uploadPhotos(movement);
    } catch {
      photoError = true;
    }
  }

  let erp: 'sent' | 'pending' = 'pending';
  if (deps.sendToErp) {
    try {
      erp = (await deps.sendToErp(movement)) ? 'sent' : 'pending';
    } catch {
      erp = 'pending';
    }
  }

  return { movement, erp, photoError, error: null };
}

// ---- Audit (S13) ----

/**
 * Where this module's audit lines say the action went.
 *
 * The ERP address itself lives in the vault and never reaches the browser, so the page cannot honestly name
 * `saidasitem` or `movimentoitem`: what it really calls is the ticket endpoint that arms the trip, and the
 * server is the side that knows the plant's URL. Recording the address the page did call is the only
 * destination line this screen can write without inventing one.
 */
export const SALIDA_AUDIT_DESTINATION = '/api/integration/aero/bridge-tickets';

/** The code a requested line carries when the vault refused to arm the trip. Nothing left the page. */
export const SALIDA_TICKET_REFUSED = 'AERO_TICKET_REFUSED';

/** The attempt that pairs a request with its answer. The caller creates it with `newAeroAttempt`. */
export interface SalidaAttemptRef {
  attemptId: string;
  startedAt: number;
}

/** Which of the trips one movement was cut into: the head of what is still owed, and how much is owed. */
export interface SalidaTripRef {
  index: number;
  total: number;
}

/**
 * The `salida_sync` line, in the vocabulary the server's log validates.
 *
 * The event name is the literal the client type declares, so a renamed or misspelled event fails to compile here
 * instead of being refused by the server at runtime.
 */
function salidaAuditEvent(
  event: Omit<AeroAuditEvent, 'event'>,
  name: AeroAuditEvent['event'] = 'salida_sync',
): AeroAuditEvent {
  return { ...event, event: name };
}

function attemptFields(attempt?: SalidaAttemptRef | null): Pick<AeroAuditEvent, 'attemptId' | 'startedAt'> {
  return attempt ? { attemptId: attempt.attemptId, startedAt: attempt.startedAt } : {};
}

/**
 * The `requested` line of one trip to the ERP.
 *
 * One line per trip, not per product: the payloads are already in it, and a log that grows with the plant's
 * output is unreadable exactly when it is needed. A refusal from the vault is the same event with the refusal
 * code and no attempt, because nothing left the page and nothing is owed.
 */
export function salidaSyncRequestedEvent(args: {
  payloads: readonly unknown[];
  trip: SalidaTripRef;
  attempt?: SalidaAttemptRef | null;
  destinationUrl?: string;
  error?: string | null;
  note?: string | null;
}): AeroAuditEvent {
  const payloads = [...args.payloads];
  const note =
    args.note ??
    `trip ${args.trip.index}/${args.trip.total} · batch ${payloads.length}${args.error ? ' not sent' : ''} · via=bridge`;

  return salidaAuditEvent({
    phase: 'requested',
    destinationUrl: args.destinationUrl ?? SALIDA_AUDIT_DESTINATION,
    client: 'web',
    payload: payloads.length === 1 ? payloads[0] : payloads,
    note,
    error: args.error ?? null,
    ...attemptFields(args.attempt),
  });
}

/**
 * The `result` line of one trip: what the company answered, or why it did not.
 *
 * `httpStatus` is `200` only when the ERP said `success: true`; the page never saw a socket, and inventing a
 * status for a bridge answer would read as an ERP confirmation in the one log that exists to say who said what.
 * The sentence travels in `response` on success and in `error` on refusal, where it is classified into a code the
 * log can be filtered by.
 */
export function salidaSyncResultEvent(args: {
  attempt?: SalidaAttemptRef | null;
  outcome: 'ok' | 'error';
  message?: string | null;
  error?: string | null;
  trip?: SalidaTripRef | null;
  destinationUrl?: string;
}): AeroAuditEvent {
  const message = args.message?.trim() ? args.message.trim() : null;

  return salidaAuditEvent({
    phase: 'result',
    destinationUrl: args.destinationUrl ?? SALIDA_AUDIT_DESTINATION,
    client: 'web',
    httpStatus: args.outcome === 'ok' ? 200 : null,
    response: args.outcome === 'ok' ? message : null,
    error: args.outcome === 'ok' ? null : args.error ?? message ?? 'bridge_unreadable',
    note: args.trip ? `trip ${args.trip.index}/${args.trip.total} · via=bridge` : 'via=bridge',
    ...attemptFields(args.attempt),
  });
}

/**
 * The `requested` line of `Conferir no ERP`.
 *
 * The payload is the day and the direction the query asks for, which is the whole question this screen puts to
 * the plant. `entrySaida: 'S'` is written down because a read that forgot it would settle entries against exits
 * and the log would never show it.
 */
export function salidaReadRequestedEvent(args: {
  date: string;
  payload?: unknown;
  attempt?: SalidaAttemptRef | null;
  destinationUrl?: string;
  error?: string | null;
}): AeroAuditEvent {
  return salidaAuditEvent(
    {
      phase: 'requested',
      destinationUrl: args.destinationUrl ?? SALIDA_AUDIT_DESTINATION,
      client: 'web',
      payload: args.payload ?? { date: args.date, entrySaida: 'S' },
      note: `date=${args.date} · entrySaida=S${args.error ? ' not sent' : ''} · via=bridge`,
      error: args.error ?? null,
      ...attemptFields(args.attempt),
    },
    'read_history',
  );
}

/**
 * The `result` line of that read: how many seats came back and how many were stored.
 *
 * `seats` is what the ERP answered and `stored` is what Trindade kept; they differ only when the snapshot could
 * not be written, which is a fact worth having in the log rather than only on the screen.
 */
export function salidaReadResultEvent(args: {
  date: string;
  attempt?: SalidaAttemptRef | null;
  seats: number | null;
  stored?: number | null;
  message?: string | null;
  error?: string | null;
  destinationUrl?: string;
}): AeroAuditEvent {
  const refused = typeof args.error === 'string' && args.error.trim().length > 0;
  const seats = typeof args.seats === 'number' && Number.isFinite(args.seats) ? args.seats : 0;
  const stored = typeof args.stored === 'number' && Number.isFinite(args.stored) ? args.stored : seats;
  const message = args.message?.trim() ? args.message.trim() : null;

  return salidaAuditEvent(
    {
      phase: 'result',
      destinationUrl: args.destinationUrl ?? SALIDA_AUDIT_DESTINATION,
      client: 'web',
      httpStatus: refused ? null : 200,
      response: message,
      error: args.error ?? null,
      note: `date=${args.date} · seats=${seats} · ${refused ? 'refused' : `stored=${stored}`} · via=bridge`,
      ...attemptFields(args.attempt),
    },
    'read_history',
  );
}

// ---- Storage: the trip that has to survive leaving the page ----

export const SALIDA_OUTBOX_KEY = 'trindade.salida.outbox.v1';
export const SALIDA_LAST_MOVEMENT_KEY = 'trindade.salida.last-movement.v1';

/** The trips still owed to the ERP for one movement, oldest first. */
export interface SalidaOutbox {
  movementId: number;
  date: string;
  trips: SalidaTrip[];
  startedAt: string;
}

function safeStorage(): StorageLike | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function isTrip(value: unknown): value is SalidaTrip {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.action === 'saida' && Array.isArray(record.payloads) && record.payloads.length > 0;
}

export function readSalidaOutbox(storage: StorageLike | null = safeStorage()): SalidaOutbox | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(SALIDA_OUTBOX_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const movementId = record.movementId;
  const date = record.date;
  const trips = record.trips;
  if (typeof movementId !== 'number' || !Number.isInteger(movementId) || movementId <= 0) return null;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Array.isArray(trips)) return null;

  const kept = trips.filter(isTrip);
  if (kept.length === 0) return null;

  return {
    movementId,
    date,
    trips: kept,
    startedAt: typeof record.startedAt === 'string' ? record.startedAt : new Date().toISOString(),
  };
}

export function writeSalidaOutbox(
  outbox: SalidaOutbox,
  storage: StorageLike | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SALIDA_OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    /* a phone in private mode cannot keep the queue; the movement is already in Trindade */
  }
}

export function clearSalidaOutbox(storage: StorageLike | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SALIDA_OUTBOX_KEY);
  } catch {
    /* nothing to forget */
  }
}

/** The next trip and what is left after it, so the caller can arm one and store the rest. */
export function takeSalidaTrip(outbox: SalidaOutbox | null): {
  trip: SalidaTrip | null;
  rest: SalidaOutbox | null;
} {
  if (!outbox || outbox.trips.length === 0) return { trip: null, rest: null };
  const [trip, ...rest] = outbox.trips;
  return {
    trip: trip ?? null,
    rest: rest.length > 0 ? { ...outbox, trips: rest } : null,
  };
}

/**
 * The movement whose ERP answer the page is waiting for, kept in session storage.
 *
 * The bridge leaves the page: the shortcut opens, talks to the ERP and comes back through a deep link, and by
 * then React has no memory of the movement it just wrote. The dialog the operator sees on return needs that
 * movement -- its summary and its photos -- so it travels with the session and is dropped once shown.
 */
export function writeSalidaLastMovement(
  movement: SalidaMovement,
  storage: StorageLike | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SALIDA_LAST_MOVEMENT_KEY, JSON.stringify(movement));
  } catch {
    /* the dialog will fall back to what the history serves */
  }
}

export function readSalidaLastMovement(
  storage: StorageLike | null = safeStorage(),
): SalidaMovement | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(SALIDA_LAST_MOVEMENT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SalidaMovement;
    if (typeof parsed?.id !== 'number' || !Array.isArray(parsed.items)) return null;
    return {
      ...parsed,
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
      total_units: typeof parsed.total_units === 'number' ? parsed.total_units : salidaTotalUnits(parsed.items),
    };
  } catch {
    return null;
  }
}

export function clearSalidaLastMovement(storage: StorageLike | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SALIDA_LAST_MOVEMENT_KEY);
  } catch {
    /* nothing to forget */
  }
}
