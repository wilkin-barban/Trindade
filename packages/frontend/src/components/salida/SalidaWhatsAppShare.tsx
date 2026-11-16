import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Send } from 'lucide-react';
import { formatPhoneMask } from '../../lib/phone';

interface SalidaWhatsAppShareProps {
  phone: string;
  onPhoneChange: (val: string) => void;
  previewMessage: string;
  onOpenWhatsApp: () => void;
  copyNote?: string;
  disabled?: boolean;
}

export function SalidaWhatsAppShare({
  phone,
  onPhoneChange,
  previewMessage,
  onOpenWhatsApp,
  copyNote = '',
  disabled = false,
}: SalidaWhatsAppShareProps) {
  const { t } = useTranslation();

  return (
    <Card className="border-gray-200 shadow-sm" data-testid="salida-whatsapp-share-card">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('salida.whatsAppTitle')}</h2>
          <p className="text-xs text-gray-500">{t('salida.whatsAppSubtitle')}</p>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          {/* Phone input and actions */}
          <div className="space-y-4">
            <div>
              <label htmlFor="salida-whatsapp-phone" className="mb-1 block text-xs font-semibold uppercase text-gray-600">
                {t('salida.phoneLabel')}
              </label>
              <Input
                id="salida-whatsapp-phone"
                type="tel"
                inputMode="tel"
                placeholder={t('salida.phonePlaceholder')}
                value={phone}
                onChange={(e) => onPhoneChange(formatPhoneMask(e.target.value))}
                className="text-base font-medium"
                data-testid="salida-phone-input"
              />
              <span className="mt-1 block text-[11px] text-gray-500">
                {t('salida.phoneHint')}
              </span>
            </div>

            <div className="pt-2">
              <Button
                type="button"
                onClick={onOpenWhatsApp}
                disabled={disabled}
                className="w-full bg-green-600 font-semibold text-white hover:bg-green-700 sm:w-auto"
                data-testid="salida-share-day"
              >
                <Send className="mr-2 h-4 w-4" />
                {t('salida.openWhatsApp')}
              </Button>
            </div>

            {copyNote && (
              <div role="status" className="rounded border border-green-200 bg-green-50 p-2.5 text-xs text-green-800" data-testid="salida-share-note">
                {copyNote}
              </div>
            )}
          </div>

          {/* Live Message Preview */}
          <div className="space-y-1">
            <span className="block text-xs font-semibold uppercase text-gray-500">
              {t('salida.previewTitle')}
            </span>
            <div
              className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-800 sm:text-sm"
              data-testid="salida-preview-message"
            >
              {previewMessage || t('salida.shareDayEmpty')}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
