import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import {
  SALIDA_AUDIT_DESTINATION,
  SALIDA_OUTBOX_KEY,
  writeSalidaLastMovement,
  type SalidaMovement,
} from '../../lib/salida';
import {
  SALIDA_PENDING_ATTEMPT_STORAGE_KEY,
  saveAeroPendingAttempt,
} from '../../lib/aero-pending-attempt';

/**
 * The history is a record, and these tests hold the three things that make it one.
 *
 * The badge has to say what the company actually confirmed -- agreed, partial or still pending -- with the
 * `ENT_LAN` when there is one. The block filter is how a plant reads a day of mixed exits, so it must narrow real
 * cards and not just change a chip. And `Reenviar ao ERP` belongs only to a movement the ERP has not confirmed:
 * offering it on a reconciled card would be inviting a second exit. The share fallback is asserted because a
 * browser without a share sheet is the common case on a factory desktop.
 */
const get = vi.fn();
const post = vi.fn();
const upload = vi.fn();
const del = vi.fn();
const ticket = vi.fn();
const vault = vi.fn();

/** Every audit line this page posted, in order. */
let audit: Array<Record<string, unknown>> = [];

vi.mock('../../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    upload: (...args: unknown[]) => upload(...args),
    del: (...args: unknown[]) => del(...args),
  },
  apiUrl: (path: string) => path,
  ApiClientError: class ApiClientError extends Error {},
}));

vi.mock('../../lib/aero-vault', () => ({
  requestAeroBridgeTicket: (...args: unknown[]) => ticket(...args),
  // El ajuste del ERP se lee por el mismo módulo: sin él la pantalla no tiene con qué decidir y cae en el error
  // de acceso, que es justo lo que estos tests distinguen de "no configurado".
  fetchAeroVaultSettings: (...args: unknown[]) => vault(...args),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'wilkin', role: 'Administrador' },
    token: 'token',
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../lib/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/date')>()),
  saoPauloToday: () => '2026-11-13',
}));

const { SalidaHistoryPage } = await import('./SalidaHistoryPage');

const SALIDA_MOVEMENTS_ATTEMPT_KEY = 'trindade.aero.salida-movimentos-attempt.v1';
function saveSalidaMovementsAttempt(attempt: Parameters<typeof saveAeroPendingAttempt>[0]) {
  localStorage.setItem(SALIDA_MOVEMENTS_ATTEMPT_KEY, JSON.stringify(attempt));
}

function movement(overrides: Partial<SalidaMovement> & { id: number }): SalidaMovement {
  return {
    movement_date: '2026-11-13',
    user_id: 1,
    username: 'wilkin',
    display_name: 'Wilkin',
    created_at: '2026-11-13T11:00:00.000Z',
    items: [
      {
        id: overrides.id * 10,
        product_code: '1474',
        product_name: 'EMBALAG. NHOQUE 1kg',
        block: 'embalagens',
        quantity: 20,
        position: 0,
      },
    ],
    photos: [],
    total_units: 20,
    reconciliation: { status: 'pending', ent_lans: [], matched_item_ids: [] },
    ...overrides,
  };
}

const RECONCILED = movement({
  id: 1,
  reconciliation: { status: 'reconciled', ent_lans: [4242], matched_item_ids: [10] },
});

const PENDING_BOBINA = movement({
  id: 2,
  items: [
    {
      id: 20,
      product_code: '1900',
      product_name: 'BOBINA ROLO',
      block: 'bobinas',
      quantity: 3,
      position: 0,
    },
  ],
  total_units: 3,
});

const PARTIAL_OTHER_DAY = movement({
  id: 3,
  movement_date: '2026-11-12',
  created_at: '2026-11-12T11:00:00.000Z',
  items: [
    {
      id: 30,
      product_code: '1673',
      product_name: 'GORDURA VEGETAL',
      block: 'materia-prima',
      quantity: 5,
      position: 0,
    },
  ],
  total_units: 5,
  reconciliation: { status: 'partial', ent_lans: [5151], matched_item_ids: [30] },
});

function history() {
  return {
    days: [
      { date: '2026-11-13', total_units: 23, movements: [RECONCILED, PENDING_BOBINA] },
      { date: '2026-11-12', total_units: 5, movements: [PARTIAL_OTHER_DAY] },
    ],
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="test-location">{location.search}</div>;
}

async function renderReady(entry = '/salida-history') {
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <SalidaHistoryPage />
      <LocationProbe />
    </MemoryRouter>,
  );
  await screen.findByTestId('salida-history-date');
  return view;
}

beforeEach(async () => {
  get.mockReset();
  post.mockReset();
  ticket.mockReset();
  vault.mockReset();
  vault.mockResolvedValue({ configured: false, wsUrl: null, username: null, hasPassword: false, updatedAt: null });
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_name: string, action: () => Promise<unknown> | unknown) => action()) } });
  audit = [];

  get.mockImplementation(async (url: string) => {
    if (url === '/salida/history') return history();
    return {};
  });

  post.mockImplementation(async (path: string, body?: unknown) => {
    if (path === '/integration/aero/log') {
      audit.push(body as Record<string, unknown>);
      return { ok: true };
    }
    return { movements: 2 };
  });

  await i18n.changeLanguage('es');
});

/** The line of one phase for one event, or a failure that names what was missing. */
function lineOf(phase: 'requested' | 'result', event: 'read_history' | 'salida_sync'): Record<string, unknown> {
  const found = audit.find((entry) => entry.event === event && entry.phase === phase);
  expect(found, `no ${phase} ${event} line was posted`).toBeDefined();
  return found!;
}

/** No line may carry a credential: the log is read by more people than the vault is. */
function expectNoCredential(entries: readonly Record<string, unknown>[]) {
  const text = JSON.stringify(entries).toLowerCase();
  for (const forbidden of ['authorization', 'password', 'senha', 'credential', 'basic ']) {
    expect(text).not.toContain(forbidden);
  }
}

describe('SalidaHistoryPage', () => {
  it('stores returned movements under the attempted date and refreshes the mirror', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'read-attempt', startedAt: 1_700_000_000_000, date: '2026-11-12' });
    const data = encodeURIComponent(JSON.stringify({ success: true, data: [
      { ENT_LAN: 42, PRO_COD: '001357', PRO_DES: 'DISCO', PRO_QTD: 10, ENT_DTA: '2026-11-12', ENT_USU: 'OPERADOR', ENTSAI: 'S' },
    ] }));
    await renderReady(`/salida-history?date=2026-11-13&movimentos_attempt=read-attempt&aero_action=movimentos&aero_data=${data}`);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/integration/aero/movements', expect.objectContaining({
      date: '2026-11-12', movements: [expect.objectContaining({ ent_lan: 42, movement_type: 'S' })],
    }), expect.anything()));
    await waitFor(() => expect(lineOf('result', 'read_history').attemptId).toBe('read-attempt'));
    await waitFor(() => expect(screen.getByTestId('test-location')).toHaveTextContent('date=2026-11-12'));
    expect(await screen.findByTestId('salida-history-erp-note')).toHaveTextContent('1');
    expect(get).toHaveBeenCalledWith('/integration/aero/movements?date=2026-11-12');
    expect(localStorage.getItem('trindade.aero.salida-movimentos-attempt.v1')).toBeNull();
    expectNoCredential(audit);
  });

  it('does not consume the pending Massas read when Salida returns its own movements', async () => {
    saveAeroPendingAttempt({ action: 'movimentos', attemptId: 'massas-read', startedAt: 1_700_000_000_000, date: '2026-11-12' });
    localStorage.setItem('trindade.aero.salida-movimentos-attempt.v1', JSON.stringify({ action: 'movimentos', attemptId: 'salida-read', startedAt: 1_700_000_000_000, date: '2026-11-13' }));
    const data = encodeURIComponent(JSON.stringify({ success: true, data: [] }));
    await renderReady(`/salida-history?movimentos_attempt=salida-read&aero_action=movimentos&aero_data=${data}`);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/integration/aero/movements', expect.objectContaining({ date: '2026-11-13' }), expect.anything()));
    expect(JSON.parse(localStorage.getItem('trindade.aero.pending-attempt.v1')!)).toMatchObject({ attemptId: 'massas-read' });
    expect(localStorage.getItem('trindade.aero.salida-movimentos-attempt.v1')).toBeNull();
  });

  it('serializes two tabs returning the same movements callback', async () => {
    let queue: Promise<unknown> = Promise.resolve();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: (_name: string, action: () => Promise<unknown> | unknown) => {
        const result = queue.then(action);
        queue = result.catch(() => undefined);
        return result;
      },
    } });
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'two-tabs', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    const data = encodeURIComponent(JSON.stringify({ success: true, data: [] }));
    const entry = `/salida-history?movimentos_attempt=two-tabs&aero_action=movimentos&aero_data=${data}`;
    const first = render(<MemoryRouter initialEntries={[entry]}><SalidaHistoryPage /><LocationProbe /></MemoryRouter>);
    const second = render(<MemoryRouter initialEntries={[entry]}><SalidaHistoryPage /><LocationProbe /></MemoryRouter>);
    await waitFor(() => expect(within(first.container).getByTestId('test-location')).not.toHaveTextContent('aero_data'));
    await waitFor(() => expect(within(second.container).getByTestId('test-location')).not.toHaveTextContent('aero_data'));
    expect(post.mock.calls.filter(([path]) => path === '/integration/aero/movements')).toHaveLength(1);
  });

  it('does not process a movements callback when cross-tab locking is unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'no-lock', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    const data = encodeURIComponent(JSON.stringify({ success: true, data: [] }));
    await renderReady(`/salida-history?movimentos_attempt=no-lock&aero_action=movimentos&aero_data=${data}`);
    expect(await screen.findByTestId('salida-history-erp-note')).toHaveTextContent(i18n.t('salida.erpSyncLockUnavailable'));
    expect(post.mock.calls.filter(([path]) => path === '/integration/aero/movements')).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('trindade.aero.salida-movimentos-attempt.v1')!)).toMatchObject({ attemptId: 'no-lock' });
  });

  it('retrieves a stored result for the exact movements attempt', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'stored-read', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    get.mockImplementation(async (url: string) => {
      if (url === '/salida/history') return history();
      if (url === '/integration/aero/bridge-tickets/last-result?action=movimentos&attemptId=stored-read') return { data: { success: true, data: [] } };
      return {};
    });
    await renderReady('/salida-history?movimentos_attempt=stored-read&aero_action=movimentos&aero_result=stored');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/integration/aero/bridge-tickets/last-result?action=movimentos&attemptId=stored-read'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/integration/aero/movements', expect.objectContaining({ date: '2026-11-13', movements: [] }), expect.anything()));
  });

  it('ignores a movements callback without a matching pending attempt', async () => {
    const data = encodeURIComponent(JSON.stringify({ success: true, data: [] }));
    await renderReady(`/salida-history?movimentos_attempt=missing&aero_action=movimentos&aero_data=${data}`);
    await waitFor(() => expect(screen.getByTestId('test-location')).not.toHaveTextContent('aero_data'));
    expect(post.mock.calls.filter(([path]) => path === '/integration/aero/movements')).toHaveLength(0);
  });

  it('rejects a callback containing duplicate attempt identifiers', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'duplicate-id', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    const data = encodeURIComponent(JSON.stringify({ success: true, data: [] }));
    await renderReady(`/salida-history?movimentos_attempt=duplicate-id&movimentos_attempt=other&aero_action=movimentos&aero_data=${data}`);
    await waitFor(() => expect(screen.getByTestId('test-location')).not.toHaveTextContent('aero_data'));
    expect(post.mock.calls.filter(([path]) => path === '/integration/aero/movements')).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('trindade.aero.salida-movimentos-attempt.v1')!)).toMatchObject({ attemptId: 'duplicate-id' });
  });

  it('does not consume a newer attempt when an older movements callback returns', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'newer', startedAt: 1_700_000_000_000, date: '2026-11-12' });
    const data = encodeURIComponent(JSON.stringify({ success: true, data: [] }));
    await renderReady(`/salida-history?movimentos_attempt=older&aero_action=movimentos&aero_data=${data}`);
    await waitFor(() => expect(screen.getByTestId('test-location')).not.toHaveTextContent('aero_data'));
    expect(post.mock.calls.filter(([path]) => path === '/integration/aero/movements')).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('trindade.aero.salida-movimentos-attempt.v1')!)).toMatchObject({ attemptId: 'newer' });
  });

  it('arms a dated, correlated movements attempt before opening the bridge', async () => {
    vault.mockResolvedValue({ configured: true, wsUrl: 'http://192.168.25.250:1453/api', username: 'OPERADOR', hasPassword: true });
    ticket.mockResolvedValue({ ticket: 'fixture-ticket', ticketUrl: 'https://app.example/ticket' });
    await renderReady();
    fireEvent.click(screen.getByTestId('salida-history-erp-sync'));
    await waitFor(() => expect(ticket).toHaveBeenCalled());
    const attempt = JSON.parse(localStorage.getItem('trindade.aero.salida-movimentos-attempt.v1')!);
    expect(attempt).toMatchObject({ action: 'movimentos', date: '2026-11-13' });
    expect(ticket.mock.calls[0][0]).toMatchObject({ action: 'movimentos', callbackPath: expect.stringContaining(`movimentos_attempt=${attempt.attemptId}`) });
    await waitFor(() => expect(lineOf('requested', 'read_history').attemptId).toBe(attempt.attemptId));
    expectNoCredential(audit);
  });

  it('does not store movements from another day', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'wrong-day', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    const data = encodeURIComponent(JSON.stringify({ success: true, data: [
      { ENT_LAN: 42, PRO_COD: '001357', PRO_DES: 'DISCO', PRO_QTD: 10, ENT_DTA: '2026-11-12', ENT_USU: 'OPERADOR', ENTSAI: 'S' },
    ] }));
    await renderReady(`/salida-history?movimentos_attempt=wrong-day&aero_action=movimentos&aero_data=${data}`);
    expect(await screen.findByTestId('salida-history-erp-note')).toBeInTheDocument();
    expect(post.mock.calls.filter(([path]) => path === '/integration/aero/movements')).toHaveLength(0);
  });

  it('audits a correlated bridge error without writing the mirror', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'network-error', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    await renderReady('/salida-history?movimentos_attempt=network-error&aero_action=movimentos&aero_error=timeout');
    expect(await screen.findByTestId('salida-history-erp-note')).toBeInTheDocument();
    await waitFor(() => expect(lineOf('result', 'read_history').attemptId).toBe('network-error'));
    expect(post.mock.calls.filter(([path]) => path === '/integration/aero/movements')).toHaveLength(0);
  });

  it('reports a refused ERP response without overwriting the snapshot', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'read-error', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    const data = encodeURIComponent(JSON.stringify({ success: false, message: 'ERP indisponível' }));
    await renderReady(`/salida-history?movimentos_attempt=read-error&aero_action=movimentos&aero_data=${data}`);
    expect(await screen.findByTestId('salida-history-erp-note')).toHaveTextContent('ERP indisponível');
    await waitFor(() => expect(lineOf('result', 'read_history').attemptId).toBe('read-error'));
    expect(post.mock.calls.filter(([path]) => path === '/integration/aero/movements')).toHaveLength(0);
  });

  it('stores valid movements even when a returned seat is unreadable or skipped', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'read-partial', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    const data = encodeURIComponent(JSON.stringify({
      success: true,
      data: [
        { ENT_LAN: 42 },
        { ENT_LAN: 43, PRO_COD: '001357', PRO_DES: 'DISCO', PRO_QTD: 10, ENT_DTA: '2026-11-13', ENT_USU: 'OPERADOR', ENTSAI: 'S' },
      ],
    }));
    await renderReady(`/salida-history?movimentos_attempt=read-partial&aero_action=movimentos&aero_data=${data}`);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/integration/aero/movements', expect.objectContaining({
      date: '2026-11-13',
      movements: [expect.objectContaining({ ent_lan: 43 })],
    }), expect.anything()));
    expect(await screen.findByTestId('salida-history-erp-note')).toHaveTextContent(i18n.t('salida.erpSyncSuccess', { count: 1 }));
    await waitFor(() => expect(lineOf('result', 'read_history').attemptId).toBe('read-partial'));
  });

  it('stores valid movements when bridge response reports omitted seats', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'bridge-skipped', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    const data = encodeURIComponent(JSON.stringify({
      success: true,
      data: [
        { ENT_LAN: 44, PRO_COD: '001357', PRO_DES: 'DISCO', PRO_QTD: 5, ENT_DTA: '2026-11-13', ENT_USU: 'OPERADOR', ENTSAI: 'S' },
      ],
      skipped: 9,
    }));
    await renderReady(`/salida-history?movimentos_attempt=bridge-skipped&aero_action=movimentos&aero_data=${data}`);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/integration/aero/movements', expect.objectContaining({
      date: '2026-11-13',
      movements: [expect.objectContaining({ ent_lan: 44 })],
    }), expect.anything()));
    expect(await screen.findByTestId('salida-history-erp-note')).toHaveTextContent(i18n.t('salida.erpSyncSuccess', { count: 1 }));
  });

  it('reports a failed snapshot save instead of claiming synchronization', async () => {
    saveSalidaMovementsAttempt({ action: 'movimentos', attemptId: 'save-error', startedAt: 1_700_000_000_000, date: '2026-11-13' });
    post.mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/integration/aero/log') { audit.push(body as Record<string, unknown>); return { ok: true }; }
      if (path === '/integration/aero/movements') throw new Error('storage failed');
      return {};
    });
    const data = encodeURIComponent(JSON.stringify({ success: true, data: [] }));
    await renderReady(`/salida-history?movimentos_attempt=save-error&aero_action=movimentos&aero_data=${data}`);
    expect(await screen.findByTestId('salida-history-erp-note')).toHaveTextContent(i18n.t('salida.erpSyncSaveFailed'));
    await waitFor(() => expect(lineOf('result', 'read_history').attemptId).toBe('save-error'));
    expect(lineOf('result', 'read_history').error).toBeTruthy();
    expect(localStorage.getItem(SALIDA_MOVEMENTS_ATTEMPT_KEY)).toBeNull();
    await waitFor(() => expect(screen.getByTestId('test-location')).not.toHaveTextContent('aero_data'));
  });
  it('shows the reconciliation state and the ENT_LAN of each card', async () => {
    await renderReady();

    expect(screen.getByTestId('salida-badge-1').textContent).toBe('Conciliado');
    expect(screen.getByTestId('salida-entlan-1').textContent).toContain('4242');
    expect(screen.getByTestId('salida-badge-2').textContent).toBe('Pendente');
  });

  it('hides the code and the per-item block, and keeps the code in the accessible name', async () => {
    await renderReady();

    const item = screen.getByTestId('salida-item-10');
    expect(item.textContent).toContain('EMBALAG. NHOQUE 1kg');
    // The code is traceability and the block already names the header: neither earns a slot on the phone.
    expect(item.textContent).not.toContain('1474');
    expect(item.textContent).not.toContain(i18n.t('salida.blocks.embalagens'));
    expect(item.querySelector('[aria-label*="1474"]')).not.toBeNull();
    // The block is still named once, in the header of the card.
    expect(screen.getByTestId('salida-movement-1').textContent).toContain(i18n.t('salida.blocks.embalagens'));
  });

  it('offers Reenviar ao ERP only for a movement the ERP has not confirmed', async () => {
    await renderReady();

    expect(screen.queryByTestId('salida-resend-1')).toBeNull();
    expect(screen.getByTestId('salida-resend-2')).toBeInTheDocument();

    // Un movimiento conciliado en parte no está pendiente; su tarjeta vive en un día pasado, que ya no dibuja
    // tarjetas: la regla del pasado es sólo el bloque de compartir.
    expect(screen.queryByTestId('salida-resend-1')).toBeNull();
  });

  it('narrows the day by block', async () => {
    await renderReady();

    fireEvent.click(screen.getByTestId('salida-block-filter-bobinas'));

    expect(screen.queryByTestId('salida-movement-1')).toBeNull();
    expect(screen.getByTestId('salida-movement-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('salida-block-filter-all'));
    expect(screen.getByTestId('salida-movement-1')).toBeInTheDocument();
  });

  it('opens another day from its chip, and the past keeps only the share block', async () => {
    await renderReady();

    expect(screen.queryByTestId('salida-share-day')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('salida-history-day-2026-11-12'));

    await waitFor(() => expect(screen.getByTestId('salida-share-day')).toBeInTheDocument());
    // Ni tarjetas, ni estados, ni fotos: el día pasado sólo se comparte.
    expect(screen.queryByTestId('salida-movement-3')).toBeNull();
    expect(screen.queryByTestId('salida-badge-3')).toBeNull();
    expect(screen.queryByTestId('salida-history-actions')).toBeNull();
  });

  it('opens on plant today by default, showing empty state when today has no movements (Requirement 2)', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/salida/history') {
        return {
          days: [
            { date: '2026-11-12', total_units: 5, movements: [PARTIAL_OTHER_DAY] },
          ],
        };
      }
      return {};
    });

    await renderReady('/salida-history');

    // Should open on today (2026-11-13) rather than 2026-11-12 (the first listed day with data)
    expect(screen.getByTestId('salida-history-empty')).toBeInTheDocument();
    expect(screen.getByTestId('salida-empty-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('salida-movement-3')).toBeNull();
  });

  it('falls back to plant today when the URL date is not a real date (Requirement 2)', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/salida/history') {
        return {
          days: [
            { date: '2026-11-12', total_units: 5, movements: [PARTIAL_OTHER_DAY] },
          ],
        };
      }
      return {};
    });

    const { unmount } = await renderReady('/salida-history?date=2099-01-01');
    expect(screen.getByTestId('salida-history-empty')).toBeInTheDocument();
    unmount();

    await renderReady('/salida-history?date=not-a-date');
    expect(screen.getByTestId('salida-history-empty')).toBeInTheDocument();
  });

  /**
   * El pasado es el registro de lo que se lanzó: debajo del selector de fecha queda **sólo** el bloque de
   * compartir. Sin nota de solo lectura, sin filtros, sin tarjetas, sin fotos y sin el sync del ERP, que es de hoy.
   */
  it('on an earlier day only the share block is drawn, and yesterday offers no ERP sync', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? {
            days: [
              { date: '2026-11-13', total_units: 20, movements: [PENDING_BOBINA] },
              {
                date: '2026-11-12',
                total_units: 20,
                movements: [
                  movement({
                    id: 88,
                    movement_date: '2026-11-12',
                    photos: [
                      {
                        id: 881,
                        file_path: '881.jpg',
                        file_size: 100,
                        mime_type: 'image/jpeg',
                        url: '/api/salida/photos/881',
                        publicUrl: 'https://example.test/api/salida/photos/public/881',
                        created_at: '',
                      },
                    ],
                  }),
                ],
              },
            ],
          }
        : url === '/reports/day/salidas?date=2026-11-13'
          ? { date: '2026-11-13', operators: [], totalUnits: 0, movementCount: 0 }
          : {},
    );

    // Hoy: se opera, se comparte y se sincroniza.
    await renderReady('/salida-history?date=2026-11-13');
    expect(screen.getByTestId('salida-history-actions')).toBeInTheDocument();
    expect(screen.getByTestId('salida-history-erp-sync')).toBeInTheDocument();
    expect(screen.getByTestId('salida-report-section')).toBeInTheDocument();
    expect(screen.getByTestId('salida-resend-2')).toBeInTheDocument();

    // El pasado: sólo el share.
    fireEvent.click(screen.getByTestId('salida-history-day-2026-11-12'));
    await waitFor(() => expect(screen.getByTestId('salida-share-day')).toBeInTheDocument());

    expect(screen.queryByTestId('salida-history-readonly-note')).toBeNull();
    expect(screen.queryByTestId('salida-history-actions')).toBeNull();
    expect(screen.queryByTestId('salida-resend-88')).toBeNull();
    expect(screen.queryByTestId('salida-photo-881')).toBeNull();
    expect(screen.queryByTestId('salida-photo-input')).toBeNull();
    expect(screen.queryByTestId('salida-share-88')).toBeNull();
    expect(screen.queryByTestId('salida-history-erp-sync')).toBeNull();
    expect(screen.queryByTestId('salida-report-section')).toBeNull();
  });

  it('hands the movement summary to the share helper from the card action', async () => {
    // The sheet, the WhatsApp link and the clipboard are the helper's business and are pinned in
    // `lib/salida-share.test.ts`; what this page owns is that the card hands over the right text.
    shareSalidaMock.mockClear();
    shareSalidaMock.mockResolvedValue('shared');

    await renderReady();
    fireEvent.click(screen.getByTestId('salida-share-1'));

    await waitFor(() => expect(shareSalidaMock).toHaveBeenCalledTimes(1));
    const args = shareSalidaMock.mock.calls[0]![0] as { text: string };
    expect(args.text).toContain('13/11/2026');
    expect(args.text).toContain('WILKIN');
    expect(args.text).toContain('EMBALAG. NHOQUE 1kg');
  });





  it('has no Conferir no ERP: the day is synchronised in the report, not here', async () => {
    await renderReady();

    // The history shows what this operator launched. Reading the company's mirror belongs to the report, so the
    // button that armed that trip is gone -- and with it the error line it used to write.
    expect(screen.queryByTestId('salida-check-erp')).toBeNull();
    expect(screen.queryByTestId('salida-check-error')).toBeNull();
    expect(ticket).not.toHaveBeenCalled();
  });

  it('logs the resend before leaving, and closes it with the answer that comes back', async () => {
    ticket.mockImplementation(async () => ({ ticket: 't-2', ticketUrl: 'https://app.example/t/2', expiresAt: '' }));

    await renderReady();
    fireEvent.click(screen.getByTestId('salida-resend-2'));

    await waitFor(() => expect(audit.length).toBeGreaterThan(0));
    const requested = lineOf('requested', 'salida_sync');
    expect(requested.event).toBe('salida_sync');
    expect(requested.client).toBe('web');
    expect(requested.destinationUrl).toBe(SALIDA_AUDIT_DESTINATION);
    // One product is one payload, not a list of one: the log reads the same shape a single trip sends.
    expect(requested.payload).toEqual(expect.objectContaining({ PRO_COD: '001900', PRO_QTD: 300 }));

    const stored = JSON.parse(localStorage.getItem(SALIDA_PENDING_ATTEMPT_STORAGE_KEY) ?? 'null') as {
      action: string;
      attemptId: string;
    } | null;
    expect(stored?.action).toBe('saida');
    expect(requested.attemptId).toBe(stored?.attemptId);
    expectNoCredential(audit);
  });

  it('pairs the resend with the answer that comes back, and clears what was owed', async () => {
    ticket.mockImplementation(async () => ({ ticket: 't-11', ticketUrl: 'https://app.example/t/11', expiresAt: '' }));

    const first = await renderReady();
    fireEvent.click(screen.getByTestId('salida-resend-2'));

    await waitFor(() => expect(audit.length).toBeGreaterThan(0));
    const requested = lineOf('requested', 'salida_sync');
    const stored = JSON.parse(localStorage.getItem(SALIDA_PENDING_ATTEMPT_STORAGE_KEY) ?? 'null') as {
      action: string;
      attemptId: string;
    } | null;
    expect(stored?.action).toBe('saida');
    expect(stored?.attemptId).toBe(requested.attemptId);
    // The trip is armed and owed: the history says so until the answer arrives.
    expect(localStorage.getItem(SALIDA_OUTBOX_KEY)).not.toBeNull();

    first.unmount();
    const data = encodeURIComponent(JSON.stringify({ success: true, message: 'Saida enviada' }));
    await renderReady(`/salida-history?date=2026-11-13&saida_attempt=${requested.attemptId}&aero_action=saida&aero_data=${data}`);

    await waitFor(() => expect(lineOf('result', 'salida_sync').attemptId).toBe(requested.attemptId));
    const result = lineOf('result', 'salida_sync');
    expect(result.httpStatus).toBe(200);
    expect(result.response).toBe('Saida enviada');
    expect(localStorage.getItem(SALIDA_OUTBOX_KEY)).toBeNull();
    expectNoCredential(audit);
  });

  it('closes the resent trip with its result line and clears what was owed', async () => {
    saveAeroPendingAttempt({
      action: 'saida',
      attemptId: 'attempt-resend-1',
      startedAt: 1_700_000_000_000,
      date: '2026-11-13',
    });
    const data = encodeURIComponent(JSON.stringify({ success: true, message: 'Saida enviada' }));

    await renderReady(`/salida-history?date=2026-11-13&saida_attempt=attempt-resend-1&aero_action=saida&aero_data=${data}`);

    await waitFor(() => expect(audit.length).toBeGreaterThan(0));
    const result = lineOf('result', 'salida_sync');
    expect(result.event).toBe('salida_sync');
    expect(result.phase).toBe('result');
    expect(result.attemptId).toBe('attempt-resend-1');
    expect(result.httpStatus).toBe(200);
    expect(result.response).toBe('Saida enviada');
    expect(localStorage.getItem(SALIDA_PENDING_ATTEMPT_STORAGE_KEY)).toBeNull();

    // The operator reads the same dialog the launch screen shows, and the day is read again.
    await waitFor(() => expect(screen.getByTestId('salida-erp-answer')).toBeInTheDocument());
    expect(screen.getByTestId('salida-erp-answer').textContent).toContain('Saida enviada');
    expect(get).toHaveBeenCalledWith('/salida/history');
    expectNoCredential(audit);
  });

  it('opens verdict dialog on return from launch to /salida-history and records erp result (S2)', async () => {
    writeSalidaLastMovement(PENDING_BOBINA);
    saveAeroPendingAttempt({
      action: 'saida',
      attemptId: 'attempt-launch-s2',
      startedAt: 1_700_000_000_000,
      date: '2026-11-13',
    });
    const data = encodeURIComponent(JSON.stringify({ success: true, message: 'Saida gravada com sucesso' }));

    await renderReady(`/salida-history?saida_attempt=attempt-launch-s2&aero_action=saida&aero_data=${data}`);

    await waitFor(() => expect(screen.getByTestId('salida-erp-answer')).toBeInTheDocument());
    expect(screen.getByTestId('salida-erp-answer').textContent).toContain('Saida gravada com sucesso');
    expect(screen.getByTestId('salida-success-dialog')).toBeInTheDocument();

    expect(post).toHaveBeenCalledWith('/salida/2/erp-result', {
      status: 'sent',
      message: 'Saida gravada com sucesso',
    });

    const result = lineOf('result', 'salida_sync');
    expect(result.attemptId).toBe('attempt-launch-s2');
    expect(result.httpStatus).toBe(200);
    expect(result.response).toBe('Saida gravada com sucesso');
    expect(localStorage.getItem(SALIDA_PENDING_ATTEMPT_STORAGE_KEY)).toBeNull();
  });

  it('correctly reads a multi-product batch response on return in SalidaHistoryPage (S2)', async () => {
    writeSalidaLastMovement({ ...PENDING_BOBINA, expectedPayloads: 2 });
    const batchAnswer = [
      { success: true, message: 'Item 1 OK' },
      { success: true, message: 'Item 2 OK' },
    ];
    const data = encodeURIComponent(JSON.stringify(batchAnswer));

    saveAeroPendingAttempt({ action: 'saida', attemptId: 'batch', startedAt: Date.now() });
    await renderReady(`/salida-history?saida_attempt=batch&aero_action=saida&aero_data=${data}`);

    const answer = await screen.findByTestId('salida-erp-answer');
    expect(answer.textContent).toContain(i18n.t('salida.erpAccepted'));

    expect(post).toHaveBeenCalledWith('/salida/2/erp-result', {
      status: 'sent',
      message: null,
    });
  });

  it('renders honest unreadable verdict when bridge answer is corrupted on return in SalidaHistoryPage (S2)', async () => {
    writeSalidaLastMovement({ ...PENDING_BOBINA, expectedPayloads: 2 });
    const data = encodeURIComponent('corrupted-batch-data');

    saveAeroPendingAttempt({ action: 'saida', attemptId: 'unreadable', startedAt: Date.now() });
    await renderReady(`/salida-history?saida_attempt=unreadable&aero_action=saida&aero_data=${data}`);

    const answer = await screen.findByTestId('salida-erp-answer');
    expect(answer.textContent).toContain(i18n.t('salida.erpUnreadable'));

    expect(post).toHaveBeenCalledWith('/salida/2/erp-result', {
      status: 'failed',
      message: null,
    });
  });
});

/**
 * The iPhone remediation: the day can be shared from the filter card, the cards carry a green WhatsApp action,
 * and the screen stacks its header and its chips instead of squeezing them into two columns at 390 px.
 *
 * `shareSalida` is the seam: it is the one function that decides between the share sheet, WhatsApp and the
 * clipboard, so the page is asserted on what it hands over (text and files) and not on how a browser behaves.
 */
const { shareSalidaMock } = vi.hoisted(() => ({
  shareSalidaMock: vi.fn(async (_args: { text: string; photos?: File[] }) => 'shared' as const),
}));

vi.mock('../../lib/salida', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/salida')>()),
  shareSalida: (args: { text: string; photos?: File[] }) => shareSalidaMock(args),
}));

const WITH_PHOTO = movement({
  id: 7,
  photos: [
    {
      id: 71,
      file_path: 'a.jpg',
      file_size: 10,
      mime_type: 'image/jpeg',
      url: '/api/salida/photos/71',
      publicUrl: 'https://example.test/api/salida/photos/public/aaa',
      created_at: '2026-11-13T11:00:00.000Z',
    },
    {
      id: 72,
      file_path: 'b.jpg',
      file_size: 10,
      mime_type: 'image/jpeg',
      url: '/api/salida/photos/72',
      publicUrl: 'https://example.test/api/salida/photos/public/bbb',
      created_at: '2026-11-13T11:00:00.000Z',
    },
  ],
});

describe('SalidaHistoryPage — iPhone share and layout', () => {
  beforeEach(() => {
    shareSalidaMock.mockClear();
    shareSalidaMock.mockResolvedValue('shared');
    globalThis.fetch = (async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    })) as unknown as typeof fetch;
  });

  it('keeps the day share visible and disabled when the day has no movements, and says why', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-14', total_units: 0, movements: [] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-14');

    const button = screen.getByTestId('salida-share-day');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('salida-share-day-empty').textContent).toBe(
      i18n.t('salida.shareDayEmpty'),
    );
  });

  it('shares the day with its summary and every photo of the visible movements', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 23, movements: [RECONCILED, WITH_PHOTO] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-13');
    fireEvent.click(screen.getByTestId('salida-share-day'));

    await waitFor(() => expect(shareSalidaMock).toHaveBeenCalledTimes(1));
    const args = shareSalidaMock.mock.calls[0]![0];
    expect(args.text).toContain('Movimientos: 2');
    expect(args.text).toContain('EMBALAG. NHOQUE 1kg');
    expect(args.text).not.toContain('Total:');
    expect(args.photos?.length).toBe(2);
    expect(args.photos?.[0]).toBeInstanceOf(File);
  });

  it('shares one movement with its own photos from the green card action', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 20, movements: [WITH_PHOTO] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-13');
    const button = screen.getByTestId('salida-share-7');
    // La etiqueta es la corta; el envío sigue siendo el mismo WhatsApp con las fotos del movimiento.
    expect(button.textContent).toContain(i18n.t('salida.share'));
    fireEvent.click(button);

    await waitFor(() => expect(shareSalidaMock).toHaveBeenCalledTimes(1));
    const args = shareSalidaMock.mock.calls[0]![0];
    expect(args.text).toContain('EMBALAG. NHOQUE 1kg');
    expect(args.photos?.length).toBe(2);
  });

  it('replaces the bare empty paragraph with an icon, a sentence and a launch action', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-14', total_units: 0, movements: [] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-14');

    expect(screen.getByTestId('salida-history-empty')).toBeInTheDocument();
    expect(screen.getByTestId('salida-empty-title').textContent).toBe(i18n.t('salida.historyEmptyTitle'));
    expect(screen.getByTestId('salida-empty-cta').textContent).toContain(i18n.t('salida.launch'));
  });

  it('stacks the header and lays the chips out 2x2 on a phone', async () => {
    await renderReady();

    expect(screen.getByTestId('salida-history-header').className).toContain('flex-col');
    expect(screen.getByTestId('salida-history-header').className).toContain('sm:flex-row');
    expect(screen.getByTestId('salida-block-filter').className).toContain('grid-cols-2');
    expect(screen.getByTestId('salida-block-filter').className).toContain('sm:flex');
    expect(screen.getByTestId('salida-history-actions').className).toContain('flex-col');
    expect(screen.getByTestId('salida-history-actions').className).toContain('sm:flex-row');
  });

  it('keeps the help button in the title row and a compact launch link in its own row', async () => {
    await renderReady();

    const header = screen.getByTestId('salida-history-header');
    const help = screen.getByTestId('salida-history-help');
    const launch = screen.getByTestId('salida-history-launch');

    expect(header.contains(help)).toBe(true);
    expect(help.contains(launch)).toBe(false);
    // The help sits beside the title, not at the end of the actions row.
    expect(help.parentElement?.tagName).toBe('DIV');
    expect(launch.closest('[data-testid="salida-history-help"]')).toBeNull();

    // The rest of the histories offer a compact link, not a full-width button: `flex-1`/`w-full` stretched it
    // across the phone and made the header look like a primary action.
    expect(launch.tagName).toBe('A');
    expect(launch.getAttribute('href')).toBe('/salida');
    expect(launch.className).toContain('shrink-0');
    expect(launch.className).not.toContain('flex-1');
    expect(launch.className).not.toContain('w-full');
    expect(launch.className).toContain('h-11');
    // Short label on the phone, full one from `sm` up.
    expect(launch.textContent).toContain(i18n.t('salida.launchShort'));
    expect(launch.textContent).toContain(i18n.t('salida.launch'));
    expect(within(launch).getByText(i18n.t('salida.launchShort')).className).toContain('sm:hidden');
    expect(within(launch).getByText(i18n.t('salida.launch')).className).toContain('hidden');
  });
});

/**
 * A photo the retention cleanup removed leaves a row the history still points at.
 *
 * The card must not draw a broken image over that row: the bytes answer 404, the exit is still the exit, and the
 * reader needs to be told the file is gone instead of being shown a browser's broken-image glyph.
 */
describe('SalidaHistoryPage — a photo the retention window already removed', () => {
  it('replaces the broken image with the plain unavailable notice in both keys', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 20, movements: [WITH_PHOTO] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    const card = screen.getByTestId('salida-movement-7');
    const images = within(card).getAllByRole('img');
    expect(images).toHaveLength(2);

    // The first photo's file is gone: the server answered 404, which is what an image error means here.
    fireEvent.error(images[0]!);

    expect(screen.queryByTestId('salida-photo-71')).toBeNull();
    const notice = screen.getByTestId('salida-photo-unavailable-71');
    expect(notice.textContent).toContain(i18n.t('salida.photoUnavailable'));
    expect(screen.getByTestId('salida-photo-unavailable-note').textContent).toBe(
      i18n.t('salida.photoUnavailableBody'),
    );

    // The other photo is untouched: one evicted file is not a reason to hide the rest of the card.
    expect(screen.getByTestId('salida-photo-72')).not.toBeNull();
    expect(within(card).getAllByRole('img')).toHaveLength(1);
    expect(within(card).getByTestId(`salida-total-7`).textContent).toContain('20');
  });
});

describe('SalidaHistoryPage — T3 per-movement state, relaunch, operator filtering and WhatsApp', () => {
  it('renders Enviado ao ERP badge when movement has erp status sent and does not offer relaunch', async () => {
    const sentMovement = movement({
      id: 50,
      erp: { status: 'sent', message: 'OK', sentAt: '2026-11-13T12:00:00Z' },
      reconciliation: { status: 'pending', ent_lans: [], matched_item_ids: [] },
    });

    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 20, movements: [sentMovement] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    const badge = screen.getByTestId('salida-badge-50');
    expect(badge.textContent).toBe('Enviado ao ERP');
    expect(screen.queryByTestId('salida-resend-50')).toBeNull();
  });

  it('filters movements to session user when multiple operators are present in the day, with no worker filter', async () => {
    const wilkinMovement = movement({ id: 101, username: 'wilkin' });
    const jaimeMovement = movement({ id: 102, username: 'jaime' });

    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 40, movements: [wilkinMovement, jaimeMovement] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    // Shows only wilkin's movement (session user)
    expect(screen.getByTestId('salida-movement-101')).toBeInTheDocument();
    expect(screen.queryByTestId('salida-movement-102')).toBeNull();

    // No worker filter UI exists
    expect(screen.queryByTestId('salida-worker-filter')).toBeNull();
    expect(screen.queryByRole('combobox', { name: /operador|trabajador/i })).toBeNull();
  });

  it('persists phone number to storage, displays live message preview, and has no copy report button', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 20, movements: [RECONCILED] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    const phoneInput = screen.getByTestId('salida-phone-input') as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: '11988887777' } });

    expect(phoneInput.value).toBe('(11) 98888-7777');
    expect(localStorage.getItem('trindade.salida.whatsapp-phone.v1')).toBe('(11) 98888-7777');

    const preview = screen.getByTestId('salida-preview-message');
    expect(preview.textContent).toContain('Salidas del día — 13/11/2026');
    expect(preview.textContent).toContain('EMBALAG. NHOQUE 1kg');

    // The copy button was removed per user request: only WhatsApp send button remains
    expect(screen.queryByTestId('salida-copy-day')).toBeNull();
    expect(screen.getByTestId('salida-share-day')).toBeInTheDocument();
  });

  it('allows adding a photo to a movement card with fewer than 3 photos and deletes existing photo', async () => {
    const singlePhotoMovement = movement({
      id: 50,
      photos: [
        {
          id: 501,
          file_path: '501.jpg',
          file_size: 1024,
          mime_type: 'image/jpeg',
          url: '/api/salida/photos/501',
          publicUrl: 'https://example.test/api/salida/photos/public/501',
          created_at: '2026-11-13T12:00:00.000Z',
        },
      ],
    });

    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 20, movements: [singlePhotoMovement] }] }
        : {},
    );
    upload.mockResolvedValue({ photo: { id: 502 } });
    del.mockResolvedValue({ success: true });

    await renderReady('/salida-history?date=2026-11-13');

    // Delete existing photo
    const deleteBtn = screen.getByTestId('salida-photo-delete-501');
    expect(deleteBtn).toBeInTheDocument();
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(del).toHaveBeenCalledWith('/salida/photos/501'));

    // Add photo
    const photoInput = screen.getByTestId('salida-photo-input');
    expect(photoInput).toBeInTheDocument();
    const newFile = new File(['image-bytes'], 'test.jpg', { type: 'image/jpeg' });
    fireEvent.change(photoInput, { target: { files: [newFile] } });
    await waitFor(() => expect(upload).toHaveBeenCalledWith('/salida/50/photos', expect.any(FormData)));
  });

  /**
   * Las fotos de un movimiento son de quien lo lanzó.
   *
   * El histórico muestra lo de todos, y también lo que llegó del ERP. Una foto de otro operario se ve y no se
   * toca: sin selector para agregar y sin borrar. El servidor rechaza el intento igual (403 `SALIDA_NOT_OWNER`);
   * esto es la mitad que se ve.
   */
  /**
   * Las miniaturas del día acompañan al mensaje, también en el pasado -- donde es lo único que se muestra además
   * del texto --. Son de solo lectura: no agregan ni borran.
   */
  it('shows the photos of the day above the shared message, in the past too', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? {
            days: [
              {
                date: '2026-11-12',
                total_units: 20,
                movements: [
                  movement({
                    id: 90,
                    movement_date: '2026-11-12',
                    photos: [
                      { id: 901, file_path: 'a.jpg', file_size: 1, mime_type: 'image/jpeg', url: '/api/salida/photos/901', publicUrl: 'https://example.test/901.jpg', created_at: '' },
                    ],
                  }),
                ],
              },
            ],
          }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-12');

    const strip = screen.getByTestId('salida-share-photos');
    expect(strip).toBeInTheDocument();
    expect(screen.getByTestId('salida-share-photo-901')).toHaveAttribute('src', 'https://example.test/901.jpg');
    expect(strip.querySelectorAll('button')).toHaveLength(0);
  });

  /**
   * El mensaje incluye lo que el ERP registró de otros operarios, sin repetir lo local.
   *
   * La sección del Relatório trae a quien sólo existe en la empresa; el texto del día tiene que decirlo, porque es
   * lo que el grupo va a leer.
   */
  it('merges the ERP-only operators into the day message', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 20, movements: [PENDING_BOBINA] }] }
        : url === '/reports/day/salidas?date=2026-11-13'
          ? {
              date: '2026-11-13',
              totalUnits: 7,
              movementCount: 1,
              operators: [
                {
                  name: 'Vinícius R',
                  username: 'vinicius',
                  units: 7,
                  erpOnly: true,
                  products: [{ code: '2500', name: 'GORDURA', block: 'materia-prima', units: 7 }],
                },
              ],
            }
          : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    await waitFor(() =>
      expect(screen.getByTestId('salida-preview-message').textContent).toContain('VINICIUS:'),
    );
    expect(screen.getByTestId('salida-preview-message').textContent).toContain('GORDURA: 7 un');
    // El operario local sigue estando una sola vez.
    expect(screen.getByTestId('salida-preview-message').textContent).toContain('WILKIN:');
  });

  it('the ERP sync button is the amber compact one, in its own row', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 20, movements: [PENDING_BOBINA] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    const sync = screen.getByTestId('salida-history-erp-sync');
    expect(sync.className).toContain('bg-amber-600');
    expect(sync.className).toContain('min-h-[44px]');
    expect(sync.textContent).toContain(i18n.t('massas.syncHeader.action'));
    // El sync vive en la tarjeta de la fecha y los filtros, y la hora lo acompaña; no hay una segunda instancia.
    const actions = screen.getByTestId('salida-history-actions');
    expect(actions.contains(sync)).toBe(true);
    // La tarjeta es la misma que monta la fecha y los chips.
    expect(actions.parentElement?.contains(screen.getByTestId('salida-history-date'))).toBe(true);
    // En 390 px la fila se apila; en desktop, filtros a la izquierda y sync a la derecha.
    expect(actions.className).toContain('flex-col');
    expect(actions.className).toContain('sm:flex-row');
    expect(actions.className).toContain('sm:justify-between');
    expect(screen.getAllByTestId('salida-history-erp-sync')).toHaveLength(1);
    expect(screen.getAllByTestId('salida-last-sync')).toHaveLength(1);
    // El bloque del ERP ya no repite el botón: sólo muestra las salidas del espejo.
    expect(
      screen.getByTestId('salida-history-erp').querySelector('[data-testid="salida-history-erp-sync"]'),
    ).toBeNull();
  });

  it('does not offer photo actions on a movement launched by another operator', async () => {
    const foreign = movement({
      id: 70,
      username: 'ana',
      display_name: 'Ana',
      photos: [
        { id: 701, file_path: 'a.jpg', file_size: 100, mime_type: 'image/jpeg', url: '/api/salida/photos/701', created_at: '' },
      ],
    });

    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 20, movements: [foreign] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    expect(screen.getByTestId('salida-photo-701')).toBeInTheDocument();
    expect(screen.queryByTestId('salida-photo-delete-701')).toBeNull();
    expect(screen.queryByTestId('salida-photo-input')).toBeNull();
  });

  it('shows max photos reached notice when a movement already has 3 photos and hides add control', async () => {
    const fullPhotosMovement = movement({
      id: 60,
      photos: [
        { id: 601, file_path: '1.jpg', file_size: 100, mime_type: 'image/jpeg', url: '/api/salida/photos/601', created_at: '' },
        { id: 602, file_path: '2.jpg', file_size: 100, mime_type: 'image/jpeg', url: '/api/salida/photos/602', created_at: '' },
        { id: 603, file_path: '3.jpg', file_size: 100, mime_type: 'image/jpeg', url: '/api/salida/photos/603', created_at: '' },
      ],
    });

    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [{ date: '2026-11-13', total_units: 20, movements: [fullPhotosMovement] }] }
        : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    expect(screen.getByTestId('salida-photos-max-60')).toBeInTheDocument();
    expect(screen.queryByTestId('salida-photo-input')).toBeNull();
  });

  /**
   * Un día con datos sólo del ERP no es un día vacío.
   *
   * La tarjeta grande -- «Não há saídas neste dia» y su CTA -- es para el día sin nada; con asientos del ERP a la
   * vista, la pantalla muestr esas tarjetas y el mensaje se puede compartir.
   */
  it('an ERP-only day draws no empty card and can still be shared', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [] }
        : url === '/reports/day/salidas?date=2026-11-13'
          ? {
              date: '2026-11-13',
              totalUnits: 7,
              movementCount: 1,
              operators: [
                {
                  name: 'Vinícius R',
                  username: 'vinicius',
                  units: 7,
                  erpOnly: true,
                  products: [{ code: '2500', name: 'GORDURA', block: 'materia-prima', units: 7 }],
                },
              ],
            }
          : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    await waitFor(() =>
      expect(screen.getByTestId('salida-preview-message').textContent).toContain('GORDURA: 7 un'),
    );
    expect(screen.queryByTestId('salida-history-empty')).toBeNull();
    expect(screen.queryByText(i18n.t('salida.historyEmptyTitle'))).toBeNull();
    expect(screen.getByTestId('salida-share-day')).toBeEnabled();
    // El bloque del Relatório es el que muestra el día.
    expect(screen.getByTestId('salida-report-section')).toBeInTheDocument();
  });

  it('a day with nothing at all keeps the empty card and its launch CTA', async () => {
    get.mockImplementation(async (url: string) =>
      url === '/salida/history'
        ? { days: [] }
        : url === '/reports/day/salidas?date=2026-11-13'
          ? { date: '2026-11-13', totalUnits: 0, movementCount: 0, operators: [] }
          : {},
    );

    await renderReady('/salida-history?date=2026-11-13');

    expect(screen.getByTestId('salida-history-empty')).toBeInTheDocument();
    expect(screen.getByTestId('salida-empty-cta')).toBeInTheDocument();
    expect(screen.getByTestId('salida-share-day')).toBeDisabled();
  });


  /**
   * Un borrador se retira con confirmación, y el resultado se lee en una ventana.
   *
   * La tarjeta ya no esconde la acción en un menú: el botón aparece sólo cuando el servidor la va a aceptar, la
   * confirmación dice de qué movimiento se trata y el resultado -- éxito o rechazo -- se cierra a mano. Nada queda
   * escrito dentro del día, porque la lista cambia debajo.
   */
  it('withdraws a draft after confirmation and answers in a dialog', async () => {
    await renderReady();

    fireEvent.click(screen.getByTestId('salida-delete-2'));

    // La confirmación nombra el movimiento; el borrado no salió antes de confirmarlo.
    const confirm = await screen.findByTestId('salida-delete-confirm');
    expect(within(confirm).getByText('Excluir salida del 13/11/2026')).toBeTruthy();
    expect(del).not.toHaveBeenCalled();

    del.mockResolvedValue({ success: true });
    fireEvent.click(within(confirm).getByText('Eliminar permanentemente'));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/salida/2'));
    const result = await screen.findByTestId('salida-delete-result');
    expect(within(result).getByText('Movimiento excluido.')).toBeTruthy();
    // Y no hay franja inline con el mismo mensaje.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('explains a refused delete in the same dialog, with the server sentence', async () => {
    await renderReady();

    fireEvent.click(screen.getByTestId('salida-delete-2'));
    const confirm = await screen.findByTestId('salida-delete-confirm');
    del.mockRejectedValue(new Error('Esta saída já foi confirmada pelo ERP e não pode ser excluída'));
    fireEvent.click(within(confirm).getByText('Eliminar permanentemente'));

    const result = await screen.findByTestId('salida-delete-result');
    expect(within(result).getByText('Esta saída já foi confirmada pelo ERP e não pode ser excluída')).toBeTruthy();
  });

  /**
   * Un fallo de sync o de red no se dibuja debajo del botón.
   *
   * El botón del espejo falla por credenciales, por el Wi-Fi de la planta o porque el ERP rechazó: la frase se lee
   * en una ventana que el operario cierra, igual que el resto de las respuestas de la app.
   */
  it('opens the sync failure in a dialog instead of a note under the button', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/salida/history') return history();
      return {};
    });

    await renderReady();
    fireEvent.click(screen.getByTestId('salida-history-erp-sync'));

    const dialog = await screen.findByTestId('salida-history-erp-note');
    expect(within(dialog).getByText('El ERP no está configurado en este dispositivo.')).toBeTruthy();
    // La nota ya no vive como un párrafo de la pantalla: el diálogo es su único lugar.
    expect(screen.queryByText('El ERP no está configurado en este dispositivo.', { selector: 'p.text-xs' })).toBeNull();
  });


  /**
   * El conteo de pendientes ya no vive arriba del día.
   *
   * Cada tarjeta dice su estado y ofrece su reenvío o su exclusión: una cifra suelta en la tarjeta de la fecha se
   * leía como un estado del día que nadie podía resolver desde ahí.
   */
  it('draws no pending count above the day', async () => {
    await renderReady();

    expect(screen.queryByTestId('salida-pending-count')).toBeNull();
    expect(screen.queryByText(/Pendente: \d+/)).toBeNull();
    // El estado de cada movimiento y su acción siguen.
    expect(screen.getByTestId('salida-badge-2')).toBeInTheDocument();
    expect(screen.getByTestId('salida-resend-2')).toBeInTheDocument();
  });

  /**
   * La tarjeta se lee como un producto, no como una pila de botones.
   *
   * En 390 px el selector de fotos era un botón enorme y cada acción ocupaba su propio renglón a todo el ancho: la
   * ficha quedaba más alta que los datos que trae. Ahora la evidencia es una fila (o miniaturas), la ayuda vive en
   * 11 px y las acciones van de a dos por fila.
   */
  it('lays the movement card out like a product card on a phone', async () => {
    await renderReady();

    const card = screen.getByTestId('salida-movement-2');
    // Un solo selector de fotos, compacto, y sin el mensaje de máximo todavía.
    expect(within(card).getAllByTestId('salida-photo-input')).toHaveLength(1);
    expect(screen.getByTestId('salida-photo-picker-2').className).toContain('min-h-[44px]');
    // Sin fotos, una fila que lo dice y la ayuda de formatos, no media tarjeta.
    expect(within(card).getByTestId('salida-no-photos-2').textContent).toBeTruthy();
    expect(within(card).getAllByText(/0 de|de 3/i).some((node) => node.className.includes('text-[11px]'))).toBe(true);
    // Las acciones se dibujan en una grilla de dos columnas que en escritorio pasa a línea.
    const actions = within(card).getByTestId('salida-share-2').parentElement!;
    expect(actions.className).toContain('grid-cols-2');
    expect(actions.className).toContain('sm:flex');
    expect(within(actions).getByTestId('salida-delete-2')).toBeInTheDocument();
    expect(within(actions).getByTestId('salida-resend-2')).toBeInTheDocument();
    // Ningún botón full-width apilado en la ficha.
    expect(within(card).getByTestId('salida-share-2').className).toContain('min-h-[44px]');
  });

  /**
   * Un sync que arranca no abre un modal rojo.
   *
   * El progreso ("Leyendo las salidas del ERP…") acompaña al botón mientras el pedido viaja; el modal queda para lo
   * que de verdad falló. Antes, disparar el viaje abría un diálogo de error con la frase de progreso.
   */
  it('shows the sync progress beside the button, not as an error dialog', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/salida/history') return history();
      return {};
    });
    // El viaje queda en vuelo el tiempo justo para leer el estado de progreso.
    let release: (value: boolean) => void = () => {};
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const { triggerAeroMovementsSync } = await import('../../lib/aero-mirror');
    const spy = vi.spyOn({ triggerAeroMovementsSync }, 'triggerAeroMovementsSync');
    void spy;
    vault.mockResolvedValue({
      configured: true,
      wsUrl: 'http://192.168.25.250:1453/api',
      username: 'WILKIN',
      hasPassword: true,
      updatedAt: null,
    });
    ticket.mockReturnValue(pending);

    await renderReady();
    fireEvent.click(screen.getByTestId('salida-history-erp-sync'));

    await waitFor(() => expect(screen.getByTestId('salida-history-erp-progress')).toBeTruthy());
    // No hay modal: ni el de error del sync ni el de la nota.
    expect(screen.queryByTestId('salida-history-erp-note')).toBeNull();
    expect(screen.queryByText('Leyendo las salidas del ERP…', { selector: '[role="alertdialog"] *' })).toBeNull();

    release(true);
    await waitFor(() => expect(screen.queryByTestId('salida-history-erp-progress')).toBeNull());
    expect(screen.queryByTestId('salida-history-erp-note')).toBeNull();
  });

  /**
   * Si el viaje no sale, el modal dice el fallo de acceso, con Cerrar.
   *
   * El texto de error es el del ERP inaccesible/configurado mal, no la frase de progreso que antes se colaba.
   */
  it('explains a sync that could not start with the access error and closes it', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/salida/history') return history();
      if (url === '/aero/vault/settings') {
        return { configured: true, wsUrl: 'http://192.168.25.250:1453/api', username: 'WILKIN', hasPassword: true };
      }
      return {};
    });
    vault.mockResolvedValue({
      configured: true,
      wsUrl: 'http://192.168.25.250:1453/api',
      username: 'WILKIN',
      hasPassword: true,
      updatedAt: null,
    });
    ticket.mockRejectedValue(new Error('offline'));

    await renderReady();
    fireEvent.click(screen.getByTestId('salida-history-erp-sync'));

    const dialog = await screen.findByTestId('salida-history-erp-note');
    expect(within(dialog).getByText('No se pudo consultar el ERP. Revisá el acceso configurado y volvé a intentarlo.')).toBeTruthy();
    expect(within(dialog).queryByText('Leyendo las salidas del ERP…')).toBeNull();
    // Cerrar devuelve la pantalla.
    fireEvent.click(within(dialog).getByText('Cerrar'));
    await waitFor(() => expect(screen.queryByTestId('salida-history-erp-note')).toBeNull());
  });

  /** En la celda de 390 px el botón verde dice «Compartilhar», no una frase que se corta con puntos. */
  it('labels the share button short enough for a two-column grid', async () => {
    await renderReady();

    const share = screen.getByTestId('salida-share-2');
    expect(share.textContent).toBe(i18n.t('salida.share'));
    expect(share.textContent).not.toBe(i18n.t('salida.shareWhatsApp'));
    // El texto no se recorta: el tramo que puede encogerse no lleva la clase de truncado en escritorio.
    const label = share.querySelector('span');
    expect(label?.className).toContain('truncate');
    expect(label?.className).toContain('sm:overflow-visible');
  });

  /**
   * Un outbox huérfano no se anuncia: ni banner, ni `salida-history-outbox`.
   *
   * La cola vive en localStorage y sobrevive al borrado del movimiento. Si el día leído no la contiene -- o el ERP
   * ya lo confirmó -- el aviso no se dibuja y la cola se limpia.
   */
  it('never announces an outbox whose movement is gone', async () => {
    const { SALIDA_OUTBOX_KEY } = await import('../../lib/salida');
    localStorage.setItem(
      SALIDA_OUTBOX_KEY,
      JSON.stringify({
        movementId: 999,
        date: '2026-11-13',
        trips: [{ action: 'saida', payloads: [{ PRO_COD: '1357', PRO_QTD: 2000 }] }],
        startedAt: new Date().toISOString(),
      }),
    );

    await renderReady();

    await waitFor(() => expect(screen.queryByTestId('salida-history-outbox')).toBeNull());
    expect(screen.queryByText(/pendente de envio/i)).toBeNull();
    // Y la cola se retiró del teléfono en vez de reaparecer en la próxima visita.
    await waitFor(() => expect(localStorage.getItem(SALIDA_OUTBOX_KEY)).toBeNull());
  });

  /** Con el movimiento real pendiente, el aviso sí está. */
  it('announces a pending outbox when the movement exists and is still pending', async () => {
    const { SALIDA_OUTBOX_KEY } = await import('../../lib/salida');
    localStorage.setItem(
      SALIDA_OUTBOX_KEY,
      JSON.stringify({
        movementId: 2,
        date: '2026-11-13',
        trips: [{ action: 'saida', payloads: [{ PRO_COD: '1357', PRO_QTD: 2000 }] }],
        startedAt: new Date().toISOString(),
      }),
    );

    await renderReady();

    expect(await screen.findByTestId('salida-history-outbox')).toBeInTheDocument();
  });

  /** Borrar la tarjeta se lleva también lo que el teléfono debía por ella. */
  it.each(['another date', 'a failed read'] as const)('keeps a real pending trip after %s', async (scenario) => {
    localStorage.setItem(SALIDA_OUTBOX_KEY, JSON.stringify({
      movementId: 2,
      date: '2026-11-13',
      trips: [{ action: 'saida', payloads: [{ PRO_COD: '1357', PRO_QTD: 2000 }] }],
      startedAt: new Date().toISOString(),
    }));
    if (scenario === 'a failed read') {
      get.mockImplementation(async (path: string) => {
        if (path === '/salida/history') throw new Error('History unavailable');
        return {};
      });
    }
    const view = await renderReady(scenario === 'another date' ? '/salida-history?date=2026-11-12' : '/salida-history');
    expect(screen.queryByTestId('salida-history-outbox')).not.toBeInTheDocument();
    view.unmount();
    get.mockImplementation(async (path: string) => path === '/salida/history' ? history() : {});
    await renderReady();
    expect(await screen.findByTestId('salida-history-outbox')).toBeInTheDocument();
  });

  it.each(['sent', 'partial', 'missing date'] as const)('does not discard retry trips after %s', async (scenario) => {
    const { SALIDA_OUTBOX_KEY } = await import('../../lib/salida');
    const saved = JSON.stringify({
      movementId: 2,
      date: '2026-11-13',
      trips: [{ action: 'saida', payloads: [{ PRO_COD: '1357', PRO_QTD: 2000 }] }],
      startedAt: new Date().toISOString(),
    });
    localStorage.setItem(SALIDA_OUTBOX_KEY, saved);
    const movement: SalidaMovement = {
      ...PENDING_BOBINA,
      erp: { status: scenario === 'partial' ? 'partial' : 'sent', message: null, sentAt: new Date().toISOString() },
    };
    get.mockImplementation(async (path: string) => path === '/salida/history' ? {
      days: scenario === 'missing date' ? [] : [{ date: '2026-11-13', total_units: 3, movements: [movement] }],
    } : {});
    await renderReady();
    expect(screen.queryByTestId('salida-history-outbox')).not.toBeInTheDocument();
    expect(localStorage.getItem(SALIDA_OUTBOX_KEY)).toBe(saved);
  });

  it.each(['ready', 'review'] as const)('only sends the stored head when the retry is %s', async (retryState) => {
    const payloads = [{ PRO_COD: '000999', PRO_QTD: 100 }];
    localStorage.setItem(SALIDA_OUTBOX_KEY, JSON.stringify({
      movementId: 2,
      date: '2026-11-13',
      trips: [{ action: 'saida', payloads }],
      retryState,
      startedAt: new Date().toISOString(),
    }));
    const pending = { ...PENDING_BOBINA, erp: { status: 'sent', message: null, sentAt: '2026-11-13' } };
    get.mockImplementation(async (path: string) => path === '/salida/history' ? {
      days: [{ date: '2026-11-13', total_units: 3, movements: [pending] }],
    } : {});
    await renderReady();
    if (retryState === 'review') {
      expect(screen.queryByTestId('salida-resend-2')).not.toBeInTheDocument();
      expect(ticket).not.toHaveBeenCalled();
    } else {
      fireEvent.click(await screen.findByTestId('salida-resend-2'));
      await waitFor(() => expect(ticket).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ payloads })));
    }
  });

  it('ignores a delayed return from an earlier attempt without consuming the current trip', async () => {
    const queue = JSON.stringify({
      movementId: 2,
      date: '2026-11-13',
      trips: [{ action: 'saida', payloads: [{ PRO_COD: '000999', PRO_QTD: 100 }] }],
      startedAt: '2026-11-13T11:00:00Z',
      retryState: 'ready',
      currentTripPayloads: 1,
    });
    localStorage.setItem(SALIDA_OUTBOX_KEY, queue);
    writeSalidaLastMovement({ ...PENDING_BOBINA, expectedPayloads: 1 });
    saveAeroPendingAttempt({ action: 'saida', attemptId: 'current', startedAt: Date.now(), date: '2026-11-13' });
    const data = encodeURIComponent(JSON.stringify([{ success: true }]));
    await renderReady(`/salida-history?saida_attempt=earlier&aero_action=saida&aero_data=${data}`);
    expect(post).not.toHaveBeenCalledWith('/salida/2/erp-result', expect.anything());
    expect(screen.queryByTestId('salida-erp-answer')).not.toBeInTheDocument();
    expect(localStorage.getItem(SALIDA_OUTBOX_KEY)).toBe(queue);
    expect(localStorage.getItem(SALIDA_PENDING_ATTEMPT_STORAGE_KEY)).toContain('current');
  });

  it('allows a different movement to dispatch after an abandoned reservation expires', async () => {
    saveAeroPendingAttempt({ action: 'saida', attemptId: 'abandoned', startedAt: Date.now() - 60 * 60 * 1000 });
    ticket.mockRejectedValue(new Error('offline'));
    await renderReady();
    fireEvent.click(await screen.findByTestId('salida-resend-2'));
    await waitFor(() => expect(ticket).toHaveBeenCalledTimes(1));
  });

  it('does not request a second ticket while the first ticket is unresolved', async () => {
    get.mockImplementation(async (path: string) => path === '/salida/history' ? {
      days: [{ date: '2026-11-13', total_units: 6, movements: [PENDING_BOBINA, { ...PENDING_BOBINA, id: 4 }] }],
    } : {});
    ticket.mockImplementation(() => new Promise(() => {}));
    await renderReady();
    fireEvent.click(await screen.findByTestId('salida-resend-2'));
    await waitFor(() => expect(ticket).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('salida-resend-4'));
    expect(ticket).toHaveBeenCalledTimes(1);
  });

  it('clears the outbox and the last movement when the draft is deleted', async () => {
    const { SALIDA_OUTBOX_KEY, SALIDA_LAST_MOVEMENT_KEY, writeSalidaLastMovement } = await import('../../lib/salida');
    localStorage.setItem(
      SALIDA_OUTBOX_KEY,
      JSON.stringify({
        movementId: 2,
        date: '2026-11-13',
        trips: [{ action: 'saida', payloads: [{ PRO_COD: '1357', PRO_QTD: 2000 }] }],
        startedAt: new Date().toISOString(),
      }),
    );
    writeSalidaLastMovement({ ...PENDING_BOBINA });

    await renderReady();
    expect(await screen.findByTestId('salida-history-outbox')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('salida-delete-2'));
    const confirm = await screen.findByTestId('salida-delete-confirm');
    del.mockResolvedValue({ success: true });
    fireEvent.click(within(confirm).getByText('Eliminar permanentemente'));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/salida/2'));
    await waitFor(() => expect(localStorage.getItem(SALIDA_OUTBOX_KEY)).toBeNull());
    expect(localStorage.getItem(SALIDA_LAST_MOVEMENT_KEY)).toBeNull();
    expect(screen.queryByTestId('salida-history-outbox')).toBeNull();
  });
});
