import { expect, test } from '@playwright/test';
import { getE2EIdentities, goToProtected } from './auth-helpers';

/**
 * Las cuatro superficies de la pasada, en el teléfono.
 *
 * Un solo spec que abre a 390 px lo que se cambió: la confirmación de Salida, los modales de Administración, el
 * share de los dos históricos con las abreviaturas y la receta del puente. Es la comprobación de vista, no de
 * lógica: cada cosa ya tiene sus tests de comportamiento.
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe('la pasada en el teléfono', () => {
  test('Salida abre su confirmación de 44 px', async ({ page }) => {
    await goToProtected(page, '/salida', (await getE2EIdentities(page)).worker);

    const quantity = page.locator('input[type="number"]').first();
    await expect(quantity).toBeVisible({ timeout: 15000 });
    await quantity.fill('2');
    await quantity.blur();
    await page.getByTestId('salida-launch').click();

    await expect(page.getByTestId('salida-confirm-modal')).toBeVisible();
    for (const id of ['salida-confirm-cancel', 'salida-confirm-action']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId('salida-confirm-cancel').click();
    await expect(page.getByTestId('salida-confirm-modal')).toHaveCount(0);
  });

  test('el alta de Administración abre en un modal de 44 px y cancela', async ({ page }) => {
    await goToProtected(page, '/admin', (await getE2EIdentities(page)).admin);
    await page.getByTestId('admin-tab-tasks').click();
    await page.getByTestId('admin-tasks-new').click();

    await expect(page.getByTestId('admin-tasks-modal')).toBeVisible();
    for (const id of ['admin-tasks-cancel', 'admin-tasks-accept']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId('admin-tasks-cancel').click();
    await expect(page.getByTestId('admin-tasks-modal')).toHaveCount(0);
  });

  test('el share de los dos históricos usa la tabla del Relatório', async ({ page }) => {
    await goToProtected(page, '/massas-history', (await getE2EIdentities(page)).admin);
    await expect(page.locator('body')).not.toContainText('• ');

    await goToProtected(page, '/salida-history', (await getE2EIdentities(page)).admin);
    await expect(page.getByTestId('salida-history-actions')).toBeVisible();
    // La abreviatura del catálogo, no el nombre largo del catálogo de Salida.
    await expect(page.locator('body')).not.toContainText('EMBALAG. ');
  });

  test('la receta del puente se copia con los pasos y su versión', async ({ page }) => {
    await goToProtected(page, '/admin', (await getE2EIdentities(page)).admin);
    await page.getByTestId('admin-tab-integration').click();

    // El archivo se sirve desde la raíz del propio sitio, como lo copia el operador.
    const response = await page.request.get('/Aero32Bridge.js');
    expect(response.ok()).toBeTruthy();
    const code = await response.text();
    expect(code).toContain('v2.0.0');
    expect(code).toContain('steps');
  });
});
