import { expect, test, type Page } from '@playwright/test';
import { goToProtected } from './auth-helpers';

/**
 * The massas history picks its day the way the count does, and the day it picks is the day the URL carries.
 *
 * The e2e database is frozen in the past -- the history refuses writes to any day that is not today -- so
 * no day here has launches. What is asserted is everything the screen does without them: the panel field
 * is there with the archive window, yesterday is always offered as a chip and is the day it opens by
 * default, a day named in `?date=` is the day it opens, pressing yesterday from another day moves the page
 * there and drops the query, and a day with nothing reads as an empty day instead of a failed read.
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
      const yesterday = shiftDays(today, -1);
      const older = shiftDays(today, -3);
      const field = page.getByTestId('massas-history-date');
      const strip = page.getByTestId('massas-history-days');
      const yesterdayChip = page.getByTestId(`massas-history-day-${yesterday}`);

      // The same panel the count uses, with its window closed on both ends.
      await expect(field).toHaveAttribute('type', 'date');
      await expect(field).toHaveAttribute('max', yesterday);
      // Yesterday is the day the page opens on, and the only one it always offers -- alone, with no count.
      await expect(strip).toBeVisible();
      await expect(yesterdayChip).toHaveAttribute('aria-pressed', 'true');
      await expect(yesterdayChip).toHaveText(/^\d{2}\/\d{2}$/);
      // The card this screen used to draw is gone: one control, not two designs.
      await expect(page.getByText('Escolha o dia')).toHaveCount(0);

      // A day in the URL is the day that opens.
      await goToProtected(page, `/massas-history?date=${older}`);
      await expect(yesterdayChip).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('massas-history-empty')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);

      // Pressing yesterday moves the page to yesterday and leaves the URL without a day: yesterday is the
      // default, and a link that repeats the default is a link that goes stale tomorrow.
      await yesterdayChip.click();
      await expect(yesterdayChip).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/\/massas-history$/);
      await expect(page.getByTestId('massas-history-empty')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }
});
