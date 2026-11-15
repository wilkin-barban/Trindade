import i18n from '../i18n/config';
import { clearAeroAutoRead } from '../lib/aero-auto-read';
import { clearAeroSessionPassword } from '../lib/aero-integration';
import { GUEST_READONLY_MESSAGE, isGuestMutationRefusal } from '../lib/guest-readonly';
import { resolveApiErrorKey, isNetworkError } from '../lib/api-error-normalizer';

const APP_BASE = (import.meta.env?.BASE_URL ?? '').replace(/\/$/, '');
export const API_BASE = `${APP_BASE}/api`;

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (path.startsWith('/api/') || path.startsWith('/p/')) {
    return `${APP_BASE}${path}`;
  }

  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export function appUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_BASE}${normalizedPath}` || normalizedPath;
}


const SESSION_EXPIRED_NOTICE_KEY = 'auth_notice';
const SESSION_EXPIRED_NOTICE_VALUE = 'session_expired';

export function markSessionExpiredNotice(): void {
  sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, SESSION_EXPIRED_NOTICE_VALUE);
}

export function consumeSessionExpiredNotice(): boolean {
  const value = sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY);
  if (value === SESSION_EXPIRED_NOTICE_VALUE) {
    sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
    return true;
  }
  return false;
}

const GUEST_READONLY_NOTICE_KEY = 'guest_readonly_notice';

/**
 * El evento para el caso en que el aviso se marca con la aplicación ya montada: el sessionStorage solo
 * se lee una vez, al montar el host, y una mutación del invitado ocurre en cualquier pantalla.
 */
export const GUEST_READONLY_NOTICE_EVENT = 'guest-readonly-notice';

/**
 * El invitado intentó una mutación y el backend la rechazó. Se guarda el mensaje -- el del servidor, que
 * es el literal de la directiva -- para que sobreviva a la navegación, igual que el aviso de sesión
 * vencida, y se emite el evento para que el host lo muestre en el acto.
 */
export function markGuestReadonlyNotice(): void {
  sessionStorage.setItem(GUEST_READONLY_NOTICE_KEY, GUEST_READONLY_MESSAGE);
  window.dispatchEvent(new Event(GUEST_READONLY_NOTICE_EVENT));
}

export function consumeGuestReadonlyNotice(): string | null {
  const value = sessionStorage.getItem(GUEST_READONLY_NOTICE_KEY);
  if (value) {
    sessionStorage.removeItem(GUEST_READONLY_NOTICE_KEY);
  }
  return value;
}

export const AUTH_SESSION_REFRESHED_EVENT = 'auth-session-refreshed';

/**
 * The access token, held in memory and nowhere else.
 *
 * It is short-lived and cannot be revoked, so it is the one credential the tab may keep: writing it to
 * `localStorage` would hand it to any script on the page and leave it there after the tab closed. The refresh
 * token, which *is* the session, never reaches JavaScript at all: it lives in an `HttpOnly` cookie the browser
 * sends on its own, and `AuthContext` renews from it on mount.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearStoredSession(): void {
  accessToken = null;
  // The two credential keys are purged, not just avoided: a session left behind by an older build would still
  // be readable by any script that runs after this one.
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_refresh_token');
  localStorage.removeItem('auth_user');
}

export function handleUnauthorizedRedirect(): void {
  clearStoredSession();
  // An expired JWT is a logout nobody asked for, and the ERP session belongs to the Trindade session it
  // was typed in. The mark goes too: a pending read armed before the expiry would fire in the next one.
  clearAeroSessionPassword();
  clearAeroAutoRead();
  markSessionExpiredNotice();
  if (typeof window !== 'undefined' && window.location && window.location.pathname !== appUrl('/login')) {
    window.location.href = appUrl('/login');
  }
}

function isLoginRequest(path: string): boolean {
  return path === '/auth/login' || path === '/api/auth/login';
}

function isTokenlessPath(path: string): boolean {
  return (
    path === '/auth/login' ||
    path === '/api/auth/login' ||
    path === '/auth/refresh' ||
    path === '/api/auth/refresh' ||
    path === '/auth/setup' ||
    path === '/api/auth/setup' ||
    path === '/auth/register' ||
    path === '/api/auth/register'
  );
}

let inFlightRefresh: Promise<boolean> | null = null;

/**
 * Renew the session from the cookie.
 *
 * The browser sends the refresh token by itself; nothing is read from storage and nothing is posted, so this
 * works on a reload where the tab only has the user's name cached and no token at all. The single in-flight
 * promise is what stops a screen full of failed calls from firing one renewal each.
 */
export async function refreshTokenOnce(attemptedToken: string | null = null): Promise<boolean> {
  // Another caller already renewed: the token in hand is not the one that failed.
  if (attemptedToken && accessToken && accessToken !== attemptedToken) {
    return true;
  }

  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  let refreshPromise: Promise<boolean> | null = null;
  refreshPromise = (async () => {
    try {
      const lang = localStorage.getItem('i18nextLng') || 'pt-BR';
      const response = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        // The session travels in the cookie, so the browser has to include it even if this page were served
        // from a different origin than the API.
        credentials: 'include',
        // No body and no Content-Type: the web asks for a renewal with the cookie alone, and declaring JSON over an
        // empty body is what Fastify refuses with EMPTY_JSON_BODY -- a 400 that looked exactly like an expired
        // session. A native client sends the token in the body and keeps its own content type.
        headers: {
          'Accept-Language': lang,
          'X-Trindade-Client': 'web',
        },
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      if (!data || typeof data !== 'object' || !data.token) {
        return false;
      }

      accessToken = data.token;

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent(AUTH_SESSION_REFRESHED_EVENT, {
            detail: { token: data.token },
          })
        );
      }

      return true;
    } catch {
      return false;
    } finally {
      if (inFlightRefresh === refreshPromise) {
        inFlightRefresh = null;
      }
    }
  })();

  inFlightRefresh = refreshPromise;
  return inFlightRefresh;
}

/**
 * End this session on the server and forget it here.
 *
 * The body carries no token: the browser's session is the cookie, and the server revokes whichever session the
 * cookie names after refusing a cross-site request. The access token still travels as a bearer because the
 * logout route is authenticated, and it is what proves the cookie belongs to this caller.
 */
export async function logoutSession(): Promise<void> {
  const token = accessToken;
  try {
    await fetch(apiUrl('/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Trindade-Client': 'web',
      },
    });
  } catch {
    /* a failed logout still signs the operator out here */
  } finally {
    clearStoredSession();
  }
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    /**
     * The semantic name of the refusal, when the payload carries one.
     *
     * A status is not enough to tell two refusals apart -- a closed day and a duplicate driver both answer
     * 400 or 409 -- and the sentence is written by the server in the language of the request. The code is
     * the field that survives both.
     */
    public code?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const token = accessToken;
  const lang = localStorage.getItem('i18nextLng') || 'pt-BR';

  const headers: Record<string, string> = {
    'Accept-Language': lang,
    // Which app is speaking. The backend used to assume Android on the routes that write their own audit
    // line, which turned every web call into a false phone line; declaring it here covers every call the
    // browser makes, including the ones that never reach the log route.
    'X-Trindade-Client': 'web',
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  // Merge any custom headers
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      for (const [key, value] of options.headers) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, options.headers);
    }
  }

  if (token && !isTokenlessPath(path)) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      headers,
      // The session cookie travels only to the auth routes, so this costs nothing on the routes that never
      // read it -- and it is what makes the renewal work from a page that holds no token yet.
      credentials: 'include',
    });
  } catch (err) {
    if (isNetworkError(err)) {
      throw new ApiClientError(0, i18n.t('api.networkError'));
    }
    throw err;
  }

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (response.status !== 204 && contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  // A successful login hands the access token over in the body; the session itself arrived as the cookie the
  // browser stored on its own and never reaches this code.
  if (response.ok && isLoginRequest(path) && data && typeof data === 'object') {
    if (data.token) {
      accessToken = data.token;
    }
  }

  if (response.status === 401) {
    if (!isTokenlessPath(path)) {
      // A 401 means the session expired, whatever sentence the server chose to wrap it in: the renewal is
      // attempted once from the cookie and the original request retried.
      if (!isRetry) {
        const renewed = await refreshTokenOnce(token);
        if (renewed) {
          return request<T>(path, options, true);
        }
      }
      // Only a caller that believed it was signed in is shown the expiry notice: a first visit has no session
      // to expire, and bouncing it to the login page would be a redirect loop.
      if (token) {
        handleUnauthorizedRedirect();
        throw new ApiClientError(401, i18n.t('api.sessionExpired'));
      }
    }

    const rawError = (data && (data.error || data.message)) || '';
    const mappedKey = resolveApiErrorKey(401, rawError);
    const message = mappedKey ? i18n.t(mappedKey) : (rawError || i18n.t('api.unauthorized'));

    throw new ApiClientError(401, message, data && data.details);
  }

  if (!response.ok) {
    // Las dos claves: la guarda del invitado responde { message } y el resto de la API responde { error }.
    const rawError = (data && (data.message || data.error)) || '';
    // The semantic code travels with the sentence: a translated backend or a rewording must not turn a
    // known refusal into a raw message on screen.
    const rawCode = (data && (data as { code?: string }).code) || '';
    const mappedKey = resolveApiErrorKey(response.status, rawError, rawCode);
    const message = mappedKey ? i18n.t(mappedKey) : (rawError || i18n.t('api.requestFailed'));

    // El invitado es de solo lectura: se reconoce ESE rechazo -- y solo ese -- para mostrarle el aviso
    // informativo. Cualquier otro error sigue el camino de siempre.
    if (isGuestMutationRefusal(response.status, rawError || message)) {
      markGuestReadonlyNotice();
    }

    throw new ApiClientError(response.status, message, data && data.details, rawCode || undefined);
  }

  return data as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },

  post<T>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
    return request<T>(path, {
      ...init,
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  async del<T = void>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },

  /**
   * Upload a file via multipart/form-data.
   * Does NOT set Content-Type so the browser sets it with the correct boundary.
   */
  async upload<T>(path: string, formData: FormData, isRetry = false): Promise<T> {
    const token = accessToken;
    const lang = localStorage.getItem('i18nextLng') || 'pt-BR';

    const headers: Record<string, string> = {
      'Accept-Language': lang,
    };
    if (token && !isTokenlessPath(path)) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Do NOT set Content-Type — browser adds multipart boundary

    let response: Response;
    try {
      response = await fetch(apiUrl(path), {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include',
      });
    } catch (err) {
      if (isNetworkError(err)) {
        throw new ApiClientError(0, i18n.t('api.networkError'));
      }
      throw err;
    }

    let data: any = null;
    const contentType = response.headers.get('content-type');
    if (response.status !== 204 && contentType && contentType.includes('application/json')) {
      data = await response.json();
    }

    if (response.status === 401) {
      if (!isTokenlessPath(path)) {
        if (!isRetry) {
          const renewed = await refreshTokenOnce(token);
          if (renewed) {
            return api.upload<T>(path, formData, true);
          }
        }
        if (token) {
          handleUnauthorizedRedirect();
          throw new ApiClientError(401, i18n.t('api.sessionExpired'));
        }
      }

      const rawError = (data && (data.error || data.message)) || '';
      const mappedKey = resolveApiErrorKey(401, rawError);
      const message = mappedKey ? i18n.t(mappedKey) : (rawError || i18n.t('api.unauthorized'));

      throw new ApiClientError(401, message, data && data.details);
    }

    if (!response.ok) {
      const rawError = (data && (data.message || data.error)) || '';
      const mappedKey = resolveApiErrorKey(response.status, rawError);
      const message = mappedKey ? i18n.t(mappedKey) : (rawError || i18n.t('api.uploadFailed'));

      throw new ApiClientError(
        response.status,
        message,
        data && data.details
      );
    }

    return data as T;
  },
};
