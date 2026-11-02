import { useTranslation } from 'react-i18next';
import { DateField } from './date-field';
import { formatDateLabel } from '../../lib/date';

/** One day a history offers, as a chip: the day and how much was counted on it. */
export interface HistoryDay {
  date: string;
  /**
   * What the day holds, in the unit the screen counts in -- boxes for stock, units for massas.
   *
   * `null` is the day the screen offers by default and the endpoint never listed: yesterday in the massas
   * history, where a day with nothing is still worth opening. The chip then shows only the day, because
   * printing `0` would state a fact nobody read.
   */
  units: number | null;
}

interface HistoryDayPanelProps {
  id: string;
  /** Accessible name of the field. The panel shows the label above the day, at label size. */
  label: string;
  value: string;
  onChange: (date: string) => void;
  /** Oldest day the archive opens. */
  min: string;
  /** Newest closed day: today is still being filled and belongs to the other screen. */
  max: string;
  /**
   * Prefix of the `data-testid`s: `-date`, `-days` and `-day-<date>`.
   *
   * It is the only thing the two histories pass differently, which is what keeps them from drifting into
   * two designs again.
   */
  testIdPrefix: string;
  groupLabel: string;
  days: readonly HistoryDay[];
  /** The day list failed. The panel stays usable: the field is the fallback the operator still has. */
  failed?: boolean;
  /** Sentence drawn under the field when the list failed. */
  failedMessage?: string;
}

/**
 * The day a past day is picked with: one panel, one strip of chips, in every history that reads backwards.
 *
 * A calendar alone is the wrong shape for this choice. The day an operator wants is almost always yesterday
 * or the day before, so the archive's own days are drawn as a strip they can press without knowing what a
 * date picker is; the panel above carries the same day as its largest text, so the control that occupies the
 * most space does not hold the smallest data. Both screens that read a past day -- the count and the massas
 * launches -- are this same component, because when each screen owned its copy they drifted into a card of
 * two-line buttons in one of them and nobody noticed the second design.
 *
 * The chips come from the endpoint that lists the days, so a day with nothing recorded is not offered as an
 * empty one -- except the day the screen passes in explicitly, which is offered alone, without a count.
 */
export function HistoryDayPanel({
  id,
  label,
  value,
  onChange,
  min,
  max,
  testIdPrefix,
  groupLabel,
  days,
  failed = false,
  failedMessage,
}: HistoryDayPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <DateField
        id={id}
        label={label}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        testId={`${testIdPrefix}-date`}
        variant="panel"
      />
      {days.length > 0 && (
        <div
          role="group"
          aria-label={groupLabel}
          data-testid={`${testIdPrefix}-days`}
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {days.map((day) => {
            const active = day.date === value;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onChange(day.date)}
                disabled={active}
                aria-pressed={active}
                data-testid={`${testIdPrefix}-day-${day.date}`}
                className={
                  'inline-flex h-11 shrink-0 items-center rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors ' +
                  (active
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50')
                }
              >
                {day.units == null
                  ? formatDateLabel(day.date).slice(0, 5)
                  : `${formatDateLabel(day.date).slice(0, 5)} · ${day.units}`}
              </button>
            );
          })}
        </div>
      )}
      {failed && (
        <p role="status" className="text-xs text-amber-700">
          {failedMessage ?? t('massas.historyDaysUnavailable')}
        </p>
      )}
    </div>
  );
}
