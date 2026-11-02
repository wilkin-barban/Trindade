import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';

/**
 * The report history is a query, and the filter is what asks it.
 *
 * The page used to read once, on mount: choosing a day moved the field and left the list alone, so the only
 * way to see the day that had just been chosen was the "Filtrar" button beside it. What is asserted here is
 * that the filter asks again by itself, that the bounds keep it inside the days a report can exist on, and
 * that clearing returns the list to the default without losing the user filter that the phone does not have.
 */
const get = vi.fn();

vi.mock('../api/client', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
  ApiClientError: class ApiClientError extends Error {},
}));

const { ReportHistoryPage } = await import('./ReportHistoryPage');

function renderPage() {
  return render(
    <MemoryRouter>
      <ReportHistoryPage />
    </MemoryRouter>,
  );
}

function historyUrls(): string[] {
  return get.mock.calls.map((call) => call[0] as string).filter((url) => url.startsWith('/reports/history'));
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

describe('ReportHistoryPage', () => {
  it('asks again when the day is chosen, without pressing anything else', async () => {
    renderPage();
    await waitFor(() => expect(historyUrls().length).toBe(1));

    fireEvent.change(screen.getByTestId('history-date-filter'), { target: { value: '2026-10-27' } });

    await waitFor(() => expect(historyUrls().some((url) => url.includes('date=2026-10-27'))).toBe(true));
  });

  it('keeps the day inside the days a report can exist on', async () => {
    renderPage();

    const day = await screen.findByTestId('history-date-filter');
    const month = screen.getByTestId('history-month-filter');
    const todayInSaoPaulo = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

    expect(day).toHaveAttribute('max', todayInSaoPaulo);
    expect(month).toHaveAttribute('max', todayInSaoPaulo.slice(0, 7));
  });

  it('clears every filter at once and asks for the default list', async () => {
    renderPage();
    await waitFor(() => expect(historyUrls().length).toBe(1));

    fireEvent.change(screen.getByTestId('history-date-filter'), { target: { value: '2026-10-27' } });
    await waitFor(() => expect(screen.getByTestId('history-clear-filters')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('history-clear-filters'));

    await waitFor(() => expect(screen.getByTestId('history-date-filter')).toHaveValue(''));
    await waitFor(() => {
      const last = historyUrls().at(-1) ?? '';
      expect(last).not.toContain('date=');
      expect(last).not.toContain('month=');
      expect(last).not.toContain('userId=');
    });
    expect(screen.queryByTestId('history-clear-filters')).not.toBeInTheDocument();
  });

  it('still filters by user, which is what the web has and the phone does not', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('history-user-filter')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('history-user-filter'), { target: { value: '7' } });

    await waitFor(() => expect(historyUrls().some((url) => url.includes('userId=7'))).toBe(true));
  });
});
