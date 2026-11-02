import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';

/**
 * The loading history asks its day as soon as it is chosen, and can always be emptied back to the whole list.
 *
 * Same pair as the report history, on the screen beside it: a filter that reads once leaves the list showing
 * the day before, and a filter that cannot be dropped is a screen the operator has to reload. The user filter
 * stays because it is the web's own advantage.
 */
const get = vi.fn();

vi.mock('../api/client', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
  ApiClientError: class ApiClientError extends Error {},
}));

const { LoadingHistoryPage } = await import('./LoadingHistoryPage');

function renderPage() {
  return render(
    <MemoryRouter>
      <LoadingHistoryPage />
    </MemoryRouter>,
  );
}

function historyUrls(): string[] {
  return get.mock.calls
    .map((call) => call[0] as string)
    .filter((url) => url.startsWith('/loading/schedules/history'));
}

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url.startsWith('/users/options')) {
      return { users: [{ id: 7, display_name: 'Wilkin' }] };
    }
    return { items: [], pagination: { page: 1, pageSize: 30, total: 0, totalPages: 0 } };
  });
  await i18n.changeLanguage('es');
});

describe('LoadingHistoryPage', () => {
  it('asks again when the day is chosen, without pressing anything else', async () => {
    renderPage();
    await waitFor(() => expect(historyUrls().length).toBe(1));

    fireEvent.change(screen.getByTestId('loading-history-date-filter'), { target: { value: '2026-10-27' } });

    await waitFor(() => expect(historyUrls().some((url) => url.includes('date=2026-10-27'))).toBe(true));
  });

  it('bounds the filters by today and clears all of them together', async () => {
    renderPage();
    const todayInSaoPaulo = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

    const day = await screen.findByTestId('loading-history-date-filter');
    expect(day).toHaveAttribute('max', todayInSaoPaulo);

    fireEvent.change(day, { target: { value: '2026-10-27' } });
    fireEvent.change(screen.getByTestId('loading-history-user-filter'), { target: { value: '7' } });
    await waitFor(() => expect(screen.getByTestId('history-clear-filters')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('history-clear-filters'));

    await waitFor(() => {
      const last = historyUrls().at(-1) ?? '';
      expect(last).not.toContain('date=');
      expect(last).not.toContain('userId=');
    });
  });
});
