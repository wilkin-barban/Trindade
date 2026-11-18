import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Send } from 'lucide-react';
import { formatPhoneMask } from '../../lib/phone';

interface MassasWhatsAppShareProps {
  phone: string;
  onPhoneChange: (val: string) => void;
  previewMessage: string;
  onOpenWhatsApp: () => void;
  /** El día no tiene nada que mandar: la vista previa lo dice y el botón no se puede tocar. */
  disabled?: boolean;
}

export function MassasWhatsAppShare({
  phone,
  onPhoneChange,
  previewMessage,
  onOpenWhatsApp,
  disabled = false,
}: MassasWhatsAppShareProps) {
  const { t } = useTranslation();

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardContent className="pt-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('massas.shareTitle')}</h2>
          <p className="text-xs text-gray-500">{t('massas.shareSubtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Phone input and actions */}
          <div className="space-y-4">
            <div>
              <label htmlFor="massa-whatsapp-phone" className="block text-xs font-semibold uppercase text-gray-600 mb-1">
                {t('massas.phoneLabel')}
              </label>
              <Input
                id="massa-whatsapp-phone"
                data-testid="massas-whatsapp-phone"
                type="tel"
                inputMode="tel"
                placeholder={t('massas.phonePlaceholder')}
                value={phone}
                onChange={(e) => onPhoneChange(formatPhoneMask(e.target.value))}
                className="font-medium text-base"
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                Ex: (11) 98765-4321 · O código +55 será adicionado automaticamente.
              </span>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button
                type="button"
                onClick={onOpenWhatsApp}
                disabled={disabled}
                className="flex-1 bg-green-600 font-semibold text-white hover:bg-green-700"
                data-testid="massas-share-day"
              >
                <Send className="mr-2 h-4 w-4" />
                {t('massas.openWhatsApp')}
              </Button>
            </div>
          </div>

          {/* Live Message Preview */}
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase text-gray-500 block">
              {t('massas.previewTitle')}
            </span>
            <div
              className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-800 sm:text-sm"
              data-testid="massas-preview-message"
            >
              {previewMessage || t('massas.shareDayEmpty')}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
