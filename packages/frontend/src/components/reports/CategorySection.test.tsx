import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/config';
import { CategorySection, type CategoryType, type FormState, type TaskType } from './CategorySection';

/**
 * The switch of a box type: off, its block leaves the screen; on, it comes back empty.
 *
 * The state behind the switch lives in the page — `lib/report-box-types.ts` holds the rule and its own tests —
 * and this file holds the other half of it: that the switch exists, that it is the thing that hides the block,
 * and that a read-only report cannot move it.
 */
function task(id: number, categoryId: number, namePt: string): TaskType {
  return {
    id,
    category_id: categoryId,
    name_pt: namePt,
    name_es: namePt,
    task_type: 'check',
    sort_order: id,
    temperature_readings: 0,
  };
}

const PARENT: CategoryType = {
  id: 8,
  parent_category_id: null,
  name_pt: 'Montagem das Caixas',
  name_es: 'Montaje de Cajas',
  sort_order: 3,
  tasks: [task(23, 8, 'Montagem de caixas Produção')],
};

const SMALL_BOXES: CategoryType = {
  id: 9,
  parent_category_id: 8,
  name_pt: 'Caixas pequenas',
  name_es: 'Cajas pequeñas',
  sort_order: 5,
  tasks: [task(58, 9, 'Nhoque 400g')],
};

const TEMPERATURES: CategoryType = {
  id: 2,
  parent_category_id: null,
  name_pt: 'Temperaturas',
  name_es: 'Temperaturas',
  sort_order: 2,
  tasks: [
    {
      ...task(5, 2, 'Câmara Principal'),
      task_type: 'temperature',
      temperature_readings: 1,
    },
  ],
};

const ASSAI_BOXES: CategoryType = {
  id: 10,
  parent_category_id: 8,
  name_pt: 'Caixas Assai',
  name_es: 'Cajas Assai',
  sort_order: 6,
  tasks: [{ ...task(61, 10, 'Disgo 500g'), task_type: 'check_assai' }],
};

const PRODUCTS = { assai: ['Nhoque Kg', 'Quadrada'], normal: ['Nhoque 400g', 'Nhoque Kg'] };

const EMPTY_FORM: FormState = { items: {}, temperatures: {}, selectedProducts: {} };

function renderSection({
  disabledBoxTypeIds = [],
  onBoxTypeChange,
  readOnly,
}: {
  disabledBoxTypeIds?: number[];
  onBoxTypeChange?: (categoryId: number, enabled: boolean) => void;
  readOnly?: boolean;
} = {}) {
  return render(
    <CategorySection
      category={PARENT}
      products={PRODUCTS}
      children={[SMALL_BOXES, ASSAI_BOXES]}
      form={{ ...EMPTY_FORM, disabledBoxTypeIds }}
      onItemChange={vi.fn()}
      onTemperatureChange={vi.fn()}
      onSelectedProductsChange={vi.fn()}
      disabledBoxTypeIds={disabledBoxTypeIds}
      onBoxTypeChange={onBoxTypeChange}
      readOnly={readOnly}
    />,
  );
}

describe('CategorySection — the product offer', () => {
  it('draws the boxes the server offered, not a copy of them', () => {
    renderSection();

    expect(screen.getAllByText('Quadrada').length).toBeGreaterThan(0);
    expect(screen.getByTestId('product-task-61-Nhoque Kg')).toBeInTheDocument();
  });

  it('says the offer could not be read instead of offering nothing', () => {
    // An empty list would read as "this product does not exist", and an operator who reads that stops filing.
    render(
      <CategorySection
        category={PARENT}
        products={null}
        children={[ASSAI_BOXES]}
        form={EMPTY_FORM}
        onItemChange={vi.fn()}
        onTemperatureChange={vi.fn()}
        onSelectedProductsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('report-products-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('product-task-61-Nhoque Kg')).not.toBeInTheDocument();
  });

  it('does not let a read-only report select a product either', () => {
    renderSection({ readOnly: true });

    expect(screen.getByTestId('product-task-61-Nhoque Kg')).toBeDisabled();
  });
});

describe('CategorySection — box type switch', () => {
  it('draws one switch per box type, on by default, with its tasks under it', () => {
    renderSection();

    expect(screen.getByTestId('box-type-switch-9')).toBeChecked();
    expect(screen.getByTestId('box-type-switch-10')).toBeChecked();
    expect(screen.getByTestId('check-task-58')).toBeInTheDocument();
    expect(screen.getByTestId('product-task-61-Nhoque Kg')).toBeInTheDocument();
  });

  it('takes the block of a switched-off type off the screen and leaves the other one', () => {
    renderSection({ disabledBoxTypeIds: [9] });

    expect(screen.getByTestId('box-type-switch-9')).not.toBeChecked();
    expect(screen.queryByTestId('check-task-58')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-task-61-Nhoque Kg')).toBeInTheDocument();
    // The parent's own tasks are not a box type and never leave with a switch.
    expect(screen.getByTestId('check-task-23')).toBeInTheDocument();
  });

  it('asks the page to switch the type the operator pressed', () => {
    const onBoxTypeChange = vi.fn();
    renderSection({ onBoxTypeChange });

    fireEvent.click(screen.getByTestId('box-type-switch-10'));

    expect(onBoxTypeChange).toHaveBeenCalledWith(10, false);
  });

  it('draws a read-only report with nothing left to press', () => {
    render(
      <>
        <CategorySection
          category={PARENT}
          products={PRODUCTS}
          children={[SMALL_BOXES]}
          form={{ ...EMPTY_FORM, items: { 23: true } }}
          onItemChange={vi.fn()}
          onTemperatureChange={vi.fn()}
          onSelectedProductsChange={vi.fn()}
          readOnly
        />
        <CategorySection
          category={TEMPERATURES}
          products={PRODUCTS}
          form={{ ...EMPTY_FORM, temperatures: { 5: ['4'] } }}
          onItemChange={vi.fn()}
          onTemperatureChange={vi.fn()}
          readOnly
        />
      </>,
    );

    expect(screen.getByTestId('check-task-23')).toBeDisabled();
    expect(screen.getByTestId('check-task-58')).toBeDisabled();
    expect(screen.getByTestId('temperature-task-5')).toBeDisabled();
    expect(screen.getByTestId('temperature-task-5')).toHaveValue(4);
  });

  it('does not let a read-only report move the switch', () => {
    const onBoxTypeChange = vi.fn();
    renderSection({ onBoxTypeChange, readOnly: true });

    const boxSwitch = screen.getByTestId('box-type-switch-9');
    expect(boxSwitch).toBeDisabled();
    fireEvent.click(boxSwitch);
    expect(onBoxTypeChange).not.toHaveBeenCalled();
  });
});
