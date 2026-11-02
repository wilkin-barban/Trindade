import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import { HistoryDayPanel } from './HistoryDayPanel';

/**
 * The day panel is the same surface in both histories, and this file is what keeps it that way.
 *
 * The two screens used to draw the same choice two different ways: the count with a panel and a strip of
 * chips, the massas history with a card of two-line buttons. The card is gone because it was the second
 * design; what is asserted here is the contract both screens inherit -- the field carries the window, the
 * chips carry the day and its units, a chosen day is not a button you can press again, and a day the
 * endpoint never listed is still offered without claiming it was empty.
 */
const DAYS = [
  { date: '2026-10-27', units: 70 },
  { date: '2026-10-26', units: 8 },
];

function renderPanel(overrides: Partial<Parameters<typeof HistoryDayPanel>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <HistoryDayPanel
      id="probe-date"
      label="O dia"
      value="2026-10-27"
      onChange={onChange}
      min="2026-09-27"
      max="2026-10-31"
      testIdPrefix="probe-history"
      groupLabel="Histórico"
      days={DAYS}
      {...overrides}
    />,
  );
  return { onChange };
}

describe('HistoryDayPanel', () => {
  it('offers the archive window through the panel field', () => {
    renderPanel();

    const field = screen.getByTestId('probe-history-date');
    expect(field).toHaveAttribute('type', 'date');
    expect(field).toHaveAttribute('value', '2026-10-27');
    expect(field).toHaveAttribute('min', '2026-09-27');
    expect(field).toHaveAttribute('max', '2026-10-31');
    // The day is the biggest text on the surface, and the label sits above it at label size.
    expect(screen.getByText('27/10/2026')).toBeInTheDocument();
    // Twice: the visible label above the day and the accessible name the native input keeps.
    expect(screen.getAllByText('O dia')).toHaveLength(2);
  });

  it('writes each day with its units and marks the open one', () => {
    renderPanel();

    const strip = screen.getByTestId('probe-history-days');
    expect(strip).toBeInTheDocument();
    const older = screen.getByTestId('probe-history-day-2026-10-26');
    expect(older).toHaveTextContent('26/10 · 8');
    expect(older).not.toBeDisabled();
    const open = screen.getByTestId('probe-history-day-2026-10-27');
    expect(open).toHaveTextContent('27/10 · 70');
    expect(open).toHaveAttribute('aria-pressed', 'true');
    // A day already open is not a button with a result: pressing it would only rewrite the same URL.
    expect(open).toBeDisabled();
  });

  it('opens the day a chip names', () => {
    const { onChange } = renderPanel();

    fireEvent.click(screen.getByTestId('probe-history-day-2026-10-26'));

    expect(onChange).toHaveBeenCalledWith('2026-10-26');
  });

  it('offers a day the endpoint never listed without claiming it was empty', () => {
    renderPanel({ days: [] });

    // Nothing to strip: no chip, no "0" invented for a day nobody read.
    expect(screen.queryByTestId('probe-history-days')).not.toBeInTheDocument();
    expect(screen.getByTestId('probe-history-date')).toBeInTheDocument();
  });

  it('keeps the panel usable when the days could not be read', async () => {
    await i18n.changeLanguage('es');
    renderPanel({ days: [], failed: true });

    expect(screen.getByTestId('probe-history-date')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/No se pudieron leer los días/);
  });
});
