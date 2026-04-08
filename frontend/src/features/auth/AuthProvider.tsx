import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as authApi from '@/api/auth.api';
import type { UserInfo } from '@/types/api.types';
import { useAnalysisStore } from '@/stores/analysisStore';
import { useCompareStore } from '@/stores/compareStore';
import { useSplitCreateStore } from '@/stores/splitCreateStore';

interface AuthState {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const clearUserData = () => {
    useAnalysisStore.getState().reset();
    useCompareStore.getState().reset();
    useSplitCreateStore.getState().reset();
    queryClient.clear();
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await authApi.getCurrentUser();
        setState({ user, isAuthenticated: true, isLoading: false });
      } catch {
        setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    };

    checkAuth();
  }, []);

  // Listen for auth:logout events from API interceptor
  useEffect(() => {
    const handleLogout = () => {
      setState({ user: null, isAuthenticated: false, isLoading: false });
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  // Re-validate session when tab regains focus (prevents stale auth after
  // long background periods where the cookie may have expired).
  // On mobile, the network may not be ready immediately after resume, so
  // we delay the check and only log out on definitive 401s — not network errors.
  useEffect(() => {
    let lastCheck = Date.now();
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck < 10 * 60 * 1000) return;
      lastCheck = Date.now();

      // Small delay lets mobile radios reconnect before we hit the network
      setTimeout(async () => {
        try {
          const user = await authApi.getCurrentUser();
          setState({ user, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          // Only treat an explicit 401 as "logged out".
          // Network errors (offline, DNS, timeout) should not kick the user out.
          if (err?.response?.status === 401) {
            setState({ user: null, isAuthenticated: false, isLoading: false });
          }
        }
      }, 1500);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const login = async (email: string, password: string) => {
    clearUserData();
    const response = await authApi.login({ email, password });
    setState({ user: response.user, isAuthenticated: true, isLoading: false });
    navigate('/dashboard');
  };

  const signup = async (email: string, password: string) => {
    clearUserData();
    const response = await authApi.signup({ email, password });
    setState({ user: response.user, isAuthenticated: true, isLoading: false });
    navigate('/dashboard');
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore errors - logout anyway
    } finally {
      clearUserData();
      setState({ user: null, isAuthenticated: false, isLoading: false });
      navigate('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
