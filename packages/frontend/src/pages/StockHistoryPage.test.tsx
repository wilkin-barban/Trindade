import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';

/**
 * The counting history reads a day the same way the phone does: a panel that is the day, and the days that
 * were counted beside it.
 *
 * What is asserted is the pair the screen is built on -- the panel carries the day and the bounds that keep
 * it inside the archive (the last closed night back, thirty days back), and a chip is enough to move the
 * summary without opening a calendar at all. A history that cannot be listed has to leave the panel alone.
 */
const get = vi.fn();

vi.mock('../api/client', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
  ApiClientError: class ApiClientError extends Error {},
}));

const { StockHistoryPage } = await import('./StockHistoryPage');

function stockDay(date: string, units: number) {
  return {
    date,
    products: [
      {
        id: 1,
        category: 'Massas',
        name: 'PRODUTO A',
        boxes: 1,
        units,
        boxesTotal: 1,
        unitsTotal: units,
        updatedAt: `${date}T10:00:00.000Z`,
      },
    ],
    totalBoxes: 1,
    totalUnits: units,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StockHistoryPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  get.mockReset();
  await i18n.changeLanguage('es');
});

describe('StockHistoryPage', () => {
  it('reads the day as a panel with the archive bounds', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/stock/history') return { days: [] };
      return stockDay('2026-10-27', 12);
    });

    renderPage();

    const input = await screen.findByTestId('stock-history-date');
    expect(input).toHaveAttribute('type', 'date');
    // Yesterday and thirty days back, both ends closed: the archive is a window, not the whole table. The
    // calendar is the plant's, so "yesterday" is read there and not from the machine's clock.
    const todayInSaoPaulo = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const yesterdayInSaoPaulo = new Date(`${todayInSaoPaulo}T12:00:00Z`);
    yesterdayInSaoPaulo.setUTCDate(yesterdayInSaoPaulo.getUTCDate() - 1);
    expect(input).toHaveAttribute('max', yesterdayInSaoPaulo.toISOString().slice(0, 10));
    expect(input).toHaveAttribute('min');
    expect((input as HTMLInputElement).min < (input as HTMLInputElement).max).toBe(true);
  });

  it('lists the counted days with what each one counted, and moves there on a click', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/stock/history') {
        return {
          days: [
            { date: '2026-10-27', products: 2, boxes: 5, units: 50 },
            { date: '2026-10-26', products: 1, boxes: 1, units: 8 },
          ],
        };
      }
      const date = url.split('date=')[1];
      return stockDay(date, date === '2026-10-26' ? 8 : 50);
    });

    renderPage();

    const older = await screen.findByTestId('stock-history-day-2026-10-26');
    expect(older).toHaveTextContent('26/10 · 8');

    fireEvent.click(older);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/stock?date=2026-10-26'));
    await waitFor(() => expect(older).toBeDisabled());
  });

  it('keeps the day panel when the counted days cannot be read', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/stock/history') throw new Error('offline');
      return stockDay('2026-10-27', 12);
    });

    renderPage();

    expect(await screen.findByTestId('stock-history-date')).toBeInTheDocument();
    expect(screen.queryByTestId('stock-history-days')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
