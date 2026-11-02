import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LucideAlertTriangle, LucidePencil, LucidePlus, LucideX, LucideClock } from 'lucide-react';
import { DriverPicker } from './DriverPicker';
import { countInWindow, isQuotaExceeded, toMinutes } from '../../lib/loading-quota';

export interface ScheduleRow {
  id: number;
  schedule_date: string;
  time_slot: string;
  driver_type: 'fletero' | 'casa';
  driver_id: number | null;
  driver_name: string | null;
  license_plate: string | null;
  vehicle_id: number | null;
  vehicle_description: string | null;
  vehicle_plate: string | null;
  readOnly?: boolean;
  canEdit?: boolean;
  canDeactivate?: boolean;
  canDelete?: boolean;
  isActive?: boolean;
  creator?: { id: number; display_name: string } | null;
}

export interface DriverRow {
  id: number;
  name: string;
  license_plate: string | null;
  /** The number the one-on-one WhatsApp dispatch opens a chat with, or null when nobody has it yet. */
  phone: string | null;
  driver_type: 'casa' | 'fletero';
}

export interface ScheduleGridProps {
  schedules: ScheduleRow[];
  timeSlots: string[];
  date: string;
  drivers: DriverRow[];
  loading: boolean;
  onDelete: (id: number) => Promise<void>;
  /** Reads the day again. A read that failed comes back as `false`, which is what keeps the picker shut. */
  onRefresh: () => void | boolean | Promise<void | boolean>;
}

export function ScheduleGrid({
  schedules,
  timeSlots,
  date,
  drivers,
  loading,
  onDelete,
  onRefresh,
}: ScheduleGridProps) {
  const { t } = useTranslation();
  const [addingSlot, setAddingSlot] = useState<string | null>(null);
  // The slot whose day is being reread, and the sentence left behind when that read failed. The picker is
  // drawn from the day: opening it over a read nobody could make offers plates that are out and hides drivers
  // who are already in.
  const [openingSlot, setOpeningSlot] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState('');

  // The day's configured slots, plus any hour the rows themselves mention. The list is a setting and the rows
  // are facts: an hour saved before the list changed, or booked from the app, would otherwise be drawn nowhere
  // -- counted by the quota, invisible on the grid, and impossible to empty without the API.
  const slots = [...new Set([...timeSlots, ...schedules.map((entry) => entry.time_slot)])].sort(
    (a, b) => toMinutes(a) - toMinutes(b)
  );
  const [deleting, setDeleting] = useState<number | null>(null);

  const assignedVehicleIds = schedules
    .filter((e) => e.vehicle_id != null)
    .map((e) => e.vehicle_id as number);

  async function openPicker(slot: string) {
    setPickerError('');
    setOpeningSlot(slot);
    const read = await onRefresh();
    setOpeningSlot(null);
    if (read === false) {
      setPickerError(t('loading.pickerDayReadFailed'));
      return;
    }
    setAddingSlot(slot);
  }

  function getSlotEntries(slot: string): ScheduleRow[] {
    return schedules.filter((s) => s.time_slot === slot);
  }

  function getAssignedIds(): number[] {
    return schedules
      .filter((e) => e.driver_id != null)
      .map((e) => e.driver_id as number);
  }

  function getDisplayName(entry: ScheduleRow): string {
    if (entry.driver_type === 'casa' && entry.driver_name && entry.vehicle_description) {
      return `${entry.driver_name} (${entry.vehicle_description})`;
    }
    if (entry.driver_name) return entry.driver_name;
    if (entry.vehicle_description) return entry.vehicle_description;
    return '-';
  }

  function getDisplayPlate(entry: ScheduleRow): string {
    if (entry.driver_type === 'casa') {
      return entry.vehicle_plate || '';
    }
    if (entry.license_plate) return entry.license_plate;
    if (entry.vehicle_plate) return entry.vehicle_plate;
    return '';
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await onDelete(id);
    } finally {
      setDeleting(null);
    }
  }


  return (
    <div className="space-y-3" data-testid="schedule-grid">
      {slots.map((slot) => {
        const entries = getSlotEntries(slot);
        // The badge and the warning answer the same question with the same rule: the shift, not the exact
        // minute. A slot showing «1/3» next to «límite alcanzado» was the two halves disagreeing.
        const fleteroCount = countInWindow(schedules, slot);
        const isExceeded = isQuotaExceeded(fleteroCount);
        const isAdding = addingSlot === slot;
        const assignedIds = getAssignedIds();
        const busy = schedules
          .filter((entry) => entry.driver_id != null)
          .map((entry) => ({ driverId: entry.driver_id as number, timeSlot: entry.time_slot }));

        return (
          <div
            key={slot}
            className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
            data-testid={`time-slot-${slot.replace(':', '-')}`}
          >
            {/* Slot header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <LucideClock className="h-4 w-4 text-gray-400" />
                <span className="font-semibold text-gray-800">{slot}</span>
              </div>
              <div className="flex items-center gap-3">
                {/* Quota indicator */}
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    isExceeded
                      ? 'bg-red-100 text-red-700'
                      : fleteroCount > 0
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                  data-testid={`quota-${slot.replace(':', '-')}`}
                >
                  {t('loading.fleterosCount', { count: fleteroCount })}
                </span>
              </div>
            </div>

            {/* Entries list */}
            <div className="divide-y divide-gray-100">
              {entries.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400 italic">
                  {t('loading.emptySlot')}
                </div>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50"
                    data-testid={`entry-${entry.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800">
                        {getDisplayName(entry)}
                      </span>
                      {getDisplayPlate(entry) && (
                        <span className="text-xs text-gray-400 ml-2">
                          {getDisplayPlate(entry)}
                        </span>
                      )}
                      {entry.driver_type === 'casa' && (
                        <span className="text-xs text-blue-500 ml-2 font-medium">
                          (Casa)
                        </span>
                      )}
                    </div>
                    {/* Both actions are 48 pixels tall and wide: a day is edited on a phone, in a warehouse,
                        and a target the size of the glyph is a target a thumb misses. */}
                    {entry.canEdit && (
                      <Link
                        to={`/loading/edit?date=${date}&edit=${entry.id}`}
                        className="inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                        aria-label={t('loading.editEntry')}
                        data-testid={`edit-entry-${entry.id}`}
                      >
                        <LucidePencil className="h-4 w-4" />
                      </Link>
                    )}
                    {entry.canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting === entry.id}
                        className="inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded px-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        aria-label={t('loading.deleteEntry')}
                        data-testid={`delete-entry-${entry.id}`}
                      >
                        <LucideX className="h-4 w-4" />
                        <span className="hidden sm:inline">{t('loading.deleteEntry')}</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add fletero area */}
            <div className="px-4 py-2 border-t border-gray-100 bg-white">
              {isAdding ? (
                // The modal is opened from the slot's own button, so closing it is the same state change in
                // both directions: the slot that was being filled stops being the active one.
                <DriverPicker
                  timeSlot={slot}
                  date={date}
                  drivers={drivers}
                  assignedIds={assignedIds}
                  assignedVehicleIds={assignedVehicleIds}
                  busy={busy}
                  onRefresh={onRefresh}
                  onClose={() => setAddingSlot(null)}
                />
              ) : (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => void openPicker(slot)}
                    disabled={loading || openingSlot !== null}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium py-1 disabled:opacity-50"
                    data-testid={`add-fletero-${slot.replace(':', '-')}`}
                  >
                    <LucidePlus className="h-4 w-4" />
                    {openingSlot === slot ? t('ui.loading') : t('loading.addFletero')}
                  </button>
                  {pickerError && (
                    <p className="text-xs text-red-600" role="alert" data-testid="picker-read-error">
                      {pickerError}
                    </p>
                  )}
                  {isExceeded && (
                    // The warning is a sentence, not an emoji glued to one: an emoji here is read out loud by
                    // a screen reader in the middle of the sentence, and it is the same glyph in both
                    // languages anyway. The triangle is decoration and says so.
                    <p
                      className="flex items-start gap-1 text-xs text-red-500 py-0.5"
                      data-testid={`maxed-${slot.replace(':', '-')}`}
                    >
                      <LucideAlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
                      {t('loading.quotaError')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
