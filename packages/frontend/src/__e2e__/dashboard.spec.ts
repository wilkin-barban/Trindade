import { test, expect } from '@playwright/test';
import { goToProtected } from './auth-helpers';

/**
 * The dashboard the operator reads, on a phone and on a desk: same six cards, same summary panel.
 *
 * Two widths, because the grid is what changes between them and a card that overflows at 390 is a card the
 * operator cannot reach with a thumb.
 */
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`Dashboard — ${viewport.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await goToProtected(page, '/dashboard');
      await page.waitForSelector('[data-testid="dashboard-summary"]', { timeout: 15000 });
    });

    test('shows the six cards and the summary panel', async ({ page }) => {
      const cards = page.locator('[data-testid^="dashboard-card-"]');
      await expect(cards).toHaveCount(6);
      await expect(page.getByTestId('dashboard-card-share-app')).toBeVisible();
      await expect(page.getByTestId('dashboard-summary')).toBeVisible();
      await expect(page.getByTestId('dashboard-summary-higiene')).toContainText('/');
      await expect(page.getByTestId('dashboard-summary-recepcion')).toContainText('/');
      await expect(page.getByText('Historial de conteo')).toHaveCount(0);
    });

    test('the masas card opens each of its two doors', async ({ page }) => {
      const card = page.getByTestId('dashboard-card-massas');
      await expect(card.locator('a a')).toHaveCount(0);

      await card.getByTestId('dashboard-massas-history').click();
      await page.waitForURL(/\/massas-history/);
    });

    test('nothing overflows the screen sideways', async ({ page }) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
