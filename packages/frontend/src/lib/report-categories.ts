import type { CategoryType, TaskType } from '../components/reports/CategorySection';

/**
 * The one checklist task this web does not ask, and only where the plant does not count it.
 *
 * The company's report template carries a `Quadrada` task in both box categories: Cajas pequeñas, where the plant
 * really counts it, and Cajas Assaí, where the operator works from the Assaí order instead. The API, the OpenAPI
 * contract and Android keep publishing both — this is a rule of this screen, so it lives here and not in the
 * catalogue. A report filed before the rule keeps its own answers: the filter only removes the question, never
 * the row a saved report already has.
 */

/** The category the plant calls Assaí, by the id the seed gives it and by name when the id is not the known one. */
const ASSAI_CATEGORY_IDS = new Set([10]);
const ASSAI_CATEGORY_NAMES = new Set(['caixas assai', 'cajas assai']);

/** The two spellings the task carries in the plant's two languages. */
const QUADRADA_TASK_NAMES = new Set(['quadrada', 'cuadrada']);

/** Case, padding and accents are noise: `Caixas Assaí`, `caixas assai` and `CAIXAS ASSAI` are one category. */
function fold(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Whether this category is the Assaí box checklist, where the Quadrada question is not asked. */
function isAssaiBoxCategory(category: Pick<CategoryType, 'id' | 'name_pt' | 'name_es'>): boolean {
  if (ASSAI_CATEGORY_IDS.has(category.id)) return true;
  return ASSAI_CATEGORY_NAMES.has(fold(category.name_pt)) || ASSAI_CATEGORY_NAMES.has(fold(category.name_es));
}

function isQuadradaTask(task: Pick<TaskType, 'name_pt' | 'name_es'>): boolean {
  return QUADRADA_TASK_NAMES.has(fold(task.name_pt)) || QUADRADA_TASK_NAMES.has(fold(task.name_es));
}

/**
 * The categories the report screens draw: the same list, minus the Quadrada question inside Cajas Assaí.
 *
 * Everything else is returned by reference and in the same order, so nothing else about the form changes. The
 * input is never mutated: a caller that keeps the raw list for building the payload (the edit screen does) still
 * sees every task.
 */
export function visibleReportCategories(categories: readonly CategoryType[]): CategoryType[] {
  return categories.map((category) => {
    if (!isAssaiBoxCategory(category)) return category;
    if (!category.tasks.some(isQuadradaTask)) return category;
    return { ...category, tasks: category.tasks.filter((task) => !isQuadradaTask(task)) };
  });
}
