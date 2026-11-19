import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, MessageCircle, Pencil, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { LoadingSpinner } from '../ui/loading-spinner';

/** Una foto del mensaje: la pública si la hay, la del endpoint si no. */
export interface ShareCardPhoto {
  id: number;
  url?: string | null;
  publicUrl?: string | null;
  alt?: string;
}

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
  photos = [],
  testIdPrefix = 'report',
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
  /** Omitted when the card is only a share surface: a past day has nothing to edit. */
  onEdit?: () => void;
  onClose: () => void;
  footer?: ReactNode;
  /**
   * Las fotos que viajan con el mensaje, como miniaturas arriba del texto.
   *
   * Son de solo lectura: la tarjeta comparte, no edita, y la galería de la pantalla es donde se borran. La URL
   * preferida es la pública, que no necesita sesión.
   */
  photos?: readonly ShareCardPhoto[];
  /** `report` by default; another module says its own name so the test ids never collide. */
  testIdPrefix?: string;
}) {
  const { t } = useTranslation();

  return (
    <Card className="mb-4 overflow-hidden" data-testid={`${testIdPrefix}-share-card`}>
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-gray-600" data-testid={`${testIdPrefix}-share-subtitle`}>
            {subtitle}
          </p>
        )}
      </div>

      <CardContent className="p-0">
        {loading && (
          <div className="flex justify-center py-10" data-testid={`${testIdPrefix}-share-loading`}>
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            data-testid={`${testIdPrefix}-share-error`}
          >
            {error}
          </p>
        )}

        {photos.length > 0 && (
          <div
            className="flex flex-wrap gap-2 border-b border-gray-200 p-3"
            data-testid={`${testIdPrefix}-share-photos`}
          >
            {photos.map((photo, index) => {
              const url = photo.publicUrl || photo.url;
              if (!url) return null;
              return (
                <img
                  key={photo.id}
                  src={url}
                  alt={photo.alt ?? t('reports.photoNumber', { count: index + 1 })}
                  loading="lazy"
                  className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
                  data-testid={`${testIdPrefix}-share-photo-${photo.id}`}
                />
              );
            })}
          </div>
        )}

        {!loading && !error && (
        <pre
            className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words px-4 py-3 text-[13px] leading-relaxed text-gray-800 select-text"
            data-testid={`${testIdPrefix}-share-text`}
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
            data-testid={`${testIdPrefix}-share-whatsapp`}
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
            data-testid={`${testIdPrefix}-share-pdf`}
          >
            <Download className="h-4 w-4" />
            {t('reports.exportPdf')}
          </Button>
          {onEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={onEdit}
              className="min-h-[44px] gap-2"
              data-testid={`${testIdPrefix}-share-edit`}
            >
              <Pencil className="h-4 w-4" />
              {t('reports.editTitle')}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="col-span-2 min-h-[44px] gap-2"
            data-testid={`${testIdPrefix}-share-close`}
          >
            <X className="h-4 w-4" />
            {t('ui.close')}
          </Button>
        </div>

        {note && (
          <p className="px-4 pb-3 text-xs text-gray-500" data-testid={`${testIdPrefix}-share-note`}>
            {note}
          </p>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
