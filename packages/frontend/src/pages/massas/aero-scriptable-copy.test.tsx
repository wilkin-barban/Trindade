import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';

/**
 * El botón que reemplazó a la descarga del `.scriptable`.
 *
 * Importar el archivo falló en el iPhone: se abrió en el editor y Scriptable rechazó el JSON. Lo que el
 * operario toca ahora copia el JavaScript **crudo** que el diálogo ya cargó, así que el click no depende de un
 * `fetch` y lo que llega al portapapeles es exactamente el asset. La segunda puerta -- el `textarea` con
 * `execCommand` -- es la de Safari, y también se prueba: el teléfono no puede quedarse sin camino de copia.
 */
const SOURCE = [
  '// Puente Aero32',
  'const ticket = args.queryParameters.ticket;',
  "Safari.open(`https://trindademasas.duckdns.org/api/aero/bridge/ticket/${ticket}`);",
].join('\n');

const { AeroScriptableDialog } = await import('./AeroScriptableDialog');

/** El `fetch` del diálogo, con el asset crudo como respuesta y contando las llamadas. */
function stubFetch(ok = true) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    text: async () => SOURCE,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** La primera puerta, la del portapapeles, con el resultado que cada caso necesita. */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

/** La segunda puerta: `document.execCommand`, que jsdom no implementa. */
function stubExecCommand(result: boolean) {
  const spy = vi.fn(() => result);
  (document as unknown as { execCommand: () => boolean }).execCommand = spy;
  return spy;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (document as unknown as { execCommand?: () => boolean }).execCommand;
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

describe('AeroScriptableDialog: copiar el código', () => {
  it('copies exactly the raw source and says «Copiado»', async () => {
    const writeText = stubClipboard(async () => undefined);
    const fetchMock = vi.mocked(fetch);
    render(<AeroScriptableDialog open onClose={vi.fn()} />);

    // El código se carga al abrir: el botón nace deshabilitado y se habilita cuando el texto ya está en memoria.
    const button = screen.getByTestId('aero-scriptable-copy');
    expect(fetchMock).toHaveBeenCalledWith('/Aero32Bridge.js');
    await waitFor(() => expect(button).not.toBeDisabled());

    fireEvent.click(button);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    // Exactamente el asset: ni el JSON del `.scriptable` ni un envoltorio alrededor del source.
    expect(writeText.mock.calls[0]![0]).toBe(SOURCE);
    expect(writeText.mock.calls[0]![0]).not.toContain('"script"');
    // Y el estado de éxito se pinta sobre el mismo botón, sin abrir otro paso.
    await waitFor(() => expect(screen.getByTestId('aero-scriptable-copy')).toHaveTextContent('Copiado'));
    expect(screen.queryByText(i18n.t('massas.aero.scriptableCopyFailed'))).not.toBeInTheDocument();
  });

  it('falls back to the hidden textarea when the clipboard rejects', async () => {
    stubClipboard(async () => {
      throw new Error('NotAllowedError');
    });
    const execCommand = stubExecCommand(true);
    render(<AeroScriptableDialog open onClose={vi.fn()} />);

    const button = screen.getByTestId('aero-scriptable-copy');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    await waitFor(() => expect(screen.getByTestId('aero-scriptable-copy')).toHaveTextContent('Copiado'));
    // El fallback copió: no hay error que mostrar.
    expect(screen.queryByText(i18n.t('massas.aero.scriptableCopyFailed'))).not.toBeInTheDocument();
  });

  it('shows the actionable error only when both paths fail', async () => {
    stubClipboard(async () => {
      throw new Error('NotAllowedError');
    });
    stubExecCommand(false);
    render(<AeroScriptableDialog open onClose={vi.fn()} />);

    const button = screen.getByTestId('aero-scriptable-copy');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    // El mensaje dice dónde está el código para copiarlo a mano: el paso no termina en un callejón.
    await waitFor(() => expect(screen.getByText(i18n.t('massas.aero.scriptableCopyFailed'))).toBeInTheDocument());
    expect(screen.getByText(i18n.t('massas.aero.scriptableCopyFailed'))).toHaveTextContent('/Aero32Bridge.js');
    expect(screen.getByTestId('aero-scriptable-copy')).not.toHaveTextContent('Copiado');
  });

  it('reports a failed load instead of leaving a dead button', async () => {
    stubFetch(false);
    stubClipboard(async () => undefined);
    render(<AeroScriptableDialog open onClose={vi.fn()} />);

    expect(screen.getByTestId('aero-scriptable-copy')).toBeDisabled();
    await waitFor(() => expect(screen.getByText(i18n.t('massas.aero.scriptableLoadFailed'))).toBeInTheDocument());
    expect(screen.getByTestId('aero-scriptable-copy')).toBeDisabled();
  });
});
