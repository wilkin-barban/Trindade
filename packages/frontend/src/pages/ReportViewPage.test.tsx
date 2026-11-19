import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * A saved report opens as the message it becomes.
 *
 * The operator fills the report, presses save, and what they get is the text the group will read with the four
 * decisions under it: send, print, fix, close. The reading view is still there for whoever opens the report from
 * the history -- one route, two entry points, and no second screen to keep in sync.
 */
const get = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {},
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'wilkin', role: 'Administrador' } }),
}));

const { ReportViewPage } = await import('./ReportViewPage');

const REPORT = {
  id: 5,
  turno: 'tarde',
  report_date: '2026-11-16',
  notes: null,
  created_at: '2026-11-16T12:00:00.000Z',
  updated_at: '2026-11-16T12:00:00.000Z',
  user: { id: 1, display_name: 'Wilkin' },
  items: [],
  temperatures: [],
  photos: [],
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports/:id" element={<ReportViewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/reports/5') return { report: REPORT };
    if (url === '/reports/5/photos') return { photos: [] };
    if (url === '/reports/5/export') return { text: '🌅 *RELATÓRIO — TURNO DA TARDE*\n\n📅 *Data:* 16/11/2026' };
    // The reading view asks for the catalogue to draw its groups, and every section it embeds asks for its own
    // day; one empty answer shape keeps all of them quiet.
    if (url.startsWith('/reports/categories')) return { categories: [] };
    return {
      date: '2026-11-16',
      operators: [],
      products: [],
      launches: [],
      rows: [],
      receipts: [],
      lines: [],
      movements: [],
      totalBoxes: 0,
      totalUnits: 0,
      movementCount: 0,
    };
  });
});

describe('ReportViewPage after a save', () => {
  it('opens the message card with the four decisions when the operator just saved it', async () => {
    renderAt('/reports/5?saved=1');

    await waitFor(() => expect(screen.getByTestId('report-share-card')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId('report-share-text').textContent).toContain('RELATÓRIO — TURNO DA TARDE'),
    );

    expect(screen.getByTestId('report-share-whatsapp')).toBeTruthy();
    expect(screen.getByTestId('report-share-pdf')).toBeTruthy();
    expect(screen.getByTestId('report-share-edit')).toBeTruthy();
    expect(screen.getByTestId('report-share-close')).toBeTruthy();
    // Copying is not one of the four.
    expect(screen.queryByTestId('report-share-copy')).toBeNull();
    // The reading view is behind Editar, not underneath the card.
    expect(screen.queryByTestId('export-pdf-btn')).toBeNull();
  });

  it('opens the share card, read-only, for whoever comes from the history on a past day', async () => {
    renderAt('/reports/5?share=1');

    // El histórico abre el reporte como el mensaje que es: la misma tarjeta, sin Editar y con Volver.
    await waitFor(() => expect(screen.getByTestId('report-share-card')).toBeTruthy());
    // El enlace de vuelta, y el texto sale de la traducción: acá se afirma la puerta, no la cadena.
    expect(screen.getByTestId('report-share-back')).toHaveAttribute('href', '/loading/reports-history');
    expect(screen.queryByTestId('report-share-edit')).toBeNull();
    expect(screen.getByTestId('report-share-close')).toBeTruthy();
    expect(screen.queryByTestId('export-pdf-btn')).toBeNull();
  });

  it('shows Editar on the share card from history when the report is today and canEdit is true', async () => {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const todayReport = { ...REPORT, id: 99, report_date: today, canEdit: true };
    get.mockImplementation(async (url: string) => {
      if (url === '/reports/99') return { report: todayReport };
      if (url === '/reports/99/photos') return { photos: [] };
      if (url === '/reports/99/export') return { text: '🌅 *RELATÓRIO — HOJE*' };
      if (url.startsWith('/reports/categories')) return { categories: [] };
      return { date: today, operators: [], products: [], launches: [], rows: [], receipts: [], lines: [] };
    });

    renderAt('/reports/99?share=1');

    await waitFor(() => expect(screen.getByTestId('report-share-card')).toBeTruthy());
    expect(screen.getByTestId('report-share-back')).toHaveAttribute('href', '/loading/reports-history');
    expect(screen.getByTestId('report-share-edit')).toBeTruthy();
  });

  it('hides Editar on the share card from history when the report is today but canEdit is false', async () => {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const todayReport = { ...REPORT, id: 98, report_date: today, canEdit: false };
    get.mockImplementation(async (url: string) => {
      if (url === '/reports/98') return { report: todayReport };
      if (url === '/reports/98/photos') return { photos: [] };
      if (url === '/reports/98/export') return { text: '🌅 *RELATÓRIO — HOJE*' };
      if (url.startsWith('/reports/categories')) return { categories: [] };
      return { date: today, operators: [], products: [], launches: [], rows: [], receipts: [], lines: [] };
    });

    renderAt('/reports/98?share=1');

    await waitFor(() => expect(screen.getByTestId('report-share-card')).toBeTruthy());
    expect(screen.getByTestId('report-share-back')).toHaveAttribute('href', '/loading/reports-history');
    expect(screen.queryByTestId('report-share-edit')).toBeNull();
  });

  it('keeps the reading view for whoever opens the report by its own URL', async () => {
    renderAt('/reports/5');

    await waitFor(() => expect(screen.getByTestId('export-pdf-btn')).toBeTruthy());
    expect(screen.queryByTestId('report-share-card')).toBeNull();
  });
});
