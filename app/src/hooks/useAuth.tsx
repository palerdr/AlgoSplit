import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth.api';
import { tokenStore, onAuthLogout, getErrorMessage } from '../api/client';
import type { UserInfo } from '../types/api.types';

// Refresh the token 5 minutes before it expires
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const USER_CACHE_KEY = 'algosplit_user';

async function getCachedUser(): Promise<UserInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as UserInfo) : null;
  } catch {
    return null;
  }
}

async function setCachedUser(user: UserInfo): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // ignore cache failures
  }
}

async function clearCachedUser(): Promise<void> {
  try {
    await AsyncStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // ignore cache failures
  }
}

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(10_000, expiresIn * 1000 - REFRESH_BUFFER_MS);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const rt = await tokenStore.getRefreshToken();
        if (!rt) return;
        const res = await authApi.refreshToken(rt);
        if (res.access_token) await tokenStore.setToken(res.access_token);
        if (res.refresh_token) await tokenStore.setRefreshToken(res.refresh_token);
        scheduleRefresh(res.expires_in);
      } catch {
        // Refresh failed — interceptor will handle 401 on next request
      }
    }, delay);
  }, []);

  // Proactively refresh the token, e.g. on bootstrap or app foreground.
  // This avoids relying solely on the 401 interceptor for long sessions.
  const refreshNow = useCallback(async () => {
    try {
      const rt = await tokenStore.getRefreshToken();
      if (!rt) return;
      const res = await authApi.refreshToken(rt);
      if (res.access_token) await tokenStore.setToken(res.access_token);
      if (res.refresh_token) await tokenStore.setRefreshToken(res.refresh_token);
      scheduleRefresh(res.expires_in);
    } catch {
      // Refresh failed — interceptor will handle 401 on next request
    }
  }, [scheduleRefresh]);

  // Check existing session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Native can skip the bootstrap user request when no token is stored.
        if (Platform.OS !== 'web') {
          const token = await tokenStore.getToken();
          if (!token) {
            if (!cancelled) setState({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }

          const cachedUser = await getCachedUser();
          if (cachedUser && !cancelled) {
            setState({ user: cachedUser, isAuthenticated: true, isLoading: false });
          }
        }

        const user = await authApi.getCurrentUser();
        await setCachedUser(user);
        if (!cancelled) {
          setState({ user, isAuthenticated: true, isLoading: false });
          // Schedule proactive refresh on bootstrap so long sessions stay alive
          refreshNow();
        }
      } catch {
        await clearCachedUser();
        if (!cancelled) setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [refreshNow]);

  // Refresh token when app returns from background (mobile)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && state.isAuthenticated) {
        refreshNow();
      }
    });
    return () => subscription.remove();
  }, [refreshNow, state.isAuthenticated]);

  // Listen for 401 auto-logout from interceptor
  useEffect(() => {
    return onAuthLogout(() => {
      setState({ user: null, isAuthenticated: false, isLoading: false });
      queryClient.clear();
    });
  }, [queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    const promises: Promise<void>[] = [setCachedUser(res.user)];
    if (res.access_token) promises.push(tokenStore.setToken(res.access_token));
    if (res.refresh_token) promises.push(tokenStore.setRefreshToken(res.refresh_token));
    setState({ user: res.user, isAuthenticated: true, isLoading: false });
    queryClient.clear();
    await Promise.all(promises);
    scheduleRefresh(res.expires_in);
  }, [queryClient, scheduleRefresh]);

  const signup = useCallback(async (email: string, password: string) => {
    const res = await authApi.signup({ email, password });
    const promises: Promise<void>[] = [setCachedUser(res.user)];
    if (res.access_token) promises.push(tokenStore.setToken(res.access_token));
    if (res.refresh_token) promises.push(tokenStore.setRefreshToken(res.refresh_token));
    setState({ user: res.user, isAuthenticated: true, isLoading: false });
    queryClient.clear();
    await Promise.all(promises);
    scheduleRefresh(res.expires_in);
  }, [queryClient, scheduleRefresh]);

  const logout = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      await authApi.logout();
    } catch {
      // Server logout may fail — still clear locally
    }
    setState({ user: null, isAuthenticated: false, isLoading: false });
    queryClient.clear();
    await Promise.all([tokenStore.clearToken(), clearCachedUser()]);
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
