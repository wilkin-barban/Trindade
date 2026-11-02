import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import type { CategoryType, TaskType } from './CategorySection';
import { BoxTypeList } from './CategorySection';

/**
 * The nested categories of one section, drawn without the parent's checklist.
 *
 * The report's Recebimento section is answered by the ERP mirror from the cutoff on, and the mirror replaces the
 * checklist of the category -- not the categories an administrator hung below it. A child is its own category
 * with its own answers, and a page that dropped the whole subtree because the parent changed hands would lose
 * them without saying so.
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

const CHILD: CategoryType = {
  id: 41,
  parent_category_id: 4,
  name_pt: 'Recebimento de congelados',
  name_es: 'Recepción de congelados',
  sort_order: 1,
  tasks: [task(410, 41, 'Conferência do congelado')],
};

function renderList(childrenCategories: CategoryType[], readOnly?: boolean) {
  return render(
    <BoxTypeList
      title="Recebimento"
      childrenCategories={childrenCategories}
      products={{ assai: ['Nhoque Kg'], normal: ['Nhoque 400g'] }}
      form={{ items: {}, temperatures: {}, selectedProducts: {} }}
      onItemChange={vi.fn()}
      onTemperatureChange={vi.fn()}
      onBoxTypeChange={vi.fn()}
      readOnly={readOnly}
    />,
  );
}

afterEach(async () => {
  await i18n.changeLanguage('es');
});

describe('BoxTypeList', () => {
  it('draws the heading and the children as switchable types', () => {
    renderList([CHILD]);

    expect(screen.getByText('Recebimento')).toBeInTheDocument();
    expect(screen.getByTestId('box-type-switch-41')).toBeChecked();
    expect(screen.getByTestId('check-task-410')).toBeInTheDocument();
  });

  it('draws nothing when the category has no children', () => {
    const { container } = renderList([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('follows the switch: the child’s block leaves the screen when it is off', () => {
    render(
      <BoxTypeList
        childrenCategories={[CHILD]}
        products={{ assai: ['Nhoque Kg'], normal: ['Nhoque 400g'] }}
        form={{ items: {}, temperatures: {}, selectedProducts: {}, disabledBoxTypeIds: [41] }}
        onItemChange={vi.fn()}
        onTemperatureChange={vi.fn()}
        disabledBoxTypeIds={[41]}
        onBoxTypeChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('box-type-switch-41')).not.toBeChecked();
    expect(screen.queryByTestId('check-task-410')).not.toBeInTheDocument();
  });

  it('says the child’s name in the reader’s language', async () => {
    await i18n.changeLanguage('es');
    renderList([CHILD]);

    expect(screen.getByText('Recepción de congelados')).toBeInTheDocument();
  });

  it('cannot be switched in a read-only report', () => {
    renderList([CHILD], true);

    expect(screen.getByTestId('box-type-switch-41')).toBeDisabled();
    fireEvent.click(screen.getByTestId('box-type-switch-41'));
  });
});
