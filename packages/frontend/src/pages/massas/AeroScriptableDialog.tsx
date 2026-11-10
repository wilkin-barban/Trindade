import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { AERO_SCRIPTABLE_APP_URL, AERO_SCRIPTABLE_CODE_PATH } from '../../lib/aero-integration';

interface AeroScriptableDialogProps {
  open: boolean;
  onClose: () => void;
}

/** El asset crudo, mientras viaja. El botón nace deshabilitado y se habilita cuando el texto ya está en memoria. */
type CodeState =
  | { status: 'loading' }
  | { status: 'ready'; code: string }
  | { status: 'error' };

/** Lo que el operario ve después de tocar Copiar. */
type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Segunda puerta de la copia, la de Safari.
 *
 * Un `textarea` fuera de pantalla con el texto ya seleccionado y `document.execCommand('copy')` sigue siendo
 * lo único que copia dentro de un gesto del usuario cuando la API del portapapeles no existe o rechaza la
 * escritura. `select()` no alcanza en iOS: hace falta el rango explícito. El nodo se va siempre, copie o no.
 */
function copyThroughTextarea(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Copia el código crudo por la primera puerta que responda.
 *
 * El texto llega por parámetro, ya cargado: el click no espera un `fetch`, así que la escritura sigue dentro
 * del gesto que iOS exige. Si la API del portapapeles no está o rechaza -- Safari viejo, permiso denegado -- se
 * cae al `textarea`, y sólo si las dos fallan se informa el error accionable.
 */
async function copyScriptCode(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Sin puerta asíncrona queda el gesto: se sigue abajo con el `textarea`.
    }
  }
  return copyThroughTextarea(text);
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
 * navegador. El puente es un script de Scriptable que se instala una sola vez **copiando el código**: el
 * archivo empaquetado se abrió en el editor del teléfono, Scriptable leyó el JSON y falló con `Unexpected
 * token ':'`, así que la página ya no ofrece ninguna descarga.
 *
 * No hay contraseña, ni cabecera de autorización, ni enlace a un puente anterior: la página pide un ticket de
 * un solo uso y el script lo canjea. Lo que se muestra acá es el camino de instalación, nada más.
 */
export function AeroScriptableDialog({ open, onClose }: AeroScriptableDialogProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState<CodeState>({ status: 'loading' });
  const [copy, setCopy] = useState<CopyState>('idle');
  /** El «Copiado» es una confirmación, no un estado: a los dos segundos vuelve el botón de copiar. */
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  /**
   * El código se carga al abrir el diálogo.
   *
   * Cargarlo en el click haría que la escritura al portapapeles ocurriera después de un `await`, fuera del
   * gesto que iOS exige, y la copia fallaría justo en el teléfono que la necesita. Un fallo de carga es un
   * error accionable y deja el botón deshabilitado: nunca se copia otra cosa que no sea el script.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCode({ status: 'loading' });
    setCopy('idle');
    fetch(AERO_SCRIPTABLE_CODE_PATH)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setCode({ status: 'ready', code: text });
      })
      .catch(() => {
        if (!cancelled) setCode({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleCopy = async () => {
    if (code.status !== 'ready') return;
    const copied = await copyScriptCode(code.code);
    setCopy(copied ? 'copied' : 'failed');
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = copied ? setTimeout(() => setCopy('idle'), 2500) : null;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="aero-scriptable-title"
      describedBy="aero-scriptable-intro"
      panelTestId="aero-scriptable-dialog"
    >
      {/* Una sola columna y un solo scroll: en un iPhone de 375 px el título y los botones se quedan
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
              title={t('massas.aero.scriptableCopyButton')}
              hint={t('massas.aero.scriptableCopyHint')}
            >
              {/* El texto ya está en memoria: el toque sólo escribe en el portapapeles. */}
              <Button
                type="button"
                onClick={() => void handleCopy()}
                disabled={code.status !== 'ready'}
                data-testid="aero-scriptable-copy"
                className="mt-2.5 min-h-[44px] w-full bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700"
              >
                {copy === 'copied' ? t('massas.aero.scriptableCopied') : t('massas.aero.scriptableCopyButton')}
              </Button>
              {/* El botón ya dice «Copiado»; la región viva existe para que el lector de pantalla lo anuncie. */}
              {copy === 'copied' && (
                <p role="status" className="sr-only">
                  {t('massas.aero.scriptableCopied')}
                </p>
              )}
              {copy === 'failed' && (
                <p role="alert" className="mt-2 text-xs leading-relaxed text-red-700">
                  {t('massas.aero.scriptableCopyFailed')}
                </p>
              )}
              {code.status === 'error' && (
                <p role="alert" className="mt-2 text-xs leading-relaxed text-red-700">
                  {t('massas.aero.scriptableLoadFailed')}
                </p>
              )}
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
