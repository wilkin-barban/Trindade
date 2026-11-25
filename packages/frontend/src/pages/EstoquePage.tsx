import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { MessageDialog } from '../components/ui/message-dialog';
import { Dialog } from '../components/ui/dialog';
import { formatDateLabel, saoPauloToday } from '../lib/date';
import {
  aeroEndpoint,
  aeroSettingsReady,
  buildAeroMovementsSnapshot,
  readAeroMovements,
  resolveAeroCallback,
  type AeroSettings,
} from '../lib/aero-integration';
import { fetchAeroVaultSettings } from '../lib/aero-vault';
import {
  lastSyncLabel,
  readAeroMovementsSnapshot,
  triggerAeroMovementsSync,
  type AeroMovementSnapshot,
} from '../lib/aero-mirror';
import {
  aeroAttemptHeaders,
  newAeroAttempt,
  postAeroAuditEvent,
} from '../lib/aero-audit';
import {
  clearAeroPendingAttempt,
  loadAeroPendingAttempt,
  saveAeroPendingAttempt,
} from '../lib/aero-pending-attempt';
import type { StockDay, StockProduct } from '../lib/stock';

const ESTOQUE_MOVEMENTS_ATTEMPT_KEY = 'trindade.aero.estoque-movimentos-attempt.v1';
const estoqueMovementsStorage = {
  getItem: () => {
    try {
      return localStorage.getItem(ESTOQUE_MOVEMENTS_ATTEMPT_KEY);
    } catch {
      return null;
    }
  },
  setItem: (_key: string, value: string) => {
    try {
      localStorage.setItem(ESTOQUE_MOVEMENTS_ATTEMPT_KEY, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: () => {
    try {
      localStorage.removeItem(ESTOQUE_MOVEMENTS_ATTEMPT_KEY);
    } catch {
      /* ignore */
    }
  },
};

interface MessageDialogState {
  tone: 'error' | 'success';
  title?: string;
  message: string;
}

interface SuggestionState {
  title: string;
  message: string;
}

/**
 * El módulo es de administradores y de nadie más.
 *
 * El guard vive aquí, fuera de la pantalla, para que la pantalla pueda llamar sus hooks siempre en el mismo
 * orden: un `return` temprano entre los hooks rompe React si el rol llegara a cambiar con la pantalla montada.
 */
export function EstoquePage() {
  const { user } = useAuth();
  if (user?.role !== 'Administrador') {
    return <Navigate to="/dashboard" replace />;
  }
  return <EstoqueScreen />;
}

function EstoqueScreen() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const today = useMemo(() => saoPauloToday(), []);
  const todayLabel = useMemo(() => formatDateLabel(today), [today]);

  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<StockDay | null>(null);
  const [snapshot, setSnapshot] = useState<AeroMovementSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncStarting = useRef(false);
  const processingCallback = useRef(false);

  // Absolute rule: all outcome messages travel via MessageDialog; no loose alerts in body
  const [dialogState, setDialogState] = useState<MessageDialogState | null>(null);
  // A suggestion is not an accomplished action: it opens the neutral dialog, never the green check of a success.
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [stockRes, mirrorRes] = await Promise.all([
        api.get<StockDay>(`/stock?date=${today}`),
        api.get<unknown>(`/integration/aero/movements?date=${today}`).catch(() => null),
      ]);
      setStock(stockRes);
      const read = readAeroMovementsSnapshot(mirrorRes);
      // Un espejo de otro día no es el saldo de hoy: se trata como no sincronizado en vez de restar días distintos.
      setSnapshot(read && read.date === today ? read : null);
    } catch {
      setDialogState({
        tone: 'error',
        title: t('ui.actionFailed'),
        message: t('estoque.loadError'),
      });
    } finally {
      setLoading(false);
    }
  }, [today, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle return from Scriptable bridge
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hasBridgeParam = params.has('aero_action') || params.has('aero_error') || params.has('aero_result');
    if (!hasBridgeParam || processingCallback.current) return;

    processingCallback.current = true;
    void (async () => {
      try {
        const callback = await resolveAeroCallback(location.search);
        if (!callback) {
          navigate('/estoque', { replace: true });
          return;
        }

        const vault = await fetchAeroVaultSettings().catch(() => null);
        const destinationUrl = vault?.wsUrl
          ? aeroEndpoint(vault.wsUrl, 'movimentoitem')
          : '/api/movimentoitem';

        if (callback.kind === 'bridge' && callback.action === 'movimentos') {
          const attempt = loadAeroPendingAttempt('movimentos', estoqueMovementsStorage);
          clearAeroPendingAttempt(estoqueMovementsStorage, 'movimentos');

          const read = readAeroMovements(callback.data);
          if (read.status === 'error') {
            void postAeroAuditEvent({
              event: 'read_history',
              phase: 'result',
              destinationUrl,
              attemptId: attempt?.attemptId,
              startedAt: attempt?.startedAt,
              error: read.message || 'movements_unreadable',
              note: `date=${today} · via=bridge`,
            });
            setDialogState({
              tone: 'error',
              title: t('ui.actionFailed'),
              message: read.message || t('estoque.erpCheckError'),
            });
          } else {
            try {
              await api.post(
                '/integration/aero/movements',
                buildAeroMovementsSnapshot(today, read.movements),
                { headers: aeroAttemptHeaders(attempt) },
              );
              void postAeroAuditEvent({
                event: 'read_history',
                phase: 'result',
                destinationUrl,
                attemptId: attempt?.attemptId,
                startedAt: attempt?.startedAt,
                note: `date=${today} · movements=${read.movements.length} · via=bridge`,
              });
              setDialogState({
                tone: 'success',
                title: t('ui.actionDone'),
                message: t('estoque.erpSyncSuccess', { count: read.movements.length }),
              });
              await loadData();
            } catch {
              void postAeroAuditEvent({
                event: 'read_history',
                phase: 'result',
                destinationUrl,
                attemptId: attempt?.attemptId,
                startedAt: attempt?.startedAt,
                error: 'snapshot_store_failed',
                note: `date=${today} · via=bridge`,
              });
              setDialogState({
                tone: 'error',
                title: t('ui.actionFailed'),
                message: t('estoque.erpSyncSaveFailed'),
              });
            }
          }
        } else if (callback.kind === 'error') {
          const attempt = loadAeroPendingAttempt('movimentos', estoqueMovementsStorage);
          clearAeroPendingAttempt(estoqueMovementsStorage, 'movimentos');
          void postAeroAuditEvent({
            event: 'read_history',
            phase: 'result',
            destinationUrl,
            attemptId: attempt?.attemptId,
            startedAt: attempt?.startedAt,
            error: callback.code || 'bridge_error',
            note: callback.message || `date=${today} · via=bridge`,
          });
          setDialogState({
            tone: 'error',
            title: t('ui.actionFailed'),
            message: callback.message || t('estoque.erpCheckError'),
          });
        }
      } finally {
        navigate('/estoque', { replace: true });
        processingCallback.current = false;
      }
    })();
  }, [location.search, navigate, today, t, loadData]);

  const handleSyncErp = useCallback(async () => {
    if (syncing || syncStarting.current) return;
    syncStarting.current = true;
    setSyncing(true);

    let armedAttempt: { action: 'movimentos'; attemptId: string; startedAt: number; date: string } | null = null;
    let wsDestination = '/api/movimentoitem';

    try {
      const vault = await fetchAeroVaultSettings();
      if (!vault.configured) {
        setDialogState({
          tone: 'error',
          title: t('ui.actionFailed'),
          message: t('estoque.erpSyncUnavailable'),
        });
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
        setDialogState({
          tone: 'error',
          title: t('ui.actionFailed'),
          message: t('estoque.erpSyncUnavailable'),
        });
        return;
      }

      wsDestination = aeroEndpoint(settings.wsUrl, 'movimentoitem');
      const attempt = { action: 'movimentos' as const, ...newAeroAttempt(), date: today };
      armedAttempt = attempt;
      saveAeroPendingAttempt(attempt, estoqueMovementsStorage);

      void postAeroAuditEvent({
        event: 'read_history',
        phase: 'requested',
        destinationUrl: wsDestination,
        attemptId: attempt.attemptId,
        startedAt: attempt.startedAt,
        note: `date=${today} · via=bridge`,
      });

      const fired = await triggerAeroMovementsSync(settings, {
        date: today,
        callbackPath: '/estoque',
        includeExits: false,
      });

      if (!fired) {
        clearAeroPendingAttempt(estoqueMovementsStorage, 'movimentos');
        void postAeroAuditEvent({
          event: 'read_history',
          phase: 'result',
          destinationUrl: wsDestination,
          attemptId: attempt.attemptId,
          startedAt: attempt.startedAt,
          error: 'bridge_not_started',
          note: `date=${today} · via=bridge`,
        });
        setDialogState({
          tone: 'error',
          title: t('ui.actionFailed'),
          message: t('estoque.erpCheckError'),
        });
      }
    } catch {
      if (armedAttempt) {
        clearAeroPendingAttempt(estoqueMovementsStorage, 'movimentos');
        void postAeroAuditEvent({
          event: 'read_history',
          phase: 'result',
          destinationUrl: wsDestination,
          attemptId: armedAttempt.attemptId,
          startedAt: armedAttempt.startedAt,
          error: 'bridge_not_started',
          note: `date=${today} · via=bridge`,
        });
      }
      setDialogState({
        tone: 'error',
        title: t('ui.actionFailed'),
        message: t('estoque.erpCheckError'),
      });
    } finally {
      syncStarting.current = false;
      setSyncing(false);
    }
  }, [syncing, today, t]);

  const handleSuggestAction = (
    product: StockProduct,
    type: 'entrada' | 'saida',
    delta: number,
    erpVal: number,
  ) => {
    const isEntrada = type === 'entrada';
    const absDelta = Math.abs(delta);
    const message = isEntrada
      ? `${t('estoque.suggestionEntradaMessage', {
          physical: product.units,
          erp: erpVal,
          delta: absDelta,
        })}\n\n${t('estoque.suggestionNotice')}`
      : `${t('estoque.suggestionSaidaMessage', {
          physical: product.units,
          erp: erpVal,
          delta: absDelta,
        })}\n\n${t('estoque.suggestionNotice')}`

    setSuggestion({ title: isEntrada ? t('estoque.suggestEntradaTitle') : t('estoque.suggestSaidaTitle'), message });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header with read-only São Paulo date badge */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{t('estoque.title')}</h1>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                {t('estoque.todayBadge', { date: todayLabel })}
              </span>
            </div>
            {snapshot?.syncedAt && (
              <p className="mt-1 text-xs text-gray-500">
                {t('estoque.lastSync', { time: lastSyncLabel(snapshot.syncedAt) })}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadData()}
              disabled={loading}
              className="min-h-[44px] px-3 text-xs"
              aria-label={t('estoque.refresh')}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              type="button"
              variant="default"
              data-testid="estoque-sync-erp"
              onClick={() => void handleSyncErp()}
              disabled={syncing}
              className="min-h-[44px] flex-1 sm:flex-initial text-xs sm:text-sm font-medium"
            >
              {syncing ? t('estoque.syncing') : t('estoque.syncErp')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main content: Mobile-first product cards */}
      <main className="max-w-3xl mx-auto px-4 pt-6 sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-4">
            {stock?.products.map((product) => {
              // ERP metric per product: net ERP day movement for the product code = sum of quantity for 'E' minus sum for 'S'.
              // Compare codes with code.replace(/^0+/, '') on both sides, because the ERP pads with zeros.
              // If the mirror was never synced (readAeroMovementsSnapshot returns null or the day has no snapshot),
              // the ERP metric renders as a pending state, not as zero.
              const normalizedCode = product.code.replace(/^0+/, '');
              const hasMirror = snapshot !== null;

              let erpUnits: number | null = null;
              if (hasMirror) {
                const matches = snapshot.movements.filter(
                  (m) => m.productCode.replace(/^0+/, '') === normalizedCode,
                );
                erpUnits = matches.reduce((sum, m) => {
                  return sum + (m.movementType === 'E' ? m.quantity : -m.quantity);
                }, 0);
              }

              const delta = erpUnits !== null ? product.units - erpUnits : null;

              return (
                <div
                  key={product.code}
                  data-testid={`estoque-card-${product.code}`}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                >
                  {/* Product title and tags */}
                  <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-gray-900 truncate">
                        {product.name}
                      </h2>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                        <span>#{product.code}</span>
                        <span>•</span>
                        <span>{product.category}</span>
                      </div>
                    </div>

                    {/* Delta status badge */}
                    {delta !== null ? (
                      <span
                        data-testid={`delta-badge-${product.code}`}
                        className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${
                          delta === 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : delta > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta} {t('estoque.unitsLabel')}
                      </span>
                    ) : (
                      <span
                        data-testid={`delta-badge-${product.code}`}
                        className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                      >
                        —
                      </span>
                    )}
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-3 pt-3">
                    <div className="rounded-lg bg-gray-50 p-2.5">
                      <div className="text-xs text-gray-500 font-medium">
                        {t('estoque.physical')}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {product.boxes} {t('estoque.boxesLabel')} · {product.units}{' '}
                        {t('estoque.unitsLabel')}
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-2.5">
                      <div className="text-xs text-gray-500 font-medium">
                        {t('estoque.erp')}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {erpUnits !== null ? (
                          `${erpUnits} ${t('estoque.unitsLabel')}`
                        ) : (
                          <span className="text-gray-400 font-normal">
                            {t('estoque.pendingSync')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Suggestion action button: 44px touch floor */}
                  {delta !== null && delta !== 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end">
                      {delta > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleSuggestAction(product, 'entrada', delta, erpUnits ?? 0)}
                          className="min-h-[44px] w-full sm:w-auto px-4 text-xs font-medium text-amber-900 border-amber-300 bg-amber-50 hover:bg-amber-100"
                        >
                          {t('estoque.suggestEntrada')}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleSuggestAction(product, 'saida', delta, erpUnits ?? 0)}
                          className="min-h-[44px] w-full sm:w-auto px-4 text-xs font-medium text-red-900 border-red-300 bg-red-50 hover:bg-red-100"
                        >
                          {t('estoque.suggestSaida')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Outcome modal — strictly via MessageDialog, zero loose text in body */}
      <MessageDialog
        open={dialogState !== null}
        tone={dialogState?.tone}
        title={dialogState?.title}
        message={dialogState?.message ?? ''}
        onClose={() => setDialogState(null)}
        testId="estoque-message"
      />

      {/* La sugerencia de cuadre no es una acción cumplida: se explica en la ventana neutra, no con un tilde verde. */}
      <Dialog
        open={suggestion !== null}
        onClose={() => setSuggestion(null)}
        labelledBy="estoque-suggestion-title"
        panelTestId="estoque-suggestion"
      >
        <div className="w-full max-w-sm space-y-4 p-6">
          <h2 id="estoque-suggestion-title" className="text-lg font-bold text-gray-900">
            {suggestion?.title}
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{suggestion?.message}</p>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSuggestion(null)}
              className="min-h-[44px] px-4 text-xs font-semibold"
              data-testid="estoque-suggestion-close"
            >
              {t('ui.close')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
