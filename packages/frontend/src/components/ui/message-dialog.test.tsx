import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageDialog } from './message-dialog';

/**
 * La ventana de respuesta, medida y leída.
 *
 * Lo que el dueño vio era un bloque crudo pegado al borde del panel: sin padding, con el icono, el título, el texto
 * y el botón amontonados. Lo que se fija acá es la forma que lo reemplaza -- panel angosto y redondeado, cabecera
 * tonal con su badge, cuerpo con aire, pie con el botón -- y que el cierre funcione por las dos puertas.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }),
}));

describe('MessageDialog', () => {
  it('shows the action title and its message, in a narrow rounded panel', () => {
    render(
      <MessageDialog
        open
        title="No se pudo guardar el relatório"
        message="Falta colocar as temperaturas no relatório."
        onClose={() => {}}
      />,
    );

    const panel = screen.getByTestId('message-dialog');
    expect(panel.className).toContain('max-w-[26rem]');
    expect(panel.className).toContain('rounded-2xl');
    expect(screen.getByText('No se pudo guardar el relatório')).toBeTruthy();
    expect(screen.getByText('Falta colocar as temperaturas no relatório.')).toBeTruthy();
    // Dos niveles visibles: el título y el mensaje.
    expect(panel.querySelectorAll('h2')).toHaveLength(1);
  });

  it('tones the header and keeps the colour out of the only signal', () => {
    render(<MessageDialog open message="Algo salió mal" onClose={() => {}} />);
    const header = screen.getByText('ui.actionFailed').closest('div');
    expect(header?.className).toContain('bg-red-50');
    // El icono y el título dicen lo mismo que el color.
    expect(header?.querySelector('svg')).not.toBeNull();
  });

  it('a success is green and still named by its title', () => {
    render(<MessageDialog open tone="success" title="Relatório guardado" message="Listo" onClose={() => {}} />);
    const header = screen.getByText('Relatório guardado').closest('div');
    expect(header?.className).toContain('bg-emerald-50');
  });

  it('closes from the footer and from the X, and never by itself', () => {
    const onClose = vi.fn();
    render(<MessageDialog open message="Texto" onClose={onClose} />);

    fireEvent.click(screen.getByTestId('message-dialog-close'));
    fireEvent.click(screen.getByTestId('message-dialog-dismiss'));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('message-dialog')).toBeTruthy();
  });

  it('lets a long message scroll instead of pushing the button out', () => {
    render(<MessageDialog open message={'línea larga\n'.repeat(40)} onClose={() => {}} />);
    const paragraph = screen.getByText(/línea larga/);
    expect(paragraph.className).toContain('max-h-[40vh]');
    expect(paragraph.className).toContain('break-words');
    expect(screen.getByTestId('message-dialog-close').className).toContain('min-h-[44px]');
  });
});
