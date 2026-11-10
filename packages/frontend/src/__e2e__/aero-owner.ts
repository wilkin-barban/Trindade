import { expect, type Page } from '@playwright/test';
import { getE2EIdentities, loginViaApi } from './auth-helpers';

const API = 'http://localhost:3099/api';

/**
 * The one account the company integration belongs to.
 *
 * `isAeroAllowed` opens the panel and the sync switch to both plant roles, and the vault is per account. This
 * helper keeps using the owner because the URL field is owner-only, and a second spec creating `wilkin` with
 * another password would lock the first one out -- a test collision, not a product defect.
 */
export const AERO_OWNER = { username: 'wilkin', password: 'wilkin-result-dialogs-2026' } as const;

/** Creates the owner if this run did not, through the fixture admin. A 400 means it already existed. */
export async function ensureAeroOwner(page: Page): Promise<void> {
  const identities = await getE2EIdentities(page);
  const login = await page.request.post(`${API}/auth/login`, { data: identities.admin });
  const token = (await login.json()).token as string;
  const created = await page.request.post(`${API}/admin/users`, {
    headers: { authorization: `Bearer ${token}` },
    data: { ...AERO_OWNER, display_name: 'Wilkin', role_id: 1 },
  });
  expect([201, 400]).toContain(created.status());
}

/** The owner, created if needed and logged in for the next page. */
export async function loginAsAeroOwner(page: Page): Promise<void> {
  await ensureAeroOwner(page);
  await loginViaApi(page, AERO_OWNER);
}

/**
 * The owner's bearer token, for the API calls the helpers make outside the page's own session.
 *
 * `page.request` does not inherit the `localStorage` that `loginViaApi` seeds, so a helper that has to talk to
 * the API asks for a token of its own. It is the owner's, because the address is owner-only; the vault itself is
 * per authenticated operator.
 */
export async function loginAeroOwnerForApi(page: Page): Promise<string> {
  const login = await page.request.post(`${API}/auth/login`, { data: AERO_OWNER });
  expect(login.status()).toBe(200);
  return ((await login.json()) as { token: string }).token;
}

/**
 * Empties the vault of the owner, so a spec that reads it starts from «not configured».
 *
 * The vault used to be `sessionStorage`: every test threw it away with its browser context. It is now one row
 * per owner in the server's database, shared by every spec of the run, and a spec that saved a plant address or
 * a password leaves it for the next one. A spec that depends on the vault says what it expects to find instead
 * of inheriting whatever the previous file wrote.
 *
 * It runs as the owner through the API, not through the panel: clearing a spec's precondition is not the
 * behaviour under test, and the panel's own clear button is exercised by the spec that tests the form.
 */
export async function resetAeroVault(page: Page): Promise<void> {
  await loginAsAeroOwner(page);
  const token = await loginAeroOwnerForApi(page);
  const removed = await page.request.delete(`${API}/integration/aero/settings`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(removed.status()).toBe(204);
}

/**
 * Writes the vault of the owner, for the specs that need the state and not the form.
 *
 * The panel's save is a behaviour of its own and stays covered by the specs that test it. Everything else
 * only needs the server to hold a known address, user and secret before the screen opens.
 */
export async function saveAeroVault(
  page: Page,
  input: { wsUrl: string; username: string; password: string },
): Promise<void> {
  await loginAsAeroOwner(page);
  const token = await loginAeroOwnerForApi(page);
  const saved = await page.request.put(`${API}/integration/aero/settings`, {
    headers: { authorization: `Bearer ${token}` },
    data: input,
  });
  expect(saved.status()).toBe(200);
  // The server answers with the fact and never with the secret (I1): the helper proves the password landed
  // without ever reading it back.
  const body = (await saved.json()) as { hasPassword?: boolean; password?: unknown };
  expect(body.hasPassword).toBe(true);
  expect(body.password).toBeUndefined();
}

/**
 * Saves the ERP credential through the panel, the way an operator writes it once.
 *
 * It used to live in this tab's `sessionStorage`, and that is what the vault replaced: the secret now leaves
 * the browser on save, encrypted, and never comes back. The path stays here because it is still the only
 * screen that accepts a new password.
 */
export async function openErpSession(page: Page, password = 'senha'): Promise<void> {
  await page.goto('/admin');
  await page.locator('[data-testid="admin-tab-integration"]').click();
  await page.locator('[data-testid="aero-ws-user"]').fill('wilkin');
  await page.locator('[data-testid="aero-ws-pass"]').fill(password);
  await page.locator('[data-testid="aero-save"]').click();
  await expect(page.getByText(/Configuración guardada|Configuração salva/)).toBeVisible();
}

/** Leaves the current screen for another one of the app, without a reload: the app's own navigation. */
export async function navigateInApp(page: Page, href: string): Promise<void> {
  const openSidebar = page.getByRole('button', { name: /Abrir men/ });
  if (await openSidebar.isVisible().catch(() => false)) {
    await openSidebar.click();
  }
  await page.locator(`a[href="${href}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${href.replace('/', '\\/')}$`));
}

