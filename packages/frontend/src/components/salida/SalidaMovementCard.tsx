import { useTranslation } from 'react-i18next';
import { RefreshCw, Share2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { formatDateLabel } from '../../lib/date';
import {
  SALIDA_BLOCKS,
  salidaEntLans,
  salidaProductsByBlock,
  salidaQuantity,
  salidaReconciliationLabelKey,
  salidaReconciliationStatus,
  salidaTotalUnits,
  type SalidaBlock,
  type SalidaMovement,
} from '../../lib/salida';

/**
 * One movement of the history, as a card: what left, when, by whom, and whether the company agreed.
 *
 * The history is a record, so nothing here edits a quantity. The two actions it does carry are the two the
 * record still needs: share, which is how the plant reports, and `Reenviar ao ERP`, which only appears for a
 * movement the ERP has not confirmed at all. A reconciled card would invite a second exit, and a partially
 * reconciled one would duplicate the seats the company already has.
 */
export function SalidaMovementCard({
  movement,
  timeLabel,
  onShare,
  onResend,
  resending = false,
}: {
  movement: SalidaMovement;
  timeLabel: string;
  onShare: (movement: SalidaMovement) => void;
  onResend?: (movement: SalidaMovement) => void;
  resending?: boolean;
}) {
  const { t } = useTranslation();
  const status = salidaReconciliationStatus(movement);
  const entLans = salidaEntLans(movement);
  const blocks = SALIDA_BLOCKS.filter((block) => movement.items.some((item) => item.block === block));
  const grouped = salidaProductsByBlock(
    movement.items.map((item) => ({ code: item.product_code, name: item.product_name, block: item.block })),
  );
  const label = (block: SalidaBlock): string => t(`salida.blocks.${block}`);

  return (
    <Card className="border-gray-200 shadow-sm" data-testid={`salida-movement-${movement.id}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {formatDateLabel(movement.movement_date)} · {timeLabel}
            </p>
            <p className="text-xs text-gray-500">
              {t('salida.operatorLabel')}:{' '}
              <span className="font-medium text-gray-700">
                {movement.display_name?.trim() || String(movement.username ?? '').toUpperCase()}
              </span>
              {blocks.length > 0 && (
                <>
                  {' · '}
                  {t('salida.blocksLabel')}: {blocks.map((block) => label(block)).join(', ')}
                </>
              )}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              status === 'reconciled'
                ? 'border-green-200 bg-green-50 text-green-800'
                : status === 'partial'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-gray-300 bg-gray-100 text-gray-700'
            }`}
            data-testid={`salida-badge-${movement.id}`}
          >
            {t(salidaReconciliationLabelKey(status))}
          </span>
        </div>

        <ul className="mt-3 space-y-1">
          {movement.items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-3 text-sm"
              data-testid={`salida-item-${item.id}`}
            >
              <span className="min-w-0 break-words text-gray-800">
                <span className="font-mono text-xs text-gray-500">{item.product_code}</span> {item.product_name}
                <span className="ml-1 text-[11px] text-gray-400">{label(item.block)}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                {salidaQuantity(item.quantity)} {t('salida.unitsShort')}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
          <p className="text-sm font-bold text-gray-900">
            {t('salida.totalUnits')}:{' '}
            <span className="tabular-nums" data-testid={`salida-total-${movement.id}`}>
              {salidaTotalUnits(movement.items)} {t('salida.unitsShort')}
            </span>
          </p>
          {entLans.length > 0 && (
            <p className="text-[11px] font-medium text-gray-500" data-testid={`salida-entlan-${movement.id}`}>
              {t('salida.entLan')}: {entLans.join(', ')}
            </p>
          )}
        </div>

        {movement.photos.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
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
        ) : (
          <p className="mt-3 text-xs text-gray-400">{t('salida.noPhotos')}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onShare(movement)}
            className="min-h-[44px]"
            data-testid={`salida-share-${movement.id}`}
          >
            <Share2 className="h-4 w-4" />
            {t('salida.share')}
          </Button>
          {status === 'pending' && onResend && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onResend(movement)}
              disabled={resending}
              className="min-h-[44px]"
              data-testid={`salida-resend-${movement.id}`}
            >
              <RefreshCw className={`h-4 w-4 ${resending ? 'animate-spin' : ''}`} />
              {resending ? t('salida.resendingErp') : t('salida.resendErp')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The block filter of the history: every block, or one of them. */
export function SalidaBlockFilter({
  value,
  onChange,
}: {
  value: SalidaBlock | 'all';
  onChange: (next: SalidaBlock | 'all') => void;
}) {
  const { t } = useTranslation();
  const options: Array<{ key: SalidaBlock | 'all'; label: string }> = [
    { key: 'all', label: t('salida.allBlocks') },
    ...SALIDA_BLOCKS.map((block) => ({ key: block, label: t(`salida.blocks.${block}`) })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('salida.filterBlock')}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            aria-pressed={active}
            className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
              active
                ? 'border-blue-600 bg-blue-50 text-blue-900'
                : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
            }`}
            data-testid={`salida-block-filter-${option.key}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
