import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Platform-adaptive base URL
const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:8000';

const TOKEN_KEY = 'algosplit_access_token';
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
      return;
    }
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // ignore
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

// Response interceptor - handle 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await tokenStore.clearToken();
      emitAuthLogout();
    }
    return Promise.reject(error);
  }
);

// Helper to handle API errors
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      return String(data.detail);
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
