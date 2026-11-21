import { fireEvent, render, screen , within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';
import type { MassasLaunchDayView } from '../lib/massas';

const get = vi.fn();
const post = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
  ApiClientError: class ApiClientError extends Error {},
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'wilkin', role: 'Administrador' },
  }),
}));

const { MassasLaunchPage } = await import('./MassasLaunchPage');

function sampleDayView(date = '2026-10-30'): MassasLaunchDayView {
  return {
    date,
    products: [
      { code: '1045', name: 'MASSA CASEIRA', unitsPerBox: 10, totalBoxes: 0, totalUnits: 0 },
      { code: '1046', name: 'MASSA DE PASTEL', unitsPerBox: 10, totalBoxes: 0, totalUnits: 0 },
    ],
    launches: [
      {
        id: 101,
        launch_date: date,
        product_code: '1045',
        product_name: 'MASSA CASEIRA',
        boxes: 4,
        units: 40,
        user_id: 1,
        username: 'wilkin',
        display_name: 'Wilkin',
        created_at: `${date}T10:00:00.000Z`,
        updated_at: `${date}T10:00:00.000Z`,
      },
    ],
    totalBoxes: 4,
    totalUnits: 40,
  };
}

describe('MassasLaunchPage — requirements 1, 3, 4, 5', () => {
  beforeEach(async () => {
    get.mockReset();
    post.mockReset();
    await i18n.changeLanguage('pt-BR');

    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch?')) {
        return sampleDayView();
      }
      if (url.startsWith('/integration/aero/movements')) {
        return { date: '2026-10-30', movements: [] };
      }
      if (url.startsWith('/admin/aero/vault')) {
        return { configured: false, wsUrl: '', username: '', hasPassword: false };
      }
      return {};
    });
  });

  it('explains a failed day read in a dismissible dialog', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch?')) throw new Error('Day unavailable');
      return {};
    });
    render(<MemoryRouter><MassasLaunchPage /></MemoryRouter>);
    const dialog = await screen.findByRole('dialog', { name: i18n.t('ui.actionFailed') });
    expect(dialog).toHaveTextContent('Day unavailable');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('massas-launch-feedback-dismiss'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders DaySessionHeader (date, operator, history nav) and removes date field and 4 sections (Change 1)', async () => {
    render(
      <MemoryRouter initialEntries={['/massas-launch']}>
        <MassasLaunchPage />
      </MemoryRouter>,
    );

    // DaySessionHeader: massas-date, massas-operator, massas-nav-history
    expect(await screen.findByTestId('massas-date')).toBeInTheDocument();
    expect(screen.getByTestId('massas-operator')).toHaveTextContent('wilkin');
    expect(screen.getByTestId('massas-nav-history')).toBeInTheDocument();

    // Date field is gone
    expect(screen.queryByTestId('massas-launch-date')).toBeNull();

    // Product grid and launch button kept
    expect(await screen.findByTestId('massas-product-1045')).toBeInTheDocument();
    expect(await screen.findByTestId('massas-launch')).toBeInTheDocument();

    // Removed: Produção do dia, Lançamentos Individuais, Resumo Coletivo do Dia, WhatsApp share
    expect(screen.queryByTestId('massas-unified')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-unified-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-individual-launches')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-collective-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-whatsapp-phone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-whatsapp-preview')).not.toBeInTheDocument();
  });

  it('renders sticky launch bar with responsive classes and totals (Item 3)', async () => {
    render(
      <MemoryRouter initialEntries={['/massas-launch']}>
        <MassasLaunchPage />
      </MemoryRouter>,
    );

    const input = (await screen.findAllByRole('spinbutton'))[0]!;
    fireEvent.change(input, { target: { value: '3' } });

    const bar = await screen.findByTestId('massas-summary-bar');
    expect(bar.className).toContain('sticky');
    expect(bar.className).toContain('bottom-0');
    expect(bar.className).toContain('sm:static');

    const launchButton = screen.getByTestId('massas-launch');
    expect(launchButton).toBeInTheDocument();
    expect(launchButton.textContent).toContain('3 cx');
  });

  it('removes sync toggle and displays plain configuration notice when ERP not ready (Item 4)', async () => {
    render(
      <MemoryRouter initialEntries={['/massas-launch']}>
        <MassasLaunchPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('massas-product-1045');

    // No switch
    expect(screen.queryByTestId('aero-sync-switch')).not.toBeInTheDocument();

    // Plain message with link when not configured
    const notConfigured = await screen.findByTestId('massas-erp-not-configured');
    expect(notConfigured).toBeInTheDocument();
    expect(notConfigured.querySelector('a')).toHaveAttribute('href', '/admin?tab=integration');
  });

  it('moves ERP sync button to history: not present on launch page (Item 5)', async () => {
    render(
      <MemoryRouter initialEntries={['/massas-launch']}>
        <MassasLaunchPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('massas-product-1045');
    expect(screen.queryByTestId('massas-sync-erp')).not.toBeInTheDocument();
    expect(screen.queryByTestId('massas-sync-header')).not.toBeInTheDocument();
  });

  /**
   * Crear un lanzamiento abre su ventana de resultado, también con el ERP listo.
   *
   * Con la integración configurada el viaje se encola y la función retornaba antes de `setResultModal`: el
   * formulario se vaciaba y no aparecía ni `massa-result-modal` ni ningún aviso. Lo único que se afirma es lo
   * seguro -- quedó registrado en Trindade -- y la ventana se cierra a mano.
   */
  it('confirms a created launch in the result dialog even when the ERP trip is queued', async () => {
    await i18n.changeLanguage('es');
    const { saveAeroSettings } = await import('../lib/aero-integration');
    saveAeroSettings({
      wsUrl: 'http://192.168.25.250:1453/api',
      username: 'APL',
      syncEnabled: true,
      hasPassword: true,
      lastSyncAt: null,
    });
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch?')) return sampleDayView();
      if (url.startsWith('/integration/aero/movements')) return { date: '2026-10-30', movements: [] };
      if (url.startsWith('/integration/aero/settings')) {
        return { configured: true, wsUrl: 'http://192.168.25.250:1453/api', username: 'APL', hasPassword: true };
      }
      return {};
    });
    post.mockImplementation(async (path: string) => {
      if (path === '/massas-launch') {
        return {
          created: [
            {
              id: 900,
              launch_date: '2026-10-30',
              product_code: '1045',
              product_name: 'MASSA CASEIRA',
              boxes: 1,
              units: 10,
              user_id: 1,
              username: 'wilkin',
              display_name: 'Wilkin',
              created_at: '2026-10-30T10:00:00.000Z',
              updated_at: '2026-10-30T10:00:00.000Z',
            },
          ],
        };
      }
      if (path.includes('bridge-tickets') || path === '/integration/aero/log') return { ticket: 't', ticketUrl: 'https://example.test/t' };
      return {};
    });

    render(
      <MemoryRouter initialEntries={['/massas-launch']}>
        <MassasLaunchPage />
      </MemoryRouter>,
    );

    const input = await screen.findByLabelText('MASSA CASEIRA');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.click(await screen.findByTestId('massas-launch'));

    // La confirmación de la página, y después la ventana del resultado.
    const confirmButton = await screen.findByText(i18n.t('massas.confirmAction', 'Confirmar'));
    fireEvent.click(confirmButton);

    const modal = await screen.findByTestId('massa-result-modal');
    expect(within(modal).getByTestId('massa-result-message').textContent).toBeTruthy();
    expect(within(modal).getByTestId('massa-result-close')).toBeTruthy();
  });
});
