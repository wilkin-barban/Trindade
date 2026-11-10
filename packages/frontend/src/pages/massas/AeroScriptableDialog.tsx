import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import {
  AERO_SCRIPTABLE_APP_URL,
  AERO_SCRIPTABLE_ASSET_PATH,
  AERO_SCRIPTABLE_NAME,
} from '../../lib/aero-integration';

interface AeroScriptableDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Un paso de la instalación: número, título, frase y, cuando hace falta, el control que lo ejecuta. */
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <li className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-800">
          {n}
        </span>
        <h3 className="min-w-0 break-words text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <p className="mt-1 break-words text-xs leading-relaxed text-gray-700">{hint}</p>
      {children}
    </li>
  );
}

/**
 * Cómo el teléfono consigue el proceso nativo que habla con la red de la fábrica.
 *
 * Safari no puede abrir un socket `http://` desde una página `https://`, así que cada escritura sale del
 * navegador. El puente es un archivo que se importa una vez en Scriptable -- no una receta de acciones que
 * alguien arma a mano en el teléfono -- y la página sólo ofrece las tres puertas: la app, el archivo y la vuelta.
 *
 * No hay contraseña, ni cabecera de autorización, ni enlace a un puente anterior: la página pide un ticket de
 * un solo uso y el script lo canjea. Lo que se muestra acá es el camino de instalación, nada más.
 */
export function AeroScriptableDialog({ open, onClose }: AeroScriptableDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="aero-scriptable-title"
      describedBy="aero-scriptable-intro"
      panelTestId="aero-scriptable-dialog"
    >
      {/* Una sola columna y un solo scroll: en un iPhone de 375 px el título y los dos botones se quedan
          quietos y el cuerpo se desplaza, en vez de dejar la salida cortada abajo. */}
      <div className="flex min-h-0 w-full max-w-lg flex-1 flex-col gap-3 p-4 sm:p-6">
        <div className="shrink-0 space-y-1">
          <h2 id="aero-scriptable-title" className="text-lg font-bold text-gray-900">
            {t('massas.aero.shortcutTitle')}
          </h2>
          <p id="aero-scriptable-intro" className="text-xs leading-relaxed text-gray-500 sm:text-sm">
            {t('massas.aero.shortcutIntro')}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ol className="space-y-3">
            <Step
              n={1}
              title={t('massas.aero.scriptableInstallTitle')}
              hint={t('massas.aero.scriptableInstallHint')}
            >
              <a
                href={AERO_SCRIPTABLE_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="aero-scriptable-app-store"
                className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-center text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                {t('massas.aero.scriptableInstallButton')}
              </a>
            </Step>

            <Step
              n={2}
              title={t('massas.aero.scriptableImportTitle')}
              hint={t('massas.aero.scriptableImportHint')}
            >
              {/* `download` es lo que hace que el toque baje el archivo en vez de abrirlo como texto: el
                  operario lo toca en Archivos y lo comparte con Scriptable. */}
              <a
                href={AERO_SCRIPTABLE_ASSET_PATH}
                download={`${AERO_SCRIPTABLE_NAME}.scriptable`}
                data-testid="aero-scriptable-asset"
                className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-amber-600 px-4 text-center text-sm font-semibold text-white hover:bg-amber-700"
              >
                {t('massas.aero.scriptableImportButton')}
              </a>
            </Step>

            <Step
              n={3}
              title={t('massas.aero.scriptableReturnTitle')}
              hint={t('massas.aero.scriptableReturnHint')}
            />
          </ol>

          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
            {t('massas.aero.scriptableOpenHint')}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {/* Abrir la app no dispara nada: el puente lo abre el botón de Trindade, con su ticket. */}
          <a
            href="scriptable://"
            data-testid="aero-scriptable-open"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 sm:flex-1"
          >
            {t('massas.aero.shortcutOpenApp')}
          </a>
          <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px] w-full sm:w-auto">
            {t('massas.aero.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
