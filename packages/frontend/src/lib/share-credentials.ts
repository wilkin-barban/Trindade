import { passwordIssue } from './password-policy.js';

/**
 * The credentials a Share screen hands to a worker who already has an account.
 *
 * The screen used to generate a message without persisting anything: the worker received a password his account
 * did not have. Everything here is pure so the decision "does this need saving?" can be tested without a React
 * tree, and so the page cannot accidentally save twice or save an invalid secret.
 */

/** The subset of `GET /api/admin/users` this module needs. `listUsers` returns the role and the activity. */
export interface ShareCandidate {
  id: number;
  display_name: string;
  username?: string;
  role_name?: string;
  is_active?: number;
}

const WORKER_ROLE = 'Trabalhador';
/** The guest account is excluded by the server; the guard stays so a change there cannot hand it credentials. */
const GUEST_USERNAME = 'invitado';

/**
 * Active workers only.
 *
 * An administrator is not a candidate because this screen grants worker access, and handing over an admin
 * password would be a quiet privilege grant. An inactive one is not either: the account cannot sign in, so its
 * password is not something to send. A record without a role or without an activity flag is not trusted.
 */
export function activeWorkerCandidates(users: readonly ShareCandidate[]): ShareCandidate[] {
  return users.filter(
    (user) =>
      user.role_name === WORKER_ROLE &&
      user.is_active === 1 &&
      (user.username ?? '') !== GUEST_USERNAME,
  );
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
type ByteSource = (length: number) => Uint8Array;

function cryptoRandom(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * A temporary password that satisfies the same rule the server enforces.
 *
 * The old default was `123456789`, which the policy refuses: the server would answer 400 and the worker would
 * end up with a message and no password. The value is checked with `passwordIssue` before it is returned, so a
 * refusal can never reach the field, and it does not derive from the username, which would make it guessable.
 */
export function generateTemporaryPassword(random: ByteSource = cryptoRandom): string {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const bytes = random(32);
    let suffix = '';
    for (let index = 0; index < 14; index += 1) {
      suffix += ALPHABET[bytes[index]! % ALPHABET.length];
    }
    const candidate = `Trindade-${suffix}`;
    if (passwordIssue(candidate) === null) return candidate;
  }
  throw new Error('no se pudo generar una contraseña que cumpla la política');
}

export interface SavedPassword {
  userId: string;
  password: string;
}

export interface ShareCredentialInput {
  mode: 'create' | 'existing';
  includeCredentials: boolean;
  selectedUserId: string;
  password: string;
  saved: SavedPassword | null;
}

/**
 * Whether the next action must PATCH the worker before it can proceed.
 *
 * False for the create flow (it already created the account with its own password), for credentials turned off,
 * for no selected worker and for an empty password. True when the worker is selected and the exact pair
 * (worker, password) has not been saved yet: editing the password or picking another worker makes it true again,
 * and comparing the password exactly means a stray space counts as a different secret.
 */
export function needsPasswordSave(input: ShareCredentialInput): boolean {
  if (!input.includeCredentials) return false;
  if (input.mode !== 'existing') return false;
  if (!input.selectedUserId) return false;
  if (!input.password || input.password.trim() === '') return false;
  if (
    input.saved &&
    input.saved.userId === input.selectedUserId &&
    input.saved.password === input.password
  ) {
    return false;
  }
  return true;
}

/** The one call the screen needs from the API client, injectable so the payload can be asserted. */
export interface PasswordPatchClient {
  patch<T = unknown>(path: string, body: unknown): Promise<T>;
}

/**
 * Writes the temporary password to the worker who already has an account.
 *
 * The server validates the policy, hashes it, audits the change and revokes the worker's sessions; this function
 * only guarantees the shape of the call: the id in the path, and `{ password }` as the whole body. A caller that
 * builds that URL by hand is a caller that can drift into `?password=` or into an id from another field.
 */
export async function patchWorkerPassword(
  client: PasswordPatchClient,
  userId: string,
  password: string,
): Promise<void> {
  await client.patch(`/admin/users/${userId}`, { password });
}

/**
 * Leading or trailing spaces break the promise that the worker receives what the account stores.
 *
 * The message trims, the PATCH does not: `Trindade-abc ` would be saved with the space and printed without it, and
 * the worker would type a password that does not exist. Rejecting the edge spaces keeps message and server equal.
 */
export function passwordHasEdgeSpaces(password: string): boolean {
  return password !== password.trim();
}
