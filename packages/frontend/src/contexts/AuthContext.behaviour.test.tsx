/**
 * The session provider, exercised instead of read.
 *
 * This file used to read `AuthContext.tsx` and match its source with regular expressions. A matching
 * source is not a working logout: it proved the call was written, not that it ran, and a refactor that
 * moved the call into a branch nobody reaches would have kept the test green. What is asserted here is
 * what a person actually keeps in the browser after pressing «Salir», what survives a renewal, and that a
 * reload lands signed in from the cookie alone -- with no credential left in `localStorage` for a script to
 * read.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const clearStoredSession = vi.fn();
const refreshTokenOnce = vi.fn();
const setAccessToken = vi.fn();
let accessToken: string | null = null;

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    AUTH_SESSION_REFRESHED_EVENT: actual.AUTH_SESSION_REFRESHED_EVENT,
    apiUrl: (path: string) => `http://backend.test${path}`,
    api: {
      get: (...args: unknown[]) => get(...args),
      post: (...args: unknown[]) => post(...args),
    },
    refreshTokenOnce: async (...args: unknown[]) => {
      const renewed = await refreshTokenOnce(...args);
      // A successful renewal is what puts a fresh access token in memory.
      if (renewed && accessToken === null) accessToken = 'access-1';
      return renewed;
    },
    getAccessToken: () => accessToken,
    setAccessToken: (token: string | null) => {
      accessToken = token;
      setAccessToken(token);
    },
    clearStoredSession: () => {
      localStorage.removeItem('auth_user');
      accessToken = null;
      clearStoredSession();
    },
  };
});

const { AuthProvider, useAuth } = await import('./AuthContext');
const { AUTH_SESSION_REFRESHED_EVENT } = await import('../api/client');
const { AERO_SESSION_PASSWORD_KEY } = await import('../lib/aero-integration');
const { AERO_AUTO_READ_KEY } = await import('../lib/aero-auto-read');

function Probe() {
  const { user, token, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="user">{user?.username ?? 'anon'}</span>
      <span data-testid="token">{token ?? 'no-token'}</span>
      <button onClick={() => void login('wilkin', 'secret')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  accessToken = null;
  clearStoredSession.mockClear();
  setAccessToken.mockClear();
  get.mockReset();
  post.mockReset();
  refreshTokenOnce.mockReset();
  refreshTokenOnce.mockResolvedValue(true);
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
});

describe('the session provider', () => {
  it('keeps the access token out of localStorage and forgets it, the plant password and the pending read on logout', async () => {
    post.mockResolvedValue({
      token: 'access-1',
      user: { id: 1, username: 'wilkin', role: 'Administrador' },
    });

    renderProvider();
    await act(async () => {
      screen.getByText('login').click();
    });

    expect(screen.getByTestId('token').textContent).toBe('access-1');
    expect(localStorage.getItem('auth_user')).not.toBeNull();
    // The whole point of the change: neither credential is written anywhere JavaScript can read it back.
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_refresh_token')).toBeNull();

    // A shift that ends with the plant password and a pending read in the tab.
    sessionStorage.setItem(AERO_SESSION_PASSWORD_KEY, 'plant-secret');
    localStorage.setItem(AERO_AUTO_READ_KEY, JSON.stringify({ date: '2026-11-03', at: Date.now() }));

    await act(async () => {
      screen.getByText('logout').click();
    });

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_refresh_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
    expect(screen.getByTestId('token').textContent).toBe('no-token');
    // The ERP session belongs to the Trindade session it was typed in, and so does the read the launch
    // owed: neither may fire under the next person who signs in on this phone.
    expect(sessionStorage.getItem(AERO_SESSION_PASSWORD_KEY)).toBeNull();
    expect(localStorage.getItem(AERO_AUTO_READ_KEY)).toBeNull();
    expect(screen.getByTestId('user').textContent).toBe('anon');

    // Signing out ends the server-side session too, and clears the cookie it lived in.
    const logoutCall = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).endsWith('/auth/logout'),
    );
    expect(logoutCall?.[1]?.credentials).toBe('include');
  });

  it('lands signed in on a reload, renewing from the cookie with nothing in localStorage but the user', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'wilkin', role: 'Administrador' }));
    get.mockResolvedValue({ user: { id: 1, username: 'wilkin', role: 'Administrador' } });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('access-1'));
    expect(screen.getByTestId('user').textContent).toBe('wilkin');
    expect(refreshTokenOnce).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/auth/me');
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('lands signed in when the cookie is valid even though localStorage was cleared', async () => {
    // The cookie is the session. localStorage can be emptied by a privacy setting, a cleared profile or a person
    // tidying up, and a browser that still holds a valid HttpOnly cookie is still signed in; gating the renewal
    // on the cached name turned that into a silent sign-out.
    expect(localStorage.getItem('auth_user')).toBeNull();
    get.mockResolvedValue({ user: { id: 1, username: 'wilkin', role: 'Administrador' } });

    const mounted = renderProvider();

    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('access-1'));
    expect(screen.getByTestId('user').textContent).toBe('wilkin');
    expect(refreshTokenOnce).toHaveBeenCalledTimes(1);
    mounted.unmount();
  });

  it('shares the renewed session with a second tab that mounts later', async () => {
    get.mockResolvedValue({ user: { id: 1, username: 'wilkin', role: 'Administrador' } });
    const first = renderProvider();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('wilkin'));
    first.unmount();

    // A second tab is a second mount against the same cookie jar: it renews on its own and lands signed in,
    // without the first tab's token being read from anywhere.
    renderProvider();
    await waitFor(() => expect(screen.getAllByTestId('user').at(-1)?.textContent).toBe('wilkin'));
    expect(localStorage.getItem('auth_token')).toBeNull();
    screen.getAllByTestId('user').forEach(() => undefined);
  });

  it('stays anonymous when the cookie no longer holds a session', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'wilkin', role: 'Administrador' }));
    refreshTokenOnce.mockResolvedValue(false);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('anon'));
    expect(get).not.toHaveBeenCalled();
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('adopts the token of a renewal the client performed in the background', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('anon'));

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(AUTH_SESSION_REFRESHED_EVENT, {
          detail: { token: 'access-2' },
        }),
      );
    });

    // A provider that ignored the event would keep handing out an expired access token until the next
    // request failed. The renewal carries the access token only: the refresh token stays in the cookie.
    expect(screen.getByTestId('token').textContent).toBe('access-2');
    expect(localStorage.getItem('auth_refresh_token')).toBeNull();
  });
});
