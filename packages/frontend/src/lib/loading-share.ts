import { api } from '../api/client';
import { exportScheduleTextAsPdf } from './schedule-pdf';
import { shareOrCopy, type ShareOutcome } from './whatsapp';

/**
 * What the loading module does with a finished schedule: read the message, send it, print it, fix it.
 *
 * The text is the server's (`GET /loading/export?date=`), which is the same message that leaves over WhatsApp, so
 * the card, the share sheet and the PDF carry one document. Rebuilding the format here would drift the moment the
 * server's layout changes -- the same reason the report card reads its own endpoint.
 */

/** The message the plant sends for one loading day. */
export async function fetchLoadingExportText(date: string): Promise<string> {
  const data = await api.get<{ text: string }>(`/loading/export?date=${date}`);
  return data.text;
}

/** Hands the message to the phone's share sheet, with the copy as the fallback. */
export async function shareLoadingMessage(text: string): Promise<ShareOutcome> {
  return shareOrCopy(text);
}

/** The PDF the plant prints, built from the same text the message shows. */
export async function exportLoadingPdf(date: string, text: string): Promise<void> {
  const message = text || (await fetchLoadingExportText(date));
  await exportScheduleTextAsPdf(message, `horario-${date}`);
}
