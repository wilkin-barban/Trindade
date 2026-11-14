import { useTranslation } from 'react-i18next';
import { Camera, Trash2 } from 'lucide-react';
import { SALIDA_MAX_PHOTOS } from '../../lib/salida';

/** A photo the operator picked and that has not reached the server yet. */
export interface SalidaPendingPhoto {
  id: string;
  file: File;
  /** Object URL of the local file; revoked by whoever owns the list. */
  previewUrl: string;
}

/**
 * The optional photos of a launch, with the pattern the report already uses: the camera behind the input,
 * a preview of what was picked, one button to take it back, and the server's limits said before the tap.
 *
 * It draws and reports; it does not decide. The count, the size and the MIME come from `lib/salida.ts` so the
 * rule the form enforces is the same rule a node test pins, and a file the server would refuse never leaves the
 * page.
 */
export function SalidaPhotoPicker({
  photos,
  onAdd,
  onRemove,
  error,
  disabled = false,
}: {
  photos: readonly SalidaPendingPhoto[];
  onAdd: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  error: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const full = photos.length >= SALIDA_MAX_PHOTOS;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{t('salida.photosTitle')}</h2>
          <p className="text-xs text-gray-500">{t('salida.photosSubtitle')}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-500">
          {photos.length}/{SALIDA_MAX_PHOTOS}
        </span>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-lg border border-gray-200"
            >
              <img src={photo.previewUrl} alt={photo.file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(photo.id)}
                className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow"
                aria-label={t('salida.photoRemove')}
                data-testid={`salida-photo-remove-${photo.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label
          className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 ${
            disabled || full ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-gray-50'
          }`}
        >
          <Camera className="h-4 w-4" />
          {t('salida.photoAdd')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            className="hidden"
            disabled={disabled || full}
            onChange={(event) => {
              onAdd(event.target.files);
              event.target.value = '';
            }}
            data-testid="salida-photo-input"
          />
        </label>
        <p className="text-[11px] text-gray-500">
          {t('salida.photoHelp', { count: photos.length, max: SALIDA_MAX_PHOTOS })}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600" data-testid="salida-photo-error">
          {error}
        </p>
      )}
    </div>
  );
}
