import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, MessageCircle, X } from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { formatDateLabel } from '../../lib/date';
import { Button } from '../ui/button';
import {
  SALIDA_BLOCKS,
  salidaProductsByBlock,
  salidaQuantity,
  salidaSummaryText,
  salidaTotalUnits,
  salidaPhotoFiles,
  shareSalida,
  type SalidaBlock,
  type SalidaMovement,
} from '../../lib/salida';

/** What the ERP said, as the page already understood it. */
export type SalidaErpOutcome = 'ok' | 'error' | 'pending';

/**
 * The confirmation the operator reads after a launch.
 *
 * The ERP answer is drawn first because it is the part that cannot be guessed: a movement that Trindade stored
 * and the company never received is a pending movement, not a successful launch. Everything else -- the day, the
 * operator, the blocks, the products, the total and the photos -- is the record the operator can forward, and it
 * is drawn from the movement itself so a resend or a reload shows the same thing.
 */
export function SalidaSuccessDialog({
  open,
  onClose,
  movement,
  erp,
  erpMessage,
}: {
  open: boolean;
  onClose: () => void;
  movement: SalidaMovement | null;
  erp: SalidaErpOutcome;
  erpMessage?: string | null;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');

  const labels = useMemo<Record<SalidaBlock, string>>(
    () => ({
      embalagens: t('salida.blocks.embalagens'),
      bobinas: t('salida.blocks.bobinas'),
      'materia-prima': t('salida.blocks.materia-prima'),
    }),
    [t],
  );

  const text = useMemo(
    () => (movement ? salidaSummaryText(movement, labels) : ''),
    [movement, labels],
  );

  const grouped = useMemo(
    () =>
      movement
        ? salidaProductsByBlock(
            movement.items.map((item) => ({
              code: item.product_code,
              name: item.product_name,
              block: item.block,
            })),
          )
        : null,
    [movement],
  );

  const erpLine =
    erp === 'ok' ? t('salida.erpAccepted') : erp === 'error' ? t('salida.erpRejected') : t('salida.erpNoAnswer');

  /**
   * The photos as files the sheet can carry.
   *
   * They are downloaded from the record's own paths, never from a URL this page invented: a photo that cannot be
   * fetched is simply left out, and the same photo stays available as its own link under the grid.
   */


  const handleCopy = async () => {
    if (!text) return;
    const outcome = await shareSalida({ text });
    if (outcome === 'copied' || outcome === 'shared') setNote(t('salida.copiedSummary'));
  };

  const handleShare = async () => {
    if (!text) return;
    setNote('');
    const outcome = await shareSalida({ text, photos: await salidaPhotoFiles(movement?.photos ?? []) });
    // A sheet that cannot carry files is not a failure: the text was copied instead, and the photos stay as
    // their own links under the summary.
    if (outcome === 'copied' || outcome === 'shared') setNote(t('salida.copiedSummary'));
    if (outcome === 'failed') setNote(t('salida.shareFailed'));
  };

  return (
    <Dialog open={open} onClose={onClose} labelledBy="salida-success-title" panelTestId="salida-success-dialog">
      <div className="max-h-[85vh] overflow-y-auto p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="salida-success-title" className="text-lg font-bold text-gray-900">
              {t('salida.successTitle')}
            </h2>
            <p className="text-sm text-gray-500">{t('salida.successSubtitle')}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('salida.close')}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div
          className={`rounded-lg border p-3 text-sm font-medium ${
            erp === 'ok'
              ? 'border-green-200 bg-green-50 text-green-800'
              : erp === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
          data-testid="salida-erp-answer"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide">{t('salida.erpAnswer')}</p>
          <p>{erpMessage?.trim() ? erpMessage : erpLine}</p>
        </div>

        {movement && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-gray-700">
              {formatDateLabel(movement.movement_date)} · {String(movement.username ?? '').toUpperCase()}
            </p>

            {SALIDA_BLOCKS.map((block) => {
              const products = grouped?.[block] ?? [];
              if (products.length === 0) return null;
              return (
                <div key={block}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{labels[block]}</h3>
                  <ul className="mt-1 space-y-1">
                    {products.map((product) => {
                      const quantity = salidaQuantity(
                        movement.items.find((item) => item.product_code === product.code)?.quantity,
                      );
                      return (
                        <li key={product.code} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 break-words text-gray-800">
                            <span className="font-mono text-xs text-gray-500">{product.code}</span>{' '}
                            {product.name}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                            {quantity} {t('salida.unitsShort')}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            <p className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2 text-sm font-bold">
              <span>{t('salida.totalUnits')}</span>
              <span className="tabular-nums" data-testid="salida-success-total">
                {salidaTotalUnits(movement.items)} {t('salida.unitsShort')}
              </span>
            </p>

            {movement.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {movement.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.publicUrl || photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square overflow-hidden rounded-md border border-gray-200"
                    title={t('salida.photoDownload')}
                  >
                    <img
                      src={photo.publicUrl || photo.url}
                      alt={t('salida.photoDownload')}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleCopy()}
            className="min-h-[44px] flex-1"
            data-testid="salida-copy-summary"
          >
            <Copy className="h-4 w-4" />
            {t('salida.copySummary')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleShare()}
            className="min-h-[44px] flex-1 bg-green-600 text-white hover:bg-green-700"
            data-testid="salida-share-whatsapp"
          >
            <MessageCircle className="h-4 w-4" />
            {t('salida.shareWhatsApp')}
          </Button>
        </div>

        {note && (
          <p role="status" className="mt-2 text-sm text-gray-600">
            {note}
          </p>
        )}
      </div>
    </Dialog>
  );
}
