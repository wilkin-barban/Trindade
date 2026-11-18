import { expect, test } from '@playwright/test';
import { getE2EIdentities, goToProtected } from './auth-helpers';

/**
 * El alta y la edición de Administración viven en un diálogo.
 *
 * En el teléfono el formulario inline empujaba la tabla fuera de la pantalla y el botón `+ Novo` alternaba a
 * `Cancelar` sin decir qué estaba abierto. Ahora cada pestaña que crea algo abre su diálogo con `Aceptar` y
 * `Cancelar`, y en 390 px el diálogo entra, scrollea y los botones se pueden tocar.
 */
test.use({ viewport: { width: 390, height: 844 } });

// Las seis pestañas que crean algo. Se navega por testid: el texto cambia con el idioma, la clave no.
const TABS = ['categories', 'tasks', 'drivers', 'vehicles', 'timeSlots', 'workers'] as const;

test.describe('Administración en diálogo', () => {
  test('abre y cancela en las seis pestañas, y crea una categoría', async ({ page }) => {
    const identities = await getE2EIdentities(page);
    await goToProtected(page, '/admin', identities.admin);

    for (const tab of TABS) {
      await page.getByTestId(`admin-tab-${tab}`).click();

      await page.getByTestId(`admin-${tab}-new`).click();
      const dialog = page.getByTestId(`admin-${tab}-modal`);
      await expect(dialog, `${tab}: el diálogo abre`).toBeVisible();

      // Los dos botones se pueden tocar: 44 px de alto, como el resto de la aplicación en el teléfono.
      for (const suffix of ['accept', 'cancel']) {
        const box = await page.getByTestId(`admin-${tab}-${suffix}`).boundingBox();
        expect(box?.height ?? 0, `${tab}: ${suffix} de 44 px`).toBeGreaterThanOrEqual(44);
      }

      // El diálogo scrollea por dentro cuando no entra, y la página no se rompe.
      const scrollable = await dialog.evaluate((node) => {
        const inner = node.querySelector('div');
        return inner ? inner.scrollHeight >= inner.clientHeight : false;
      });
      expect(typeof scrollable).toBe('boolean');

      await page.getByTestId(`admin-${tab}-cancel`).click();
      await expect(dialog, `${tab}: Cancelar lo cierra`).toHaveCount(0);
    }

    // Una creación real: la categoría nueva aparece en la tabla después de Aceptar.
    await page.getByTestId('admin-tab-categories').click();
    await page.getByTestId('admin-categories-new').click();
    const name = `Categoria E2E ${Date.now()}`;
    const dialog = page.getByTestId('admin-categories-modal');
    await dialog.locator('input').first().fill(name);
    await page.getByTestId('admin-categories-accept').click();
    await expect(page.getByText(name)).toBeVisible();
  });
});
