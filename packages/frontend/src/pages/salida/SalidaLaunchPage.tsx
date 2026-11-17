import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { ModuleHelpModal, type HelpSection } from '../../components/ui/ModuleHelpModal';
import { SalidaBlockSwitch, SalidaProductGrid } from '../../components/salida/SalidaBlocks';
import { SalidaSummaryBar } from '../../components/salida/SalidaSummaryBar';
import { SalidaSuccessDialog, type SalidaErpOutcome } from '../../components/salida/SalidaSuccessDialog';
import { saoPauloToday } from '../../lib/date';
import {
  aeroBridgeCallbackFor,
  buildAeroBridgeTriggerUrl,
} from '../../lib/aero-integration';
import { markAeroBridgePending } from '../../lib/aero-watchdog';
import { saveAeroPendingAttempt } from '../../lib/aero-pending-attempt';
import { newAeroAttempt, postAeroAuditEvent } from '../../lib/aero-audit';
import { requestAeroBridgeTicket } from '../../lib/aero-vault';
import {
  SALIDA_BLOCKS,
  SALIDA_FALLBACK_PRODUCTS,
  SALIDA_TICKET_REFUSED,
  buildSalidaPayloads,
  buildSalidaTrips,
  clearSalidaOutbox,
  readSalidaOutbox,
  salidaActionableErrorMessage,
  salidaDateLine,
  salidaItemsFromQuantities,
  salidaProductsByBlock,
  salidaSyncRequestedEvent,
  salidaTotalUnits,
  submitSalida,
  takeSalidaTrip,
  writeSalidaLastMovement,
  writeSalidaOutbox,
  type SalidaBlock,
  type SalidaMovement,
  type SalidaOutbox,
  type SalidaProduct,
} from '../../lib/salida';

/**
 * The launch screen of Salida / Baixa.
 *
 * Three blocks with a switch each, one grid of products per active block, and one button. The order the launch
 * is written in is the point of the screen and lives in `submitSalida`: Trindade first, photos second, the ERP
 * last, so a company that does not answer leaves a pending movement instead of an exit with no record.
 *
 * The date is not a field: it is the plant's today, read in São Paulo, because the operator launching supplies
 * at 22:00 should not be filing tomorrow's exit. The operator is the session, and it is drawn read-only for the
 * same reason.
 */
export function SalidaLaunchPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const date = useMemo(() => saoPauloToday(), []);

  const [catalog, setCatalog] = useState<SalidaProduct[] | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [activeBlocks, setActiveBlocks] = useState<SalidaBlock[]>([...SALIDA_BLOCKS]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [success, setSuccess] = useState<{
    movement: SalidaMovement | null;
    erp: SalidaErpOutcome;
    message: string | null;
  } | null>(null);
  const [outbox, setOutbox] = useState<SalidaOutbox | null>(null);
  const [erpSending, setErpSending] = useState(false);

  // The catalogue is the server's. A read that failed falls back to the module's own list, said out loud, so the
  // operator is never blocked by a catalogue endpoint while the launch endpoint is up.
  useEffect(() => {
    let active = true;
    void api
      .get<{ products?: SalidaProduct[] }>('/salida/catalog')
      .then((body) => {
        if (!active) return;
        const products = Array.isArray(body?.products) ? body.products : [];
        if (products.length === 0) {
          setCatalog([...SALIDA_FALLBACK_PRODUCTS]);
          setCatalogFailed(true);
          return;
        }
        setCatalog(products);
      })
      .catch(() => {
        if (!active) return;
        setCatalog([...SALIDA_FALLBACK_PRODUCTS]);
        setCatalogFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // A trip that left the page is still owed by the screen: the outbox says so, and it is read before the first
  // render that could hide it.
  useEffect(() => {
    setOutbox(readSalidaOutbox());
  }, []);

  const groups = useMemo(
    () => (catalog ? salidaProductsByBlock(catalog) : null),
    [catalog],
  );

  const items = useMemo(
    () => salidaItemsFromQuantities(quantities, catalog ?? [], activeBlocks),
    [quantities, catalog, activeBlocks],
  );
  const totalUnits = salidaTotalUnits(items);

  /**
   * Drives one trip to the ERP and answers whether the page handed it over.
   *
   * One trip is armed at a time: the shortcut is a deep link, so the page leaves. What remains of the queue is
   * written before the navigation, and the first trip of a movement that had more than eight products waits in
   * the outbox for the operator to press `Reenviar ao ERP` when the phone comes back.
   */
  const sendNextTrip = useCallback(async (): Promise<boolean> => {
    const queued = readSalidaOutbox();
    const { trip } = takeSalidaTrip(queued);
    if (!trip) {
      clearSalidaOutbox();
      setOutbox(null);
      return true;
    }

    // Which of the trips this one is, for the log: the head of what is still owed.
    const tripRef = { index: 1, total: queued?.trips.length ?? 1 };

    let ticket: { ticket: string; ticketUrl: string };
    try {
      ticket = await requestAeroBridgeTicket({
        action: 'saida',
        payloads: trip.payloads,
        callbackPath: aeroBridgeCallbackFor('saida', '/salida-history'),
      });
    } catch (err) {
      // Nothing left the page: the movement stays pending, the queue stays where it was, and the log says the
      // vault refused to arm the trip instead of leaving a silence where a launch should be.
      setOutbox(readSalidaOutbox());
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
      return false;
    }

    // Record how many payloads this trip carries so the batch verdict can verify the exact batch size on return.
    // The outbox is NOT cleared before leaving; it clears only on complete.
    if (queued) {
      writeSalidaOutbox({
        ...queued,
        currentTripPayloads: trip.payloads.length,
      });
    }

    // The attempt is written down before leaving: the shortcut comes back to a fresh document, and the
    // identifier that pairs this line with the answer has to survive the trip.
    const attempt = newAeroAttempt();
    saveAeroPendingAttempt({ action: 'saida', ...attempt, date });
    void postAeroAuditEvent(salidaSyncRequestedEvent({ payloads: trip.payloads, trip: tripRef, attempt }));

    markAeroBridgePending({ action: 'saida', date });
    window.location.href = buildAeroBridgeTriggerUrl({ ticket: ticket.ticket, ticketUrl: ticket.ticketUrl });
    return true;
  }, [date, t]);

  const sendToErp = useCallback(
    async (movement: SalidaMovement, payloads: ReturnType<typeof buildSalidaPayloads>): Promise<boolean> => {
      const trips = buildSalidaTrips(payloads);
      if (trips.length === 0) return false;
      // The movement travels with the session: the shortcut leaves the page, and the dialog the operator sees on
      // return needs the record it is confirming.
      writeSalidaLastMovement({ ...movement, expectedPayloads: trips[0]?.payloads.length });
      writeSalidaOutbox({
        movementId: movement.id,
        date,
        trips,
        startedAt: new Date().toISOString(),
        currentTripPayloads: trips[0]?.payloads.length,
      });
      setOutbox(readSalidaOutbox());
      return sendNextTrip();
    },
    [date, sendNextTrip],
  );

  const toggleBlock = (block: SalidaBlock, enabled: boolean) => {
    setActiveBlocks((current) =>
      SALIDA_BLOCKS.filter((candidate) => (candidate === block ? enabled : current.includes(candidate))),
    );
    if (enabled) return;
    // Switching a block off is the operator discarding it: the quantities go with the block instead of waiting
    // behind a switch that is off to be silently re-sent the moment it comes back on.
    const codes = new Set((groups?.[block] ?? []).map((product) => product.code));
    setQuantities((current) => {
      const next: Record<string, string> = {};
      for (const [code, value] of Object.entries(current)) {
        if (!codes.has(code)) next[code] = value;
      }
      return next;
    });
  };

  const handleQuantityChange = (code: string, raw: string) => {
    setQuantities((current) => ({ ...current, [code]: raw }));
  };

  const handleLaunch = async () => {
    if (items.length === 0) {
      setNotice({ type: 'error', message: t('salida.emptySelection') });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    const payloads = buildSalidaPayloads(items, {
      date,
      username: user?.username ?? '',
      products: catalog ?? [],
    });

    const outcome = await submitSalida(items, {
      create: async (list) => {
        const body = await api.post<{ movement: SalidaMovement }>('/salida', { items: list });
        return body.movement;
      },
      sendToErp: (movement) => sendToErp(movement, payloads),
    });

    setSubmitting(false);

    if (!outcome.movement) {
      setNotice({
        type: 'error',
        message: outcome.error?.trim() ? outcome.error : t('salida.launchError'),
      });
      return;
    }

    // The movement is in Trindade: the form empties so the same quantities cannot be filed twice.
    setQuantities({});

    if (outcome.erp === 'sent') return;

    // The ERP never heard about it, or the trip never started: the movement is still the operator's, and the
    // dialog says exactly that instead of pretending the launch failed.
    setSuccess({ movement: outcome.movement, erp: 'pending', message: null });
    setOutbox(readSalidaOutbox());
  };

  const handleResend = async () => {
    setErpSending(true);
    setNotice(null);
    const sent = await sendNextTrip();
    setErpSending(false);
    if (!sent) {
      setNotice({
        type: 'error',
        message: salidaActionableErrorMessage(SALIDA_TICKET_REFUSED, null, t),
      });
    }
  };

  if (!catalog) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-4 sm:space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div
          data-testid="salida-launch-header"
          className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('salida.title')}</h1>
              <div className="shrink-0" data-testid="salida-launch-help">
                <ModuleHelpModal
                  title={t('moduleHelp.salida.title')}
                  subtitle={t('moduleHelp.salida.subtitle')}
                  description={t('moduleHelp.salida.description')}
                  sections={t('moduleHelp.salida.sections', { returnObjects: true }) as unknown as HelpSection[]}
                />
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-500">{t('salida.subtitle')}</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/salida-history')}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 text-sm font-semibold sm:w-auto"
              data-testid="salida-nav-history"
            >
              <History className="h-4 w-4" />
              {t('salida.navHistory')}
            </Button>
          </div>
        </div>

        {/* Neither the date nor the operator is a field: one is the plant's day and the other is the session. */}
        <dl className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm sm:grid-cols-2">
          <div className="flex items-baseline gap-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('salida.dateLabel')}</dt>
            <dd className="font-medium text-gray-900" data-testid="salida-date">
              {salidaDateLine(date)}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('salida.operatorLabel')}
            </dt>
            <dd className="font-medium text-gray-900" data-testid="salida-operator">
              {user?.username ?? ''}
              <span className="ml-2 text-xs font-normal text-gray-500">({t('salida.session')})</span>
            </dd>
          </div>
        </dl>
      </div>

      {catalogFailed && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          data-testid="salida-catalog-fallback"
        >
          {t('salida.catalogError')}
        </p>
      )}

      {outbox && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="salida-outbox"
        >
          <p className="font-semibold">{t('salida.pendingTitle')}</p>
          <p className="mt-0.5">{t('salida.pendingBody')}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleResend()}
            disabled={erpSending}
            className="mt-2 min-h-[44px]"
            data-testid="salida-resend-erp"
          >
            {erpSending ? t('salida.resendingErp') : t('salida.resendErp')}
          </Button>
        </div>
      )}

      {notice && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {notice.message}
        </p>
      )}

      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-4">
            {SALIDA_BLOCKS.map((block) => {
              const enabled = activeBlocks.includes(block);
              const products = groups?.[block] ?? [];
              return (
                <div key={block} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <SalidaBlockSwitch
                    block={block}
                    label={t(`salida.blocks.${block}`)}
                    enabled={enabled}
                    productCount={products.length}
                    onToggle={(next) => toggleBlock(block, next)}
                  />
                  {enabled && (
                    <SalidaProductGrid
                      products={products}
                      quantities={quantities}
                      onQuantityChange={handleQuantityChange}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {items.length === 0 && (
        <p className="text-xs text-gray-500" data-testid="salida-empty-selection">
          {t('salida.quantityHint')}
        </p>
      )}

      <SalidaSummaryBar
        productCount={items.length}
        totalUnits={totalUnits}
        submitting={submitting}
        disabled={items.length === 0}
        onLaunch={() => void handleLaunch()}
      />

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
