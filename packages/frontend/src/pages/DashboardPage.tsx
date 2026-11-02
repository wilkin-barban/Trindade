import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { shareOrCopy } from '../lib/whatsapp';
import { activeScheduleLink } from '../lib/active-schedule-link';
import { Card, CardContent } from '../components/ui/card';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { ModuleHelpModal } from '../components/ui/ModuleHelpModal';

interface DashboardSummary {
  reportsToday: number;
  schedulesTomorrow: number;
  activeScheduleDate: string;
  activeScheduleBatchDate: string | null;
  activeScheduleCount: number;
  activeUsers: number;
  reportsTotal: number;
  schedulesTotal: number;
  latestReportId: number | null;
  higieneDone: number;
  higieneTotal: number;
  recepcionDone: number;
  recepcionTotal: number;
}

interface SummaryCardProps {
  title: string;
  value: React.ReactNode;
  icon: string;
  /** The card's single door, when it has one. Never combined with links inside `value`. */
  to?: string;
  testId?: string;
}

/**
 * One card of the dashboard, with at most one way in.
 *
 * A card that wraps its body in a link and then carries another link inside is a link inside a link: the
 * browser flattens the anchors and the inner one stops being its own target, which is how the masas card used
 * to hand the same destination to "Ver historial" as to the card itself. So a card is either a single door --
 * `to` -- or a plain surface whose body holds the two doors it needs, and never both.
 */
function SummaryCard({ title, value, icon, to, testId }: SummaryCardProps) {
  const body = (
    <CardContent className="pt-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <div className="mt-1">{value}</div>
        </div>
        <span className="text-3xl" aria-hidden="true">{icon}</span>
      </div>
    </CardContent>
  );

  if (to) {
    return (
      <Card className="border transition-all duration-200 hover:scale-[1.02] hover:border-gray-300 hover:shadow-md" data-testid={testId}>
        <Link to={to} className="block no-underline">
          {body}
        </Link>
      </Card>
    );
  }

  return <Card data-testid={testId}>{body}</Card>;
}

/** One count of the summary panel: a name and its number, at the same size, one per line. */
function SummaryRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm" data-testid={testId}>
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [shareNote, setShareNote] = useState('');

  /**
   * Sends the active schedule's own text: the batch date the summary carries is what the export takes,
   * and the message it renders is the one that announces the day the card is showing.
   */
  async function handleShareActiveSchedule() {
    const batchDate = summary?.activeScheduleBatchDate;
    if (!batchDate) return;
    setShareNote('');
    try {
      const data = await api.get<{ text: string }>(`/loading/export?date=${batchDate}`);
      const outcome = await shareOrCopy(data.text);
      if (outcome === 'copied') setShareNote(t('loading.shareCopied'));
      else if (outcome === 'failed') setShareNote(t('loading.shareUnavailable'));
    } catch {
      setShareNote(t('loading.exportError'));
    }
  }

  // One decision, one place: which day the card opens and what it calls that door. The rule and the
  // reason it takes the batch date live in the pure module, with its own tests.
  const scheduleLink = activeScheduleLink(summary);

  useEffect(() => {
    let cancelled = false;

    async function fetchSummary() {
      try {
        const data = await api.get<DashboardSummary>('/dashboard/summary');
        if (!cancelled) {
          setSummary(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t('dashboard.loadingError')
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSummary();

    return () => {
      cancelled = true;
    };
  }, [t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" aria-live="assertive" className="p-4 text-red-700 bg-red-50 border border-red-200 rounded-lg">
        <p className="font-medium">{t('dashboard.loadingError')}</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          {t('dashboard.overview')}
        </h3>
        <ModuleHelpModal
          title={t('moduleHelp.dashboard.title')}
          subtitle={t('moduleHelp.dashboard.subtitle')}
          description={t('moduleHelp.dashboard.description')}
          sections={t('moduleHelp.dashboard.sections', { returnObjects: true }) as any}
        />
      </div>

      {/* Seis tarjetas, en el orden del teléfono: lo que se hace hoy, el cronograma que corre, las masas, las
          dos calculadoras y la app que se comparte. Y tres columnas en escritorio, no cinco: seis tarjetas en
          una grilla de cinco dejan una sola huérfana en la segunda fila. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title={t('dashboard.reportsToday')}
          testId="dashboard-card-reports"
          value={
            summary ? (
              <div className="space-y-0.5 text-xs font-medium text-gray-700 sm:text-sm">
                <div>{t('dashboard.higieneCount', { done: summary.higieneDone })}</div>
                <div>{t('dashboard.recepcionCount', { done: summary.recepcionDone })}</div>
              </div>
            ) : (
              <span className="text-3xl font-bold text-blue-600">--</span>
            )
          }
          icon="📋"
          to={summary?.latestReportId ? `/reports/${summary.latestReportId}` : '/reports'}
        />
        <SummaryCard
          title={t('dashboard.activeSchedule')}
          testId="dashboard-card-schedule"
          value={
            <div className="space-y-1">
              <span className="text-3xl font-bold text-green-600">{summary?.activeScheduleCount ?? 0}</span>
              <div className="text-xs text-gray-500" data-testid="active-schedule-date">
                {summary?.activeScheduleDate ?? ''}
              </div>
              {/*
                The way into the schedule and the way to send it, both on the card: the batch date is the one
                the export takes, and the summary carries it so this link does not have to work it out.
              */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to={scheduleLink.to}
                  className="text-xs text-blue-600 hover:underline"
                  data-testid="view-active-schedule"
                >
                  {t(scheduleLink.labelKey)}
                </Link>
                <button
                  type="button"
                  onClick={handleShareActiveSchedule}
                  disabled={!summary?.activeScheduleBatchDate}
                  className="text-xs text-green-700 hover:underline disabled:text-gray-400 disabled:no-underline"
                  data-testid="share-active-schedule"
                >
                  {t('dashboard.shareSchedule')}
                </button>
              </div>
              {shareNote && (
                <div className="text-xs text-gray-500" data-testid="active-schedule-share-note">
                  {shareNote}
                </div>
              )}
            </div>
          }
          icon="🚛"
        />
        {/* Las masas: la tarjeta no es un enlace porque tiene dos puertas. Envolverla en una y dejar la del
            histórico adentro era un ancla dentro de otra, y el navegador se queda con la de afuera. */}
        <SummaryCard
          title={t('dashboard.massasLaunch')}
          testId="dashboard-card-massas"
          value={
            <div className="space-y-1">
              <span className="text-sm text-gray-500">{t('dashboard.massasLaunchHint')}</span>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/massas-launch"
                  className="text-xs font-medium text-amber-700 hover:underline"
                  data-testid="dashboard-massas-launch"
                >
                  {t('dashboard.massasLaunchNow')}
                </Link>
                <Link
                  to="/massas-history"
                  className="text-xs font-medium text-amber-700 hover:underline"
                  data-testid="dashboard-massas-history"
                >
                  {t('dashboard.massasHistory')}
                </Link>
              </div>
            </div>
          }
          icon="🍝"
        />
        <SummaryCard
          title={t('dashboard.stock')}
          testId="dashboard-card-stock"
          value={<span className="text-sm text-gray-500">{t('dashboard.stockHint')}</span>}
          icon="📦"
          to="/stock-calculator"
        />
        <SummaryCard
          title={t('dashboard.assai')}
          testId="dashboard-card-assai"
          value={<span className="text-sm text-gray-500">{t('dashboard.assaiHint')}</span>}
          icon="🧮"
          to="/assai-calculator"
        />
        {/* La puerta de Compartir App: el trabajo de dejar la app en el teléfono del que entra, que en la web
            solo vivía en el menú lateral. Reemplaza a la tarjeta del histórico de contagem, que se alcanza
            desde la calculadora, que es donde se trabaja. */}
        <SummaryCard
          title={t('dashboard.shareApp')}
          testId="dashboard-card-share-app"
          value={<span className="text-sm text-gray-500">{t('dashboard.shareAppHint')}</span>}
          icon="📲"
          to="/compartir"
        />
      </div>

      {/* Un panel con todas las cuentas, en vez de una tarjeta por número: los tres totales y los dos pares de
          tareas son lo que se lee, no puertas a otro lado, y una tercera parte de la pantalla para cinco
          números era lo que hacía este panel más largo que el trabajo que anuncia. */}
      <Card className="mt-4" data-testid="dashboard-summary">
        <CardContent className="space-y-3 pt-6">
          <h4 className="text-sm font-semibold text-gray-800">{t('dashboard.summaryTitle')}</h4>
          <SummaryRow
            label={t('dashboard.schedulesTotal')}
            value={String(summary?.schedulesTotal ?? 0)}
            testId="dashboard-summary-schedules"
          />
          <SummaryRow
            label={t('dashboard.reportsTotal')}
            value={String(summary?.reportsTotal ?? 0)}
            testId="dashboard-summary-reports"
          />
          <SummaryRow
            label={t('dashboard.activeUsers')}
            value={String(summary?.activeUsers ?? 0)}
            testId="dashboard-summary-users"
          />
          <SummaryRow
            label={t('dashboard.higieneLabel')}
            value={t('dashboard.taskProgress', { done: summary?.higieneDone ?? 0, total: summary?.higieneTotal ?? 0 })}
            testId="dashboard-summary-higiene"
          />
          <SummaryRow
            label={t('dashboard.recepcionLabel')}
            value={t('dashboard.goodsProgress', {
              done: summary?.recepcionDone ?? 0,
              total: summary?.recepcionTotal ?? 0,
            })}
            testId="dashboard-summary-recepcion"
          />
        </CardContent>
      </Card>

      {/* Deferred modules notice */}
      <div className="mt-8 p-6 bg-white rounded-lg shadow-sm border border-dashed border-gray-300">
        <p className="text-gray-400 text-center text-sm">
          {t('dashboard.deferredNotice')}
        </p>
      </div>
    </div>
  );
}
