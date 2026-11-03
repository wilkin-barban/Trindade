import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LucideEye, LucideCalendar, LucideTrash2, LucideBan, LucideRotateCcw } from 'lucide-react';
import { api } from '../api/client';
import { saoPauloToday } from '../lib/date';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ModuleHelpModal } from '../components/ui/ModuleHelpModal';
import { HistoryFilters } from '../components/history/HistoryFilters';
import { historyActionErrorMessageKey, historyAffordances } from '../lib/history-permissions';

interface UserOption { id: number; display_name: string }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
interface ReportListItem {
  id: number;
  turno: 'tarde' | 'noite';
  report_date: string;
  notes: string | null;
  created_at: string;
  isActive: boolean;
  readOnly: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canActivate: boolean;
  canDelete: boolean;
  user: { id: number; display_name: string };
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function ReportHistoryPage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 30, total: 0, totalPages: 0 });
  const [date, setDate] = useState('');
  const [month, setMonth] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReportListItem | null>(null);

  const fetchReports = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    // A fresh fetch supersedes any earlier action failure; leaving both set would put two alert
    // regions on screen at once, which is the duplicate announcement this screen must avoid.
    setActionError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '30' });
      if (date) params.set('date', date);
      if (month) params.set('month', month);
      if (userId) params.set('userId', userId);
      const data = await api.get<{ items: ReportListItem[]; pagination: Pagination }>(`/reports/history?${params}`);
      setReports(data.items);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reports.loadingError'));
    } finally {
      setLoading(false);
    }
  }, [date, month, userId, t]);

  useEffect(() => {
    api.get<{ users: UserOption[] }>('/users/options').then((data) => setUsers(data.users)).catch(() => setUsers([]));
  }, []);

  // El filtro es la consulta: cambiarlo tiene que volver a preguntar. Antes el efecto corría una sola vez, así
  // que elegir un día actualizaba el campo y dejaba la lista como estaba, y el botón "Filtrar" era el único
  // camino a los datos que el operario ya había pedido.
  useEffect(() => {
    void fetchReports(1);
  }, [fetchReports]);

  const hasFilters = date !== '' || month !== '' || userId !== '';
  const today = useMemo(() => saoPauloToday(), []);
  const clearFilters = useCallback(() => {
    setDate('');
    setMonth('');
    setUserId('');
  }, []);

  async function runAction(id: number, action: () => Promise<unknown>) {
    setActionError('');
    setBusyId(id);
    try {
      await action();
      await fetchReports(pagination.page);
    } catch (err) {
      // A refusal is expected: the server decides what this role may do, and the operator has
      // to read the reason instead of meeting an unhandled rejection.
      setActionError(t(historyActionErrorMessageKey(err)));
    } finally {
      setBusyId(null);
    }
  }

  async function deactivateReport(id: number) {
    await runAction(id, () => api.patch(`/reports/${id}/deactivate`, {}));
  }

  // Reopening a retired report is the mirror of retiring it, and it stays available on a past day: Q4
  // closes erasing and writing there, not the state of the report.
  async function activateReport(id: number) {
    await runAction(id, () => api.patch(`/reports/${id}/activate`, {}));
  }

  async function deleteReport(id: number) {
    await runAction(id, () => api.del(`/reports/${id}`));
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Apilado en un teléfono: en una fila rígida el botón le robaba el ancho al título. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-xl font-bold text-gray-800">{t('reports.historyTitle')}</h2>
            <ModuleHelpModal
              title={t('moduleHelp.reports.title')}
              subtitle={t('moduleHelp.reports.subtitle')}
              description={t('moduleHelp.reports.description')}
              sections={t('moduleHelp.reports.sections', { returnObjects: true }) as any}
            />
          </div>
          <p className="text-sm text-gray-500">{t('reports.historyDesc')}</p>
        </div>
        <Link className="w-full sm:w-auto shrink-0" to="/reports" data-testid="history-new-report-btn"><Button variant="outline" size="sm" className="w-full sm:w-auto">{t('reports.newReport')}</Button></Link>
      </div>

      <HistoryFilters
        prefix="history"
        date={date}
        month={month}
        userId={userId}
        users={users}
        today={today}
        hasFilters={hasFilters}
        onDateChange={(value) => { setDate(value); if (value) setMonth(''); }}
        onMonthChange={(value) => { setMonth(value); if (value) setDate(''); }}
        onUserChange={setUserId}
        onApply={() => void fetchReports(1)}
        onClear={clearFilters}
      />

      {loading && <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>}
      {error && <div role="alert" className="p-4 text-red-700 bg-red-50 border rounded-lg mb-4">{error}</div>}
      {actionError && <div role="alert" data-testid="history-action-error" className="p-4 text-red-700 bg-red-50 border rounded-lg mb-4">{actionError}</div>}
      {!loading && !error && reports.length === 0 && <div className="text-center py-12"><LucideCalendar className="h-12 w-12 mx-auto text-gray-300 mb-3" /><p className="text-gray-500">{t('reports.noReports')}</p></div>}
      {!loading && !error && reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((r) => {
            const affordances = historyAffordances(r);
            return (
            <Card key={r.id} className={`p-4 ${!r.isActive ? 'opacity-70' : ''}`} data-testid={`report-card-${r.id}`}>
              <div className="flex items-center justify-between gap-3">
                <Link to={`/reports/${r.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1"><span className="text-sm font-semibold">{formatDate(r.report_date)}</span><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{r.turno === 'tarde' ? `🌅 ${t('reports.turnoTarde')}` : `🌙 ${t('reports.turnoNoite')}`}</span>{!r.isActive && <span className="text-xs text-amber-700">{t('history.inactive')}</span>}</div>
                  <p className="text-xs text-gray-500">{r.user.display_name}{r.notes ? ` — ${r.notes.slice(0, 60)}` : ''}</p>
                </Link>
                <Link to={`/reports/${r.id}`} aria-label={t('history.viewReport', { date: formatDate(r.report_date) })}><LucideEye className="h-4 w-4 text-gray-400" /></Link>
                {affordances.showReactivate && <button onClick={() => activateReport(r.id)} disabled={busyId === r.id} aria-label={t('history.reactivateReport', { date: formatDate(r.report_date) })} className="text-emerald-600 disabled:opacity-50" data-testid={`activate-report-${r.id}`}><LucideRotateCcw className="h-4 w-4" /></button>}
                {affordances.showDeactivate && <button onClick={() => deactivateReport(r.id)} disabled={busyId === r.id} aria-label={t('history.deactivateReport', { date: formatDate(r.report_date) })} className="text-amber-600 disabled:opacity-50" data-testid={`deactivate-report-${r.id}`}><LucideBan className="h-4 w-4" /></button>}
                {affordances.showDelete && <button onClick={() => setPendingDelete(r)} disabled={busyId === r.id} aria-label={t('history.deleteReport', { date: formatDate(r.report_date) })} className="text-red-600 disabled:opacity-50" data-testid={`delete-report-${r.id}`}><LucideTrash2 className="h-4 w-4" /></button>}
              </div>
            </Card>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
        <span>{t('history.pagination', { page: pagination.page, totalPages: Math.max(1, pagination.totalPages), total: pagination.total })}</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchReports(pagination.page - 1)}>{t('history.previousPage')}</Button><Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchReports(pagination.page + 1)}>{t('history.nextPage')}</Button></div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? t('history.deleteReport', { date: formatDate(pendingDelete.report_date) }) : ''}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { const target = pendingDelete; setPendingDelete(null); if (target) void deleteReport(target.id); }}
        panelTestId="confirm-delete-report"
      />
      </div>
    </div>
  );
}
