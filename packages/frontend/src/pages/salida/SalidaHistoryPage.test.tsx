import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import {
  SALIDA_AUDIT_DESTINATION,
  SALIDA_OUTBOX_KEY,
  type SalidaMovement,
} from '../../lib/salida';
import {
  AERO_PENDING_ATTEMPT_STORAGE_KEY,
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
const ticket = vi.fn();

/** Every audit line this page posted, in order. */
let audit: Array<Record<string, unknown>> = [];

vi.mock('../../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
  apiUrl: (path: string) => path,
  ApiClientError: class ApiClientError extends Error {},
}));

vi.mock('../../lib/aero-vault', () => ({
  requestAeroBridgeTicket: (...args: unknown[]) => ticket(...args),
}));

const { SalidaHistoryPage } = await import('./SalidaHistoryPage');

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

async function renderReady(entry = '/salida-history') {
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <SalidaHistoryPage />
    </MemoryRouter>,
  );
  await screen.findByTestId('salida-history-date');
  return view;
}

beforeEach(async () => {
  get.mockReset();
  post.mockReset();
  ticket.mockReset();
  localStorage.clear();
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
  it('shows the reconciliation state and the ENT_LAN of each card', async () => {
    await renderReady();

    expect(screen.getByTestId('salida-badge-1').textContent).toBe('ERP OK');
    expect(screen.getByTestId('salida-entlan-1').textContent).toContain('4242');
    expect(screen.getByTestId('salida-badge-2').textContent).toBe('Pendente');
  });

  it('offers Reenviar ao ERP only for a movement the ERP has not confirmed', async () => {
    await renderReady();

    expect(screen.queryByTestId('salida-resend-1')).toBeNull();
    expect(screen.getByTestId('salida-resend-2')).toBeInTheDocument();

    // A partial reconciliation is not pending: resending it would duplicate the seats the company already has.
    fireEvent.click(screen.getByTestId('salida-history-day-2026-11-12'));
    await waitFor(() => expect(screen.getByTestId('salida-movement-3')).toBeInTheDocument());
    expect(screen.queryByTestId('salida-resend-3')).toBeNull();
  });

  it('narrows the day by block', async () => {
    await renderReady();

    fireEvent.click(screen.getByTestId('salida-block-filter-bobinas'));

    expect(screen.queryByTestId('salida-movement-1')).toBeNull();
    expect(screen.getByTestId('salida-movement-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('salida-block-filter-all'));
    expect(screen.getByTestId('salida-movement-1')).toBeInTheDocument();
  });

  it('opens another day from its chip', async () => {
    await renderReady();

    expect(screen.queryByTestId('salida-movement-3')).toBeNull();
    fireEvent.click(screen.getByTestId('salida-history-day-2026-11-12'));

    await waitFor(() => expect(screen.getByTestId('salida-movement-3')).toBeInTheDocument());
    expect(screen.getByTestId('salida-badge-3').textContent).toBe('Parcial');
  });

  it('copies the summary when the platform has no share sheet', async () => {
    const written: string[] = [];
    Object.defineProperty(globalThis.navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => void written.push(value) },
    });

    await renderReady();
    fireEvent.click(screen.getByTestId('salida-share-1'));

    await waitFor(() => expect(written.length).toBe(1));
    expect(written[0]).toContain('13/11/2026');
    expect(written[0]).toContain('WILKIN');
    expect(written[0]).toContain('EMBALAG. NHOQUE 1kg');
  });

  it('says the ERP could not be read instead of leaving the button spinning', async () => {
    ticket.mockRejectedValue(new Error('vault refused'));

    await renderReady();
    fireEvent.click(screen.getByTestId('salida-check-erp'));

    await waitFor(() => expect(screen.getByTestId('salida-check-error')).toBeInTheDocument());
    expect(screen.getByTestId('salida-check-erp')).toBeEnabled();
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(ticket.mock.calls[0]?.[0]).toMatchObject({ action: 'movimentos' });
  });

  it('logs the read it asks for, with the attempt it can pair later', async () => {
    ticket.mockImplementation(async () => ({ ticket: 't-1', ticketUrl: 'https://app.example/t/1', expiresAt: '' }));

    await renderReady();
    fireEvent.click(screen.getByTestId('salida-check-erp'));

    await waitFor(() => expect(audit.length).toBeGreaterThan(0));
    const requested = lineOf('requested', 'read_history');

    expect(requested.event).toBe('read_history');
    expect(requested.phase).toBe('requested');
    expect(requested.client).toBe('web');
    expect(requested.destinationUrl).toBe(SALIDA_AUDIT_DESTINATION);
    expect(requested.payload).toEqual(expect.objectContaining({ date: '2026-11-13' }));
    expect(ticket.mock.calls[0]?.[0]).toMatchObject({ action: 'movimentos' });

    const stored = JSON.parse(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY) ?? 'null') as {
      action: string;
      attemptId: string;
      date?: string;
    } | null;
    expect(stored?.action).toBe('movimentos');
    expect(stored?.date).toBe('2026-11-13');
    expect(requested.attemptId).toBe(stored?.attemptId);
    expectNoCredential(audit);
  });

  it('stores the answer of Conferir no ERP and closes the attempt it opened', async () => {
    saveAeroPendingAttempt({
      action: 'movimentos',
      attemptId: 'attempt-read-7',
      startedAt: 1_700_000_000_000,
      date: '2026-11-13',
    });
    const seats = [
      {
        ENT_LAN: 4242,
        PRO_COD: '001474',
        PRO_DES: 'EMBALAG. NHOQUE 1kg',
        PRO_QTD: 2000,
        ENT_DTA: '2026-11-13',
        ENT_USU: 'wilkin',
        ENTSAI: 'S',
      },
      {
        ENT_LAN: 4243,
        PRO_COD: '001900',
        PRO_DES: 'BOBINA ROLO',
        PRO_QTD: 300,
        ENT_DTA: '2026-11-13',
        ENT_USU: 'wilkin',
        ENTSAI: 'S',
      },
    ];
    const data = encodeURIComponent(JSON.stringify({ success: true, data: seats }));

    await renderReady(`/salida-history?date=2026-11-13&aero_action=movimentos&aero_data=${data}`);

    await waitFor(() => expect(post).toHaveBeenCalledWith('/integration/aero/movements', expect.anything(), expect.anything()));

    await waitFor(() => expect(audit.length).toBeGreaterThan(0));
    const result = lineOf('result', 'read_history');
    expect(result.event).toBe('read_history');
    expect(result.phase).toBe('result');
    expect(result.attemptId).toBe('attempt-read-7');
    expect(result.httpStatus).toBe(200);
    expect(String(result.note ?? '')).toMatch(/seats=2/);
    expect(String(result.note ?? '')).toMatch(/stored=2/);
    expect(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY)).toBeNull();
    expectNoCredential(audit);
  });

  it('closes the read attempt when the shortcut comes back with an error', async () => {
    saveAeroPendingAttempt({
      action: 'movimentos',
      attemptId: 'attempt-read-8',
      startedAt: 1_700_000_000_000,
      date: '2026-11-13',
    });

    await renderReady('/salida-history?date=2026-11-13&aero_error=wifi_required&aero_msg=Sem%20rede');

    await waitFor(() => expect(screen.getByTestId('salida-check-error')).toBeInTheDocument());
    await waitFor(() => expect(audit.length).toBeGreaterThan(0));

    const result = lineOf('result', 'read_history');
    expect(result.attemptId).toBe('attempt-read-8');
    expect(result.httpStatus).toBeNull();
    expect(String(result.error ?? '')).toMatch(/^AERO_/);
    expect(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY)).toBeNull();
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

    const stored = JSON.parse(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY) ?? 'null') as {
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
    const stored = JSON.parse(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY) ?? 'null') as {
      action: string;
      attemptId: string;
    } | null;
    expect(stored?.action).toBe('saida');
    expect(stored?.attemptId).toBe(requested.attemptId);
    // The trip is armed and owed: the history says so until the answer arrives.
    expect(localStorage.getItem(SALIDA_OUTBOX_KEY)).not.toBeNull();

    first.unmount();
    const data = encodeURIComponent(JSON.stringify({ success: true, message: 'Saida enviada' }));
    await renderReady(`/salida-history?date=2026-11-13&aero_action=saida&aero_data=${data}`);

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

    await renderReady(`/salida-history?date=2026-11-13&aero_action=saida&aero_data=${data}`);

    await waitFor(() => expect(audit.length).toBeGreaterThan(0));
    const result = lineOf('result', 'salida_sync');
    expect(result.event).toBe('salida_sync');
    expect(result.phase).toBe('result');
    expect(result.attemptId).toBe('attempt-resend-1');
    expect(result.httpStatus).toBe(200);
    expect(result.response).toBe('Saida enviada');
    expect(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY)).toBeNull();

    // The operator reads the same dialog the launch screen shows, and the day is read again.
    await waitFor(() => expect(screen.getByTestId('salida-erp-answer')).toBeInTheDocument());
    expect(screen.getByTestId('salida-erp-answer').textContent).toContain('Saida enviada');
    expect(get).toHaveBeenCalledWith('/salida/history');
    expectNoCredential(audit);
  });
});
