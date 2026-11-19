import { expect, test } from '@playwright/test';
import { apiToken, fillAllTemperatureInputs, getE2EIdentities, goToProtected, openSavedReportView } from './auth-helpers';

const API_BASE = 'http://localhost:3099/api';

/** Un día ya pasado: el historial lo lista y el editor de hoy no lo ve, así que no ensucia esa grilla. */
function pastDay(): string {
  const yesterday = new Date(Date.now() - 86_400_000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(yesterday);
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
  test('el enlace del historial de cargamento abre la tarjeta del día, sin Editar', async ({ page }) => {
    const identities = await getE2EIdentities(page);

    // La URL que arma el ojo del historial, abierta tal cual: la tarjeta del día como vista de solo lectura.
    const date = pastDay();
    await goToProtected(page, `/loading?share=1&date=${date}&from=history`, identities.admin);

    await expect(page.getByTestId('loading-share-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('loading-share-back')).toBeVisible();
    await expect(page.getByTestId('loading-share-text')).toBeVisible();
    await expect(page.getByTestId('loading-share-edit')).toHaveCount(0);

    // Volver regresa al historial del módulo.
    await page.getByTestId('loading-share-back').click();
    await expect(page).toHaveURL(/\/loading\/history$/);
  });

  test('el historial de reportes abre la tarjeta del reporte, con Editar si es de hoy', async ({ page }) => {
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

    // El reporte que este test creó se borra al final: el historial es compartido y otro spec lee el día.
    const created = Number(new URL(page.url()).pathname.split('/').pop());

    await goToProtected(page, '/loading/reports-history', identities.admin);
    const summary = page.locator(`a[href="/reports/${created}?share=1"]`).first();
    await expect(summary).toBeVisible({ timeout: 15000 });
    await summary.click();

    await expect(page).toHaveURL(/\/reports\/\d+\?share=1/);
    await expect(page.getByTestId('report-share-back')).toBeVisible();
    await expect(page.getByTestId('report-share-text')).toBeVisible();
    // El reporte es de hoy y lo creó este administrador: la directiva pide Editar para dueño o admin en el día,
    // y el pasado sigue sin ofrecerlo.
    await expect(page.getByTestId('report-share-edit')).toBeVisible();

    await page.getByTestId('report-share-back').click();
    await expect(page).toHaveURL(/\/loading\/reports-history$/);

    const token = await apiToken(page, identities.admin);
    await page.request.delete(`${API_BASE}/reports/${created}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});
