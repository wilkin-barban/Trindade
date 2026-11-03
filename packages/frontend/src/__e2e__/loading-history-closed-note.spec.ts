import { expect, test, type Page } from '@playwright/test';
import { goToProtected } from './auth-helpers';

/**
 * The read-only note of a closed day is the last chip of the card's header row, and it is the longest.
 *
 * On a phone the row cannot hold the date, the count, the inactive mark and that sentence at once: the note
 * used to be squeezed into the leftover width and broke into five lines. It now takes its own line below the
 * date and spans the card; on a desktop it stays inline, after the marks. The history read is answered by a
 * route mock because the API refuses to create a row on a past day -- the state this card draws cannot be
 * seeded through the door the operator uses.
 */
const CLOSED_BATCH = {
  items: [
    {
      batch_date: '2026-10-28',
      loading_date: '2026-10-29',
      total_loadings: 6,
      created_at: '2026-10-28T08:00:00.000Z',
      updated_at: '2026-10-28T08:00:00.000Z',
      isActive: false,
      isClosedDay: true,
      readOnly: true,
      canEdit: false,
      canDeactivate: false,
      canDelete: false,
      canActivate: true,
      creator: { id: 1, display_name: 'Nicolas' },
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

async function openClosedHistory(page: Page) {
  await page.route('**/api/loading/schedules/history**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CLOSED_BATCH) }),
  );
  await goToProtected(page, '/loading/history');
  await expect(page.getByTestId('loading-history-closed-2026-10-28')).toBeVisible();
}

test.describe('Closed day note layout', () => {
  test('on a 390 phone the note takes its own line and spans the card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openClosedHistory(page);

    const card = page.getByTestId('loading-history-card-2026-10-28');
    const note = page.getByTestId('loading-history-closed-2026-10-28');
    const date = card.getByText('28/10/2026', { exact: true });

    const noteBox = await note.boundingBox();
    const dateBox = await date.boundingBox();
    const cardBox = await card.boundingBox();
    expect(noteBox).not.toBeNull();
    expect(dateBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    if (!noteBox || !dateBox || !cardBox) return;

    // Below the date line: the note's top is at or under the bottom of the date.
    expect(noteBox.y).toBeGreaterThanOrEqual(dateBox.y + dateBox.height - 1);
    // One line, not five: it is as wide as the card's padding allows, not a sliver of the row.
    expect(noteBox.width).toBeGreaterThanOrEqual(cardBox.width - 40);
    expect(noteBox.x).toBeLessThan(dateBox.x + 1);
    // And what the note used to do -- break into a tall column -- no longer happens.
    expect(noteBox.height).toBeLessThan(dateBox.height * 2.5);
  });

  test('on a 1440 desktop the note stays inline after the marks', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openClosedHistory(page);

    const card = page.getByTestId('loading-history-card-2026-10-28');
    const note = page.getByTestId('loading-history-closed-2026-10-28');
    const date = card.getByText('28/10/2026', { exact: true });

    const noteBox = await note.boundingBox();
    const dateBox = await date.boundingBox();
    expect(noteBox).not.toBeNull();
    expect(dateBox).not.toBeNull();
    if (!noteBox || !dateBox) return;

    // Same line: the note's own height is one line, and it starts to the right of the date.
    expect(noteBox.x).toBeGreaterThan(dateBox.x + dateBox.width);
    expect(noteBox.y).toBeLessThan(dateBox.y + dateBox.height);
  });
});
