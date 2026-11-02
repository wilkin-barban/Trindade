import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Card, CardContent } from '../components/ui/card';
import { HistoryDayPanel, type HistoryDay } from '../components/ui/HistoryDayPanel';

import { LoadingSpinner } from '../components/ui/loading-spinner';
import { toWhatsAppNumber } from '../lib/phone';
import { shareOrCopy, waMeLink } from '../lib/whatsapp';
import { massasMessage, type MassasHistoryDay, type MassasLaunchDayView } from '../lib/massas';
import { ArrowLeft } from 'lucide-react';
import { ModuleHelpModal } from '../components/ui/ModuleHelpModal';
import { MassasCollectiveTable } from './massas/MassasCollectiveTable';
import { readAeroMovementsSnapshot, type AeroMovementSnapshot } from '../lib/aero-mirror';
import { massasUnifiedRows, type MassasUnifiedRow } from '../lib/massas-unified';
import { MassasWhatsAppShare } from './massas/MassasWhatsAppShare';
import { saoPauloDaysAgo, saoPauloYesterday } from '../lib/date';

/**
 * A past day of launching, read and shared but not edited.
 *
 * The newest day it will open is yesterday: today is still being launched, and that is the launch
 * screen's job. With that limit in place no day here is ever editable, so the editing handlers this
 * screen used to carry are gone rather than left wired to buttons nobody can reach.
 */
export function MassasHistoryPage() {
  const { t } = useTranslation();
  /**
   * The open day lives in the URL.
   *
   * The launch screen and the report both link here with a day, so the day has to survive a reload, a
   * shared link and the back button. `?date=` is the deep link; without it -- or with a day the history
   * will not open -- the page falls back to yesterday, the newest day it can show.
   */
  const [params, setParams] = useSearchParams();
  const yesterday = useMemo(() => saoPauloYesterday(), []);
  const date = useMemo(() => {
    const asked = params.get('date');
    if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= yesterday) return asked;
    return yesterday;
  }, [params, yesterday]);
  const setDate = useCallback(
    (next: string) => {
      setParams(next === yesterday ? {} : { date: next }, { replace: true });
    },
    [setParams, yesterday],
  );
  const [dayView, setDayView] = useState<MassasLaunchDayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  /**
   * The ERP's side of the same day.
   *
   * The launch screen already reads it, and without it here the history knew only what Trindade recorded: a box
   * the company already received read as pending, and the balance was short by exactly those boxes. A failed
   * read leaves the day as it was instead of inventing a second one.
   */
  const [mirror, setMirror] = useState<{ loading: boolean; snapshot: AeroMovementSnapshot | null }>({
    loading: false,
    snapshot: null,
  });
  /**
   * The days that have launches, for the list above the table.
   *
   * Its own read, and its own failure: a day list that could not be loaded leaves the operator with the one
   * day that always exists -- yesterday -- instead of hiding the history behind an error.
   */
  const [days, setDays] = useState<{ loading: boolean; failed: boolean; list: MassasHistoryDay[] }>({
    loading: true,
    failed: false,
    list: [],
  });

  /**
   * The days as chips: one per day that has launches, plus yesterday when the endpoint never listed it.
   *
   * Yesterday is always offered because it is the day the operator usually means, and the page opens on it
   * by default; when the history does not carry it there is no count to print, so its chip shows the day
   * alone. Today is left out on purpose: today is still being launched and belongs to the launch screen.
   */
  const dayChips = useMemo<HistoryDay[]>(() => {
    if (days.loading) return [];
    const listed = days.list
      .filter((day) => day.date <= yesterday)
      .map((day) => ({ date: day.date, units: day.totalUnits }));
    if (listed.some((day) => day.date === yesterday)) return listed;
    return [{ date: yesterday, units: null }, ...listed];
  }, [days, yesterday]);

  // Edit / Delete state for Administrador

  // WhatsApp state
  const [phone, setPhone] = useState('');
  const [copyNote, setCopyNote] = useState('');

  const loadDay = useCallback(
    async (targetDate: string) => {
      setError('');
      try {
        const loaded = await api.get<MassasLaunchDayView>(`/massas-launch?date=${targetDate}`);
        setDayView(loaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('massas.loadError'));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void loadDay(date);
  }, [date, loadDay]);

  useEffect(() => {
    let active = true;
    void api
      .get<{ days?: MassasHistoryDay[] }>('/massas-launch/history')
      .then((body) => {
        if (!active) return;
        const list = Array.isArray(body?.days) ? body.days : [];
        setDays({ loading: false, failed: false, list });
      })
      .catch(() => {
        if (active) setDays({ loading: false, failed: true, list: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setMirror({ loading: true, snapshot: null });
    void api
      .get<unknown>(`/integration/aero/movements?date=${date}`)
      .then((body) => {
        if (!active) return;
        setMirror({ loading: false, snapshot: readAeroMovementsSnapshot(body) });
      })
      .catch(() => {
        // The mirror is an extra lens, not the record: a day with no snapshot still reads as itself.
        if (active) setMirror({ loading: false, snapshot: null });
      });
    return () => {
      active = false;
    };
  }, [date]);

  /**
   * One row per box, from both screens, exactly as the launch screen builds it.
   *
   * The history never acknowledges nor imports — it is a record — so the acked list is empty and no handler is
   * passed down; what it gains is the same reconciliation the plant saw that day.
   */
  const unifiedRows = useMemo<MassasUnifiedRow[]>(
    () =>
      massasUnifiedRows({
        launches: dayView?.launches ?? [],
        movements: mirror.snapshot?.movements ?? [],
        products: dayView?.products ?? [],
        ackedLaunchIds: [],
      }),
    [dayView, mirror.snapshot],
  );

  const previewMessage = useMemo(() => {
    if (!dayView) return '';
    return massasMessage(dayView);
  }, [dayView]);

  const handleCopyReport = async () => {
    if (!previewMessage) return;
    setCopyNote('');
    const outcome = await shareOrCopy(previewMessage);
    if (outcome === 'copied' || outcome === 'shared') {
      setCopyNote(t('massas.copied'));
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-12 sm:space-y-6">
      {/* Encabezado y Enlace Cruzado a Hoy. Sin la placa del reloj: en un teléfono se llevaba el
          ancho que el título necesitaba. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            {/* Un escalón menos en el teléfono: el título entra en dos renglones y el encabezado deja de ser media pantalla. */}
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
        {/* La vuelta a hoy, sola: elegir día es trabajo de la lista, que muestra los totales de cada
            jornada y no obliga a abrir un calendario para llegar a ayer. */}
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

      {/* Avisos Globales */}
      {error && (
        <div role="alert" className="p-4 text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}
      {notice && (
        <div
          role="alert"
          className={`p-4 rounded-lg border text-sm font-medium ${
            notice.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {notice.message}
        </div>
      )}
      {/* El día, con el mismo panel del conteo: el campo grande abre el calendario y los días con
          lanzamientos van como chips al costado, para que el día más buscado -- ayer -- no cueste abrir
          nada. Antes esto era una tarjeta de botones de dos líneas: el mismo control dibujado de otra
          forma, que es justo lo que ya no puede pasar. */}
      <HistoryDayPanel
        id="massas-history-date"
        label={t('massas.date')}
        value={date}
        onChange={setDate}
        min={saoPauloDaysAgo(30)}
        max={yesterday}
        testIdPrefix="massas-history"
        groupLabel={t('massas.historyDaysLabel')}
        days={dayChips}
        failed={days.failed}
        failedMessage={t('massas.historyDaysUnavailable')}
      />

      {/* Un día sin lanzamientos es un día vacío, no un error: la tabla no dibuja nada y sin esta línea
          la pantalla quedaría muda, que es indistinguible de una lectura que falló. */}
      {dayView && dayView.launches.length === 0 && (
        <div
          data-testid="massas-history-empty"
          className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm"
        >
          {t('massas.historyEmptyDay')}
        </div>
      )}

      {/* Resumen Colectivo y Desglose por Operador */}
      {dayView && dayView.launches.length > 0 && (
        <MassasCollectiveTable
          products={dayView.products}
          launches={dayView.launches}
          // The history is a record: no edit, no delete, no owner and no role to weigh. Both screens
          // draw the same read-only day, which is what the company's audit needs.
          readOnly={true}
          // The same rows the launch screen draws, so a box already received from the ERP shows as reconciled and
          // one the ERP never saw keeps its badge. Nothing here can send, import or acknowledge.
          unifiedRows={unifiedRows}
          unifiedDate={date}
        />
      )}

      {/* Bloque WhatsApp con Preview Actualizado */}
      <MassasWhatsAppShare
        phone={phone}
        onPhoneChange={setPhone}
        previewMessage={previewMessage}
        onCopy={handleCopyReport}
        onOpenWhatsApp={handleOpenWhatsApp}
        copyNote={copyNote}
      />
    </div>
  );
}
