import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Platform-adaptive base URL.
// In production web builds (Vercel), EXPO_PUBLIC_API_URL is set to '' so
// requests go to the same origin and Vercel rewrites proxy them to Render.
// In dev, falls back to localhost:8000.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  Constants.expoConfig?.extra?.apiUrl ??
  'http://localhost:8000';

const TOKEN_KEY = 'algosplit_access_token';
const REFRESH_KEY = 'algosplit_refresh_token';
const CSRF_KEY = 'algosplit_csrf_token';
const LEGACY_TOKEN_KEY = 'splitai_access_token';
const LEGACY_CSRF_KEY = 'splitai_csrf_token';

function readWebStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearWebStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

function readCookie(name: string): string | null {
  try {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

// Event emitter for auth state changes (cross-platform replacement for window events)
type AuthListener = () => void;
const authListeners = new Set<AuthListener>();
export function onAuthLogout(fn: AuthListener): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}
function emitAuthLogout() {
  authListeners.forEach(fn => fn());
}

// Token storage (native uses SecureStore, web uses localStorage)
export const tokenStore = {
  async getToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return readWebStorage(TOKEN_KEY) ?? readWebStorage(LEGACY_TOKEN_KEY);
    }
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async setToken(token: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
      } catch {
        // noop
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch {
      // SecureStore not available
    }
  },
  async clearToken(): Promise<void> {
    if (Platform.OS === 'web') {
      clearWebStorage(TOKEN_KEY);
      clearWebStorage(LEGACY_TOKEN_KEY);
      clearWebStorage(REFRESH_KEY);
      return;
    }
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    } catch {
      // ignore
    }
  },
  async getRefreshToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return readWebStorage(REFRESH_KEY);
    }
    try {
      return await SecureStore.getItemAsync(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  async setRefreshToken(token: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(REFRESH_KEY, token);
      } catch {
        // noop
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(REFRESH_KEY, token);
    } catch {
      // SecureStore not available
    }
  },
};

// CSRF token storage for web
async function getCsrfToken(): Promise<string | null> {
  if (Platform.OS !== 'web') return null;
  return readCookie(CSRF_KEY) ?? readCookie(LEGACY_CSRF_KEY);
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: Platform.OS === 'web', // Only send cookies on web
  headers: {
    'Content-Type': 'application/json',
  },
});

// Kept separate from apiClient so a failed refresh cannot recursively invoke
// the 401 interceptor. It is also cookie-aware for browser sessions, where
// the HttpOnly refresh token is never exposed to application JavaScript.
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: Platform.OS === 'web',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Attach Bearer token on all platforms (avoids cross-origin CSRF cookie issues on web)
    const token = await tokenStore.getToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    } else if (Platform.OS === 'web') {
      // Fallback: attach CSRF token for cookie-based auth (same-origin only)
      const method = (config.method || 'get').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const csrfToken = await getCsrfToken();
        if (csrfToken) {
          config.headers['X-CSRF-Token'] = csrfToken;
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — attempt silent token refresh on 401 before logging out.
// This prevents mid-session logouts when the access token expires during a
// long workout (Supabase JWTs expire after 60 min by default).
type RefreshOutcome = 'refreshed' | 'invalid' | 'unavailable';
let _refreshPromise: Promise<RefreshOutcome> | null = null;

async function attemptTokenRefresh(): Promise<RefreshOutcome> {
  const refreshToken = await tokenStore.getRefreshToken();
  if (!refreshToken && Platform.OS !== 'web') return 'invalid';
  try {
    const csrfToken = await getCsrfToken();
    const res = await refreshClient.post<{ access_token: string; refresh_token: string }>(
      '/auth/refresh',
      refreshToken ? { refresh_token: refreshToken } : undefined,
      csrfToken ? { headers: { 'X-CSRF-Token': csrfToken } } : undefined,
    );
    if (res.data.access_token) {
      await tokenStore.setToken(res.data.access_token);
    }
    if (res.data.refresh_token) {
      await tokenStore.setRefreshToken(res.data.refresh_token);
    }
    return 'refreshed';
  } catch (error) {
    if (axios.isAxiosError(error) && [400, 401, 403].includes(error.response?.status ?? 0)) {
      return 'invalid';
    }
    return 'unavailable';
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _authRefreshUnavailable?: boolean;
    };
    const isRefreshRequest = originalRequest?.url?.endsWith('/auth/refresh');
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isRefreshRequest) {
      originalRequest._retry = true;
      // Deduplicate concurrent refresh attempts
      if (!_refreshPromise) {
        _refreshPromise = attemptTokenRefresh().finally(() => { _refreshPromise = null; });
      }
      const refreshOutcome = await _refreshPromise;
      if (refreshOutcome === 'refreshed') {
        // Retry the original request with the new token
        const newToken = await tokenStore.getToken();
        if (newToken) {
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        }
        return apiClient(originalRequest);
      }
      if (refreshOutcome === 'invalid') {
        // An expired/revoked refresh credential is the only refresh failure
        // that ends a session. A sleeping Render instance or flaky network
        // must not discard an otherwise valid local session.
        await tokenStore.clearToken();
        emitAuthLogout();
      } else {
        originalRequest._authRefreshUnavailable = true;
      }
    }
    return Promise.reject(error);
  }
);

export function isRecoverableAuthError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return true;
  const config = error.config as (InternalAxiosRequestConfig & {
    _authRefreshUnavailable?: boolean;
  }) | undefined;
  return !error.response || Boolean(config?._authRefreshUnavailable);
}

// Helper to handle API errors
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const detail = (data as { detail: unknown }).detail;
      if (typeof detail === 'string') {
        return detail;
      }
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0];
        if (typeof first === 'string') {
          return first;
        }
        if (typeof first === 'object' && first !== null && 'msg' in first) {
          return String((first as { msg: unknown }).msg);
        }
      }
      if (typeof detail === 'object' && detail !== null) {
        if ('message' in detail) {
          const message = (detail as { message: unknown }).message;
          if (typeof message === 'string') return message;
        }
        if ('unrecognized_exercises' in detail) {
          const items = (detail as { unrecognized_exercises?: unknown }).unrecognized_exercises;
          if (Array.isArray(items) && items.length > 0) {
            return `Unrecognized exercises: ${items.join(', ')}`;
          }
        }
      }
      return 'Request failed. Please review your split inputs and try again.';
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
