// `.tsx` because the vitest lane collects only components' files: the node:test lane has no DOM, and this
// test needs one to see whether the node was removed.
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exporting the day leaves nothing behind.
 *
 * The export builds an off-screen node with the day's text and hands it to the PDF writer. When the writer
 * threw -- a canvas that could not be drawn, a browser that refused the download -- the cleanup line after it
 * never ran, and the node stayed in the document. Each attempt left another one, hidden outside the viewport
 * and never released, for the life of the tab.
 */
const exportPdf = vi.fn();

vi.mock('./exportPdf', () => ({
  exportPdf: (...args: unknown[]) => exportPdf(...args),
}));

const { exportScheduleTextAsPdf, TEMP_TEXT_ID } = await import('./schedule-pdf');

describe('schedule-pdf', () => {
  beforeEach(() => {
    exportPdf.mockReset();
    document.body.innerHTML = '';
  });

  it('leaves no node behind when the export succeeds', async () => {
    exportPdf.mockResolvedValue(undefined);

    await exportScheduleTextAsPdf('Cronograma do dia', 'cronograma-2026-11-02');

    expect(exportPdf).toHaveBeenCalledWith(TEMP_TEXT_ID, 'cronograma-2026-11-02');
    expect(document.getElementById(TEMP_TEXT_ID)).toBeNull();
  });

  it('leaves no node behind when the export throws', async () => {
    exportPdf.mockRejectedValue(new Error('canvas refused'));

    await expect(exportScheduleTextAsPdf('Cronograma do dia', 'cronograma-2026-11-02')).rejects.toThrow(
      'canvas refused'
    );

    expect(document.getElementById(TEMP_TEXT_ID)).toBeNull();
  });

  it('hands the writer the text it was given, off the flow of the page', async () => {
    let seen: string | null = null;
    exportPdf.mockImplementation(async () => {
      seen = document.getElementById(TEMP_TEXT_ID)?.textContent ?? null;
    });

    await exportScheduleTextAsPdf('04:00  Fletes Q1', 'x');

    expect(seen).toBe('04:00  Fletes Q1');
  });
});
