import type { FormState, TaskType } from '../components/reports/CategorySection';

/**
 * The box types one report mounts, and what happens to the answers of the one that is switched off.
 *
 * A box type is a nested category -- `Caixas pequenas`, `Caixas Assai` -- and the report asks one question
 * per type: did the day mount it? Off by absence rather than by a `false`: every form opens with every type
 * on, so a report already recorded with both reads back the way it was written, and a type this list does not
 * name is drawn and can be marked.
 *
 * The rule lives here rather than inside either page because both pages have it -- the generator and the edit
 * screen -- and two copies of "what a switch does" is two ways for the same report to be saved differently.
 */

/** Whether the box type with this category id is one this report mounts. */
export function boxTypeEnabled(disabledBoxTypeIds: readonly number[], categoryId: number): boolean {
  return !disabledBoxTypeIds.includes(categoryId);
}

/**
 * Switches one box type off, dropping what the form had answered for its tasks; on, it comes back empty.
 *
 * The answers go with the switch rather than staying behind a hidden block: the body this form sends carries
 * one entry per task, so a type left off with its checks and products still in the form would be sent as if it
 * had been marked, and the saved report would claim boxes the operator said the day did not mount. Switching it
 * back on returns an empty block, which is what "this type was not used" has to look like on the way out.
 *
 * The tasks to drop are the category's own, taken from the served catalogue rather than inferred here: a reload
 * can serve the same categories in another order, and a task's id is the only stable thing about it.
 */
export function toggleBoxType(
  form: FormState,
  tasks: readonly TaskType[],
  categoryId: number,
  enabled: boolean,
): FormState {
  const disabledBoxTypeIds = form.disabledBoxTypeIds ?? [];

  if (enabled) {
    return { ...form, disabledBoxTypeIds: disabledBoxTypeIds.filter((id) => id !== categoryId) };
  }

  const dropped = new Set(tasks.map((task) => task.id));
  const withoutDropped = <T>(record: Record<number, T> | undefined): Record<number, T> =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([taskId]) => !dropped.has(Number(taskId))));

  return {
    ...form,
    // Appended only when it is not there: the list is a set of types, and a type named twice is the kind of
    // duplicate that later reads as two different states of the same switch.
    disabledBoxTypeIds: boxTypeEnabled(disabledBoxTypeIds, categoryId)
      ? [...disabledBoxTypeIds, categoryId]
      : disabledBoxTypeIds,
    items: withoutDropped(form.items),
    temperatures: withoutDropped(form.temperatures),
    selectedProducts: withoutDropped(form.selectedProducts),
  };
}

/**
 * The tasks of the box types this report does not mount.
 *
 * Only the tasks are answered for: a switch hides a block of the form, and a block nobody can reach is a block
 * whose questions stop being required. Kept as a set by task id so both pages ask the same question of the same
 * shape.
 */
export function switchedOffTasks(
  categories: readonly { id: number; tasks: readonly TaskType[] }[],
  disabledBoxTypeIds: readonly number[],
): Set<number> {
  return new Set(
    categories
      .filter((category) => !boxTypeEnabled(disabledBoxTypeIds, category.id))
      .flatMap((category) => category.tasks.map((task) => task.id)),
  );
}
