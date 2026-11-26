import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MassasManualSyncResult } from './MassasHistoryPage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';
import type { MassasLaunchDayView } from '../lib/massas';
import { saoPauloDaysAgo, saoPauloToday, saoPauloYesterday } from '../lib/date';
import { saveAeroSettings } from '../lib/aero-integration';
import { loadAeroPendingAttempt, saveAeroPendingAttempt } from '../lib/aero-pending-attempt';
import { readAeroQueue, writeAeroQueue } from '../lib/aero-queue';

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
  it('shows a failed day read in a dismissible dialog', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch?')) throw new Error('Read refused');
      return { days: [] };
    });
    renderPage();
    const dialog = await screen.findByRole('dialog', { name: i18n.t('ui.actionFailed') });
    expect(dialog).toHaveTextContent('Read refused');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('massas-history-feedback-dismiss'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

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

    // Past day: sin sync y sin cuerpo, sólo el mensaje.
    renderPage('/massas-history?date=2026-10-26');
    await screen.findByTestId('massas-whatsapp-phone');
    expect(screen.queryByTestId('massas-sync-erp')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-individual-launches')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-collective-table')).not.toBeInTheDocument();
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

    // 2. On Past Day: debajo del selector queda sólo el mensaje; sin nota, sin tabla y sin acciones.
    renderPage('/massas-history?date=2026-10-26');

    expect(await screen.findByTestId('massas-whatsapp-phone')).toBeInTheDocument();
    expect(screen.queryByTestId('massas-history-readonly')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-sync-erp')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-individual-launches')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Editar|Editar lançamento/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-unified-send')).not.toBeInTheDocument();
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

    // El día pasado no dibuja su tabla: muestra su mensaje, con el texto de ese día.
    await waitFor(() => expect(currentUrl).toBe('/massas-history?date=2026-10-26'));
    // La prévia es la del día elegido y la tabla no se dibuja.
    await waitFor(() =>
      expect(screen.getByTestId('massas-preview-message').textContent).toContain('26/10/2026'),
    );
    expect(screen.queryByTestId('massas-collective-table')).not.toBeInTheDocument();
  });

  it('says the day is empty instead of looking like a failed read', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) return { days: [] };
      if (url.startsWith('/massas-launch?')) return dayView('2026-10-27', null);
      return { date: '2026-10-27', movements: [] };
    });

    renderPage(`/massas-history?date=${saoPauloToday()}`);

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

  /**
   * El borrado de un lanzamiento pregunta y responde en ventanas, no en la tabla.
   *
   * El `window.confirm` del navegador y el cartel inline se fueron: la confirmación nombra el lanzamiento y el
   * resultado — éxito o rechazo — se cierra a mano. La tabla se recarga después de borrar.
   */
  it('asks before deleting a launch and answers in a dialog', async () => {
    const today = saoPauloToday();
    const { container } = renderPage(`/massas-history?date=${today}`);

    await screen.findByTestId('massas-individual-launches');
    const buttons = screen.getAllByTitle(/Excluir|Eliminar|Borrar/i);
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]!);

    const confirm = await screen.findByTestId('massas-delete-confirm');
    expect(within(confirm).getByText(/Excluir o lançamento de|¿Excluir el lanzamiento de/)).toBeTruthy();
    // El borrado no salió antes de confirmarlo, y no hay confirmación nativa.
    expect(del).not.toHaveBeenCalled();
    const confirmSpy = vi.spyOn(window, 'confirm');
    expect(confirmSpy).not.toHaveBeenCalled();

    del.mockResolvedValue({ ok: true });
    fireEvent.click(within(confirm).getByText(/Eliminar permanentemente|Excluir permanentemente/));

    await waitFor(() => expect(del).toHaveBeenCalled());
    const result = await screen.findByTestId('massas-delete-result');
    const message = within(result).getByText(/Lanzamiento borrado|Lanzamento excluído|Lançamento borrado/i);
    expect(message).toBeTruthy();
    // El mensaje vive en la ventana y en ningún otro lugar de la página.
    expect(screen.queryAllByText(message.textContent ?? '').length).toBe(1);
    expect(container.querySelector('[data-testid="massas-delete-result"]')).toBeTruthy();
  });

  /**
   * El veredicto del envío manual al ERP se lee en una ventana, no en un banner, en sus dos tonos.
   *
   * Es la pieza que la página monta con el resultado de la confirmación: éxito y fallo abren el mismo diálogo y no
   * dejan ningún aviso `role="status"` en la página.
   */
  it('answers the manual ERP confirmation in a dialog, success or failure', async () => {
    const success = render(
      <MassasManualSyncResult
        result={{ tone: 'success', message: 'Resultado registrado no servidor' }}
        onClose={() => {}}
      />,
    );
    const dialog = await screen.findByTestId('massas-sync-manual-result');
    expect(within(dialog).getByText('Resultado registrado no servidor')).toBeInTheDocument();
    expect(document.querySelector('[role="status"]')).toBeNull();
    success.unmount();

    render(
      <MassasManualSyncResult
        result={{ tone: 'error', message: 'No se pudo registrar o resultado no servidor' }}
        onClose={() => {}}
      />,
    );
    const failed = await screen.findByTestId('massas-sync-manual-result');
    expect(within(failed).getByText('No se pudo registrar o resultado no servidor')).toBeInTheDocument();
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('restores inFlight batch items and logs launch_sync error when wifi_required returns', async () => {
    localStorage.clear();
    saveAeroSettings({
      wsUrl: 'http://192.168.25.250:1453/api',
      username: 'APL',
      syncEnabled: true,
      hasPassword: true,
      lastSyncAt: null,
    });
    const today = saoPauloToday();
    writeAeroQueue({
      createdAt: new Date().toISOString(),
      date: today,
      items: [],
      inFlight: [
        { productCode: '60', productName: 'MASSA DISCO 400G', quantity: 40000, launchIds: [243] },
        { productCode: '5000', productName: 'MASSA ROLO 1KG', quantity: 4000, launchIds: [244] },
        { productCode: '1047', productName: 'MASSA ROLO 2KG', quantity: 17400, launchIds: [245] },
      ],
    });
    saveAeroPendingAttempt({
      action: 'entrada_lote',
      attemptId: 'attempt-lote-wifi',
      startedAt: Date.now() - 10_000,
      date: today,
    });

    renderPage(
      `/massas-history?aero_action=entrada_lote&aero_data=&aero_error=wifi_required&aero_msg=${encodeURIComponent('No Wi-Fi')}`,
    );

    await screen.findByText(i18n.t('massas.aero.wifiRequiredTitle'));

    await waitFor(() => {
      const logCall = post.mock.calls.find(([url]) => url === '/integration/aero/log');
      expect(logCall).toBeTruthy();
      expect(logCall![1]).toMatchObject({
        event: 'launch_sync',
        phase: 'result',
        attemptId: 'attempt-lote-wifi',
        error: 'AERO_WIFI_REQUIRED',
      });
    });

    const restored = readAeroQueue();
    expect(restored?.inFlight).toEqual([]);
    expect(restored?.items.map((item) => item.productCode)).toEqual(['60', '5000', '1047']);
    expect(loadAeroPendingAttempt('entrada_lote')).toBeNull();
  });

  it('resolves stored bridge callback only once even when vault settings update re-runs the effect', async () => {
    localStorage.clear();
    saveAeroSettings({
      wsUrl: 'http://192.168.25.250:1453/api',
      username: 'APL',
      syncEnabled: true,
      hasPassword: true,
      lastSyncAt: null,
    });
    const today = saoPauloToday();
    saveAeroPendingAttempt({
      action: 'entrada',
      attemptId: 'attempt-single-stored',
      startedAt: Date.now(),
      date: today,
    });

    let lastResultCalls = 0;
    let releaseLastResult!: (value: unknown) => void;
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/integration/aero/bridge-tickets/last-result')) {
        lastResultCalls += 1;
        return await new Promise((resolve) => {
          releaseLastResult = resolve;
        });
      }
      if (url.startsWith('/integration/aero/settings') || url.startsWith('/admin/aero/vault')) {
        return { configured: true, wsUrl: 'http://192.168.25.99:1453/api', username: 'APL', hasPassword: true };
      }
      if (url.startsWith('/massas-launch/history')) return { days: [] };
      if (url.startsWith('/massas-launch?')) return dayView(today, 'MASSA DE PASTEL');
      if (url.startsWith('/integration/aero/movements')) return { date: today, movements: [] };
      return {};
    });

    renderPage('/massas-history?aero_action=entrada&aero_data=&aero_result=stored');

    await waitFor(() => expect(lastResultCalls).toBe(1));
    await act(async () => {
      releaseLastResult({ data: { launch: { success: true, message: 'OK' } } });
    });

    await waitFor(() => {
      const logCalls = post.mock.calls.filter(([url]) => url === '/integration/aero/log');
      expect(logCalls.length).toBe(1);
    });
    expect(lastResultCalls).toBe(1);
  });
});
