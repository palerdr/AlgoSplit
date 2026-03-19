import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as authApi from '@/api/auth.api';
import { clearRefreshToken } from '@/api/client';
import type { UserInfo } from '@/types/api.types';
import { useAnalysisStore } from '@/stores/analysisStore';
import { useCompareStore } from '@/stores/compareStore';
import { useSplitCreateStore } from '@/stores/splitCreateStore';

/** Refresh 5 minutes before token expires */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

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
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUserData = () => {
    useAnalysisStore.getState().reset();
    useCompareStore.getState().reset();
    useSplitCreateStore.getState().reset();
    queryClient.clear();
  };

  // Schedule a proactive token refresh before expiry
  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(10_000, expiresIn * 1000 - REFRESH_BUFFER_MS);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const user = await authApi.getCurrentUser();
        setState((prev) => ({ ...prev, user, isAuthenticated: true }));
      } catch {
        // 401 interceptor will handle refresh + retry
      }
    }, delay);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

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
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      clearRefreshToken();
      setState({ user: null, isAuthenticated: false, isLoading: false });
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  // Listen for successful token refresh events (from 401 interceptor)
  // to re-schedule the next proactive refresh
  useEffect(() => {
    const handleRefreshed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.expires_in) {
        scheduleRefresh(detail.expires_in);
      }
    };
    window.addEventListener('auth:refreshed', handleRefreshed);
    return () => window.removeEventListener('auth:refreshed', handleRefreshed);
  }, [scheduleRefresh]);

  // Re-validate session when tab regains focus (prevents stale auth after
  // long background periods where the cookie may have expired)
  useEffect(() => {
    let lastCheck = Date.now();
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      // Only re-check if hidden for > 10 minutes
      if (Date.now() - lastCheck < 10 * 60 * 1000) return;
      lastCheck = Date.now();
      try {
        const user = await authApi.getCurrentUser();
        setState({ user, isAuthenticated: true, isLoading: false });
      } catch {
        setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const login = async (email: string, password: string) => {
    clearUserData();
    const response = await authApi.login({ email, password });
    setState({ user: response.user, isAuthenticated: true, isLoading: false });
    scheduleRefresh(response.expires_in);
    navigate('/dashboard');
  };

  const signup = async (email: string, password: string) => {
    clearUserData();
    const response = await authApi.signup({ email, password });
    setState({ user: response.user, isAuthenticated: true, isLoading: false });
    scheduleRefresh(response.expires_in);
    navigate('/dashboard');
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore errors - logout anyway
    } finally {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      clearRefreshToken();
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
