/**
 * The WhatsApp actions, in one module because three screens need them: the schedule export, the report
 * export, and the dashboard's card for the day being loaded.
 *
 * The link names WhatsApp's canonical chat endpoint rather than the short one that redirects to it:
 * `wa.me` answers with a 302 to `api.whatsapp.com/send`, and that hop is where a four-byte UTF-8
 * character -- every emoji the schedule's announcement carries -- comes back as U+FFFD. The endpoint
 * below answers the request directly, so the payload arrives as the operator saw it. The number travels
 * in international form with no punctuation at all, and the text percent-encoded, which is what the
 * mobile app's intent and the web client both accept. Nothing here decides which number is right: a
 * driver whose number was written without a country code produces a link to that number, and the
 * operator sees where it goes before sending it.
 */

/** The digits of a number, which is the form the chat link needs. */
export function waMeNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * The private chat link for [phone] carrying [text], or null when there is no number to dial.
 *
 * Null rather than a link to nowhere: a driver whose number nobody has yet must not be offered an action
 * that would open an empty chat, and the caller renders no button at all.
 */
export function waMeLink(phone: string, text: string): string | null {
  const number = waMeNumber(phone);
  if (!number) return null;
  // The canonical endpoint and not `wa.me`: the short form answers with a 302 to this address, and a
  // four-byte character does not survive that hop -- it comes back as U+FFFD, which is what turned the
  // announcement's emoji into blanks. One request, no redirect, the emoji whole.
  return `https://api.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(text)}`;
}

export type ShareOutcome = 'shared' | 'copied' | 'whatsapp' | 'cancelled' | 'failed';

/** El enlace que abre WhatsApp con el texto ya cargado, sin depender de la hoja nativa ni del portapapeles. */
export function whatsappTextLink(text: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

/**
 * Abre [url] en otra pestaña y dice si el navegador la dejó abrir.
 *
 * `window.open` devuelve null cuando el navegador bloquea la ventana, y eso no es lo mismo que haberla abierto:
 * quien llama lo necesita para decir la verdad al operario. La función se recibe por parámetro para poder probar
 * los dos casos sin un navegador de verdad.
 */
export function openWhatsAppText(
  text: string,
  open: (url: string) => unknown = (url) => globalThis.open?.(url, '_blank', 'noopener'),
): boolean {
  try {
    const opened = open(whatsappTextLink(text));
    return opened !== null && opened !== undefined && opened !== false;
  } catch {
    return false;
  }
}

/**
 * Hands [text] to the platform's own share sheet, and copies it when there is no sheet to hand it to.
 *
 * A dismissed sheet answers `cancelled` and copies nothing: the operator said no, and putting the text on
 * the clipboard anyway would be the opposite of what they asked for. Any other refusal from the sheet
 * falls back to the clipboard, because a browser that cannot share can still copy, and only when neither
 * is available does this answer `failed`.
 */
export async function shareOrCopy(
  text: string,
  open: (url: string) => unknown = (url) => globalThis.open?.(url, '_blank', 'noopener'),
): Promise<ShareOutcome> {
  const navigatorLike = (globalThis as { navigator?: Navigator }).navigator;

  if (typeof navigatorLike?.share === 'function') {
    try {
      await navigatorLike.share({ text });
      return 'shared';
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }

  const clipboard = navigatorLike?.clipboard;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return 'copied';
    } catch {
      // El portapapeles también puede negarse -- un navegador sin permiso, una pestaña que perdió el foco --
      // y entonces queda el enlace, que no necesita ninguno de los dos.
    }
  }

  // Sin hoja nativa y sin portapapeles, el texto igual llega: el enlace de WhatsApp lo lleva en la URL. Es lo que
  // el operario espera de un botón que dice «Compartilhar no WhatsApp», y antes no pasaba nada en absoluto.
  return openWhatsAppText(text, open) ? 'whatsapp' : 'failed';
}
