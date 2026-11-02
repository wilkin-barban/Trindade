import { expect, test } from '@playwright/test';
import { IPHONE_UA, getE2EIdentities, loginViaApi } from './auth-helpers';
import { AERO_OWNER, loginAsAeroOwner } from './aero-owner';

/**
 * The company integration, where the plant keeps it now.
 *
 * The address is the plant's, so it ships written and only the account that owns the integration may move
 * it; the credentials belong to whoever holds the phone and stay editable for every worker. This spec reads
 * both halves from the screen, because that is where an operator will look for them.
 */
test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA });

test.describe('integration tab in the admin panel', () => {
  test('the owner finds the plant address already written and may change it', async ({ page }) => {
    await loginAsAeroOwner(page);
    await page.goto('/admin');
    await page.locator('[data-testid="admin-tab-integration"]').click();

    await expect(page.locator('[data-testid="admin-integration-tab"]')).toBeVisible();
    const url = page.locator('[data-testid="aero-ws-url"]');
    await expect(url).toBeVisible();
    await expect(url).toHaveValue('http://192.168.25.250:1453/api');
    await expect(url).toBeEditable();

    // The shortcut recipe and the connection test live here too, at thumb size.
    await expect(page.getByRole('button', { name: /Instalar Atalho no iPhone/ })).toBeVisible();

    // Nothing to create on this tab, and nothing to unfold: the panel is the page.
    await expect(page.getByRole('button', { name: '+ Novo' })).toHaveCount(0);
    await expect(page.locator('[data-testid="admin-integration-tab"] [aria-expanded]')).toHaveCount(0);
    await expect(page.locator('[data-testid="admin-integration-tab"] svg.lucide-chevron-down')).toHaveCount(0);
    // The body is there on arrival, without a tap: the address is already on screen.
    await expect(page.locator('[data-testid="aero-ws-pass"]')).toBeVisible();

    // The button is absent here, not from the panel: the tabs that do create still offer it.
    await page.locator('[data-testid="admin-tab-categories"]').click();
    await expect(page.getByRole('button', { name: '+ Novo' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a worker keeps his own credentials and never the plant address', async ({ page }) => {
    const identities = await getE2EIdentities(page);
    await loginViaApi(page, identities.worker);
    await page.goto('/admin');

    // Every role sees the tab (L2), and the address is readable but locked for all of them but the owner.
    await page.locator('[data-testid="admin-tab-integration"]').click();
    const url = page.locator('[data-testid="aero-ws-url"]');
    await expect(url).toBeVisible();
    await expect(url).toBeDisabled();
    await expect(url).toHaveValue('http://192.168.25.250:1453/api');

    await expect(page.locator('[data-testid="aero-ws-user"]')).toBeEditable();
    await expect(page.locator('[data-testid="aero-ws-pass"]')).toBeEditable();

    // Production no longer carries the technical settings.
    await page.goto('/massas-launch');
    await expect(page.locator('[data-testid="aero-ws-url"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="massas-sync-erp"]')).toHaveCount(0);
  });

  test('the owner account is the only one that can move the address', async ({ page }) => {
    // The rule is the username, not the role: an administrator who is not the owner keeps it locked.
    const identities = await getE2EIdentities(page);
    await loginViaApi(page, identities.admin);
    await page.goto('/admin');
    await page.locator('[data-testid="admin-tab-integration"]').click();
    await expect(page.locator('[data-testid="aero-ws-url"]')).toBeDisabled();

    await loginViaApi(page, AERO_OWNER);
    await page.goto('/admin');
    await page.locator('[data-testid="admin-tab-integration"]').click();
    await expect(page.locator('[data-testid="aero-ws-url"]')).toBeEditable();
  });

  /**
   * The password does not survive the tab, and the screen says so before anyone wonders.
   *
   * It used to sit in `localStorage` in clear. Now the field is emptied by a reload on purpose: the cost of
   * not keeping the company's secret on the device is typing it again when the session opens, and a person who
   * is not told reads that as the app losing the configuration.
   */
  test('saving keeps the password out of the device and a reload asks for it again', async ({ page }) => {
    await loginAsAeroOwner(page);
    await page.goto('/admin');
    await page.locator('[data-testid="admin-tab-integration"]').click();

    const pass = page.locator('[data-testid="aero-ws-pass"]');
    await expect(pass).toHaveValue('');
    // The language of the run is the operator's: the sentence is matched in both.
    await expect(page.locator('[data-testid="aero-pass-notice"]')).toContainText(/no se guarda|não é guardada/);

    // A fresh profile carries no user either: the save needs the address and the user, and the secret is
    // what it deliberately does not keep.
    await page.locator('[data-testid="aero-ws-user"]').fill('wilkin');
    await pass.fill('segredo-do-erp');
    await page.locator('[data-testid="aero-save"]').click();
    await expect(page.getByText(/Configuración guardada|Configuração salva/)).toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem('trindade.aero.integration.v1') ?? '');
    expect(stored).not.toContain('segredo-do-erp');
    expect(stored).toContain('192.168.25.250');

    await page.reload();
    await page.locator('[data-testid="admin-tab-integration"]').click();

    await expect(page.locator('[data-testid="aero-ws-pass"]')).toHaveValue('');
    // Configured, and waiting for the secret: not «sin configurar», which is what it would say if the reload
    // had thrown the address away too.
    await expect(page.locator('[data-testid="aero-state"]')).toContainText(
      /Falta la contraseña de esta sesión|Falta a senha desta sessão/
    );
    await expect(page.locator('[data-testid="aero-ws-url"]')).toHaveValue('http://192.168.25.250:1453/api');
  });
});
