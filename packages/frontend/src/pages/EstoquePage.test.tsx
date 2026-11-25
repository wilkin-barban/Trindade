import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/config';
import type { StockDay, StockProduct } from '../lib/stock';

const get = vi.fn();
const post = vi.fn();
const vault = vi.fn();
const audit = vi.fn();
const triggerSync = vi.fn();

let mockUser: { id: number; username: string; role: string } | null = {
  id: 1,
  username: 'wilkin',
  role: 'Administrador',
};

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(message: string, public status = 500, public code = 'API_ERROR') {
      super(message);
    }
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../lib/aero-vault', () => ({
  fetchAeroVaultSettings: (...args: unknown[]) => vault(...args),
}));

vi.mock('../lib/aero-audit', () => ({
  postAeroAuditEvent: (...args: unknown[]) => audit(...args),
  newAeroAttempt: () => ({ attemptId: 'test-attempt-123', startedAt: 123456789 }),
  aeroAttemptHeaders: (attempt?: { attemptId: string }) =>
    attempt ? { 'X-Trindade-Attempt': attempt.attemptId } : {},
}));

vi.mock('../lib/aero-mirror', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/aero-mirror')>();
  return {
    ...actual,
    triggerAeroMovementsSync: (...args: unknown[]) => triggerSync(...args),
  };
});

vi.mock('../lib/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/date')>();
  return {
    ...actual,
    saoPauloToday: () => '2026-11-13',
  };
});

const { EstoquePage } = await import('./EstoquePage');

function generateCatalog(count = 25): StockProduct[] {
  return Array.from({ length: count }, (_, i) => {
    const num = i + 1;
    const code = String(1000 + num);
    return {
      code,
      name: `PRODUTO ${num}`,
      category: i < 10 ? 'Massas' : 'Terceirizados',
      unitsPerBox: 10,
      boxes: i === 0 ? 5 : i === 1 ? 2 : 0,
      units: i === 0 ? 50 : i === 1 ? 20 : 0,
    };
  });
}

function renderComponent(initialRoute = '/estoque') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/estoque" element={<EstoquePage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EstoquePage', () => {
  const stockDay: StockDay = {
    date: '2026-11-13',
    products: generateCatalog(25),
    totalBoxes: 7,
    totalUnits: 70,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 1, username: 'wilkin', role: 'Administrador' };
    vault.mockResolvedValue({
      configured: true,
      wsUrl: 'http://192.168.25.250:1453/api',
      username: 'TRINDADE',
      hasPassword: true,
    });
    audit.mockResolvedValue({ ok: true, status: 200, code: null });
    triggerSync.mockResolvedValue(true);
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/stock')) {
        return stockDay;
      }
      if (path.startsWith('/integration/aero/movements')) {
        return null;
      }
      return null;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('S1: administrator sees the cards, non-administrator is redirected to /dashboard', async () => {
    // Administrator
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('estoque-sync-erp')).toBeInTheDocument();
    });
    expect(screen.getByTestId('estoque-card-1001')).toBeInTheDocument();

    cleanup();

    // Non-administrator
    mockUser = { id: 2, username: 'operador', role: 'Operador' };
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('estoque-sync-erp')).not.toBeInTheDocument();
    expect(screen.queryByTestId('estoque-card-1001')).not.toBeInTheDocument();
  });

  it('treats a mirror from another day as not synced instead of subtracting different days', async () => {
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/stock')) return stockDay;
      if (path.startsWith('/integration/aero/movements')) {
        // Yesterday's snapshot: the page asked for today and must not use it as today's balance.
        return {
          date: '2026-11-12',
          movements: [
            {
              ent_lan: 9,
              product_code: '001001',
              product_desc: 'PRODUTO 1',
              quantity: 30,
              entry_date: '2026-11-12',
              operator_name: 'WILKIN',
              movement_type: 'E',
            },
          ],
        };
      }
      return null;
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('estoque-card-1001')).toBeInTheDocument();
    });
    const card1 = screen.getByTestId('estoque-card-1001');
    expect(within(card1).getByText(/pendente/i)).toBeInTheDocument();
    expect(within(card1).getByTestId('delta-badge-1001')).toHaveTextContent('—');
  });

  it('S2 & S3: renders header with São Paulo date label and 25 products with physical metrics and pending ERP state', async () => {
    renderComponent();

    // S2: Read-only date badge in header
    await waitFor(() => {
      expect(screen.getByText(/13\/11\/2026/)).toBeInTheDocument();
    });
    // No date picker or input in page
    expect(document.querySelector('input[type="date"]')).toBeNull();

    // S3: 25 products rendered
    for (let i = 1; i <= 25; i++) {
      const code = String(1000 + i);
      const card = screen.getByTestId(`estoque-card-${code}`);
      expect(card).toBeInTheDocument();
      expect(within(card).getByText(`PRODUTO ${i}`)).toBeInTheDocument();
    }

    // Physical boxes and units
    const card1 = screen.getByTestId('estoque-card-1001');
    expect(within(card1).getByText(/5\s*cx/i)).toBeInTheDocument();
    expect(within(card1).getByText(/50\s*un/i)).toBeInTheDocument();

    // When mirror is null, ERP shows pending state
    expect(within(card1).getByText(/pendente/i)).toBeInTheDocument();
  });

  it('S5: delta badges and suggestion button follow físico vs ERP', async () => {
    // Return ERP mirror snapshot
    // Product 1001: Físico = 50 un. ERP = 30 un ('E'). Delta = +20 (Físico > ERP -> amber badge, Entrada action)
    // Product 1002: Físico = 20 un. ERP = 40 un ('E'). Delta = -20 (Físico < ERP -> red badge, Saída action)
    // Product 1003: Físico = 0 un. ERP = 0 un. Delta = 0 (green badge, no correction action)
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/stock')) {
        return stockDay;
      }
      if (path.startsWith('/integration/aero/movements')) {
        return {
          date: '2026-11-13',
          movements: [
            {
              ent_lan: 1,
              product_code: '001001',
              product_desc: 'PRODUTO 1',
              quantity: 30,
              entry_date: '2026-11-13',
              operator_name: 'WILKIN',
              movement_type: 'E',
            },
            {
              ent_lan: 2,
              product_code: '001002',
              product_desc: 'PRODUTO 2',
              quantity: 40,
              entry_date: '2026-11-13',
              operator_name: 'WILKIN',
              movement_type: 'E',
            },
          ],
        };
      }
      return null;
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('estoque-card-1001')).toBeInTheDocument();
    });

    const card1 = screen.getByTestId('estoque-card-1001');
    const badge1 = within(card1).getByTestId('delta-badge-1001');
    expect(badge1).toHaveTextContent(/\+?20/);
    expect(badge1.className).toMatch(/amber/);

    const entradaBtn = within(card1).getByRole('button', { name: /entrada/i });
    expect(entradaBtn).toBeInTheDocument();
    expect(entradaBtn.className).toMatch(/min-h-\[44px\]/);

    // Clicking Entrada explains the suggestion in the neutral dialog and never claims a completed write.
    fireEvent.click(entradaBtn);
    await waitFor(() => {
      expect(screen.getByTestId('estoque-suggestion')).toBeInTheDocument();
    });
    // A suggestion is not an accomplished action: it must not open the green success dialog.
    expect(screen.queryByTestId('estoque-message')).not.toBeInTheDocument();
    expect(screen.getAllByText(/sugest/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/entrada/i).length).toBeGreaterThan(0);

    // Dismiss dialog
    fireEvent.click(screen.getByTestId('estoque-suggestion-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('estoque-suggestion')).not.toBeInTheDocument();
    });

    // Product 1002: Físico < ERP
    const card2 = screen.getByTestId('estoque-card-1002');
    const badge2 = within(card2).getByTestId('delta-badge-1002');
    expect(badge2).toHaveTextContent(/-20/);
    expect(badge2.className).toMatch(/red/);

    const saidaBtn = within(card2).getByRole('button', { name: /sa[ií]da/i });
    expect(saidaBtn).toBeInTheDocument();
    expect(saidaBtn.className).toMatch(/min-h-\[44px\]/);

    fireEvent.click(saidaBtn);
    await waitFor(() => {
      expect(screen.getByTestId('estoque-suggestion')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/sugest/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sa[ií]da/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('estoque-suggestion-close'));

    // Product 1003: Delta = 0
    const card3 = screen.getByTestId('estoque-card-1003');
    const badge3 = within(card3).getByTestId('delta-badge-1003');
    expect(badge3).toHaveTextContent(/0/);
    expect(badge3.className).toMatch(/emerald|green/);
    expect(within(card3).queryByRole('button', { name: /entrada|sa[ií]da/i })).toBeNull();
  });

  it('S4: estoque-sync-erp requests the bridge with callbackPath ending in /estoque and audits requested event', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('estoque-sync-erp')).toBeInTheDocument();
    });

    const syncBtn = screen.getByTestId('estoque-sync-erp');
    expect(syncBtn.className).toMatch(/min-h-\[44px\]/);
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(vault).toHaveBeenCalled();
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'read_history',
          phase: 'requested',
          destinationUrl: expect.stringMatching(/\/movimentoitem$/),
        }),
      );
      expect(triggerSync).toHaveBeenCalledWith(
        expect.objectContaining({ wsUrl: 'http://192.168.25.250:1453/api' }),
        expect.objectContaining({
          date: '2026-11-13',
          callbackPath: expect.stringMatching(/\/estoque$/),
          includeExits: false,
        }),
      );
    });
  });

  it('S4 & S6: outcomes (failure and success) render inside MessageDialog and NOT as loose body text', async () => {
    // 1. Initial load failure
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/stock')) {
        throw new Error('Falha ao carregar estoque');
      }
      return null;
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('estoque-message')).toBeInTheDocument();
    });
    // No loose alert banner in page body
    expect(document.querySelector('[role="alert"]:not([data-testid="estoque-message"]):not([data-testid="estoque-suggestion"])')).toBeNull();

    // Close error dialog
    fireEvent.click(screen.getByTestId('estoque-message-dismiss'));
    await waitFor(() => {
      expect(screen.queryByTestId('estoque-message')).not.toBeInTheDocument();
    });

    cleanup();

    // 2. Bridge trigger failure
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/stock')) return stockDay;
      return null;
    });
    triggerSync.mockResolvedValue(false);

    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('estoque-sync-erp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('estoque-sync-erp'));
    await waitFor(() => {
      expect(screen.getByTestId('estoque-message')).toBeInTheDocument();
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'read_history',
        phase: 'result',
        error: expect.stringContaining('bridge_not_started'),
        destinationUrl: expect.stringMatching(/\/movimentoitem$/),
      }),
    );
    // Dialog closes cleanly
    fireEvent.click(screen.getByTestId('estoque-message-dismiss'));

    cleanup();

    // 3. Callback return success
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/stock')) return stockDay;
      if (path.includes('/last-result')) {
        return {
          data: {
            success: true,
            data: [
              {
                ENT_LAN: 10,
                PRO_COD: '001001',
                PRO_DES: 'PRODUTO 1',
                PRO_QTD: 30,
                ENT_DTA: '2026-11-13',
                ENT_USU: 'WILKIN',
                ENTSAI: 'E',
              },
            ],
          },
        };
      }
      return null;
    });
    post.mockResolvedValue({ ok: true });

    renderComponent('/estoque?aero_action=movimentos&aero_result=stored');

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/integration/aero/movements',
        expect.objectContaining({
          date: '2026-11-13',
          movements: expect.arrayContaining([
            expect.objectContaining({
              ent_lan: 10,
              product_code: '001001',
              quantity: 30,
              movement_type: 'E',
            }),
          ]),
        }),
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('estoque-message')).toBeInTheDocument();
    });
    const messageDialog = screen.getByTestId('estoque-message');
    expect(within(messageDialog).getByText(/sincroniz/i)).toBeInTheDocument();
    expect(document.querySelector('[role="alert"]:not([data-testid="estoque-message"]):not([data-testid="estoque-suggestion"])')).toBeNull();
  });
});
