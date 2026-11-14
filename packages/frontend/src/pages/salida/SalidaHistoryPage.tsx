import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../api/client';
import { Button } from '../../components/ui/button';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { HistoryDayPanel, type HistoryDay } from '../../components/ui/HistoryDayPanel';
import { ModuleHelpModal, type HelpSection } from '../../components/ui/ModuleHelpModal';
import { SalidaBlockFilter, SalidaMovementCard } from '../../components/salida/SalidaMovementCard';
import {
  SalidaSuccessDialog,
  type SalidaErpOutcome,
} from '../../components/salida/SalidaSuccessDialog';
import { saoPauloDaysAgo, saoPauloToday } from '../../lib/date';
import {
  aeroBridgeCallbackFor,
  buildAeroBridgeTriggerUrl,
  buildAeroMovementsSnapshot,
  buildMovimentoItemPayload,
  parseAeroCallback,
  readAeroBridgeResult,
  readAeroMovements,
} from '../../lib/aero-integration';
import { markAeroBridgePending } from '../../lib/aero-watchdog';
import { clearAeroPendingAttempt, loadAeroPendingAttempt, saveAeroPendingAttempt } from '../../lib/aero-pending-attempt';
import { aeroAttemptHeaders, newAeroAttempt, postAeroAuditEvent } from '../../lib/aero-audit';
import { requestAeroBridgeTicket } from '../../lib/aero-vault';
import {
  SALIDA_AUDIT_DESTINATION,
  SALIDA_TICKET_REFUSED,
  buildSalidaPayloads,
  buildSalidaTrips,
  clearSalidaLastMovement,
  clearSalidaOutbox,
  readSalidaLastMovement,
  readSalidaOutbox,
  salidaReadRequestedEvent,
  salidaReadResultEvent,
  salidaSyncRequestedEvent,
  salidaSyncResultEvent,
  salidaReconciliationStatus,
  salidaSummaryText,
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
 * Two things this screen is allowed to do and does: `Conferir no ERP`, which asks Aero32 for the day's exits and
 * stores the answer as the mirror of the day, and `Reenviar ao ERP`, which only a movement the ERP never
 * confirmed offers. Nothing here edits or deletes: an exit that reached Trindade is a record.
 */
export function SalidaHistoryPage() {
  const { t } = useTranslation();
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
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [outbox, setOutbox] = useState<SalidaOutbox | null>(null);
  /** The dialog the return of a resend shows, the same one the launch screen shows. */
  const [success, setSuccess] = useState<{
    movement: SalidaMovement | null;
    erp: SalidaErpOutcome;
    message: string | null;
  } | null>(null);

  const asked = params.get('date');
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : (days.list[0]?.date ?? today);

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

  const chips = useMemo<HistoryDay[]>(
    () => days.list.map((entry) => ({ date: entry.date, units: entry.total_units })),
    [days.list],
  );

  const visibleMovements = useMemo(() => {
    const movements = day?.movements ?? [];
    if (block === 'all') return movements;
    return movements.filter((movement) => movement.items.some((item) => item.block === block));
  }, [day, block]);

  const setDate = (next: string) => {
    setParams(next === today ? {} : { date: next }, { replace: true });
  };

  /**
   * Asks the company for the day's exits and stores the answer as the mirror of the day.
   *
   * `ENTSAI: 'S'` because this module reconciles stock exits; the entries belong to the Recebimento screen and a
   * query that returned both would let an entry settle an exit. The query carries `_method: 'PATCH'` in the body
   * exactly as the certified request does, and the trip is requested before anything else so a refusal never
   * leaves a spinner waiting for a shortcut that was never armed.
   */
  const handleCheckErp = async () => {
    setChecking(true);
    setCheckError('');
    setNotice(null);
    try {
      const payload = {
        _method: 'PATCH',
        ...buildMovimentoItemPayload({
          userName: null,
          startDate: date,
          endDate: date,
          entrySaida: 'S',
        }),
      };
      const auditPayload = { date, entrySaida: 'S' };
      const ticket = await requestAeroBridgeTicket({
        action: 'movimentos',
        payloads: [payload],
        callbackPath: aeroBridgeCallbackFor('movimentos', `/salida-history?date=${date}`),
      }).catch(() => null);

      if (!ticket) {
        // Nothing left the page, so nothing is owed: one requested line with the refusal code and no attempt.
        void postAeroAuditEvent(
          salidaReadRequestedEvent({
            date,
            payload: auditPayload,
            error: SALIDA_TICKET_REFUSED,
            destinationUrl: SALIDA_AUDIT_DESTINATION,
          }),
        );
        setCheckError(t('salida.erpCheckError'));
        return;
      }

      const attempt = newAeroAttempt();
      saveAeroPendingAttempt({ action: 'movimentos', ...attempt, date });
      void postAeroAuditEvent(
        salidaReadRequestedEvent({ date, payload: auditPayload, attempt }),
      );

      markAeroBridgePending({ action: 'movimentos', date });
      window.location.href = buildAeroBridgeTriggerUrl({ ticket: ticket.ticket, ticketUrl: ticket.ticketUrl });
    } catch {
      // The ticket was armed but the trip never left the page: the attempt is forgotten so it cannot pair with
      // an answer that will not come, and the operator is told the read did not start.
      clearAeroPendingAttempt();
      setCheckError(t('salida.erpCheckError'));
    } finally {
      setChecking(false);
    }
  };

  // The shortcut comes back with the ERP's answer in the query. The seats are stored in the same mirror the other
  // screens read, and the day is reloaded so every card shows what the company actually has.
  useEffect(() => {
    const callback = parseAeroCallback(location.search);
    if (!callback) return;

    const answered = new URLSearchParams(location.search).get('date');
    const answeredDate = answered && /^\d{4}-\d{2}-\d{2}$/.test(answered) ? answered : date;

    if (callback.kind === 'bridge' && callback.action === 'movimentos') {
      // The attempt this trip wrote before leaving pairs the answer with the request; it is read once here and
      // forgotten, because the document that wrote it no longer exists.
      const attempt = loadAeroPendingAttempt('movimentos');
      if (attempt) clearAeroPendingAttempt();

      const read = readAeroMovements(callback.data);
      if (read.status === 'error') {
        void postAeroAuditEvent(
          salidaReadResultEvent({
            date: answeredDate,
            attempt,
            seats: null,
            error: read.message ?? 'movements_unreadable',
          }),
        );
        setCheckError(read.message || t('salida.erpCheckError'));
      } else {
        void (async () => {
          try {
            await api.post(
              '/integration/aero/movements',
              buildAeroMovementsSnapshot(answeredDate, read.movements),
              // The refusal the server audits on its own has to name the same attempt this page's result line
              // names; no attempt in memory means no header, never an invented one.
              { headers: aeroAttemptHeaders(attempt) },
            );
            void postAeroAuditEvent(
              salidaReadResultEvent({
                date: answeredDate,
                attempt,
                seats: read.movements.length,
                stored: read.movements.length,
              }),
            );
            await load();
            setNotice({ type: 'success', message: t('salida.erpOk') });
          } catch {
            // The seats came back but Trindade could not keep them: the log says how many arrived and that none
            // were stored, which is the difference between an empty day and a failed write.
            void postAeroAuditEvent(
              salidaReadResultEvent({
                date: answeredDate,
                attempt,
                seats: read.movements.length,
                stored: 0,
                error: 'snapshot_store_failed',
              }),
            );
            setCheckError(t('salida.erpCheckError'));
          }
        })();
      }
    } else if (callback.kind === 'bridge' && callback.action === 'saida') {
      // A resend comes back here, not to the launch screen: same dialog, same trail, same attempt.
      const attempt = loadAeroPendingAttempt('saida');
      if (attempt) clearAeroPendingAttempt();

      const result = readAeroBridgeResult(callback.data);
      void postAeroAuditEvent(
        salidaSyncResultEvent({ attempt, outcome: result.status, message: result.message }),
      );

      setSuccess({ movement: readSalidaLastMovement(), erp: result.status, message: result.message });
      if (result.status === 'ok') {
        clearSalidaOutbox();
        clearSalidaLastMovement();
        setOutbox(null);
      } else {
        // The movement is still owed: the outbox and the card keep saying pending.
        setOutbox(readSalidaOutbox());
      }
      void load();
    } else if (callback.kind === 'error') {
      // The phone came back without the plant. Whichever trip it was, its result line is written with the code.
      const readAttempt = loadAeroPendingAttempt('movimentos');
      const syncAttempt = readAttempt ? null : loadAeroPendingAttempt('saida');
      if (readAttempt || syncAttempt) clearAeroPendingAttempt();

      if (syncAttempt) {
        void postAeroAuditEvent(
          salidaSyncResultEvent({
            attempt: syncAttempt,
            outcome: 'error',
            error: callback.code,
            message: callback.message,
          }),
        );
      } else {
        void postAeroAuditEvent(
          salidaReadResultEvent({
            date: answeredDate,
            attempt: readAttempt,
            seats: null,
            error: callback.code,
            message: callback.message,
          }),
        );
      }
      setCheckError(callback.message || t('salida.erpCheckError'));
    }

    setParams({ date: answeredDate }, { replace: true });
  }, [location.search, date, load, setParams, t]);

  /**
   * Rebuilds the trip of a movement the ERP never confirmed.
   *
   * The payloads are built from the movement itself, not from the catalogue: the product names that left are the
   * ones the record kept, and a catalogue that changed since then must not rewrite the exit.
   */
  const resendToErp = async (movement: SalidaMovement) => {
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
      });
      setOutbox(readSalidaOutbox());

      const trip = trips[0]!;
      const tripRef = { index: 1, total: trips.length };
      const ticket = await requestAeroBridgeTicket({
        action: 'saida',
        payloads: trip.payloads,
        callbackPath: aeroBridgeCallbackFor('saida', '/salida-history'),
      }).catch(() => null);

      if (!ticket) {
        // Nothing left the page and nothing is owed a result: one requested line carries the refusal.
        void postAeroAuditEvent(
          salidaSyncRequestedEvent({
            payloads: trip.payloads,
            trip: tripRef,
            error: SALIDA_TICKET_REFUSED,
            note: `trip ${tripRef.index}/${tripRef.total} · batch ${trip.payloads.length} not sent`,
          }),
        );
        setNotice({ type: 'error', message: t('salida.pendingBody') });
        return;
      }

      // Same shape as a launch: the attempt is stored before leaving, so the answer can be paired with the
      // request it belongs to when the shortcut comes back to a fresh document.
      const attempt = newAeroAttempt();
      saveAeroPendingAttempt({ action: 'saida', ...attempt, date: movement.movement_date });
      void postAeroAuditEvent(salidaSyncRequestedEvent({ payloads: trip.payloads, trip: tripRef, attempt }));

      // The movement travels with the session: the dialog the return shows is drawn from it.
      writeSalidaLastMovement(movement);
      markAeroBridgePending({ action: 'saida', date: movement.movement_date });
      window.location.href = buildAeroBridgeTriggerUrl({ ticket: ticket.ticket, ticketUrl: ticket.ticketUrl });
    } catch {
      setNotice({ type: 'error', message: t('salida.pendingBody') });
    } finally {
      setResendingId(null);
    }
  };

  const shareMovement = async (movement: SalidaMovement) => {
    setNotice(null);
    const text = salidaSummaryText(movement, labels);
    const outcome = await shareSalida({ text });
    if (outcome === 'copied' || outcome === 'shared') {
      setNotice({ type: 'success', message: t('salida.copiedSummary') });
    } else if (outcome === 'failed') {
      setNotice({ type: 'error', message: t('salida.shareFailed') });
    }
  };

  const pendingCount = visibleMovements.filter(
    (movement) => salidaReconciliationStatus(movement) !== 'reconciled',
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('salida.historyTitle')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('salida.historySubtitle')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ModuleHelpModal
              title={t('moduleHelp.salidaHistory.title')}
              subtitle={t('moduleHelp.salidaHistory.subtitle')}
              description={t('moduleHelp.salidaHistory.description')}
              sections={t('moduleHelp.salidaHistory.sections', { returnObjects: true }) as unknown as HelpSection[]}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/salida')}
              className="min-h-[44px]"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('salida.launch')}
            </Button>
          </div>
        </div>
      </div>

      {notice && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            notice.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {notice.message}
        </p>
      )}

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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <SalidaBlockFilter value={block} onChange={setBlock} />
          <Button
            type="button"
            onClick={() => void handleCheckErp()}
            disabled={checking}
            className="min-h-[44px]"
            data-testid="salida-check-erp"
          >
            {checking ? t('salida.confering') : t('salida.conferir')}
          </Button>
        </div>

        {checkError && (
          <p role="alert" className="text-sm text-red-700" data-testid="salida-check-error">
            {checkError}
          </p>
        )}

        {pendingCount > 0 && (
          <p className="text-xs text-amber-800" data-testid="salida-pending-count">
            {t('salida.erpPending')}: {pendingCount}
          </p>
        )}
      </div>

      {visibleMovements.length === 0 ? (
        <p
          className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm"
          data-testid="salida-history-empty"
        >
          {t('salida.historyEmpty')}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleMovements.map((movement) => (
            <SalidaMovementCard
              key={movement.id}
              movement={movement}
              timeLabel={salidaTimeLabel(movement.created_at)}
              onShare={(target) => void shareMovement(target)}
              onResend={(target) => void resendToErp(target)}
              resending={resendingId === movement.id}
            />
          ))}
        </div>
      )}

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
