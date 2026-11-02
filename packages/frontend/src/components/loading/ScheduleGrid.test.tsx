import { render, screen } from '@testing-library/react';
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
    <ScheduleGrid
      schedules={schedules}
      timeSlots={timeSlots}
      date="2026-11-02"
      drivers={[]}
      loading={false}
      onDelete={async () => {}}
      onRefresh={NOOP}
    />
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

  it('shows an hour that holds nobody as zero, not as the shift next door', () => {
    renderGrid([fletero(1, '04:00')], ['04:00', '05:00']);

    expect(screen.getByTestId('quota-04-00')).toHaveTextContent('1/3');
    expect(screen.getByTestId('quota-05-00')).toHaveTextContent('0/3');
    expect(screen.queryByTestId('maxed-05-00')).toBeNull();
  });
});
