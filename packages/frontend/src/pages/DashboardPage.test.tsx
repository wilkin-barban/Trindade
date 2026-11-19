import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';

/**
 * The dashboard is the same screen on both clients: the cards in the phone's order and one panel with every
 * count on it. One of the cards is guarded -- Salida / Baixa is a private beta -- so the phone's order is
 * asserted for the account that is inside it and for the one that is not.
 *
 * Three things are asserted because three things were wrong: the grid carried a card the phone does not draw
 * (Histórico de Contagem, reachable from the counter instead), each count had a card of its own where the
 * phone has one panel, and the masas card was an anchor wrapping another anchor -- the browser flattens them,
 * so the inner door went where the outer one went. The Spanish copy also said "Relatorios Totales", which is
 * Portuguese wearing Spanish clothes.
 */
const get = vi.fn();

/** The account the dashboard is rendering for. `wilkin` is the one inside the Salida beta. */
let currentUser: { id: number; username: string; role: string } = {
  id: 2,
  username: 'ana',
  role: 'Administrador',
};

vi.mock('../api/client', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
  ApiClientError: class ApiClientError extends Error {},
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: currentUser,
    token: 'token',
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const { DashboardPage } = await import('./DashboardPage');

const SUMMARY = {
  reportsToday: 1,
  schedulesTomorrow: 0,
  activeScheduleDate: '2026-10-28',
  activeScheduleBatchDate: '2026-10-30',
  activeScheduleCount: 2,
  activeUsers: 4,
  reportsTotal: 12,
  schedulesTotal: 9,
  latestReportId: 33,
  latestReportCanEdit: true,
  activeScheduleCanEdit: true,
  higieneDone: 3,
  higieneTotal: 5,
  recepcionDone: 2,
  recepcionTotal: 4,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  currentUser = { id: 2, username: 'ana', role: 'Administrador' };
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url.startsWith('/dashboard/summary')) return SUMMARY;
    return { text: 'horario' };
  });
  await i18n.changeLanguage('es');
});

describe('DashboardPage', () => {
  it('the report and schedule cards open the share view', async () => {
    // Las dos tarjetas llevan a la tarjeta de compartir: es lo que se manda y lo que el dueño pidió ver desde
    // el escritorio de la planta, sin pasar por el editor.
    renderPage();

    await waitFor(() => expect(screen.getByTestId('dashboard-card-reports')).toBeInTheDocument());
    const reportLink = screen.getByTestId('dashboard-report-share');
    expect(reportLink.getAttribute('href')).toBe('/reports/33?share=1');

    const schedule = screen.getByTestId('view-active-schedule');
    expect(schedule.getAttribute('href')).toBe('/loading?share=1&date=2026-10-30');
  });

  it('offers Editar on the report card only when the server allows it', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId('dashboard-report-edit')).toBeInTheDocument());
    expect(screen.getByTestId('dashboard-report-edit').getAttribute('href')).toBe('/reports/33/edit');

    // Un trabajador ajeno al reporte recibe `latestReportCanEdit: false` y no ve la acción.
    cleanup();
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/dashboard/summary')) return { ...SUMMARY, latestReportCanEdit: false };
      return { text: 'horario' };
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('dashboard-report-share')).toBeInTheDocument());
    expect(screen.queryByTestId('dashboard-report-edit')).toBeNull();
  });

  it('offers Compartir and Editar on the schedule card, the second only when allowed', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId('dashboard-share-active-schedule')).toBeInTheDocument());
    expect(screen.getByTestId('dashboard-share-active-schedule').getAttribute('href')).toBe(
      '/loading?share=1&date=2026-10-30',
    );
    expect(screen.getByTestId('dashboard-active-schedule-edit').getAttribute('href')).toBe(
      '/loading/edit?date=2026-10-30',
    );

    cleanup();
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/dashboard/summary')) return { ...SUMMARY, activeScheduleCanEdit: false };
      return { text: 'horario' };
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('dashboard-share-active-schedule')).toBeInTheDocument());
    expect(screen.queryByTestId('dashboard-active-schedule-edit')).toBeNull();
  });

  it('draws the seven cards in the phone order, and not the counting history', async () => {
    renderPage();

    const titles = await screen.findAllByTestId(/^dashboard-card-/);
    const texts = titles.map((card) => card.textContent ?? '');
    // La beta terminó: cualquier cuenta con sesión ve Salida junto a Masas, y son siete tarjetas.
    expect(texts).toHaveLength(7);
    expect(texts[0]).toContain('Reportes de Hoy');
    expect(texts[1]).toContain('Horario de Cargamento activo');
    expect(texts[2]).toContain('Lanzamiento de Masas');
    expect(texts[3]).toContain('Salida / Baixa');
    expect(texts[4]).toContain('Calculador de Estoque');
    expect(texts[5]).toContain('Calculadora de Assaí');
    expect(texts[6]).toContain('Compartir App');

    expect(screen.queryByText('Historial de conteo')).not.toBeInTheDocument();
  });

  it('gives the masas card two doors and no anchor around them', async () => {    renderPage();

    const card = await screen.findByTestId('dashboard-card-massas');
    // A card that is a link wraps its own body: the inner door would be an anchor inside an anchor.
    expect(card.querySelector('a a')).toBeNull();
    expect(within(card).getByTestId('dashboard-massas-launch')).toHaveAttribute('href', '/massas-launch');
    expect(within(card).getByTestId('dashboard-massas-history')).toHaveAttribute('href', '/massas-history');
  });

  it('draws seven cards for wilkin, with Salida right after Masas', async () => {
    currentUser = { id: 1, username: 'wilkin', role: 'Administrador' };
    renderPage();

    const cards = await screen.findAllByTestId(/^dashboard-card-/);
    const texts = cards.map((card) => card.textContent ?? '');
    expect(texts).toHaveLength(7);
    expect(texts[2]).toContain('Lanzamiento de Masas');
    expect(texts[3]).toContain('Salida / Baixa');
  });

  it('gives the Salida card the two doors it needs, and no anchor around them', async () => {
    currentUser = { id: 1, username: 'wilkin', role: 'Administrador' };
    renderPage();

    const card = await screen.findByTestId('dashboard-card-salida');
    expect(card.querySelector('a a')).toBeNull();
    expect(within(card).getByTestId('dashboard-salida-launch')).toHaveAttribute('href', '/salida');
    expect(within(card).getByTestId('dashboard-salida-history')).toHaveAttribute('href', '/salida-history');
  });

  it('draws the Salida card for every role, with a session', async () => {
    renderPage();

    await screen.findByTestId('dashboard-card-massas');
    // La tarjeta ya no depende del nombre de la cuenta: el servidor admite a cualquier rol autenticado.
    expect(screen.getByTestId('dashboard-card-salida')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-salida-launch')).toHaveAttribute('href', '/salida');
    expect(screen.getByTestId('dashboard-salida-history')).toHaveAttribute('href', '/salida-history');
  });

  it('reads every count in one panel, with the pairs as done/total', async () => {
    renderPage();

    const panel = await screen.findByTestId('dashboard-summary');
    expect(within(panel).getByTestId('dashboard-summary-schedules')).toHaveTextContent('9');
    expect(within(panel).getByTestId('dashboard-summary-reports')).toHaveTextContent('12');
    expect(within(panel).getByTestId('dashboard-summary-users')).toHaveTextContent('4');
    expect(within(panel).getByTestId('dashboard-summary-higiene')).toHaveTextContent('3/5 tareas');
    expect(within(panel).getByTestId('dashboard-summary-recepcion')).toHaveTextContent('2/4 mercaderías');
  });

  it('says the same words in Spanish as in Portuguese, and they are Spanish', async () => {
    renderPage();
    await screen.findByTestId('dashboard-summary');

    expect(screen.getByText('Reportes totales')).toBeInTheDocument();
    expect(screen.queryByText('Relatorios Totales')).not.toBeInTheDocument();
    expect(screen.getByText('Recepción -> 2 Mercaderías')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Mercancías/)).not.toBeInTheDocument());
  });
});
