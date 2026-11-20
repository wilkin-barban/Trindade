import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SalidaReportSection } from './SalidaReportSection';

/**
 * The day's salidas inside the report.
 *
 * The point of the block is that a report states the whole day, not one module's view of it: the operator who
 * launched, the products with their units and the day's total, and never a product code — that one is traceability,
 * and the report is a message.
 */
const get = vi.fn();

vi.mock('../../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('SalidaReportSection', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('lists every operator of the day with their products and units', async () => {
    get.mockResolvedValue({
      date: '2026-11-16',
      movementCount: 1,
      totalUnits: 6013,
      operators: [
        {
          name: 'Wilkin',
          username: 'WILKIN',
          units: 6013,
          products: [
            { code: '1356', name: 'EMBALAG. DISCO 400g', block: 'embalagens', units: 6000 },
            { code: '1900', name: 'BOBINA ROLO', block: 'bobinas', units: 13 },
          ],
        },
      ],
    });

    render(<SalidaReportSection date="2026-11-16" />);

    await waitFor(() => expect(screen.getByTestId('salida-report-operator-WILKIN')).toBeTruthy());
    const card = screen.getByTestId('salida-report-operator-WILKIN');
    expect(card.textContent).toContain('Wilkin');
    expect(card.textContent).toContain('EMBALAG. DISCO 400g');
    expect(card.textContent).toContain('6000 un');
    expect(card.textContent).toContain('BOBINA ROLO');
    // The code is traceability: it stays out of the message the plant reads.
    expect(card.textContent).not.toContain('1356');
    expect(screen.getByTestId('salida-report-total').textContent).toContain('6013 un');
    expect(get).toHaveBeenCalledWith('/reports/day/salidas?date=2026-11-16');
  });

  it('says nothing was launched instead of drawing an empty card', async () => {
    get.mockResolvedValue({ date: '2026-11-16', movementCount: 0, totalUnits: 0, operators: [] });

    render(<SalidaReportSection date="2026-11-16" />);

    await waitFor(() => expect(screen.getByTestId('salida-report-empty')).toBeTruthy());
    expect(screen.queryByTestId('salida-report-total')).toBeNull();
  });

  it('tells the reader when the day could not be read, without pretending it was empty', async () => {
    get.mockRejectedValue(new Error('offline'));
    const onLoadError = vi.fn();

    render(<SalidaReportSection date="2026-11-16" onLoadError={onLoadError} />);

    // El fallo no se dibuja como una franja del día: la sección avisa a la pantalla, que lo explica en su ventana.
    await waitFor(() => expect(onLoadError).toHaveBeenCalledWith('salida.historyLoadError'));
    expect(screen.queryByTestId('salida-report-error')).toBeNull();
    expect(screen.queryByTestId('salida-report-empty')).toBeNull();
  });
  it('marks the operator the company recorded on its own, with no launch here', async () => {
    // A seat typed in the ERP has nobody behind it in Trindade: the card says so instead of pretending it is an
    // account of the plant.
    get.mockResolvedValue({
      date: '2026-11-18',
      movementCount: 1,
      totalUnits: 33,
      operators: [
        {
          name: 'Wilkin',
          username: 'WILKIN',
          units: 20,
          erpOnly: false,
          products: [{ code: '1357', name: 'EMBALAG. DISCO 200g', block: 'embalagens', units: 20 }],
        },
        {
          name: 'JOSIANE',
          username: 'JOSIANE',
          units: 13,
          erpOnly: true,
          products: [{ code: '1900', name: 'BOBINA ROLO', block: 'bobinas', units: 13 }],
        },
      ],
    });

    render(<SalidaReportSection date="2026-11-18" />);

    await waitFor(() => expect(screen.getByTestId('salida-report-operator-JOSIANE')).toBeTruthy());
    expect(screen.getByTestId('salida-report-erp-only-JOSIANE')).toBeTruthy();
    expect(screen.queryByTestId('salida-report-erp-only-WILKIN')).toBeNull();
  });

});
