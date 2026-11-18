import { expect, test } from '@playwright/test';
import { getE2EIdentities, goToProtected } from './auth-helpers';

/**
 * La baixa ya no es una beta: cualquier cuenta con sesión la ve y entra.
 *
 * Lo que se comprueba acá es lo que el dueño aprobó: el menú dibuja los dos ítems para un trabajador que no es
 * `wilkin`, las dos rutas abren, y el lanzamiento sigue preguntando antes de salir. La vista es la del teléfono,
 * porque es donde se usa.
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe('Salida para todos los roles', () => {
  test('un trabajador ve el menú, abre las dos rutas y la confirmación de lanzamiento', async ({ page }) => {
    const identities = await getE2EIdentities(page);
    await goToProtected(page, '/dashboard', identities.worker);
    expect(identities.worker.username).not.toBe('wilkin');

    // El menú del teléfono: se abre con el botón de la barra y muestra los dos ítems.
    await page.getByRole('button', { name: /Abrir men/ }).click();
    await expect(page.locator('a[href="/salida"]').first()).toBeVisible();
    await expect(page.locator('a[href="/salida-history"]').first()).toBeVisible();

    // La ruta de lanzamiento abre para el trabajador, no lo manda al tablero.
    await page.goto('/salida');
    await expect(page).toHaveURL(/\/salida$/);
    const quantity = page.locator('input[type="number"]').first();
    await expect(quantity).toBeVisible({ timeout: 15000 });

    await quantity.fill('2');
    await quantity.blur();
    await page.getByTestId('salida-launch').click();

    // El diálogo de confirmación es el mismo: productos, total y dos botones de 44 px.
    const dialog = page.getByTestId('salida-confirm-modal');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('salida-confirm-total')).toContainText('2 un');
    for (const testId of ['salida-confirm-cancel', 'salida-confirm-action']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    // Cancelar no lanza nada y deja la pantalla como estaba.
    await page.getByTestId('salida-confirm-cancel').click();
    await expect(dialog).toHaveCount(0);

    // El histórico también abre, y ya no ofrece `Conferir no ERP`.
    await page.goto('/salida-history');
    await expect(page).toHaveURL(/\/salida-history$/);
    await expect(page.getByTestId('salida-check-erp')).toHaveCount(0);
    await expect(page.getByTestId('salida-history-actions')).toBeVisible();
  });
});
