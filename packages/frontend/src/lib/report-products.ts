/**
 * The two product offers a report puts in front of an operator.
 *
 * Read from the server, never from a copy: the report screen and the calculator grew their own lists, and a
 * product added on the server existed in one place and not the other until someone redeployed. The backend
 * keeps the only copy (`modules/reports/reports.schema.ts`) and answers it here.
 *
 * A missing answer is not an empty offer. An empty list would draw a product task with no boxes and read as
 * "this product does not exist", so the caller is told the catalogue could not be read and says so on screen.
 */

export interface ReportProducts {
  /** The Assaí offer, drawn by `check_assai` tasks. */
  assai: readonly string[];
  /** The Normal offer, drawn by `check_normal` tasks. */
  normal: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function names(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => typeof item === 'string' && item.trim() !== '')) return null;
  return value;
}

/** The catalogue the server answered, or null when the answer is not one. */
export function readReportProducts(body: unknown): ReportProducts | null {
  if (!isRecord(body)) return null;

  const assai = names(body.assai);
  const normal = names(body.normal);
  if (assai === null || normal === null) return null;

  return { assai, normal };
}
