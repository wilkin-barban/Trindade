import { test, expect, type Page } from '@playwright/test';
import { getE2EIdentities, goToProtected } from './auth-helpers';

/**
 * The two ERP lenses on screen: massas on one side, insumos on the other.
 *
 * The rule the backend owns is "ten codes are massas, every other code is a supply", and the description never
 * decides. This spec seeds the ten massas plus a supply literally described "MASSA P PIZZA KIT" and checks the
 * DOM: the pizza kit is drawn in the insumos block and never in the massas one, and a massa is not a receipt.
 */
const API = 'http://localhost:3099/api';

/** The ten codes the plant produces, padded the way the ERP writes them. */
const MASSA_CODES = ['001045', '000039', '000060', '000084', '000091', '001192', '005000', '001047', '000022', '001616'];
const MASSA_NAMES = [
  'MASSA CASEIRA',
  'MASSA DISCO 200G',
  'MASSA DISCO 400G',
  'MASSA DISCO 500G',
  'MASSA LASANHA 500G',
  'MASSA QUADRADA',
  'MASSA ROLO 1KG',
  'MASSA ROLO 2KG',
  'MASSA ROLO 500G',
  'MASSA TOKO',
];

async function adminToken(page: Page): Promise<string> {
  const identities = await getE2EIdentities(page);
  const loginRes = await page.request.post(`${API}/auth/login`, { data: identities.admin });
  expect(loginRes.ok()).toBeTruthy();
  return (await loginRes.json()).token as string;
}

async function reportDay(page: Page): Promise<string> {
  return page.evaluate(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
  );
}

async function seedDay(page: Page): Promise<void> {
  const token = await adminToken(page);
  const date = await reportDay(page);
  const movements = [
    ...MASSA_CODES.map((code, index) => ({
      ent_lan: 51100 + index,
      product_code: code,
      product_desc: MASSA_NAMES[index],
      quantity: 5,
      entry_date: date,
      operator_name: 'BLOCKS E2E',
      movement_type: 'E',
    })),
    // Not one of the ten: a supply whose description must not talk the screen into calling it a massa.
    {
      ent_lan: 51200,
      product_code: '000777',
      product_desc: 'MASSA P PIZZA KIT',
      quantity: 2,
      entry_date: date,
      operator_name: 'BLOCKS E2E',
      movement_type: 'E',
    },
    {
      ent_lan: 51201,
      product_code: '000107',
      product_desc: 'PIZZA KIT 160g',
      quantity: 4,
      entry_date: date,
      operator_name: 'BLOCKS E2E',
      movement_type: 'E',
    },
  ];
  const res = await page.request.post(`${API}/integration/aero/movements`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { date, movements },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe('ERP movements: massas and insumos', () => {
  test('the pizza kit is an insumo and the massas stay in their own block', async ({ page }) => {
    await seedDay(page);
    await goToProtected(page, '/reports');
    await page.waitForSelector('[data-testid="report-builder-form"]', { timeout: 10000 });

    const massasBlock = page.locator('[data-testid="massas-block"]');
    const receiptsBlock = page.locator('[data-testid="receipts-block"]');
    await expect(massasBlock).toBeVisible();
    await expect(receiptsBlock).toBeVisible();

    // The ten massas of the day are listed in the massas block...
    const products = massasBlock.locator('[data-testid="massas-report-products"] li');
    await expect(products).toHaveCount(10);
    // ...and the pizza kit, described as a massa but with a foreign code, is not one of them.
    await expect(massasBlock).not.toContainText('MASSA P PIZZA KIT');

    await expect(receiptsBlock).toContainText('MASSA P PIZZA KIT');
    await expect(receiptsBlock).toContainText('PIZZA KIT 160g');
    // A massa is production coming back into stock, not something the plant received.
    await expect(receiptsBlock).not.toContainText('MASSA TOKO');

    // The block names itself and says what it holds.
    await expect(receiptsBlock).toContainText('Insumos');
    await expect(receiptsBlock).toContainText(/não são massa|no son masa/i);
  });

  test('the launch screen still offers the ten massas', async ({ page }) => {
    await goToProtected(page, '/massas-launch');
    await page.waitForSelector('[data-testid^="massas-product-"]', { timeout: 10000 });

    await expect(page.locator('[data-testid^="massas-product-"]')).toHaveCount(10);
  });
});
