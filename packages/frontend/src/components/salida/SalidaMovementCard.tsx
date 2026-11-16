import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff, MessageCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { formatDateLabel } from '../../lib/date';
import {
  SALIDA_BLOCKS,
  canRelaunchSalida,
  salidaEntLans,
  salidaPrimaryStatus,
  salidaPrimaryStatusLabelKey,
  salidaProductsByBlock,
  salidaQuantity,
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
  // The retention cleanup deletes the file and its row together, so a card drawn from a cached page can point at
  // bytes the server no longer has. The ids it answered 404 for are remembered so the tile can say so instead of
  // leaving the browser's broken-image glyph where a photo used to be.
  const [unavailablePhotos, setUnavailablePhotos] = useState<ReadonlySet<number>>(() => new Set());
  const markPhotoUnavailable = (photoId: number) =>
    setUnavailablePhotos((current) => new Set(current).add(photoId));
  const status = salidaPrimaryStatus(movement);
  const entLans = salidaEntLans(movement);
  const blocks = SALIDA_BLOCKS.filter((block) => movement.items.some((item) => item.block === block));
  const label = (block: SalidaBlock): string => t(`salida.blocks.${block}`);

  const badgeToneClass =
    status === 'sent'
      ? 'border-blue-200 bg-blue-50 text-blue-800'
      : status === 'reconciled'
        ? 'border-green-200 bg-green-50 text-green-800'
        : status === 'partial'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-gray-300 bg-gray-100 text-gray-700';

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
            className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeToneClass}`}
            data-testid={`salida-badge-${movement.id}`}
          >
            {t(salidaPrimaryStatusLabelKey(status))}
          </span>
        </div>

        <ul className="mt-3 space-y-1">
          {movement.items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-3 text-sm"
              data-testid={`salida-item-${item.id}`}
            >
              {/* Name and quantity, one row. The code and the block used to ride along in front of the name;
                  the block is already named in the header of the card, and the code stays where it is read
                  instead of where it is drawn. */}
              <span
                className="min-w-0 break-words text-gray-800"
                aria-label={`${item.product_code} ${item.product_name}`}
              >
                {item.product_name}
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
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {movement.photos.map((photo) =>
                unavailablePhotos.has(photo.id) ? (
                  <div
                    key={photo.id}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 bg-gray-50 p-1 text-center"
                    data-testid={`salida-photo-unavailable-${photo.id}`}
                  >
                    <ImageOff className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    <span className="text-[11px] font-semibold leading-tight text-gray-700">
                      {t('salida.photoUnavailable')}
                    </span>
                  </div>
                ) : (
                  <a
                    key={photo.id}
                    href={photo.publicUrl || photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square overflow-hidden rounded-md border border-gray-200"
                    title={t('salida.photoDownload')}
                    data-testid={`salida-photo-${photo.id}`}
                  >
                    <img
                      src={photo.publicUrl || photo.url}
                      alt={t('salida.photoDownload')}
                      className="h-full w-full object-cover"
                      onError={() => markPhotoUnavailable(photo.id)}
                    />
                  </a>
                ),
              )}
            </div>
            {unavailablePhotos.size > 0 && (
              <p className="text-xs text-gray-500" data-testid="salida-photo-unavailable-note">
                {t('salida.photoUnavailableBody')}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-400">{t('salida.noPhotos')}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onShare(movement)}
            className="min-h-[44px] w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto"
            data-testid={`salida-share-${movement.id}`}
          >
            <MessageCircle className="h-4 w-4" />
            {t('salida.shareWhatsApp')}
          </Button>
          {canRelaunchSalida(movement) && onResend && (
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
    <div
      className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center"
      role="group"
      aria-label={t('salida.filterBlock')}
      data-testid="salida-block-filter"
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            aria-pressed={active}
            className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors sm:w-auto sm:justify-start ${
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
