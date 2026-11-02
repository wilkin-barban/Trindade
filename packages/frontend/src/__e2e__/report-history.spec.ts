import { test, expect } from '@playwright/test';
import { goToProtected } from './auth-helpers';

test.describe('Report History — Filters and pagination', () => {
  test.beforeEach(async ({ page }) => {
    await goToProtected(page, '/loading/reports-history');
    await page.waitForSelector('text=Histórico de Relatórios', { timeout: 10000 });
  });

  test('displays date, month, user filters and pagination controls', async ({ page }) => {
    await expect(page.locator('[data-testid="history-date-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="history-month-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="history-user-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="history-apply-filters"]')).toBeVisible();
    await expect(page.getByText(/Página/)).toBeVisible();
  });

  test('choosing a day asks for that day without pressing Filtrar', async ({ page }) => {
    const asked = page.waitForRequest((request) => request.url().includes('/api/reports/history?') && request.url().includes('date=2026-06-18'));
    await page.locator('[data-testid="history-date-filter"]').fill('2026-06-18');
    await asked;
    await expect(page.locator('[data-testid="history-clear-filters"]')).toBeVisible();

    await page.locator('[data-testid="history-clear-filters"]').click();
    await expect(page.locator('[data-testid="history-date-filter"]')).toHaveValue('');
    await expect(page.locator('[data-testid="history-clear-filters"]')).toHaveCount(0);
  });

  test('the day cannot be a day that has not happened yet', async ({ page }) => {
    const today = await page.evaluate(() =>
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    );
    await expect(page.locator('[data-testid="history-date-filter"]')).toHaveAttribute('max', today);
  });

  test('date filter can be submitted without crashing', async ({ page }) => {
    await page.locator('[data-testid="history-date-filter"]').fill('2026-06-18');
    await page.locator('[data-testid="history-apply-filters"]').click();
    await expect(page.getByRole('heading', { name: 'Histórico de Relatórios' })).toBeVisible();
  });

  test('month and user filters can be submitted without crashing', async ({ page }) => {
    await page.locator('[data-testid="history-month-filter"]').fill('2026-06');
    await page.locator('[data-testid="history-user-filter"]').selectOption({ index: 0 });
    await page.locator('[data-testid="history-apply-filters"]').click();
    await expect(page.getByRole('heading', { name: 'Histórico de Relatórios' })).toBeVisible();
  });

  test('old /reports/history route redirects to the loading section history route', async ({ page }) => {
    await goToProtected(page, '/reports/history');
    await expect(page).toHaveURL(/\/loading\/reports-history/);
  });

  test('new report button links to builder', async ({ page }) => {
    const newReportLink = page.locator('[data-testid="history-new-report-btn"]');
    await expect(newReportLink).toBeVisible();
    await newReportLink.click();
    await page.waitForSelector('[data-testid="report-builder-form"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="report-builder-form"]')).toBeVisible();
  });
});
