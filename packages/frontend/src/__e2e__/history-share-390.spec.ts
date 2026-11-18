import { expect, test, type Page } from '@playwright/test';
import { apiToken, fillAllTemperatureInputs, getE2EIdentities, goToProtected, openSavedReportView } from './auth-helpers';

const API_BASE = 'http://localhost:3099/api';

async function apiPost(page: Page, url: string, body: unknown) {
  const token = await apiToken(page);
  const response = await page.request.post(`${API_BASE}${url}`, {
    data: body,
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status(), data: await response.json() };
}

function today(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/**
 * Los dos históricos abren su tarjeta de compartir, en el teléfono.
 *
 * El ojo del historial de cargamento y cualquier enlace del historial de reportes llevan a la misma tarjeta que el
 * guardado del módulo: el texto que se manda, sin Editar y con la vuelta al historial. La lectura de formulario
 * queda donde estaba, para quien la pide por su propia URL.
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe('los históricos abren la tarjeta de compartir', () => {
  test('el historial de cargamento abre la tarjeta del día, sin Editar', async ({ page }) => {
    const identities = await getE2EIdentities(page);

    // El historial lista días con carga: se siembra una para que el ojo exista.
    const date = today();
    const driver = await apiPost(page, '/loading/drivers', {
      name: `Share Back ${Date.now()}`,
      license_plate: 'SBK-1',
    });
    await apiPost(page, '/loading/schedules', {
      schedule_date: date,
      time_slot: '04:00',
      driver_type: 'fletero',
      driver_id: driver.data?.driver?.id,
    });

    await goToProtected(page, '/loading/history', identities.admin);

    const eye = page.locator(`[data-testid="view-loading-batch-${date}"]`);
    await expect(eye).toBeVisible({ timeout: 15000 });
    await eye.click();

    // La URL dice de dónde vino y la tarjeta contesta como vista de solo lectura.
    await expect(page).toHaveURL(/\/loading\?share=1&date=\d{4}-\d{2}-\d{2}&from=history/);
    await expect(page.getByTestId('loading-share-back')).toBeVisible();
    await expect(page.getByTestId('loading-share-text')).toBeVisible();
    await expect(page.getByTestId('loading-share-edit')).toHaveCount(0);

    // Volver regresa al historial.
    await page.getByTestId('loading-share-back').click();
    await expect(page).toHaveURL(/\/loading\/history$/);
  });

  test('el historial de reportes abre la tarjeta del reporte, sin Editar', async ({ page }) => {
    const identities = await getE2EIdentities(page);
    await goToProtected(page, '/loading/reports-history', identities.admin);

    // Un reporte guardado para que el historial tenga una tarjeta: el mismo camino que usa el operador.
    await goToProtected(page, '/reports', identities.admin);
    await page.waitForSelector('[data-testid="report-builder-form"]', { timeout: 15000 });
    await page.locator('[data-testid="check-task-1"]').check();
    await fillAllTemperatureInputs(page);
    await page.locator('[data-testid="submit-report-btn"]').click();
    await openSavedReportView(page);
    await page.waitForSelector('[data-testid="report-detail"]', { timeout: 15000 });

    await goToProtected(page, '/loading/reports-history', identities.admin);
    const summary = page.locator('a[href^="/reports/"][href*="?share=1"]').first();
    await expect(summary).toBeVisible({ timeout: 15000 });
    await summary.click();

    await expect(page).toHaveURL(/\/reports\/\d+\?share=1/);
    await expect(page.getByTestId('report-share-back')).toBeVisible();
    await expect(page.getByTestId('report-share-text')).toBeVisible();
    await expect(page.getByTestId('report-share-edit')).toHaveCount(0);

    await page.getByTestId('report-share-back').click();
    await expect(page).toHaveURL(/\/loading\/reports-history$/);
  });
});
