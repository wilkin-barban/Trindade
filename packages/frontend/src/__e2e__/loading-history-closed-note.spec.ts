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
  test('on a 390 phone the read-only mark stays a compact chip inside the card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openClosedHistory(page);

    const card = page.getByTestId('loading-history-card-2026-10-28');
    const note = page.getByTestId('loading-history-closed-2026-10-28');
    const noteBox = await note.boundingBox();
    const cardBox = await card.boundingBox();
    expect(noteBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    if (!noteBox || !cardBox) return;

    expect(noteBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    expect(noteBox.width).toBeLessThan(cardBox.width - 80);
    expect(noteBox.height).toBeLessThan(30);
  });

  test('on a 390 phone the view action is a thumb target beside the batch icon', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openClosedHistory(page);

    const card = page.getByTestId('loading-history-card-2026-10-28');
    const view = page.getByTestId('view-loading-batch-2026-10-28');
    const activate = page.getByTestId('activate-loading-batch-2026-10-28');
    const viewBox = await view.boundingBox();
    const activateBox = await activate.boundingBox();
    const cardBox = await card.boundingBox();
    expect(viewBox).not.toBeNull();
    expect(activateBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    if (!viewBox || !activateBox || !cardBox) return;

    // Compact like a report card, but still a 48px target: the eye sits at the card's edge and the
    // batch action is next to it, on the same optical line.
    expect(viewBox.width).toBeGreaterThanOrEqual(48);
    expect(viewBox.height).toBeGreaterThanOrEqual(48);
    expect(viewBox.x).toBeGreaterThan(cardBox.x + cardBox.width * 0.5);
    expect(activateBox.x).toBeGreaterThanOrEqual(viewBox.x + viewBox.width);
    expect(Math.abs((viewBox.y + viewBox.height / 2) - (activateBox.y + activateBox.height / 2))).toBeLessThan(2);
  });

  test('on a 1440 desktop the read-only mark sits in the metadata row', async ({ page }) => {
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

    // The chip belongs to the metadata line below the header, not to the crowded header row.
    expect(noteBox.y).toBeGreaterThanOrEqual(dateBox.y + dateBox.height - 1);
    expect(noteBox.x).toBeLessThan(dateBox.x + 1);
  });
});
