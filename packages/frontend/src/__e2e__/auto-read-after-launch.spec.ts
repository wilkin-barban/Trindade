import { expect, test, type Page } from '@playwright/test';
import { IPHONE_UA } from './auth-helpers';
import { loginAsAeroOwner, navigateInApp, openErpSession } from './aero-owner';

/**
 * The read of the plant that a launch leaves owing, and the one moment it can be asked for.
 *
 * The shortcut cannot run in a browser, so what is testable is the order the operator lives: the verdict is
 * shown and read first, and closing it is what spends the mark the launch left and asks the plant for the day
 * -- once. A read that started before the dialog was read would come back over the answer the operator is
 * still reading; a read that did not start at all leaves the row pending forever.
 */
const AERO_SETTINGS_KEY = 'trindade.aero.integration.v1';
const AERO_AUTO_READ_KEY = 'trindade.aero.auto-read.v1';

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const SETTINGS = JSON.stringify({
  wsUrl: 'http://192.168.25.250:1453/api',
  username: 'wilkin',
  shortcutName: 'Aero32 Bridge',
  syncEnabled: true,
});

async function openLaunchPage(page: Page) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: AERO_SETTINGS_KEY, value: SETTINGS },
  );
  await openErpSession(page);
  await navigateInApp(page, '/massas-launch');
  await page.locator('[data-testid="massas-launch-date"]').fill(DAY);
  await expect(page.locator('input[type="number"]').first()).toBeVisible({ timeout: 15000 });
}

async function launchOne(page: Page) {
  const quantity = page.locator('input[type="number"]').first();
  await quantity.fill('1');
  await quantity.blur();
  await page.getByRole('button', { name: /Lançar/ }).click();
  const confirm = page.locator('[data-testid="massa-confirm-modal"]');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: /Confirmar|Lançar/ }).last().click();
  // El viaje tiene que estar armado -- el producto en `inFlight` -- antes de contestar: leer la cola en el
  // instante en que se escribe devuelve lo que todavía no salió, y la respuesta encontraría una cola llena.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('trindade.aero.queue.v1');
        if (!raw) return 0;
        return (JSON.parse(raw) as { inFlight?: unknown[] }).inFlight?.length ?? 0;
      }),
    )
    .toBe(1);
}

/** The shortcut's way back, with what the ERP answered. */
async function answer(page: Page, payload: unknown) {
  await page.goto(`/massas-launch?aero_action=entrada&aero_data=${encodeURIComponent(JSON.stringify(payload))}`);
}

function readRequests(page: Page): string[] {
  const reads: string[] = [];
  page.on('request', (request) => {
    const body = request.postData() ?? '';
    if (request.url().includes('/api/integration/aero/log') && body.includes('read_history')) {
      reads.push(body);
    }
  });
  return reads;
}

function storedMark(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), AERO_AUTO_READ_KEY);
}

test.use({ viewport: { width: 375, height: 667 }, userAgent: IPHONE_UA });

test.describe('the day a launch left pending', () => {
  test('the verdict is read first, and closing it is what reads the plant once', async ({ page }) => {
    const reads = readRequests(page);

    await loginAsAeroOwner(page);
    await openLaunchPage(page);
    await launchOne(page);
    await answer(page, { success: true, data: { ENT_LAN: 41234 } });

    const result = page.locator('[data-testid="massa-result-modal"]');
    await expect(result).toBeVisible({ timeout: 15000 });
    await expect(result).toContainText('Sincronizado com o ERP');

    // El veredicto todavía se está leyendo: ninguna lectura arrancó, y el día quedó marcado debiendo una.
    expect(reads).toHaveLength(0);
    expect(await storedMark(page)).not.toBeNull();

    // La contraseña del ERP vivió en la sesión de esta pestaña, así que el documento que volvió del atajo
    // todavía puede pedir la lectura.
    expect(
      await page.evaluate(() => window.sessionStorage.getItem('trindade.aero.session.v1')),
    ).not.toBeNull();

    await result.locator('[data-testid="massa-result-close"]').click();

    // Cerrar gasta la marca y pide el día una sola vez: la fila que quedó pendiente se concilia leyendo.
    await expect.poll(() => reads.length, { timeout: 10000 }).toBe(1);
    await expect.poll(() => storedMark(page), { timeout: 10000 }).toBeNull();
    expect(reads[0]).toContain('read_history');

    // Y no se queda pidiendo: un solo cierre, un solo viaje.
    await expect(result).toHaveCount(0);
    expect(reads).toHaveLength(1);
  });

  test('a refused launch leaves no read owing', async ({ page }) => {
    const reads = readRequests(page);

    await loginAsAeroOwner(page);
    await openLaunchPage(page);
    await launchOne(page);
    await answer(page, { success: false, message: 'PRODUTO SEM SALDO' });

    const result = page.locator('[data-testid="massa-result-modal"]');
    await expect(result).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="massa-result-mirror-hint"]')).toHaveCount(0);

    // Nada viajó, así que no hay asiento nuevo que buscar.
    expect(await storedMark(page)).toBeNull();

    await result.locator('[data-testid="massa-result-close"]').click();
    await expect(page.getByRole('status').filter({ hasText: /senha|contraseña/i })).toHaveCount(0);
    expect(reads).toHaveLength(0);
  });
});
