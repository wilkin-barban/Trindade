import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { resolveApiErrorKey } from '../lib/api-error-normalizer';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { MessageDialog } from '../components/ui/message-dialog';
import { Dialog } from '../components/ui/dialog';
import { HistoryDayPanel, type HistoryDay } from '../components/ui/HistoryDayPanel';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { toWhatsAppNumber } from '../lib/phone';
import { shareOrCopy, waMeLink } from '../lib/whatsapp';
import {
  massasMessage,
  type MassasHistoryDay,
  type MassasLaunchDayView,
  type MassaIndividualLaunch,
} from '../lib/massas';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { ModuleHelpModal } from '../components/ui/ModuleHelpModal';
import { MassasCollectiveTable } from './massas/MassasCollectiveTable';
import {
  canManagePendingRow,
  deriveDisplayName,
  loadAckedLaunchIds,
  massasUnifiedRows,
  toggleAckedLaunchId,
  type MassasUnifiedRow,
} from '../lib/massas-unified';
import {
  deriveUsername,
  quickWorkerPassword,
  QUICK_WORKER_ROLE_ID,
} from '../lib/share-app';
import { MassasWhatsAppShare } from './massas/MassasWhatsAppShare';
import { formatDateLabel, saoPauloDaysAgo, saoPauloToday } from '../lib/date';
import {
  aeroBridgeCallbackFor,
  aeroMissingSetup,
  aeroSettingsReady,
  aeroEndpoint,
  buildAeroBridgeTriggerUrl,
  buildAeroMovementsSnapshot,
  buildEntradaItemPayload,
  isAeroAllowed,
  loadAeroSettings,
  parseAeroCallback,
  readAeroBridgeResult,
  readAeroMovements,
  resolveAeroCallback,
  saveAeroSettings,
  type AeroSettings,
} from '../lib/aero-integration';
import { fetchAeroVaultSettings, requestAeroBridgeTicket } from '../lib/aero-vault';
import { aeroAttemptHeaders, aeroImportAuditEvent, newAeroAttempt, postAeroAuditEvent } from '../lib/aero-audit';
import {
  aeroBridgeMarkExpired,
  AERO_BRIDGE_MARK_TTL_MS,
  clearAeroBridgePending,
  markAeroBridgePending,
  readAeroBridgePending,
} from '../lib/aero-watchdog';
import {
  aeroAttemptDate,
  clearAeroPendingAttempt,
  loadAeroPendingAttempt,
  type AeroPendingAction,
  saveAeroPendingAttempt,
} from '../lib/aero-pending-attempt';
import {
  aeroTestNoVerdictEvent,
  aeroTestResultEvent,
  clearAeroPendingTest,
  loadAeroPendingTest,
  saveAeroTestOutcome,
  type AeroTestOutcome,
} from '../lib/aero-test';
import {
  clearAeroQueue,
  pendingLaunchQueueItem,
  readAeroQueue,
  requeueInFlightAeroQueue,
  takeAeroBatch,
  writeAeroQueue,
  type AeroQueue,
} from '../lib/aero-queue';
import { AERO_BATCH_MAX, buildAeroLaunchTrips } from '../lib/aero-batch';
import { AeroResultDialog } from './massas/AeroResultDialog';
import { armAeroAutoRead, clearAeroAutoRead, consumeAeroAutoRead } from '../lib/aero-auto-read';
import { AeroDeviceBanner } from '../components/aero/AeroDeviceBanner';
import { useDevice } from '../contexts/DeviceContext';
import { canControlAero } from '../lib/device-detection';
import {
  batchSyncFeedback,
  launchMirrorHint,
  movementsSyncFeedback,
  readAeroBatchResult,
  type AeroSyncFeedback,
} from '../lib/aero-feedback';
import {
  aeroImportPayload,
  aeroMovementsPayload,
  lastSyncLabel,
  readAeroMovementsSnapshot,
  type AeroMovementSnapshot,
} from '../lib/aero-mirror';

function erpNotReadyMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  settings: Pick<AeroSettings, 'wsUrl' | 'username' | 'hasPassword'> | null | undefined,
): string {
  return aeroMissingSetup(settings) === 'password'
    ? t('massas.aero.passwordNeeded')
    : t('massas.aero.syncNeedsSetup');
}

function useOptionalAuth() {
  try {
    return useAuth();
  } catch {
    return { user: null };
  }
}

/**
 * The history of massas: today is manageable (edit, delete, relaunch, sync),
 * earlier days are read-only (mutations hidden, one visible read-only line, WhatsApp share kept).
 * Shows the day structured as cards: day header, Produção do dia, Lançamentos Individuais,
 * Resumo Coletivo do Dia, and WhatsApp share.
 */
/**
 * El veredicto del envío manual al ERP, en la ventana de producto.
 *
 * La confirmación de la página es una pregunta y puede quedarse mientras espera; esta pieza es la respuesta, y se
 * cierra a mano. Se exporta para poder probar sus dos tonos sin montar todo el histórico.
 */
export function MassasManualSyncResult({
  result,
  onClose,
}: {
  result: { tone: 'success' | 'error'; message: string } | null;
  onClose: () => void;
}) {
  return (
    <MessageDialog
      open={result !== null}
      tone={result?.tone ?? 'success'}
      message={result?.message ?? ''}
      onClose={onClose}
      testId="massas-sync-manual-result"
    />
  );
}

export function MassasHistoryPage() {
  const { t } = useTranslation();
  const { user } = useOptionalAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const today = useMemo(() => saoPauloToday(), []);
  const asked = params.get('date');
  const date = useMemo(() => {
    if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today) return asked;
    return today;
  }, [asked, today]);

  const isToday = date === today;
  const isPastDay = date < today;

  const setDate = useCallback(
    (next: string) => {
      setParams(next === today ? {} : { date: next }, { replace: true });
    },
    [setParams, today],
  );

  const [dayView, setDayView] = useState<MassasLaunchDayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Individual editing / deleting state for today
  const [editingLaunchId, setEditingLaunchId] = useState<number | null>(null);
  const [editingBoxes, setEditingBoxes] = useState('');
  const [editingBusy, setEditingBusy] = useState(false);
  const [deletingLaunchId, setDeletingLaunchId] = useState<number | null>(null);
  /**
   * El lanzamiento que espera confirmación y la respuesta del borrado.
   *
   * Ni `window.confirm` ni un cartel dentro de la tabla: el borrado pregunta en el diálogo de producto y responde
   * en una ventana que el operario cierra, porque la tabla de abajo ya cambió.
   */
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleteResult, setDeleteResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  /**
   * El veredicto del envío manual al ERP, en su ventana.
   *
   * La confirmación puede seguir en la página mientras espera, porque es una pregunta; lo que la acción respondió se
   * cierra en un modal, como el resto de los resultados de datos.
   */
  const [manualResult, setManualResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  // WhatsApp state
  const [phone, setPhone] = useState('');
  // El aviso de la copia era del botón `Copiar Relatório`, que ya no existe: compartir y copiar son el mismo gesto.


  // Integration & Mirror state
  const aeroAllowed = isAeroAllowed(user ? { username: user.username, role: user.role } : null);
  const [aeroSettings, setAeroSettings] = useState<AeroSettings>(loadAeroSettings);
  const [, setAeroTestOutcome] = useState<AeroTestOutcome | null>(null);
  const device = useDevice();
  const deviceLimited = !canControlAero(device);

  const [syncAwaiting, setSyncAwaiting] = useState<{ date: string; remaining: number } | null>(() => {
    const queue = readAeroQueue();
    return queue ? { date: queue.date, remaining: queue.items.length + queue.inFlight.length } : null;
  });

  const aeroCallbackHandled = useRef(false);

  const [mirror, setMirror] = useState<{
    loading: boolean;
    error: string | null;
    snapshot: AeroMovementSnapshot | null;
  }>({ loading: false, error: null, snapshot: null });
  const [importingEntLan, setImportingEntLan] = useState<number | null>(null);
  const [creatingOperatorEntLan, setCreatingOperatorEntLan] = useState<number | null>(null);
  const [ackedLaunchIds, setAckedLaunchIds] = useState<number[]>(() => loadAckedLaunchIds(date));

  const [syncResult, setSyncResult] = useState<{
    feedback: AeroSyncFeedback;
    detail: string | null;
  } | null>(null);

  const [resultModal, setResultModal] = useState<{
    type: 'success' | 'warn' | 'error';
    title?: string;
    message: string;
    sentToErp?: boolean;
    retryCount?: number;
  } | null>(null);

  const [days, setDays] = useState<{ loading: boolean; failed: boolean; list: MassasHistoryDay[] }>({
    loading: true,
    failed: false,
    list: [],
  });

  const dayChips = useMemo<HistoryDay[]>(() => {
    if (days.loading) return [];
    const listed = days.list
      .filter((day) => day.date <= today)
      .map((day) => ({ date: day.date, units: day.totalUnits }));
    if (listed.some((day) => day.date === today)) return listed;
    return [{ date: today, units: null }, ...listed];
  }, [days, today]);

  const aeroDestination = useCallback(() => {
    return aeroSettings.wsUrl?.trim() || null;
  }, [aeroSettings.wsUrl]);

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
        // Vault read failure handled silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aeroAllowed]);

  const readToken = useRef(0);

  const loadDay = useCallback(
    async (targetDate: string) => {
      const token = ++readToken.current;
      setError('');
      try {
        const loaded = await api.get<MassasLaunchDayView>(`/massas-launch?date=${targetDate}`);
        if (readToken.current !== token) return;
        setDayView(loaded);
      } catch (err) {
        if (readToken.current !== token) return;
        setDayView(null);
        setError(err instanceof Error ? err.message : t('massas.loadError'));
      } finally {
        if (readToken.current === token) {
          setLoading(false);
        }
      }
    },
    [t],
  );

  const loadMirror = useCallback(async (targetDate: string) => {
    setMirror((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const body = await api.get<unknown>(`/integration/aero/movements?date=${targetDate}`);
      setMirror({
        loading: false,
        error: null,
        snapshot: readAeroMovementsSnapshot(body),
      });
    } catch {
      setMirror((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const loadDays = useCallback(async () => {
    try {
      const loaded = await api.get<{ days?: MassasHistoryDay[] }>('/massas-launch/history');
      setDays({ loading: false, failed: false, list: loaded.days ?? [] });
    } catch {
      setDays((prev) => ({ loading: false, failed: true, list: prev.list }));
    }
  }, []);

  useEffect(() => {
    void loadDays();
  }, [loadDays]);

  useEffect(() => {
    setLoading(true);
    void loadDay(date);
    void loadMirror(date);
    setAckedLaunchIds(loadAckedLaunchIds(date));
  }, [date, loadDay, loadMirror]);

  const aeroCannotReachInternet = useCallback(() => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!offline) return false;
    setNotice({ type: 'error', message: t('massas.aero.offline') });
    return true;
  }, [t]);

  /**
   * Dispatches tickets to Scriptable.
   */
  const triggerAeroSync = useCallback(
    async (queue: AeroQueue) => {
      if (aeroCannotReachInternet()) return;
      const taken = takeAeroBatch(queue, AERO_BATCH_MAX);
      if (taken.batch.length === 0) {
        clearAeroQueue();
        setSyncAwaiting(null);
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
        setSyncAwaiting(null);
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
      setSyncAwaiting({ date: queue.date, remaining: taken.batch.length + taken.rest.items.length });

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

  const handleSendPendingLaunch = useCallback(
    (row: MassasUnifiedRow) => {
      // La tabla esconde las acciones de las filas ajenas; esto es la misma regla del lado del que actúa,
      // porque esconder un botón no autoriza la llamada que llegue igual.
      if (!canManagePendingRow(row, { userId: user?.id, isAdmin: user?.role === 'Administrador' })) {
        setNotice({ type: 'error', message: t('massas.unified.notOwner') });
        return;
      }
      if (!aeroSettingsReady(aeroSettings)) {
        setNotice({ type: 'error', message: erpNotReadyMessage(t, aeroSettings) });
        return;
      }
      if (aeroCannotReachInternet()) return;
      const item = pendingLaunchQueueItem({
        productCode: row.productCode,
        productName: row.productName,
        units: row.units,
        operatorName: row.operatorName,
        launchIds: row.launchIds,
      });
      const queue: AeroQueue = { createdAt: new Date().toISOString(), date, items: [item], inFlight: [] };
      writeAeroQueue(queue);
      void triggerAeroSync(queue);
    },
    [aeroCannotReachInternet, aeroSettings, date, t, triggerAeroSync],
  );

  const retryFailedLaunches = useCallback(() => {
    if (aeroCannotReachInternet()) return;
    setResultModal(null);
    const queue = readAeroQueue();
    if (!queue) return;
    void triggerAeroSync(queue);
  }, [aeroCannotReachInternet, triggerAeroSync]);

  /**
   * Sincronizar com ERP — reads movements for the date into the mirror.
   */
  const handleSyncFromErp = async () => {
    if (!aeroSettingsReady(aeroSettings)) {
      setNotice({ type: 'error', message: erpNotReadyMessage(t, aeroSettings) });
      return;
    }
    if (aeroCannotReachInternet()) return;

    const payload = aeroMovementsPayload({ date, userName: null });

    let ticket: { ticket: string; ticketUrl: string };
    try {
      ticket = await requestAeroBridgeTicket({
        action: 'movimentos',
        payloads: [payload],
        callbackPath: aeroBridgeCallbackFor('movimentos', `/massas-history?date=${date}`),
      });
    } catch {
      setNotice({ type: 'error', message: t('massas.aero.vaultTicketError') });
      return;
    }

    const attempt = newAeroAttempt();
    saveAeroPendingAttempt({ action: 'movimentos', ...attempt, date });

    void postAeroAuditEvent({
      event: 'read_history',
      phase: 'requested',
      destinationUrl: aeroEndpoint(aeroSettings.wsUrl, 'movimentoitem'),
      client: 'web',
      payload,
      note: 'via=bridge',
      ...attempt,
    });

    markAeroBridgePending({ action: 'movimentos', date });
    window.location.href = buildAeroBridgeTriggerUrl({
      ticket: ticket.ticket,
      ticketUrl: ticket.ticketUrl,
    });
  };

  const handleMovementsCallback = useCallback(
    async (data: unknown) => {
      const attempt = loadAeroPendingAttempt('movimentos');
      clearAeroPendingAttempt();
      const answeredDate = aeroAttemptDate(attempt, date);
      const pairing = attempt
        ? { attemptId: attempt.attemptId, startedAt: attempt.startedAt, client: 'web' as const }
        : { client: 'web' as const };

      const read = readAeroMovements(data);
      if (read.status === 'error') {
        setSyncResult({ feedback: movementsSyncFeedback({ status: 'error', count: 0 }), detail: read.message });
        void postAeroAuditEvent({
          event: 'read_history',
          phase: 'result',
          destinationUrl: aeroEndpoint(aeroSettings.wsUrl, 'movimentoitem'),
          error: read.message ?? 'movements_unreadable',
          note: 'via=bridge',
          ...pairing,
        });
        setMirror({
          loading: false,
          error: read.message ?? t('massas.erp.error'),
          snapshot: null,
        });
        return;
      }

      void postAeroAuditEvent({
        event: 'read_history',
        phase: 'result',
        destinationUrl: aeroEndpoint(aeroSettings.wsUrl, 'movimentoitem'),
        note: `seats=${read.movements.length} skipped=${read.skipped} · via=bridge`,
        ...pairing,
      });

      try {
        const stored = await api.post<{ massas?: number }>(
          '/integration/aero/movements',
          buildAeroMovementsSnapshot(answeredDate, read.movements),
          { headers: aeroAttemptHeaders(attempt) },
        );
        await loadMirror(answeredDate);
        setSyncResult({
          feedback: movementsSyncFeedback({ status: 'ok', count: stored?.massas ?? 0 }),
          detail: null,
        });
      } catch {
        setMirror({
          loading: false,
          error: t('massas.erp.error'),
          snapshot: { date, movements: read.movements, syncedAt: new Date().toISOString() },
        });
        setSyncResult({
          feedback: movementsSyncFeedback({ status: 'ok', count: 0 }),
          detail: t('massas.erp.storeFailed'),
        });
      }
    },
    [aeroSettings.wsUrl, date, loadMirror, t],
  );

  const handleImportErpSeat = async (request: {
    entLan: number;
    operatorName: string;
    productCode: string;
    boxes: number;
    date: string;
  }) => {
    setImportingEntLan(request.entLan);
    const audit = {
      date: request.date,
      entLan: request.entLan,
      productCode: request.productCode,
      boxes: request.boxes,
    };
    try {
      await api.post(
        '/massas-launch',
        aeroImportPayload(
          { entLan: request.entLan, operatorName: request.operatorName },
          { productCode: request.productCode, boxes: request.boxes },
          request.date,
        ),
      );
      void postAeroAuditEvent(aeroImportAuditEvent(audit));
      setNotice({ type: 'success', message: t('massas.erp.imported') });
      await Promise.all([loadDay(date), loadMirror(date)]);
    } catch (err) {
      void postAeroAuditEvent(aeroImportAuditEvent({ ...audit, error: 'AERO_IMPORT_REFUSED' }));
      const known = err instanceof ApiClientError ? resolveApiErrorKey(err.status, err.message, err.code) : null;
      setNotice({
        type: 'error',
        message: known ? t(known) : t('massas.erp.importError'),
      });
    } finally {
      setImportingEntLan(null);
    }
  };

  const handleCreateOperator = async (row: MassasUnifiedRow) => {
    const entLan = row.entLans[0];
    setCreatingOperatorEntLan(entLan);
    try {
      const username = deriveUsername(row.operatorName);
      const display_name = deriveDisplayName(row.operatorName);
      const password = quickWorkerPassword(username);

      await api.post('/admin/users', {
        username,
        display_name,
        password,
        role_id: QUICK_WORKER_ROLE_ID,
      });

      setNotice({
        type: 'success',
        message: t('massas.unified.operatorCreated', 'Operário cadastrado com sucesso!'),
      });
      await Promise.all([loadDay(date), loadMirror(date)]);
    } catch (err) {
      const message =
        err instanceof ApiClientError && (err.status === 409 || err.message.includes('userAlreadyExists'))
          ? t('admin.workers.userAlreadyExists')
          : t('share.createServerError');
      setNotice({ type: 'error', message });
    } finally {
      setCreatingOperatorEntLan(null);
    }
  };

  const handleSyncManualResult = async (ok: boolean) => {
    await postAeroAuditEvent({
      event: 'launch_sync',
      phase: 'result',
      destinationUrl: aeroDestination() ?? aeroSettings.wsUrl ?? '',
      httpStatus: ok ? 200 : null,
      note: ok ? 'manual_confirmation:ok' : 'manual_confirmation:failed',
      error: ok ? null : 'manual_confirmation',
    });
    clearAeroQueue();
    setSyncAwaiting(null);
    setManualResult({ tone: ok ? 'success' : 'error', message: t('massas.aero.syncRecorded') });
  };

  // Editing handlers for today
  const startEditing = (launch: MassaIndividualLaunch) => {
    if (!isToday) return;
    setEditingLaunchId(launch.id);
    setEditingBoxes(String(launch.boxes));
  };

  const cancelEditing = () => {
    setEditingLaunchId(null);
    setEditingBoxes('');
  };

  const saveEditing = async (launchId: number) => {
    if (!isToday) return;
    const boxesNum = parseInt(editingBoxes, 10);
    if (!Number.isInteger(boxesNum) || boxesNum <= 0 || editingBusy) return;
    setEditingBusy(true);
    setNotice(null);
    try {
      await api.put(`/massas-launch/${launchId}`, { boxes: boxesNum });
      setEditingLaunchId(null);
      setEditingBoxes('');
      setNotice({ type: 'success', message: t('massas.updateSuccess') });
      await loadDay(date);
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : t('massas.updateError') });
    } finally {
      setEditingBusy(false);
    }
  };

  /** Pide confirmación; el borrado corre recién en el diálogo. */
  const handleDeleteLaunch = (launchId: number) => {
    if (!isToday) return;
    const launch = dayView?.launches.find((row) => row.id === launchId);
    setDeleteTarget({
      id: launchId,
      label: launch ? `${launch.product_name} · ${launch.boxes}` : formatDateLabel(date),
    });
  };

  /** Confirmado: borra, recarga el día y responde en su ventana. */
  const confirmDeleteLaunch = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    setDeletingLaunchId(target.id);
    try {
      await api.del(`/massas-launch/${target.id}`);
      setDeleteResult({ tone: 'success', message: t('massas.deleteSuccess') });
      await loadDay(date);
    } catch (err) {
      setDeleteResult({
        tone: 'error',
        message: err instanceof Error ? err.message : t('massas.deleteError'),
      });
    } finally {
      setDeletingLaunchId(null);
    }
  };

  // WhatsApp handlers
  const handleOpenWhatsApp = () => {
    if (!previewMessage) return;
    const formattedNumber = toWhatsAppNumber(phone);
    if (formattedNumber) {
      const link = waMeLink(formattedNumber, previewMessage);
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      void shareOrCopy(previewMessage);
    }
  };

  const bridgeWatchdog = useRef<number | null>(null);

  const disarmBridgeWatchdog = useCallback(() => {
    if (bridgeWatchdog.current === null) return;
    window.clearTimeout(bridgeWatchdog.current);
    bridgeWatchdog.current = null;
  }, []);

  const warnBridgeDidNotReturn = useCallback(() => {
    setSyncAwaiting(null);
    setNotice({ type: 'error', message: t('massas.aero.scriptableNoReturn') });
    clearAeroBridgePending();
    disarmBridgeWatchdog();
  }, [disarmBridgeWatchdog, t]);

  const armBridgeWatchdog = useCallback(() => {
    const queryString = location.search || window.location.search;
    if (parseAeroCallback(queryString)) return;
    const mark = readAeroBridgePending();
    disarmBridgeWatchdog();
    if (!mark) return;
    if (aeroBridgeMarkExpired(mark, Date.now())) {
      warnBridgeDidNotReturn();
      return;
    }
    const remaining = mark.at + AERO_BRIDGE_MARK_TTL_MS - Date.now();
    bridgeWatchdog.current = window.setTimeout(() => {
      bridgeWatchdog.current = null;
      if (!aeroBridgeMarkExpired(mark, Date.now())) return;
      warnBridgeDidNotReturn();
    }, Math.max(remaining, 0) + 250);
  }, [disarmBridgeWatchdog, warnBridgeDidNotReturn]);

  useEffect(() => {
    armBridgeWatchdog();
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      armBridgeWatchdog();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      disarmBridgeWatchdog();
    };
  }, [armBridgeWatchdog, disarmBridgeWatchdog]);

  /**
   * Shortcut callback return handler: verdict opens in MassasHistoryPage per Requirement 6.
   */
  useEffect(() => {
    if (aeroCallbackHandled.current) return;
    const queryString = location.search || window.location.search;
    if (!parseAeroCallback(queryString)) return;
    aeroCallbackHandled.current = true;
    void (async () => {
      const parsed = await resolveAeroCallback(queryString);
      if (!parsed) return;
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
      clearAeroBridgePending();
      disarmBridgeWatchdog();

      if (parsed.kind === 'error') {
        const attempt =
          loadAeroPendingAttempt('entrada_lote') ??
          loadAeroPendingAttempt('entrada') ??
          loadAeroPendingAttempt('movimentos');
        clearAeroPendingAttempt();
        if (attempt?.action !== 'movimentos') {
          const queue = readAeroQueue();
          if (queue && queue.inFlight.length > 0) {
            const restored = requeueInFlightAeroQueue(queue);
            writeAeroQueue(restored);
            setSyncAwaiting({ date: restored.date, remaining: restored.items.length });
          }
        }
        void postAeroAuditEvent({
          event: attempt?.action === 'movimentos' ? 'read_history' : 'launch_sync',
          phase: 'result',
          destinationUrl: aeroDestination() ?? aeroSettings.wsUrl ?? '',
          error: parsed.code,
          note: parsed.message ? `${parsed.message} · via=bridge` : 'via=bridge',
          ...(attempt ? { attemptId: attempt.attemptId, startedAt: attempt.startedAt } : {}),
          client: 'web',
        });
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
        return;
      }

      if (parsed.kind === 'bridge') {
        if (parsed.action === 'movimentos') {
          void handleMovementsCallback(parsed.data);
          return;
        }

        const isComposite =
          typeof parsed.data === 'object' &&
          parsed.data !== null &&
          !Array.isArray(parsed.data) &&
          'launch' in parsed.data;

        const launchData = isComposite
          ? (parsed.data as { launch: unknown; read?: unknown }).launch
          : parsed.data;
        const readData = isComposite
          ? (parsed.data as { launch: unknown; read?: unknown }).read
          : undefined;

        const hasValidRead =
          readData !== undefined && readAeroMovements(readData).status === 'ok';

        if (hasValidRead) {
          clearAeroAutoRead();
          void handleMovementsCallback(readData);
        }

        if (parsed.action === 'entrada_lote') {
          const attempt = loadAeroPendingAttempt('entrada_lote');
          clearAeroPendingAttempt();
          const pairing = attempt
            ? { attemptId: attempt.attemptId, startedAt: attempt.startedAt, client: 'web' as const }
            : { client: 'web' as const };
          const queue = readAeroQueue();
          const sent = queue?.inFlight ?? [];
          const expected = sent.length > 0 ? sent.length : Array.isArray(launchData) ? launchData.length : 1;
          const batch = readAeroBatchResult(launchData, expected);
          const destination = aeroDestination();

          void postAeroAuditEvent({
            event: 'launch_sync',
            phase: 'result',
            destinationUrl: destination ?? aeroSettings.wsUrl ?? '',
            httpStatus: batch.ok === batch.total ? 200 : null,
            response: `${batch.ok}/${batch.total} ok`,
            error: batch.failed > 0 ? batch.message ?? 'batch_item_failed' : null,
            note: `batch ok=${batch.ok} failed=${batch.failed} · via=bridge`,
            ...pairing,
          });

          const feedback = batchSyncFeedback(batch);

          if (!feedback) {
            const rest = queue
              ? {
                  ...queue,
                  items: [...(batch.ok === 1 ? sent.slice(1) : sent), ...queue.items],
                  inFlight: [],
                }
              : null;
            if (rest && rest.items.length > 0) {
              writeAeroQueue(rest);
              void triggerAeroSync(rest);
              return;
            }
            clearAeroQueue();
            setSyncAwaiting(null);
            if (batch.ok === 1 && !hasValidRead) armAeroAutoRead(date);
            setResultModal(
              batch.ok === 1
                ? { type: 'success', message: t('massas.aero.syncConfirmYes'), sentToErp: true }
                : { type: 'error', message: batch.message ?? t('massas.aero.syncConfirmNo') },
            );
            return;
          }

          const failedItems = batch.failedIndexes
            .map((index) => sent[index])
            .filter((item): item is NonNullable<typeof item> => item !== undefined);
          const retryItems =
            batch.state === 'complete' ? [] : batch.state === 'partial' ? failedItems : sent;
          const rest = queue ? { ...queue, items: [...retryItems, ...queue.items], inFlight: [] } : null;
          if (rest) writeAeroQueue(rest);
          else clearAeroQueue();
          setSyncAwaiting(rest && rest.items.length > 0 ? { date: rest.date, remaining: rest.items.length } : null);

          if (batch.ok > 0 && !rest?.items.length && !hasValidRead) armAeroAutoRead(date);
          setResultModal({
            type: feedback.tone === 'ok' ? 'success' : feedback.tone === 'warn' ? 'warn' : 'error',
            title: t(feedback.titleKey),
            message: t(feedback.messageKey, {
              ...feedback.params,
              count: feedback.count,
              date: queue?.date ?? '',
              detail: batch.message ?? t('massas.erp.batchNoDetail'),
            }),
            sentToErp: batch.ok > 0,
            retryCount: batch.state === 'complete' ? undefined : batch.failed,
          });
          return;
        }

        const outcome = readAeroBridgeResult(launchData);
        const attempt = parsed.action === 'entrada' ? loadAeroPendingAttempt('entrada') : null;
        clearAeroPendingAttempt();
        const pairing = attempt
          ? { attemptId: attempt.attemptId, startedAt: attempt.startedAt, client: 'web' as const }
          : { client: 'web' as const };
        void postAeroAuditEvent({
          event: 'launch_sync',
          phase: 'result',
          destinationUrl: aeroDestination() ?? aeroSettings.wsUrl ?? '',
          httpStatus: outcome.status === 'ok' ? 200 : null,
          response: outcome.message,
          error: outcome.status === 'error' ? outcome.message ?? 'bridge_unreadable' : null,
          note: `action=${parsed.action} · via=bridge`,
          ...pairing,
        });

        if (parsed.action !== 'entrada') return;

        const queue = readAeroQueue();
        if (outcome.status === 'ok' && queue) {
          const rest = { ...queue, inFlight: [] };
          if (rest.items.length > 0) {
            writeAeroQueue(rest);
            void triggerAeroSync(rest);
            return;
          }
        }

        const refused = outcome.status !== 'ok' && queue ? requeueInFlightAeroQueue(queue) : null;
        if (refused && refused.items.length > 0) {
          writeAeroQueue(refused);
          setSyncAwaiting({ date: refused.date, remaining: refused.items.length });
        } else {
          clearAeroQueue();
          setSyncAwaiting(null);
        }

        if (outcome.status === 'ok' && !hasValidRead) armAeroAutoRead(date);
        setResultModal({
          type: outcome.status === 'ok' ? 'success' : 'error',
          title: outcome.status === 'ok' ? t('massas.successTitle') : t('massas.errorTitle'),
          message: outcome.message || (outcome.status === 'ok' ? t('massas.aero.syncConfirmYes') : t('massas.aero.syncConfirmNo')),
          sentToErp: outcome.status === 'ok',
          retryCount: outcome.status === 'ok' ? undefined : 1,
        });
      }
    })();
  }, [aeroDestination, aeroSettings.wsUrl, date, disarmBridgeWatchdog, handleMovementsCallback, t, triggerAeroSync]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (aeroCallbackHandled.current) return;
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

  const unifiedRows = useMemo<MassasUnifiedRow[]>(
    () =>
      massasUnifiedRows({
        launches: dayView?.launches ?? [],
        movements: mirror.snapshot?.movements ?? [],
        products: dayView?.products ?? [],
        ackedLaunchIds,
      }),
    [dayView, mirror.snapshot, ackedLaunchIds],
  );

  // El día tiene algo que mandar sólo si hay lanzamientos o asientos del espejo: con el día vacío la vista previa
  // queda en blanco y el bloque se dibuja igual, como en el histórico de Salidas.
  const hasShareableData = Boolean(dayView && (dayView.launches.length > 0 || unifiedRows.length > 0));

  const previewMessage = useMemo(() => {
    if (!dayView || !hasShareableData) return '';
    return massasMessage(dayView, unifiedRows);
  }, [dayView, unifiedRows, hasShareableData]);

  const closeResultModal = () => {
    setResultModal(null);
    if (!consumeAeroAutoRead(date)) return;
    void handleSyncFromErp();
  };

  const handleToggleAck = (row: MassasUnifiedRow) => {
    if (!canManagePendingRow(row, { userId: user?.id, isAdmin: user?.role === 'Administrador' })) {
      setNotice({ type: 'error', message: t('massas.unified.notOwner') });
      return;
    }
    const launchId = row.launchIds[0];
    if (launchId === undefined) return;
    setAckedLaunchIds(toggleAckedLaunchId(date, launchId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-12 sm:space-y-6">
      {/* El pasado no sincroniza: el aviso de dispositivo sólo tiene sentido en el día de hoy. */}
      {aeroAllowed && deviceLimited && isToday && <AeroDeviceBanner device={device} />}

      {/* Header and Cross link back to today's launch */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('massas.historyTitle')}</h1>
            <div className="shrink-0">
              <ModuleHelpModal
                title={t('moduleHelp.massasHistory.title')}
                subtitle={t('moduleHelp.massasHistory.subtitle')}
                description={t('moduleHelp.massasHistory.description')}
                sections={t('moduleHelp.massasHistory.sections', { returnObjects: true }) as any}
              />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-1">{t('massas.historySubtitle')}</p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link
            to="/massas-launch"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-10"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">{t('massas.todayShort')}</span>
            <span className="hidden sm:inline">{t('massas.backToToday')}</span>
          </Link>
        </div>
      </div>

      <MessageDialog
        open={Boolean(notice || error) && !deleteTarget && !manualResult && !deleteResult && !resultModal}
        tone={notice?.type ?? 'error'}
        message={notice?.message ?? error}
        onClose={() => {
          if (notice) setNotice(null);
          else setError('');
        }}
        testId="massas-history-feedback"
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteLaunch()}
        title={t('massas.deleteLaunchTitle', 'Excluir o lançamento de {{what}}?', {
          what: deleteTarget?.label ?? '',
        })}
        panelTestId="massas-delete-confirm"
      />
      <MassasManualSyncResult result={manualResult} onClose={() => setManualResult(null)} />
      <MessageDialog
        open={deleteResult !== null}
        tone={deleteResult?.tone ?? 'success'}
        message={deleteResult?.message ?? ''}
        onClose={() => setDeleteResult(null)}
        testId="massas-delete-result"
      />

      {/* History Day Panel: accepts up to today */}
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <HistoryDayPanel
          id="massas-history-date"
          label={t('massas.date')}
          value={date}
          onChange={setDate}
          min={saoPauloDaysAgo(30)}
          max={today}
          testIdPrefix="massas-history"
          groupLabel={t('massas.historyDaysLabel')}
          days={dayChips}
          failed={days.failed}
          failedMessage={t('massas.historyDaysUnavailable')}
        />

        {/* ERP Sync button for today (Item 5), or Read-Only line for past days (Item 7) */}
        {aeroAllowed && isToday && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100" data-testid="massas-sync-header">
            <button
              type="button"
              onClick={handleSyncFromErp}
              disabled={mirror.loading || !aeroSettingsReady(aeroSettings) || deviceLimited}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              data-testid="massas-sync-erp"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${mirror.loading ? 'animate-spin' : ''}`} />
              {t('massas.syncHeader.action', 'Sincronizar com ERP')}
            </button>
            <span className="text-xs text-gray-500" data-testid="massas-last-sync">
              {t('massas.syncHeader.lastSync', 'Último sync')}:{' '}
              <span className="font-semibold tabular-nums text-gray-700">
                {lastSyncLabel(mirror.snapshot?.syncedAt ?? null)}
              </span>
            </span>
          </div>
        )}

        {/* El pasado no lleva nota: debajo del selector queda sólo el mensaje que se comparte, como en Android. */}
      </div>

      {/* Fallback confirmation if shortcut never returned */}
      {isToday && aeroAllowed && syncAwaiting && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">{t('massas.aero.syncConfirmTitle')}</p>
            <p className="text-xs text-amber-800 mt-0.5">
              {t('massas.aero.syncConfirmHint')}
              {syncAwaiting.remaining > 0 && ` · ${syncAwaiting.remaining}`}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={() => void handleSyncManualResult(true)}
              className="min-h-[44px] w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold"
            >
              {t('massas.aero.syncConfirmYes')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSyncManualResult(false)}
              variant="outline"
              className="min-h-[44px] w-full sm:w-auto font-semibold text-red-700"
            >
              {t('massas.aero.syncConfirmNo')}
            </Button>
          </div>
        </div>
      )}

      {/* Empty day placeholder when there are neither local launches nor ERP seats */}
      {isToday && dayView && dayView.launches.length === 0 && unifiedRows.length === 0 && (
        <div
          data-testid="massas-history-empty"
          className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm"
        >
          {t('massas.historyEmptyDay', 'No hay lanzamientos registrados en ese día.')}
        </div>
      )}

      {/* Cards: Produção do dia, Lançamentos Individuais, Resumo Coletivo */}
      {isToday && dayView && (dayView.launches.length > 0 || unifiedRows.length > 0) && (
        <MassasCollectiveTable
          products={dayView.products}
          launches={dayView.launches}
          currentUserId={user?.id}
          isAdmin={user?.role === 'Administrador'}
          readOnly={isPastDay}
          editingLaunchId={isToday ? editingLaunchId : null}
          editingBoxes={editingBoxes}
          editingBusy={editingBusy}
          onStartEdit={isToday ? startEditing : undefined}
          onCancelEdit={isToday ? cancelEditing : undefined}
          onSaveEdit={isToday ? saveEditing : undefined}
          onEditBoxesChange={isToday ? setEditingBoxes : undefined}
          onDelete={isToday ? handleDeleteLaunch : undefined}
          deletingId={isToday ? deletingLaunchId : null}
          unifiedRows={unifiedRows}
          unifiedDate={date}
          canSync={aeroAllowed && aeroSettingsReady(aeroSettings)}
          deviceLimited={deviceLimited}
          onSendToErp={isToday ? handleSendPendingLaunch : undefined}
          onImport={isToday ? ((request) => void handleImportErpSeat(request)) : undefined}
          importingEntLan={isToday ? importingEntLan : null}
          onCreateOperator={isToday ? ((row) => void handleCreateOperator(row)) : undefined}
          creatingOperatorEntLan={isToday ? creatingOperatorEntLan : null}
          onToggleAck={isToday ? handleToggleAck : undefined}
        />
      )}

      {/* WhatsApp Share Block (Item 2) */}
      <MassasWhatsAppShare
        phone={phone}
        onPhoneChange={setPhone}
        previewMessage={previewMessage}
        onOpenWhatsApp={handleOpenWhatsApp}
        disabled={!hasShareableData}
      />

      {/* ERP Movements Sync Result Dialog: de una acción, y en el pasado no hay acciones. */}
      {isToday && (
      <AeroResultDialog
        open={syncResult !== null}
        tone={syncResult?.feedback.tone ?? 'ok'}
        title={t(syncResult?.feedback.titleKey ?? 'massas.erp.syncOkTitle')}
        message={t(syncResult?.feedback.messageKey ?? 'massas.erp.syncError', {
          count: syncResult?.feedback.count ?? 0,
          date: formatDateLabel(date),
        })}
        hint={syncResult?.detail ?? null}
        onClose={() => setSyncResult(null)}
        testId="aero-sync-result-modal"
      />
      )}

      {/* Launch verdict dialog returned from Scriptable to /massas-history (Requirement 6) */}
      {resultModal && (
        <Dialog
          open={resultModal !== null}
          onClose={closeResultModal}
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
            {launchMirrorHint(resultModal) && (
              <p
                className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900"
                data-testid="massa-result-mirror-hint"
              >
                {t('massas.erp.mirrorHint')}
              </p>
            )}
            <div className="space-y-2 pt-2">
              {resultModal.retryCount ? (
                <Button
                  onClick={retryFailedLaunches}
                  className="min-h-[44px] w-full bg-amber-600 font-semibold text-white hover:bg-amber-700"
                  data-testid="massa-result-retry"
                >
                  {t('massas.erp.batchRetry', { count: resultModal.retryCount })}
                </Button>
              ) : null}
              <Button
                onClick={closeResultModal}
                className={`min-h-[44px] w-full font-semibold ${
                  resultModal.type === 'success'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : resultModal.type === 'warn'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
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
