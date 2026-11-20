import { useId } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './dialog';
import { Button } from './button';

/**
 * La respuesta de una acción, en una ventana que el operario cierra.
 *
 * Un error o un éxito de guardado no es parte de la página: es lo que acaba de pasar. Dibujado como banner en la
 * tabla o en el formulario se lee como estado, compite con el contenido y desaparece solo. Acá tiene título, el
 * texto de la acción, un tono -- rojo para el rechazo, verde para el éxito -- y el botón que lo cierra; no se
 * cierra solo, porque leerlo es lo único que hay que hacer con él.
 *
 * El diálogo y su teclado (Escape, Tab encerrado, foco devuelto) son los de `Dialog`, el mismo que usan las
 * previsualizaciones: una sola implementación accesible para todas las ventanas del cliente.
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
    <Dialog open={open} onClose={onClose} labelledBy={titleId} describedBy={messageId} panelTestId={testId}>
      <div className="flex items-start gap-3">
        {isError ? (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-gray-900">
            {heading}
          </h2>
          <p id={messageId} className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
            {message}
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          onClick={onClose}
          className="min-h-[44px] w-full sm:w-auto"
          data-testid={`${testId}-close`}
        >
          {t('ui.close')}
        </Button>
      </div>
    </Dialog>
  );
}
