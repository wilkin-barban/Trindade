import { expect, test } from '@playwright/test';
import { IPHONE_UA } from './auth-helpers';
import { loginAsAeroOwner } from './aero-owner';

/**
 * The two ways the plant gets the shortcut, on the narrowest screen it will be read from.
 *
 * The iCloud link installs the version the factory has been using for a year, and it is now a reference: it
 * knows nothing about tickets, so it no longer redeems anything. The manual recipe is the one that works, and
 * it is documentation the operator follows with the phone in one hand: the twenty-three actions have to fit
 * without spilling sideways and every copy button must be thumb-sized.
 */
const ICLOUD_URL = 'https://www.icloud.com/shortcuts/3216695a428f42539fec7abbd5419f34';

test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA });

async function openShortcutDialog(page: import('@playwright/test').Page) {
  await loginAsAeroOwner(page);
  // La receta del atajo vive ahora en el Panel Admin: producción quedó sin configuración técnica (S11).
  await page.goto('/admin');
  await page.locator('[data-testid="admin-tab-integration"]').click();
  await expect(page.locator('[data-testid="admin-integration-tab"]')).toBeVisible();

  const open = page.getByRole('button', { name: /Instalar Atalho no iPhone/ });
  await expect(open).toBeVisible({ timeout: 15000 });
  await open.click();

  const dialog = page.locator('[data-testid="aero-shortcut-dialog"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('the shortcut install screen on a phone', () => {
  test('keeps the certified link as the old version, and opens the app outside the web', async ({ page }) => {
    const dialog = await openShortcutDialog(page);

    // The iCloud link points at the twenty-action shortcut, which never redeems a ticket: the card has to say
    // so before an operator taps it, and the badge and the warning are what say it.
    const card = page.locator('[data-testid="aero-shortcut-icloud-legacy"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Atajo anterior \(20 acciones\)|Atalho anterior \(20 ações\)/);
    await expect(card).toContainText(/Obsoleto/);
    await expect(card).toContainText(/no canjea nada|não troca nada/);

    // It installs something, and the screen is honest that it is not what this page needs.
    await expect(dialog.getByText(/listo para instalar|pronto para instalar/i)).toHaveCount(0);
    await expect(dialog.getByText(/Listo \(1 toque\)|Pronto \(1 toque\)/)).toHaveCount(0);

    const link = page.locator('[data-testid="aero-shortcut-icloud-link"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', ICLOUD_URL);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toContainText(/Ver el atajo anterior|Ver o atalho anterior/);

    // The reachable button is the app itself: leaving Safari is the point.
    const openApp = dialog.getByRole('link', { name: /Abrir la app Atajos|Abrir o app Atalhos/ });
    await expect(openApp).toHaveAttribute('href', 'shortcuts://');

    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    // The whole card is reachable without scrolling: the link to the old version is not hidden below the fold.
    expect(box.y).toBeLessThan(667);

    // It is above the manual recipe, because it is documentation of the recipe that follows.
    const unpack = dialog.getByText(/^A · /).first();
    expect((await card.boundingBox())!.y).toBeLessThan((await unpack.boundingBox())!.y);
  });

  test('keeps the manual recipe in four blocks and twenty-three numbered actions', async ({ page }) => {
    const dialog = await openShortcutDialog(page);

    // Three actions at the head -- ticket, ticketUrl and the redemption -- on top of the twenty the certified
    // shortcut already had, renumbered from 2–20 to 5–23.
    await expect(dialog).toContainText(/Atajo único · 23 acciones|Atalho único · 23 ações/);
    for (const block of [
      /A · .*1 a 9/,
      /B · .*10 a 18/,
      /C · .*19 a 21/,
      /D · .*22 (y|e) 23/,
    ]) {
      await expect(dialog.getByText(block).first()).toBeAttached();
    }

    // Each action is numbered once: a recipe that skips a number leaves the `Si` unclosed.
    for (const n of [1, 2, 3, 4, 5, 9, 10, 18, 19, 21, 22, 23]) {
      // Anclado al número: sin `^Acción 1 —`, «Acción 10» también entra.
      await expect(dialog.getByText(new RegExp(`^(Ação|Acción) ${n} —`)).first()).toBeAttached();
    }

    // The three new actions are the whole delta: the two reads of the input dictionary and the redemption.
    // Each step is one `li`, numbered in order, and the key it asks for is the value with its own copy button.
    const step = (n: number) => dialog.locator('ol li').nth(n - 1);
    await expect(step(2)).toContainText('ticket');
    await expect(step(3)).toContainText('ticketUrl');
    await expect(step(4)).toContainText(/POST/);
    await expect(step(4)).toContainText('X-Trindade-Ticket');

    // The step the plant got wrong by hand names the renamed variable and what it must not be.
    const bodyStep = dialog.getByText(/^(Ação|Acción) 19 —/).first();
    await bodyStep.scrollIntoViewIfNeeded();
    await expect(bodyStep).toBeVisible();
    await expect(dialog).toContainText('body_item');
    await expect(dialog).toContainText('bodies');

    // No step asks the operator to type, paste or read a credential: the server writes it into the envelope.
    const steps = await dialog.locator('ol li').allInnerTexts();
    expect(steps.length).toBe(23);
    for (const text of steps) {
      expect(text).not.toMatch(/Basic\s[A-Za-z0-9+/=]/);
      expect(text).not.toMatch(/senha|contraseña|password/i);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // The last action is reachable by scrolling inside the dialog, not by scrolling the page.
    await dialog.getByText(/^(Ação|Acción) 23 —/).scrollIntoViewIfNeeded();
    await expect(dialog.getByText(/^(Ação|Acción) 23 —/)).toBeVisible();

    const copy = page.locator('[data-testid^="aero-shortcut-copy-"]');
    expect(await copy.count()).toBeGreaterThanOrEqual(6);
    for (const handle of await copy.all()) {
      expect((await handle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
