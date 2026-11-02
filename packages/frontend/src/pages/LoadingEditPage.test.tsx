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

function schedule(id: number, time_slot: string, name: string) {
  return {
    id,
    schedule_date: '2026-11-02',
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

function renderPage(entry = '/loading/edit?date=2026-11-02') {
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
    renderPage('/loading/edit?date=2026-11-02&edit=2');

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
});
