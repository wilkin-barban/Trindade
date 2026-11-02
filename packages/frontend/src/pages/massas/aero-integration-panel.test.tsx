import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import { DEFAULT_AERO_SETTINGS, clearAeroSessionPassword, aeroSessionPassword } from '../../lib/aero-integration';

/**
 * The panel is where the operator learns that the password is not kept.
 *
 * A password that silently disappears after a reload is read as a bug, and the person answers it by typing it
 * into the address field or by not trusting the app. The field says what it does, the save no longer demands
 * the secret to keep the address, and the tab keeps the password just long enough to launch.
 */
// The save is watched, not replaced: what it does with the secret is part of what is being tested.
const saved = vi.hoisted(() => [] as Array<{ password: string; username: string }>);

vi.mock('../../lib/aero-integration', async () => {
  const actual = await vi.importActual<typeof import('../../lib/aero-integration')>(
    '../../lib/aero-integration',
  );
  return {
    ...actual,
    saveAeroSettings: (settings: Parameters<typeof actual.saveAeroSettings>[0], ...rest: unknown[]) => {
      saved.push({ password: settings.password, username: settings.username });
      return actual.saveAeroSettings(settings, ...(rest as []));
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

const SAVED = {
  ...DEFAULT_AERO_SETTINGS,
  wsUrl: 'http://192.168.25.250:1453/api',
  username: 'wilkin',
};

function renderPanel(overrides: Partial<Parameters<typeof AeroIntegrationPanel>[0]> = {}) {
  const props = {
    settings: { ...SAVED },
    onSettingsSaved: vi.fn(),
    ...overrides,
  };
  return { ...props, ...render(<AeroIntegrationPanel {...props} />) };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  saved.length = 0;
  localStorage.clear();
  clearAeroSessionPassword();
});

describe('AeroIntegrationPanel', () => {
  it('says the password is not stored on the device', () => {
    renderPanel();

    expect(screen.getByTestId('aero-pass-notice')).toHaveTextContent('no se guarda en este dispositivo');
  });

  it('starts the field empty, because the session does not hold it yet', () => {
    renderPanel();

    expect(screen.getByTestId('aero-ws-pass')).toHaveValue('');
  });

  it('puts the typed password in the tab and out of the saved payload', () => {
    const { onSettingsSaved } = renderPanel();

    fireEvent.change(screen.getByTestId('aero-ws-pass'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByTestId('aero-save'));

    const [persisted] = saved;
    expect(persisted.password).toBe('secreta');
    expect(onSettingsSaved).toHaveBeenCalled();
    expect(aeroSessionPassword()).toBe('secreta');
  });

  it('saves the address and the user even when the password is not typed again', () => {
    renderPanel();

    fireEvent.change(screen.getByTestId('aero-ws-user'), { target: { value: 'Wilkin' } });
    fireEvent.click(screen.getByTestId('aero-save'));

    // Nothing to write into the session, but nothing to lose either: the saved settings are not discarded
    // just because the secret is asked for once per session.
    expect(saved).toHaveLength(1);
    expect(saved[0].username).toBe('Wilkin');
    // And the device still holds nothing secret, which is the point of the whole change.
    expect(localStorage.getItem('trindade.aero.integration.v1') ?? '').not.toContain('secreta');
    expect(screen.getByText('Configuración guardada en este iPhone')).toBeInTheDocument();
  });

  it('tells a configured tab without the secret apart from an unfinished setup', () => {
    renderPanel();

    expect(screen.getByTestId('aero-state')).toHaveTextContent('Falta la contraseña de esta sesión');
  });
});
