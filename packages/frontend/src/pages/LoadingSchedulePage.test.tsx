import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';

/**
 * Reloading the day must not take the modal with it.
 *
 * A batch that half lands reloads the grid while the modal is still open, holding the rows the server
 * refused. The screen used to answer every reload with a spinner over the whole page, which unmounted the
 * modal and with it the only list of what was still owed: the operator saw the modal vanish and had to
 * remember, row by row, which drivers never entered.
 */
const get = vi.fn();
const post = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    del: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {},
}));

const { LoadingSchedulePage } = await import('./LoadingSchedulePage');

function driver(id: number, name: string) {
  return { id, name, license_plate: null, phone: null, driver_type: 'fletero' as const };
}

let dayRequests = 0;

beforeEach(() => {
  dayRequests = 0;
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url.startsWith('/loading/schedules')) {
      dayRequests += 1;
      // The first read answers at once; the reload of a landed batch takes a moment, which is the moment a
      // spinner over the page would have taken the modal away.
      if (dayRequests > 1) await new Promise((resolve) => setTimeout(resolve, 300));
      return { schedules: [] };
    }
    if (url.startsWith('/loading/time-slots')) return { timeSlots: ['04:00'] };
    if (url.startsWith('/loading/vehicles')) return { vehicles: [] };
    if (url.startsWith('/loading/drivers')) return { drivers: [driver(1, 'Carlos'), driver(4, 'Silvana')] };
    return {};
  });
});

beforeAll(async () => {
  await i18n.changeLanguage('es');
});

describe('LoadingSchedulePage', () => {
  it('keeps the open modal, and the rows it still owes, through the reload of a half-sent batch', async () => {
    post.mockImplementation(async (_url: string, body: { driver_id: number }) => {
      if (body.driver_id === 4) throw Object.assign(new Error('Veículo já agendado nesta data.'), { status: 409 });
      return { schedule: { id: 90 } };
    });
    render(
      <MemoryRouter>
        <LoadingSchedulePage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('schedule-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-fletero-04-00'));
    await waitFor(() => expect(screen.getByTestId('driver-option-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('driver-option-1'));
    fireEvent.click(screen.getByTestId('driver-option-4'));
    fireEvent.click(screen.getByTestId('driver-select-accept'));

    await waitFor(() => expect(screen.getByTestId('driver-select-failures')).toBeInTheDocument());
    await waitFor(() => expect(dayRequests).toBe(2), { interval: 5 });

    // While the day is being reread the grid is still there behind the modal, and so is the refusal.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('schedule-grid')).toBeInTheDocument();
    expect(screen.getByTestId('driver-select-failure-4')).toHaveTextContent('Silvana');
  });

  /**
   * A read that failed is not a day without loads.
   *
   * The grid drew itself anyway, with every hour saying nobody was scheduled, and the only sign of the truth
   * was a red line above it. On a phone the operator reads the grid, not the line: the day looked empty and the
   * crew looked idle. The failure takes the grid's place, and it comes with the retry.
   */
  it('says the read failed instead of drawing an empty day', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/loading/schedules')) throw new Error('Network Error');
      if (url.startsWith('/loading/time-slots')) return { timeSlots: ['04:00'] };
      if (url.startsWith('/loading/drivers')) return { drivers: [driver(1, 'Carlos')] };
      return {};
    });
    render(
      <MemoryRouter>
        <LoadingSchedulePage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('loading-schedule-read-error')).toBeInTheDocument());
    expect(screen.queryByTestId('schedule-grid')).toBeNull();
    expect(screen.getByText('Network Error')).toBeInTheDocument();
  });

  it('rereads the day from the failure itself', async () => {
    let failures = 1;
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/loading/schedules')) {
        if (failures > 0) {
          failures -= 1;
          throw new Error('Network Error');
        }
        return { schedules: [] };
      }
      if (url.startsWith('/loading/time-slots')) return { timeSlots: ['04:00'] };
      if (url.startsWith('/loading/drivers')) return { drivers: [driver(1, 'Carlos')] };
      return {};
    });
    render(
      <MemoryRouter>
        <LoadingSchedulePage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('loading-schedule-retry')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('loading-schedule-retry'));

    await waitFor(() => expect(screen.getByTestId('schedule-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('loading-schedule-read-error')).toBeNull();
  });
});
