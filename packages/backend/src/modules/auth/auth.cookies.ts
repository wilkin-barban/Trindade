import type { FastifyInstance, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';

/**
 * The web session cookie.
 *
 * The refresh token *is* the session: while the browser kept it in `localStorage`, one XSS or one leaked backup
 * of the profile directory let the holder mint fresh access tokens for a month. It therefore lives in an
 * `HttpOnly` cookie that JavaScript cannot read, scoped to the auth routes so it never travels with the
 * hundreds of calls that do not need it, and `SameSite=Strict` so a page on another site cannot drive a
 * refresh with it.
 *
 * The native app has no cookie jar, so the token stays in the JSON body for it. The split is explicit: the
 * browser says `X-Trindade-Client: web`; a caller that says nothing is treated as native, because the
 * installed APK cannot be updated in lockstep and must keep working untouched.
 */

export const REFRESH_COOKIE_NAME = 'trindade_refresh';

/** Only the auth routes read this cookie, so only they receive it. */
export const REFRESH_COOKIE_PATH = '/api/auth';

export const CLIENT_KIND_HEADER = 'x-trindade-client';

/** The semantic code a cross-site session request is refused with. */
export const CROSS_SITE_REFUSAL_CODE = 'auth.cross_site_request';

export type AuthClientKind = 'web' | 'native';

export interface RefreshCookieSettings {
  /** `Secure` attribute: HTTPS deployments only, with an explicit opt-out for a plain-HTTP install. */
  secure: boolean;
  /** Lifetime in seconds, taken from the configured refresh-token TTL. */
  maxAgeSeconds: number;
}

function firstHeader(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Which client is asking.
 *
 * Silence means native, deliberately: the Android app predates this header and cannot be assumed to send it,
 * so defaulting the other way would strip the token it needs and sign the plant out.
 */
export function clientKindOf(request: FastifyRequest): AuthClientKind {
  const declared = firstHeader(request, CLIENT_KIND_HEADER);
  return declared?.toLowerCase() === 'web' ? 'web' : 'native';
}

/**
 * Register `@fastify/cookie` once per instance.
 *
 * `server.ts` registers it before the routes; test apps that mount the auth plugin on their own do not. The
 * guard keeps the second registration from throwing on the duplicate decorator, so both shapes work.
 */
export async function registerRefreshCookieSupport(fastify: FastifyInstance): Promise<void> {
  if (fastify.hasReplyDecorator('setCookie')) return;
  await fastify.register(cookie);
}

export function refreshCookieOptions(settings: RefreshCookieSettings) {
  return {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: settings.secure,
    maxAge: settings.maxAgeSeconds,
  };
}

export function setRefreshCookie(
  reply: { setCookie: (name: string, value: string, options: ReturnType<typeof refreshCookieOptions>) => unknown },
  token: string,
  settings: RefreshCookieSettings,
): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(settings));
}

export function clearRefreshCookie(
  reply: { clearCookie: (name: string, options: ReturnType<typeof refreshCookieOptions>) => unknown },
  settings: RefreshCookieSettings,
): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(settings));
}

/** The refresh token the browser presented, if any. */
export function refreshCookieFrom(request: FastifyRequest): string | undefined {
  const cookies = (request as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies;
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export interface CrossSiteRefusal {
  code: string;
  message: string;
}

/**
 * Refuse a session request the browser itself labels as coming from another site.
 *
 * `SameSite=Strict` already keeps the cookie out of a cross-site request in current browsers, but it is a
 * browser feature: an old client, or one that ignores the attribute, would still send it. The check reads the
 * two headers a browser sets and cannot be forged from a page (`Origin` and `Sec-Fetch-Site`) and refuses
 * anything that is not this very origin. A caller that sends neither -- `curl`, the Android app, a same-origin
 * `fetch` from an old browser -- is not a cross-site browser request and is left alone.
 */
export function crossSiteRefusal(
  request: FastifyRequest,
  allowedOrigins: readonly string[] = [],
): CrossSiteRefusal | null {
  const refusal: CrossSiteRefusal = {
    code: CROSS_SITE_REFUSAL_CODE,
    message: 'Cross-site session requests are not allowed',
  };

  const origin = firstHeader(request, 'origin');
  if (origin && !isSameOrigin(origin, request, allowedOrigins)) return refusal;

  const fetchSite = firstHeader(request, 'sec-fetch-site')?.toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return refusal;

  return null;
}

function isSameOrigin(origin: string, request: FastifyRequest, allowedOrigins: readonly string[]): boolean {
  const normalized = stripTrailingSlash(origin).toLowerCase();
  const self = `${request.protocol}://${request.host}`.toLowerCase();
  if (normalized === stripTrailingSlash(self)) return true;
  return allowedOrigins.some((allowed) => stripTrailingSlash(allowed).toLowerCase() === normalized);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Whether the cookie must carry `Secure`.
 *
 * It must when the deployment is served over HTTPS. `AUTH_COOKIE_INSECURE=true` is the only way out, for an
 * install that really is plain HTTP: a browser silently drops a `Secure` cookie received over `http://`, so
 * guessing wrong in that direction would break sign-in with no visible error.
 */
export function resolveRefreshCookieSecure(input: {
  appUrl?: string | null;
  nodeEnv?: string | null;
  allowInsecure?: string | null;
}): boolean {
  if (input.allowInsecure === 'true') return false;
  const appUrl = (input.appUrl ?? '').trim().toLowerCase();
  if (appUrl.startsWith('https://')) return true;
  return input.nodeEnv === 'production';
}
