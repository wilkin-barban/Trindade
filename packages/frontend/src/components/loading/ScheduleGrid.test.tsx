import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';

/**
 * The badge on each slot is the count of its shift, and the warning under the button says the same thing.
 *
 * Drawing the exact-slot count while the warning fired on the hour gave a slot reading «1/3» beside a sentence
 * saying the limit was reached: two numbers, one screen, and the operator asking which one was true.
 */
vi.mock('../../api/client', () => ({ api: { get: vi.fn(), post: vi.fn() }, ApiClientError: class extends Error {} }));

const { ScheduleGrid } = await import('./ScheduleGrid');

const NOOP = () => {};

function renderGrid(schedules: Parameters<typeof ScheduleGrid>[0]['schedules'], timeSlots = ['04:00', '04:30']) {
  return render(
    <MemoryRouter>
        <ScheduleGrid
        schedules={schedules}
        timeSlots={timeSlots}
        date="2026-11-02"
        drivers={[]}
        loading={false}
        onDelete={async () => {}}
        onRefresh={NOOP}
      />
    </MemoryRouter>
  );
}

function fletero(id: number, time_slot: string) {
  return {
    id,
    schedule_date: '2026-11-02',
    time_slot,
    driver_type: 'fletero' as const,
    driver_id: id,
    driver_name: `Fletero ${id}`,
    license_plate: null,
    vehicle_id: null,
    vehicle_description: null,
    vehicle_plate: null,
    canDelete: true,
  };
}

beforeAll(async () => {
  await i18n.changeLanguage('es');
});

describe('ScheduleGrid quota', () => {
  it('counts the whole hour in both slots of the same shift', () => {
    renderGrid([fletero(1, '04:00'), fletero(2, '04:30'), fletero(3, '03:50')]);

    // Same three trucks leave at 04:00 and at 04:30: both slots read three.
    expect(screen.getByTestId('quota-04-00')).toHaveTextContent('3/3');
    expect(screen.getByTestId('quota-04-30')).toHaveTextContent('3/3');
  });

  it('warns exactly when the badge is past three, never before', () => {
    renderGrid([fletero(1, '04:00'), fletero(2, '04:10'), fletero(3, '04:20'), fletero(4, '04:40')]);

    expect(screen.getByTestId('quota-04-00')).toHaveTextContent('4/3');
    expect(screen.getByTestId('maxed-04-00')).toBeInTheDocument();
    expect(screen.getByTestId('maxed-04-30')).toBeInTheDocument();
  });

  /**
   * A slot that is not in the day's list still exists in the data.
   *
   * The list of slots is a setting and the rows are facts: a load saved at 23:30 before the list changed, or
   * booked from the app, was drawn nowhere -- it counted against the quota and nobody could see it or remove
   * it without going through the API.
   */
  /**
   * Two rows of a day are often edited on a phone, in a warehouse, with one hand.
   *
   * The actions were 16-pixel icons inside a padding-less button: the target measured the glyph, so a thumb
   * hit the row behind it or missed entirely. 48 is the number the app's other icon actions already use.
   */
  it('gives each row action a target a thumb can hit', () => {
    renderGrid([{ ...fletero(1, '04:00'), canEdit: true }]);

    expect(screen.getByTestId('delete-entry-1')).toHaveClass('min-h-12', 'min-w-12');
    expect(screen.getByTestId('edit-entry-1')).toHaveClass('min-h-12', 'min-w-12');
  });

  it('sends the pencil to the day it belongs to, with the row already open', () => {
    renderGrid([{ ...fletero(1, '04:00'), canEdit: true }]);

    // The grid knows the row; the edit screen is where a row moves. The link carries both, so the operator
    // lands on the day with that row already in edit instead of hunting it in the list.
    expect(screen.getByTestId('edit-entry-1')).toHaveAttribute('href', '/loading/edit?date=2026-11-02&edit=1');
  });

  it('offers no pencil on a row the server did not offer it for', () => {
    renderGrid([{ ...fletero(1, '04:00'), canEdit: false }]);

    expect(screen.queryByTestId('edit-entry-1')).toBeNull();
  });

  it('draws an hour the list does not know, so it can still be seen and emptied', () => {
    renderGrid([fletero(1, '23:30')], ['04:00']);

    expect(screen.getByTestId('time-slot-23-30')).toBeInTheDocument();
    expect(screen.getByTestId('entry-1')).toHaveTextContent('Fletero 1');
    // The extra hour goes after the ones the day has, in the order the day runs.
    expect(screen.getAllByTestId(/^time-slot-/).map((node) => node.getAttribute('data-testid'))).toEqual([
      'time-slot-04-00',
      'time-slot-23-30',
    ]);
  });

  it('shows an hour that holds nobody as zero, not as the shift next door', () => {
    renderGrid([fletero(1, '04:00')], ['04:00', '05:00']);

    expect(screen.getByTestId('quota-04-00')).toHaveTextContent('1/3');
    expect(screen.getByTestId('quota-05-00')).toHaveTextContent('0/3');
    expect(screen.queryByTestId('maxed-05-00')).toBeNull();
  });
});
