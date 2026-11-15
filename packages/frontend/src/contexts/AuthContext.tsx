import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import {
  api,
  clearStoredSession,
  getAccessToken,
  logoutSession,
  refreshTokenOnce,
  AUTH_SESSION_REFRESHED_EVENT,
} from '../api/client';
import { clearAeroAutoRead } from '../lib/aero-auto-read';
import { clearAeroSessionPassword } from '../lib/aero-integration';

export interface User {
  id: number;
  username: string;
  role: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * The cached identity, and nothing else.
 *
 * `auth_user` is a name and a role, not a credential: it is what lets a reload show the shell while the session
 * is still being renewed. The tokens are elsewhere on purpose -- the access token in memory, the session in an
 * `HttpOnly` cookie -- so a script that reads this storage gets a display name and no key to the plant.
 */
const STORED_USER_KEY = 'auth_user';

function readStoredUser(): User | null {
  const raw = localStorage.getItem(STORED_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // A background renewal hands the provider a new access token. The refresh token never travels in this
  // event: it left JavaScript the moment the server set the cookie.
  useEffect(() => {
    const handleRefreshed = (event: Event) => {
      const custom = event as CustomEvent<{ token?: string }>;
      if (custom.detail?.token) {
        setToken(custom.detail.token);
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener(AUTH_SESSION_REFRESHED_EVENT, handleRefreshed);
      return () => {
        window.removeEventListener(AUTH_SESSION_REFRESHED_EVENT, handleRefreshed);
      };
    }
  }, []);

  // Restore the session on mount from the cookie, which every tab shares and a reload keeps. The cached user is
  // the hint that this browser had a session -- a display name, not a credential -- and it is what keeps an
  // anonymous visit from posting a refresh it cannot answer on every page load.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!readStoredUser()) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      // The renewal is the sign-in proof now: the browser presents the cookie, and only a rotated session
      // answers with an access token. A refusal is not an error the operator caused, so it just stays signed
      // out instead of showing the expiry notice.
      const renewed = await refreshTokenOnce(null);
      if (!renewed) {
        clearStoredSession();
        if (!cancelled) {
          setToken(null);
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const data = await api.get<{ user: User }>('/auth/me');
        if (!cancelled) {
          setToken(getAccessToken());
          setUser(data.user);
          localStorage.setItem(STORED_USER_KEY, JSON.stringify(data.user));
          setIsLoading(false);
        }
      } catch {
        clearStoredSession();
        if (!cancelled) {
          setToken(null);
          setUser(null);
          setIsLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<User> => {
      // The client declares itself as the web on every call, so the server answers with the access token and
      // sets the session cookie instead of putting the refresh token in the body.
      const response = await api.post<{ token: string; user: User }>(
        '/auth/login',
        { username, password }
      );

      localStorage.setItem(STORED_USER_KEY, JSON.stringify(response.user));
      setToken(response.token);
      setUser(response.user);

      return response.user;
    },
    []
  );

  const logout = useCallback(() => {
    // Best-effort server call: it revokes the session the cookie names and clears the cookie. The browser
    // forgets everything here regardless, so a failed network call cannot leave the tab signed in.
    void logoutSession().catch(() => undefined);

    clearStoredSession();
    // The ERP password belongs to the session it was typed in: logging out of Trindade closes it too.
    clearAeroSessionPassword();
    // A mark left behind would fire a plant read in the next session, for a launch this one made.
    clearAeroAutoRead();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
