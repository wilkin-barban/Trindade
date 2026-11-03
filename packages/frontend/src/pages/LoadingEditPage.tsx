import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { LucideArrowLeft, LucidePencil, LucideX, LucideCheck, LucideSend, LucideFileDown } from 'lucide-react';
import { api, ApiClientError } from '../api/client';
import { Button } from '../components/ui/button';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { ScheduleExportView } from '../components/loading/ScheduleExportView';
import { exportScheduleTextAsPdf } from '../lib/schedule-pdf';
import type { ScheduleRow } from '../components/loading/ScheduleGrid';
import { countInWindow, isQuotaExceeded, quotaIfMoved, toMinutes } from '../lib/loading-quota';
import { isClosedDay } from '../lib/massas-day';
import { saoPauloToday } from '../lib/date';



function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function LoadingEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  // The grid's pencil points at a row of its own day: the row arrives open instead of the operator having to
  // find it again in a list that grows with every load.
  const editParam = Number(searchParams.get('edit') ?? '');
  const viewParam = searchParams.get('view') === '1';

  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : (() => {
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
      })();
  // A day the plant already closed is history: the screen shows it and stops there. The rule is the same one
  // the backend applies, so the operator learns it before pressing anything, not after a refused save.
  const dayIsClosed = isClosedDay(date, saoPauloToday());
  const readOnly = dayIsClosed || viewParam;
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [dayActive, setDayActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // `?edit=` is a deep link into a row, and a closed/read-only day has no row to edit: the parameter is ignored.
  const [editingId, setEditingId] = useState<number | null>(
    readOnly || !Number.isInteger(editParam) || editParam <= 0 ? null : editParam
  );
  const [editSlot, setEditSlot] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ---- Export PDF Handler ----
  const handleExportPdf = useCallback(async () => {
    setError('');
    setPdfLoading(true);
    try {
      const data = await api.get<{ text: string }>(`/loading/export?date=${date}`);

      await exportScheduleTextAsPdf(data.text, `cronograma-${date}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('loading.exportError')
      );
    } finally {
      setPdfLoading(false);
    }
  }, [date, t]);

  const fetchData = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const includeInactive = readOnly ? '&includeInactive=1' : '';
      const [schedRes, slotsRes] = await Promise.all([
        api.get<{ schedules: ScheduleRow[]; dayActive?: boolean }>(
          `/loading/schedules?date=${date}${includeInactive}`
        ),
        api.get<{ timeSlots: string[] }>('/loading/time-slots'),
      ]);
      setSchedules(schedRes.schedules);
      setDayActive(schedRes.dayActive ?? true);
      setTimeSlots(slotsRes.timeSlots);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loading.loadingError'));
    } finally {
      setLoading(false);
    }
  }, [date, readOnly, t]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (readOnly || !Number.isFinite(editParam) || editParam <= 0) return;
    const target = schedules.find((entry) => entry.id === editParam);
    if (!target || editingId === editParam) return;
    setEditingId(target.id);
    setEditSlot(target.time_slot);
  }, [schedules, editParam, editingId, readOnly]);

  function startEdit(entry: ScheduleRow) {
    if (readOnly) return;
    setEditingId(entry.id);
    setEditSlot(entry.time_slot);
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditSlot('');
  }

  async function saveEdit(id: number) {
    if (!editSlot) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.patch<{ schedule: ScheduleRow }>(`/loading/schedules/${id}`, {
        time_slot: editSlot,
      });
      setSchedules((prev) => prev.map((s) => (s.id === id ? res.schedule : s)));
      setEditingId(null);
      setEditSlot('');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(t('loading.updateError'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: number) {
    setDeleting(id);
    setError('');
    try {
      await api.del(`/loading/schedules/${id}`);
      setSchedules((prev) => prev.filter((entry) => entry.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loading.deleteError'));
    } finally {
      setDeleting(null);
    }
  }

  // The hours of the day, plus the ones the day's rows mention. A row left on an hour the list dropped had an
  // empty select and a save the server refused: it could only be deleted, not put back.
  const slotOptions = [...new Set([...timeSlots, ...schedules.map((entry) => entry.time_slot)])].sort(
    (a, b) => toMinutes(a) - toMinutes(b)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          data-testid="back-button"
        >
          <LucideArrowLeft className="h-4 w-4" />
          {t('ui.back')}
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">
          {readOnly ? t('dashboard.viewSchedule') : t('loading.editTitle')}
        </h2>
        <p className="text-sm text-gray-500">{formatDisplayDate(date)}</p>
      </div>

      {dayIsClosed && (
        <div
          className="mb-4 p-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md"
          role="status"
          data-testid="loading-edit-readonly-banner"
        >
          {t('loading.closedDayReadOnly')}
        </div>
      )}

      {readOnly && !dayIsClosed && !dayActive && (
        <div
          className="mb-4 p-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md"
          role="status"
          data-testid="loading-edit-inactive-banner"
        >
          {t('loading.inactiveBatchReadOnly')}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      {schedules.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-8 text-center">{t('loading.emptyDay')}</p>
      ) : (
        <div className="space-y-2" data-testid="edit-schedule-list">
          {schedules.map((entry) => {
            const isEditing = editingId === entry.id && !readOnly;
            const currentQuota = countInWindow(schedules, entry.time_slot);

            return (
              <div
                key={entry.id}
                className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
                data-testid={`edit-entry-${entry.id}`}
              >
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-3 flex-wrap">
                    <select
                      value={editSlot}
                      onChange={(e) => setEditSlot(e.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      data-testid={`slot-select-${entry.id}`}
                    >
                      {slotOptions.map((slot) => {
                        // Priced with the row counted where it is going and left out of where it is: on its
                        // own hour that is the same count it already has, not one more.
                        const finalCount = quotaIfMoved(schedules, entry, slot);
                        const isExceeded = isQuotaExceeded(finalCount);
                        return (
                          <option key={slot} value={slot}>
                            {slot}
                            {entry.driver_type === 'fletero' && (
                              isExceeded ? ` (${finalCount}/3 - ${t('loading.quotaError')})` : ` (${finalCount}/3)`
                            )}
                          </option>
                        );
                      })}
                    </select>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => saveEdit(entry.id)}
                        disabled={saving || editSlot === entry.time_slot}
                        className="p-1.5 text-green-600 hover:text-green-700 disabled:opacity-50"
                        data-testid={`save-edit-${entry.id}`}
                      >
                        <LucideCheck className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                        className="p-1.5 text-gray-400 hover:text-gray-600"
                      >
                        <LucideX className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800">
                        {entry.driver_name || entry.vehicle_description || '-'}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {entry.time_slot}
                        {entry.driver_type === 'fletero' && (
                          <span className="ml-1 text-yellow-600">({currentQuota}/3 fleteros)</span>
                        )}
                      </span>
                      {/* A fletero's plate is on his record, not on the plant's truck: the editor moves rows
                          between hours, and his own plate is not part of that. */}
                      {entry.driver_type === 'casa' && entry.vehicle_plate && (
                        <span className="text-xs text-gray-400 ml-2">{entry.vehicle_plate}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {entry.canEdit && !readOnly && (
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="p-2 text-blue-500 hover:text-blue-700 transition-colors"
                          aria-label={t('loading.editEntry')}
                          data-testid={`edit-btn-${entry.id}`}
                        >
                          <LucidePencil className="h-4 w-4" />
                        </button>
                      )}
                      {entry.canDelete && !readOnly && (
                        <button
                          type="button"
                          onClick={() => deleteEntry(entry.id)}
                          disabled={deleting === entry.id}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          aria-label={t('loading.deleteEntry')}
                          data-testid={`delete-edit-entry-${entry.id}`}
                        >
                          <LucideX className="h-4 w-4" />
                          {t('loading.deleteEntry')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3 mt-6 mb-8">
        <Button
          onClick={handleExportPdf}
          variant="outline"
          size="lg"
          data-testid="loading-export-pdf-btn"
          disabled={schedules.length === 0 || pdfLoading}
        >
          <LucideFileDown className={`h-4 w-4 ${pdfLoading ? 'animate-spin' : ''}`} />
          {t('loading.exportPdf')}
        </Button>
        <Button
          onClick={() => setExportOpen(true)}
          size="lg"
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
