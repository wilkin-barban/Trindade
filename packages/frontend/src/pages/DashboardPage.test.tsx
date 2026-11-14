import { render, screen, waitFor, within } from '@testing-library/react';
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
    return { text: 'cronograma' };
  });
  await i18n.changeLanguage('es');
});

describe('DashboardPage', () => {
  it('draws the six cards in the phone order, and not the counting history', async () => {
    renderPage();

    const titles = await screen.findAllByTestId(/^dashboard-card-/);
    const texts = titles.map((card) => card.textContent ?? '');
    expect(texts).toHaveLength(6);
    expect(texts[0]).toContain('Reportes de Hoy');
    expect(texts[1]).toContain('Cronograma activo');
    expect(texts[2]).toContain('Lanzamiento de Masas');
    expect(texts[3]).toContain('Calculador de Estoque');
    expect(texts[4]).toContain('Calculadora de Assaí');
    expect(texts[5]).toContain('Compartir App');

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

  it('does not draw the Salida card for an account outside the beta', async () => {
    renderPage();

    await screen.findByTestId('dashboard-card-massas');
    expect(screen.queryByTestId('dashboard-card-salida')).not.toBeInTheDocument();
    // Nor its doors: a link drawn but not shown is still a link a screen reader can reach.
    expect(screen.queryByTestId('dashboard-salida-launch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-salida-history')).not.toBeInTheDocument();
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
