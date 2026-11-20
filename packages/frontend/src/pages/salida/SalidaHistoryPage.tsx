import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ClipboardX, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { HistoryDayPanel, type HistoryDay } from '../../components/ui/HistoryDayPanel';
import { ModuleHelpModal, type HelpSection } from '../../components/ui/ModuleHelpModal';
import { SalidaBlockFilter, SalidaMovementCard } from '../../components/salida/SalidaMovementCard';
import { SalidaWhatsAppShare } from '../../components/salida/SalidaWhatsAppShare';
import { MessageDialog } from '../../components/ui/message-dialog';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { aeroSettingsReady, type AeroSettings } from '../../lib/aero-integration';
import { fetchAeroVaultSettings } from '../../lib/aero-vault';
import { lastSyncLabel, readAeroMovementsSnapshot, triggerAeroMovementsSync } from '../../lib/aero-mirror';
import { SalidaReportSection, type SalidaReportDay } from '../../components/reports/SalidaReportSection';
import { salidaOffersDelete } from '../../lib/salida';
import {
  SalidaSuccessDialog,
  type SalidaErpOutcome,
} from '../../components/salida/SalidaSuccessDialog';
import { formatDateLabel, saoPauloDaysAgo, saoPauloToday } from '../../lib/date';
import {
  aeroBridgeCallbackFor,
  buildAeroBridgeTriggerUrl,
  resolveAeroCallback,
} from '../../lib/aero-integration';
import { readAeroBatchResult } from '../../lib/aero-feedback';
import { markAeroBridgePending } from '../../lib/aero-watchdog';
import { clearAeroPendingAttempt, loadAeroPendingAttempt, saveAeroPendingAttempt } from '../../lib/aero-pending-attempt';
import { newAeroAttempt, postAeroAuditEvent } from '../../lib/aero-audit';
import { requestAeroBridgeTicket } from '../../lib/aero-vault';
import {
  SALIDA_TICKET_REFUSED,
  buildSalidaPayloads,
  buildSalidaTrips,
  clearSalidaLastMovement,
  clearSalidaOutbox,
  filterSessionMovements,
  isSalidaReadOnly,
  readSalidaLastMovement,
  readSalidaOutbox,
  recordSalidaErpResult,
  salidaActionableErrorMessage,
  salidaBatchToDialogOutcome,
  salidaBatchToErpStatus,
  salidaDaySummaryText,
  salidaPhotoFiles,
  salidaPrimaryStatus,
  salidaSummaryText,
  salidaSyncRequestedEvent,
  salidaSyncResultEvent,
  salidaTimeLabel,
  shareSalida,
  writeSalidaLastMovement,
  writeSalidaOutbox,
  type SalidaBlock,
  type SalidaMovement,
  type SalidaOutbox,
} from '../../lib/salida';

/** One day of the history, as `GET /api/salida/history` serves it. */
export interface SalidaHistoryDay {
  date: string;
  total_units: number;
  movements: SalidaMovement[];
}

/**
 * The history of the exits: read-only, by day and by block, with the company's answer next to each card.
 *
 * One thing this screen is allowed to do and does: `Reenviar ao ERP`, which only a movement the ERP never
 * confirmed offers. The day's ERP read is not here -- it belongs to the report -- and nothing edits or deletes: an
 * exit that reached Trindade is a record.
 */
function useOptionalAuth() {
  try {
    return useAuth();
  } catch {
    return { user: null };
  }
}

export function SalidaHistoryPage() {
  const { t } = useTranslation();
  const { user } = useOptionalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const today = useMemo(() => saoPauloToday(), []);
  const [days, setDays] = useState<{ loading: boolean; failed: boolean; list: SalidaHistoryDay[] }>({
    loading: true,
    failed: false,
    list: [],
  });
  const [block, setBlock] = useState<SalidaBlock | 'all'>('all');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [outbox, setOutbox] = useState<SalidaOutbox | null>(null);
  /** The dialog the return of a resend shows, the same one the launch screen shows. */
  const [success, setSuccess] = useState<{
    movement: SalidaMovement | null;
    erp: SalidaErpOutcome;
    message: string | null;
  } | null>(null);

  const SALIDA_PHONE_STORAGE_KEY = 'trindade.salida.whatsapp-phone.v1';
  const [phone, setPhoneState] = useState<string>(() => {
    try {
      return localStorage.getItem(SALIDA_PHONE_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [copyNote, setCopyNote] = useState('');

  const setPhone = useCallback((val: string) => {
    setPhoneState(val);
    try {
      localStorage.setItem(SALIDA_PHONE_STORAGE_KEY, val);
    } catch {
      /* storage blocked */
    }
  }, []);

  const asked = params.get('date');
  const isRealPastOrToday = (candidate: string | null | undefined): candidate is string => {
    if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return false;
    if (candidate > today) return false;
    const [y, m, d] = candidate.split('-').map(Number);
    if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const parsed = new Date(Date.UTC(y, m - 1, d));
    return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
  };

  const date = isRealPastOrToday(asked) ? asked : today;
  const isReadOnly = isSalidaReadOnly(date, today);

  // El sync del espejo es del día de hoy y no escribe en Trindade: lee las salidas que el ERP registró -- las de
  // otros operarios incluidas -- y el bloque del Relatório las muestra. El pasado se queda con el share solo.
  const [erpSyncing, setErpSyncing] = useState(false);
  const [erpNote, setErpNote] = useState<string | null>(null);
  const [erpRefetchKey, setErpRefetchKey] = useState(0);
  // El día que leyó la sección del ERP, para sumarlo al mensaje sin pedirlo dos veces.
  const [erpDay, setErpDay] = useState<SalidaReportDay | null>(null);
  // La última lectura del espejo de ese día, como la muestra el Histórico de Masas.
  const [lastSync, setLastSync] = useState<string | null>(null);

  const loadLastSync = useCallback(async (targetDate: string) => {
    try {
      const body = await api.get<unknown>(`/integration/aero/movements?date=${targetDate}`);
      setLastSync(readAeroMovementsSnapshot(body)?.syncedAt ?? null);
    } catch {
      // Sin lectura no hay hora que mostrar: el botón sigue ofreciendo la sincronización.
      setLastSync(null);
    }
  }, []);

  const handleSyncErp = useCallback(async () => {
    if (erpSyncing) return;
    setErpSyncing(true);
    setErpNote(null);
    try {
      const vault = await fetchAeroVaultSettings();
      if (!vault.configured) {
        setErpNote(t('salida.erpSyncUnavailable'));
        return;
      }
      const settings: AeroSettings = {
        wsUrl: vault.wsUrl ?? '',
        username: vault.username ?? '',
        hasPassword: vault.hasPassword,
        syncEnabled: true,
        lastSyncAt: null,
      };
      if (!aeroSettingsReady(settings)) {
        setErpNote(t('salida.erpSyncUnavailable'));
        return;
      }
      const fired = await triggerAeroMovementsSync(settings, {
        date,
        callbackPath: location.pathname,
        includeExits: true,
      });
      setErpNote(t(fired ? 'salida.erpSyncRequested' : 'salida.erpSyncUnavailable'));
    } catch {
      setErpNote(t('salida.erpSyncUnavailable'));
    } finally {
      setErpSyncing(false);
      setErpRefetchKey((key) => key + 1);
      await loadLastSync(date);
    }
  }, [date, erpSyncing, loadLastSync, location.pathname, t]);

  const labels = useMemo<Record<SalidaBlock, string>>(
    () => ({
      embalagens: t('salida.blocks.embalagens'),
      bobinas: t('salida.blocks.bobinas'),
      'materia-prima': t('salida.blocks.materia-prima'),
    }),
    [t],
  );

  const load = useCallback(async () => {
    try {
      const body = await api.get<{ days?: SalidaHistoryDay[] }>('/salida/history');
      const list = Array.isArray(body?.days) ? body.days : [];
      setDays({ loading: false, failed: false, list });
    } catch (error) {
      // A day list that could not be read is said once; the screen keeps whatever it already had instead of
      // turning the whole history into an error page.
      setDays((current) => ({ loading: false, failed: true, list: current.list }));
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : t('salida.historyLoadError'),
      });
    }
  }, [t]);

  useEffect(() => {
    void load();
    setOutbox(readSalidaOutbox());
  }, [load]);

  const day = useMemo(
    () => days.list.find((candidate) => candidate.date === date) ?? null,
    [days.list, date],
  );

  const chips = useMemo<HistoryDay[]>(() => {
    const listed = days.list
      .filter((entry) => entry.date <= today)
      .map((entry) => ({ date: entry.date, units: entry.total_units }));
    if (listed.some((entry) => entry.date === today)) return listed;
    return [{ date: today, units: null }, ...listed];
  }, [days.list, today]);

  // The day shows only the session user's movements when the API returns more than one operator's (T3).
  // No worker filter is added.
  const dayMovements = useMemo(() => {
    const raw = day?.movements ?? [];
    return filterSessionMovements(raw, user?.username);
  }, [day, user?.username]);

  /**
   * Retirar un borrador que el ERP no confirmó.
   *
   * La confirmación es un paso propio y el resultado se dice en su ventana: la lista cambia debajo, y una franja
   * dentro de ella se lee como parte del día que se está mirando.
   */
  const [deleteTarget, setDeleteTarget] = useState<SalidaMovement | null>(null);
  const [noticeDialog, setNoticeDialog] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const confirmDeleteMovement = useCallback(async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    try {
      await api.del(`/salida/${target.id}`);
      setNoticeDialog({ tone: 'success', message: t('salida.deleteDone', 'Movimento excluído.') });
      await load();
      setErpRefetchKey((key) => key + 1);
    } catch (error) {
      setNoticeDialog({
        tone: 'error',
        message: error instanceof Error ? error.message : t('salida.deleteFailed', 'Não foi possível excluir o movimento.'),
      });
    }
  }, [deleteTarget, load, t]);

  const visibleMovements = useMemo(() => {
    if (block === 'all') return dayMovements;
    return dayMovements.filter((movement) => movement.items.some((item) => item.block === block));
  }, [dayMovements, block]);

  const setDate = (next: string) => {
    setParams(next === today ? {} : { date: next }, { replace: true });
  };

  // The shortcut comes back with the ERP's answer in the query. Only a resend arrives here now: the day's exits are
  // read by the report, which is where the operator syncs the day.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const callback = await resolveAeroCallback(location.search);
      if (!callback || cancelled) return;

      const answered = new URLSearchParams(location.search).get('date');
      const answeredDate = answered && /^\d{4}-\d{2}-\d{2}$/.test(answered) ? answered : date;

      if (callback.kind === 'bridge' && callback.action === 'saida') {
        // A resend comes back here, not to the launch screen: same dialog, same trail, same attempt.
        const attempt = loadAeroPendingAttempt('saida');
        if (attempt) clearAeroPendingAttempt();

        const queued = readSalidaOutbox();
        const lastMovement = readSalidaLastMovement();
        const expectedTripPayloads =
          queued?.currentTripPayloads ??
          queued?.trips[0]?.payloads.length ??
          lastMovement?.expectedPayloads ??
          lastMovement?.items.length ??
          1;

        const batchResult = readAeroBatchResult(callback.data, expectedTripPayloads);
        const erpOutcome = salidaBatchToDialogOutcome(batchResult.state, batchResult.ok, batchResult.total);
        const erpStatus = salidaBatchToErpStatus(batchResult.state, batchResult.ok, batchResult.total);

        const movementId = lastMovement?.id ?? queued?.movementId;
        if (movementId) {
          void recordSalidaErpResult(movementId, { status: erpStatus, message: batchResult.message }, attempt);
        }

        const isComplete =
          batchResult.state === 'complete' ||
          (batchResult.state === 'legacy' && batchResult.ok === batchResult.total);

        if (isComplete) {
          void postAeroAuditEvent(
            salidaSyncResultEvent({ attempt, outcome: 'ok', message: batchResult.message }),
          );
        } else {
          const errorCode =
            batchResult.message ??
            (batchResult.state === 'unreadable'
              ? 'bridge_unreadable'
              : batchResult.state === 'partial'
                ? 'batch_partial'
                : 'batch_failed');
          void postAeroAuditEvent(
            salidaSyncResultEvent({
              attempt,
              outcome: 'error',
              error: errorCode,
              message: batchResult.message,
            }),
          );
        }

        setSuccess({ movement: lastMovement, erp: erpOutcome, message: batchResult.message });
        if (isComplete) {
          if (queued && queued.trips.length > 1) {
            const remainingTrips = queued.trips.slice(1);
            writeSalidaOutbox({ ...queued, trips: remainingTrips, currentTripPayloads: undefined });
            setOutbox(readSalidaOutbox());
          } else {
            clearSalidaOutbox();
            clearSalidaLastMovement();
            setOutbox(null);
          }
        } else {
          // The movement is still owed: the outbox and the card keep saying pending.
          if (queued) {
            writeSalidaOutbox({ ...queued, currentTripPayloads: undefined });
          }
          setOutbox(readSalidaOutbox());
        }
        void load();
      } else if (callback.kind === 'error') {
        // The phone came back without the plant. Only a resend can be owed an answer now: reading the day's exits
        // is the report's job, not this history's.
        const syncAttempt = loadAeroPendingAttempt('saida');
        if (syncAttempt) clearAeroPendingAttempt();

        if (syncAttempt) {
          const lastMovement = readSalidaLastMovement();
          const queued = readSalidaOutbox();
          const movementId = lastMovement?.id ?? queued?.movementId;
          if (movementId) {
            void recordSalidaErpResult(
              movementId,
              { status: 'failed', message: callback.message || callback.code },
              syncAttempt,
            );
          }
          void postAeroAuditEvent(
            salidaSyncResultEvent({
              attempt: syncAttempt,
              outcome: 'error',
              error: callback.code,
              message: callback.message,
            }),
          );
          setNotice({ type: 'error', message: salidaActionableErrorMessage(callback.code, callback.message, t) });
          setOutbox(readSalidaOutbox());
        }
      }

      setParams({ date: answeredDate }, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [location.search, date, load, setParams, t]);

  /**
   * Rebuilds the trip of a movement the ERP never confirmed.
   *
   * The payloads are built from the movement itself, not from the catalogue: the product names that left are the
   * ones the record kept, and a catalogue that changed since then must not rewrite the exit.
   */
  const resendToErp = async (movement: SalidaMovement) => {
    if (isReadOnly) return;
    setResendingId(movement.id);
    setNotice(null);
    try {
      const products = movement.items.map((item) => ({
        code: item.product_code,
        name: item.product_name,
        block: item.block,
      }));
      const payloads = buildSalidaPayloads(
        movement.items.map((item) => ({ code: item.product_code, quantity: item.quantity })),
        { date: movement.movement_date, username: movement.username, products },
      );
      const trips = buildSalidaTrips(payloads);
      if (trips.length === 0) {
        setNotice({ type: 'error', message: t('salida.erpCheckError') });
        return;
      }

      // The trips are written down first: if the vault refuses to arm the first one, what is owed is still
      // there for the next press instead of being forgotten by a failed attempt.
      writeSalidaOutbox({
        movementId: movement.id,
        date: movement.movement_date,
        trips,
        startedAt: new Date().toISOString(),
        currentTripPayloads: trips[0]?.payloads.length,
      });
      setOutbox(readSalidaOutbox());

      const trip = trips[0]!;
      const tripRef = { index: 1, total: trips.length };
      let ticket: { ticket: string; ticketUrl: string } | null = null;
      try {
        ticket = await requestAeroBridgeTicket({
          action: 'saida',
          payloads: trip.payloads,
          callbackPath: aeroBridgeCallbackFor('saida', `/salida-history?date=${date}`),
        });
      } catch (err) {
        // Nothing left the page and nothing is owed a result: one requested line carries the refusal.
        void postAeroAuditEvent(
          salidaSyncRequestedEvent({
            payloads: trip.payloads,
            trip: tripRef,
            error: SALIDA_TICKET_REFUSED,
            note: `trip ${tripRef.index}/${tripRef.total} · batch ${trip.payloads.length} not sent`,
          }),
        );
        setNotice({
          type: 'error',
          message: salidaActionableErrorMessage(SALIDA_TICKET_REFUSED, err instanceof Error ? err.message : null, t),
        });
        return;
      }

      // Same shape as a launch: the attempt is stored before leaving, so the answer can be paired with the
      // request it belongs to when the shortcut comes back to a fresh document.
      const attempt = newAeroAttempt();
      saveAeroPendingAttempt({ action: 'saida', ...attempt, date: movement.movement_date });
      void postAeroAuditEvent(salidaSyncRequestedEvent({ payloads: trip.payloads, trip: tripRef, attempt }));

      // The movement travels with the session: the dialog the return shows is drawn from it.
      writeSalidaLastMovement({ ...movement, expectedPayloads: trip.payloads.length });
      markAeroBridgePending({ action: 'saida', date: movement.movement_date });
      window.location.href = buildAeroBridgeTriggerUrl({ ticket: ticket.ticket, ticketUrl: ticket.ticketUrl });
    } catch (err) {
      setNotice({
        type: 'error',
        message: salidaActionableErrorMessage('error', err instanceof Error ? err.message : null, t),
      });
    } finally {
      setResendingId(null);
    }
  };

  const reportShareOutcome = (outcome: Awaited<ReturnType<typeof shareSalida>>) => {
    if (outcome === 'copied' || outcome === 'shared') {
      setNotice({ type: 'success', message: t('salida.copiedSummary') });
    } else if (outcome === 'failed') {
      setNotice({ type: 'error', message: t('salida.shareFailed') });
    }
  };

  const shareMovement = async (movement: SalidaMovement) => {
    setNotice(null);
    const text = salidaSummaryText(movement, labels);
    // The movement's own photos travel with the message; a photo that cannot be fetched is left out rather
    // than failing the share.
    const photos = await salidaPhotoFiles(movement.photos);
    reportShareOutcome(await shareSalida({ text, photos, phone }));
  };

  useEffect(() => {
    void loadLastSync(date);
  }, [date, loadLastSync]);

  // Un día puede tener datos sólo del ERP: operarios y productos que Trindade no lanzó pero que el grupo tiene
  // que leer. "Sem saídas para compartilhar" es para el día sin nada, no para el que el ERP sí registró.
  const hasShareableData =
    visibleMovements.length > 0 ||
    (erpDay?.operators ?? []).some((operator) => operator.products.some((product) => product.units > 0));

  const previewMessage = useMemo(() => {
    const erpOperators = erpDay?.operators ?? [];
    if (!hasShareableData) return '';
    return salidaDaySummaryText(visibleMovements, {
      date,
      erpOperators,
      labels: {
        title: t('salida.dayShareTitle'),
        movements: t('salida.dayShareMovements'),
        total: t('salida.totalUnits'),
        operator: t('salida.operatorLabel'),
        blocks: {
          embalagens: t('salida.blocks.embalagens'),
          bobinas: t('salida.blocks.bobinas'),
          'materia-prima': t('salida.blocks.materia-prima'),
        },
        status: {
          reconciled: t('salida.reconciled'),
          partial: t('salida.erpPartial'),
          pending: t('salida.erpPending'),
          sent: t('salida.erpSent'),
        },
      },
    });
  }, [visibleMovements, erpDay, hasShareableData, date, t]);

  const handleOpenWhatsApp = async () => {
    if (!hasShareableData) return;
    setNotice(null);
    setCopyNote('');
    const photos = (await Promise.all(visibleMovements.map((movement) => salidaPhotoFiles(movement.photos)))).flat();
    const outcome = await shareSalida({ text: previewMessage, photos, phone });
    if (outcome === 'copied' || outcome === 'shared') {
      setCopyNote(t('salida.copiedSummary'));
      setNotice({ type: 'success', message: t('salida.copiedSummary') });
    } else if (outcome === 'failed') {
      setCopyNote(t('salida.shareFailed'));
      setNotice({ type: 'error', message: t('salida.shareFailed') });
    }
  };

  const pendingCount = visibleMovements.filter(
    (movement) => salidaPrimaryStatus(movement) === 'pending',
  ).length;

  if (days.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-12 sm:space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div
          data-testid="salida-history-header"
          className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('salida.historyTitle')}</h1>
              <div className="shrink-0" data-testid="salida-history-help">
                <ModuleHelpModal
                  title={t('moduleHelp.salidaHistory.title')}
                  subtitle={t('moduleHelp.salidaHistory.subtitle')}
                  description={t('moduleHelp.salidaHistory.description')}
                  sections={t('moduleHelp.salidaHistory.sections', { returnObjects: true }) as unknown as HelpSection[]}
                />
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-500">{t('salida.historySubtitle')}</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
            <Link
              to="/salida"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-10"
              data-testid="salida-history-launch"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">{t('salida.launchShort')}</span>
              <span className="hidden sm:inline">{t('salida.launch')}</span>
            </Link>
          </div>
        </div>
      </div>

      <MessageDialog
        open={notice !== null}
        tone={notice?.type === 'success' ? 'success' : 'error'}
        message={notice?.message ?? ''}
        onClose={() => setNotice(null)}
        testId="salida-history-notice"
      />

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <HistoryDayPanel
          id="salida-history-date"
          label={t('salida.dayLabel')}
          value={date}
          onChange={setDate}
          min={chips.length > 0 ? chips[chips.length - 1]!.date : saoPauloDaysAgo(30)}
          max={today}
          testIdPrefix="salida-history"
          groupLabel={t('salida.historyDaysLabel')}
          days={chips}
          failed={days.failed}
          failedMessage={t('salida.historyDaysUnavailable')}
        />

        {/* El pasado no se opera: debajo del selector de fecha queda únicamente el bloque de compartir. Todos
            estos controles son del día de hoy, que es el que se lanza y se corrige. */}
        {!isReadOnly && (
          <>
            {/* El filtro, y nada más: este histórico muestra lo que el operario lanzó. */}
            <div
              data-testid="salida-history-actions"
              className="grid grid-cols-1 gap-2 border-t border-gray-100 pt-3 sm:flex sm:items-center sm:justify-between"
            >
              <SalidaBlockFilter value={block} onChange={setBlock} />
            </div>

            {pendingCount > 0 && (
              <p className="text-xs text-amber-800" data-testid="salida-pending-count">
                {t('salida.erpPending')}: {pendingCount}
              </p>
            )}
          </>
        )}

      </div>

      {!isReadOnly && !hasShareableData ? (
        <div
          className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm"
          data-testid="salida-history-empty"
        >
          <ClipboardX className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
          <h2 data-testid="salida-empty-title" className="mt-2 text-base font-semibold text-gray-900">
            {t('salida.historyEmptyTitle')}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{t('salida.historyEmptyBody')}</p>
          <Button
            type="button"
            onClick={() => navigate('/salida')}
            className="mt-4 min-h-[44px] w-full sm:w-auto"
            data-testid="salida-empty-cta"
          >
            <ArrowLeft className="h-4 w-4 rotate-180" />
            {t('salida.launch')}
          </Button>
        </div>
      ) : !isReadOnly && visibleMovements.length > 0 ? (
        <div className="space-y-3">
          {visibleMovements.map((movement) => (
            <SalidaMovementCard
              key={movement.id}
              movement={movement}
              timeLabel={salidaTimeLabel(movement.created_at)}
              onShare={(target) => void shareMovement(target)}
              onResend={(target) => void resendToErp(target)}
              onRefresh={() => void load()}
              resending={resendingId === movement.id}
              readOnly={isReadOnly}
              canManagePhotos={movement.username === user?.username}
              onDelete={salidaOffersDelete(movement, user?.username, Boolean(user?.role === 'Administrador')) ? setDeleteTarget : undefined}
            />
          ))}
        </div>
      ) : null}

      {/* El sync del espejo y el bloque del Relatório: sólo en el día de hoy. */}
      {!isReadOnly && (
        <div className="space-y-2" data-testid="salida-history-erp">
          {/* El mismo botón que el Histórico de Masas: ámbar, compacto y en su fila, no un outline a todo el ancho. */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100" data-testid="salida-history-erp-sync-row">
            <button
              type="button"
              onClick={() => void handleSyncErp()}
              disabled={erpSyncing}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              data-testid="salida-history-erp-sync"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${erpSyncing ? 'animate-spin' : ''}`} />
              {t('massas.syncHeader.action', 'Sincronizar com ERP')}
            </button>
            {/* La hora de la última lectura del espejo: dice si lo que se lee es de esta mañana. */}
            <span className="text-xs text-gray-500" data-testid="salida-last-sync">
              {t('massas.syncHeader.lastSync', 'Último sync:')}{' '}
              <span className="font-semibold tabular-nums text-gray-700">
                {lastSyncLabel(lastSync)}
              </span>
            </span>
          </div>
          <MessageDialog
            open={erpNote !== null}
            message={erpNote ?? ''}
            onClose={() => setErpNote(null)}
            testId="salida-history-erp-note"
          />
          <SalidaReportSection
            date={date}
            refetchKey={erpRefetchKey}
            onDayLoaded={(day) => setErpDay(day)}
            onLoadError={(message) => setErpNote(message)}
          />
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteMovement()}
        title={t('salida.deleteConfirmTitle', 'Excluir saída de {{date}}', {
          date: deleteTarget ? formatDateLabel(deleteTarget.movement_date) : '',
        })}
        panelTestId="salida-delete-confirm"
      />
      <MessageDialog
        open={noticeDialog !== null}
        tone={noticeDialog?.tone ?? 'success'}
        message={noticeDialog?.message ?? ''}
        onClose={() => setNoticeDialog(null)}
        testId="salida-delete-result"
      />

      {/* WhatsApp share block modelled on MassasWhatsAppShare (T3) */}
      <div className="space-y-2">
        <SalidaWhatsAppShare
          phone={phone}
          onPhoneChange={setPhone}
          previewMessage={previewMessage}
          onOpenWhatsApp={() => void handleOpenWhatsApp()}
          copyNote={copyNote}
          disabled={!hasShareableData}
          // Las fotos del día que se está compartiendo, including el pasado: la vista de solo lectura muestra el
          // mensaje y sus miniaturas, y nada más.
          photos={visibleMovements.flatMap((movement) => movement.photos ?? [])}
        />
        {!hasShareableData && (
          <p className="text-xs text-gray-500" data-testid="salida-share-day-empty">
            {t('salida.shareDayEmpty')}
          </p>
        )}
      </div>

      {outbox && (
        <p className="text-xs text-amber-800" data-testid="salida-history-outbox">
          {t('salida.pendingTitle')} · {outbox.trips.length}
        </p>
      )}

      <SalidaSuccessDialog
        open={success !== null}
        onClose={() => setSuccess(null)}
        movement={success?.movement ?? null}
        erp={success?.erp ?? 'pending'}
        erpMessage={success?.message ?? null}
      />
    </div>
  );
}
