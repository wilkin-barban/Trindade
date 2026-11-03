import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { DateField } from '../ui/date-field';

interface UserOption {
  id: number;
  display_name: string;
}

type HistoryFilterPrefix = 'history' | 'loading-history';

interface HistoryFiltersProps {
  prefix: HistoryFilterPrefix;
  date: string;
  month: string;
  userId: string;
  users: UserOption[];
  today: string;
  hasFilters: boolean;
  onDateChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onUserChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
}

/**
 * The same query card in both history modules.
 *
 * A bare `<input type="date">` is not predictable on iOS: WebKit draws the operating system's spelling
 * of the date and claims an intrinsic width, which is why the two filters rendered as blank grey boxes
 * and overlapped their neighbours. `DateField` owns the visible surface and leaves the native picker on
 * top; the month variant follows the same rule. On a phone every control is full width and labelled;
 * on a wider card they return to one row without losing the labels.
 */
export function HistoryFilters({
  prefix,
  date,
  month,
  userId,
  users,
  today,
  hasFilters,
  onDateChange,
  onMonthChange,
  onUserChange,
  onApply,
  onClear,
}: HistoryFiltersProps) {
  const { t } = useTranslation();

  return (
    <Card className="p-3 mb-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4 sm:items-end sm:gap-2">
        <DateField
          id={`${prefix}-date`}
          label={t('history.filterDate')}
          value={date}
          max={today}
          onChange={onDateChange}
          testId={`${prefix}-date-filter`}
          variant="panel"
        />
        <DateField
          id={`${prefix}-month`}
          label={t('history.filterMonth')}
          value={month}
          max={today.slice(0, 7)}
          onChange={onMonthChange}
          testId={`${prefix}-month-filter`}
          type="month"
          variant="panel"
        />
        <label
          htmlFor={`${prefix}-user`}
          className="flex min-h-[60px] flex-col justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-left transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30"
        >
          <span className="text-xs text-gray-500">{t('history.filterUser')}</span>
          <select
            id={`${prefix}-user`}
            value={userId}
            onChange={(event) => onUserChange(event.target.value)}
            className="mt-0.5 w-full bg-transparent text-base font-semibold text-gray-900 outline-none"
            data-testid={`${prefix}-user-filter`}
          >
            <option value="">{t('history.allUsers')}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.display_name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            size="sm"
            className="w-full max-sm:min-h-12 sm:w-auto"
            onClick={onApply}
            data-testid={`${prefix}-apply-filters`}
          >
            {t('reports.filter')}
          </Button>
          {hasFilters && (
            <Button
              size="sm"
              variant="outline"
              className="w-full max-sm:min-h-12 sm:w-auto"
              onClick={onClear}
              data-testid="history-clear-filters"
            >
              {t('history.clearFilters')}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
