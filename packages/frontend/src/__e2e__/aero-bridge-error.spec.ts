import { expect, test } from '@playwright/test';
import { IPHONE_UA } from './auth-helpers';
import { loginAsAeroOwner, saveAeroVault } from './aero-owner';

/**
 * What the operator sees when the phone comes back without the plant.
 *
 * Scriptable cannot read the Wi-Fi name, so it proves reachability by posting to the ERP. When that fails it
 * returns `aero_error=wifi_required` instead of a half-filled answer, and the page has to say what happened,
 * keep the work that is still pending, and leave nothing spinning.
 */
test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA });

const MESSAGE =
  'No se pudo alcanzar el ERP. Verificá que el iPhone esté en la Wi-Fi Trindade Expedicao y que la red de la fábrica esté disponible.';

test('a bridge that cannot reach the plant explains itself instead of leaving the screen sending', async ({ page }) => {
  await loginAsAeroOwner(page);
  // El cofre es estado del servidor y esta prueba necesita el puente listo para poder comprobar que la
  // pantalla no queda bloqueada después del error.
  await saveAeroVault(page, { wsUrl: 'http://192.168.25.250:1453/api', username: 'wilkin', password: 'senha-e2e' });

  await page.goto(`/massas-launch?aero_error=wifi_required&aero_msg=${encodeURIComponent(MESSAGE)}`);

  const dialog = page.locator('[data-testid="massa-result-modal"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/No se pudo alcanzar el ERP|Não foi possível alcançar o ERP/);
  await expect(dialog).toContainText(/Trindade Expedicao/);

  // El callback se consume una sola vez: la query queda limpia y el aviso no reaparece al recargar.
  await expect(page).not.toHaveURL(/aero_error/);

  const close = page.getByRole('button', { name: /^(Cerrar|Fechar)$/ }).last();
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(dialog).toHaveCount(0);

  // Nada quedó bloqueado: la sincronización vuelve a estar disponible para reintentar.
  await expect(page.locator('[data-testid="massas-sync-erp"]')).toBeEnabled();

  await page.reload();
  await expect(page.locator('[data-testid="massa-result-modal"]')).toHaveCount(0);
});
