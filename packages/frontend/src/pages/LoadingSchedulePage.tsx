import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LucideSave, LucideArrowLeft, LucideTruck } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { ScheduleGrid } from '../components/loading/ScheduleGrid';
import { ScheduleExportView } from '../components/loading/ScheduleExportView';
import { ShareCard } from '../components/reports/ShareCard';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { exportLoadingPdf, fetchLoadingExportText, shareLoadingMessage } from '../lib/loading-share';
import { ModuleHelpModal } from '../components/ui/ModuleHelpModal';
import { useAuth } from '../contexts/AuthContext';
import type { ScheduleRow, DriverRow } from '../components/loading/ScheduleGrid';

function useOptionalAuth() {
  try {
    return useAuth();
  } catch {
    return { user: null };
  }
}



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
  /**
   * The share card for the day.
   *
   * The schedule is saved slot by slot, so there is no single "save" to land on the message: the card is the
   * module's share screen, opened on purpose, and it is the same card the report uses.
   */
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const showingShare = params.get('share') === '1';
  // El histórico abre esta misma tarjeta, pero como vista de solo lectura: sin Editar y con Volver al historial.
  const fromHistory = params.get('from') === 'history';
  // La grilla y su lectura siguen siendo las de hoy -- esta pantalla es el día en curso --, pero la tarjeta que
  // pide el historial habla del día que el historial pidió: su texto, su fecha y su PDF.
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? (params.get('date') as string) : null;
  const shareDate = fromHistory && requestedDate ? requestedDate : date;
  const authUser = useOptionalAuth().user;
  const isToday = shareDate === date;
  const canEditParam = params.get('canEdit') === '1';
  const userIsAdmin = authUser?.role === 'Administrador';
  const userCanEditSchedule = schedules.some((s) => s.canEdit === true);
  const canEditToday = isToday && (userIsAdmin || canEditParam || userCanEditSchedule);
  const [shareText, setShareText] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

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

  // The card's text, loaded when the card is shown. It sits with the other hooks on purpose: a hook after an
  // early return changes the order the moment the flag flips.
  useEffect(() => {
    if (!showingShare) return;
    let cancelled = false;
    setShareLoading(true);
    setShareError(null);
    void (async () => {
      try {
        const text = await fetchLoadingExportText(shareDate);
        if (!cancelled) setShareText(text);
      } catch (err) {
        if (!cancelled) setShareError(err instanceof Error ? err.message : t('loading.exportError'));
      } finally {
        if (!cancelled) setShareLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showingShare, shareDate, t]);

  async function handleShareMessage() {
    setSharing(true);
    setShareNote(null);
    try {
      const outcome = await shareLoadingMessage(shareText);
      if (outcome === 'copied') setShareNote(t('loading.shareCopied', 'Texto copiado: pegalo en el chat.'));
      else if (outcome === 'failed') setShareNote(t('loading.shareUnavailable', 'No se pudo compartir.'));
    } finally {
      setSharing(false);
    }
  }

  async function handleSharePdf() {
    setPrinting(true);
    setShareNote(null);
    try {
      await exportLoadingPdf(shareDate, shareText);
    } catch (err) {
      setShareNote(err instanceof Error ? err.message : t('loading.exportError'));
    } finally {
      setPrinting(false);
    }
  }

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

  // The share card takes the place of the grid: the day is already done, and what is left is sending it.
  if (showingShare) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3 p-4">
        {fromHistory && (
          <Link
            to="/loading/history"
            className="inline-flex min-h-11 items-center gap-2 rounded px-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            data-testid="loading-share-back"
          >
            <LucideArrowLeft className="h-4 w-4" />
            {t('reports.backToHistory')}
          </Link>
        )}
        {/* La puerta a los fleteros: el día se manda también uno a uno a los conductores con teléfono del
            lote. Se perdió cuando la tarjeta reemplazó al diálogo viejo, y vuelve acá, junto al share general. */}
        <Button
          variant="outline"
          className="mb-3 min-h-11 w-full gap-2"
          onClick={() => setExportOpen(true)}
          data-testid="loading-share-fleteros"
        >
          <LucideTruck className="h-4 w-4" />
          {t('loading.sendToFleteros', 'Enviar a fleteros')}
        </Button>
        {/* El diálogo de fleteros se monta también en esta rama: la vista de compartir retorna antes del
            return principal, y por eso la puerta abría un estado que nadie dibujaba. */}
        <ScheduleExportView date={shareDate} open={exportOpen} onClose={() => setExportOpen(false)} />
        <ShareCard
          testIdPrefix="loading"
          title={t('loading.exportTitle')}
          subtitle={formatDisplayDate(shareDate)}
          text={shareText}
          loading={shareLoading}
          error={shareError}
          note={shareNote}
          sharing={sharing}
          printing={printing}
          onShare={() => void handleShareMessage()}
          onPdf={() => void handleSharePdf()}
          {...(fromHistory
            ? {
                ...(canEditToday ? { onEdit: () => navigate(`/loading/edit?date=${shareDate}`) } : {}),
                onClose: () => navigate('/loading/history'),
              }
            : {
                onEdit: () => navigate(`/loading/edit?date=${date}`),
                onClose: () => {
                  const next = { ...Object.fromEntries(params) };
                  delete next.share;
                  setParams(next, { replace: true });
                },
              })}
        />
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

      {/* One action: the day closes and the message opens; the PDF lives in that card. */}
      <div className="mt-6 mb-8 flex justify-end">
        <Button
          onClick={() => setParams({ ...Object.fromEntries(params), share: '1' }, { replace: false })}
          size="lg"
          className="w-full whitespace-nowrap px-2 text-xs sm:w-auto sm:px-4 sm:text-sm"
          data-testid="loading-save-btn"
          disabled={schedules.length === 0}
        >
          <LucideSave className="h-4 w-4" />
          {t('loading.save')}
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
