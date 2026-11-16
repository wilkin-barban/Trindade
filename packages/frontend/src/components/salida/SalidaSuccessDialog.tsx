import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { formatDateLabel } from '../../lib/date';
import { Button } from '../ui/button';
import {
  SALIDA_BLOCKS,
  salidaProductsByBlock,
  salidaQuantity,
  salidaTotalUnits,
  type SalidaBlock,
  type SalidaErpOutcome,
  type SalidaMovement,
} from '../../lib/salida';

export type { SalidaErpOutcome };

/**
 * The confirmation the operator reads after a launch (T1, T3).
 *
 * The ERP answer is drawn first with its honest verdict. After a launch, the operator sees the verdict
 * and the photos; the day summary and WhatsApp sharing belong to the history.
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

  const labels = useMemo<Record<SalidaBlock, string>>(
    () => ({
      embalagens: t('salida.blocks.embalagens'),
      bobinas: t('salida.blocks.bobinas'),
      'materia-prima': t('salida.blocks.materia-prima'),
    }),
    [t],
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
    erp === 'ok'
      ? t('salida.erpAccepted')
      : erp === 'partial'
        ? t('salida.erpPartialResult')
        : erp === 'unreadable'
          ? t('salida.erpUnreadable')
          : erp === 'error'
            ? t('salida.erpRejected')
            : t('salida.erpNoAnswer');

  const toneClass =
    erp === 'ok'
      ? 'border-green-200 bg-green-50 text-green-800'
      : erp === 'partial' || erp === 'unreadable'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : erp === 'error'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-gray-200 bg-gray-50 text-gray-800';

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

        <div className={`rounded-lg border p-3 text-sm font-medium ${toneClass}`} data-testid="salida-erp-answer">
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
                          <span
                            className="min-w-0 break-words text-gray-800"
                            aria-label={`${product.code} ${product.name}`}
                          >
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

        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onClose} className="min-h-[44px] w-full sm:w-auto" data-testid="salida-success-close">
            {t('salida.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
