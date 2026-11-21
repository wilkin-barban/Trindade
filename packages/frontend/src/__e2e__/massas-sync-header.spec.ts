import { expect, test } from '@playwright/test';
import { loginAsAeroOwner } from './aero-owner';

/**
 * The header's sync action, at the width the plant holds it.
 *
 * The shortcut itself cannot run in a browser, so what is testable here is the part the operator relies on
 * before pressing anything: the button exists where the day is chosen, it is thumb-sized, and the hour under
 * it says when this day last came back from Delphi instead of looking like a fresh read forever.
 */
const API = 'http://localhost:3099/api';

/** The plant's day, not the browser's: the server closes on São Paulo's clock. */
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

test.use({ viewport: { width: 375, height: 667 } });

test.describe('sync in the history', () => {
  test('offers the sync next to the day and shows the hour the ERP last answered', async ({ page }) => {
    // The integration belongs to the owner admin, so this is the identity that has the button at all.
    await loginAsAeroOwner(page);
    const login = await page.request.post(`${API}/auth/login`, {
      data: { username: 'wilkin', password: 'wilkin-result-dialogs-2026' },
    });
    const token = (await login.json()).token as string;

    // The sync lives in the history now: it reads the day, and the day is what the history owns.
    await page.goto('/massas-history');
    const date = today();
    await page.locator('[data-testid="massas-history-date"]').fill(date);
    await expect(page.locator('[data-testid="massas-history-date"]')).toHaveValue(date);

    const sync = page.locator('[data-testid="massas-sync-erp"]');
    await expect(sync).toBeVisible();
    await expect(sync).toContainText('Sincronizar');
    expect((await sync.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    const lastSync = page.locator('[data-testid="massas-last-sync"]');
    await expect(lastSync).toBeVisible();
    // The e2e suite shares one server and one plant day, so another spec may already have left a
    // snapshot here. What this header must never do is show a time it did not receive; a real hour is
    // as valid as the em dash when the shared day was seeded before this spec ran.
    await expect(lastSync).toContainText(/—|\d{2}:\d{2}/);

    // The phone brings the answer back and the page stores it; seeding it is the same call.
    const seeded = await page.request.post(`${API}/integration/aero/movements`, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        date,
        movements: [
          {
            ent_lan: 10777,
            product_code: '001192',
            product_desc: 'MASSA QUADRADA',
            quantity: 90,
            entry_date: date,
            operator_name: 'WILKIN',
            movement_type: 'E',
          },
        ],
      },
    });
    expect(seeded.status()).toBe(201);

    // The mirror line lives in the history, next to the sync it belongs to.
    await page.goto('/massas-history');
    await page.locator('[data-testid="massas-history-date"]').fill(date);
    await expect(page.locator('[data-testid="massas-last-sync"]')).toContainText(/\d{2}:\d{2}/);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  /**
   * A closed day keeps its mirror, not its button.
   *
   * Yesterday is already recorded and the API refuses to reopen it, so offering "Sincronizar com ERP" there
   * would promise a write that comes back as 409. The row disappears with the button: an action that cannot
   * run is not explained by dimming it, it is simply not offered.
   */
  test('the sync action is not offered on a past day', async ({ page }) => {
    await loginAsAeroOwner(page);
    await page.goto('/massas-history');

    const yesterday = new Date(`${today()}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const past = yesterday.toISOString().slice(0, 10);

    await page.locator('[data-testid="massas-history-date"]').fill(past);
    await expect(page.locator('[data-testid="massas-history-date"]')).toHaveValue(past);

    await expect(page.locator('[data-testid="massas-sync-erp"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="massas-sync-header"]')).toHaveCount(0);

    // The selected past day remains visible even though synchronization is not offered.
    await expect(page.locator('[data-testid="massas-history-date"]')).toHaveValue(past);
  });
});
