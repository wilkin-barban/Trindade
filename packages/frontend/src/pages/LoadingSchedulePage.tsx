import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LucideSend, LucideFileDown } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { ScheduleGrid } from '../components/loading/ScheduleGrid';
import { ScheduleExportView } from '../components/loading/ScheduleExportView';
import { exportScheduleTextAsPdf } from '../lib/schedule-pdf';
import { ModuleHelpModal } from '../components/ui/ModuleHelpModal';
import type { ScheduleRow, DriverRow } from '../components/loading/ScheduleGrid';



function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function todayDate(): string {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  return `${year}-${month}-${day}`;
}

export function LoadingSchedulePage() {
  const { t } = useTranslation();
  // This screen is the current day's grid and only that: a date in the URL is ignored on purpose, which is
  // what its spec pins down. A different day belongs to the edit screen, and the dashboard links there.
  const date = todayDate();

  // Data
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Whether the day was read at least once. The spinner is for that first read: an empty day stays empty
  // through every reload, and hanging the spinner on the number of rows brought it back after each batch.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  // A failed read is its own state, not an error line over a grid that lies: the grid would draw every hour as
  // empty, and on a phone the grid is what is read. This one takes the grid's place and carries the retry.
  const [readError, setReadError] = useState('');

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);

  // ---- Fetch data for current date ----
  // Answers whether the day was read: the picker opens over that answer, not over the last grid on screen.
  const fetchData = useCallback(async (): Promise<boolean> => {
    setError('');
    setReadError('');
    setLoading(true);

    try {
      const [schedRes, slotsRes, driversRes] = await Promise.all([
        api.get<{ schedules: ScheduleRow[] }>(`/loading/schedules?date=${date}`),
        api.get<{ timeSlots: string[] }>('/loading/time-slots'),
        api.get<{ drivers: DriverRow[] }>('/loading/drivers'),
      ]);

      setSchedules(schedRes.schedules);
      setTimeSlots(slotsRes.timeSlots);
      setDrivers(driversRes.drivers);
      return true;
    } catch (err) {
      setReadError(err instanceof Error ? err.message : t('loading.loadingError'));
      return false;
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [date, t]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Delete handler ----
  async function handleDelete(id: number) {
    try {
      await api.del(`/loading/schedules/${id}`);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loading.deleteError'));
    }
  }

  // ---- Export PDF Handler ----
  async function handleExportPdf() {
    setError('');
    try {
      const data = await api.get<{ text: string }>(`/loading/export?date=${date}`);

      await exportScheduleTextAsPdf(data.text, `cronograma-${date}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('loading.exportError')
      );
    }
  }

  // ---- Loading state ----
  // The spinner is for the first read of the day, not for every reload: a batch that lands reloads the grid
  // while the modal is open, and replacing the page with a spinner would close the modal and take with it the
  // rows the server refused -- the ones the operator still has to send.
  if (loading && !loaded) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-gray-800">
            {t('loading.title')}
          </h2>
          <ModuleHelpModal
            title={t('moduleHelp.loading.title')}
            subtitle={t('moduleHelp.loading.subtitle')}
            description={t('moduleHelp.loading.description')}
            sections={t('moduleHelp.loading.sections', { returnObjects: true }) as any}
          />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {t('loading.description')}
        </p>
      </div>

      {/* Batch date */}
      <div className="mb-4 bg-white rounded-lg border border-gray-200 px-4 py-3 text-center">
        <span className="text-lg font-semibold text-gray-800" data-testid="date-display">
          {formatDisplayDate(date)}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      {/* A day that could not be read: the failure in the grid's place, with the way back. */}
      {readError ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center"
          data-testid="loading-schedule-read-error"
        >
          <p className="text-sm text-red-700">{readError}</p>
          <Button
            onClick={() => { void fetchData(); }}
            variant="outline"
            size="sm"
            className="mt-3"
            data-testid="loading-schedule-retry"
          >
            {t('ui.retry')}
          </Button>
        </div>
      ) : (
      <ScheduleGrid
        schedules={schedules}
        timeSlots={timeSlots}
        date={date}
        drivers={drivers}
        loading={loading}
        onDelete={handleDelete}
        onRefresh={fetchData}
      />
      )}

      {/* Action buttons */}
      <div className="mt-6 mb-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          onClick={handleExportPdf}
          variant="outline"
          size="lg"
          className="w-full sm:w-auto"
          data-testid="loading-export-pdf-btn"
          disabled={schedules.length === 0}
        >
          <LucideFileDown className="h-4 w-4" />
          {t('loading.exportPdf')}
        </Button>
        <Button
          onClick={() => setExportOpen(true)}
          size="lg"
          className="w-full sm:w-auto"
          data-testid="open-export-btn"
          disabled={schedules.length === 0}
        >
          <LucideSend className="h-4 w-4" />
          {t('loading.export')}
        </Button>
      </div>

      {/* Export modal */}
      <ScheduleExportView
        date={date}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
