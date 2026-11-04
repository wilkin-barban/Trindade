/**
 * The session provider, exercised instead of read.
 *
 * This file used to read `AuthContext.tsx` and match its source with regular expressions. A matching
 * source is not a working logout: it proved the call was written, not that it ran, and a refactor that
 * moved the call into a branch nobody reaches would have kept the test green. What is asserted here is
 * what a person actually keeps in the browser after pressing «Salir» and what survives a renewal.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const clearStoredSession = vi.fn();

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
    clearStoredSession: () => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_refresh_token');
      localStorage.removeItem('auth_user');
      clearStoredSession();
    },
  };
});

const { AuthProvider, useAuth } = await import('./AuthContext');
const { AUTH_SESSION_REFRESHED_EVENT } = await import('../api/client');
const { AERO_SESSION_PASSWORD_KEY } = await import('../lib/aero-integration');
const { AERO_AUTO_READ_KEY } = await import('../lib/aero-auto-read');

function Probe() {
  const { user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="user">{user?.username ?? 'anon'}</span>
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
  clearStoredSession.mockClear();
  get.mockReset();
  post.mockReset();
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
});

describe('the session provider', () => {
  it('forgets the token, the plant password and the pending read when the session closes', async () => {
    post.mockResolvedValue({
      token: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 1, username: 'wilkin', role: 'Administrador' },
    });

    renderProvider();
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(localStorage.getItem('auth_refresh_token')).toBe('refresh-1');

    // A shift that ends with the plant password and a pending read in the tab.
    sessionStorage.setItem(AERO_SESSION_PASSWORD_KEY, 'plant-secret');
    localStorage.setItem(AERO_AUTO_READ_KEY, JSON.stringify({ date: '2026-11-03', at: Date.now() }));

    await act(async () => {
      screen.getByText('logout').click();
    });

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_refresh_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
    // The ERP session belongs to the Trindade session it was typed in, and so does the read the launch
    // owed: neither may fire under the next person who signs in on this phone.
    expect(sessionStorage.getItem(AERO_SESSION_PASSWORD_KEY)).toBeNull();
    expect(localStorage.getItem(AERO_AUTO_READ_KEY)).toBeNull();
    expect(screen.getByTestId('user').textContent).toBe('anon');
  });

  it('adopts the token of a renewal the client performed in the background', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('anon'));

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(AUTH_SESSION_REFRESHED_EVENT, {
          detail: { token: 'access-2', refreshToken: 'refresh-2' },
        }),
      );
    });

    // The renewal writes the refresh token and updates the token the provider hands out; a provider that
    // ignored the event would keep an expired access token until the next request failed.
    expect(localStorage.getItem('auth_refresh_token')).toBe('refresh-2');
  });
});
