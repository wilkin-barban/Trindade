import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, MessageCircle, Pencil, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { LoadingSpinner } from '../ui/loading-spinner';

/**
 * The message the plant will read, with the four decisions that follow it.
 *
 * This is the screen an operator lands on after saving: the report as the group receives it, not the form they
 * just filled. Sharing, printing, fixing and leaving are one thumb away; copying was removed because the share
 * sheet already carries the text and a second copy button made the card look like two tools.
 *
 * It knows nothing about reports: it takes a title, a subtitle and a text, so the loading module can mount the same
 * card with its own message and its own document.
 */
export function ShareCard({
  title,
  subtitle,
  text,
  loading = false,
  error = null,
  note = null,
  sharing = false,
  printing = false,
  onShare,
  onPdf,
  onEdit,
  onClose,
  footer,
}: {
  title: string;
  subtitle?: string | null;
  text: string;
  loading?: boolean;
  error?: string | null;
  note?: string | null;
  sharing?: boolean;
  printing?: boolean;
  onShare: () => void;
  onPdf: () => void;
  onEdit: () => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <Card className="mb-4 overflow-hidden" data-testid="report-share-card">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-gray-600" data-testid="report-share-subtitle">
            {subtitle}
          </p>
        )}
      </div>

      <CardContent className="p-0">
        {loading && (
          <div className="flex justify-center py-10" data-testid="report-share-loading">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            data-testid="report-share-error"
          >
            {error}
          </p>
        )}

        {!loading && !error && (
          <pre
            className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words px-4 py-3 text-[13px] leading-relaxed text-gray-800 select-text"
            data-testid="report-share-text"
          >
            {text}
          </pre>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-gray-200 p-3">
          <Button
            type="button"
            onClick={onShare}
            disabled={loading || Boolean(error) || sharing}
            className="col-span-2 min-h-[44px] gap-2 bg-green-600 text-white hover:bg-green-700"
            data-testid="report-share-whatsapp"
          >
            <MessageCircle className="h-4 w-4" />
            {sharing ? t('reports.shareSending') : t('salida.shareWhatsApp')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onPdf}
            disabled={loading || Boolean(error) || printing}
            className="min-h-[44px] gap-2"
            data-testid="report-share-pdf"
          >
            <Download className="h-4 w-4" />
            {t('reports.exportPdf')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            className="min-h-[44px] gap-2"
            data-testid="report-share-edit"
          >
            <Pencil className="h-4 w-4" />
            {t('reports.editTitle')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="col-span-2 min-h-[44px] gap-2"
            data-testid="report-share-close"
          >
            <X className="h-4 w-4" />
            {t('ui.close')}
          </Button>
        </div>

        {note && (
          <p className="px-4 pb-3 text-xs text-gray-500" data-testid="report-share-note">
            {note}
          </p>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
