import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { Button } from './ui/button';
import { salidaDateLine } from '../lib/salida';

export interface DaySessionHeaderProps {
  date: string;
  historyHref: string;
  username?: string | null;
  testIdPrefix?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  help?: ReactNode;
  historyLabel?: string;
}

/**
 * Top block of the launch screens (Salida/Baixa and Massas).
 *
 * Displays the module title, subtitle, optional help modal, history navigation button,
 * and the São Paulo plant date and operator session information.
 */
export function DaySessionHeader({
  date,
  historyHref,
  username,
  testIdPrefix = 'salida',
  title,
  subtitle,
  help,
  historyLabel,
}: DaySessionHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const resolvedTitle =
    title ?? (testIdPrefix === 'massas' ? t('massas.title') : t('salida.title'));
  const resolvedSubtitle =
    subtitle ?? (testIdPrefix === 'massas' ? t('massas.subtitle') : t('salida.subtitle'));
  const resolvedHistoryLabel =
    historyLabel ??
    (testIdPrefix === 'massas'
      ? t('massas.navHistory', t('massas.viewHistory', 'Histórico'))
      : t('salida.navHistory', 'Histórico de Saídas'));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div
        data-testid={`${testIdPrefix}-launch-header`}
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{resolvedTitle}</h1>
            {help && (
              <div className="shrink-0" data-testid={`${testIdPrefix}-launch-help`}>
                {help}
              </div>
            )}
          </div>
          {resolvedSubtitle && <p className="mt-1 text-sm text-gray-500">{resolvedSubtitle}</p>}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(historyHref)}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 text-sm font-semibold sm:w-auto"
            data-testid={`${testIdPrefix}-nav-history`}
          >
            <History className="h-4 w-4" />
            {resolvedHistoryLabel}
          </Button>
        </div>
      </div>

      {/* Neither the date nor the operator is a field: one is the plant's day and the other is the session. */}
      <dl className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm sm:grid-cols-2">
        <div className="flex items-baseline gap-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('salida.dateLabel')}</dt>
          <dd className="font-medium text-gray-900" data-testid={`${testIdPrefix}-date`}>
            {salidaDateLine(date)}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('salida.operatorLabel')}
          </dt>
          <dd className="font-medium text-gray-900" data-testid={`${testIdPrefix}-operator`}>
            {username ?? ''}
            <span className="ml-2 text-xs font-normal text-gray-500">({t('salida.session')})</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
