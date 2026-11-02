import { exportPdf } from './exportPdf';

/** The id the export node is given while it is in the document. */
export const TEMP_TEXT_ID = 'loading-export-text-temp';

/**
 * Writes the day's text, captures it as a PDF and gives the node back.
 *
 * The node is off the flow of the page and exists only for the capture. It is built, used and removed in one
 * place because the removal has to survive the writer throwing: it used to sit after the call, so a failed
 * export left one more hidden node in the document for every attempt.
 */
export async function exportScheduleTextAsPdf(text: string, filename: string): Promise<void> {
  const node = document.createElement('div');
  node.id = TEMP_TEXT_ID;
  node.style.position = 'absolute';
  node.style.left = '-9999px';
  node.style.top = '-9999px';
  node.style.width = '450px';
  node.style.padding = '20px';
  node.style.backgroundColor = '#f9fafb';
  node.style.fontFamily = 'monospace';
  node.style.fontSize = '12px';
  node.style.whiteSpace = 'pre-wrap';
  node.style.color = '#1f2937';
  node.style.lineHeight = '1.6';
  // `textContent`, not `innerText`: the node is off-screen, where the layout `innerText` depends on does not exist.
  node.textContent = text;

  document.body.appendChild(node);

  try {
    await exportPdf(TEMP_TEXT_ID, filename);
  } finally {
    node.remove();
  }
}
