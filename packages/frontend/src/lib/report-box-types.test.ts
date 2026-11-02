import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boxTypeEnabled, switchedOffTasks, toggleBoxType } from './report-box-types';
import type { FormState, TaskType } from '../components/reports/CategorySection';

/**
 * A box type is the question "did the day mount these boxes?", and the answers of the type are dropped with it.
 *
 * The reason is in the module: the body sends one entry per task, so a type switched off with its products still
 * selected would be saved as if it had been marked. These tests hold that line and nothing else.
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

const SMALL = [task(58, 9), task(59, 9)];
const ASSAI = [task(61, 10)];

function formWithAnswers(): FormState {
  return {
    items: { 58: true, 59: false, 61: true, 1: true },
    temperatures: { 58: ['-18'], 1: ['4'] },
    selectedProducts: { 58: ['Nhoque 400g'], 61: ['Disgo 500g'] },
  };
}

describe('toggleBoxType', () => {
  it('drops every answer of the switched-off type and nobody else’s', () => {
    const next = toggleBoxType(formWithAnswers(), SMALL, 9, false);

    assert.deepEqual(next.disabledBoxTypeIds, [9]);
    assert.deepEqual(next.items, { 61: true, 1: true });
    assert.deepEqual(next.temperatures, { 1: ['4'] });
    assert.deepEqual(next.selectedProducts, { 61: ['Disgo 500g'] });
  });

  it('comes back empty when the type is switched on again', () => {
    const off = toggleBoxType(formWithAnswers(), SMALL, 9, false);
    const on = toggleBoxType(off, SMALL, 9, true);

    assert.deepEqual(on.disabledBoxTypeIds, []);
    assert.deepEqual(on.items, off.items);
    assert.deepEqual(on.selectedProducts, off.selectedProducts);
  });

  it('leaves the list alone when the switch is already where it is asked to go', () => {
    const once = toggleBoxType(formWithAnswers(), SMALL, 9, false);
    const twice = toggleBoxType(once, SMALL, 9, false);

    assert.deepEqual(twice.disabledBoxTypeIds, [9]);
  });
});

describe('boxTypeEnabled', () => {
  it('is on when the report does not name the type', () => {
    assert.equal(boxTypeEnabled([], 9), true);
    assert.equal(boxTypeEnabled([10], 9), true);
    assert.equal(boxTypeEnabled([9], 9), false);
  });
});

describe('switchedOffTasks', () => {
  it('names the tasks of the types the report does not mount', () => {
    const categories = [
      { id: 9, tasks: SMALL },
      { id: 10, tasks: ASSAI },
    ];

    assert.deepEqual([...switchedOffTasks(categories, [9])], [58, 59]);
    assert.deepEqual([...switchedOffTasks(categories, [])], []);
  });
});
