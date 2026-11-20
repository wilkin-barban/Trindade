import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { LoadingSpinner } from '../ui/loading-spinner';

/**
 * What left the plant that day, grouped by the operator who recorded it.
 *
 * The web and the Android app both launch into the same ERP, so the day's salidas are part of the report whether
 * or not this screen recorded them: the report is the day's document, not this module's. The shape mirrors the
 * massas section on purpose -- operator, products, units, a total -- because a report the plant reads twice a day
 * should not make the reader learn a second layout.
 *
 * Product codes never appear here. They are traceability, and the report is a message.
 */

/** One product of one operator's day. */
export interface SalidaReportProduct {
  code: string;
  name: string;
  block: string;
  units: number;
}

/** One operator's share of the day's salidas. */
export interface SalidaReportOperator {
  name: string;
  username: string;
  units: number;
  products: SalidaReportProduct[];
  /** True when the name only exists in the company's book: nobody launched it from Trindade. */
  erpOnly?: boolean;
}

export interface SalidaReportDay {
  date: string;
  operators: SalidaReportOperator[];
  totalUnits: number;
  movementCount: number;
}

export function SalidaReportSection({
  date,
  hideRefresh = false,
  refetchKey = 0,
  onDayLoaded,
}: {
  /** The report's own day: the salidas are read for the same date the report covers. */
  date: string;
  hideRefresh?: boolean;
  refetchKey?: number;
  /** El día que la sección leyó, para que quien la monta pueda sumarlo a su mensaje sin volver a pedirlo. */
  onDayLoaded?: (day: SalidaReportDay | null) => void;
}) {
  const { t } = useTranslation();
  const [day, setDay] = useState<SalidaReportDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // El aviso al padre vive en una ref: si dependiera de una función que él recrea, cada lectura cambiaría el
  // callback, el efecto volvería a correr y la sección se leería a sí misma en un bucle -- que es lo que hacía.
  const onDayLoadedRef = useRef(onDayLoaded);
  onDayLoadedRef.current = onDayLoaded;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const body = await api.get<SalidaReportDay>(`/reports/day/salidas?date=${date}`);
      setDay(body);
      onDayLoadedRef.current?.(body);
    } catch {
      // A report is still readable without this block; it says so instead of pretending the day had nothing.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load, refetchKey, refreshKey]);

  const operators = day?.operators ?? [];

  return (
    <Card className="mb-6 border-gray-200 shadow-sm" data-testid="salida-report-section">
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-800">{t('salida.title')}</h3>
          {!hideRefresh && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading}
              className="min-h-[44px] text-xs"
              data-testid="salida-report-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>

        {loading && !day && (
          <div className="flex justify-center py-6" data-testid="salida-report-loading">
            <LoadingSpinner />
          </div>
        )}

        {failed && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="salida-report-error">
            {t('salida.historyLoadError')}
          </p>
        )}

        {!loading && !failed && operators.length === 0 && (
          <p className="text-sm text-gray-500" data-testid="salida-report-empty">
            {t('salida.historyEmptyBody')}
          </p>
        )}

        {operators.length > 0 && (
          <>
            <ul className="space-y-3">
              {operators.map((operator) => (
                <li
                  key={operator.username}
                  className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                  data-testid={`salida-report-operator-${operator.username}`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {operator.name}
                    {operator.name !== operator.username && (
                      <span className="ml-1 text-xs font-normal text-gray-500">({operator.username})</span>
                    )}
                    {operator.erpOnly && (
                      <span
                        className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
                        data-testid={`salida-report-erp-only-${operator.username}`}
                      >
                        {t('reports.salidaErpOnly')}
                      </span>
                    )}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {operator.products
                      .filter((product) => product.units > 0)
                      .map((product) => (
                        <li key={product.code} className="flex items-baseline justify-between gap-3 text-sm text-gray-700">
                          <span className="min-w-0 truncate">{product.name}</span>
                          <span className="shrink-0 tabular-nums text-gray-500">{product.units} un</span>
                        </li>
                      ))}
                  </ul>
                  <p className="mt-1 text-xs font-medium tabular-nums text-gray-600">
                    {operator.units} un
                  </p>
                </li>
              ))}
            </ul>
            <p
              className="mt-3 flex items-baseline justify-between border-t border-gray-100 pt-2 text-sm font-semibold text-gray-800"
              data-testid="salida-report-total"
            >
              <span>{t('salida.totalUnits')}</span>
              <span className="tabular-nums">{day?.totalUnits ?? 0} un</span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
