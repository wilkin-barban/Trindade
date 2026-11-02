import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiClientError } from '../../api/client';
import { cleanPhone, filterPhoneInput } from '../../lib/phone';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export interface DriverFormProps {
  onSaved: (driver: {
    id: number;
    name: string;
    license_plate: string | null;
    phone: string | null;
  }) => void;
  onCancel: () => void;
}

export function DriverForm({ onSaved, onCancel }: DriverFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      // Sin chapa: este alta es la de un fletero, y la chapa que la planta le asigna a un viaje se elige en
      // la pestaña de los motoristas de la casa. El endpoint la sigue aceptando para los registros viejos.
      const data = await api.post<{
        driver: { id: number; name: string; license_plate: string | null; phone: string | null };
      }>('/loading/drivers', {
        name: name.trim(),
        phone: cleanPhone(phone) || undefined,
      });
      onSaved(data.driver);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t('loading.saveError')
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="driver-form">
      <Input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('loading.driverName')}
        required
        autoFocus
        disabled={saving}
        data-testid="driver-form-name"
      />
      <Input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(filterPhoneInput(e.target.value))}
        placeholder={t('loading.phone')}
        disabled={saving}
        data-testid="driver-form-phone"
      />
      {error && (
        <p className="text-sm text-red-600" role="alert" data-testid="driver-form-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving} data-testid="driver-form-submit">
          {saving ? t('ui.loading') : t('loading.saveFletero')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          {t('ui.cancel')}
        </Button>
      </div>
    </form>
  );
}
