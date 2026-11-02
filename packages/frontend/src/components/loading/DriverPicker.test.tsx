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

  it('keeps what landed, and leaves only the refused row selected for the retry', async () => {
    post.mockImplementation(async (_url: string, body: { driver_id: number }) => {
      if (body.driver_id === 4) throw Object.assign(new Error('Veículo já agendado nesta data.'), { status: 409 });
      return { schedule: { id: 90 + body.driver_id } };
    });
    const { onRefresh, onClose } = await renderPicker();

    pick('Carlos Fletero');
    fireEvent.click(screen.getByTestId('driver-select-tab-casa'));
    pick('Silvana Casa');
    fireEvent.change(screen.getByTestId('driver-plate-4'), { target: { value: '11' } });
    fireEvent.click(screen.getByTestId('driver-select-accept'));

    await waitFor(() => expect(screen.getByTestId('driver-select-failures')).toBeInTheDocument());

    // The slot is not finished, so the modal stays; the row that landed is already reloaded into the grid.
    expect(onClose).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('driver-select-failure-4')).toHaveTextContent('Vehículo ya programado');
    // What is still owed is the only thing selected: a second accept cannot send what already landed twice.
    expect(screen.getByTestId('driver-select-count')).toHaveTextContent('1 seleccionado');

    post.mockClear();
    post.mockResolvedValue({ schedule: { id: 92 } });
    fireEvent.click(screen.getByTestId('driver-select-retry'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ driver_id: 4, vehicle_id: 11 });
  });

  it('registers a fletero without asking for a plate he does not carry', async () => {
    post.mockImplementation(async (url: string, body: { driver_id?: number; name?: string }) => {
      if (url === '/loading/drivers') {
        return { driver: { id: 77, name: body.name, license_plate: null, phone: null } };
      }
      return { schedule: { id: 177 } };
    });
    await renderPicker();

    fireEvent.click(screen.getByTestId('add-new-fletero-btn'));

    // The plate on a company driver's row is the plant's vehicle; a fletero arrives with his name and phone.
    expect(screen.queryByTestId('driver-form-plate')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('driver-form-name'), { target: { value: 'Celso' } });
    fireEvent.click(screen.getByTestId('driver-form-submit'));

    await waitFor(() => expect(screen.getByTestId('driver-option-77')).toBeInTheDocument());
    expect(post.mock.calls[0][0]).toBe('/loading/drivers');
    expect(post.mock.calls[0][1]).not.toHaveProperty('license_plate');
  });

  it('sends the fletero registered in the modal as part of the same batch', async () => {
    post.mockImplementation(async (url: string, body: { driver_id?: number; name?: string }) => {
      if (url === '/loading/drivers') {
        return { driver: { id: 77, name: body.name, license_plate: null, phone: null } };
      }
      return { schedule: { id: 100 + (body.driver_id ?? 0) } };
    });
    const { onClose } = await renderPicker();

    // Registering him is a step of the same batch: he joins the list, comes back picked, and is sent with it.
    fireEvent.click(screen.getByTestId('add-new-fletero-btn'));
    fireEvent.change(screen.getByTestId('driver-form-name'), { target: { value: 'Novo Fletero' } });
    fireEvent.click(screen.getByTestId('driver-form-submit'));
    await waitFor(() => expect(screen.getByTestId('driver-option-77')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('driver-select-accept'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(post.mock.calls.map((call) => call[0])).toEqual(['/loading/drivers', '/loading/schedules']);
    expect(post.mock.calls[1][1]).toMatchObject({ driver_id: 77, vehicle_id: null });
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
