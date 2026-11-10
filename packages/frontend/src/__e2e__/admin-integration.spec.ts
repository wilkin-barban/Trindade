import { expect, test } from '@playwright/test';
import { IPHONE_UA, getE2EIdentities, loginViaApi } from './auth-helpers';
import { AERO_OWNER, loginAeroOwnerForApi, resetAeroVault } from './aero-owner';

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
    // The vault is one row in the server, shared by the whole run: «already written» means an empty vault
    // where the panel starts from the plant's own default.
    await resetAeroVault(page);
    await page.goto('/admin');
    await page.locator('[data-testid="admin-tab-integration"]').click();

    await expect(page.locator('[data-testid="admin-integration-tab"]')).toBeVisible();
    const url = page.locator('[data-testid="aero-ws-url"]');
    await expect(url).toBeVisible();
    await expect(url).toHaveValue('http://192.168.25.250:1453/api');
    await expect(url).toBeEditable();

    // The shortcut recipe and the connection test live here too, at thumb size.
    await expect(page.getByRole('button', { name: /Cómo instalar Scriptable|Como instalar o Scriptable/ })).toBeVisible();

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
   * The password leaves the browser on save and the vault is the only place that keeps it.
   *
   * It used to sit in `localStorage` in clear, next to the IP of the plant: any backup of the profile or the
   * next launch of the app could read the company's credentials, and moving it to `sessionStorage` only hid it
   * from the disk. It now goes to the server encrypted, no endpoint returns it, and the browser keeps neither
   * the secret nor the ciphertext. What the screen shows is the fact: configured, saved on the server, and an
   * empty field that asks for a new secret and never redraws the stored one.
   */
  test('saving keeps the password out of the device and in the server vault', async ({ page }) => {
    await resetAeroVault(page);
    await page.goto('/admin');
    await page.locator('[data-testid="admin-tab-integration"]').click();

    const pass = page.locator('[data-testid="aero-ws-pass"]');
    await expect(pass).toHaveValue('');
    // Nothing stored yet, and the panel says so instead of implying the app lost something.
    await expect(page.locator('[data-testid="aero-pass-notice"]')).toContainText(
      /No hay contraseña guardada|Não há senha guardada/,
    );
    await expect(page.locator('[data-testid="aero-state"]')).toContainText(/Sin configurar|Sem configurar/);

    // A fresh profile carries no user either: the save needs the address and the user, and the secret is
    // what it deliberately does not keep on disk.
    await page.locator('[data-testid="aero-ws-user"]').fill('wilkin');
    await pass.fill('segredo-do-erp');
    await page.locator('[data-testid="aero-save"]').click();
    await expect(page.getByText(/Configuración guardada|Configuração salva/)).toBeVisible();

    // Neither storage holds the secret, and the legacy session key is gone rather than emptied.
    const storage = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      legacy: sessionStorage.getItem('trindade.aero.session.v1'),
    }));
    expect(JSON.stringify(storage)).not.toContain('segredo-do-erp');
    expect(storage.legacy).toBeNull();
    // Only the address and the user are cached locally: a save that added a secret did not move the plant.
    expect(storage.local['trindade.aero.integration.v1'] ?? '').toContain('192.168.25.250');

    // The vault answered, so the screen can say it: configured, secret on the server, field empty again.
    await expect(page.locator('[data-testid="aero-state"]')).toContainText(/Configurado/);
    await expect(page.locator('[data-testid="aero-pass-notice"]')).toContainText(
      /Contraseña guardada en el servidor|Senha guardada no servidor/,
    );
    await expect(pass).toHaveValue('');

    // And the contract itself carries the fact, never the secret nor the ciphertext.
    const token = await loginAeroOwnerForApi(page);
    const settings = await page.request.get('http://localhost:3099/api/integration/aero/settings', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(settings.status()).toBe(200);
    const stored = (await settings.json()) as Record<string, unknown>;
    expect(stored.hasPassword).toBe(true);
    expect(Object.keys(stored).sort()).toEqual(['configured', 'hasPassword', 'updatedAt', 'username', 'wsUrl']);
    expect(JSON.stringify(stored)).not.toContain('segredo-do-erp');
    expect(stored.password).toBeUndefined();
    expect(stored.password_ciphertext).toBeUndefined();

    // A reload is a new document reaching the same vault: configured, and still nothing to redraw.
    await page.reload();
    await page.locator('[data-testid="admin-tab-integration"]').click();

    await expect(page.locator('[data-testid="aero-state"]')).toContainText(/Configurado/);
    await expect(page.locator('[data-testid="aero-ws-pass"]')).toHaveValue('');
    await expect(page.locator('[data-testid="aero-ws-url"]')).toHaveValue('http://192.168.25.250:1453/api');

    // Clearing the configuration is what empties the vault, and only then does the screen stop saying so.
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Borrar|Apagar/ }).click();
    await expect(page.locator('[data-testid="aero-state"]')).toContainText(/Sin configurar|Sem configurar/);
    await expect(page.locator('[data-testid="aero-pass-notice"]')).toContainText(
      /No hay contraseña guardada|Não há senha guardada/,
    );

    const cleared = await page.request.get('http://localhost:3099/api/integration/aero/settings', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(cleared.status()).toBe(200);
    expect(((await cleared.json()) as Record<string, unknown>).configured).toBe(false);
  });
});
