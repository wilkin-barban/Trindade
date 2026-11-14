import { useTranslation } from 'react-i18next';
import { Input } from '../ui/input';
import type { SalidaBlock, SalidaProduct } from '../../lib/salida';

/**
 * One block and the switch that says whether the operator is lowering anything of it today.
 *
 * The switch is the report's `BoxTypeSwitchRow` in its essentials -- one label, one switch, the whole row as the
 * target -- because the plant already knows that gesture. What is different is what the switch means: not "this
 * box type was mounted" but "these quantities are being typed". Switching a block off is the operator's way of
 * saying "nothing of this one", so the quantities go with it, and switching it back on returns an empty block
 * instead of resurrecting numbers the operator had already discarded.
 */
export function SalidaBlockSwitch({
  block,
  label,
  enabled,
  productCount,
  onToggle,
}: {
  block: SalidaBlock;
  label: string;
  enabled: boolean;
  productCount: number;
  onToggle: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <label
      className={`flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-2 ${
        enabled ? '' : 'opacity-70'
      }`}
      data-testid={`salida-block-${block}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-800">{label}</span>
        <span className="block text-xs text-gray-500">
          {enabled ? t('salida.summaryProducts') + `: ${productCount}` : t('salida.blocksHint')}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        onChange={(event) => onToggle(event.target.checked)}
        className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-gray-300 transition-colors checked:bg-blue-600"
        data-testid={`salida-block-switch-${block}`}
        aria-label={label}
      />
    </label>
  );
}

/**
 * One product of a block: its fixed Portuguese name and the units that leave.
 *
 * The catalogue code is not drawn any more. On a phone it was the widest thing in the row and the operator
 * never typed it: it stays in the accessible name and in the test id, and it travels in the message and in
 * the ERP payload, so nothing is lost by hiding it as text.
 */
export function SalidaProductRow({
  product,
  value,
  onChange,
}: {
  product: SalidaProduct;
  value: string;
  onChange: (raw: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border p-3 transition-colors ${
        value ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 bg-gray-50/50'
      }`}
      data-testid={`salida-product-${product.code}`}
    >
      {/* The name takes the free width and keeps the field on the same row: the code used to sit in front of
          it and the pair did not fit a 390 px screen without wrapping. */}
      <div className="min-w-0 flex-1">
        <span className="block break-words text-xs font-bold leading-snug text-gray-800">{product.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          placeholder="0"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          // 48px tall and a 16px font: the two floors a field needs to be typed into with one thumb, and the
          // reason a phone does not zoom the whole page when the field takes focus.
          className="h-12 w-20 text-center text-base font-bold"
          aria-label={`${product.code} ${product.name}`}
          data-testid={`salida-quantity-${product.code}`}
        />
        <span className="w-6 text-xs font-semibold text-gray-500">{t('salida.unitsShort')}</span>
      </div>
    </div>
  );
}

/** The active products of one block, one card per product. */
export function SalidaProductGrid({
  products,
  quantities,
  onQuantityChange,
}: {
  products: readonly SalidaProduct[];
  quantities: Readonly<Record<string, string>>;
  onQuantityChange: (code: string, raw: string) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <SalidaProductRow
          key={product.code}
          product={product}
          value={quantities[product.code] ?? ''}
          onChange={(raw) => onQuantityChange(product.code, raw)}
        />
      ))}
    </div>
  );
}
