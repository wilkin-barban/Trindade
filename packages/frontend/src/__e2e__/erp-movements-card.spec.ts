import { expect, test } from '@playwright/test';
import { getE2EIdentities, goToProtected } from './auth-helpers';

/**
 * The company's day in the report: one heading, one button, one card per record.
 *
 * The plant used to read two cards and press two sync buttons for the same day. What the browser proves now is
 * that the day has a single heading with a single button, and that each record -- massas, supply receipts and the
 * plant's own exits -- gets its own card instead of being stacked inside one.
 */
const API = 'http://localhost:3099/api';

test.describe('ERP movements card', () => {
  test('draws one card and one sync button for the day', async ({ page }) => {
    const identities = await getE2EIdentities(page);
    const login = await page.request.post(`${API}/auth/login`, { data: identities.admin });
    const token = (await login.json()).token as string;

    // The report files today, so the day seeded here is today in São Paulo.
    const date = await page.evaluate(() =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    );
    const seeded = await page.request.post(`${API}/integration/aero/movements`, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        date,
        movements: [
          {
            ent_lan: 41001,
            product_code: '001192',
            product_desc: 'MASSA QUADRADA',
            quantity: 45,
            entry_date: date,
            operator_name: 'WILKIN',
            movement_type: 'E',
          },
          {
            ent_lan: 41002,
            product_code: '009001',
            product_desc: 'FARINHA DE TRIGO',
            quantity: 300,
            entry_date: date,
            operator_name: 'WILKIN',
            movement_type: 'E',
          },
        ],
      },
    });
    expect(seeded.status()).toBe(201);

    await goToProtected(page, '/reports');
    await page.waitForSelector('[data-testid="report-builder-form"]', { timeout: 10000 });

    const card = page.locator('[data-testid="report-massas-card"]');
    await expect(card).toBeVisible();

    // The heading names the day and holds the only button that asks the company for it.
    const header = page.locator('[data-testid="erp-movements-header"]');
    await expect(header).toBeVisible();
    await expect(header).toContainText('Movimentações do ERP');
    await expect(header.locator('[data-testid="erp-movements-sync"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="erp-movements-sync"]')).toHaveCount(1);

    // Three records of one day, three cards: massas, receipts and the plant's exits. The exits card is the
    // plant's own and never lives inside the other two.
    await expect(page.locator('[data-testid="report-massas-card"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="salida-report-section"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="receipts-sync"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="massas-report-refresh"]')).toHaveCount(0);

    // The massas lens counts the product the plant launched, in units. The day is shared with every other
    // spec, so the number is read from the ERP instead of assumed: what this run added is there, plus
    // whatever the day already held.
    const erpDay = await page.request.get(`${API}/integration/aero/movements?date=${date}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const quadradaUnits = ((await erpDay.json()).movements as Array<{
      product_code: string;
      quantity: number;
      movement_type: string;
    }>)
      .filter((movement) => movement.movement_type === 'E')
      .filter((movement) => String(movement.product_code).replace(/^0+/, '') === '1192')
      .reduce((total, movement) => total + movement.quantity, 0);
    expect(quadradaUnits).toBeGreaterThanOrEqual(45);
    await expect(card.locator('[data-testid="massas-report-products"]')).toContainText('QUADRADA');
    await expect(card.locator('[data-testid="massas-report-products"]')).toContainText(`${quadradaUnits} un`);

    // The insumos lens reads the same day from the other side, in its own card: the supply is listed under its
    // own heading, and it never reaches the massas summary.
    const receiptsCard = page.locator('[data-testid="report-receipts-card"]');
    await expect(receiptsCard).toBeVisible();
    await expect(receiptsCard).toContainText('Insumos');
    await expect(receiptsCard.locator('[data-testid="receipt-line-41002-009001"]')).toContainText('FARINHA DE TRIGO');
    await expect(card.locator('[data-testid="massas-report-products"]')).not.toContainText('FARINHA');
  });

  test('keeps the single button at the thumb floor on a 375px phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await goToProtected(page, '/reports');
    await page.waitForSelector('[data-testid="erp-movements-sync"]', { timeout: 10000 });

    const button = page.locator('[data-testid="erp-movements-sync"]');
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
