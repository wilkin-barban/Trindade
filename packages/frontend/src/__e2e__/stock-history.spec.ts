import { expect, test, type Page } from '@playwright/test';
import { getE2EIdentities, goToProtected } from './auth-helpers';

/**
 * The counting history reads a day from a panel and from the days that were counted, on a phone and on a
 * desktop.
 *
 * The spec writes one count for today through the counter's own API -- the only day whose numbers can still
 * change -- and then asserts the line the archive draws: today is not offered as a chip, because a day still
 * being counted belongs to the counter. Three gestures are asserted, because they are the three the screen
 * is: the panel opens the native calendar when it is pressed, a past chip moves the summary to its day
 * without opening anything, and the chip row never lists today.
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

      // Today is the counter's business: the archive lists only days before it, even when today has counts.
      await expect(page.getByTestId('stock-history-total')).toBeVisible();
      await expect(page.getByTestId(`stock-history-day-${today}`)).toHaveCount(0);

      await page.getByTestId('stock-history-date').locator('..').click();
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as unknown as { __stockPickerCalls: { count: number } }).__stockPickerCalls.count,
          ),
        )
        .toBeGreaterThan(0);

      const pastChips = page.locator('[data-testid^="stock-history-day-"]');
      const chipCount = await pastChips.count();
      for (let index = 0; index < chipCount; index += 1) {
        const testId = await pastChips.nth(index).getAttribute('data-testid');
        expect(testId!.replace('stock-history-day-', '') < today).toBe(true);
      }
      if (chipCount > 0) {
        const chip = pastChips.first();
        await expect(chip).toContainText('·');
        await chip.click();
        await expect(chip).toBeDisabled();
        await expect(page.getByTestId('stock-history-total')).toBeVisible();
      }
    });
  }
});
