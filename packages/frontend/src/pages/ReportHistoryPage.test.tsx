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
const patch = vi.fn();
const del = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
    del: (...args: unknown[]) => del(...args),
  },
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
  patch.mockReset();
  del.mockReset();
  patch.mockResolvedValue({ success: true });
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

  it('offers to reopen a retired report and calls the server with its id', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/users/options')) return { users: [] };
      return {
        items: [
          {
            id: 41,
            turno: 'tarde',
            report_date: '2026-11-01',
            notes: null,
            created_at: '2026-11-01T18:00:00.000Z',
            isActive: false,
            isClosedDay: false,
            readOnly: true,
            canEdit: false,
            canDeactivate: false,
            canActivate: true,
            canDelete: false,
            user: { id: 1, display_name: 'Wilkin' },
          },
        ],
        pagination: { page: 1, pageSize: 30, total: 1, totalPages: 1 },
      };
    });

    renderPage();
    const button = await screen.findByTestId('activate-report-41');
    expect(screen.queryByTestId('delete-report-41')).toBeNull();

    fireEvent.click(button);
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/reports/41/activate', {}));
  });

  it('keeps the retire of a past day, which the server still offers', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/users/options')) return { users: [] };
      return {
        items: [
          {
            id: 42,
            turno: 'noite',
            report_date: '2026-10-30',
            notes: null,
            created_at: '2026-10-30T22:00:00.000Z',
            isActive: true,
            isClosedDay: true,
            readOnly: true,
            canEdit: false,
            canDeactivate: true,
            canActivate: false,
            canDelete: false,
            user: { id: 1, display_name: 'Wilkin' },
          },
        ],
        pagination: { page: 1, pageSize: 30, total: 1, totalPages: 1 },
      };
    });

    renderPage();
    // Q4: the day is closed for writing and for erasing, and retiring it is still an action.
    expect(await screen.findByTestId('deactivate-report-42')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-report-42')).toBeNull();
  });

  it('gives every action of the card a 48 px target, like the loading history', async () => {
    // A 16 px icon inside a bare button is a 16 px target: on a phone in the plant the thumb misses it and
    // the operator learns to press twice, which on this screen means deleting the wrong report. `min-h-12`
    // and `min-w-12` are Tailwind's 3rem, the same pair the loading history uses.
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/users/options')) return { users: [] };
      return {
        items: [
          {
            id: 43,
            turno: 'tarde',
            report_date: '2026-11-01',
            notes: null,
            created_at: '2026-11-01T18:00:00.000Z',
            isActive: true,
            isClosedDay: false,
            readOnly: false,
            canEdit: true,
            canDeactivate: true,
            canActivate: false,
            canDelete: true,
            user: { id: 1, display_name: 'Wilkin' },
          },
        ],
        pagination: { page: 1, pageSize: 30, total: 1, totalPages: 1 },
      };
    });

    renderPage();
    const actions = [
      await screen.findByTestId('view-report-43'),
      await screen.findByTestId('deactivate-report-43'),
      await screen.findByTestId('delete-report-43'),
    ];

    for (const action of actions) {
      expect(action.className).toContain('min-h-12');
      expect(action.className).toContain('min-w-12');
    }
  });

  it('marks a closed day as read only, with the same chip as the loading history', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/users/options')) return { users: [] };
      return {
        items: [
          {
            id: 44,
            turno: 'noite',
            report_date: '2026-10-30',
            notes: null,
            created_at: '2026-10-30T22:00:00.000Z',
            isActive: true,
            isClosedDay: true,
            readOnly: true,
            canEdit: false,
            canDeactivate: true,
            canActivate: false,
            canDelete: false,
            user: { id: 1, display_name: 'Wilkin' },
          },
        ],
        pagination: { page: 1, pageSize: 30, total: 1, totalPages: 1 },
      };
    });

    renderPage();

    // The chip says why the report cannot be edited; without it the card only looks like one whose role
    // happens to have no edit, and the operator goes looking for the editor.
    expect(await screen.findByTestId('report-history-closed-44')).toHaveTextContent('Solo lectura');
    const card = screen.getByTestId('report-card-44');
    expect(card.querySelector('[data-testid="report-history-closed-44"]')).not.toBeNull();
  });

  it('still filters by user, which is what the web has and the phone does not', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('history-user-filter')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('history-user-filter'), { target: { value: '7' } });

    await waitFor(() => expect(historyUrls().some((url) => url.includes('userId=7'))).toBe(true));
  });
});
