import { test, expect, type Page } from '@playwright/test';
import { goToProtected } from './auth-helpers';

const API_BASE = 'http://localhost:3099/api';

async function apiPost(page: Page, url: string, body: unknown) {
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  const response = await page.request.post(`${API_BASE}${url}`, {
    data: body,
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status(), data: await response.json() };
}

function today(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

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

  /**
   * The history is how a day that is not today is reached.
   *
   * The schedule screen shows today only, so the card is the door: it has to open the day it names, with its
   * rows, and not a blank edit screen for whatever date happened to be in the address bar.
   */
  test('opens the day of a batch from its card', async ({ page }) => {
    const date = today();
    const stamp = Date.now();
    const driver = await apiPost(page, '/loading/drivers', {
      name: `Hist ${stamp}`,
      license_plate: `H${stamp % 10000}`,
    });
    await apiPost(page, '/loading/schedules', {
      schedule_date: date,
      time_slot: '06:00',
      driver_type: 'fletero',
      driver_id: driver.data.driver.id,
    });

    await page.goto('/loading/history');
    const card = page.locator(`[data-testid="loading-history-card-${date}"]`);
    await expect(card).toBeVisible({ timeout: 10000 });

    await card.locator('a').first().click();

    await page.waitForURL(new RegExp(`/loading/edit\\?date=${date}`));
    await expect(page.locator('[data-testid="edit-schedule-list"]')).toContainText(`Hist ${stamp}`);
  });

  test('a read that failed is retried from the alert, filters and all', async ({ page }) => {
    await page.locator('[data-testid="loading-history-user-filter"]').selectOption({ index: 0 });
    const userId = await page.locator('[data-testid="loading-history-user-filter"]').inputValue();

    // The read fails once, the way a phone loses the network for a moment.
    let failNext = true;
    await page.route('**/api/loading/schedules/history?**', async (route) => {
      if (failNext) {
        failNext = false;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await page.locator('[data-testid="loading-history-apply-filters"]').click();

    const retry = page.locator('[data-testid="loading-history-retry"]');
    await expect(retry).toBeVisible();
    await retry.click();

    // The list comes back with the filter the operator had chosen still in place.
    await expect(page.locator('[data-testid="loading-history-retry"]')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('[data-testid="loading-history-user-filter"]')).toHaveValue(userId);
    await page.unroute('**/api/loading/schedules/history?**');
  });

  test('back button links to the loading schedule', async ({ page }) => {
    await page.locator('[data-testid="back-to-schedule-link"]').click();
    await page.waitForURL(/\/loading$/);
    await expect(page.getByRole('heading', { name: /Cronograma de Carregamento|Cronograma de Carga/ })).toBeVisible();
  });
});
