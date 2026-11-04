import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Edit2, Trash2, Check, X, ShieldAlert, ShieldCheck } from 'lucide-react';
import { MassasUnifiedTable } from './MassasUnifiedTable';
import {
  massasUnifiedOperators,
  massasUnifiedRows,
  massasUnifiedSummary,
  type AeroImportRequest,
  type MassasUnifiedRow,
} from '../../lib/massas-unified';
import type { MassaProductTotal, MassaIndividualLaunch } from '../../lib/massas';

interface MassasCollectiveTableProps {
  products: MassaProductTotal[];
  launches: MassaIndividualLaunch[];
  currentUserId?: number;
  /** When true, the user can edit or delete any launch regardless of who created it. */
  isAdmin?: boolean;
  /**
   * Editing is optional on purpose: the history screen reads past days and has nothing to edit, so it
   * passes none of these instead of inventing handlers that can never fire.
   */
  editingLaunchId?: number | null;
  editingBoxes?: string;
  editingBusy?: boolean;
  onStartEdit?: (launch: MassaIndividualLaunch) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (launchId: number) => void;
  onEditBoxesChange?: (val: string) => void;
  onDelete?: (launchId: number) => void;
  deletingId?: number | null;
  readOnly?: boolean;
  /**
   * The plant's day already reconciled, one row per box. Both lower sections read it, so a seat that only
   * exists in the ERP has a worker, boxes and a place in the collective summary.
   */
  unifiedRows?: MassasUnifiedRow[];
  unifiedDate?: string;
  canSync?: boolean;
  /** Set on a system where the integration cannot run; the actions render disabled instead of vanishing. */
  deviceLimited?: boolean;
  onSendToErp?: (row: MassasUnifiedRow) => void;
  onImport?: (request: AeroImportRequest) => void;
  importingEntLan?: number | null;
  onCreateOperator?: (row: MassasUnifiedRow) => void;
  creatingOperatorEntLan?: number | null;
  onToggleAck?: (row: MassasUnifiedRow) => void;
}

export function MassasCollectiveTable({
  products,
  launches,
  currentUserId,
  isAdmin = false,
  editingLaunchId = null,
  editingBoxes = '',
  editingBusy = false,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditBoxesChange,
  onDelete,
  deletingId = null,
  readOnly = false,
  unifiedRows,
  unifiedDate = '',
  canSync = false,
  deviceLimited = false,
  onSendToErp,
  onImport,
  importingEntLan = null,
  onCreateOperator,
  creatingOperatorEntLan = null,
  onToggleAck,
}: MassasCollectiveTableProps) {
  const { t } = useTranslation();
  const [selectedOperatorKey, setSelectedOperatorKey] = useState('all');

  /**
   * The day both sections read.
   *
   * The launch screen already reconciles the mirror and passes the rows; the history screen may have only the
   * past launches, so the same projection runs over them with an empty ERP side. One shape for both.
   */
  const rows = useMemo<MassasUnifiedRow[]>(() => {
    if (unifiedRows) return unifiedRows;
    return massasUnifiedRows({ launches, movements: [], products });
  }, [unifiedRows, launches, products]);

  // The filter is the normalised name, not `user_id`: a worker who only typed on the company tablet has no
  // account here, and their boxes still belong in both sections.
  const operators = useMemo(() => massasUnifiedOperators(rows), [rows]);

  useEffect(() => {
    if (selectedOperatorKey !== 'all' && !operators.some((operator) => operator.key === selectedOperatorKey)) {
      setSelectedOperatorKey('all');
    }
  }, [operators, selectedOperatorKey]);

  const displayedRows = useMemo(() => {
    return selectedOperatorKey === 'all'
      ? rows
      : rows.filter((row) => row.operatorKey === selectedOperatorKey);
  }, [rows, selectedOperatorKey]);

  /**
   * The collective summary of what is on screen.
   *
   * One rounding per product, from the exact units of every row: two partial lines of the same product are one
   * open box, never two. The worker subtotal adds the products' boxes because each product has its own box.
   */
  const summary = useMemo(() => massasUnifiedSummary(displayedRows), [displayedRows]);

  const workerSubtotal = useMemo(() => {
    if (selectedOperatorKey === 'all') return null;
    return summary.workers.find((worker) => worker.key === selectedOperatorKey) ?? null;
  }, [summary, selectedOperatorKey]);

  const selectedOperatorName = useMemo(() => {
    if (selectedOperatorKey === 'all') return '';
    return operators.find((operator) => operator.key === selectedOperatorKey)?.name || '';
  }, [operators, selectedOperatorKey]);

  const activeProducts = useMemo<MassaProductTotal[]>(() => {
    return summary.products.map((product) => ({
      code: product.code,
      name: product.name,
      unitsPerBox: product.unitsPerBox,
      totalBoxes: product.totalBoxes,
      totalUnits: product.totalUnits,
      openBoxUnits: product.openBoxUnits,
    }));
  }, [summary]);

  const workersByProduct = summary.workerNamesByProduct;

  return (
    <div className="space-y-6">
      {unifiedRows && (
        <Card className="border-gray-200 shadow-sm" data-testid="massas-unified-card">
          <CardContent className="pt-6">
            <MassasUnifiedTable
              rows={unifiedRows}
              date={unifiedDate}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              canSync={canSync}
              deviceLimited={deviceLimited}
              onSendToErp={onSendToErp}
              onImport={onImport}
              importingEntLan={importingEntLan}
              onCreateOperator={onCreateOperator}
              creatingOperatorEntLan={creatingOperatorEntLan}
              onToggleAck={onToggleAck}
            />
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
      {/* Desglose Individual de Lanzamientos por Operario con RBAC */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('massas.userLaunchesTitle')}</h2>
            <p className="text-xs text-gray-500">{t('massas.userLaunchesSubtitle')}</p>
          </div>

          {/* Filtro por Trabajador */}
          {operators.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5" data-testid="massas-worker-chips">
                <button
                  type="button"
                  onClick={() => setSelectedOperatorKey('all')}
                  className={`min-h-[44px] px-3.5 py-1 text-xs rounded-full border transition-all sm:min-h-0 ${
                    selectedOperatorKey === 'all'
                      ? 'bg-amber-600 text-white border-amber-600 font-semibold shadow-xs'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                  data-testid="filter-operator-all"
                >
                  {t('massas.allWorkers', 'Todos os trabalhadores')}
                </button>
                {operators.map((op) => (
                  <button
                    key={op.key}
                    type="button"
                    onClick={() => setSelectedOperatorKey(op.key)}
                    className={`min-h-[44px] px-3.5 py-1 text-xs rounded-full border transition-all sm:min-h-0 ${
                      selectedOperatorKey === op.key
                        ? 'bg-amber-600 text-white border-amber-600 font-semibold shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                    data-testid={`filter-operator-${op.key}`}
                  >
                    👤 {op.name}
                  </button>
                ))}
              </div>

              {/* Subtotal del trabajador seleccionado */}
              {workerSubtotal && (
                <div
                  className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs sm:text-sm"
                  data-testid="massas-worker-subtotal"
                >
                  <span className="text-gray-800">
                    {t('massas.workerSubtotal', 'Subtotal de')} <strong>{selectedOperatorName}</strong>:
                  </span>
                  <span className="font-bold text-amber-900">
                    {workerSubtotal.boxes} cx ({workerSubtotal.units} un)
                  </span>
                </div>
              )}
            </div>
          )}

          {displayedRows.length === 0 ? (
            <div className="py-8 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-sm">
              {t('massas.noLaunches')}
            </div>
          ) : (
            <div className="space-y-2.5" data-testid="massas-individual-launches">
              {displayedRows.map((row) => {
                const launch =
                  row.launchIds.length > 0
                    ? launches.find((candidate) => row.launchIds.includes(candidate.id))
                    : undefined;
                const reconciled = row.state === 'reconciled';

                // A seat nobody launched here is the ERP's record: it reads, it does not get edited or
                // imported from this section. The unified card above owns the actions that belong to the seat.
                if (!launch) {
                  return (
                    <div
                      key={row.key}
                      data-testid={`massas-individual-row-${row.key}`}
                      className="p-3.5 rounded-lg border border-sky-200 bg-sky-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm break-words min-w-0">
                            {row.productName}
                          </span>
                          <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">
                            {t('massas.unified.stateErpOnly')}
                          </span>
                          <span className="text-[11px] text-gray-500">{t('massas.erpOnlyReadOnly')}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                          <span>
                            {t('massas.user')}: <strong className="text-gray-700">{row.operatorName}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <span className="text-sm font-bold text-gray-900">{row.boxes} cx</span>
                        <span className="text-xs text-gray-400 mx-1">·</span>
                        <span className="text-sm font-bold text-amber-800">{row.units} un</span>
                        {row.openBoxUnits > 0 && (
                          <p className="text-[11px] text-amber-700" data-testid={`massas-open-box-${row.key}`}>
                            {t('massas.unified.openBox')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }

                const isOwner = currentUserId === launch.user_id;
                // Conciliado manda sobre el rol: ni el administrador edita lo que el ERP ya asentó.
                const canManage = (isOwner || isAdmin) && !reconciled;
                const isEditing = editingLaunchId === launch.id;

                return (
                  <div
                    key={row.key}
                    data-testid={`massas-individual-row-${row.key}`}
                    className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      canManage ? 'bg-amber-50/40 border-amber-200' : 'bg-gray-50/60 border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm break-words min-w-0">{row.productName}</span>
                        <span className="text-[11px] text-gray-500 shrink-0">#{launch.id}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                        <span>
                          {t('massas.user')}: <strong className="text-gray-700">{launch.display_name || launch.username}</strong>
                        </span>
                        <span>·</span>
                        <span>
                          {new Date(launch.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Cantidades y Acciones táctiles sin encimarse en móviles */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200/60">
                      {isEditing ? (
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={editingBoxes}
                            onChange={(e) => onEditBoxesChange?.(e.target.value)}
                            className="h-9 w-20 text-center font-bold"
                          />
                          <span className="text-xs text-gray-500">cx</span>
                          <Button
                            size="sm"
                            onClick={() => onSaveEdit?.(launch.id)}
                            disabled={editingBusy || !editingBoxes || parseInt(editingBoxes, 10) <= 0}
                            className="h-9 px-3 bg-green-600 hover:bg-green-700 text-white"
                            title={t('massas.save')}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onCancelEdit?.()}
                            className="h-9 px-3"
                            title={t('massas.cancel')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="text-left sm:text-right">
                            <span className="text-sm font-bold text-gray-900">
                              {row.boxes} cx
                            </span>
                            <span className="text-xs text-gray-400 mx-1">·</span>
                            <span className="text-sm font-bold text-amber-800">
                              {row.units} un
                            </span>
                            {row.openBoxUnits > 0 && (
                              <p className="text-[11px] text-amber-700" data-testid={`massas-open-box-${row.key}`}>
                                {t('massas.unified.openBox')}
                              </p>
                            )}
                          </div>

                          {!readOnly && (
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              {canManage ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onStartEdit?.(launch)}
                                    className="h-9 w-9 p-0 text-gray-600 hover:text-amber-700 active:bg-amber-100 max-sm:h-11 max-sm:w-11"
                                    title={t('massas.edit')}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onDelete?.(launch.id)}
                                    disabled={deletingId === launch.id}
                                    className="h-9 w-9 p-0 text-gray-600 hover:text-red-700 active:bg-red-50 max-sm:h-11 max-sm:w-11"
                                    title={t('massas.delete')}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : reconciled ? (
                                // El motivo importa: no es «de otro operador», es que el ERP ya lo tiene.
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md"
                                  title={t('massas.unified.settled')}
                                  data-testid={`massas-settled-${launch.id}`}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  {t('massas.unified.stateReconciled')}
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100/90 px-2.5 py-1 rounded-md"
                                  title="Lançamento feito por outro operador (somente leitura)"
                                >
                                  <ShieldAlert className="h-3.5 w-3.5 text-gray-400" />
                                  {launch.username}
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen Colectivo de Productos con Lançamentos */}
      <Card className="border-gray-200 shadow-sm" data-testid="massas-collective-summary">
        <CardContent className="pt-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('massas.collectiveTitle')}</h2>
            <p className="text-xs text-gray-500">{t('massas.collectiveSubtitle')}</p>
          </div>

          {activeProducts.length === 0 ? (
            <div className="py-8 px-4 text-center text-gray-500 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
              <p className="text-sm font-medium">{t('massas.noProductsLaunched', 'Nenhum produto lançado nesta data')}</p>
            </div>
          ) : (
            <>
              {/* VISTA ESCRITORIO (sm en adelante): Tabla Tabular Tradicional */}
              <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 text-xs font-semibold uppercase">
                      <th className="py-3 px-4">{t('massas.product')}</th>
                      <th className="py-3 px-4 text-center">Un/Cx</th>
                      <th className="py-3 px-4 text-right">{t('massas.boxes')}</th>
                      <th className="py-3 px-4 text-right">{t('massas.units')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {activeProducts.map((p) => {
                      const workers = workersByProduct.get(p.code) ?? [];
                      return (
                        <tr key={p.code} className="bg-amber-50/20 font-medium">
                          <td className="py-2.5 px-4 text-gray-900">
                            <div className="font-bold">{p.name}</div>
                            {workers.length > 0 && (
                              <div className="text-[11px] font-normal text-amber-800 mt-0.5">
                                👤 {workers.join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center text-xs text-gray-500">{p.unitsPerBox}</td>
                          <td className="py-2.5 px-4 text-right">
                            <span className="inline-flex items-center rounded-md bg-gray-900/5 px-2 py-0.5 text-xs font-bold text-gray-900 tabular-nums">
                              {p.totalBoxes} cx
                            </span>
                            {(p.openBoxUnits ?? 0) > 0 && (
                              <div className="text-[11px] text-amber-700 mt-0.5">
                                {t('massas.unified.openBox')}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span className="inline-flex items-center rounded-md bg-amber-600 px-2 py-0.5 text-xs font-extrabold text-white tabular-nums">
                              {p.totalUnits} un
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* VISTA MÓVIL (< sm / 640px): Tarjetas/Filas Apiladas Compactas y Fluidas */}
              <div className="block sm:hidden space-y-2" data-testid="massas-collective-mobile">
                {activeProducts.map((p) => {
                  const workers = workersByProduct.get(p.code) ?? [];
                  return (
                    <div
                      key={p.code}
                      className="p-3 rounded-lg border border-amber-200/80 bg-amber-50/40 shadow-xs"
                    >
                      {/* Mismo criterio que el resumen de stock: el nombre completo arriba, los
                          números abajo. `truncate` aquí dejaba "MASSA DISC..." en un teléfono. */}
                      <p className="font-bold text-sm text-gray-900 leading-snug break-words">{p.name}</p>
                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <span className="text-xs text-gray-500 font-medium">{p.unitsPerBox} un/cx</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="inline-flex items-center rounded-md bg-gray-900/5 px-2 py-0.5 text-xs font-bold text-gray-900 tabular-nums">
                            {p.totalBoxes} cx
                          </span>
                          <span className="inline-flex items-center rounded-md bg-amber-600 px-2 py-0.5 text-sm font-extrabold text-white tabular-nums">
                            {p.totalUnits} un
                          </span>
                        </div>
                      </div>
                      {(p.openBoxUnits ?? 0) > 0 && (
                        <p className="text-[11px] text-amber-700 mt-1">{t('massas.unified.openBox')}</p>
                      )}
                      {workers.length > 0 && (
                        <p className="text-[11px] text-amber-800 mt-1.5">👤 {workers.join(', ')}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
