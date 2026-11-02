import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { HistoryDayPanel } from '../components/ui/HistoryDayPanel';
import { Input } from '../components/ui/input';
import {
  mailtoLink,
  stockEmailBody,
  stockMessage,
  stockSummary,
  type StockDay,
  type StockHistoryDay,
} from '../lib/stock';
import { saoPauloDaysAgo, saoPauloYesterday } from '../lib/date';
import { formatPhoneMask, toWhatsAppNumber } from '../lib/phone';
import { shareOrCopy, waMeLink } from '../lib/whatsapp';
import { ModuleHelpModal } from '../components/ui/ModuleHelpModal';
import { StockCollectiveSummary } from '../components/stock/StockCollectiveSummary';
import { ArrowLeft } from 'lucide-react';

/**
 * A past day of counting, as a place of its own.
 *
 * The counter answers "what is on the shelf now"; this answers "what did we count that day", which is a
 * different question asked at a different moment, so it gets its own route rather than a panel floating
 * over the counter. What it answers with is the day's collective summary and nothing else: a reading,
 * not a second counter. That is why there is no quantity field here, why the newest day it will open is
 * yesterday — a day still being counted is the counter's business — and why the picker stops thirty days
 * back instead of pretending the whole archive is one scroll away.
 */
const EMAIL_TO = 'xmitrindade@hotmail.com';

export function StockHistoryPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState(saoPauloYesterday());
  const [day, setDay] = useState<StockDay | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [freeNumber, setFreeNumber] = useState('');
  /**
   * The days that were counted, newest first.
   *
   * Its own read and its own silence: a history list that cannot be read leaves the day panel working, so a
   * failed chip row never costs the operator the day they came for.
   */
  const [days, setDays] = useState<StockHistoryDay[]>([]);

  useEffect(() => {
    let active = true;
    void api
      .get<{ days?: StockHistoryDay[] }>('/stock/history')
      .then((body) => {
        if (active) setDays(Array.isArray(body?.days) ? body.days : []);
      })
      .catch(() => {
        if (active) setDays([]);
      });
    return () => {
      active = false;
    };
  }, []);

  /** The last read asked for: two chips tapped quickly leave two answers racing, and the older one loses. */
  const readToken = useRef(0);

  const load = useCallback(
    async (target: string) => {
      const token = ++readToken.current;
      setError('');
      try {
        const loaded = await api.get<StockDay>(`/stock?date=${target}`);
        if (readToken.current !== token) return;
        setDay(loaded);
      } catch {
        if (readToken.current !== token) return;
        // The count of the previous day cannot survive its own read failing: it would read as this day's.
        setDay(null);
        setError(t('stock.loadError'));
      }
    },
    [t]
  );

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const summary = day === null ? [] : stockSummary(day);
  const message = day === null ? '' : stockMessage(day);
  const emailBody = day === null ? '' : stockEmailBody(day);
  const targetNumber = toWhatsAppNumber(freeNumber);

  async function shareWhatsApp() {
    if (day === null) return;
    if (targetNumber !== '') {
      const link = waMeLink(targetNumber, message);
      if (link === null) {
        setNote(t('stock.unavailable'));
        return;
      }
      window.open(link, '_blank', 'noopener');
      setNote(t('stock.opened'));
      return;
    }
    const outcome = await shareOrCopy(message);
    if (outcome === 'copied') setNote(t('stock.copied'));
    else if (outcome === 'failed') setNote(t('stock.unavailable'));
  }

  async function sendEmail() {
    if (day === null) return;
    try {
      window.location.href = mailtoLink(EMAIL_TO, `${t('stock.emailSubject')} ${date}`, emailBody);
      setNote(t('stock.opened'));
    } catch {
      const outcome = await shareOrCopy(emailBody);
      if (outcome === 'copied') setNote(t('stock.copied'));
      else setNote(t('stock.unavailable'));
    }
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6" data-testid="stock-history-page">
      {/* Debajo de `sm` el encabezado se apila: con el botón al lado, "Histórico de Contagem" se
          partía en tres renglones y la ayuda quedaba colgada entre ellos. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-semibold text-gray-800">{t('stock.historyTitle')}</h1>
            <div className="shrink-0">
              <ModuleHelpModal
                title={t('moduleHelp.stockHistory.title')}
                subtitle={t('moduleHelp.stockHistory.subtitle')}
                description={t('moduleHelp.stockHistory.description')}
                sections={t('moduleHelp.stockHistory.sections', { returnObjects: true }) as any}
              />
            </div>
          </div>
          <p className="text-sm text-gray-500">{t('stock.historySubtitle')}</p>
        </div>
        {/* La vuelta al contador, sola: el día lo elige el panel de abajo, que es la superficie grande que
            el operario ya usa en el teléfono. */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link
            to="/stock-calculator"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-10"
            data-testid="stock-history-back"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">{t('stock.counterShort')}</span>
            <span className="hidden sm:inline">{t('stock.backToCounter')}</span>
          </Link>
        </div>
      </div>

      {/* El día, como en el teléfono: el panel entero abre el calendario y el día es el texto más grande,
          así el control más ancho no sostiene el dato más chico. Dos topes: la última noche cerrada hacia
          atrás y treinta días de archivo. Los días contados van como chips debajo, para no abrir un
          calendario cuando el día que se busca es el de al lado. El bloque es compartido con el histórico
          de masas: eran dos dibujos del mismo control y el de masas había derivado en una tarjeta. */}
      <HistoryDayPanel
        id="stock-history-date"
        label={t('stock.date')}
        value={date}
        onChange={setDate}
        min={saoPauloDaysAgo(30)}
        max={saoPauloYesterday()}
        testIdPrefix="stock-history"
        groupLabel={t('stock.history')}
        // Today belongs to the count in progress, not to the archive: the chips stop at yesterday.
        days={days
          .filter((counted) => counted.date <= saoPauloYesterday())
          .map((counted) => ({ date: counted.date, units: counted.units }))}
      />

      {error !== '' && (
        <p role="alert" className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </p>
      )}

      <StockCollectiveSummary
        products={summary}
        testIdPrefix="stock-history"
        totalBoxes={day?.totalBoxes}
        totalUnits={day?.totalUnits}
      />

      <Card>
        <CardContent className="p-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">{t('stock.freeNumber')}</label>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={freeNumber}
              onChange={(e) => setFreeNumber(formatPhoneMask(e.target.value))}
              placeholder="(11) 9XXXX-XXXX"
              data-testid="stock-history-number"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">{t('stock.message')}</label>
            <pre className="whitespace-pre-wrap text-xs bg-gray-50 border rounded-md p-2 max-h-64 overflow-auto" data-testid="stock-history-message">
              {message}
            </pre>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={shareWhatsApp} disabled={day === null} data-testid="stock-history-share">
              {t('stock.shareWhatsapp')}
            </Button>
            <Button variant="outline" onClick={sendEmail} disabled={day === null} data-testid="stock-history-email">
              {t('stock.shareEmail')}
            </Button>
            <span className="text-xs text-gray-400">{EMAIL_TO}</span>
            {note !== '' && <span className="text-xs text-gray-500">{note}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
