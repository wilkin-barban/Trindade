import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import { DEFAULT_AERO_SETTINGS } from '../../lib/aero-integration';
import { AERO_PENDING_TEST_STORAGE_KEY, saveAeroPendingTest } from '../../lib/aero-test';
import type { AeroVaultSettings } from '../../lib/aero-vault';

/**
 * The panel is where the operator learns that the password lives in the server's vault.
 *
 * A password that silently disappears from the field is read as a bug, and the person answers it by typing it
 * into the address field. So the field says what it does, it is never filled with the stored secret, and saving
 * with it empty keeps whatever the server already has -- which is what lets the address be fixed without
 * knowing the secret.
 */
const vault = vi.hoisted(() => ({
  fetched: { configured: false, wsUrl: null, username: null, hasPassword: false, updatedAt: null } as AeroVaultSettings,
  fetchError: null as Error | null,
  saves: [] as Array<{ wsUrl: string; username: string; password?: string }>,
  deletes: 0,
  tickets: [] as Array<{ action: string; payloads: unknown[]; callbackPath?: string }>,
  ticketError: null as Error | null,
}));

vi.mock('../../lib/aero-vault', async () => {
  const actual = await vi.importActual<typeof import('../../lib/aero-vault')>('../../lib/aero-vault');
  return {
    ...actual,
    fetchAeroVaultSettings: async () => {
      if (vault.fetchError) throw vault.fetchError;
      return vault.fetched;
    },
    saveAeroVaultSettings: async (input: { wsUrl: string; username: string; password?: string }) => {
      const body: { wsUrl: string; username: string; password?: string } = {
        wsUrl: input.wsUrl,
        username: input.username,
      };
      // The client omits the key when nothing was typed; the double keeps the same rule so the assertion about
      // what reached the server is about the real contract.
      if (typeof input.password === 'string' && input.password.trim() !== '') body.password = input.password;
      vault.saves.push(body);
      vault.fetched = { configured: true, wsUrl: body.wsUrl, username: body.username, hasPassword: true, updatedAt: null };
      return vault.fetched;
    },
    deleteAeroVaultSettings: async () => {
      vault.deletes += 1;
      vault.fetched = { configured: false, wsUrl: null, username: null, hasPassword: false, updatedAt: null };
    },
    requestAeroBridgeTicket: async (input: { action: string; payloads: unknown[]; callbackPath?: string }) => {
      vault.tickets.push(input);
      if (vault.ticketError) throw vault.ticketError;
      return { ticket: 'token', ticketUrl: 'https://api.test/redeem', expiresAt: '2026-01-01T00:00:00.000Z' };
    },
  };
});

// The panel is the iPhone's: on a desktop it is drawn read-only on purpose, so the test that presses its
// buttons has to be the device whose buttons exist.
vi.mock('../../contexts/DeviceContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/DeviceContext')>(
    '../../contexts/DeviceContext',
  );
  return {
    ...actual,
    useDevice: () => ({ family: 'ios', isTouch: true, isStandalone: false, isMobile: true }),
  };
});

const { AeroIntegrationPanel } = await import('./AeroIntegrationPanel');

const LOCAL = {
  ...DEFAULT_AERO_SETTINGS,
  wsUrl: 'http://192.168.25.250:1453/api',
  username: 'wilkin',
};

function configuredVault(overrides: Partial<AeroVaultSettings> = {}): AeroVaultSettings {
  return {
    configured: true,
    wsUrl: 'http://192.168.25.250:1453/api',
    username: 'wilkin',
    hasPassword: true,
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof AeroIntegrationPanel>[0]> = {}) {
  const props = {
    settings: { ...LOCAL },
    onSettingsSaved: vi.fn(),
    ...overrides,
  };
  return { ...props, ...render(<AeroIntegrationPanel {...props} />) };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  localStorage.clear();
  sessionStorage.clear();
  // Cada prueba arranca en la ruta limpia: un callback de la anterior no puede decidir el veredicto de ésta.
  window.history.replaceState({}, '', '/admin');
  vi.restoreAllMocks();
  // jsdom no implementa el desplazamiento: el aviso se pinta igual y la prueba mide el texto, no el scroll.
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  vault.fetched = { configured: false, wsUrl: null, username: null, hasPassword: false, updatedAt: null };
  vault.fetchError = null;
  vault.ticketError = null;
  vault.saves.length = 0;
  vault.deletes = 0;
  vault.tickets.length = 0;
});

describe('AeroIntegrationPanel', () => {
  it('says the password is kept by the server, not by this device', () => {
    vault.fetched = configuredVault();
    renderPanel();

    return waitFor(() => {
      expect(screen.getByTestId('aero-pass-notice')).toHaveTextContent('guardada en el servidor');
    });
  });

  it('starts the password field empty even when the vault already holds one', async () => {
    vault.fetched = configuredVault();
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));
    // Jamás se rellena con la guardada: el campo es un secreto nuevo o nada.
    expect(screen.getByTestId('aero-ws-pass')).toHaveValue('');
  });

  it('does not claim «sin configurar» while the vault is still being read', () => {
    renderPanel();

    expect(screen.getByTestId('aero-state')).toHaveTextContent('Leyendo el cofre');
    expect(screen.getByTestId('aero-vault-loading')).toBeInTheDocument();
  });

  it('shows an actionable error with a retry when the vault cannot be read', async () => {
    vault.fetchError = new Error('503');
    renderPanel();

    await waitFor(() => expect(screen.getByTestId('aero-vault-error')).toBeInTheDocument());
    expect(screen.getByTestId('aero-vault-retry')).toBeInTheDocument();
    expect(screen.getByTestId('aero-state')).toHaveTextContent('Cofre ilegible');
  });

  it('sends the typed password once and never writes it to the browser storages', async () => {
    vault.fetched = configuredVault();
    const { onSettingsSaved } = renderPanel();
    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));

    fireEvent.change(screen.getByTestId('aero-ws-pass'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByTestId('aero-save'));

    await waitFor(() => expect(vault.saves).toHaveLength(1));
    expect(vault.saves[0]).toEqual({
      wsUrl: 'http://192.168.25.250:1453/api',
      username: 'wilkin',
      password: 'secreta',
    });
    expect(onSettingsSaved).toHaveBeenCalled();
    // Y nada secreto quedó en el navegador, en ninguna de las dos memorias.
    expect(localStorage.getItem('trindade.aero.integration.v1') ?? '').not.toContain('secreta');
    expect(sessionStorage.getItem('trindade.aero.session.v1')).toBeNull();
    expect(screen.getByText('Configuración guardada en el servidor')).toBeInTheDocument();
    // El campo vuelve a vacío después de guardar.
    expect(screen.getByTestId('aero-ws-pass')).toHaveValue('');
  });

  it('saves the address and the user with an empty password, and the server keeps its own', async () => {
    vault.fetched = configuredVault();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));

    fireEvent.change(screen.getByTestId('aero-ws-user'), { target: { value: 'Wilkin' } });
    fireEvent.click(screen.getByTestId('aero-save'));

    await waitFor(() => expect(vault.saves).toHaveLength(1));
    // The key is absent, not empty: an empty string would be a value the server could read as «clear it».
    expect('password' in vault.saves[0]!).toBe(false);
    expect(vault.saves[0]!.username).toBe('Wilkin');
    // Y el cofre respondió que sigue teniendo contraseña.
    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));
  });

  it('clears the vault on the server and only then forgets it here', async () => {
    vault.fetched = configuredVault();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onSettingsSaved } = renderPanel();
    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));

    fireEvent.click(screen.getByText('Borrar'));

    await waitFor(() => expect(vault.deletes).toBe(1));
    expect(onSettingsSaved).toHaveBeenCalledWith(DEFAULT_AERO_SETTINGS);
    expect(screen.getByTestId('aero-state')).toHaveTextContent('Sin configurar');
    confirm.mockRestore();
  });

  it('proves the connection with a `test` ticket instead of calling the ERP', async () => {
    vault.fetched = configuredVault();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));

    fireEvent.click(screen.getByTestId('aero-test'));

    await waitFor(() => expect(vault.tickets).toHaveLength(1));
    expect(vault.tickets[0]).toEqual({
      action: 'test',
      payloads: [{}],
      callbackPath: expect.stringContaining('aero_action=test'),
    });
    expect(vault.tickets[0]!.callbackPath).toContain('tab=integration');
    // La prueba sale de la página, así que la ventana se despide con el aviso de que Scriptable se está abriendo.
    await waitFor(() => expect(screen.getByText(/Abriendo Scriptable/)).toBeInTheDocument());
  });

  it('leaves the install steps to the dialog instead of repeating two buttons on the card', async () => {
    vault.fetched = configuredVault();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));

    // La tarjeta sólo explica; los controles viven en el diálogo, que es el dueño del código y de la copia.
    expect(screen.getByTestId('aero-scriptable-card')).toBeInTheDocument();
    expect(screen.queryByTestId('aero-scriptable-app-store')).not.toBeInTheDocument();
    expect(screen.queryByTestId('aero-scriptable-copy-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('aero-scriptable-asset')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('aero-shortcut-open'));
    await waitFor(() => expect(screen.getByTestId('aero-scriptable-dialog')).toBeInTheDocument());
    expect(screen.getByTestId('aero-scriptable-app-store')).toBeInTheDocument();
    expect(screen.getByTestId('aero-scriptable-copy')).toBeInTheDocument();
  });

  it('keeps its own help button opening the same instructions', async () => {
    vault.fetched = configuredVault();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));

    fireEvent.click(screen.getByTestId('aero-shortcut-open'));
    await waitFor(() => expect(screen.getByTestId('aero-scriptable-dialog')).toBeInTheDocument());
  });

  it('says Scriptable is the app that talks to the plant network and keeps the password in the vault', async () => {
    vault.fetched = configuredVault();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));

    // La frase que evita la pregunta «¿y la contraseña?»: vive en el cofre del servidor, no en el teléfono.
    const card = screen.getByTestId('aero-scriptable-card');
    expect(card).toHaveTextContent(/Scriptable/);
    expect(card).toHaveTextContent(/red de la fábrica/);
    expect(card).toHaveTextContent(/cofre del servidor/);
    // Ni un rastro de la receta vieja en la tarjeta de instalación.
    expect(card).not.toHaveTextContent(/iCloud/);
    expect(card).not.toHaveTextContent(/Atajo/);
  });

  it('tells a configured vault apart from an unfinished setup', async () => {
    vault.fetched = configuredVault({ hasPassword: false });
    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId('aero-state')).toHaveTextContent('Falta la contraseña en el cofre'),
    );
  });

  it('reads the bridge network error as unreachable ERP, not as invalid credentials', async () => {
    vault.fetched = configuredVault();
    // El operario vuelve de Scriptable con el callback de error que dejó el script.
    window.history.replaceState(
      {},
      '',
      '/admin?aero_action=test&aero_data=&aero_error=wifi_required&aero_msg=sin%20red',
    );
    // Y el intento quedó registrado antes de salir: sin limpiarlo, el panel lo repetiría al recargar.
    saveAeroPendingTest({ destinationUrl: 'http://192.168.25.250:1453/api', startedAt: '2026-10-30T10:00:00.000Z', reason: 'mixed_content' });

    const { rerender, unmount } = renderPanel();
    const props = { settings: { ...LOCAL }, onSettingsSaved: vi.fn() };

    await waitFor(() => expect(screen.getByTestId('aero-notice')).toHaveTextContent(/Wi-Fi Trindade Expedicao/));
    // El aviso lleva el título del error de red, no el de una credencial rechazada.
    expect(screen.getByTestId('aero-test-result-modal')).toHaveTextContent('ERP no disponible');
    // El panel no queda «probando»: los botones vuelven a estar disponibles.
    expect(screen.getByTestId('aero-test')).not.toBeDisabled();
    // El intento pendiente se limpió, y la consulta se consumió para que un refresco no repita el aviso.
    expect(localStorage.getItem(AERO_PENDING_TEST_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe('');

    // Y una segunda pasada no vuelve a pintarlo: el callback se reclamó una sola vez.
    rerender(<AeroIntegrationPanel {...props} />);
    expect(screen.getAllByTestId('aero-notice')).toHaveLength(1);
    unmount();
  });

  it('does not open Scriptable for the test when the phone has no internet', async () => {
    vault.fetched = configuredVault();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('aero-state')).toHaveTextContent('Configurado'));

    fireEvent.click(screen.getByTestId('aero-test'));

    // Sin internet el ticket no se puede canjear: no se pide y la app no se abre.
    await waitFor(() => expect(screen.getByTestId('aero-notice')).toHaveTextContent(/Sin conexión a internet/));
    expect(vault.tickets).toHaveLength(0);
    expect(screen.getByTestId('aero-test')).not.toBeDisabled();
  });
});
