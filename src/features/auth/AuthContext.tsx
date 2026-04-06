/**
 * Frontend auth/session state for Supe.
 *
 * The app needs both analytics and Ask cookies to be present, so the auth
 * provider bootstraps and refreshes both before exposing an authenticated state
 * to the routed UI.
 */
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { env } from '../../lib/env';
import {
  AUTH_SUCCESS_CODES,
  authenticateUser,
  clearAskCookie,
  clearAnalyticsCookie,
  createAskCookie,
  createAnalyticsCookie,
  loginUser,
  logoutAuthService,
  validateAskCookie,
  validateAnalyticsCookie
} from './auth-api';
import { resetSessionExpiredSignal, SESSION_EXPIRED_EVENT } from './session-events';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  error: string;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function createOauthState() {
  /** Create a simple per-attempt OAuth state token. */
  return `supe-${Date.now()}`;
}

function buildLoginIdentifier(identifier: string) {
  /** Normalize login input into the UMS payload shape. */
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    return { email: trimmed, userLoginType: 'supe' as const };
  }
  return { phone: trimmed, userLoginType: 'supe' as const };
}

export function AuthProvider({ children }: PropsWithChildren) {
  /** Own auth bootstrap, refresh, login, and logout for the React app. */
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState('');

  const establishSession = useCallback(async (oauthCode?: string) => {
    /** Create or validate both service cookies once an oauthCode is available. */
    if (oauthCode) {
      await Promise.all([createAnalyticsCookie(oauthCode), createAskCookie(oauthCode)]);
      return;
    }
    await Promise.all([validateAnalyticsCookie(), validateAskCookie()]);
  }, []);

  const bootstrapAskCookie = useCallback(async () => {
    /** Recover only the Ask cookie when analytics is still valid but Ask is not. */
    const { data } = await authenticateUser(createOauthState(), env.clientId, env.redirectUrl);
    const oauthCode = data?.responseBody?.oauthCode as string | undefined;
    if (AUTH_SUCCESS_CODES.has(String(data?.responseCode)) && oauthCode) {
      await createAskCookie(oauthCode);
      return;
    }
    throw new Error('Failed to bootstrap Ask session');
  }, []);

  const refresh = useCallback(async () => {
    /** Re-establish the frontend session by validating or re-creating cookies. */
    try {
      setError('');
      setStatus('loading');
      try {
        const [analyticsResult, askResult] = await Promise.allSettled([
          validateAnalyticsCookie(),
          validateAskCookie()
        ]);
        if (analyticsResult.status === 'rejected') {
          throw analyticsResult.reason;
        }
        if (askResult.status === 'rejected') {
          await bootstrapAskCookie();
        }
        resetSessionExpiredSignal();
        setStatus('authenticated');
        return;
      } catch (_error) {
        // Fall back to UMS bootstrap when the analytics cookie is absent or expired.
      }

      const { data } = await authenticateUser(createOauthState(), env.clientId, env.redirectUrl);
      const oauthCode = data?.responseBody?.oauthCode as string | undefined;
      if (AUTH_SUCCESS_CODES.has(String(data?.responseCode))) {
        await establishSession(oauthCode);
        resetSessionExpiredSignal();
        setStatus('authenticated');
        return;
      }
      setStatus('unauthenticated');
    } catch (refreshError: any) {
      setError(refreshError?.response?.data?.detail || refreshError?.message || 'Failed to establish session');
      setStatus('unauthenticated');
    }
  }, [bootstrapAskCookie, establishSession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setError('Session expired. Please sign in again.');
      setStatus('unauthenticated');
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      /** Run the auth-service login flow, then bootstrap both cookies. */
      setError('');
      const bootstrap = await authenticateUser(createOauthState(), env.clientId, env.redirectUrl);
      const bootstrapBody = bootstrap.data?.responseBody ?? {};
      let oauthCode = bootstrapBody.oauthCode as string | undefined;
      if (!oauthCode) {
        const response = await loginUser(
          buildLoginIdentifier(identifier),
          password,
          String(bootstrapBody.xsrfToken || '')
        );
        if (!AUTH_SUCCESS_CODES.has(String(response.data?.responseCode))) {
          throw new Error(response.data?.responseMessage || 'Login failed');
        }
        oauthCode = response.data?.responseBody?.oauthCode;
      }
      if (!oauthCode) {
        throw new Error('Login succeeded but oauthCode was not returned');
      }
      await establishSession(oauthCode);
      resetSessionExpiredSignal();
      setStatus('authenticated');
    },
    [establishSession]
  );

  const logout = useCallback(async () => {
    /** Clear cookies locally and terminate the upstream auth-service session. */
    setError('');
    await Promise.allSettled([logoutAuthService(), clearAnalyticsCookie(), clearAskCookie()]);
    resetSessionExpiredSignal();
    setStatus('unauthenticated');
  }, []);

  const value = useMemo(
    () => ({
      status,
      error,
      login: async (identifier: string, password: string) => {
        try {
          await login(identifier, password);
        } catch (loginError: any) {
          setStatus('unauthenticated');
          setError(loginError?.response?.data?.responseMessage || loginError?.message || 'Login failed');
          throw loginError;
        }
      },
      logout,
      refresh
    }),
    [status, error, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  /** Read the current auth context inside the routed app. */
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
