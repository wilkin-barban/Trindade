import { test, expect } from '@playwright/test';
import { goToProtected } from './auth-helpers';

/**
 * The two types of box on the report the operator files.
 *
 * The switch is the whole question: did the day mount this type? Off, its block leaves the screen and its
 * answers leave the body; on, it comes back empty. What the browser proves is that the block follows the
 * switch, because the answers leaving the body is the page's rule and has its own test with no browser.
 */
test.describe('Report — box type switches', () => {
  test.beforeEach(async ({ page }) => {
    await goToProtected(page, '/reports');
    await page.waitForSelector('[data-testid="report-builder-form"]', { timeout: 15000 });
  });

  test('switching a box type off takes its block with it, and back on returns it empty', async ({ page }) => {
    const smallBoxes = page.getByTestId('box-type-switch-9');
    const assaiBoxes = page.getByTestId('box-type-switch-10');

    await expect(smallBoxes).toBeVisible();
    await expect(assaiBoxes).toBeVisible();
    await expect(smallBoxes).toBeChecked();

    // `check-task-58` is "Nhoque 400g", the first small box; `check-task-61` the first Assai one.
    await expect(page.getByTestId('check-task-58')).toBeVisible();
    await smallBoxes.click();
    await expect(smallBoxes).not.toBeChecked();
    await expect(page.getByTestId('check-task-58')).toHaveCount(0);
    await expect(page.getByTestId('check-task-61')).toBeVisible();

    await smallBoxes.click();
    await expect(page.getByTestId('check-task-58')).toBeVisible();
    await expect(page.getByTestId('check-task-58')).not.toBeChecked();
  });

  test('the switch is reachable and legible on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForSelector('[data-testid="report-builder-form"]', { timeout: 15000 });

    const smallBoxes = page.getByTestId('box-type-switch-9');
    await smallBoxes.scrollIntoViewIfNeeded();
    await expect(smallBoxes).toBeVisible();
    const box = await smallBoxes.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(28);
    expect(box?.height).toBeGreaterThanOrEqual(16);
  });
});
