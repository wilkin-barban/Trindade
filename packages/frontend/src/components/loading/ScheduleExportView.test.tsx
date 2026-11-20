import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * El diálogo de fleteros: los enlaces, y nada más.
 *
 * La hoja nativa y la copia eran acciones generales duplicadas de la tarjeta que abre este diálogo. Acá cada
 * fletero con teléfono es su propio enlace de WhatsApp con el texto del día; el pie sólo cierra.
 */
const get = vi.fn();

vi.mock('../../api/client', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, _fallback?: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${options.count} fleteros` : key,
    i18n: { language: 'es' },
  }),
}));

const { ScheduleExportView } = await import('./ScheduleExportView');

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url.startsWith('/loading/export')) return { text: 'CRONOGRAMA DEL DÍA' };
    if (url.startsWith('/loading/schedules')) return { schedules: [{ driver_id: 1 }, { driver_id: 2 }] };
    if (url.startsWith('/loading/drivers')) {
      return {
        drivers: [
          { id: 1, name: 'Carlos', phone: '+55 11 98888-7777', driver_type: 'fletero' },
          { id: 2, name: 'Silvana', phone: null, driver_type: 'fletero' },
        ],
      };
    }
    return {};
  });
});

describe('ScheduleExportView', () => {
  it('offers each reachable fletero as its own WhatsApp link and only closes', async () => {
    render(<ScheduleExportView date="2026-11-10" open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId('loading-export-fletero-1')).toBeInTheDocument());
    const link = screen.getByTestId('loading-export-fletero-1');
    expect(link.getAttribute('href')).toContain('api.whatsapp.com/send?phone=5511988887777');
    // Silvana no tiene número: no hay enlace que abrir.
    expect(screen.queryByTestId('loading-export-fletero-2')).toBeNull();

    // Las acciones generales ya no están: la tarjeta que abre el diálogo las tiene.
    expect(screen.queryByTestId('loading-export-share')).toBeNull();
    expect(screen.queryByTestId('loading-export-copy')).toBeNull();
    expect(screen.getByTestId('loading-export-dismiss')).toBeInTheDocument();
    expect(screen.getByTestId('loading-export-close')).toBeInTheDocument();
  });

  it('closes from the footer', async () => {
    const onClose = vi.fn();
    render(<ScheduleExportView date="2026-11-10" open onClose={onClose} />);

    await waitFor(() => expect(screen.getByTestId('loading-export-dismiss')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('loading-export-dismiss'));
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * Veinte fleteros no empujan el mensaje fuera de la vista.
   *
   * La lista vive en su propia área con scroll y un contador; la prévia tiene su banda fija arriba y el cierre su
   * pie. Lo que se afirma es la estructura: el mensaje sigue en el panel, la lista es la que se desplaza y el botón
   * de cerrar está.
   */
  it('keeps the message visible and the close reachable with twenty fleteros', async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      name: `Fletero ${index + 1}`,
      phone: `+55 11 98888-${String(1000 + index)}`,
      driver_type: 'fletero',
    }));
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/loading/export')) return { text: 'CRONOGRAMA DEL DÍA' };
      if (url.startsWith('/loading/schedules')) return { schedules: many.map((driver) => ({ driver_id: driver.id })) };
      if (url.startsWith('/loading/drivers')) return { drivers: many };
      return {};
    });

    render(<ScheduleExportView date="2026-11-10" open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId('loading-export-text')).toBeInTheDocument());
    // La prévia y el cierre están, y la lista es la que scrollea.
    expect(screen.getByTestId('loading-export-text').textContent).toBe('CRONOGRAMA DEL DÍA');
    const list = screen.getByTestId('loading-export-fleteros');
    expect(list.className).toContain('overflow-y-auto');
    expect(screen.getByTestId('loading-export-fleteros-count').textContent).toContain('20');
    expect(screen.getByTestId('loading-export-dismiss')).toBeInTheDocument();
    // El panel es de altura acotada: la lista nunca empuja el mensaje ni el pie.
    expect(screen.getByTestId('loading-export-modal').className).toContain('max-h-[90vh]');
  });

});
