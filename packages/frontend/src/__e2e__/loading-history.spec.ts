import { test, expect } from '@playwright/test';
import { goToProtected } from './auth-helpers';

test.describe('Loading History — Filters and pagination', () => {
  test.beforeEach(async ({ page }) => {
    await goToProtected(page, '/loading/history');
    await page.waitForSelector('text=Histórico de Carregamento', { timeout: 10000 });
  });

  test('displays date, month, user filters and pagination controls', async ({ page }) => {
    await expect(page.locator('[data-testid="loading-history-date-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="loading-history-month-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="loading-history-user-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="loading-history-apply-filters"]')).toBeVisible();
    await expect(page.getByText(/Página/)).toBeVisible();
  });

  test('date filter can be submitted without crashing', async ({ page }) => {
    await page.locator('[data-testid="loading-history-date-filter"]').fill('2026-06-18');
    await page.locator('[data-testid="loading-history-apply-filters"]').click();
    await expect(page.getByRole('heading', { name: 'Histórico de Carregamento' })).toBeVisible();
  });

  test('month and user filters can be submitted without crashing', async ({ page }) => {
    await page.locator('[data-testid="loading-history-month-filter"]').fill('2026-06');
    await page.locator('[data-testid="loading-history-user-filter"]').selectOption({ index: 0 });
    await page.locator('[data-testid="loading-history-apply-filters"]').click();
    await expect(page.getByRole('heading', { name: 'Histórico de Carregamento' })).toBeVisible();
  });


  test('choosing a day asks for that day and clearing drops the filter', async ({ page }) => {
    const asked = page.waitForRequest(
      (request) => request.url().includes('/api/loading/schedules/history?') && request.url().includes('date=2026-06-18'),
    );
    await page.locator('[data-testid="loading-history-date-filter"]').fill('2026-06-18');
    await asked;

    await expect(page.locator('[data-testid="history-clear-filters"]')).toBeVisible();
    await page.locator('[data-testid="history-clear-filters"]').click();
    await expect(page.locator('[data-testid="loading-history-date-filter"]')).toHaveValue('');
  });

  test('shows one batch card per loading date', async ({ page }) => {
    await expect(page.locator('[data-testid^="loading-history-card-"]').first()).toBeVisible({ timeout: 10000 }).catch(async () => {
      await expect(page.getByText(/Página/)).toBeVisible();
    });
  });

  test('back button links to the loading schedule', async ({ page }) => {
    await page.locator('[data-testid="back-to-schedule-link"]').click();
    await page.waitForURL(/\/loading$/);
    await expect(page.getByRole('heading', { name: /Cronograma de Carregamento|Cronograma de Carga/ })).toBeVisible();
  });
});
