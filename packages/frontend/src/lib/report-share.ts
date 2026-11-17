import { api } from '../api/client';
import { shareOrCopy, type ShareOutcome } from './whatsapp';

/**
 * What the operator does with a report once it is saved: read the message, send it, print it, fix it.
 *
 * The text is the server's, not this client's: `GET /reports/:id/export` builds the same message the group
 * receives, and the screen, the PDF and the share sheet all show that one text. A second copy of the format here
 * would drift the moment the server's sections change, which is the drift the export endpoint exists to prevent.
 */

/** One stored photo, as the report's projection hands it out. */
export interface ReportSharePhoto {
  id: number;
  mime_type?: string | null;
  url?: string | null;
  publicUrl?: string | null;
}

/** The message the plant sends for one report. */
export async function fetchReportExportText(reportId: number): Promise<string> {
  const data = await api.get<{ text: string }>(`/reports/${reportId}/export`);
  return data.text;
}

/**
 * The report's photos as files the share sheet can carry.
 *
 * A photo that cannot be fetched is left out instead of failing the share: the message is the report, and a
 * missing attachment must not take the text with it. The name comes from the id, so two photos never collide.
 */
export async function reportPhotoFiles(photos: readonly ReportSharePhoto[]): Promise<File[]> {
  const files: File[] = [];
  for (const photo of photos) {
    const url = photo.publicUrl || photo.url;
    if (!url) continue;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const blob = await response.blob();
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/heic' ? 'heic' : blob.type === 'image/heif' ? 'heif' : 'jpg';
      files.push(new File([blob], `relatorio-${photo.id}.${extension}`, { type: blob.type || 'image/jpeg' }));
    } catch {
      // Left out on purpose: see above.
    }
  }
  return files;
}

/**
 * Hands the message to the phone's share sheet, with the photos when they came along.
 *
 * Files are offered only when the browser says it can carry them; otherwise the sheet gets the text alone, and a
 * phone without a sheet falls back to copying the message -- the same ladder the salida module uses.
 */
export async function shareReportMessage(args: {
  text: string;
  photos?: readonly File[];
}): Promise<ShareOutcome> {
  const photos = args.photos ?? [];
  const navigatorLike = (globalThis as { navigator?: Navigator }).navigator;

  if (photos.length > 0 && typeof navigatorLike?.share === 'function') {
    const data: ShareData = { text: args.text, files: [...photos] };
    const canShare = typeof navigatorLike.canShare === 'function' ? navigatorLike.canShare(data) : false;
    if (canShare) {
      try {
        await navigatorLike.share(data);
        return 'shared';
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
      }
    }
  }

  return shareOrCopy(args.text);
}

/**
 * The PDF the operator sends to the group, built from the same text the message shows.
 *
 * The report is laid out in a hidden node and printed by the same generator the schedule uses, so both documents
 * share one typography and one page rule instead of two implementations that slowly disagree.
 */
export async function exportReportPdf(reportId: number): Promise<void> {
  const text = await fetchReportExportText(reportId);
  const tempDiv = document.createElement('div');
  tempDiv.id = `report-pdf-text-${reportId}`;
  tempDiv.style.position = 'absolute';
  tempDiv.style.left = '-9999px';
  tempDiv.style.top = '-9999px';
  tempDiv.style.width = '450px';
  tempDiv.style.padding = '20px';
  tempDiv.style.backgroundColor = '#f9fafb';
  tempDiv.style.fontFamily = 'monospace';
  tempDiv.style.fontSize = '12px';
  tempDiv.style.whiteSpace = 'pre-wrap';
  tempDiv.style.color = '#1f2937';
  tempDiv.style.lineHeight = '1.6';
  tempDiv.innerText = text;

  document.body.appendChild(tempDiv);
  try {
    const { exportPdf } = await import('./exportPdf');
    await exportPdf(tempDiv.id, `relatorio-${reportId}`);
  } finally {
    tempDiv.remove();
  }
}
