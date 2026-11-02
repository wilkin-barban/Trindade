import { useTranslation } from 'react-i18next';
import { Input } from '../ui/input';
import { ASSAI_PRODUCTS, NORMAL_PRODUCTS } from './productTemplates';

// ---- Types ----

export interface CategoryType {
  id: number;
  parent_category_id?: number | null;
  name_pt: string;
  name_es: string;
  sort_order: number;
  tasks: TaskType[];
}

export interface TaskType {
  id: number;
  category_id: number;
  name_pt: string;
  name_es: string;
  task_type: 'check' | 'temperature' | 'check_assai' | 'check_normal';
  sort_order: number;
  temperature_readings: number;
}

export interface FormState {
  items: Record<number, boolean>;
  temperatures: Record<number, string[]>;
  selectedProducts?: Record<number, string[]>;
  /**
   * The box types this report does not mount, by their category's id.
   *
   * Off by absence rather than by a `false`, the way the phone keeps it: every form opens with every type on,
   * so the switch answers a question the operator asks instead of one the form assumed. The rule behind the
   * switch — and what happens to the answers of the type it turns off — lives in `lib/report-box-types.ts`.
   */
  disabledBoxTypeIds?: number[];
}

// ---- Props ----

interface CategorySectionProps {
  category: CategoryType;
  children?: CategoryType[];
  form: FormState;
  onItemChange: (taskId: number, checked: boolean) => void;
  onTemperatureChange: (taskId: number, readingIndex: number, value: string) => void;
  onSelectedProductsChange?: (taskId: number, products: string[]) => void;
  /** Switched off box types, by category id; see `FormState.disabledBoxTypeIds`. */
  disabledBoxTypeIds?: readonly number[];
  onBoxTypeChange?: (categoryId: number, enabled: boolean) => void;
  readOnly?: boolean;
}

// ---- Sub-components ----

function ProductCheckTask({
  task,
  products,
  selectedProducts,
  onChange,
  readOnly,
}: {
  task: TaskType;
  products: readonly string[];
  selectedProducts: string[];
  onChange: (selected: string[]) => void;
  readOnly?: boolean;
}) {
  const { i18n } = useTranslation();
  const isSpanish = i18n.language?.startsWith('es');
  const taskName = isSpanish && task.name_es ? task.name_es : task.name_pt;

  const handleProductToggle = (product: string, checked: boolean) => {
    if (readOnly) return;
    if (checked) {
      onChange([...selectedProducts, product]);
    } else {
      onChange(selectedProducts.filter((p) => p !== product));
    }
  };

  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm font-semibold text-gray-700 block mb-1">{taskName}</span>
      <div className="pl-4 space-y-1.5 mt-1">
        {products.map((prod) => {
          const isChecked = selectedProducts.includes(prod);
          return (
            <label key={prod} className={`flex items-center gap-3 py-1 ${readOnly ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'} hover:bg-gray-50 rounded px-2 -mx-2`}>
              <input
                type="checkbox"
                checked={isChecked}
                disabled={readOnly}
                onChange={(e) => handleProductToggle(prod, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                data-testid={`product-task-${task.id}-${prod}`}
              />
              <span className="text-sm text-gray-600 select-none">{prod}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CheckTask({
  task,
  checked,
  onChange,
}: {
  task: TaskType;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { i18n } = useTranslation();
  const isSpanish = i18n.language?.startsWith('es');
  const taskName = isSpanish && task.name_es ? task.name_es : task.name_pt;
  return (
    <label className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 rounded px-3 -mx-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        data-testid={`check-task-${task.id}`}
      />
      <span className="text-sm text-gray-800 select-none">{taskName}</span>
    </label>
  );
}

function TemperatureTask({
  task,
  values,
  onChange,
}: {
  task: TaskType;
  values: string[];
  onChange: (readingIndex: number, value: string) => void;
}) {
  const { i18n } = useTranslation();
  const isSpanish = i18n.language?.startsWith('es');
  const taskName = isSpanish && task.name_es ? task.name_es : task.name_pt;
  return (
    <div className="py-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">{taskName}</label>
      {Array.from({ length: task.temperature_readings }, (_, index) => {
        const readingIndex = index + 1;
        return (
          <div key={readingIndex} className="flex items-center gap-2 max-w-xs mb-1">
            {task.temperature_readings > 1 && <span className="text-xs text-gray-500 w-16">{`${readingIndex}º`}</span>}
            <Input
              type="number"
              value={values[index] ?? ''}
              onChange={(e) => onChange(readingIndex, e.target.value)}
              placeholder="-18"
              step="0.1"
              className="w-28"
              data-testid={readingIndex === 1 ? `temperature-task-${task.id}` : `temperature-task-${task.id}-${readingIndex}`}
            />
            <span className="text-sm text-gray-400">°C</span>
          </div>
        );
      })}
    </div>
  );
}

/** One box type and the switch that says whether the day mounted it, on a single line. */
function BoxTypeSwitchRow({
  categoryId,
  label,
  enabled,
  readOnly,
  onChange,
}: {
  categoryId: number;
  label: string;
  enabled: boolean;
  readOnly?: boolean;
  onChange?: (enabled: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 py-2 ${readOnly ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}
    >
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        disabled={readOnly || !onChange}
        onChange={(e) => {
          // Guarded here and not only by `disabled`: the disabled attribute is the browser's promise, and a
          // promise is not a rule. A read-only report has no switch to move, whoever asks.
          if (readOnly) return;
          onChange?.(e.target.checked);
        }}
        className="h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-gray-300 transition-colors checked:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={`box-type-switch-${categoryId}`}
        aria-label={label}
      />
    </label>
  );
}

// ---- Main Component ----

/** The tasks of one category, drawn without its heading: a root uses its own title, a nested type its switch. */
function TaskBlocks({
  tasks,
  form,
  onItemChange,
  onTemperatureChange,
  onSelectedProductsChange,
  readOnly,
}: {
  tasks: TaskType[];
  form: FormState;
  onItemChange: CategorySectionProps['onItemChange'];
  onTemperatureChange: CategorySectionProps['onTemperatureChange'];
  onSelectedProductsChange?: CategorySectionProps['onSelectedProductsChange'];
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1">
      {tasks.map((task) => {
          switch (task.task_type) {
            case 'check':
              return (
                <CheckTask
                  key={task.id}
                  task={task}
                  checked={form.items[task.id] ?? false}
                  onChange={(checked) => onItemChange(task.id, checked)}
                />
              );

            case 'check_assai':
              return (
                <ProductCheckTask
                  key={task.id}
                  task={task}
                  products={ASSAI_PRODUCTS}
                  selectedProducts={form.selectedProducts?.[task.id] ?? []}
                  onChange={(selected) => onSelectedProductsChange && onSelectedProductsChange(task.id, selected)}
                  readOnly={readOnly}
                />
              );

            case 'check_normal':
              return (
                <ProductCheckTask
                  key={task.id}
                  task={task}
                  products={NORMAL_PRODUCTS}
                  selectedProducts={form.selectedProducts?.[task.id] ?? []}
                  onChange={(selected) => onSelectedProductsChange && onSelectedProductsChange(task.id, selected)}
                  readOnly={readOnly}
                />
              );

            case 'temperature':
              return (
                <TemperatureTask
                  key={task.id}
                  task={task}
                  values={form.temperatures[task.id] ?? []}
                  onChange={(readingIndex, value) => onTemperatureChange(task.id, readingIndex, value)}
                />
              );

            default:
              return null;
          }
        })}
    </div>
  );
}

export function CategorySection({
  category,
  children,
  form,
  onItemChange,
  onTemperatureChange,
  onSelectedProductsChange,
  disabledBoxTypeIds,
  onBoxTypeChange,
  readOnly,
}: CategorySectionProps) {
  const { i18n } = useTranslation();
  const isSpanish = i18n.language?.startsWith('es');
  const catName = isSpanish && category.name_es ? category.name_es : category.name_pt;
  const switchedOff = disabledBoxTypeIds ?? [];

  return (
    <div className="mb-6">
      <h3 className="text-md font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-200">
        {catName}
      </h3>
      <TaskBlocks
        tasks={category.tasks}
        form={form}
        onItemChange={onItemChange}
        onTemperatureChange={onTemperatureChange}
        onSelectedProductsChange={onSelectedProductsChange}
        readOnly={readOnly}
      />
      {/* Cada hijo es un tipo de caja: su nombre, el interruptor que dice si el día lo montó, y sus tareas
          debajo solo mientras el interruptor está encendido. Un tipo apagado con su checklist a la vista era
          una pantalla de controles muertos; una decisión que se lee como una decisión es esto. */}
      {children?.map((child) => {
        const enabled = !switchedOff.includes(child.id);
        const childName = isSpanish && child.name_es ? child.name_es : child.name_pt;
        return (
          <div key={child.id} className="mt-5 ml-2 border-l-2 border-blue-100 pl-4">
            <BoxTypeSwitchRow
              categoryId={child.id}
              label={childName}
              enabled={enabled}
              readOnly={readOnly}
              onChange={onBoxTypeChange ? (value) => onBoxTypeChange(child.id, value) : undefined}
            />
            {enabled && (
              <TaskBlocks
                tasks={child.tasks}
                form={form}
                onItemChange={onItemChange}
                onTemperatureChange={onTemperatureChange}
                onSelectedProductsChange={onSelectedProductsChange}
                readOnly={readOnly}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
