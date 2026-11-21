import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ImageOff, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { formatDateLabel } from '../../lib/date';
import {
  SALIDA_BLOCKS,
  SALIDA_MAX_PHOTOS,
  canRelaunchSalida,
  salidaOutboxIsOwed,
  type SalidaOutbox,
  salidaEntLans,
  salidaPhotoRejection,
  salidaPrimaryStatus,
  salidaPrimaryStatusLabelKey,
  salidaProductsByBlock,
  salidaQuantity,
  salidaTotalUnits,
  type SalidaBlock,
  type SalidaMovement,
} from '../../lib/salida';
import { api } from '../../api/client';

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
  queuedRetry,
  onRefresh,
  resending = false,
  readOnly = false,
  /** Las fotos son de quien lanzó el movimiento: las de otro operario se ven y no se tocan. */
  canManagePhotos = true,
  /**
   * Retirar un borrador. La pantalla lo pasa sólo cuando el servidor lo va a aceptar -- el dueño o el
   * Administrador, y el ERP sin confirmar -- y abre la confirmación.
   */
  onDelete,
}: {
  movement: SalidaMovement;
  timeLabel: string;
  onShare: (movement: SalidaMovement) => void;
  onResend?: (movement: SalidaMovement) => void;
  queuedRetry?: SalidaOutbox;
  onRefresh?: () => void;
  resending?: boolean;
  readOnly?: boolean;
  canManagePhotos?: boolean;
  onDelete?: (movement: SalidaMovement) => void;
}) {
  const { t } = useTranslation();
  // The retention cleanup deletes the file and its row together, so a card drawn from a cached page can point at
  // bytes the server no longer has. The ids it answered 404 for are remembered so the tile can say so instead of
  // leaving the browser's broken-image glyph where a photo used to be.
  const [unavailablePhotos, setUnavailablePhotos] = useState<ReadonlySet<number>>(() => new Set());
  const [uploading, setUploading] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState('');

  const markPhotoUnavailable = (photoId: number) =>
    setUnavailablePhotos((current) => new Set(current).add(photoId));

  const handleDeletePhoto = async (photoId: number) => {
    setDeletingPhotoId(photoId);
    setPhotoError('');
    try {
      await api.del(`/salida/photos/${photoId}`);
      onRefresh?.();
    } catch {
      setPhotoError(t('salida.photoDeleteError'));
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const handleAddPhoto = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const rejection = salidaPhotoRejection(
      fileList.map((f) => ({ size: f.size, type: f.type })),
      movement.photos.length,
    );
    if (rejection) {
      setPhotoError(
        rejection === 'count'
          ? t('salida.photoCountError', { max: SALIDA_MAX_PHOTOS })
          : rejection === 'size'
            ? t('salida.photoSizeError')
            : t('salida.photoTypeError'),
      );
      return;
    }
    setPhotoError('');
    setUploading(true);
    try {
      for (const file of fileList) {
        const form = new FormData();
        form.append('file', file);
        await api.upload(`/salida/${movement.id}/photos`, form);
      }
      onRefresh?.();
    } catch {
      setPhotoError(t('salida.photoUploadError'));
    } finally {
      setUploading(false);
    }
  };

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

  const full = movement.photos.length >= SALIDA_MAX_PHOTOS;
  const canAddPhoto = !readOnly && canManagePhotos && !full;
  const help = t('salida.photoHelp', { count: movement.photos.length, max: SALIDA_MAX_PHOTOS });

  return (
    <Card className="border-gray-200 shadow-sm" data-testid={`salida-movement-${movement.id}`}>
      <CardContent className="p-4">
        {/* Cabecera en dos niveles: la fecha y su estado arriba, el operador y los bloques como línea de
            contexto. Antes el badge competía con la fecha y el operador caía en un tercer renglón. */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {formatDateLabel(movement.movement_date)} · {timeLabel}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              <span className="font-medium text-gray-700">
                {movement.display_name?.trim() || String(movement.username ?? '').toUpperCase()}
              </span>
              {blocks.length > 0 && (
                <>
                  {' · '}
                  {blocks.map((block) => label(block)).join(' · ')}
                </>
              )}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badgeToneClass}`}
            data-testid={`salida-badge-${movement.id}`}
          >
            {t(salidaPrimaryStatusLabelKey(status))}
          </span>
        </div>

        <ul className="mt-2.5 space-y-1">
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

        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-gray-100 pt-2">
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

        {/* La evidencia, con la densidad de un producto: miniaturas o una fila que dice que no hay, y la ayuda
            de formatos en 11 px. El selector gigante se fue a la grilla de acciones, del tamaño de los demás. */}
        {movement.photos.length > 0 ? (
          <div className="mt-2.5 space-y-1.5">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {movement.photos.map((photo) =>
                unavailablePhotos.has(photo.id) ? (
                  <div
                    key={photo.id}
                    className="relative flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 bg-gray-50 p-1 text-center"
                    data-testid={`salida-photo-unavailable-${photo.id}`}
                  >
                    <ImageOff className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    <span className="text-[11px] font-semibold leading-tight text-gray-700">
                      {t('salida.photoUnavailable')}
                    </span>
                    {!readOnly && canManagePhotos && (
                      <button
                        type="button"
                        onClick={() => void handleDeletePhoto(photo.id)}
                        disabled={deletingPhotoId === photo.id}
                        className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-700 disabled:opacity-50"
                        aria-label={t('salida.photoRemove')}
                        data-testid={`salida-photo-delete-${photo.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div key={photo.id} className="relative aspect-square overflow-hidden rounded-md border border-gray-200">
                    <a
                      href={photo.publicUrl || photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-full w-full"
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
                    {!readOnly && canManagePhotos && (
                      <button
                        type="button"
                        onClick={() => void handleDeletePhoto(photo.id)}
                        disabled={deletingPhotoId === photo.id}
                        className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-700 disabled:opacity-50"
                        aria-label={t('salida.photoRemove')}
                        data-testid={`salida-photo-delete-${photo.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ),
              )}
            </div>
            {unavailablePhotos.size > 0 && (
              <p className="text-xs text-gray-500" data-testid="salida-photo-unavailable-note">
                {t('salida.photoUnavailableBody')}
              </p>
            )}
            <p className="text-[11px] text-gray-500">{help}</p>
          </div>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-xs text-gray-400" data-testid={`salida-no-photos-${movement.id}`}>
              {t('salida.noPhotos')}
            </p>
            <p className="text-[11px] text-gray-500">· {help}</p>
          </div>
        )}

        {photoError && (
          <p role="alert" className="mt-1 text-xs text-red-600" data-testid="salida-photo-error">
            {photoError}
          </p>
        )}

        {!readOnly && canManagePhotos && full && (
          <p className="mt-1 text-[11px] font-medium text-gray-500" data-testid={`salida-photos-max-${movement.id}`}>
            {t('salida.photosMaxReached')}
          </p>
        )}

        {/* Dos por fila en el teléfono, en línea en escritorio. Ningún botón a todo el ancho: la tarjeta se lee
            como una ficha, no como cuatro barras. */}
        {!readOnly && canManagePhotos && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {canAddPhoto && (
              <label
                className={`inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 sm:w-auto ${
                  uploading ? 'pointer-events-none opacity-50' : ''
                }`}
                data-testid={`salida-photo-picker-${movement.id}`}
              >
                <Camera className="h-4 w-4 shrink-0" />
                {t('salida.photoAdd')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  capture="environment"
                  multiple
                  className="sr-only"
                  disabled={uploading}
                  onChange={(event) => {
                    void handleAddPhoto(event.target.files);
                    event.target.value = '';
                  }}
                  data-testid="salida-photo-input"
                />
              </label>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => onShare(movement)}
              className="min-h-[44px] w-full justify-center bg-green-600 text-white hover:bg-green-700 sm:w-auto"
              data-testid={`salida-share-${movement.id}`}
            >
              <MessageCircle className="h-4 w-4 shrink-0" />
              {/* «Compartilhar», no la frase entera: en la celda de 390 px el nombre largo se cortaba con
                  puntos suspensivos. El icono sigue diciendo de qué red se trata. */}
              <span className="truncate sm:overflow-visible">{t('salida.share')}</span>
            </Button>
            {(queuedRetry ? salidaOutboxIsOwed(queuedRetry, [movement]) : canRelaunchSalida(movement)) && onResend && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onResend(movement)}
                disabled={resending}
                className="min-h-[44px] w-full justify-center px-2 text-xs sm:w-auto"
                data-testid={`salida-resend-${movement.id}`}
              >
                <RefreshCw className={`h-4 w-4 ${resending ? 'animate-spin' : ''}`} />
                {resending ? t('salida.resendingErp') : t('salida.resendErp')}
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onDelete(movement)}
                className="min-h-[44px] w-full justify-center px-2 text-xs text-red-600 hover:bg-red-50 sm:w-auto"
                data-testid={`salida-delete-${movement.id}`}
              >
                <Trash2 className="h-4 w-4" />
                {t('salida.delete')}
              </Button>
            )}
          </div>
        )}
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
