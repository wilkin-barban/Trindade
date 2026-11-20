import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LucideMessageCircle, LucideX } from 'lucide-react';
import { api } from '../../api/client';
import { Button } from '../ui/button';
import { LoadingSpinner } from '../ui/loading-spinner';
import { Dialog } from '../ui/dialog';
import { waMeLink } from '../../lib/whatsapp';
import { fleterosWithPhone } from '../../lib/loading-fleteros';
import type { DriverRow, ScheduleRow } from './ScheduleGrid';

export interface ScheduleExportViewProps {
  date: string;
  open: boolean;
  onClose: () => void;
}

export function ScheduleExportView({ date, open, onClose }: ScheduleExportViewProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);

  /**
   * The fleteros of this batch whose number is known, which are the ones a private message can reach.
   *
   * Built from the batch rather than from the whole fleet: sending a day's schedule to a driver who is
   * not on it is a message about a day that does not concern them.
   */
  const reachable = useMemo(() => fleterosWithPhone(schedules, drivers), [schedules, drivers]);

  useEffect(() => {
    if (!open || !date) return;

    let cancelled = false;
    setError('');
    setLoading(true);

    // The private actions need the batch and the fleet. Neither can hide the text: the text is what the
    // dialog is for, so a fleet read that fails leaves the list empty and the rest of the dialog working.
    api
      .get<{ schedules: ScheduleRow[] }>(`/loading/schedules?date=${date}`)
      .then((res) => { if (!cancelled) setSchedules(res.schedules); })
      .catch(() => { if (!cancelled) setSchedules([]); });
    api
      .get<{ drivers: DriverRow[] }>('/loading/drivers')
      .then((res) => { if (!cancelled) setDrivers(res.drivers); })
      .catch(() => { if (!cancelled) setDrivers([]); });

    async function fetchExport() {
      try {
        const data = await api.get<{ text: string }>(
          `/loading/export?date=${date}`
        );
        if (!cancelled) {
          setText(data.text);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t('loading.exportError')
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchExport();
    return () => {
      cancelled = true;
    };
  }, [open, date, t]);

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="loading-export-title"
      panelTestId="loading-export-modal"
      // Un panel de altura acotada: con siete fleteros el mensaje tiene que seguir a la vista, y con veinte el que
      // se desplaza es la lista, no el mensaje ni el botón que cierra.
      panelClassName="relative flex max-h-[90vh] w-[min(100%-1.5rem,44rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
    >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <h3 id="loading-export-title" className="text-lg font-semibold text-gray-800">
            {t('loading.exportTitle')}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('ui.close')}
            data-testid="loading-export-close"
          >
            <LucideX className="h-5 w-5" />
          </Button>
        </div>

        {/* La prévia del mensaje: una banda propia y visible, con su scroll si el texto es largo. */}
        <div className="shrink-0 border-b border-gray-200 p-4" data-testid="loading-export-preview">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          )}

          {error && (
            <div role="alert" aria-live="assertive" className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div
              id="loading-export-text"
              className="max-h-[28vh] overflow-y-auto rounded-lg bg-gray-50 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-800 select-all sm:max-h-[34vh]"
              data-testid="loading-export-text"
            >
              {text}
            </div>
          )}
        </div>

        {/* Los fleteros, en su propia área con scroll: la lista crece, el mensaje y el cierre no se mueven. */}
        {!loading && !error && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-4 pt-3" data-testid="loading-export-fleteros-header">
              <p className="text-sm font-medium text-gray-700">{t('loading.sendToFletero')}</p>
              {reachable.length > 0 && (
                <span className="text-xs font-semibold tabular-nums text-gray-500" data-testid="loading-export-fleteros-count">
                  {t('loading.fleteroCount', '{{count}} fleteros', { count: reachable.length })}
                </span>
              )}
            </div>
            <p className="px-4 pb-2 text-xs text-gray-500">
              {t('loading.sendToFleteroHint', 'Cada enlace abre o WhatsApp com o horário do dia.')}
            </p>
            <div
              className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-3"
              data-testid="loading-export-fleteros"
            >
              {reachable.map((driver) => {
                const href = waMeLink(driver.phone ?? '', text);
                if (!href) return null;
                return (
                  <a
                    key={driver.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-left text-sm font-medium text-green-900 transition-colors hover:bg-green-100"
                    data-testid={`loading-export-fletero-${driver.id}`}
                  >
                    <LucideMessageCircle className="h-4 w-4 shrink-0 text-green-700" />
                    <span className="min-w-0 flex-1 truncate">{driver.name}</span>
                    {driver.phone && (
                      <span className="shrink-0 text-xs font-normal tabular-nums text-green-800">
                        {driver.phone}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center justify-end border-t border-gray-200 p-4">
              <Button variant="outline" onClick={onClose} data-testid="loading-export-dismiss">
                {t('ui.close')}
              </Button>
            </div>
          </div>
        )}
    </Dialog>
  );
}
