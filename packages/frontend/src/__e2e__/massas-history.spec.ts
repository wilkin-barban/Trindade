import { expect, test, type Page } from '@playwright/test';
import { goToProtected } from './auth-helpers';

/**
 * The massas history picks its day the way the count does, and the day it picks is the day the URL carries.
 *
 * Since the redesign the history owns the day: today is the day it opens on and the only one that can be
 * managed, and the archive window closes on today because the future is not history. What is asserted here is
 * everything the screen does without launches in the fixture: the panel field with that window, today offered
 * as a chip and pressed by default, a day named in `?date=` being the day it opens, pressing today from another
 * day moving the page back and dropping the query, and a day with nothing reading as an empty day rather than a
 * failed read.
 *
 * The day with launches -- the chip showing its units and the table switching when it is pressed -- is
 * covered in `src/pages/MassasHistoryPage.test.tsx`, where the API answers any day.
 */
function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today as the backend means it: the plant's own calendar, not the machine's. */
async function saoPauloToday(page: Page): Promise<string> {
  return page.evaluate(() =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
  );
}

test.describe('Massas history days', () => {
  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 800 },
  ] as const) {
    test(`the day list opens, links and falls back on a ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await goToProtected(page, '/massas-history');

      const today = await saoPauloToday(page);
      const older = shiftDays(today, -3);
      const field = page.getByTestId('massas-history-date');
      const strip = page.getByTestId('massas-history-days');
      const todayChip = page.getByTestId(`massas-history-day-${today}`);

      // The same panel the count uses, with its window closed on today: the future is not history.
      await expect(field).toHaveAttribute('type', 'date');
      await expect(field).toHaveAttribute('max', today);
      // Today is the day the page opens on, because it is the one that can still be managed.
      await expect(strip).toBeVisible();
      await expect(todayChip).toHaveAttribute('aria-pressed', 'true');
      await expect(todayChip).toHaveText(/^\d{2}\/\d{2}(?: · \d+)?$/);
      // The card this screen used to draw is gone: one control, not two designs.
      await expect(page.getByText('Escolha o dia')).toHaveCount(0);

      // A day in the URL is the day that opens.
      await goToProtected(page, `/massas-history?date=${older}`);
      await expect(todayChip).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('massas-history-empty')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);

      // Pressing today moves the page back to today and leaves the URL without a day: today is the default, and
      // a link that repeats the default is a link that goes stale tomorrow.
      await todayChip.click();
      await expect(todayChip).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/\/massas-history$/);
      await expect(page.getByTestId('massas-history-empty').or(page.getByTestId('massas-unified-card'))).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }
});
