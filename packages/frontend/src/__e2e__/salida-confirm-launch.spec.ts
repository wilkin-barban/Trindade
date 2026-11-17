import { expect, test, type Page } from '@playwright/test';
import { loginAsAeroOwner } from './aero-owner';

/**
 * The baixa reads before it leaves.
 *
 * A launch used to arm the ticket and hand the phone to Scriptable in the same tap: the operator found out what
 * they had sent only on the way back. Now the button opens the same confirmation the Masas launch uses -- the
 * products, how many, the total -- and nothing leaves the page until Confirmar.
 *
 * The ticket endpoint is stubbed here so the test never depends on the bridge: what is asserted is that Cancelar
 * sends nothing and Confirmar asks for the ticket.
 */
const TICKET_URL = '**/api/integration/aero/bridge-tickets';

async function openSalidaPage(page: Page) {
  await loginAsAeroOwner(page);
  // No vault needed here: the ticket request is stubbed, and what this spec asserts is who asks for it and when.
  await page.goto('/salida');
  await expect(page.locator('input[type="number"]').first()).toBeVisible({ timeout: 15000 });
}

test.use({ viewport: { width: 375, height: 667 } });

test.describe('a baixa asks before it leaves', () => {
  test('Lanzar opens the confirmation, Cancelar sends nothing and Confirmar arms the trip', async ({ page }) => {
    let ticketRequests = 0;
    await page.route(TICKET_URL, async (route) => {
      ticketRequests += 1;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ticket: 'e2e-ticket', ticketUrl: 'https://app.example/t/e2e', expiresAt: '' }),
      });
    });

    await openSalidaPage(page);

    const quantity = page.locator('input[type="number"]').first();
    await quantity.fill('2');
    await quantity.blur();

    const launch = page.locator('[data-testid="salida-launch"]');
    await expect(launch).toContainText('(1)');
    await launch.click();

    // The dialog lists what will leave and the total, and nothing has been sent.
    const dialog = page.locator('[data-testid="salida-confirm-modal"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-testid="salida-confirm-total"]')).toContainText('2 un');
    const firstItem = page.locator('[data-testid^="salida-confirm-item-"]').first();
    await expect(firstItem).toContainText('2 un');
    expect(ticketRequests).toBe(0);

    // Cancelar closes it and still nothing was asked for.
    await page.locator('[data-testid="salida-confirm-cancel"]').click();
    await expect(dialog).toHaveCount(0);
    expect(ticketRequests).toBe(0);
    await expect(launch).toContainText('(1)');

    // Confirmar is what writes the movement and asks the server for the ticket.
    const save = page.waitForResponse(
      (response) => response.url().endsWith('/api/salida') && response.request().method() === 'POST',
    );
    await launch.click();
    await page.locator('[data-testid="salida-confirm-action"]').click();

    const saved = await save;
    expect(saved.status()).toBe(201);
    await expect.poll(() => ticketRequests, { timeout: 10_000 }).toBe(1);
  });
});
