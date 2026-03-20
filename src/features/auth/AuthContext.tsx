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
  clearAnalyticsCookie,
  createAnalyticsCookie,
  loginUser,
  logoutAuthService,
  validateAnalyticsCookie
} from './auth-api';

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
  return `supe-${Date.now()}`;
}

function buildLoginIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    return { email: trimmed, userLoginType: 'supe' as const };
  }
  return { phone: trimmed, userLoginType: 'supe' as const };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState('');

  const establishSession = useCallback(async (oauthCode?: string) => {
    if (oauthCode) {
      await createAnalyticsCookie(oauthCode);
      return;
    }
    await validateAnalyticsCookie();
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError('');
      setStatus('loading');
      try {
        await validateAnalyticsCookie();
        setStatus('authenticated');
        return;
      } catch (_error) {
        // Fall back to UMS bootstrap when the analytics cookie is absent or expired.
      }

      const { data } = await authenticateUser(createOauthState(), env.clientId, env.redirectUrl);
      const oauthCode = data?.responseBody?.oauthCode as string | undefined;
      if (AUTH_SUCCESS_CODES.has(String(data?.responseCode))) {
        await establishSession(oauthCode);
        setStatus('authenticated');
        return;
      }
      setStatus('unauthenticated');
    } catch (_error) {
      setStatus('unauthenticated');
    }
  }, [establishSession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (identifier: string, password: string) => {
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
      setStatus('authenticated');
    },
    [establishSession]
  );

  const logout = useCallback(async () => {
    setError('');
    await Promise.allSettled([logoutAuthService(), clearAnalyticsCookie()]);
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
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
