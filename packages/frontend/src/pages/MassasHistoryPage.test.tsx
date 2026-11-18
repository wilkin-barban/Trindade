import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';
import type { MassasLaunchDayView } from '../lib/massas';
import { saoPauloDaysAgo, saoPauloToday, saoPauloYesterday } from '../lib/date';
import { saveAeroSettings } from '../lib/aero-integration';

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    del: (...args: unknown[]) => del(...args),
  },
  ApiClientError: class ApiClientError extends Error {},
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'wilkin', role: 'Administrador' },
  }),
}));

const { MassasHistoryPage } = await import('./MassasHistoryPage');

function dayView(date: string, productName: string | null): MassasLaunchDayView {
  const launches = productName
    ? [
        {
          id: 1,
          launch_date: date,
          product_code: '1192',
          product_name: productName,
          boxes: 3,
          units: 30,
          user_id: 1,
          username: 'wilkin',
          display_name: 'Wilkin',
          created_at: `${date}T10:00:00.000Z`,
          updated_at: `${date}T10:00:00.000Z`,
        },
      ]
    : [];
  return {
    date,
    products: productName
      ? [{ code: '1192', name: productName, unitsPerBox: 10, totalBoxes: 3, totalUnits: 30 }]
      : [],
    launches,
    totalBoxes: productName ? 3 : 0,
    totalUnits: productName ? 30 : 0,
  };
}

let currentUrl = '';

function UrlProbe() {
  const location = useLocation();
  currentUrl = `${location.pathname}${location.search}`;
  return null;
}

function renderPage(initialUrl = '/massas-history') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <MassasHistoryPage />
      <UrlProbe />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  get.mockReset();
  post.mockReset();
  put.mockReset();
  del.mockReset();
  currentUrl = '';
  await i18n.changeLanguage('es');
  saveAeroSettings({ wsUrl: 'http://192.168.25.250:1453/api', username: 'APL', syncEnabled: true, hasPassword: true, lastSyncAt: null });

  get.mockImplementation(async (url: string) => {
    if (url.startsWith('/massas-launch/history')) {
      return {
        days: [
          { date: saoPauloToday(), productsCount: 1, totalBoxes: 3, totalUnits: 30, operatorsCount: 1 },
          { date: '2026-10-27', productsCount: 2, totalBoxes: 7, totalUnits: 70, operatorsCount: 3 },
          { date: '2026-10-26', productsCount: 1, totalBoxes: 2, totalUnits: 20, operatorsCount: 1 },
        ],
      };
    }
    if (url.startsWith('/massas-launch?')) return dayView(url.split('date=')[1], 'MASSA DE PASTEL');
    if (url.startsWith('/integration/aero/movements')) {
      return { date: '2026-10-27', movements: [] };
    }
    if (url.startsWith('/integration/aero/settings') || url.startsWith('/admin/aero/vault')) {
      return { configured: true, wsUrl: 'http://192.168.25.250:1453/api', username: 'APL', hasPassword: true };
    }
    return {};
  });
});

describe('MassasHistoryPage', () => {
  it('offers the day through the panel up to today, with chips (Item 2 & 7)', async () => {
    renderPage();

    const field = await screen.findByTestId('massas-history-date');
    expect(field).toHaveAttribute('type', 'date');
    expect(field).toHaveAttribute('max', saoPauloToday());
    expect(field).toHaveAttribute('min', saoPauloDaysAgo(30));

    expect(await screen.findByTestId('massas-history-days')).toBeInTheDocument();
    expect(screen.getByTestId('massas-history-day-2026-10-27')).toHaveTextContent('27/10 · 70');
    expect(screen.getByTestId('massas-history-day-2026-10-26')).toHaveTextContent('26/10 · 20');
  });

  it('renders the 4 sections in history: produção as cards, individuais, coletivo, whatsapp (Item 2)', async () => {
    renderPage();

    // 1. Produção do dia (restyled as cards)
    expect(await screen.findByTestId('massas-unified')).toBeInTheDocument();
    expect(screen.getByTestId('massas-unified-rows')).toBeInTheDocument();

    // 2. Lançamentos Individuais with worker chips
    expect(await screen.findByTestId('massas-individual-launches')).toBeInTheDocument();
    expect(screen.getByTestId('massas-worker-chips')).toBeInTheDocument();

    // 3. Resumo Coletivo do Dia
    expect(await screen.findByTestId('massas-collective-summary')).toBeInTheDocument();

    // 4. Compartilhar por WhatsApp
    expect(await screen.findByTestId('massas-whatsapp-phone')).toBeInTheDocument();
  });

  it('shows ERP sync button for today and hides it for past days (Item 5)', async () => {
    // Today
    const { unmount } = renderPage(`/massas-history?date=${saoPauloToday()}`);
    expect(await screen.findByTestId('massas-sync-erp')).toBeInTheDocument();
    unmount();

    // Past day
    renderPage('/massas-history?date=2026-10-26');
    await screen.findByTestId('massas-individual-launches');
    expect(screen.queryByTestId('massas-sync-erp')).not.toBeInTheDocument();
  });

  it('handles bridge return and opens result modal in history (Item 6)', async () => {
    const payload = [{ PRO_COD: '001192', PRO_QTD: 3000, SUCCESS: true }];
    renderPage(`/massas-history?date=${saoPauloToday()}&aero_action=entrada_lote&aero_data=${encodeURIComponent(JSON.stringify(payload))}`);

    expect(await screen.findByTestId('massa-result-modal')).toBeInTheDocument();
    expect(screen.getByTestId('massa-result-close')).toBeInTheDocument();
  });

  it('handles composite bridge return: updates mirror from read and does not request second trip on close (S3)', async () => {
    const composite = {
      launch: [{ success: true, data: { ENT_LAN: 101 } }],
      read: {
        success: true,
        data: [
          {
            ENT_LAN: 101,
            PRO_COD: '001192',
            PRO_DES: 'MASSA DE PASTEL',
            PRO_QTD: 30,
            ENT_DTA: saoPauloToday(),
            ENT_USU: 'WILKIN',
            ENTSAI: 'E',
          },
        ],
      },
    };

    renderPage(
      `/massas-history?date=${saoPauloToday()}&aero_action=entrada_lote&aero_data=${encodeURIComponent(
        JSON.stringify(composite),
      )}`,
    );

    expect(await screen.findByTestId('massa-result-modal')).toBeInTheDocument();

    // The mirror was updated with the read data directly
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/integration/aero/movements',
        expect.objectContaining({
          date: saoPauloToday(),
          movements: expect.arrayContaining([
            expect.objectContaining({
              ent_lan: 101,
              product_code: '001192',
              movement_type: 'E',
            }),
          ]),
        }),
        expect.anything(),
      );
    });

    // Close the modal: since read was present and valid, it must NOT request a second movimentos ticket
    const closeButton = screen.getByTestId('massa-result-close');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByTestId('massa-result-modal')).not.toBeInTheDocument();
    });

    // Verify post was NEVER called for bridge-tickets
    const bridgeTicketCalls = post.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('bridge-tickets'),
    );
    expect(bridgeTicketCalls).toHaveLength(0);
  });

  it('falls back to auto-read when read is missing or failed (S3)', async () => {
    post.mockImplementation(async (url: string) => {
      if (url.includes('bridge-tickets')) {
        return { ticket: 'tok-123', ticketUrl: 'http://test/redeem', expiresAt: '2099-01-01' };
      }
      return {};
    });

    // Legacy answer: bare array, no composite `read`
    const legacyPayload = [{ success: true, data: { ENT_LAN: 101 } }];
    renderPage(
      `/massas-history?date=${saoPauloToday()}&aero_action=entrada_lote&aero_data=${encodeURIComponent(
        JSON.stringify(legacyPayload),
      )}`,
    );

    expect(await screen.findByTestId('massa-result-modal')).toBeInTheDocument();

    // Closing the modal triggers the fallback auto-read, which requests a movimentos ticket
    const closeButton = screen.getByTestId('massa-result-close');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/integration/aero/bridge-tickets',
        expect.objectContaining({
          action: 'movimentos',
        }),
      );
    });
  });

  it('today is manageable (edit/delete/relaunch) and past days are read-only with visible notice (Item 7)', async () => {
    // 1. On Today: mutations allowed
    const today = saoPauloToday();
    const { unmount } = renderPage(`/massas-history?date=${today}`);

    expect(await screen.findByTestId('massas-individual-launches')).toBeInTheDocument();
    expect(screen.queryByTestId('massas-history-readonly')).not.toBeInTheDocument();
    // Edit/delete controls present
    expect(screen.getAllByTitle(/Editar|Editar lançamento/i).length).toBeGreaterThan(0);

    unmount();

    // 2. On Past Day: mutations hidden, read-only notice visible, WhatsApp kept
    renderPage('/massas-history?date=2026-10-26');

    expect(await screen.findByTestId('massas-history-readonly')).toBeInTheDocument();
    expect(screen.queryByTestId('massas-sync-erp')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Editar|Editar lançamento/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-unified-send')).not.toBeInTheDocument();
    // WhatsApp share is still present
    expect(screen.getByTestId('massas-whatsapp-phone')).toBeInTheDocument();
  });

  it('changes the table when another day is clicked, and keeps the day in the URL', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) {
        return {
          days: [
            { date: '2026-10-27', productsCount: 1, totalBoxes: 3, totalUnits: 30, operatorsCount: 1 },
            { date: '2026-10-26', productsCount: 1, totalBoxes: 3, totalUnits: 30, operatorsCount: 1 },
          ],
        };
      }
      if (url.startsWith('/massas-launch?')) {
        const date = url.split('date=')[1];
        return dayView(date, date === '2026-10-26' ? 'MASSA DE QUEIJO' : 'MASSA DE PASTEL');
      }
      return { date: '2026-10-27', movements: [] };
    });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('massas-history-day-2026-10-26')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('massas-history-day-2026-10-26'));

    expect((await screen.findAllByText('MASSA DE QUEIJO')).length).toBeGreaterThan(0);
    await waitFor(() => expect(currentUrl).toBe('/massas-history?date=2026-10-26'));
  });

  it('says the day is empty instead of looking like a failed read', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) return { days: [] };
      if (url.startsWith('/massas-launch?')) return dayView('2026-10-27', null);
      return { date: '2026-10-27', movements: [] };
    });

    renderPage('/massas-history?date=2026-10-27');

    expect(await screen.findByTestId('massas-history-empty')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // El bloque de compartir sigue ahí, como en Salidas, diciendo que no hay nada que mandar.
    expect(screen.getByTestId('massas-share-day')).toBeDisabled();
    expect(screen.getByTestId('massas-preview-message').textContent).toBe('Sin lanzamientos para compartir');
    // Y el botón de copiar, que era un segundo camino al mismo texto, ya no existe.
    expect(screen.queryByText(/Copiar Reporte|Copiar Relatório|Copiar Relatorio/)).not.toBeInTheDocument();
  });

  it('enables the share when the day has something to send', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) return { days: [] };
      if (url.startsWith('/massas-launch?')) return dayView('2026-10-26', 'MASSA QUADRADA');
      return { date: '2026-10-26', movements: [] };
    });

    renderPage('/massas-history?date=2026-10-26');

    expect(await screen.findByTestId('massas-share-day')).toBeEnabled();
    expect(screen.getByTestId('massas-preview-message').textContent).not.toBe('Sin lanzamientos para compartir');
  });
});
