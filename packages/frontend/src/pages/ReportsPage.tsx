import { Fragment, useEffect, useMemo, useState, useCallback, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LucideImage, LucideTrash2, LucideUpload, RefreshCw } from 'lucide-react';
import { api, ApiClientError } from '../api/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { ModuleHelpModal } from '../components/ui/ModuleHelpModal';
import {
  BoxTypeList,
  CategorySection,
  type CategoryType,
  type FormState,
} from '../components/reports/CategorySection';
import { toggleBoxType } from '../lib/report-box-types';
import { reportItems } from '../lib/report-items';
import { readReportProducts, type ReportProducts } from '../lib/report-products';
import { visibleReportCategories } from '../lib/report-categories';
import { ReceiptsSection } from '../components/reports/ReceiptsSection';
import { hasTemperatureTasks } from '../lib/report-sections';
import { MassasReportSection } from '../components/reports/MassasReportSection';
import { SalidaReportSection } from '../components/reports/SalidaReportSection';
import { ERP_RECEIPT_CATEGORY_ID, usesErpReceipts } from '../lib/receipts';
import { saoPauloToday } from '../lib/date';
import { aeroEndpoint, aeroSettingsReady, loadAeroSettings } from '../lib/aero-integration';
import { fetchAeroVaultSettings } from '../lib/aero-vault';
import { triggerAeroMovementsSync } from '../lib/aero-mirror';
import { aeroSyncRefusedEvent, postAeroAuditEvent } from '../lib/aero-audit';


interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

const MAX_PHOTOS = 5;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
// An iPhone camera writes HEIC/HEIF, and the backend stores both since schema revision 12: refusing them here
// would turn a photo the server accepts into an "invalid format" the operator cannot explain.
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [categories, setCategories] = useState<CategoryType[]>([]);
  // Discovered rather than listed: the server keeps the offer, and a copy here would drift from it.
  const [products, setProducts] = useState<ReportProducts | null>(null);
  const [turno, setTurno] = useState<'tarde' | 'noite'>('tarde');
  const [notes, setNotes] = useState('');
  const [form, setForm] = useState<FormState>({
    items: {},
    temperatures: {},
    selectedProducts: {},
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [createdReportId, setCreatedReportId] = useState<number | null>(null);
  const [movementsRefreshKey, setMovementsRefreshKey] = useState(0);
  // Company access is a device setting, read once: without it the button refreshes the day it already read
  // instead of promising a sync it cannot start. The password is not part of it any more -- the server keeps
  // it -- so the vault is asked whether it holds one, and until it answers the button stays where it was.
  const [aeroSettings, setAeroSettings] = useState(() => loadAeroSettings());
  const canSyncErp = aeroSettingsReady(aeroSettings);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const vault = await fetchAeroVaultSettings();
        if (cancelled || !vault.configured) return;
        setAeroSettings((current) => ({
          ...current,
          wsUrl: vault.wsUrl ?? current.wsUrl,
          username: vault.username ?? current.username,
          hasPassword: vault.hasPassword,
        }));
      } catch {
        // Un cofre ilegible deja el botón como estaba: el reporte se sigue leyendo y se sigue enviando a mano.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The day the report is about, read once.
   *
   * Both cards read the clock through this value: two separate calls could land on either side of midnight and
   * leave the massas of one day beside the receipts of another.
   */
  const reportDate = useMemo(() => saoPauloToday(), []);

  const handleSyncErpMovements = useCallback(() => {
    void (async () => {
      // Sin red no hay ticket que canjear ni app que abrir: se dice en el reporte y no se lanza nada.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError(t('massas.aero.offline'));
        return;
      }
      const fired = await triggerAeroMovementsSync(aeroSettings, {
        date: reportDate,
        callbackPath: location.pathname,
        // The report states the whole day, exits included; every other caller keeps the entries-only default.
        includeExits: true,
      });
      if (fired) return;
      // A device without company access refreshes what it already read, and says so in the log: the
      // operator pressed a button, and a press that reached nothing is not the same as one never made.
      void postAeroAuditEvent(
        aeroSyncRefusedEvent({
          date: reportDate,
          destinationUrl: aeroEndpoint(aeroSettings.wsUrl, 'movimentoitem'),
        }),
      );
      setMovementsRefreshKey((key) => key + 1);
    })();
  }, [aeroSettings, location.pathname, reportDate, t]);

  const handleMovementsSynced = useCallback(() => {
    setMovementsRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => () => {
    pendingPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, [pendingPhotos]);

  // ---- Fetch reference data ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [catData, turnoData, productData] = await Promise.all([
          api.get<{ categories: CategoryType[] }>('/reports/categories'),
          api.get<{ turno: string }>('/reports/turno'),
          // Its own answer: a catalogue the server could not give is not a reason to refuse the form, so it
          // is asked separately and a failure leaves the product blocks saying so.
          api.get<unknown>('/reports/products').catch(() => null),
        ]);

        if (cancelled) return;

        // Quadrada is a Cajas pequeñas question; Cajas Assaí does not ask it. The filter is this web's rule and
        // the API keeps answering both tasks.
        setCategories(visibleReportCategories(catData.categories));
        setTurno(turnoData.turno as 'tarde' | 'noite');
        setProducts(readReportProducts(productData));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t('reports.loadingError')
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // ---- Form handlers ----
  const handleItemChange = useCallback((taskId: number, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      items: { ...prev.items, [taskId]: checked },
    }));
  }, []);

  /**
   * Switches one type of box, taking its answers with it.
   *
   * The rule -- what a switch drops and why -- is `toggleBoxType`'s, in `lib/report-box-types.ts`, because the
   * edit screen has the same switch and the same body to build.
   */
  const handleBoxTypeChange = useCallback(
    (categoryId: number, enabled: boolean) => {
      const tasks = categories.filter((category) => category.id === categoryId).flatMap((category) => category.tasks);
      setForm((prev) => toggleBoxType(prev, tasks, categoryId, enabled));
    },
    [categories],
  );

  const handleSelectedProductsChange = useCallback((taskId: number, products: string[]) => {
    setForm((prev) => ({
      ...prev,
      items: { ...prev.items, [taskId]: products.length > 0 },
      selectedProducts: { ...prev.selectedProducts, [taskId]: products },
    }));
  }, []);

  const handleTemperatureChange = useCallback(
    (taskId: number, readingIndex: number, value: string) => {
      setForm((prev) => ({
        ...prev,
        temperatures: {
          ...prev.temperatures,
          [taskId]: Array.from({ length: Math.max(readingIndex, prev.temperatures[taskId]?.length ?? 0) }, (_, index) =>
            index === readingIndex - 1 ? value : (prev.temperatures[taskId]?.[index] ?? '')
          ),
        },
      }));
    },
    []
  );

  // ---- Photo handlers ----
  function handlePhotoSelection(files: FileList | null) {
    if (!files) return;
    setPhotoError('');
    const selected = Array.from(files);
    if (pendingPhotos.length + selected.length > MAX_PHOTOS) {
      setPhotoError(t('reports.photoCountError', { max: MAX_PHOTOS }));
      return;
    }

    const validPhotos: PendingPhoto[] = [];
    for (const file of selected) {
      if (file.size > MAX_PHOTO_SIZE) {
        setPhotoError(t('reports.photoSizeError'));
        continue;
      }
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        setPhotoError(t('reports.photoTypeError'));
        continue;
      }
      validPhotos.push({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (validPhotos.length > 0) {
      setPendingPhotos((prev) => [...prev, ...validPhotos]);
    }
  }

  function removePendingPhoto(photoId: string) {
    setPendingPhotos((prev) => {
      const removed = prev.find((photo) => photo.id === photoId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((photo) => photo.id !== photoId);
    });
  }

  async function uploadPendingPhotos(reportId: number) {
    for (const pendingPhoto of pendingPhotos) {
      const formData = new FormData();
      formData.append('file', pendingPhoto.file);
      await api.upload(`/reports/${reportId}/photos`, formData);
    }
  }

  // ---- Submit ----
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    // Find all active temperature tasks
    const activeTempTasks = categories
      .flatMap((c) => c.tasks)
      .filter((t) => t.task_type === 'temperature');

    const hasMissingTemp = activeTempTasks.some((task) => {
      return Array.from({ length: task.temperature_readings }, (_, index) => form.temperatures[task.id]?.[index])
        .some((value) => value === undefined || value === null || String(value).trim() === '');
    });

    if (hasMissingTemp || activeTempTasks.length === 0) {
      setError(t('reports.temperaturesRequired'));
      setSubmitting(false);
      return;
    }

    // Build temperatures array
    const temperatures = activeTempTasks.flatMap((task) =>
      Array.from({ length: task.temperature_readings }, (_, index) => ({
        location: task.name_pt,
        readingIndex: index + 1,
        value: Number(form.temperatures[task.id][index]),
      }))
    );

    // Build items: one row per task that is not a temperature, marked or not. What the day did not do is part
    // of the record, and the rule that says so is `lib/report-items.ts`'s, shared with the edit screen.
    const items = reportItems(categories, form);

    try {
      let reportId = createdReportId;
      if (!reportId) {
        const data = await api.post<{ report: { id: number } }>('/reports', {
          turno,
          notes: notes.trim() || undefined,
          items,
          temperatures,
        });
        reportId = data.report.id;
        setCreatedReportId(reportId);
      }

      if (pendingPhotos.length > 0) {
        await uploadPendingPhotos(reportId);
      }

      pendingPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setPendingPhotos([]);
      // The message the group will read, with the four decisions that follow: share, PDF, edit, close.
      navigate(`/reports/${reportId}?saved=1`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message === 'reportAlreadyExists' ? t('reports.reportAlreadyExists') : err.message);
      } else {
        setError(t('reports.saveError'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // The day's exits are their own card: sharing the massas block made two different records read as one list and
  // broke the layout on a phone, where the block is already two stacked sections.
  const salidaCard = (
    <SalidaReportSection date={reportDate} hideRefresh refetchKey={movementsRefreshKey} />
  );

  // ---- Loading / Error states ----
  /**
   * The three records of the day, one card each, under the one action that refreshes them.
   *
   * They used to share a single card with two inner blocks: on a phone that stacked a third section into a block
   * that already had two, and the card grew until the reading order broke. The sync button stays above all three
   * because it is one action over one day, not a property of any of the cards.
   */
  // La sincronización del ERP es la primera opción del formulario: se aprieta antes de escribir nada. El
  // encabezado de las tarjetas conserva sólo su título, para que el botón no aparezca dos veces.
  const erpSyncAction = (
    <div className="mb-4" data-testid="erp-movements-sync-block">
      <Button
        type="button"
        onClick={handleSyncErpMovements}
        className="min-h-[44px] w-full gap-2 text-xs font-semibold"
        data-testid="erp-movements-sync"
        aria-label={
          canSyncErp ? t('massas.syncHeader.action', 'Sincronizar com ERP') : t('reports.receiptsRefresh', 'Atualizar')
        }
      >
        <RefreshCw className="h-4 w-4" />
        {canSyncErp ? t('massas.syncHeader.action', 'Sincronizar com ERP') : t('reports.receiptsRefresh', 'Atualizar')}
      </Button>
    </div>
  );

  const erpMovementsHeader = (
    <div className="mb-3" data-testid="erp-movements-header">
      <h2 className="text-base font-bold leading-snug text-gray-900 sm:text-lg">
        {t('reports.erpMovementsTitle', 'Movimentações do ERP')}
      </h2>
    </div>
  );

  const massasCard = (
    <Card className="mb-4" data-testid="report-massas-card">
      <CardContent className="pt-6">
        <div data-testid="massas-block">
          <MassasReportSection date={reportDate} hideRefresh refetchKey={movementsRefreshKey} />
        </div>
      </CardContent>
    </Card>
  );

  const receiptsCard = usesErpReceipts(reportDate) ? (
    <Card className="mb-4" data-testid="report-receipts-card">
      <CardContent className="pt-6">
        <div data-testid="receipts-block">
          <ReceiptsSection
            date={reportDate}
            hideHeader
            refetchKey={movementsRefreshKey}
            onSynced={handleMovementsSynced}
          />
        </div>
      </CardContent>
    </Card>
  ) : null;

  const erpMovementsBlock = (
    <section className="mb-6" data-testid="erp-movements-section">
      {erpMovementsHeader}
      {massasCard}
      {receiptsCard}
      {salidaCard}
    </section>
  );

  // The day's production sits right below Temperaturas, and there may be more than one temperature category:
  // it follows the last of them, once. Rendering it after each one drew the same card twice on a page whose
  // categories somebody else grew.
  const massasAfterCategoryId =
    categories.filter((cat) => !cat.parent_category_id && hasTemperatureTasks(cat)).at(-1)?.id ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && categories.length === 0) {
    return (
      <div className="p-4 text-red-700 bg-red-50 border border-red-200 rounded-lg">
        <p className="font-medium">{t('reports.loadingError')}</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 text-xl font-bold text-gray-800">
          {t('reports.newReport')}
        </h2>
        <ModuleHelpModal
          title={t('moduleHelp.reports.title')}
          subtitle={t('moduleHelp.reports.subtitle')}
          description={t('moduleHelp.reports.description')}
          sections={t('moduleHelp.reports.sections', { returnObjects: true }) as any}
        />
      </div>
      <p className="text-sm text-gray-500 mb-6">{t('reports.newReportDesc')}</p>

      <form onSubmit={handleSubmit} data-testid="report-builder-form">
        {/* Sincronizar com ERP: la primera opción visible, antes del turno. */}
        {erpSyncAction}

        {/* Turno selector */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>{t('reports.turnoLabel')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="turno"
                  value="tarde"
                  checked={turno === 'tarde'}
                  onChange={() => setTurno('tarde')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  data-testid="turno-selector-tarde"
                />
                <span className="text-sm text-gray-700">🌅 {t('reports.turnoTarde')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="turno"
                  value="noite"
                  checked={turno === 'noite'}
                  onChange={() => setTurno('noite')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  data-testid="turno-selector-noite"
                />
                <span className="text-sm text-gray-700">🌙 {t('reports.turnoNoite')}</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic category sections. A produção do dia entra logo abaixo de Temperaturas: é a última coisa
            que o operador lê antes de contar quanto saiu, e separá-las obrigava a subir e descer a página
            para conferir a mesma manhã duas vezes. */}
        {massasAfterCategoryId === null && erpMovementsBlock}

        {categories.filter((cat) => !cat.parent_category_id).map((cat) => {
          const children = categories.filter((child) => child.parent_category_id === cat.id);
          // Recebimento lo contesta el espejo del ERP -- `ErpMovementsCard`, más arriba --, no un checklist.
          // Lo que el espejo no reemplaza son las categorías que cuelgan de ella: cada una es su propia
          // categoría, con sus propias respuestas, y tirarlas era una forma silenciosa de perderlas.
          const erpReceipts = cat.id === ERP_RECEIPT_CATEGORY_ID && usesErpReceipts(reportDate);
          if (erpReceipts && children.length === 0) return null;

          return (
            <Fragment key={cat.id}>
              <Card className="mb-6">
                <CardContent className="pt-6">
                  {erpReceipts ? (
                    <BoxTypeList
                      title={i18n.language?.startsWith('es') ? cat.name_es : cat.name_pt}
                      childrenCategories={children}
                      products={products}
                      form={form}
                      onItemChange={handleItemChange}
                      onTemperatureChange={handleTemperatureChange}
                      onSelectedProductsChange={handleSelectedProductsChange}
                      disabledBoxTypeIds={form.disabledBoxTypeIds}
                      onBoxTypeChange={handleBoxTypeChange}
                    />
                  ) : (
                    <CategorySection
                      category={cat}
                      children={children}
                      products={products}
                      form={form}
                      onItemChange={handleItemChange}
                      onTemperatureChange={handleTemperatureChange}
                      onSelectedProductsChange={handleSelectedProductsChange}
                      disabledBoxTypeIds={form.disabledBoxTypeIds}
                      onBoxTypeChange={handleBoxTypeChange}
                    />
                  )}
                </CardContent>
              </Card>
              {cat.id === massasAfterCategoryId && erpMovementsBlock}
            </Fragment>
          );
        })}

        {/* Notes */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>{t('reports.notesLabel')}</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 resize-y"
              placeholder={t('reports.notesPlaceholder')}
              data-testid="notes-textarea"
            />
          </CardContent>
        </Card>


        {/* Photos */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <LucideImage className="h-4 w-4" />
              {t('reports.photosSection')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-3">
              {t('reports.photoHelp', { count: pendingPhotos.length, max: MAX_PHOTOS })}
            </p>
            {pendingPhotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                {pendingPhotos.map((photo) => (
                  <div key={photo.id} className="relative aspect-square rounded-md overflow-hidden border border-gray-200">
                    <img src={photo.previewUrl} alt={photo.file.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePendingPhoto(photo.id)}
                      className="absolute right-1 top-1 inline-flex h-11 w-11 items-start justify-end rounded-full"
                      title={t('reports.photoRemove')}
                      data-testid="remove-pending-photo-btn"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
                        <LucideTrash2 className="h-3 w-3" />
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className={`inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium h-9 px-3 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 ${pendingPhotos.length >= MAX_PHOTOS ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <LucideUpload className="h-4 w-4" />
              {t('reports.photoUploadLabel')}
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                disabled={pendingPhotos.length >= MAX_PHOTOS || submitting}
                onChange={(e) => {
                  handlePhotoSelection(e.target.files);
                  e.target.value = '';
                }}
                data-testid="report-photo-input"
              />
            </label>
            {photoError && <p className="mt-2 text-sm text-red-600">{photoError}</p>}
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {/* Submit: fijo al pie en el teléfono, como la barra de Salida y la de Masas. Un reporte son treinta
            casillas y cinco temperaturas; el botón que lo cierra no puede estar al final de la lista. */}
        <div
          className="fixed inset-x-0 bottom-0 z-10 flex justify-end border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mt-4 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
          data-testid="report-save-bar"
        >
          <Button type="submit" disabled={submitting} size="lg" data-testid="submit-report-btn">
            {submitting ? t('reports.saving') : (createdReportId ? t('reports.retryPhotoUpload') : t('reports.saveReport'))}
          </Button>
        </div>
      </form>
    </div>
  );
}
