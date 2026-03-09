import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || 'algosplit_csrf_token';
const AUTH_COOKIE_NAME = 'algosplit_access_token';

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

// Response interceptor - handle 401
// Note: Don't redirect here - let React Router's ProtectedRoute handle navigation
// Hard redirects cause refresh loops when combined with auth state checks
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      console.warn('[AlgoSplit] 401 Unauthorized:', error.config?.method?.toUpperCase(), error.config?.url, getAuthDiagnostics());
      // Dispatch custom event so AuthProvider can update state
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
