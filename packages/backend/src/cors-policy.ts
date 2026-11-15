import type { FastifyCorsOptions } from '@fastify/cors';

/**
 * The browser origins allowed to call the API from another site.
 *
 * The app itself is served same-origin through nginx, so this list only covers a separately hosted client. It is
 * also what the auth routes read to recognise a legitimate cross-origin `Origin`; anything else that presents a
 * session cookie is treated as cross-site and refused.
 */
export const APPROVED_WEB_ORIGINS = ['https://trindademassas.com.br'];

export const corsPolicy: FastifyCorsOptions = {
  origin: [...APPROVED_WEB_ORIGINS],
  /**
   * The web session travels in a cookie, so a cross-origin browser client needs the credentialed response. It is
   * granted only to the exact origins above; `*` cannot carry credentials, and echoing the caller's own origin
   * would hand every site the browser visits a session it never had.
   */
  credentials: true,
};
