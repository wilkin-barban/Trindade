import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { visibleReportCategories } from './report-categories.js';
import type { CategoryType } from '../components/reports/CategorySection';

/**
 * Quadrada is asked in Cajas pequeñas, not in Cajas Assaí.
 *
 * The rule is a filter of this web on the categories the API answers: the backend keeps publishing both
 * checklist tasks, the contract and Android are untouched, and a report filed before the rule keeps its answers.
 * Small boxes are deliberately out of scope: task 60 must stay where the plant counts it.
 */
function task(id: number, categoryId: number, namePt: string, nameEs = namePt): CategoryType['tasks'][number] {
  return {
    id,
    category_id: categoryId,
    name_pt: namePt,
    name_es: nameEs,
    task_type: 'check',
    sort_order: id,
    temperature_readings: 0,
  };
}

const SMALL_BOXES: CategoryType = {
  id: 9,
  parent_category_id: null,
  name_pt: 'Caixas pequenas',
  name_es: 'Cajas pequeñas',
  sort_order: 9,
  tasks: [task(60, 9, 'Quadrada', 'Cuadrada'), task(61, 9, 'Nhoque 400g')],
};

const ASSAI_BOXES: CategoryType = {
  id: 10,
  parent_category_id: null,
  name_pt: 'Caixas Assai',
  name_es: 'Cajas Assai',
  sort_order: 10,
  tasks: [task(66, 10, 'Quadrada', 'Cuadrada'), task(67, 10, 'Nhoque Kg')],
};

const OTHER: CategoryType = {
  id: 1,
  parent_category_id: null,
  name_pt: 'Higiene',
  name_es: 'Higiene',
  sort_order: 1,
  tasks: [task(1, 1, 'Pátio')],
};

describe('visibleReportCategories', () => {
  it('drops the Quadrada checklist task from the Assaí category', () => {
    const [assai] = visibleReportCategories([ASSAI_BOXES]);
    assert.deepEqual(
      assai!.tasks.map((entry) => entry.id),
      [67],
    );
  });

  it('keeps the Quadrada task in Cajas pequeñas', () => {
    const [small] = visibleReportCategories([SMALL_BOXES]);
    assert.deepEqual(
      small!.tasks.map((entry) => entry.id),
      [60, 61],
    );
  });

  it('leaves every other category and task exactly as it was', () => {
    const visible = visibleReportCategories([OTHER, SMALL_BOXES, ASSAI_BOXES]);
    assert.deepEqual(visible.map((category) => category.id), [1, 9, 10]);
    assert.deepEqual(visible[0], OTHER);
    assert.deepEqual(visible[1], SMALL_BOXES);
    assert.equal(visible[2]!.tasks.length, 1);
  });

  it('recognises the Assaí category by its name when the id is not the known one', () => {
    const renamed: CategoryType = { ...ASSAI_BOXES, id: 41 };
    const [visible] = visibleReportCategories([renamed]);
    assert.deepEqual(
      visible!.tasks.map((entry) => entry.id),
      [67],
    );
  });

  it('does not mutate the categories it is given', () => {
    const input = [ASSAI_BOXES];
    visibleReportCategories(input);
    assert.deepEqual(
      input[0]!.tasks.map((entry) => entry.id),
      [66, 67],
    );
  });
});
