import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import type { PickerDriver } from '../../lib/loading-picker';

/**
 * What the batch does to the server, which is the part the surface cannot show.
 *
 * The dialog's own test pins what it draws and the lib's test pins the payloads; here the claim is the order:
 * one request per picked driver when the batch is accepted, and nothing sent before that -- no request on the
 * first pick, which is the whole point of holding them.
 */
const get = vi.fn();
const post = vi.fn();

vi.mock('../../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

const { DriverPicker } = await import('./DriverPicker');

const FLETERO: PickerDriver = { id: 1, name: 'Carlos Fletero', driver_type: 'fletero', license_plate: 'ABC-1D23' };
const CASA: PickerDriver = { id: 4, name: 'Silvana Casa', driver_type: 'casa', license_plate: null };

async function renderPicker() {
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  render(
    <DriverPicker
      timeSlot="04:00"
      date="2026-02-10"
      drivers={[FLETERO, CASA]}
      assignedIds={[]}
      assignedVehicleIds={[]}
      onRefresh={onRefresh}
      onClose={onClose}
    />,
  );
  // The fleet is read when the modal opens. Flushing that promise here keeps the plate selector out of the
  // way: without it the select has no options, the chosen value silently stays empty and the batch is
  // withheld for a plate the test believes it already gave.
  await act(async () => {});
  return { onRefresh, onClose };
}

function pick(name: string) {
  const label = screen.getByText(name).closest('label')!;
  fireEvent.click(label.querySelector('input[type="checkbox"]')!);
}

beforeEach(async () => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({ vehicles: [{ id: 11, description: 'Volvo FH 540', license_plate: 'TRK-1A11' }] });
  post.mockResolvedValue({ schedule: { id: 99 } });
  await i18n.changeLanguage('es');
});

describe('DriverPicker', () => {
  it('sends one request per picked driver, each with its own plate, and closes when all land', async () => {
    const { onRefresh, onClose } = await renderPicker();

    pick('Carlos Fletero');
    // Picking is not assigning: nothing has been sent yet.
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('driver-select-tab-casa'));
    pick('Silvana Casa');
    fireEvent.change(screen.getByTestId('driver-plate-4'), { target: { value: '11' } });
    fireEvent.click(screen.getByTestId('driver-select-accept'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(post.mock.calls.map((call) => call[1])).toEqual([
      { schedule_date: '2026-02-10', time_slot: '04:00', driver_type: 'fletero', driver_id: 1, vehicle_id: null },
      { schedule_date: '2026-02-10', time_slot: '04:00', driver_type: 'casa', driver_id: 4, vehicle_id: 11 },
    ]);
    // The grid is reloaded before the modal closes, so what was accepted is already on screen behind it.
    expect(onRefresh).toHaveBeenCalled();
  });

  it('withholds the batch while a picked company driver has no plate', async () => {
    await renderPicker();

    fireEvent.click(screen.getByTestId('driver-select-tab-casa'));
    pick('Silvana Casa');
    fireEvent.click(screen.getByTestId('driver-select-accept'));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByTestId('driver-select-plate-missing')).toHaveTextContent('Silvana Casa');
  });
});
