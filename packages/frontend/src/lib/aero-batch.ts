/**
 * How many products travel in one ticket to the company ERP.
 *
 * The trip still rides inside a `shortcuts://x-callback-url` deep link, which is a URL, not a channel: the
 * ticket itself is small, but the audit line and the shortcut's own batch branch read the payloads in order,
 * and a whole day of twenty products in one trip is a link iOS opens as a bet. Eight has been the ceiling the
 * factory certified and it stays.
 */
export const AERO_BATCH_MAX = 8;

/** The two actions a launch can ask the server for, and the only ones it ever needs. */
export type AeroLaunchAction = 'entrada' | 'entrada_lote';

/** One trip to the Atajos app: which action the server has to arm, and what it carries. */
export interface AeroLaunchTrip {
  action: AeroLaunchAction;
  /** The payloads this trip carries, in the order the shortcut will send them. */
  payloads: Record<string, unknown>[];
  /**
   * Where the shortcut comes back, as a same-origin path.
   *
   * The full URL is the server's job: it validates this path against `PUBLIC_APP_URL` and builds the callback
   * it stores with the ticket. The page only knows which route it is on.
   */
  callbackPath: string;
}

export interface AeroLaunchTripsArgs {
  payloads: readonly unknown[];
  /** Round trip for a single product, the one a shortcut without the batch branch understands. */
  singleCallbackPath: string;
  /** Round trip for a batch, which comes back as one array of answers. */
  batchCallbackPath: string;
}

/**
 * Hands the vault client plain dictionaries.
 *
 * The payload builders answer with typed interfaces, and an interface has no index signature: it is not
 * assignable to `Record<string, unknown>` even though every key of it is. Copying each payload into a fresh
 * dictionary is what makes the shape the HTTP body really is explicit, without a cast at the call site.
 */
export function aeroTicketPayloads(payloads: readonly unknown[]): Record<string, unknown>[] {
  return payloads.map((payload) => ({ ...(payload as Record<string, unknown>) }));
}

/**
 * Splits a launch into the trips the server has to arm.
 *
 * The rule is the product count, and it is Wilkin's: one product travels as `entrada`, two or more travel as
 * `entrada_lote` and come back once. Above eight, the launch is walked in order and the leftover, if it is a
 * single product, becomes a single trip again: a phone should not run a loop for one opinion.
 *
 * The order is preserved end to end, because the answers come back in the order they were sent and the page
 * has to know which product each answer belongs to. Nothing here is an envelope any more: the action and the
 * payloads are exactly what `POST /integration/aero/bridge-tickets` takes.
 */
export function buildAeroLaunchTrips(args: AeroLaunchTripsArgs): AeroLaunchTrip[] {
  const trips: AeroLaunchTrip[] = [];
  for (let start = 0; start < args.payloads.length; start += AERO_BATCH_MAX) {
    const chunk = args.payloads.slice(start, start + AERO_BATCH_MAX);
    trips.push(buildTrip(chunk, args));
  }
  return trips;
}

function buildTrip(chunk: readonly unknown[], args: AeroLaunchTripsArgs): AeroLaunchTrip {
  const payloads = aeroTicketPayloads(chunk);

  if (payloads.length === 1) {
    return { action: 'entrada', payloads, callbackPath: args.singleCallbackPath };
  }

  return { action: 'entrada_lote', payloads, callbackPath: args.batchCallbackPath };
}
