import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || 'algosplit_csrf_token';
const AUTH_COOKIE_NAME = 'algosplit_access_token';

// In-memory refresh token store (not persisted — cleared on page reload, which is fine
// because cookies handle the normal auth flow; this is only for mid-session refresh)
let _refreshToken: string | null = null;
let _refreshPromise: Promise<boolean> | null = null;

export function setRefreshToken(token: string) {
  _refreshToken = token;
}

export function getRefreshToken(): string | null {
  return _refreshToken;
}

export function clearRefreshToken() {
  _refreshToken = null;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

function readCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Diagnostic snapshot of cookie/auth state for debugging save failures */
export function getAuthDiagnostics(): {
  hasAuthCookie: boolean;
  hasCsrfCookie: boolean;
  cookieCount: number;
} {
  return {
    hasAuthCookie: readCookie(AUTH_COOKIE_NAME) !== null,
    hasCsrfCookie: readCookie(CSRF_COOKIE_NAME) !== null,
    cookieCount: document.cookie ? document.cookie.split(';').filter(c => c.trim()).length : 0,
  };
}

// Request interceptor - attach CSRF token for state-changing requests
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const method = (config.method || 'get').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrfToken = readCookie(CSRF_COOKIE_NAME);
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      } else {
        console.warn('[AlgoSplit] No CSRF cookie found for', method, config.url, getAuthDiagnostics());
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Attempt to refresh the access token using the stored refresh token.
// Deduplicates concurrent refresh attempts so only one request is in-flight.
function attemptTokenRefresh(): Promise<boolean> {
  if (!_refreshToken) return Promise.resolve(false);
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = axios
    .post(`${API_BASE_URL}/auth/refresh`, { refresh_token: _refreshToken }, { withCredentials: true })
    .then((res) => {
      if (res.data.refresh_token) _refreshToken = res.data.refresh_token;
      window.dispatchEvent(new CustomEvent('auth:refreshed', {
        detail: { expires_in: res.data.expires_in },
      }));
      return true;
    })
    .catch(() => false)
    .finally(() => { _refreshPromise = null; });

  return _refreshPromise;
}

// Response interceptor - handle 401 with retry
// Note: Don't redirect here - let React Router's ProtectedRoute handle navigation
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && config && !config._retry) {
      config._retry = true;
      console.warn('[AlgoSplit] 401 — attempting token refresh', config.method?.toUpperCase(), config.url);
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        // Retry the original request — cookies are now updated
        return apiClient(config);
      }
      // Refresh failed — dispatch logout
      console.warn('[AlgoSplit] Token refresh failed, logging out', getAuthDiagnostics());
      window.dispatchEvent(new CustomEvent('auth:logout'));
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
