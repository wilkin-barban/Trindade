import { useId } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './dialog';
import { Button } from './button';

/**
 * La respuesta de una acción, en una ventana de producto.
 *
 * Un error o un éxito de guardado no es parte de la página: es lo que acaba de pasar. La ventana tiene dos niveles
 * -- el título de la acción y su mensaje -- y se lee de un vistazo en un teléfono: una cabecera tonal con el icono
 * en su badge y el título, un cuerpo que respira y un pie con el botón que la cierra. Nada se cierra solo, porque
 * leerlo es lo único que hay que hacer con él.
 *
 * El color no es la única señal: el icono y el título dicen lo mismo que el tono, y el botón X de la cabecera y el
 * del pie cierran. El diálogo y su teclado (Escape, Tab encerrado, foco devuelto) son los de `Dialog`; acá sólo se
 * define la forma del panel y lo que hay adentro.
 */
export function MessageDialog({
  open,
  title,
  message,
  tone = 'error',
  onClose,
  testId = 'message-dialog',
}: {
  open: boolean;
  title?: string;
  message: string;
  tone?: 'error' | 'success';
  onClose: () => void;
  testId?: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const messageId = useId();
  const isError = tone === 'error';
  const heading = title ?? t(isError ? 'ui.actionFailed' : 'ui.actionDone');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={messageId}
      panelTestId={testId}
      panelClassName="relative flex max-h-[85vh] w-[calc(100%-1.5rem)] max-w-[26rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
    >
      {/* Cabecera tonal: el icono en su badge y el título. El tono se dice con las dos cosas, no sólo con el color. */}
      <div className={`flex items-start gap-3 px-5 pt-5 pb-4 ${isError ? 'bg-red-50' : 'bg-emerald-50'}`}>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            isError ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
          }`}
          aria-hidden="true"
        >
          {isError ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </span>
        <h2 id={titleId} className="min-w-0 flex-1 pt-1.5 text-lg font-semibold text-gray-900">
          {heading}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('ui.close')}
          className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
          data-testid={`${testId}-dismiss`}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Cuerpo: el mensaje, con su propio scroll para que un texto largo no empuje el botón fuera de la pantalla. */}
      <div className="px-5 py-4">
        <p
          id={messageId}
          className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-6 text-gray-700"
        >
          {message}
        </p>
      </div>

      <div className="flex justify-end border-t border-gray-100 bg-gray-50/70 px-5 py-4">
        <Button
          type="button"
          onClick={onClose}
          className="min-h-[44px] w-full sm:w-auto sm:min-w-[120px]"
          data-testid={`${testId}-close`}
        >
          {t('ui.close')}
        </Button>
      </div>
    </Dialog>
  );
}
