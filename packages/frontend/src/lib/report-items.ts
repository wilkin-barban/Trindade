import type { CategoryType, FormState, TaskType } from '../components/reports/CategorySection';

/**
 * The `items` array: one row per task that is not a temperature task, checked or not.
 *
 * A report is a record of the day, not a list of what was done: "this task was not done" is information the
 * paper carries, and the server stores it as a row with `checked = 0` rather than as an absence. Sending only
 * the marked tasks meant the unchecked ones were indistinguishable from tasks that never reached the form, and
 * an edit that left a task unmarked deleted its row instead of recording the answer.
 *
 * A temperature task is deliberately absent: it belongs in `temperatures` and nowhere else, and sending it in
 * both would leave the server reading one of the two as authoritative.
 *
 * The order is the catalogue's -- the order the endpoint served the categories in -- because two submissions of
 * the same day should produce the same body, and a diff of two payloads that moved for no reason is unreadable.
 *
 * The rule lives here rather than in either page because both pages build this body: the generator and the edit
 * screen. Two copies of "which rows does a report carry" is two ways for the same day to be saved differently.
 */
export interface ReportItemPayload {
  taskId: number;
  checked: boolean;
  selectedProducts?: string[];
}

/** Every task of the catalogue, roots and their children, in the order the server served them. */
export function reportTasks(categories: readonly CategoryType[]): TaskType[] {
  const roots = categories.filter((category) => !category.parent_category_id);
  return roots.flatMap((root) => [
    ...root.tasks,
    ...categories
      .filter((category) => category.parent_category_id === root.id)
      .flatMap((child) => child.tasks),
  ]);
}

/**
 * The body's `items`, one entry per non-temperature task.
 *
 * A product list travels only when something is selected: nothing selected and an empty selection are the same
 * statement, and the server treats the field as optional.
 */
export function reportItems(categories: readonly CategoryType[], form: FormState): ReportItemPayload[] {
  return reportTasks(categories)
    .filter((task) => task.task_type !== 'temperature')
    .map((task) => {
      const selected = form.selectedProducts?.[task.id] ?? [];
      return {
        taskId: task.id,
        checked: form.items[task.id] === true,
        ...(selected.length > 0 ? { selectedProducts: selected } : {}),
      };
    });
}
