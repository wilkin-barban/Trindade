import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import type { PickedPlates, PickerDriver, PickerTab, PickerVehicle } from '../../lib/loading-picker';

/**
 * The modal's surface: what it draws, given the picks.
 *
 * The order of the requests and what survives them is the container's business and the rules are the lib's;
 * what is pinned here is the shape that makes one opening enough for a whole slot -- the two lists as tabs, a
 * plate that only exists on a picked company driver's row, and a counter that says how many are waiting.
 */
const { DriverPickerDialog } = await import('./DriverPickerDialog');

const FLETERO: PickerDriver = {
  id: 1,
  name: 'Carlos Fletero',
  driver_type: 'fletero',
  license_plate: 'ABC-1D23',
};
const CASA: PickerDriver = { id: 4, name: 'Silvana Casa', driver_type: 'casa', license_plate: null };
const VEHICLES: PickerVehicle[] = [
  { id: 11, description: 'Volvo FH 540', license_plate: 'TRK-1A11' },
  { id: 12, description: 'Scania R450', license_plate: 'TRK-2B22' },
];

function renderDialog(overrides: Partial<Parameters<typeof DriverPickerDialog>[0]> = {}) {
  const props = {
    slot: '04:00',
    tab: 'fleteros' as PickerTab,
    onTabChange: vi.fn(),
    drivers: [FLETERO, CASA],
    vehicles: VEHICLES,
    picked: new Map() as PickedPlates,
    onToggle: vi.fn(),
    onVehicle: vi.fn(),
    quickAdd: <button type="button" data-testid="add-new-fletero-btn">+ Nuevo fletero</button>,
    vehiclesError: false,
    onRetryVehicles: vi.fn(),
    plateMissing: [],
    error: '',
    failures: [],
    onRetry: vi.fn(),
    assigning: false,
    onAccept: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<DriverPickerDialog {...props} />);
  return { ...props, rerender: (next: Partial<typeof props>) => view.rerender(<DriverPickerDialog {...props} {...next} />) };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('DriverPickerDialog', () => {
  it('opens on the fleteros, and the company drivers are one tab away', () => {
    const props = renderDialog();

    expect(screen.getByTestId('driver-select-tab-fleteros')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Carlos Fletero')).toBeInTheDocument();
    // The company driver is not drawn beside the fleteros: the two lists answer different questions.
    expect(screen.queryByText('Silvana Casa')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('driver-select-tab-casa'));

    expect(props.onTabChange).toHaveBeenCalledWith('casa');
  });

  it('draws the company driver with his plate, which only exists on a row that was picked', () => {
    const props = renderDialog({ tab: 'casa', picked: new Map([[4, null]]) });

    const plate = screen.getByTestId('driver-plate-4') as HTMLSelectElement;
    expect(plate.disabled).toBe(false);
    // The empty option is the plate nobody chose yet, and the fleet's plates follow it.
    expect([...plate.options].map((option) => option.value)).toEqual(['', '11', '12']);

    fireEvent.change(plate, { target: { value: '11' } });
    expect(props.onVehicle).toHaveBeenCalledWith(4, '11');

    // A row nobody picked offers no plate: a value set there is one the batch would not send.
    props.rerender({ picked: new Map() });
    expect((screen.getByTestId('driver-plate-4') as HTMLSelectElement).disabled).toBe(true);
  });

  it('draws a fletero with his name and nothing else: the plate is the plant\'s, not his', () => {
    renderDialog({ tab: 'fleteros', picked: new Map([[1, null]]) });

    const row = screen.getByTestId('driver-option-1');
    expect(row).toHaveTextContent('Carlos Fletero');
    // Celso carries 'RXK' and Fabiano 'RKM' in the plant's records, and those plates are why the row used to
    // read «Chapa» beside a man who does not drive a truck of ours. Neither the word nor the value belong here.
    expect(row).not.toHaveTextContent('ABC-1D23');
    expect(screen.queryByTestId('driver-plate-1')).not.toBeInTheDocument();
  });

  it('counts what is waiting and holds the batch until one driver is picked', () => {
    const props = renderDialog({ picked: new Map([[1, null], [4, null]]) });

    expect(screen.getByTestId('driver-select-count')).toHaveTextContent('2 seleccionados');
    expect(screen.getByTestId('driver-select-accept')).toBeEnabled();

    fireEvent.click(screen.getByTestId('driver-select-accept'));
    expect(props.onAccept).toHaveBeenCalled();

    props.rerender({ picked: new Map() });
    expect(screen.getByTestId('driver-select-count')).toHaveTextContent('0 seleccionados');
    expect(screen.getByTestId('driver-select-accept')).toBeDisabled();
  });

  it('names the company driver the batch is waiting for a plate of', () => {
    renderDialog({ tab: 'casa', picked: new Map([[4, null]]), plateMissing: ['Silvana Casa'] });

    expect(screen.getByTestId('driver-select-plate-missing')).toHaveTextContent('Silvana Casa');
  });

  it('shows the refusal the batch came back with, over the list it belongs to', () => {
    renderDialog({ error: 'Vehículo ya programado en esta fecha.' });

    expect(screen.getByTestId('driver-select-error')).toHaveTextContent('Vehículo ya programado');
  });

  it('names each refused row beside the retry that sends only those', () => {
    const props = renderDialog({
      failures: [{ driverId: 4, name: 'Silvana Casa', message: 'Vehículo ya programado en esta fecha.' }],
    });

    // The row's own name, not a count: with eight picked drivers, "uno falló" leaves the operator hunting.
    expect(screen.getByTestId('driver-select-failure-4')).toHaveTextContent('Silvana Casa');
    expect(screen.getByTestId('driver-select-failure-4')).toHaveTextContent('Vehículo ya programado');

    fireEvent.click(screen.getByTestId('driver-select-retry'));
    expect(props.onRetry).toHaveBeenCalled();
  });

  /**
   * A plant with no plates loaded is not a plant whose plates failed to load.
   *
   * Without vehicles, every company driver's select showed only its placeholder, and the only thing the modal
   * ever said was «Falta la chapa de Silvana»: true, unhelpful, and it sent the operator to look for a plate in
   * a list that has none. The missing setup gets said out loud.
   */
  it('says no plate is configured, instead of only blaming the picked driver', () => {
    renderDialog({ tab: 'casa', vehicles: [] });

    expect(screen.getByTestId('driver-select-no-vehicles')).toHaveTextContent('No hay vehículos configurados');
  });

  it('does not blame the configuration when the plates simply did not arrive', () => {
    renderDialog({ tab: 'casa', vehicles: [], vehiclesError: true });

    expect(screen.queryByTestId('driver-select-no-vehicles')).toBeNull();
    expect(screen.getByText('No se pudieron cargar los vehículos.')).toBeInTheDocument();
  });
});
