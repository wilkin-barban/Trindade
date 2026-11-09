import { expect, test } from '@playwright/test';
import { AERO_OWNER, loginAsAeroOwner, openErpSession } from './aero-owner';
import { loginViaApi } from './auth-helpers';

/**
 * The tab iOS opens when the shortcut comes back.
 *
 * The defect this file exists for: the ERP password lived in `sessionStorage`, which is per tab. The first tab
 * could read `/movimentoitem`; the tab the shortcut returned to could not, so it asked for the password again.
 * The vault moved the secret to the server, and what a second tab needs is only a ticket. Nothing here runs the
 * real iPhone shortcut: Chromium cannot, and pretending otherwise would be a lie. What is simulated is the one
 * thing the phone decides -- which tab receives the return URL -- and everything after it is the real app.
 */

const PASSWORD = 'senha-cofre-e2e';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

test.use({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA });

function today(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

test.describe('the ERP vault across tabs', () => {
  test('a second tab launches and reads without ever asking for the password again', async ({ page, context }) => {
    await loginAsAeroOwner(page);

    // One save, in the admin panel, with the password typed exactly once.
    await openErpSession(page, PASSWORD);
    await expect(page.locator('[data-testid="aero-state"]')).toContainText(/Configurado|Configurado/i);

    // The browser keeps no copy of it, in either storage, and the legacy session key was purged.
    const storage = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      legacy: sessionStorage.getItem('trindade.aero.session.v1'),
    }));
    expect(JSON.stringify(storage)).not.toContain(PASSWORD);
    expect(storage.legacy).toBeNull();

    // The tab iOS opens: a fresh document of the same context. It shares `localStorage` (the session) but not
    // `sessionStorage`, which is precisely the condition that used to break this.
    const second = await context.newPage();
    await second.goto('/massas-launch');

    const sync = second.locator('[data-testid="massas-sync-erp"]');
    await expect(sync).toBeEnabled();
    await expect(second.getByText(/no está guardada en el servidor|não está guardada no servidor/)).toHaveCount(0);

    // It asks the server for a ticket. A request that carried an `Authorization` would mean the page still holds
    // the secret, so its absence is the assertion, not a detail.
    const ticketResponse = second.waitForResponse(
      (response) => response.url().includes('/bridge-tickets') && response.request().method() === 'POST',
    );
    await sync.click().catch(() => undefined);
    const issued = await ticketResponse;
    expect(issued.status()).toBe(201);
    // The app's own session token is expected; what must never appear is the ERP credential.
    const authorization = issued.request().headers()['authorization'] ?? '';
    expect(authorization.startsWith('Bearer ')).toBe(true);
    expect(authorization).not.toContain('Basic ');
    const ticketBody = issued.request().postDataJSON() as { action?: string };
    expect(ticketBody.action).toBe('movimentos');
    expect(JSON.stringify(ticketBody)).not.toContain(PASSWORD);

    // The callback the shortcut would return, received in that same second tab, still reaches the mirror: the
    // read needs the ticket the server already spent, never the password.
    const date = today();
    const answer = JSON.stringify({
      success: true,
      data: [
        {
          ENT_LAN: 88123,
          PRO_COD: '001192',
          PRO_DES: 'MASSA QUADRADA',
          PRO_QTD: 90,
          ENT_DTA: date,
          ENT_USU: 'WILKIN',
          ENTSAI: 'E',
        },
      ],
    });

    const mirrored = second.waitForResponse(
      (response) =>
        response.url().endsWith('/api/integration/aero/movements') && response.request().method() === 'POST',
    );
    await second.goto(`/massas-launch?aero_action=movimentos&aero_data=${encodeURIComponent(answer)}`);
    expect((await mirrored).status()).toBe(201);

    await expect(second.getByText(/no está guardada en el servidor|não está guardada no servidor/)).toHaveCount(0);
    const stillNoSecret = await second.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(stillNoSecret).not.toContain(PASSWORD);
  });

  test('a new session reuses the vault instead of emptying it', async ({ page }) => {
    await loginAsAeroOwner(page);
    await openErpSession(page, PASSWORD);

    // Signing in again is a new session with a new token and no session password: the vault is the only thing
    // that can answer, and it must still be configured.
    await loginViaApi(page, AERO_OWNER);
    await page.goto('/admin');
    await page.locator('[data-testid="admin-tab-integration"]').click();

    await expect(page.locator('[data-testid="aero-state"]')).toContainText(/Configurado/i);
    await expect(page.getByText(/guardada en el servidor|guardada no servidor/i).first()).toBeVisible();
    await expect(page.locator('[data-testid="aero-ws-pass"]')).toHaveValue('');
  });
});
