import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * The bar that says what is about to leave, and the only button that sends it.
 *
 * On a phone it sticks to the bottom of the screen, because the operator types down a list of twenty-one
 * products and the total has to stay in front of them; from `sm` up it is a static card, since a desktop window
 * is tall enough that a floating bar would only cover the last row of the grid.
 */
export function SalidaSummaryBar({
  productCount,
  totalUnits,
  submitting,
  disabled,
  onLaunch,
}: {
  productCount: number;
  totalUnits: number;
  submitting: boolean;
  disabled: boolean;
  onLaunch: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="sticky bottom-0 z-10 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm"
      data-testid="salida-summary-bar"
      role="group"
      aria-label={t('salida.summaryTitle')}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex items-center gap-6">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {t('salida.summaryProducts')}
            </dt>
            <dd className="text-lg font-bold tabular-nums text-gray-900" data-testid="salida-summary-products">
              {productCount}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {t('salida.summaryUnits')}
            </dt>
            <dd className="text-lg font-bold tabular-nums text-gray-900" data-testid="salida-summary-units">
              {totalUnits} {t('salida.unitsShort')}
            </dd>
          </div>
        </dl>

        <Button
          type="button"
          onClick={onLaunch}
          disabled={disabled || submitting}
          className="min-h-[48px] w-full bg-amber-600 px-6 font-semibold text-white hover:bg-amber-700 sm:w-auto"
          data-testid="salida-launch"
        >
          <Send className="h-4 w-4" />
          {submitting ? t('salida.launching') : t('salida.launch')}
        </Button>
      </div>
    </div>
  );
}
