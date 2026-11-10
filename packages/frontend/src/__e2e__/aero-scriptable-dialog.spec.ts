import { expect, test } from '@playwright/test';
import { IPHONE_UA } from './auth-helpers';
import { loginAsAeroOwner } from './aero-owner';

/**
 * The install screen, on the narrowest phone that will read it.
 *
 * The download is gone: the `.scriptable` is JSON and pasting it into Scriptable ends in
 * `SyntaxError: Unexpected token ':'`. What the operator copies now is the JavaScript itself, and these
 * assertions hold the three things that matter -- the App Store link, a copy that actually copies, and a
 * script name that has to match the URL scheme -- plus the two things that must never come back: the
 * download and the numbered recipe.
 */
const APP_STORE = 'https://apps.apple.com/app/scriptable/id1405459188';

test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA });

async function openIntegrationTab(page: import('@playwright/test').Page) {
  await loginAsAeroOwner(page);
  await page.goto('/admin');
  await page.locator('[data-testid="admin-tab-integration"]').click();
  await expect(page.locator('[data-testid="admin-integration-tab"]')).toBeVisible();
}

async function openDialog(page: import('@playwright/test').Page) {
  await openIntegrationTab(page);
  await page.getByRole('button', { name: /Cómo instalar Scriptable|Como instalar o Scriptable/ }).click();

  const dialog = page.locator('[data-testid="aero-scriptable-dialog"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('the Scriptable install screen on a phone', () => {
  test('the panel offers the app and the copy flow, and nothing to download', async ({ page }) => {
    await openIntegrationTab(page);

    const card = page.locator('[data-testid="aero-scriptable-card"]');
    await expect(card).toBeVisible();

    const store = card.locator('[data-testid="aero-scriptable-app-store"]');
    await expect(store).toHaveAttribute('href', APP_STORE);
    await expect(store).toContainText(/Instalar Scriptable no iPhone|Instalar o Scriptable no iPhone/);
    expect((await store.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    const copy = card.locator('[data-testid="aero-scriptable-copy-open"]');
    await expect(copy).toContainText(/Copiar código|Copiar código/);

    // La descarga del `.scriptable` ya no existe en la UI: el JSON era justamente lo que rompía el pegado.
    await expect(page.locator('[data-testid="aero-scriptable-asset"]')).toHaveCount(0);
    await expect(page.locator('a[download]')).toHaveCount(0);
    await expect(page.getByText(/Importar Aero32Bridge\.scriptable/)).toHaveCount(0);
  });

  test('the dialog copies the raw code and explains the script name, without the old recipe', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const dialog = await openDialog(page);

    await expect(dialog).toContainText(/Aero32Bridge/);
    // Los pasos de Scriptable, no los del archivo: instalar, copiar, +, pegar y renombrar.
    await expect(dialog).toContainText(/tocá \+|toque em \+/i);
    await expect(dialog).toContainText(/pegá|cole/i);
    await expect(dialog).toContainText(/renombr|renomeie/i);

    const store = dialog.locator('[data-testid="aero-scriptable-app-store"]');
    await expect(store).toHaveAttribute('href', APP_STORE);

    const copy = dialog.locator('[data-testid="aero-scriptable-copy"]');
    await expect(copy).toBeVisible();
    expect((await copy.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // El botón copia el JavaScript crudo del asset, no el JSON.
    await copy.click();
    await expect(dialog.getByText(/Copiado|Copiado/).first()).toBeVisible({ timeout: 10_000 });
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.startsWith('// Puente Aero32')).toBe(true);
    expect(clipboard).toContain('allowInsecureRequest');
    expect(clipboard.trimStart().startsWith('{')).toBe(false);
    expect(clipboard).not.toContain('"name":');

    // Abrir la app es un scheme pelado: no ejecuta el puente, que necesita un ticket.
    const open = dialog.locator('[data-testid="aero-scriptable-open"]');
    await expect(open).toHaveAttribute('href', 'scriptable://');
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Nada del camino retirado sobrevive.
    await expect(dialog.getByText(/iCloud/i)).toHaveCount(0);
    await expect(dialog.getByText(/^(Ação|Acción) \d+ —/)).toHaveCount(0);
    await expect(dialog.getByText(/23 acciones|23 ações|24 acciones|24 ações/i)).toHaveCount(0);
    await expect(dialog.getByText(/shortcuts:\/\//)).toHaveCount(0);
    await expect(dialog.locator('a[download]')).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await dialog.getByRole('button', { name: /Cerrar|Fechar/ }).click();
    await expect(dialog).toHaveCount(0);
  });
});
