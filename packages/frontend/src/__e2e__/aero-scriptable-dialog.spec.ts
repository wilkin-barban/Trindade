import { expect, test } from '@playwright/test';
import { IPHONE_UA } from './auth-helpers';
import { loginAsAeroOwner } from './aero-owner';

/**
 * The install screen, on the narrowest phone that will read it.
 *
 * The shortcut is gone: there is no recipe to follow, no action count to match and no iCloud link to chase.
 * What remains is one file and one app. These assertions hold the three things an operator has to be able to
 * do with one thumb -- open the App Store, download the script, and later open the app -- plus the two things
 * that must never come back: the numbered recipe and the retired scheme.
 */
const APP_STORE = 'https://apps.apple.com/app/scriptable/id1405459188';
const ASSET = '/Aero32Bridge.scriptable';

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
  test('the panel offers the app and the script without opening a recipe', async ({ page }) => {
    await openIntegrationTab(page);

    const card = page.locator('[data-testid="aero-scriptable-card"]');
    await expect(card).toBeVisible();

    const store = card.locator('[data-testid="aero-scriptable-app-store"]');
    await expect(store).toHaveAttribute('href', APP_STORE);
    await expect(store).toContainText(/Instalar Scriptable no iPhone|Instalar o Scriptable no iPhone/);
    expect((await store.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    const asset = card.locator('[data-testid="aero-scriptable-asset"]');
    await expect(asset).toHaveAttribute('href', ASSET);
    await expect(asset).toHaveAttribute('download', 'Aero32Bridge.scriptable');
    await expect(asset).toContainText(/Importar Aero32Bridge\.scriptable/);
    expect((await asset.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('the dialog explains the three steps, opens Scriptable, and never shows the old recipe', async ({ page }) => {
    const dialog = await openDialog(page);

    await expect(dialog).toContainText(/Aero32Bridge/);
    // The share-sheet step is what actually gets the file into the app: a download alone does not.
    await expect(dialog).toContainText(/Compartir → Scriptable|Compartilhar → Scriptable/);
    await expect(dialog).toContainText(/Archivos|Arquivos/);

    const store = dialog.locator('[data-testid="aero-scriptable-app-store"]');
    await expect(store).toHaveAttribute('href', APP_STORE);

    const asset = dialog.locator('[data-testid="aero-scriptable-asset"]');
    await expect(asset).toHaveAttribute('href', ASSET);
    await expect(asset).toHaveAttribute('download', 'Aero32Bridge.scriptable');

    // Opening the app is a bare scheme: it must not run the bridge, which needs a ticket.
    const open = dialog.locator('[data-testid="aero-scriptable-open"]');
    await expect(open).toHaveAttribute('href', 'scriptable://');
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Nothing of the retired path survives.
    await expect(dialog.getByText(/iCloud/i)).toHaveCount(0);
    await expect(dialog.getByText(/^(Ação|Acción) \d+ —/)).toHaveCount(0);
    await expect(dialog.getByText(/23 acciones|23 ações|24 acciones|24 ações/i)).toHaveCount(0);
    await expect(dialog.getByText(/shortcuts:\/\//)).toHaveCount(0);

    // 375 px wide, no sideways scroll, and every action is thumb-sized.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const targets = dialog.locator('a[data-testid^="aero-scriptable-"]');
    const heights = await targets.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).getBoundingClientRect().height),
    );
    expect(heights.length).toBeGreaterThanOrEqual(3);
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);

    await dialog.getByRole('button', { name: /Cerrar|Fechar/ }).click();
    await expect(dialog).toHaveCount(0);
  });
});
