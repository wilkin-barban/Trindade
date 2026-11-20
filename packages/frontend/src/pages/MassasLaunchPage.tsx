import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { Dialog } from '../components/ui/dialog';
import { ModuleHelpModal } from '../components/ui/ModuleHelpModal';
import { DaySessionHeader } from '../components/DaySessionHeader';
import { MassasLaunchGrid } from './massas/MassasLaunchGrid';
import { saoPauloToday } from '../lib/date';
import { isClosedDay } from '../lib/massas-day';
import {
  aeroBridgeCallbackFor,
  aeroMissingSetup,
  aeroSettingsReady,
  aeroEndpoint,
  buildAeroBridgeTriggerUrl,
  buildEntradaItemPayload,
  isAeroAllowed,
  loadAeroSettings,
  parseAeroCallback,
  resolveAeroCallback,
  saveAeroSettings,
  type AeroSettings,
} from '../lib/aero-integration';
import { fetchAeroVaultSettings, requestAeroBridgeTicket } from '../lib/aero-vault';
import { newAeroAttempt, postAeroAuditEvent } from '../lib/aero-audit';
import {
  clearAeroBridgePending,
  markAeroBridgePending,
} from '../lib/aero-watchdog';
import {
  clearAeroPendingAttempt,
  saveAeroPendingAttempt,
  type AeroPendingAction,
} from '../lib/aero-pending-attempt';
import {
  clearAeroPendingTest,
  loadAeroPendingTest,
  saveAeroTestOutcome,
  aeroTestNoVerdictEvent,
  aeroTestResultEvent,
  type AeroTestOutcome,
} from '../lib/aero-test';
import {
  clearAeroQueue,
  writeAeroQueue,
  takeAeroBatch,
  type AeroQueue,
} from '../lib/aero-queue';
import { AERO_BATCH_MAX, buildAeroLaunchTrips } from '../lib/aero-batch';
import { AeroDeviceBanner } from '../components/aero/AeroDeviceBanner';
import { useDevice } from '../contexts/DeviceContext';
import { canControlAero } from '../lib/device-detection';
import type { MassasLaunchDayView, MassaIndividualLaunch } from '../lib/massas';

/**
 * What to say when an action needed the ERP and could not reach it.
 *
 * A configured integration whose vault has no password is not one that needs configuring, and the difference is
 * the whole instruction: save the secret in Admin, or finish the address and the user.
 */
function erpNotReadyMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  settings: Pick<AeroSettings, 'wsUrl' | 'username' | 'hasPassword'> | null | undefined,
): string {
  return aeroMissingSetup(settings) === 'password'
    ? t('massas.aero.passwordNeeded')
    : t('massas.aero.syncNeedsSetup');
}

/**
 * The launch screen of Masas.
 *
 * Keeps only the date, the product grid, the confirmation dialog and the launch button pinned
 * to the bottom of the viewport on mobile devices.
 * All daily history, individual launches, collective summary and WhatsApp sharing live in MassasHistoryPage.
 */
export function MassasLaunchPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const date = useMemo(() => saoPauloToday(), []);
  // Today is the only day that still accepts boxes: yesterday is a record the API refuses to reopen.
  const dayIsClosed = isClosedDay(date, saoPauloToday());
  const [dayView, setDayView] = useState<MassasLaunchDayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Grid state: quantities per product code
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [itemsToConfirm, setItemsToConfirm] = useState<
    Array<{ product_code: string; name: string; boxes: number; units: number }>
  >([]);
  const [resultModal, setResultModal] = useState<{
    type: 'success' | 'warn' | 'error';
    title?: string;
    message: string;
  } | null>(null);

  // Company integration: both plant roles use it, each with the vault of their own account.
  const aeroAllowed = isAeroAllowed(user ? { username: user.username, role: user.role } : null);
  const [aeroSettings, setAeroSettings] = useState<AeroSettings>(loadAeroSettings);
  const [, setAeroTestOutcome] = useState<AeroTestOutcome | null>(null);

  const device = useDevice();
  const deviceLimited = !canControlAero(device);

  /**
   * The vault, read once per mount.
   */
  useEffect(() => {
    if (!aeroAllowed) return;
    let cancelled = false;
    void (async () => {
      try {
        const vault = await fetchAeroVaultSettings();
        if (cancelled || !vault.configured) return;
        setAeroSettings((current) =>
          saveAeroSettings({
            ...current,
            wsUrl: vault.wsUrl ?? current.wsUrl,
            username: vault.username ?? current.username,
            hasPassword: vault.hasPassword,
          }),
        );
      } catch {
        // Vault read failure is handled silently; actions explain what is missing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aeroAllowed]);

  const load = useCallback(
    async (targetDate: string, isSilent = false) => {
      if (!isSilent) {
        setError('');
      }
      try {
        const loaded = await api.get<MassasLaunchDayView>(`/massas-launch?date=${targetDate}`);
        setDayView(loaded);
      } catch (err) {
        if (!isSilent) {
          setError(err instanceof Error ? err.message : t('massas.loadError'));
        }
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    setLoading(true);
    void load(date);
  }, [date, load]);

  const aeroDestination = useCallback(() => {
    return aeroSettings.wsUrl?.trim() || null;
  }, [aeroSettings.wsUrl]);

  const handleQuantityChange = (code: string, rawVal: string) => {
    setQuantities((prev) => ({
      ...prev,
      [code]: rawVal,
    }));
  };

  const handleRequestLaunch = () => {
    if (!dayView || dayIsClosed) return;
    const items = dayView.products
      .map((p) => {
        const boxes = parseInt(quantities[p.code] || '0', 10);
        return {
          product_code: p.code,
          name: p.name,
          boxes,
          units: boxes * p.unitsPerBox,
        };
      })
      .filter((i) => i.boxes > 0);

    if (items.length === 0) return;
    setItemsToConfirm(items);
    setIsConfirmOpen(true);
  };

  /**
   * Whether the phone already knows the trip would fail.
   */
  const aeroCannotReachInternet = useCallback(() => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!offline) return false;
    setNotice({ type: 'error', message: t('massas.aero.offline') });
    return true;
  }, [t]);

  /**
   * Hands the next batch of pending entries to the Atajos app.
   * Callback destination is /massas-history per Requirement 6 (Task T7 / Spec S2).
   */
  const triggerAeroSync = useCallback(
    async (queue: AeroQueue) => {
      if (aeroCannotReachInternet()) return;
      const taken = takeAeroBatch(queue, AERO_BATCH_MAX);
      if (taken.batch.length === 0) {
        clearAeroQueue();
        return;
      }

      const operatorUser = aeroSettings.username?.trim() || user?.username?.trim() || null;
      const payloads = taken.batch.map((item) =>
        buildEntradaItemPayload({
          productCode: item.productCode,
          productName: item.productName,
          quantity: item.quantity,
          entryDate: queue.date,
          userCode: item.operatorName ?? operatorUser,
          launchIds: item.launchIds,
        }),
      );

      // The callback route returns to /massas-history where the verdict dialog opens
      const [trip] = buildAeroLaunchTrips({
        payloads,
        singleCallbackPath: aeroBridgeCallbackFor('entrada', '/massas-history'),
        batchCallbackPath: aeroBridgeCallbackFor('entrada_lote', '/massas-history'),
      });
      if (!trip) return;

      let ticket: { ticket: string; ticketUrl: string };
      try {
        ticket = await requestAeroBridgeTicket({
          action: trip.action,
          payloads: trip.payloads,
          callbackPath: trip.callbackPath,
        });
      } catch {
        setNotice({ type: 'error', message: t('massas.aero.vaultTicketError') });
        void postAeroAuditEvent({
          event: 'launch_sync',
          phase: 'requested',
          destinationUrl: aeroEndpoint(aeroSettings.wsUrl, 'entradasitem'),
          client: 'web',
          error: 'AERO_TICKET_REFUSED',
          note: `${payloads.length} not sent`,
        });
        return;
      }

      writeAeroQueue({ ...taken.rest, inFlight: taken.batch });

      const action: AeroPendingAction = payloads.length === 1 ? 'entrada' : 'entrada_lote';
      const attempt = newAeroAttempt();
      saveAeroPendingAttempt({ action, ...attempt, date });

      void postAeroAuditEvent({
        event: 'launch_sync',
        phase: 'requested',
        destinationUrl: aeroEndpoint(aeroSettings.wsUrl, 'entradasitem'),
        client: 'web',
        ...attempt,
        payload: payloads.length === 1 ? payloads[0] : payloads,
        note:
          payloads.length === 1
            ? `${taken.rest.items.length > 0 ? `${taken.rest.items.length} pending` : 'last entry'} · via=bridge`
            : `batch ${payloads.length}${taken.rest.items.length > 0 ? ` · ${taken.rest.items.length} pending` : ''} · via=bridge`,
      });

      markAeroBridgePending({ action, date });
      window.location.href = buildAeroBridgeTriggerUrl({
        ticket: ticket.ticket,
        ticketUrl: ticket.ticketUrl,
      });
    },
    [aeroCannotReachInternet, aeroSettings, date, t, user],
  );

  const handleConfirmLaunch = async () => {
    if (!dayView || submitting || itemsToConfirm.length === 0) return;
    if (dayIsClosed) return;
    setSubmitting(true);
    setIsConfirmOpen(false);
    try {
      const created = await api.post<{ created: MassaIndividualLaunch[] }>('/massas-launch', {
        date,
        items: itemsToConfirm.map((i) => ({ product_code: i.product_code, boxes: i.boxes })),
      });

      // No sync toggle: if the integration is configured (aeroSettingsReady), it always goes to the ERP.
      const syncable = aeroAllowed && aeroSettingsReady(aeroSettings);
      const requested = itemsToConfirm.map((i) => ({
        productCode: i.product_code,
        productName: i.name,
        quantity: i.units,
        launchIds: (created?.created ?? [])
          .filter((launch) => launch.product_code === i.product_code)
          .map((launch) => launch.id),
      }));

      setQuantities({});
      await load(date);

      // La ventana se abre ANTES de armar el viaje: con la integración lista, la cola se despacha y la función
      // retornaba sin decir nada -- el formulario se vaciaba y el operario no sabía si su lanzamiento existía.
      // Lo que se afirma es lo único seguro: quedó registrado en Trindade.
      setResultModal({
        type: 'success',
        message: t('massas.launchSuccess', 'Lançamento registrado com sucesso!'),
      });

      if (syncable) {
        const queue: AeroQueue = { createdAt: new Date().toISOString(), date, items: requested, inFlight: [] };
        writeAeroQueue(queue);
        void triggerAeroSync(queue);
        return;
      }

      if (aeroAllowed) {
        // Guardado, pero la planta no lo recibió: se dice en la misma ventana, sin prometer que el ERP lo tiene.
        setResultModal({
          type: 'warn',
          message: erpNotReadyMessage(t, aeroSettings),
        });
        void postAeroAuditEvent({
          event: 'launch_sync',
          phase: 'requested',
          destinationUrl: aeroDestination() || aeroSettings.wsUrl,
          payload: requested,
          error: 'integration_not_ready',
          note: `${requested.length} not sent`,
        });
      }
    } catch (err) {
      setResultModal({
        type: 'error',
        message: err instanceof Error ? err.message : t('massas.launchError', 'Erro ao registrar lançamento.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Handles error or test callbacks if returned directly to the launch route.
   */
  useEffect(() => {
    void (async () => {
      const parsed = await resolveAeroCallback(window.location.search);
      if (!parsed) return;
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
      clearAeroBridgePending();

      if (parsed.kind === 'error') {
        clearAeroPendingAttempt();
        setResultModal({
          type: 'error',
          title: t('massas.aero.wifiRequiredTitle'),
          message: parsed.code === 'wifi_required' ? t('massas.aero.wifiRequired') : t('massas.aero.bridgeError'),
        });
        return;
      }

      if (parsed.kind === 'test') {
        const pending = loadAeroPendingTest();
        const destinationUrl = pending?.destinationUrl ?? aeroDestination() ?? aeroSettings.wsUrl;
        clearAeroPendingTest();
        void postAeroAuditEvent(
          aeroTestResultEvent({ verdict: parsed.verdict, raw: parsed.raw, destinationUrl }),
        );
        setAeroTestOutcome({ verdict: parsed.verdict, raw: parsed.raw, destinationUrl });
        saveAeroTestOutcome({ verdict: parsed.verdict, raw: parsed.raw, destinationUrl });
      }
    })();
  }, [aeroDestination, aeroSettings.wsUrl, t]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (parseAeroCallback(window.location.search)) return;
      const pending = loadAeroPendingTest();
      if (!pending) return;
      clearAeroPendingTest();
      void postAeroAuditEvent(aeroTestNoVerdictEvent({ destinationUrl: pending.destinationUrl }));
      setAeroTestOutcome({ verdict: 'unknown', raw: '', destinationUrl: pending.destinationUrl });
      saveAeroTestOutcome({ verdict: 'unknown', raw: '', destinationUrl: pending.destinationUrl });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-12 sm:space-y-6">
      {aeroAllowed && deviceLimited && <AeroDeviceBanner device={device} />}

      {/* Header and Date/Session */}
      <DaySessionHeader
        date={date}
        historyHref="/massas-history"
        username={user?.username}
        testIdPrefix="massas"
        title={t('massas.title')}
        subtitle={t('massas.subtitle')}
        help={
          <ModuleHelpModal
            title={t('moduleHelp.massasLaunch.title')}
            subtitle={t('moduleHelp.massasLaunch.subtitle')}
            description={t('moduleHelp.massasLaunch.description')}
            sections={t('moduleHelp.massasLaunch.sections', { returnObjects: true }) as any}
          />
        }
      />

      {/* Global Notices */}
      {error && (
        <div role="alert" className="p-4 text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className={`p-4 rounded-lg border ${
            notice.type === 'success'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* When ERP is not configured, show plain message with link instead of toggle switch */}
      {aeroAllowed && !aeroSettingsReady(aeroSettings) && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between gap-2"
          data-testid="massas-erp-not-configured"
        >
          <span>
            {aeroMissingSetup(aeroSettings) === 'password'
              ? t('massas.aero.passwordNeeded')
              : t('massas.aero.syncNeedsSetup')}
          </span>
          <Link
            to="/admin?tab=integration"
            className="font-semibold underline hover:text-amber-950 shrink-0"
            data-testid="massas-configure-erp-link"
          >
            {t('massas.aero.configureLink', 'Configurar conexão')}
          </Link>
        </div>
      )}

      {/* Product Launch Grid with Sticky Bar */}
      {dayView && (
        <MassasLaunchGrid
          products={dayView.products}
          quantities={quantities}
          onQuantityChange={handleQuantityChange}
          onLaunch={handleRequestLaunch}
          submitting={submitting}
          readOnly={dayIsClosed}
        />
      )}

      {/* Launch Confirmation Dialog */}
      {isConfirmOpen && (
        <Dialog
          open={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          labelledBy="massa-confirm-title"
          describedBy="massa-confirm-desc"
          panelTestId="massa-confirm-modal"
        >
          <div className="p-6 space-y-4 max-w-md w-full">
            <h2 id="massa-confirm-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="text-xl">🍝</span>
              <span>{t('massas.confirmTitle', 'Confirmar Lançamento de Massas')}</span>
            </h2>
            <p id="massa-confirm-desc" className="text-xs text-gray-500">
              {t('massas.confirmSubtitle', 'Verifique os produtos e caixas antes de confirmar o lançamento:')}
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 border rounded-lg p-3 bg-gray-50">
              {itemsToConfirm.map((item) => (
                <div key={item.product_code} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 font-medium text-gray-800">📦 {item.name}</span>
                  <span className="shrink-0 text-right font-bold text-amber-800">{item.boxes} cx ({item.units} un)</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t flex justify-between items-center text-sm">
              <span className="font-semibold text-gray-700">{t('massas.totalToLaunch', 'Total Geral a Lançar')}:</span>
              <span className="font-extrabold text-base text-amber-900">
                {itemsToConfirm.reduce((sum, i) => sum + i.boxes, 0)} cx ({itemsToConfirm.reduce((sum, i) => sum + i.units, 0)} un)
              </span>
            </div>

            <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setIsConfirmOpen(false)}
                disabled={submitting}
                className="min-h-[44px] w-full sm:w-auto"
              >
                {t('massas.cancel', 'Cancelar')}
              </Button>
              <Button
                onClick={handleConfirmLaunch}
                disabled={submitting}
                className="min-h-[44px] w-full bg-amber-600 font-semibold text-white hover:bg-amber-700 sm:w-auto"
              >
                {submitting ? t('massas.submitting', 'Lançando...') : t('massas.confirmAction', 'Confirmar')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Result Notification Modal */}
      {resultModal && (
        <Dialog
          open={resultModal !== null}
          onClose={() => setResultModal(null)}
          labelledBy="massa-result-title"
          panelTestId="massa-result-modal"
        >
          <div className="p-6 space-y-4 max-w-sm w-full text-center">
            <div className="text-4xl">
              {resultModal.type === 'success' ? '✅' : resultModal.type === 'warn' ? '⚠️' : '❌'}
            </div>
            <h2 id="massa-result-title" className="text-lg font-bold text-gray-900">
              {resultModal.title ??
                (resultModal.type === 'success'
                  ? t('massas.successTitle', 'Lançamento Concluído')
                  : t('massas.errorTitle', 'Erro no Lançamento'))}
            </h2>
            <p className="text-sm text-gray-600" data-testid="massa-result-message">
              {resultModal.message}
            </p>
            <div className="space-y-2 pt-2">
              <Button
                onClick={() => setResultModal(null)}
                className={`min-h-[44px] w-full font-semibold ${
                  resultModal.type === 'success'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
                data-testid="massa-result-close"
              >
                {t('massas.close', 'Fechar')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
