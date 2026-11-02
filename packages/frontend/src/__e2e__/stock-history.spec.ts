import { expect, test, type Page } from '@playwright/test';
import { getE2EIdentities, goToProtected } from './auth-helpers';

/**
 * The counting history reads a day from a panel and from the days that were counted, on a phone and on a
 * desktop.
 *
 * The spec writes one count for today through the counter's own API -- the only day whose numbers can still
 * change -- so the chip row has something real to list. Two gestures are asserted, because they are the two
 * the screen is: the panel opens the native calendar when it is pressed, and a chip moves the summary to its
 * day without opening anything.
 */
const API_BASE = 'http://localhost:3099/api';

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const identities = await getE2EIdentities(page);
  const login = await page.request.post(`${API_BASE}/auth/login`, { data: identities.admin });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json();
  return { Authorization: `Bearer ${token}` };
}

test.describe('Stock history days', () => {
  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 800 },
  ] as const) {
    test(`the day panel and the counted days read a day on a ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const headers = await authHeaders(page);
      const today = await page.evaluate(() =>
        new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
      );
      const todayView = await page.request.get(`${API_BASE}/stock?date=${today}`, { headers });
      expect(todayView.ok()).toBeTruthy();
      const product = (await todayView.json()).products[0];
      const counted = await page.request.post(`${API_BASE}/stock/add-entry`, {
        headers,
        data: { date: today, product_code: product.code, boxes_added: 2 },
      });
      expect(counted.ok()).toBeTruthy();

      // The native picker is a platform popup nothing here can see or close; what is asserted is the call
      // that opens it, made by a click on the panel and not only on the date text inside it.
      await page.addInitScript(() => {
        const calls = { count: 0 };
        (window as unknown as { __stockPickerCalls: { count: number } }).__stockPickerCalls = calls;
        HTMLInputElement.prototype.showPicker = function showPicker() {
          calls.count += 1;
        };
      });

      await goToProtected(page, '/stock-history');

      const chip = page.getByTestId(`stock-history-day-${today}`);
      await expect(chip).toBeVisible();
      await expect(chip).toContainText('·');

      await page.getByTestId('stock-history-date').locator('..').click();
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as unknown as { __stockPickerCalls: { count: number } }).__stockPickerCalls.count,
          ),
        )
        .toBeGreaterThan(0);

      await chip.click();
      await expect(chip).toBeDisabled();
      await expect(page.getByTestId('stock-history-total')).toBeVisible();
    });
  }
});
