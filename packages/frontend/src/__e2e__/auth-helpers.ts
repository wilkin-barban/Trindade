import type { Page } from '@playwright/test';

const API_BASE = 'http://localhost:3099/api';

/**
 * The user agent of the phone these screens are built for.
 *
 * The integration is gated by the device that opens it: a desktop browser reads the plant's day and nothing
 * more, because the direct connection was only built for iOS. A spec that configures the connection, tests it
 * or launches with it therefore runs as an iPhone -- that is the device whose buttons it is pressing.
 */
export const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';


interface LoginResponse {
  token: string;
  user: { id: number; username: string; role: string };
}
type E2EIdentity = { username: string; password: string };
interface E2EFixtures {
  admin: E2EIdentity;
  worker: E2EIdentity;
}
/**
 * Leaves the share card and lands on the reading view of the report just saved.
 *
 * Since the redesign a save opens the message card -- the text the group receives, with share, PDF, edit and
 * close -- and the reading view is one route away. A spec that asserts the reading view has to say so instead of
 * assuming the save landed there.
 */
export async function openSavedReportView(page: Page): Promise<void> {
  await page.waitForURL(/\/reports\/\d+/);
  const url = new URL(page.url());
  await page.goto(url.pathname);
}

export async function getE2EIdentities(page: Page): Promise<E2EFixtures> {
  const response = await page.request.get('http://localhost:3099/__test_fixtures');
  if (!response.ok()) throw new Error(`Fixture lookup failed: ${response.statusText()}`);
  return response.json() as Promise<E2EFixtures>;
}

/**
 * Programmatically authenticate through the API and let the browser keep the session cookie.
 *
 * `page.request` shares the browser context's cookie jar, so a web login performed here stores the
 * `HttpOnly` refresh cookie exactly where a real sign-in would: nothing has to be injected into the page. The
 * app then renews from that cookie on mount, which is the same path a reload takes -- and it is the only path
 * there is now, because no token is written to `localStorage` for a script (or a spec) to read.
 *
 * Returns the access token for the specs that have to call the API directly; it is short-lived by design.
 */
/**
 * An access token for a spec that calls the API directly.
 *
 * The browser no longer holds one: the web session is an HttpOnly cookie and the access token lives in memory, so
 * a spec cannot read either out of `localStorage`. Asking the API for a short-lived token the same way a native
 * client does is the honest route -- it is a real credential, minted for this test, and it expires on its own.
 */
export async function apiToken(page: Page, identity?: E2EIdentity): Promise<string> {
  const selectedIdentity = identity ?? (await getE2EIdentities(page)).admin;
  const response = await page.request.post(`${API_BASE}/auth/login`, { data: selectedIdentity });
  if (!response.ok()) {
    throw new Error(`API login failed: ${response.status()} ${response.statusText()}`);
  }
  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new Error('The API login did not return an access token');
  return data.token;
}

export async function loginViaApi(page: Page, identity?: E2EIdentity): Promise<LoginResponse> {
  const selectedIdentity = identity ?? (await getE2EIdentities(page)).admin;
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: selectedIdentity,
    headers: { 'X-Trindade-Client': 'web' },
  });

  if (!response.ok()) {
    const body = await response.json();
    throw new Error(`Login failed: ${body.error || response.statusText()}`);
  }

  const data: LoginResponse = await response.json();

  // The cookie comes back in `Set-Cookie` on that response and lands in the context's jar on its own, so the
  // browser holds the session. Asserting it here turns a silently unauthenticated context into a clear failure
  // at the login, not three screens later.
  // No URL filter: a cookie scoped to `Path=/api/auth` is not returned for `/api`, and asking for it that way
  // reports a missing cookie that the browser actually holds.
  const cookies = await page.context().cookies();
  if (!cookies.some((cookie) => cookie.name === 'trindade_refresh')) {
    throw new Error('Login succeeded but the session cookie was not stored by the browser context');
  }

  // Only the identity is seeded into the page: it is the hint the provider uses to decide that this browser may
  // have a session, and it is not a credential. The token stays in the cookie jar above and nowhere else.
  await page.addInitScript(
    ({ user }) => {
      localStorage.setItem('auth_user', JSON.stringify(user));
    },
    { user: data.user },
  );

  return data;
}

/**
 * Fill all rendered temperature task inputs on a report form.
 * Ensures backend validateTemperatures requirements are satisfied.
 */
export async function fillAllTemperatureInputs(page: Page, defaultValue = '-18'): Promise<void> {
  const tempInputs = page.locator('[data-testid^="temperature-task-"]');
  const count = await tempInputs.count();
  for (let i = 0; i < count; i++) {
    await tempInputs.nth(i).fill(defaultValue);
  }
}

/**
 * Canonical valid temperatures matching reference seed data.
 */
export const VALID_TEMPERATURES = [
  { location: 'Câmara Principal', readingIndex: 1, value: -18 },
  { location: 'Câmara Principal', readingIndex: 2, value: -18 },
  { location: 'Câmara Nhoque', readingIndex: 1, value: -18 },
  { location: 'Câmara Fria 1', readingIndex: 1, value: -18 },
  { location: 'Câmara Fria 2', readingIndex: 1, value: -18 },
];

/**
 * Query active temperature tasks from API and construct complete valid readings.
 */
export async function getActiveTemperatureReadings(
  request: import('@playwright/test').APIRequestContext,
  token: string
): Promise<Array<{ location: string; readingIndex: number; value: number }>> {
  const res = await request.get('http://localhost:3099/api/admin/tasks', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok()) {
    const data = (await res.json()) as {
      tasks: Array<{ id: number; name_pt: string; temperature_readings: number; is_active: number; task_type?: string }>;
    };
    const tempTasks = (data.tasks || []).filter((t) => t.is_active === 1 && t.task_type === 'temperature');
    if (tempTasks.length > 0) {
      return tempTasks.flatMap((t) =>
        Array.from({ length: t.temperature_readings }, (_, i) => ({
          location: t.name_pt,
          readingIndex: i + 1,
          value: -18,
        }))
      );
    }
  }
  return VALID_TEMPERATURES;
}

/**
 * Visit a protected route after logging in via API.
 * Navigates straight to the route; AuthContext renews the session from the cookie on mount.
 */
export async function goToProtected(page: Page, path: string, identity?: E2EIdentity): Promise<void> {
  await loginViaApi(page, identity);
  await page.goto(path);
  // Wait for the app shell to render (not the login redirect)
  await page.waitForSelector('text=Trindade Massas', { timeout: 15000 });
}
