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

    render(<SalidaReportSection date="2026-11-16" />);

    await waitFor(() => expect(screen.getByTestId('salida-report-error')).toBeTruthy());
    expect(screen.queryByTestId('salida-report-empty')).toBeNull();
  });
});
