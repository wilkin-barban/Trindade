import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import {
  SALIDA_AUDIT_DESTINATION,
  SALIDA_FALLBACK_PRODUCTS,
  SALIDA_TICKET_REFUSED,
  writeSalidaLastMovement,
  type SalidaMovement,
} from '../../lib/salida';
import {
  AERO_PENDING_ATTEMPT_STORAGE_KEY,
  saveAeroPendingAttempt,
} from '../../lib/aero-pending-attempt';
import { saoPauloToday } from '../../lib/date';

/**
 * The launch screen of Salida / Baixa, asserted through the things that can go wrong on it.
 *
 * A block that is switched off must take its quantities with it, or the operator discards a block and the numbers
 * come back when it is switched on again. A quantity that is not a whole number of units is not a quantity, and a
 * launch whose ERP step fails has to keep the movement and say so -- the whole point of writing Trindade first.
 *
 * The launch also has to leave a trail. The `salida_sync` pair is asserted here in the three shapes it takes: a
 * ticket the vault refused (nothing left, one requested line with the refusal code), a trip that was armed (a
 * requested line whose attempt is the one stored for the return), and the answer the shortcut brings back (a
 * result line with that same attempt, the ERP's sentence and the HTTP outcome).
 */
const get = vi.fn();
const post = vi.fn();
const upload = vi.fn();
const ticket = vi.fn();

/** Every audit line this page posted, in the order it posted them. */
let audit: Array<Record<string, unknown>> = [];

vi.mock('../../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    upload: (...args: unknown[]) => upload(...args),
  },
  apiUrl: (path: string) => path,
  ApiClientError: class ApiClientError extends Error {},
}));

vi.mock('../../lib/aero-vault', () => ({
  requestAeroBridgeTicket: (...args: unknown[]) => ticket(...args),
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

const { SalidaLaunchPage } = await import('./SalidaLaunchPage');

const MOVEMENT: SalidaMovement = {
  id: 12,
  movement_date: '2026-11-13',
  user_id: 1,
  username: 'wilkin',
  display_name: 'Wilkin',
  created_at: '2026-11-13T11:00:00.000Z',
  items: [
    {
      id: 1,
      product_code: '1474',
      product_name: 'EMBALAG. NHOQUE 1kg',
      block: 'embalagens',
      quantity: 20,
      position: 0,
    },
    {
      id: 2,
      product_code: '1673',
      product_name: 'GORDURA VEGETAL',
      block: 'materia-prima',
      quantity: 5,
      position: 1,
    },
  ],
  photos: [],
  total_units: 25,
  reconciliation: { status: 'pending', ent_lans: [], matched_item_ids: [] },
};

function photoFile(name: string, type = 'image/jpeg'): File {
  return new File(['x'], name, { type });
}

function renderPage(entry = '/salida') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SalidaLaunchPage />
    </MemoryRouter>,
  );
}

async function renderReady(entry = '/salida') {
  const view = renderPage(entry);
  await screen.findByTestId('salida-date');
  return view;
}

/** The two lines of one trip, by phase. */
function lineOf(phase: 'requested' | 'result', event = 'salida_sync'): Record<string, unknown> {
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

beforeEach(async () => {
  get.mockReset();
  post.mockReset();
  upload.mockReset();
  ticket.mockReset();
  localStorage.clear();
  audit = [];

  get.mockImplementation(async (url: string) => {
    if (url === '/salida/catalog') return { products: [...SALIDA_FALLBACK_PRODUCTS] };
    return {};
  });

  post.mockImplementation(async (path: string, body?: unknown) => {
    if (path === '/integration/aero/log') {
      audit.push(body as Record<string, unknown>);
      return { ok: true };
    }
    return { movement: MOVEMENT };
  });

  let objects = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: () => `blob:salida/${++objects}`,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: () => undefined,
  });

  await i18n.changeLanguage('es');
});

describe('SalidaLaunchPage', () => {
  it('shows the plant day and the session operator, read-only', async () => {
    await renderReady();

    expect(screen.getByTestId('salida-date').textContent).toMatch(/^Hoje · \d{2}\/\d{2}\/\d{4}$/);
    expect(screen.getByTestId('salida-operator').textContent).toContain('wilkin');
    // No date input exists: the day is the plant's and the operator cannot choose another one.
    expect(screen.queryByTestId('salida-history-date')).toBeNull();
  });

  it('clears the quantities of a block that is switched off', async () => {
    await renderReady();

    fireEvent.change(screen.getByTestId('salida-quantity-1474'), { target: { value: '20' } });
    expect(screen.getByTestId('salida-summary-units').textContent).toContain('20');

    fireEvent.click(screen.getByTestId('salida-block-switch-embalagens'));

    expect(screen.queryByTestId('salida-quantity-1474')).toBeNull();
    expect(screen.getByTestId('salida-summary-units').textContent).toContain('0');

    fireEvent.click(screen.getByTestId('salida-block-switch-embalagens'));
    expect((screen.getByTestId('salida-quantity-1474') as HTMLInputElement).value).toBe('');
  });

  it('counts only whole units above zero', async () => {
    await renderReady();

    const field = screen.getByTestId('salida-quantity-1474');
    fireEvent.change(field, { target: { value: '2.5' } });

    expect(screen.getByTestId('salida-summary-units').textContent).toContain('0');
    expect(screen.getByTestId('salida-launch')).toBeDisabled();

    fireEvent.change(field, { target: { value: '20' } });
    expect(screen.getByTestId('salida-summary-units').textContent).toContain('20');
    expect(screen.getByTestId('salida-launch')).toBeEnabled();
  });

  it('adds up the products and units of every active block', async () => {
    await renderReady();

    fireEvent.change(screen.getByTestId('salida-quantity-1474'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('salida-quantity-1673'), { target: { value: '5' } });

    expect(screen.getByTestId('salida-summary-products').textContent).toBe('2');
    expect(screen.getByTestId('salida-summary-units').textContent).toContain('25');
  });

  it('refuses a fourth photo', async () => {
    await renderReady();
    const input = screen.getByTestId('salida-photo-input');

    fireEvent.change(input, {
      target: { files: [photoFile('a.jpg'), photoFile('b.jpg'), photoFile('c.jpg')] },
    });
    expect(screen.getAllByTestId(/salida-photo-remove-/)).toHaveLength(3);

    fireEvent.change(input, { target: { files: [photoFile('d.jpg')] } });
    expect(screen.getByTestId('salida-photo-error')).toBeInTheDocument();
    expect(screen.getAllByTestId(/salida-photo-remove-/)).toHaveLength(3);
  });

  it('writes the movement in Trindade before asking the ERP, and keeps it pending when the trip is refused', async () => {
    const order: string[] = [];
    post.mockImplementation(async (path: string, body?: unknown) => {
      // The audit trail is its own column of evidence: it must not disturb the order of the operation itself.
      if (path === '/integration/aero/log') {
        audit.push(body as Record<string, unknown>);
        return { ok: true };
      }
      order.push(`post:${path}`);
      return { movement: MOVEMENT };
    });
    upload.mockImplementation(async () => {
      order.push('upload');
      return { photo: { id: 1 } };
    });
    ticket.mockImplementation(async () => {
      order.push('ticket');
      throw new Error('ticket refused');
    });

    await renderReady();

    fireEvent.change(screen.getByTestId('salida-quantity-1474'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('salida-photo-input'), { target: { files: [photoFile('a.jpg')] } });
    fireEvent.click(screen.getByTestId('salida-launch'));

    await waitFor(() => expect(screen.getByTestId('salida-erp-answer')).toBeInTheDocument());

    expect(order).toEqual(['post:/salida', 'upload', 'ticket']);
    expect(post).toHaveBeenCalledWith('/salida', { items: [{ code: '1474', quantity: 20 }] });
    expect(upload.mock.calls[0]?.[0]).toBe('/salida/12/photos');
    expect(ticket.mock.calls[0]?.[0]).toMatchObject({ action: 'saida' });

    // The movement is not lost: the dialog says the ERP has not answered and the outbox offers a resend.
    expect(screen.getByTestId('salida-erp-answer').textContent).toContain('Todavía no hay respuesta del ERP');
    expect(screen.getByTestId('salida-success-total').textContent).toContain('25');
    expect(screen.getByTestId('salida-outbox')).toBeInTheDocument();
    // And the form is empty, so the same quantities cannot be filed twice.
    expect((screen.getByTestId('salida-quantity-1474') as HTMLInputElement).value).toBe('');
  });

  it('logs a refused ticket with its code and leaves nothing owed', async () => {
    ticket.mockImplementation(async () => {
      throw new Error('ticket refused');
    });

    await renderReady();
    fireEvent.change(screen.getByTestId('salida-quantity-1474'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('salida-launch'));

    await waitFor(() => expect(screen.getByTestId('salida-erp-answer')).toBeInTheDocument());

    await waitFor(() => expect(audit.length).toBeGreaterThan(0));
    const refused = lineOf('requested');
    expect(refused.event).toBe('salida_sync');
    expect(refused.phase).toBe('requested');
    expect(refused.client).toBe('web');
    expect(refused.error).toBe(SALIDA_TICKET_REFUSED);
    expect(String(refused.note ?? '')).toMatch(/not sent/);
    expect(refused.destinationUrl).toBe(SALIDA_AUDIT_DESTINATION);
    // Nothing was armed: no attempt survives to be paired with a callback that will never come.
    expect(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY)).toBeNull();
    expectNoCredential(audit);
  });

  it('stores the attempt it logs, so the answer can be paired with the request', async () => {
    ticket.mockImplementation(async () => ({ ticket: 't-1', ticketUrl: 'https://app.example/t/1', expiresAt: '' }));

    await renderReady();
    fireEvent.change(screen.getByTestId('salida-quantity-1474'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('salida-quantity-1673'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('salida-launch'));

    await waitFor(() => expect(audit.length).toBeGreaterThan(0));

    const requested = lineOf('requested');
    const stored = JSON.parse(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY) ?? 'null') as {
      action: string;
      attemptId: string;
      date?: string;
    } | null;

    expect(requested.event).toBe('salida_sync');
    expect(requested.client).toBe('web');
    expect(requested.error).toBeNull();
    // The trip names its batch, so a launch of more than eight products reads as more than one line.
    expect(String(requested.note ?? '')).toMatch(/trip 1\/1/);
    expect(String(requested.note ?? '')).toMatch(/batch 2/);
    // The payload that was armed is the ERP payload, PRODUCTO by PRODUCTO.
    expect(requested.payload).toEqual([
      expect.objectContaining({ PRO_COD: '001474', PRO_QTD: 2000, PED_USU: 'WILKIN', PED_SER: 'APL' }),
      expect.objectContaining({ PRO_COD: '001673', PRO_QTD: 500, PED_USU: 'WILKIN', PED_SER: 'APL' }),
    ]);
    expect(requested.attemptId).toBe(stored?.attemptId);
    expect(stored?.action).toBe('saida');
    expect(stored?.date).toBe(saoPauloToday());
    expectNoCredential(audit);
  });

  it('closes the trip with a result line that carries the same attempt', async () => {
    writeSalidaLastMovement(MOVEMENT);
    saveAeroPendingAttempt({
      action: 'saida',
      attemptId: 'attempt-saida-42',
      startedAt: 1_700_000_000_000,
      date: '2026-11-13',
    });
    const data = encodeURIComponent(JSON.stringify({ success: true, message: 'Saidas enviadas' }));

    await renderReady(`/salida?aero_action=saida&aero_data=${data}`);

    await screen.findByTestId('salida-erp-answer');
    await waitFor(() => expect(audit.length).toBeGreaterThan(0));

    const result = lineOf('result');
    expect(result.event).toBe('salida_sync');
    expect(result.phase).toBe('result');
    expect(result.client).toBe('web');
    expect(result.attemptId).toBe('attempt-saida-42');
    expect(result.httpStatus).toBe(200);
    expect(result.response).toBe('Saidas enviadas');
    expect(result.error).toBeNull();
    expect(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY)).toBeNull();
    expectNoCredential(audit);
  });

  it('reports a refused ERP answer with no invented HTTP status', async () => {
    saveAeroPendingAttempt({
      action: 'saida',
      attemptId: 'attempt-saida-43',
      startedAt: 1_700_000_000_000,
      date: '2026-11-13',
    });
    const data = encodeURIComponent(JSON.stringify({ success: false, message: 'Produto inexistente' }));

    await renderReady(`/salida?aero_action=saida&aero_data=${data}`);

    await screen.findByTestId('salida-erp-answer');
    await waitFor(() => expect(audit.length).toBeGreaterThan(0));

    const result = lineOf('result');
    expect(result.attemptId).toBe('attempt-saida-43');
    expect(result.httpStatus).toBeNull();
    expect(String(result.error ?? '')).toMatch(/^AERO_/);
    expect(String(result.error ?? '')).toContain('Produto inexistente');
  });

  it('pairs the request and the answer of one trip across the round trip to the shortcut', async () => {
    ticket.mockImplementation(async () => ({ ticket: 't-9', ticketUrl: 'https://app.example/t/9', expiresAt: '' }));

    const first = await renderReady();
    fireEvent.change(screen.getByTestId('salida-quantity-1474'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('salida-launch'));

    await waitFor(() => expect(audit.length).toBeGreaterThan(0));
    const requested = lineOf('requested');
    const stored = JSON.parse(localStorage.getItem(AERO_PENDING_ATTEMPT_STORAGE_KEY) ?? 'null') as {
      attemptId: string;
    } | null;
    expect(stored?.attemptId).toBe(requested.attemptId);

    // The shortcut leaves the page and comes back to a fresh document with the ERP's answer.
    first.unmount();
    const data = encodeURIComponent(JSON.stringify({ success: true, message: 'Saida enviada' }));
    await renderReady(`/salida?aero_action=saida&aero_data=${data}`);

    await waitFor(() => expect(lineOf('result').attemptId).toBe(requested.attemptId));
    const result = lineOf('result');
    expect(result.event).toBe('salida_sync');
    expect(result.httpStatus).toBe(200);
    expect(result.response).toBe('Saida enviada');
    // Both lines are joined by the attempt, which is the whole point of writing it down before leaving.
    expect([requested.attemptId, result.attemptId]).toEqual([stored?.attemptId, requested.attemptId]);
    expectNoCredential(audit);
  });

  it('shows the ERP answer with the summary and the share fallback when the bridge returns', async () => {
    writeSalidaLastMovement(MOVEMENT);
    const data = encodeURIComponent(JSON.stringify({ success: true, message: 'Saidas enviadas' }));

    await renderReady(`/salida?aero_action=saida&aero_data=${data}`);

    const answer = await screen.findByTestId('salida-erp-answer');
    expect(answer.textContent).toContain('Saidas enviadas');
    expect(screen.getByTestId('salida-success-total').textContent).toContain('25');

    const written: string[] = [];
    Object.defineProperty(globalThis.navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => void written.push(value) },
    });

    fireEvent.click(screen.getByTestId('salida-share-whatsapp'));

    await waitFor(() => expect(written.length).toBe(1));
    expect(written[0]).toContain('1474 EMBALAG. NHOQUE 1kg — 20 un');
  });

  it('falls back to the fixed catalogue when the server does not answer', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/salida/catalog') throw new Error('offline');
      return {};
    });

    await renderReady();

    expect(screen.getByTestId('salida-catalog-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('salida-quantity-1474')).toBeInTheDocument();
  });
});

/**
 * The launch screen of the remediation: the beta is enforced by the server and by the route gate, so the visible
 * «Solo wilkin» badge added nothing an operator could act on and only stole the width of the title on a phone.
 *
 * The header is asserted on its stacking classes because that is the defect the screenshot shows: two columns at
 * 390 px turn a two-line title into three lines and a one-line subtitle into six.
 */
describe('SalidaLaunchPage — iPhone header', () => {
  it('shows no private-beta badge and no «Solo wilkin» text', async () => {
    render(
      <MemoryRouter initialEntries={['/salida']}>
        <SalidaLaunchPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('salida-date');

    expect(screen.queryByTestId('salida-beta-badge')).toBeNull();
    expect(screen.queryByTestId('salida-solo-wilkin')).toBeNull();
    expect(screen.queryByText(/solo wilkin/i)).toBeNull();
    expect(screen.queryByText(/beta privada/i)).toBeNull();
  });

  it('stacks the title above the help action on a phone and keeps them in one row on a desktop', async () => {
    render(
      <MemoryRouter initialEntries={['/salida']}>
        <SalidaLaunchPage />
      </MemoryRouter>,
    );
    await screen.findByTestId('salida-date');

    const header = screen.getByTestId('salida-launch-header');
    expect(header.className).toContain('flex-col');
    expect(header.className).toContain('sm:flex-row');
    expect(header.contains(screen.getByTestId('salida-launch-help'))).toBe(true);
  });
});
