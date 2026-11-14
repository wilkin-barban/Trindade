import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';

/**
 * The top of the audit screen: what it says before the table, and the filters that decide what the table holds.
 *
 * On a phone the old top was a heading, then five controls wrapped into whatever space was left, with a 96px
 * user-id field and a 28px tall select -- the screen said who it was for only on a desktop. The header and the
 * filters are now two cards of their own, the filters are one column on a phone and four on a desktop, and every
 * control is a 44px tap target. The table, its scroll and the logic behind it are not part of this file: they are
 * asserted only to still be there.
 */
const get = vi.fn();

vi.mock('../../api/client', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
  ApiClientError: class ApiClientError extends Error {},
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin', role: 'Administrador' },
    token: 'token',
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const { AuditPage } = await import('./AuditPage');

const LOGS = [
  {
    id: 1,
    user_id: 1,
    display_name: 'Wilkin',
    action: 'login',
    entity_type: 'auth',
    entity_id: null,
    ip_address: '10.0.0.2',
    details: null,
    created_at: '2026-11-13 11:00:00',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation(async () => ({ logs: LOGS, total: 42, page: 1, limit: 20, totalPages: 3 }));
  await i18n.changeLanguage('es');
});

describe('AuditPage — top of the screen', () => {
  it('draws the title, a short subtitle and the total in a card of their own', async () => {
    renderPage();

    const header = await screen.findByTestId('audit-header');
    // A card, not a bare heading: rounded, bordered and filled, the same surface the rest of the app uses.
    expect(header.className).toContain('rounded-lg');
    expect(header.className).toContain('border');
    expect(within(header).getByRole('heading', { name: 'Auditoría' })).toBeInTheDocument();
    expect(within(header).getByText(i18n.t('audit.subtitle'))).toBeInTheDocument();
    // The count arrives with the first page of logs, so it is asserted once it has.
    await waitFor(() =>
      expect(within(header).getByTestId('audit-total-logs')).toHaveTextContent('42'),
    );
  });

  it('draws the filters in their own card, one column on a phone and four on a desktop', async () => {
    renderPage();

    const filters = await screen.findByTestId('audit-filters');
    expect(filters.className).toContain('rounded-lg');
    expect(within(filters).getByText(i18n.t('audit.filters.title'))).toBeInTheDocument();

    const grid = within(filters).getByTestId('audit-filters-grid');
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
  });

  it('keeps every control labelled and gives it a 44px tap target that fills the column', async () => {
    renderPage();

    const filters = await screen.findByTestId('audit-filters');
    // Still reachable by its name: the labels were moved, not dropped.
    const action = within(filters).getByLabelText(i18n.t('audit.filters.action'));
    const entity = within(filters).getByLabelText(i18n.t('audit.filters.entity'));
    const userId = within(filters).getByLabelText(i18n.t('audit.filters.userId'));

    for (const control of [action, entity, userId]) {
      expect(control.className).toContain('w-full');
      expect(control.className).toContain('min-h-[44px]');
      expect(control.className).toContain('text-base');
      expect(control.className).toContain('sm:text-sm');
    }

    // The user id was 96px wide on a phone: a number field that cannot hold the number it asks for.
    expect(userId.className).not.toMatch(/\bw-24\b/);

    for (const name of [i18n.t('audit.filters.filter'), i18n.t('audit.filters.clear')]) {
      const button = within(filters).getByRole('button', { name });
      expect(button.className).toContain('min-h-[44px]');
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('sm:w-auto');
    }
  });

  it('leaves the table where it was', async () => {
    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Wilkin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('audit.pagination.next') })).toBeInTheDocument();
  });
});
