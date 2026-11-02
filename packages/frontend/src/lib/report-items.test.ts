import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reportItems, reportTasks } from './report-items';
import type { CategoryType, TaskType } from '../components/reports/CategorySection';

/**
 * A report carries one row per task, marked or not.
 *
 * The day's "no" is part of the day's record: an unchecked task that is absent from the body is the same thing
 * as a task that never reached the form, and the server stores the answer it is given. These tests hold that
 * line, the temperature exception, and the shape of the product list.
 */
function task(id: number, categoryId: number, taskType: TaskType['task_type'] = 'check'): TaskType {
  return {
    id,
    category_id: categoryId,
    name_pt: `tarefa ${id}`,
    name_es: `tarea ${id}`,
    task_type: taskType,
    sort_order: id,
    temperature_readings: taskType === 'temperature' ? 1 : 0,
  };
}

const CATEGORIES: CategoryType[] = [
  {
    id: 1,
    parent_category_id: null,
    name_pt: 'Higiene e Organização',
    name_es: 'Higiene y Organización',
    sort_order: 1,
    tasks: [task(1, 1), task(2, 1)],
  },
  {
    id: 2,
    parent_category_id: null,
    name_pt: 'Temperaturas',
    name_es: 'Temperaturas',
    sort_order: 2,
    tasks: [task(5, 2, 'temperature')],
  },
  {
    id: 8,
    parent_category_id: null,
    name_pt: 'Montagem das Caixas',
    name_es: 'Montaje de Cajas',
    sort_order: 3,
    tasks: [task(23, 8)],
  },
  {
    id: 9,
    parent_category_id: 8,
    name_pt: 'Caixas pequenas',
    name_es: 'Cajas pequeñas',
    sort_order: 5,
    tasks: [task(58, 9)],
  },
];

describe('reportTasks', () => {
  it('reads roots and their children in the order the server served them', () => {
    assert.deepEqual(
      reportTasks(CATEGORIES).map((entry) => entry.id),
      [1, 2, 5, 23, 58],
    );
  });
});

describe('reportItems', () => {
  it('sends one row per non-temperature task, marked or not', () => {
    const items = reportItems(CATEGORIES, {
      items: { 1: true, 2: false, 58: true },
      temperatures: { 5: ['-18'] },
      selectedProducts: {},
    });

    assert.deepEqual(items, [
      { taskId: 1, checked: true },
      { taskId: 2, checked: false },
      { taskId: 23, checked: false },
      { taskId: 58, checked: true },
    ]);
  });

  it('keeps the temperature readings out of `items` and in `temperatures`', () => {
    const items = reportItems(CATEGORIES, {
      items: { 5: true },
      temperatures: {},
      selectedProducts: {},
    });

    assert.deepEqual(items.map((item) => item.taskId), [1, 2, 23, 58]);
  });

  it('carries the product list only when something is selected', () => {
    const items = reportItems(CATEGORIES, {
      items: { 58: true, 23: false },
      temperatures: {},
      selectedProducts: { 58: ['Nhoque 400g'], 23: [] },
    });

    assert.deepEqual(items.find((item) => item.taskId === 58), {
      taskId: 58,
      checked: true,
      selectedProducts: ['Nhoque 400g'],
    });
    assert.deepEqual(items.find((item) => item.taskId === 23), { taskId: 23, checked: false });
  });
});
