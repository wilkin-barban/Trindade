import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';

/**
 * Moving a row is a change of shift, and the screen has to price it honestly before the row is saved.
 *
 * The count in the slot list was taken with the row still inside its own window and then the row was added
 * again: the slot the row already belonged to read one more fletero than it held, so the operator moving
 * nothing at all saw the shift grow. The copy of a row that belongs to no configured slot is the other half:
 * its own hour is missing from the list, and the row cannot be put back where it was.
 */
const get = vi.fn();
const patch = vi.fn();
const del = vi.fn();

vi.mock('../api/client', () => ({
  api: { get: (...args: unknown[]) => get(...args), patch: (...args: unknown[]) => patch(...args), del: (...args: unknown[]) => del(...args) },
  ApiClientError: class ApiClientError extends Error {},
}));

const { LoadingEditPage } = await import('./LoadingEditPage');

// The screen closes a day by the calendar, so a row written on a fixed past date would be read-only and the
// test would prove the opposite of what it claims. The fixture follows today in São Paulo instead.
function saoPauloDay(offsetDays = 0): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

const today = saoPauloDay();
const yesterday = saoPauloDay(-1);

function schedule(id: number, time_slot: string, name: string) {
  return {
    id,
    schedule_date: today,
    time_slot,
    driver_type: 'fletero' as const,
    driver_id: id,
    driver_name: name,
    license_plate: null,
    vehicle_id: null,
    vehicle_description: null,
    vehicle_plate: null,
    canEdit: true,
    canDelete: true,
  };
}

function renderPage(entry = `/loading/edit?date=${today}`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LoadingEditPage />
    </MemoryRouter>
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('es');
});

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe('LoadingEditPage', () => {
  it('prices the row on its own hour without counting it twice', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/loading/schedules')) {
        return { schedules: [schedule(1, '04:00', 'A'), schedule(2, '04:30', 'B')] };
      }
      return { timeSlots: ['04:00', '04:30'] };
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('edit-entry-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('edit-btn-1'));

    // Two fleteros share the shift, so putting the first one back on its own hour keeps the count at two.
    const ownOption = screen.getByTestId('slot-select-1').querySelector('option[value="04:00"]');
    expect(ownOption?.textContent).toBe('04:00 (2/3)');
  });

  it('opens the row the grid sent it to, without hunting it in the list', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/loading/schedules')) {
        return { schedules: [schedule(1, '04:00', 'A'), schedule(2, '04:30', 'B')] };
      }
      return { timeSlots: ['04:00', '04:30'] };
    });
    renderPage(`/loading/edit?date=${today}&edit=2`);

    // The pencil in the grid is a shortcut to this row's own move, so the row arrives already open.
    await waitFor(() => expect(screen.getByTestId('slot-select-2')).toBeInTheDocument());
    expect(screen.queryByTestId('slot-select-1')).toBeNull();
  });

  it('offers the hour a row already holds when the day no longer lists it', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/loading/schedules')) {
        return { schedules: [schedule(1, '23:30', 'Perdido')] };
      }
      return { timeSlots: ['04:00', '04:30'] };
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('edit-entry-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('edit-btn-1'));

    // Without its own hour in the list the select opens empty and saving would be refused: a row that cannot
    // be put back is a row the operator can only delete.
    expect(screen.getByTestId('slot-select-1')).toHaveValue('23:30');
    const option = screen.getByTestId('slot-select-1').querySelector('option[value="23:30"]');
    expect(option).not.toBeNull();
  });

  it('hides the fletero plate in the editor', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/loading/schedules')) {
        return { schedules: [{ ...schedule(1, '04:00', 'Celso'), license_plate: 'RXK' }] };
      }
      return { timeSlots: ['04:00'] };
    });
    renderPage();

    // The row is drawn with his name and his hour; «RXK» is a spreadsheet cell of his, not a truck of ours.
    await waitFor(() => expect(screen.getByTestId('edit-entry-1')).toBeInTheDocument());
    expect(screen.getByTestId('edit-entry-1')).toHaveTextContent('Celso');
    expect(screen.getByTestId('edit-entry-1')).not.toHaveTextContent('RXK');
  });

  it('shows the read-only banner and ignores edit= on a past day', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/loading/schedules')) {
        return { schedules: [schedule(1, '04:00', 'A')], dayActive: true };
      }
      return { timeSlots: ['04:00'] };
    });
    renderPage(`/loading/edit?date=${yesterday}&edit=1`);

    // The day the plant already reported is history: the screen says so and does not open the row, whatever
    // the address asked for.
    await waitFor(() => expect(screen.getByTestId('loading-edit-readonly-banner')).toBeInTheDocument());
    expect(screen.getByTestId('loading-edit-readonly-banner').textContent).toBe('Día cerrado: solo lectura.');
    expect(screen.queryByTestId('slot-select-1')).toBeNull();
    expect(screen.queryByTestId('edit-btn-1')).toBeNull();
  });

  it('keeps today editable, without the banner', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/loading/schedules')) {
        return { schedules: [schedule(1, '04:00', 'A')], dayActive: true };
      }
      return { timeSlots: ['04:00'] };
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('edit-btn-1')).toBeInTheDocument());
    expect(screen.queryByTestId('loading-edit-readonly-banner')).toBeNull();
  });
});
