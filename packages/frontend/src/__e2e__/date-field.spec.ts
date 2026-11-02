import { expect, test } from '@playwright/test';
import { goToProtected } from './auth-helpers';

/**
 * The date control has to open its calendar from a click, on a phone and on a desktop.
 *
 * The native picker is a platform popup Playwright cannot see or click, so what is asserted is the call that
 * opens it: the component asks for `showPicker()` on the click, and a browser that ships it therefore shows
 * the calendar. The method is replaced before the page loads, because calling the real one would open a
 * popup nothing here can close.
 */
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

test.describe('DateField', () => {
  for (const viewport of VIEWPORTS) {
    test(`a click opens the calendar on a ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.addInitScript(() => {
        const calls = { count: 0 };
        (window as unknown as { __aeroPickerCalls: { count: number } }).__aeroPickerCalls = calls;
        HTMLInputElement.prototype.showPicker = function showPicker() {
          calls.count += 1;
        };
      });

      await goToProtected(page, '/stock-calculator');

      const field = page.locator('#stock-date');
      await expect(field).toBeVisible();
      await field.click();

      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __aeroPickerCalls: { count: number } }).__aeroPickerCalls.count))
        .toBe(1);
      // The control keeps its own box: the click does not depend on the native input's intrinsic width.
      const box = await page.locator('#stock-date').boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
    });
  }
});
