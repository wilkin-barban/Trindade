import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDateLabel } from '../../lib/date';

/** One day the plant launched, as the backend's history endpoint reports it. */
export interface MassasHistoryDay {
  date: string;
  productsCount: number;
  totalBoxes: number;
  totalUnits: number;
  operatorsCount: number;
}

interface MassasDayListProps {
  /** The days that have launches, newest first, as the backend answers them. */
  days: readonly MassasHistoryDay[];
  /** The day open in the table. */
  value: string;
  onChange: (date: string) => void;
  /** Yesterday, always offered: the day the operator most often wants is the one just closed. */
  yesterday: string;
  /** True until the first answer arrives, so an empty list is not read as an empty factory. */
  loading?: boolean;
  /** The answer failed: the list says so instead of showing zero days as a fact. */
  failed?: boolean;
}

/**
 * The days of the massas history, as the phone shows them.
 *
 * One clickable row per day instead of a date input: on a desktop the calendar popup is a detour for a
 * choice that is almost always "yesterday" or "the day before that", and on a phone the list is what the
 * operator's thumb already knows how to use. Each row carries the same totals the Android card carries --
 * boxes, units, products, operators -- because those numbers are how a person recognises the day they
 * mean without opening it.
 *
 * Yesterday is offered even when the history does not list it: a day with nothing is a day worth being
 * able to open and see, and it must not look like a failure. Today is not offered at all -- today is still
 * being launched, and that is the launch screen's job.
 */
export function MassasDayList({ days, value, onChange, yesterday, loading, failed }: MassasDayListProps) {
  const { t } = useTranslation();

  const listed = days.filter((day) => day.date < yesterday);

  return (
    <section
      aria-label={t('massas.historyDaysLabel')}
      data-testid="massas-day-list"
      className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4"
    >
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <CalendarDays className="h-4 w-4 text-gray-500" aria-hidden="true" />
        <span>{t('massas.historyDaysTitle')}</span>
      </h2>

      {loading ? (
        <p className="px-1 py-2 text-sm text-gray-500">{t('massas.historyDaysLoading')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          <li>
            <DayButton
              date={yesterday}
              label={t('massas.historyYesterday')}
              active={yesterday === value}
              onChange={onChange}
            />
          </li>
          {listed.map((day) => (
            <li key={day.date}>
              <DayButton
                date={day.date}
                label={formatDateLabel(day.date)}
                detail={t('massas.historyDayTotals', {
                  boxes: day.totalBoxes,
                  units: day.totalUnits,
                  products: day.productsCount,
                  operators: day.operatorsCount,
                })}
                active={day.date === value}
                onChange={onChange}
              />
            </li>
          ))}
        </ul>
      )}

      {failed && (
        <p role="status" className="mt-2 text-xs text-amber-700">
          {t('massas.historyDaysUnavailable')}
        </p>
      )}
    </section>
  );
}

function DayButton({
  date,
  label,
  detail,
  active,
  onChange,
}: {
  date: string;
  label: string;
  detail?: string;
  active: boolean;
  onChange: (date: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(date)}
      aria-pressed={active}
      data-testid={`massas-day-${date}`}
      className={cn(
        'flex min-h-[44px] flex-col items-start justify-center rounded-lg border px-3 py-1.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        active
          ? 'border-blue-600 bg-blue-50 text-blue-900'
          : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50',
      )}
    >
      <span className="text-sm font-semibold tabular-nums">{label}</span>
      {detail && <span className="text-[11px] text-gray-500">{detail}</span>}
    </button>
  );
}
