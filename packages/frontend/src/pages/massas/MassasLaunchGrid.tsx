import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Send } from 'lucide-react';
import type { MassaProductTotal } from '../../lib/massas';

interface MassasLaunchGridProps {
  products: MassaProductTotal[];
  quantities: Record<string, string>;
  onQuantityChange: (code: string, rawVal: string) => void;
  onLaunch: () => void;
  submitting: boolean;
  /**
   * A closed day: the grid shows what the plant produced and offers no way to add to it.
   *
   * The buttons and the box fields are the gesture that creates a row, so a read-only grid draws neither.
   */
  readOnly?: boolean;
  /** Optional control rendered beside the launch button, e.g. the company-sync switch. */
  erpControl?: ReactNode;
}

export function MassasLaunchGrid({
  products,
  quantities,
  onQuantityChange,
  onLaunch,
  submitting,
  readOnly = false,
  erpControl,
}: MassasLaunchGridProps) {
  const { t } = useTranslation();

  const itemsToLaunch = useMemo(() => {
    return products
      .map((p) => {
        const boxesNum = parseInt(quantities[p.code] || '0', 10);
        return {
          boxes: boxesNum,
          units: boxesNum * p.unitsPerBox,
        };
      })
      .filter((item) => item.boxes > 0);
  }, [products, quantities]);

  const totalLaunchBoxes = itemsToLaunch.reduce((acc, curr) => acc + curr.boxes, 0);
  const totalLaunchUnits = itemsToLaunch.reduce((acc, curr) => acc + curr.units, 0);

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardContent className="p-4 sm:p-6">
        {/* Sin cabecera propia: la tarjeta de arriba ya dice "Lançamento de Massas" y con el H2
            repetido quedaban dos títulos iguales seguidos. Tampoco repite la fecha, que el operario
            acaba de elegir arriba y que el campo muestra en su formato local, no en ISO. Queda solo
            el vivo de cajas, que sí cambia mientras se escribe, y aparece únicamente si hay algo. */}
        {totalLaunchBoxes > 0 && (
          <div className="mb-4 text-right">
            <span className="block text-xs font-semibold uppercase text-gray-500">{t('massas.liveUnits')}</span>
            <span className="text-base font-bold text-amber-700">
              {totalLaunchBoxes} cx · {totalLaunchUnits} un
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const currentBoxes = quantities[product.code] || '';
            const numBoxes = parseInt(currentBoxes || '0', 10);
            const liveUnits = numBoxes * product.unitsPerBox;

            return (
              <div
                key={product.code}
                data-testid={`massas-product-${product.code}`}
                className={`flex items-center gap-2 rounded-lg border p-3 transition-colors ${
                  numBoxes > 0 ? 'bg-amber-50/50 border-amber-300 shadow-xs' : 'bg-gray-50/50 border-gray-200'
                }`}
              >
                {/* Nombre a la izquierda con las unidades por caja como sublinea, y el campo con las unidades
                    calculadas a la derecha: la misma fila que `SalidaProductRow`. Apilar el nombre arriba del
                    campo gastaba dos renglones por producto, veinte en un telefono. Sin `truncate`: en una
                    pantalla tactil no hay tooltip que rescate un nombre cortado. */}
                <div className="min-w-0 flex-1">
                  <span
                    className="block break-words text-xs font-bold leading-snug text-gray-800"
                    title={product.name}
                  >
                    {product.name}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium text-gray-500">
                    {product.unitsPerBox} un/cx
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {readOnly ? (
                    // The day's own number, in the place the field would be: the operator reads the record
                    // instead of an empty box that suggests it can still be filled.
                    <span
                      className="flex h-11 min-w-[4.5rem] items-center justify-center rounded-md border border-gray-200 bg-white px-2 text-base font-bold text-gray-900 sm:h-9 sm:text-sm"
                      data-testid={`massas-closed-${product.code}`}
                    >
                      {product.totalBoxes} cx
                    </span>
                  ) : (
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="0 cx"
                      value={currentBoxes}
                      onChange={(e) => onQuantityChange(product.code, e.target.value)}
                      aria-label={product.name}
                      className="h-11 w-20 text-base text-center font-bold sm:h-9 sm:text-sm"
                    />
                  )}
                  <span
                    className={`w-14 shrink-0 text-right text-xs font-semibold ${
                      numBoxes > 0 ? 'text-amber-700' : 'text-gray-500'
                    }`}
                  >
                    {liveUnits} un
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Row: Botón Lançar SIN botón resetear. En un día cerrado no hay fila: no hay nada que lanzar. */}
        {!readOnly && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-gray-100">
            {erpControl && <div className="w-full sm:w-auto sm:mr-auto">{erpControl}</div>}
            <Button
              type="button"
              onClick={onLaunch}
              disabled={itemsToLaunch.length === 0 || submitting}
              className="min-h-[44px] w-full bg-amber-600 px-6 font-semibold text-white hover:bg-amber-700 sm:w-auto"
            >
              <Send className="h-4 w-4 mr-2" />
              {submitting ? t('massas.launching') : t('massas.launch')}
              {totalLaunchBoxes > 0 && ` (${totalLaunchBoxes} cx)`}
            </Button>
          </div>
        )}
        {readOnly && (
          <p
            className="mt-6 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600"
            data-testid="massas-day-closed"
          >
            {t('massas.dayClosed', 'Histórico somente leitura: este dia não aceita novos lançamentos.')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
