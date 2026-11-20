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
import { DaySessionHeader } from '../../components/DaySessionHeader';
import { SalidaBlockSwitch, SalidaProductGrid } from '../../components/salida/SalidaBlocks';
import { SalidaSummaryBar } from '../../components/salida/SalidaSummaryBar';
import { SalidaSuccessDialog, type SalidaErpOutcome } from '../../components/salida/SalidaSuccessDialog';
import { Dialog } from '../../components/ui/dialog';
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
  clearSalidaLastMovement,
  readSalidaLastMovement,
  salidaOutboxIsOwed,
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
  // The launch goes through a confirmation, like a Masas launch: the operator reads what is leaving before the
  // ticket is armed. Nothing leaves the page until Confirmar.
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  /**
   * El outbox se cree sólo si el movimiento que nombra sigue existiendo y pendiente.
   *
   * Vive en el teléfono y sobrevive al borrado: leerlo sin preguntar dejaba el banner "Saída pendente" sobre un
   * movimiento que ya no estaba. Se consulta el día del outbox -- una lectura, no la pantalla -- y si el movimiento
   * no está, o el ERP ya lo confirmó, la cola se limpia en lugar de anunciarse.
   */
  const [outboxOwed, setOutboxOwed] = useState(false);
  useEffect(() => {
    if (!outbox) {
      setOutboxOwed(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const body = await api.get<{ movements?: SalidaMovement[] }>(`/salida?date=${outbox.date}`);
        if (!active) return;
        const owed = salidaOutboxIsOwed(outbox, body.movements ?? []);
        setOutboxOwed(owed);
        if (!owed) {
          clearSalidaOutbox();
          setOutbox(null);
          if (readSalidaLastMovement()?.id === outbox.movementId) clearSalidaLastMovement();
        }
      } catch {
        // Sin poder validar no se inventa un pendiente: el aviso no bloquea la pantalla.
        if (active) setOutboxOwed(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [outbox]);

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

  /** The button: reads the form and opens the confirmation. Nothing is sent here. */
  const handleLaunch = () => {
    if (items.length === 0) {
      setNotice({ type: 'error', message: t('salida.emptySelection') });
      return;
    }
    setNotice(null);
    setConfirmOpen(true);
  };

  /** Confirmar: from here the movement is written and the trip is armed, exactly as before the dialog existed. */
  const handleConfirmLaunch = async () => {
    setConfirmOpen(false);
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

    // La baja quedó en Trindade: la ventana lo confirma siempre. Si el ERP también la aceptó, lo dice como 'ok'; si
    // no llegó, lo dice como pendiente. Retornar sin ventana cuando el ERP contestaba dejaba el formulario vacío y
    // al operario sin saber si su lanzamiento existió.
    setSuccess({ movement: outcome.movement, erp: outcome.erp === 'sent' ? 'ok' : 'pending', message: null });
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
      <DaySessionHeader
        date={date}
        historyHref="/salida-history"
        username={user?.username}
        testIdPrefix="salida"
        title={t('salida.title')}
        subtitle={t('salida.subtitle')}
        help={
          <ModuleHelpModal
            title={t('moduleHelp.salida.title')}
            subtitle={t('moduleHelp.salida.subtitle')}
            description={t('moduleHelp.salida.description')}
            sections={t('moduleHelp.salida.sections', { returnObjects: true }) as unknown as HelpSection[]}
          />
        }
      />

      {catalogFailed && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          data-testid="salida-catalog-fallback"
        >
          {t('salida.catalogError')}
        </p>
      )}

      {outbox && outboxOwed && (
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
        onLaunch={handleLaunch}
      />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        labelledBy="salida-confirm-title"
        describedBy="salida-confirm-desc"
        panelTestId="salida-confirm-modal"
      >
        <div className="max-h-[85vh] w-full max-w-md space-y-4 overflow-y-auto p-6">
          <h2 id="salida-confirm-title" className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <span aria-hidden="true">🚛</span>
            <span>{t('salida.confirmTitle')}</span>
          </h2>
          <p id="salida-confirm-desc" className="text-xs text-gray-500">
            {t('salida.confirmSubtitle')}
          </p>

          <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border bg-gray-50 p-3">
            {items.map((item) => {
              const product = (catalog ?? []).find((candidate) => candidate.code === String(item.code));
              return (
                <div key={item.code} className="flex items-center justify-between gap-2 text-sm" data-testid={`salida-confirm-item-${item.code}`}>
                  <span className="min-w-0 font-medium text-gray-800">{product?.name ?? item.code}</span>
                  <span className="shrink-0 text-right font-bold tabular-nums text-gray-900">{item.quantity} un</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="font-semibold text-gray-700">
              {t('salida.confirmProducts')}: {items.length}
            </span>
            <span className="text-base font-extrabold tabular-nums text-gray-900" data-testid="salida-confirm-total">
              {totalUnits} un
            </span>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="min-h-[44px] w-full sm:w-auto"
              data-testid="salida-confirm-cancel"
            >
              {t('salida.confirmCancel')}
            </Button>
            <Button
              onClick={() => void handleConfirmLaunch()}
              className="min-h-[44px] w-full bg-green-600 font-semibold text-white hover:bg-green-700 sm:w-auto"
              data-testid="salida-confirm-action"
            >
              {t('salida.confirmAction')}
            </Button>
          </div>
        </div>
      </Dialog>

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
