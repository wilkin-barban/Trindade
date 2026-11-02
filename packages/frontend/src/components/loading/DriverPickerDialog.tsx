import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import {
  freeVehicles,
  type PickedPlates,
  type PickerDriver,
  type PickerTab,
  type PickerVehicle,
} from '../../lib/loading-picker';

export interface DriverPickerDialogProps {
  slot: string;
  tab: PickerTab;
  onTabChange: (tab: PickerTab) => void;
  drivers: readonly PickerDriver[];
  vehicles: readonly PickerVehicle[];
  picked: PickedPlates;
  onToggle: (driver: PickerDriver) => void;
  onVehicle: (driverId: number, raw: string) => void;
  /** The fleteros tab's own footer: the quick add for somebody nobody has registered yet. */
  quickAdd: ReactNode;
  vehiclesError: boolean;
  onRetryVehicles: () => void;
  plateMissing: readonly string[];
  /** The plates two rows of this batch would share, named so the operator knows which row to change. */
  plateRepeated: readonly string[];
  /** The drivers of the day that are already somewhere else, with the hour they are in. */
  busy: readonly { id: number; name: string; timeSlot: string }[];
  /** How many plates the plant has at all, which is what tells an empty fleet from a full day. */
  fleetSize: number;
  error: string;
  /** The rows the last batch could not send, each with the reason the server gave for that row. */
  failures: readonly { driverId: number; name: string; message: string }[];
  onRetry: () => void;
  assigning: boolean;
  onAccept: () => void;
  onClose: () => void;
}

/**
 * The modal that assigns several drivers of one time slot at once.
 *
 * A batch of thirteen loads is thirteen drivers, and assigning them one panel at a time meant reopening the
 * same list thirteen times and losing the place each time. The two kinds of driver stay apart the way the day
 * keeps them apart -- a fletero brings his own truck, a company driver needs a plate from the fleet -- and the
 * picks are held until they are accepted, so the whole slot is one decision instead of thirteen.
 *
 * Everything here is drawn from props: what is picked, what is owed, and what the server said. The order of
 * the requests and what survives them is the container's business, which is what lets this be read as a
 * surface and not as a state machine.
 */
export function DriverPickerDialog({
  slot,
  tab,
  onTabChange,
  drivers,
  vehicles,
  picked,
  onToggle,
  onVehicle,
  quickAdd,
  vehiclesError,
  onRetryVehicles,
  plateMissing,
  plateRepeated,
  busy,
  fleetSize,
  error,
  failures,
  onRetry,
  assigning,
  onAccept,
  onClose,
}: DriverPickerDialogProps) {
  const { t } = useTranslation();
  const fleteros = drivers.filter((driver) => driver.driver_type === 'fletero');
  const casa = drivers.filter((driver) => driver.driver_type === 'casa');

  const tabButton = (key: PickerTab, label: string) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => onTabChange(key)}
      className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
      data-testid={`driver-select-tab-${key}`}
    >
      {label}
    </button>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="driver-select-title"
      describedBy="driver-select-hint"
      panelTestId={`driver-select-${slot.replace(':', '-')}`}
    >
      <div className="flex flex-col min-h-0 max-h-[85vh]">
        <div className="px-4 pt-4 pb-2">
          <h3 id="driver-select-title" className="text-lg font-semibold text-gray-800">
            {t('loading.pickerTitle', { slot })}
          </h3>
          <p id="driver-select-hint" className="text-xs text-gray-500 mt-1">
            {t('loading.pickerHint')}
          </p>
        </div>

        {/* The drivers the day already has, with the hour each one is in: dropping them from the list without a
            word reads as "he is not in the roster", and the operator adds him again to find out he was. */}
        {busy.length > 0 && (
          <ul className="px-4 pt-2 space-y-0.5" data-testid="driver-select-busy">
            {busy.map((driver) => (
              <li key={driver.id} className="text-xs text-gray-500" data-testid={`driver-select-busy-${driver.id}`}>
                {t('loading.pickerBusy', { name: driver.name, time: driver.timeSlot })}
              </li>
            ))}
          </ul>
        )}

        <div className="flex border-b border-gray-200 mx-4" role="tablist" aria-label={t('loading.pickerTitle', { slot })}>
          {tabButton('fleteros', t('loading.pickerTabFleteros'))}
          {tabButton('casa', t('loading.pickerTabCasa'))}
        </div>

        <div className="px-4 py-2 overflow-y-auto min-h-0" role="tabpanel">
          {error && (
            <p className="mb-2 text-sm text-red-600" role="alert" data-testid="driver-select-error">
              {error}
            </p>
          )}

          {/* One sentence per refused row, with the name in it: a batch that half landed owes the operator
              the specific rows that did not, not a count to hunt for in the list. */}
          {failures.length > 0 && (
            <ul className="mb-2 space-y-1" role="alert" data-testid="driver-select-failures">
              {failures.map((failure) => (
                <li
                  key={failure.driverId}
                  className="text-sm text-red-600"
                  data-testid={`driver-select-failure-${failure.driverId}`}
                >
                  {t('loading.pickerFailureFor', { name: failure.name, message: failure.message })}
                </li>
              ))}
            </ul>
          )}

          {tab === 'fleteros' ? (
            <div>
              {fleteros.length === 0 && (
                <p className="text-sm text-gray-500 py-3" data-testid="driver-select-empty-fleteros">
                  {t('loading.pickerEmpty')}
                </p>
              )}
              {fleteros.map((driver) => (
                <label
                  key={driver.id}
                  className="flex items-center gap-3 px-1 py-2.5 min-h-[44px] rounded-md hover:bg-blue-50 cursor-pointer"
                  data-testid={`driver-option-${driver.id}`}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(driver.id)}
                    onChange={() => onToggle(driver)}
                    disabled={assigning}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  {/* Solo el nombre: la chapa de un fletero en el padrón es un dato viejo de la planilla,
                      no el vehículo que se le asigna. La chapa que importa se elige en la pestaña de la casa,
                      sobre una fila ya marcada. */}
                  <span className="text-sm font-medium text-gray-800 flex-1">{driver.name}</span>
                </label>
              ))}
              {quickAdd}
            </div>
          ) : casa.length === 0 ? (
            <p className="text-sm text-gray-500 py-3" data-testid="driver-select-empty-casa">
              {t('loading.pickerEmpty')}
            </p>
          ) : (
            casa.map((driver) => {
              const isPicked = picked.has(driver.id);
              const chosen = picked.get(driver.id);
              return (
                <div
                  key={driver.id}
                  className="px-1 py-2 border-b border-gray-100 last:border-0"
                  data-testid={`driver-option-${driver.id}`}
                >
                  <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => onToggle(driver)}
                      disabled={assigning}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-800 flex-1">{driver.name}</span>
                  </label>
                  {/* A plate belongs to a driver the operator picked: offering it on a row nobody selected
                      would set a value the batch would then ignore. */}
                  <select
                    value={chosen == null ? '' : String(chosen)}
                    onChange={(event) => onVehicle(driver.id, event.target.value)}
                    disabled={assigning || !isPicked}
                    aria-label={t('loading.pickerPlateFor', { name: driver.name })}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white disabled:opacity-50"
                    data-testid={`driver-plate-${driver.id}`}
                  >
                    <option value="">{t('loading.pickerPlate')}</option>
                    {/* The plates of this row: the day's free ones, minus the ones the rest of the batch
                        already took, plus its own so choosing it again does not empty the selector. */}
                    {freeVehicles(vehicles, [], picked, driver.id).map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.license_plate} · {vehicle.description}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })
          )}

          {/* A plant with no plates loaded says so once, above the rows: the row's own complaint («falta la
              chapa de Silvana») is true and unhelpful, and it sends the operator to look for a plate in a list
              that has none. */}
          {!vehiclesError && vehicles.length === 0 && fleetSize === 0 && (
            <p className="text-xs text-amber-700 mt-2" data-testid="driver-select-no-vehicles">
              {t('loading.noVehicles')}
            </p>
          )}

          {/* A plant whose plates are all out on this day is not a plant with no plates: the first is the day,
              the second is the setup, and only the second one sends anybody to Admin. */}
          {!vehiclesError && vehicles.length === 0 && fleetSize > 0 && (
            <p className="text-xs text-amber-700 mt-2" data-testid="driver-select-no-plates-free">
              {t('loading.pickerAllPlatesTaken')}
            </p>
          )}

          {vehiclesError && (
            <div className="flex items-center gap-2 text-xs text-red-600 mt-2" role="alert">
              <span>{t('loading.vehiclesError')}</span>
              <Button type="button" variant="outline" size="sm" onClick={onRetryVehicles}>
                {t('ui.retry')}
              </Button>
            </div>
          )}

          {/* Named rather than counted: with several company drivers picked, "falta una chapa" leaves the
              operator hunting the list for the row that needs it. */}
          {plateRepeated.length > 0 && (
            <p className="text-sm text-red-600 mt-2" role="alert" data-testid="driver-select-plate-repeated">
              {t('loading.pickerPlateRepeated', { plate: plateRepeated.join(', ') })}
            </p>
          )}

          {plateMissing.length > 0 && (
            <p className="text-sm text-red-600 mt-2" role="alert" data-testid="driver-select-plate-missing">
              {t('loading.pickerPlateMissing', { names: plateMissing.join(', ') })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200">
          <span className="text-xs text-gray-500 flex-1" data-testid="driver-select-count">
            {t('loading.pickerSelected', { count: picked.size })}
          </span>
          {failures.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={assigning}
              data-testid="driver-select-retry"
            >
              {t('loading.pickerRetry')}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={assigning} data-testid="driver-select-close">
            {t('ui.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onAccept}
            disabled={assigning || picked.size === 0}
            data-testid="driver-select-accept"
          >
            {assigning ? t('ui.loading') : t('loading.pickerAccept')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
