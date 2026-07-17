/**
 * Complete typed client for the AlgoSplit FastAPI backend.
 *
 * Covers EVERY endpoint mounted in backend/main.py:365-389:
 *   auth, splits, imports (split import preview), workouts, exercise
 *   overrides, custom exercises, comparisons, programs, session templates,
 *   program sessions, program diagnostics, periodization, meso templates,
 *   bodyweight, analysis, plus the root/health/keepalive endpoints.
 *
 * Auth is platform-aware. Web keeps access/refresh tokens in Secure, HttpOnly
 * cookies and echoes the readable CSRF cookie on writes. Native receives
 * tokens only when it identifies itself to the backend, stores them in the
 * platform keychain through SecureStore, and authenticates with Bearer.
 *
 * All field names are exactly as the API serializes them (snake_case).
 * Datetimes/date fields are ISO-8601 strings on the wire.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type RuntimePlatform = 'web' | 'native';

/** Resolve an API URL without treating a deliberate same-origin web value as missing. */
export function resolveBackendUrl(
  configuredValue: string | undefined,
  platform: RuntimePlatform,
  development: boolean
): string | null {
  if (platform === 'web' && !development) return '';
  if (configuredValue !== undefined) {
    const normalized = configuredValue.trim().replace(/\/$/, '');
    return normalized.length > 0 || platform === 'web' ? normalized : null;
  }
  if (development) return 'http://localhost:8000';
  return platform === 'web' ? '' : null;
}

const IS_WEB = Platform.OS === 'web';
const IS_DEVELOPMENT =
  typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
const API_URL = resolveBackendUrl(
  process.env.EXPO_PUBLIC_ALGOSPLIT_API as string | undefined,
  IS_WEB ? 'web' : 'native',
  IS_DEVELOPMENT
);

/** True when the backend can be called, including same-origin production web. */
export function backendConfigured(): boolean {
  return API_URL !== null;
}

/** Error thrown for any non-2xx backend response (or when unconfigured, status 0). */
export class BackendError extends Error {
  /** HTTP status code (0 when the backend is not configured / no response). */
  readonly status: number;
  /** Parsed error body when available (usually `{ detail: ... }`). */
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.detail = detail;
  }
}

const AUTH_SERVICE_UNAVAILABLE =
  'Account service is temporarily unavailable. Please try again later.';

const PUBLIC_AUTH_DETAILS = new Set([
  'Could not create account with those details',
  'Enter a valid email address',
  'Password does not meet security requirements',
  'Invalid email or password',
  'Please check your email and confirm your account before signing in',
  'Invalid or expired refresh token',
  'Could not validate social sign-in. Try again.',
  'Connect another sign-in method before disconnecting this one.',
  'Choose a supported account connection.',
  'Unable to reset password. Request a new link and try again.',
  'Enter a valid email and a password of at least 8 characters.',
  'Enter a valid email and password.',
  'Use a valid reset link and a password of at least 8 characters.',
]);

function responseDetail(detail: unknown): string | null {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'detail' in detail) {
    const value = (detail as { detail?: unknown }).detail;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

/** Convert every auth transport/provider failure into a deliberately public message. */
export function safeAuthErrorMessage(status: number, path: string, detail?: unknown): string {
  if (status === 0 || status === 404 || status >= 500) return AUTH_SERVICE_UNAVAILABLE;
  if (status === 429) return 'Too many authentication attempts. Wait a minute and try again.';

  const publicDetail = responseDetail(detail);
  if (publicDetail && PUBLIC_AUTH_DETAILS.has(publicDetail)) return publicDetail;

  if (status === 422) {
    if (path === '/auth/oauth/complete') {
      return 'Could not validate social sign-in. Try again.';
    }
    if (path.startsWith('/auth/identities/')) {
      return 'Could not update your connected accounts. Please try again.';
    }
    if (path === '/auth/signup') {
      return 'Enter a valid email and a password of at least 8 characters.';
    }
    if (path === '/auth/forgot-password') return 'Enter a valid email address.';
    if (path === '/auth/reset-password') {
      return 'Use a valid reset link and a password of at least 8 characters.';
    }
    return 'Enter a valid email and password.';
  }
  if (path === '/auth/login' && status === 401) return 'Invalid email or password';
  if (path === '/auth/signup') return 'Could not create account with those details';
  if (path === '/auth/reset-password') {
    return 'Unable to reset password. Request a new link and try again.';
  }
  if (path === '/auth/user' || path === '/auth/refresh') {
    return 'Your session has expired. Please sign in again.';
  }
  if (path === '/auth/oauth/complete') {
    return 'Could not validate social sign-in. Try again.';
  }
  if (path.startsWith('/auth/identities/')) {
    return 'Could not update your connected accounts. Please try again.';
  }
  return 'Authentication failed. Please try again.';
}

/** Keep unexpected runtime/provider errors out of authentication screens. */
export function authErrorMessageForDisplay(error: unknown, fallback: string): string {
  return error instanceof BackendError ? error.message : fallback;
}

/** CSRF cookie/header names — defaults in backend/api/security.py:24-25. */
const CSRF_COOKIE_NAME = 'algosplit_csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const NATIVE_CLIENT_HEADER_NAME = 'X-AlgoSplit-Client';
const ACCESS_TOKEN_KEY = 'algosplit_access_token';
const REFRESH_TOKEN_KEY = 'algosplit_refresh_token';
const NATIVE_SESSION_KEY = 'algosplit_native_session_v1';
const NATIVE_SESSION_VERSION = 1;
const NATIVE_REFRESH_SKEW_MS = 5 * 60_000;

interface NativeSessionEnvelope {
  version: 1;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Authentication credentials never enter web-accessible storage. */
export const nativeTokenStore = {
  async getSession(): Promise<NativeSessionEnvelope | null> {
    if (IS_WEB) return null;
    try {
      const serialized = await SecureStore.getItemAsync(NATIVE_SESSION_KEY);
      if (serialized) {
        let parsed: Partial<NativeSessionEnvelope> | null = null;
        try {
          parsed = JSON.parse(serialized) as Partial<NativeSessionEnvelope>;
        } catch {
          // Corrupt local state is not a provider or connectivity failure. Drop
          // only the unusable envelope and let the normal signed-out flow run.
        }
        if (
          parsed?.version === NATIVE_SESSION_VERSION &&
          typeof parsed.accessToken === 'string' &&
          typeof parsed.refreshToken === 'string' &&
          typeof parsed.expiresAt === 'number'
        ) {
          return parsed as NativeSessionEnvelope;
        }
        await SecureStore.deleteItemAsync(NATIVE_SESSION_KEY);
        return null;
      }

      const [legacyAccessToken, legacyRefreshToken] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      ]);
      if (!legacyAccessToken || !legacyRefreshToken) return null;

      // Legacy storage did not retain expiry, so force one safe rotation as
      // soon as the migrated session is used.
      const migrated: NativeSessionEnvelope = {
        version: NATIVE_SESSION_VERSION,
        accessToken: legacyAccessToken,
        refreshToken: legacyRefreshToken,
        expiresAt: 0,
      };
      await SecureStore.setItemAsync(
        NATIVE_SESSION_KEY,
        JSON.stringify(migrated),
        SECURE_STORE_OPTIONS
      );
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      ]);
      return migrated;
    } catch {
      throw new BackendError(
        0,
        'Secure account storage is temporarily unavailable. Unlock this device and try again.'
      );
    }
  },
  async getAccessToken(): Promise<string | null> {
    return (await this.getSession())?.accessToken ?? null;
  },
  async getRefreshToken(): Promise<string | null> {
    return (await this.getSession())?.refreshToken ?? null;
  },
  async needsRefresh(skewMs = NATIVE_REFRESH_SKEW_MS): Promise<boolean> {
    const session = await this.getSession();
    return Boolean(session && session.expiresAt <= Date.now() + skewMs);
  },
  async save(accessToken: string, refreshToken: string, expiresIn = 3600): Promise<void> {
    if (IS_WEB) return;
    const envelope: NativeSessionEnvelope = {
      version: NATIVE_SESSION_VERSION,
      accessToken,
      refreshToken,
      expiresAt: Date.now() + Math.max(0, expiresIn) * 1000,
    };
    try {
      await SecureStore.setItemAsync(
        NATIVE_SESSION_KEY,
        JSON.stringify(envelope),
        SECURE_STORE_OPTIONS
      );
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      ]);
    } catch (error) {
      // A locked keychain or transient device-storage failure must not turn a
      // recoverable condition into a logout. The previous envelope, if any,
      // remains authoritative until a complete rotated envelope is persisted.
      throw error;
    }
  },
  async clear(): Promise<void> {
    if (IS_WEB) return;
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(NATIVE_SESSION_KEY),
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      ]);
    } catch {
      // A local logout must remain possible even when keychain access fails.
    }
  },
};

/** Read the double-submit CSRF cookie on web; null on native (no document). */
function readCsrfToken(): string | null {
  const doc = (globalThis as { document?: { cookie?: string } }).document;
  if (!doc || typeof doc.cookie !== 'string') return null;
  const match = doc.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]+)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

type QueryValue = string | number | boolean | undefined | null;

/** Build a query string, skipping undefined/null values. */
function qs(params: Record<string, QueryValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/**
 * Single fetch helper used by every endpoint function.
 * - JSON in / JSON out, cookies included (JWT cookie auth).
 * - Attaches X-CSRF-Token on mutating methods when the CSRF cookie is readable.
 * - Throws BackendError (with `status` and parsed `detail`) on !ok.
 * - 204 / empty bodies resolve to undefined.
 */
const AUTH_ROUTES_WITHOUT_REFRESH = new Set([
  '/auth/csrf',
  '/auth/login',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/refresh',
  '/auth/oauth/complete',
]);

async function storeNativeAuthResponse(response: AuthResponse): Promise<void> {
  if (IS_WEB) return;
  if (!response.access_token || !response.refresh_token) {
    await nativeTokenStore.clear();
    throw new BackendError(
      0,
      'The backend did not return native session credentials. Enable native token responses and try again.'
    );
  }
  try {
    await nativeTokenStore.save(
      response.access_token,
      response.refresh_token,
      response.expires_in
    );
  } catch {
    throw new BackendError(
      0,
      'Could not store the account session securely on this device. Try again.'
    );
  }
}

async function parseResponse<T>(res: Response, method: HttpMethod, path: string): Promise<T> {
  if (!res.ok) {
    let detail: unknown;
    let message = `${method} ${path} → HTTP ${res.status}`;
    try {
      detail = await res.json();
      const parsedDetail = responseDetail(detail);
      if (parsedDetail) message = parsedDetail;
    } catch {
      // Non-JSON error body; keep the status-only message.
    }
    if (path.startsWith('/auth/')) message = safeAuthErrorMessage(res.status, path, detail);
    throw new BackendError(res.status, message, detail);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  try {
    if (text.length === 0) throw new Error('Empty response');
    return JSON.parse(text) as T;
  } catch {
    const message = path.startsWith('/auth/')
      ? safeAuthErrorMessage(502, path)
      : 'The server returned an invalid response. Please try again.';
    throw new BackendError(502, message);
  }
}

let csrfPromise: Promise<string> | null = null;

async function ensureCsrfToken(force = false): Promise<string | null> {
  if (!IS_WEB || API_URL === null) return null;
  const existing = readCsrfToken();
  if (existing && !force) return existing;
  if (!csrfPromise) {
    csrfPromise = fetch(`${API_URL}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
      headers: { accept: 'application/json' },
    })
      .then(async (response) => {
        await parseResponse<void>(response, 'GET', '/auth/csrf');
        const token = readCsrfToken();
        if (!token) {
          throw new BackendError(0, AUTH_SERVICE_UNAVAILABLE);
        }
        return token;
      })
      .catch((error) => {
        if (error instanceof BackendError) throw error;
        throw new BackendError(0, AUTH_SERVICE_UNAVAILABLE);
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

type RefreshOutcome = 'refreshed' | 'invalid';
let refreshPromise: Promise<RefreshOutcome> | null = null;

async function refreshCredentials(retriedCsrf = false): Promise<RefreshOutcome> {
  if (API_URL === null) return 'invalid';
  const refreshToken = IS_WEB ? null : await nativeTokenStore.getRefreshToken();
  if (!IS_WEB && !refreshToken) {
    await nativeTokenStore.clear();
    return 'invalid';
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!IS_WEB) headers[NATIVE_CLIENT_HEADER_NAME] = 'native';
  if (IS_WEB) {
    const csrf = await ensureCsrfToken();
    if (!csrf) throw new BackendError(0, AUTH_SERVICE_UNAVAILABLE);
    headers[CSRF_HEADER_NAME] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers,
      credentials: IS_WEB ? 'include' : 'omit',
      body: !IS_WEB ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
    });
  } catch {
    throw new BackendError(0, safeAuthErrorMessage(0, '/auth/refresh'));
  }

  if (IS_WEB && res.status === 403 && !retriedCsrf) {
    await ensureCsrfToken(true);
    return refreshCredentials(true);
  }
  if ([400, 401, 403].includes(res.status)) {
    await nativeTokenStore.clear();
    return 'invalid';
  }
  const response = await parseResponse<AuthResponse>(res, 'POST', '/auth/refresh');
  await storeNativeAuthResponse(response);
  return 'refreshed';
}

async function refreshOnce(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = refreshCredentials().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  allowRefresh = true
): Promise<T> {
  if (API_URL === null) {
    throw new BackendError(
      0,
      'AlgoSplit backend not configured (set EXPO_PUBLIC_ALGOSPLIT_API)'
    );
  }

  if (
    !IS_WEB &&
    allowRefresh &&
    !AUTH_ROUTES_WITHOUT_REFRESH.has(path) &&
    (await nativeTokenStore.needsRefresh())
  ) {
    await refreshOnce();
  }

  const isMutation = method !== 'GET' && method !== 'HEAD';
  if (IS_WEB && isMutation && !AUTH_ROUTES_WITHOUT_REFRESH.has(path)) {
    await ensureCsrfToken();
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!IS_WEB) {
    headers[NATIVE_CLIENT_HEADER_NAME] = 'native';
    const accessToken = await nativeTokenStore.getAccessToken();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  } else if (isMutation) {
    const csrf = readCsrfToken();
    if (csrf) headers[CSRF_HEADER_NAME] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: IS_WEB ? 'include' : 'omit',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const message = path.startsWith('/auth/')
      ? safeAuthErrorMessage(0, path)
      : error instanceof Error
        ? error.message
        : 'Could not reach the AlgoSplit backend';
    throw new BackendError(0, message);
  }

  if (
    res.status === 401 &&
    allowRefresh &&
    !AUTH_ROUTES_WITHOUT_REFRESH.has(path)
  ) {
    const outcome = await refreshOnce();
    if (outcome === 'refreshed') return request<T>(method, path, body, false);
  }

  return parseResponse<T>(res, method, path);
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared scalar unions
// ═══════════════════════════════════════════════════════════════════════════

/** Fatigue curve dataset (schemas/models.py:73-77, schemas/splits.py:134-138). */
export type Dataset = 'schoenfeld' | 'pelland' | 'average';

/** Resistance profile override (schemas/models.py:25-29). */
export type ResistanceProfile = 'ascending' | 'mid' | 'descending';

/** Program lifecycle status (schemas/programs.py:76). */
export type ProgramStatus = 'draft' | 'active' | 'completed' | 'archived';

/** Scheduled program-session status (schemas/programs.py:145). */
export type ProgramSessionStatus = 'planned' | 'completed' | 'skipped';

/** Mesocycle progression type (schemas/periodization.py:57). */
export type ProgressionType = 'linear' | 'undulating' | 'block' | 'custom';

/** Diagnostics granularity (schemas/programs.py:218). */
export type DiagnosticsLevel = 'session' | 'micro' | 'meso' | 'macro';

/** Import preview match triage status (schemas/imports.py:49). */
export type ImportExerciseStatusKind = 'matched' | 'ambiguous' | 'unrecognized';

// ═══════════════════════════════════════════════════════════════════════════
// Auth types (backend/schemas/auth.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/auth.py:9 — POST /auth/signup body. */
export interface SignUpRequest {
  email: string;
  /** Min 8 characters. */
  password: string;
}

/** schemas/auth.py:27 — POST /auth/login body. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** schemas/auth.py:45 — optional POST /auth/refresh body (native clients). */
export interface RefreshRequest {
  refresh_token?: string | null;
}

/** schemas/auth.py:96 — POST /auth/forgot-password body. */
export interface ForgotPasswordRequest {
  email: string;
}

/** schemas/auth.py:102 — POST /auth/reset-password body. */
export interface ResetPasswordRequest {
  /** Recovery access token from the Supabase reset-link URL fragment. */
  access_token: string;
  /** Min 8 characters. */
  new_password: string;
}

/**
 * schemas/auth.py:78 — user info returned by GET /auth/user and inside
 * AuthResponse. The API may serialize `email` as null; treat falsy as absent.
 * Index signature keeps this assignable to `Record<string, unknown>` for
 * screens typed against a loose "me" shape.
 */
export interface UserInfo extends Record<string, unknown> {
  /** User ID (UUID). */
  id: string;
  email?: string;
}

/** schemas/auth.py:51 — response of signup/login/refresh. Tokens are empty strings when the deployment keeps them cookie-only (AUTH_EXPOSE_ACCESS_TOKEN=false). */
export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserInfo;
  email_confirmation_required?: boolean;
}

/** Supported social provider names (backend/schemas/auth.py:SocialProvider). */
export type SocialProvider = 'google' | 'apple';

/** A sign-in method shown in the Connected accounts settings section. */
export type SignInProvider = 'email' | SocialProvider;

/** Client family used by the server to select its fixed identity-link callback. */
export type AuthClientPlatform = 'web' | 'native';

/** Short-lived Supabase credentials sent once to the API after social sign-in. */
export interface OAuthSessionCompleteRequest {
  access_token: string;
  refresh_token: string;
}

/** Safe identity data returned by GET /auth/identities. */
export interface AuthIdentity {
  provider: SignInProvider;
  email?: string | null;
  created_at?: string | null;
  can_disconnect: boolean;
}

export interface IdentityListResponse {
  identities: AuthIdentity[];
}

export interface IdentityLinkResponse {
  url: string;
}

/** schemas/auth.py:109 — error body shape ({ detail }). */
export interface ErrorResponse {
  detail: string;
}

/** Plain-dict message responses (auth.py:326, auth.py:372). */
export interface MessageResponse {
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Split types (backend/schemas/splits.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/splits.py:14 — exercise inside SplitCreate sessions. */
export interface ExerciseCreate {
  name: string;
  /** > 0 */
  sets: number;
  /** Default false. */
  unilateral?: boolean;
  resistance_profile?: ResistanceProfile | null;
}

/** schemas/splits.py:66 — session inside SplitCreate. */
export interface SessionCreate {
  name: string;
  /** Day number in the weekly cycle, 1-7. */
  day_number: number;
  /** Empty means this session is a non-executable rest day. */
  exercises: ExerciseCreate[];
}

/** schemas/splits.py:121 — body of POST /api/splits and PUT /api/splits/{id}/full. */
export interface SplitCreate {
  name: string;
  /** 1-7; auto-calculated from sessions when omitted. Null clears on /full. */
  cycle_length?: number | null;
  /** Hours of elevated protein synthesis. Default 48. */
  stimulus_duration?: number;
  /** Sets needed to maintain muscle. Default 4. */
  maintenance_volume?: number;
  /** Default "pelland". */
  dataset?: Dataset;
  sessions: SessionCreate[];
}

/** schemas/splits.py:172 — body of PUT /api/splits/{id} (metadata-only patch). */
export interface SplitUpdate {
  name?: string;
  /** Explicit null clears the stored cycle length. */
  cycle_length?: number | null;
  /** 24-96. */
  stimulus_duration?: number;
  /** 1-9. */
  maintenance_volume?: number;
  dataset?: Dataset;
}

/** schemas/splits.py:197 — one row patch in the exercises batch update. */
export interface ExerciseBatchUpdateItem {
  /** Exercise row ID. At least one other field must be present. */
  id: string;
  name?: string;
  sets?: number;
  unilateral?: boolean;
  resistance_profile?: ResistanceProfile | null;
}

/** schemas/splits.py:221 — body of PUT /api/splits/{id}/exercises/batch. */
export interface ExerciseBatchUpdateRequest {
  updates: ExerciseBatchUpdateItem[];
}

/** schemas/splits.py:227 — response of the exercises batch update. */
export interface ExerciseBatchUpdateResponse {
  updated: number;
}

/** schemas/splits.py:32 — exercise row as stored. */
export interface ExerciseResponse {
  id: string;
  session_id: string;
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: string | null;
  created_at: string;
}

/** schemas/splits.py:89 — session row with nested exercises. */
export interface SessionResponse {
  id: string;
  split_id: string;
  name: string;
  day_number: number;
  exercises: ExerciseResponse[];
  created_at: string;
  updated_at: string;
}

/** schemas/splits.py:233 — full split with nested sessions/exercises. */
export interface SplitResponse {
  id: string;
  user_id: string;
  name: string;
  cycle_length: number | null;
  stimulus_duration: number;
  maintenance_volume: number;
  dataset: string;
  sessions: SessionResponse[];
  created_at: string;
  updated_at: string;
}

/** schemas/splits.py:266 — response of GET /api/splits. */
export interface SplitListResponse {
  splits: SplitResponse[];
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Analysis types (backend/schemas/models.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/models.py:15 — exercise inside an analysis SplitRequest. */
export interface ExerciseInput {
  name: string;
  /** 1-20. */
  sets: number;
  /** Default false. */
  unilateral?: boolean;
  resistance_profile?: ResistanceProfile | null;
}

/** schemas/models.py:42 — session inside an analysis SplitRequest. */
export interface SessionInput {
  name: string;
  /** Day number in the split, 1-14. */
  day: number;
  exercises: ExerciseInput[];
}

/** schemas/models.py:62 — body of POST /api/analyze-split. */
export interface SplitRequest {
  /** Default "My Split". */
  name?: string;
  /** 1-14 sessions. */
  sessions: SessionInput[];
  /** 1-14; defaults to max day number. */
  cycle_length?: number | null;
  /** 24-96, default 48. */
  stimulus_duration?: number;
  /** 1-9, default 3. */
  maintenance_volume?: number;
  /** Default "pelland". */
  dataset?: Dataset;
  /** Default true; set false for faster responses. */
  include_breakdowns?: boolean;
}

/** schemas/models.py:108 — body of POST /api/parse-exercise. */
export interface ExerciseParseRequest {
  text: string;
}

/** schemas/models.py:124 — per-region stimulus stats. */
export interface MuscleStats {
  region_id: string;
  display_name: string;
  parent_group: string;
  stimulus: number;
  atrophy: number;
  net_stimulus: number;
  primary_sets: number;
  prime_sets: number;
  secondary_sets: number;
  tertiary_sets: number;
  frequency: number;
  /** S / M / L. */
  leverage: string;
  /** + / 0 / -. */
  damage_tier: string;
  /** 0..1 readiness; null when the muscle wasn't trained in the window. */
  recovery_readiness: number | null;
}

/** schemas/models.py:170 — per-parent-group summary. */
export interface MuscleGroupSummary {
  group: string;
  total_net_stimulus: number;
  total_sets: number;
  regions: string[];
}

/** schemas/models.py:182 — one optimization suggestion. */
export interface OptimizationSuggestion {
  /** HIGH | MEDIUM | LOW. */
  priority: string;
  muscle: string;
  issue: string;
  suggestion: string;
}

/** schemas/models.py:190 — overall summary statistics. */
export interface SummaryStats {
  total_sets: number;
  muscles_trained: number;
  total_muscles: number;
  avg_net_stimulus: number;
  avg_sets_per_muscle: number;
  group_summaries: MuscleGroupSummary[] | null;
}

/** schemas/models.py:206 — one set's stimulus breakdown for one muscle. */
export interface SetBreakdown {
  set_number: number;
  weight: number;
  recovery_multiplier: number;
  bilateral_multiplier: number;
  local_multiplier: number;
  global_multiplier: number;
  consecutive_day_multiplier: number;
  final_stimulus: number;
}

/** schemas/models.py:218 — one muscle's contribution for an exercise. */
export interface MuscleContribution {
  muscle_id: string;
  display_name: string;
  /** prime | secondary | tertiary | quaternary. */
  tier: string;
  base_weight: number;
  leverage_weight: number;
  sets: SetBreakdown[];
  total_stimulus: number;
}

/** schemas/models.py:229 — full breakdown of an exercise across muscles. */
export interface ExerciseBreakdown {
  name: string;
  pattern: string;
  sets: number;
  resistance_profile: string;
  is_bilateral: boolean;
  is_unilateral: boolean;
  axial_load: number;
  muscle_contributions: MuscleContribution[];
}

/** schemas/models.py:241 — breakdown of all exercises in a session. */
export interface SessionBreakdown {
  session_name: string;
  day_number: number;
  exercises: ExerciseBreakdown[];
  cumulative_sets: number;
  cumulative_axial_fatigue: number;
  final_cns_multiplier: number;
  consecutive_days: number;
  consecutive_day_penalty: number;
}

/** schemas/models.py:257 — response of analyze-split / analyze-workouts / split analyze. */
export interface AnalysisResponse {
  split_name: string;
  cycle_length: number;
  stimulus_duration: number;
  maintenance_volume: number;
  dataset: string;
  muscles: MuscleStats[];
  group_summaries: MuscleGroupSummary[];
  suggestions: OptimizationSuggestion[];
  summary: SummaryStats;
  session_breakdowns: SessionBreakdown[] | null;
}

/** schemas/models.py:321 — one muscle region reference entry. */
export interface MuscleRegionInfo {
  region_id: string;
  display_name: string;
  parent_group: string;
  leverage: string;
  damage_tier: string;
  recovery_modifier: number;
  axial_fatigue_contributor: boolean;
  primary_actions: string[];
  notes: string | null;
}

/** schemas/models.py:334 — response of GET /api/muscle-regions. */
export interface MuscleRegionsResponse {
  regions: MuscleRegionInfo[];
  total_count: number;
  parent_groups: string[];
}

/** schemas/models.py:345 — muscle targets organized by stimulus tier. */
export interface TieredTargets {
  prime: Record<string, number>;
  secondary: Record<string, number>;
  tertiary: Record<string, number>;
  quaternary: Record<string, number>;
}

/** schemas/models.py:353 — one movement pattern. */
export interface PatternInfo {
  name: string;
  display_name: string;
  tiered_targets: TieredTargets;
  bilateral: boolean;
  axial_load: number;
  resistance_profile: string;
  notes: string | null;
}

/** schemas/models.py:364 — response of GET /api/patterns. */
export interface PatternsResponse {
  patterns: PatternInfo[];
  total_count: number;
}

/** schemas/models.py:374 — response of POST /api/parse-exercise. */
export interface ExerciseParseResponse {
  original_text: string;
  recognized: boolean;
  pattern: string | null;
  pattern_name: string | null;
  tiered_targets: TieredTargets | null;
  bilateral: boolean;
  unilateral: boolean;
  axial_load: number;
  resistance_profile: string;
  /** high | medium | low | unknown. */
  confidence: string;
}

/** Query params of POST /api/analyze-workouts (api/analysis_routes.py:157-165). */
export interface AnalyzeWorkoutsParams {
  /** 1-90, default 7. */
  days?: number;
  /** Inclusive end date, YYYY-MM-DD. */
  end_date?: string;
  /** Client local offset from UTC in minutes, -840..840, default 0. */
  timezone_offset_minutes?: number;
  /** 24-96, default 48. */
  stimulus_duration?: number;
  /** 1-9, default 3. */
  maintenance_volume?: number;
  /** Default "schoenfeld". */
  dataset?: Dataset;
}

// ═══════════════════════════════════════════════════════════════════════════
// Workout types (backend/schemas/workouts.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/workouts.py:14 — one exercise in a logged workout. */
export interface WorkoutExerciseCreate {
  exercise_name: string;
  /** 1-100; must equal reps.length and weight.length (and rir.length if set). */
  sets_completed: number;
  /** Reps per set, e.g. [8, 8, 7]. */
  reps: number[];
  /** Weight (lbs) per set, e.g. [185, 185, 185]. */
  weight: number[];
  /** Reps-in-reserve per set, values 0-5. */
  rir?: number[] | null;
  /** Max 500 chars. */
  notes?: string | null;
}

/**
 * schemas/workouts.py:85 (WorkoutLogCreate) — body of POST /api/workouts and
 * PUT /api/workouts/{id}. Exported as `WorkoutCreate` per the app API contract.
 */
export interface WorkoutCreate {
  /** Stable native idempotency key for durable upload retries. */
  client_request_id?: string | null;
  /** Optional reference to a planned split session. */
  session_id?: string | null;
  split_id?: string | null;
  /** Program session to mark completed after logging. */
  program_session_id?: string | null;
  session_name: string;
  /** ISO datetime; defaults to now server-side. */
  completed_at?: string | null;
  duration_minutes?: number | null;
  /** Max 1000 chars. */
  notes?: string | null;
  /** 1-100 exercises. */
  exercises: WorkoutExerciseCreate[];
}

/** Backend model name alias for WorkoutCreate. */
export type WorkoutLogCreate = WorkoutCreate;

/** schemas/workouts.py:48 — logged exercise row. */
export interface WorkoutExerciseResponse {
  id: string;
  workout_log_id: string;
  exercise_name: string;
  sets_completed: number;
  reps: number[];
  weight: number[];
  rir: number[] | null;
  order_index: number;
  notes: string | null;
  created_at: string;
}

/** schemas/workouts.py:138 — full logged workout. */
export interface WorkoutLogResponse {
  id: string;
  user_id: string;
  session_id: string | null;
  split_id: string | null;
  session_name: string;
  completed_at: string;
  duration_minutes: number | null;
  notes: string | null;
  /** True when a stale session_id was dropped at log time. */
  session_id_dropped: boolean;
  exercises: WorkoutExerciseResponse[];
  created_at: string;
}

/** schemas/workouts.py:177 — response of GET /api/workouts. */
export interface WorkoutHistoryResponse {
  workouts: WorkoutLogResponse[];
  total: number;
}

/** schemas/workouts.py:188 — compact history card row. */
export interface WorkoutSummaryResponse {
  id: string;
  user_id: string;
  session_id: string | null;
  split_id: string | null;
  session_name: string;
  completed_at: string;
  duration_minutes: number | null;
  exercise_count: number;
  total_sets: number;
  exercise_names: string[];
  created_at: string;
}

/** schemas/workouts.py:204 — response of GET /api/workouts/summaries. */
export interface WorkoutSummaryListResponse {
  workouts: WorkoutSummaryResponse[];
  total: number;
}

export interface WorkoutOverviewPoint {
  id: string;
  completed_at: string;
  total_sets: number;
  total_volume: number;
}

export interface WorkoutOverviewResponse {
  workouts: WorkoutOverviewPoint[];
}

export interface WorkoutProgressExercise {
  exercise_name: string;
  reps: number[];
  weight: number[];
  rir: Array<number | null> | null;
  order_index: number;
}

export interface WorkoutProgressWorkout {
  id: string;
  completed_at: string;
  session_name: string;
  exercises: WorkoutProgressExercise[];
}

export interface WorkoutProgressResponse {
  workouts: WorkoutProgressWorkout[];
  total: number;
}

/** schemas/workouts.py:215 — response of GET /api/workouts/dates. */
export interface WorkoutDatesResponse {
  /** Distinct YYYY-MM-DD strings, newest first. */
  dates: string[];
  total: number;
}

/** Entry of most_frequent_exercises (built at api/routes/workouts.py:762). */
export interface MostFrequentExercise {
  exercise: string;
  count: number;
}

/** schemas/workouts.py:222 — response of GET /api/workouts/stats/summary. */
export interface WorkoutStatsResponse {
  total_workouts: number;
  total_sets: number;
  total_volume_pounds: number;
  average_duration_minutes: number | null;
  most_frequent_exercises: MostFrequentExercise[];
  last_workout_date: string | null;
}

/** Plain-dict response of DELETE /api/workouts/exercises/by-name/{name} (workouts.py:513,523). */
export interface ClearExerciseHistoryResponse {
  deleted_count: number;
}

/** Pagination/window params shared by workout list endpoints. */
export interface WorkoutListParams {
  /** 1-500, default 50. */
  limit?: number;
  /** Default 0. */
  offset?: number;
  /** Filter to last N days. */
  days?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bodyweight types (backend/schemas/bodyweight.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/bodyweight.py:10 — body of POST /api/bodyweight. */
export interface BodyweightEntryCreate {
  /** Weight in lbs, 0 < w <= 9999.99. */
  weight: number;
  /** ISO datetime; defaults to now server-side. */
  recorded_at?: string | null;
  /** Max 500 chars. */
  notes?: string | null;
}

/** schemas/bodyweight.py:16 (BodyweightEntryResponse) — one stored entry. */
export interface BodyweightEntry {
  id: string;
  user_id: string;
  weight: number;
  recorded_at: string;
  notes: string | null;
  created_at: string;
}

/** Backend model name alias for BodyweightEntry. */
export type BodyweightEntryResponse = BodyweightEntry;

/** schemas/bodyweight.py:25 — list wrapper returned by GET /api/bodyweight. */
export interface BodyweightEntryListResponse {
  entries: BodyweightEntry[];
  total: number;
}

/** schemas/bodyweight.py:30 — body of POST /api/bodyweight/batch (1-500 entries). */
export interface BodyweightBatchCreate {
  entries: BodyweightEntryCreate[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Comparison types (backend/schemas/comparisons.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/comparisons.py:10 — body of POST /api/comparisons. */
export interface ComparisonCreate {
  name: string;
  /** 2-4 split IDs. */
  split_ids: string[];
}

/** schemas/comparisons.py:30 — body of PUT /api/comparisons/{id}. */
export interface ComparisonUpdate {
  name?: string;
  split_ids?: string[];
}

/** schemas/comparisons.py:37 — one saved comparison. */
export interface ComparisonResponse {
  id: string;
  user_id: string;
  name: string;
  split_ids: string[];
  created_at: string;
  updated_at: string;
}

/** schemas/comparisons.py:48 — response of GET /api/comparisons. */
export interface ComparisonListResponse {
  comparisons: ComparisonResponse[];
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Exercise override types (backend/schemas/overrides.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/overrides.py:10 — body of POST /api/exercise-overrides. */
export interface ExerciseOverrideCreate {
  exercise_name: string;
  /** Must be a valid pattern key (see GET /api/patterns). */
  pattern_override: string;
}

/** schemas/overrides.py:28 — one exercise override. */
export interface ExerciseOverrideResponse {
  id: string;
  user_id: string;
  exercise_name: string;
  pattern_override: string;
  created_at: string;
  updated_at: string;
}

/** schemas/overrides.py:54 — response of GET /api/exercise-overrides. */
export interface ExerciseOverrideListResponse {
  overrides: ExerciseOverrideResponse[];
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Custom exercise types (backend/schemas/overrides.py — same file)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * schemas/overrides.py:69 — body of POST /api/custom-exercises.
 * All muscle weights across all four tiers must sum to 1.0; muscle IDs must
 * come from the 29-region model (GET /api/muscle-regions).
 */
export interface CustomExerciseCreate {
  /** 1-100 chars. */
  exercise_name: string;
  prime_targets?: Record<string, number>;
  secondary_targets?: Record<string, number>;
  tertiary_targets?: Record<string, number>;
  quaternary_targets?: Record<string, number>;
  /** 0-1, default 0. */
  axial_load?: number;
  /** Default "mid". */
  resistance_profile?: ResistanceProfile;
  /** Default true. */
  is_bilateral?: boolean;
}

/** schemas/overrides.py:121 — body of PUT /api/custom-exercises/{id} (partial). */
export interface CustomExerciseUpdate {
  exercise_name?: string;
  prime_targets?: Record<string, number>;
  secondary_targets?: Record<string, number>;
  tertiary_targets?: Record<string, number>;
  quaternary_targets?: Record<string, number>;
  axial_load?: number;
  resistance_profile?: ResistanceProfile;
  is_bilateral?: boolean;
}

/** schemas/overrides.py:145 — one custom exercise. */
export interface CustomExerciseResponse {
  id: string;
  user_id: string;
  exercise_name: string;
  prime_targets: Record<string, number>;
  secondary_targets: Record<string, number>;
  tertiary_targets: Record<string, number>;
  quaternary_targets: Record<string, number>;
  axial_load: number;
  resistance_profile: string;
  is_bilateral: boolean;
  created_at: string;
  updated_at: string;
}

/** Convenience alias. */
export type CustomExercise = CustomExerciseResponse;

/** schemas/overrides.py:183 — list wrapper returned by GET /api/custom-exercises. */
export interface CustomExerciseListResponse {
  exercises: CustomExerciseResponse[];
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Import preview types (backend/schemas/imports.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/imports.py:20 — one worksheet of raw cells. */
export interface ImportSheet {
  /** Default "". */
  name?: string;
  /** Raw cell grid (rows of cells). Total cells across sheets max 10,000. */
  grid: (string | null)[][];
}

/** schemas/imports.py:27 — body of POST /api/splits/import/preview (1-20 sheets). */
export interface ImportPreviewRequest {
  sheets: ImportSheet[];
  /** Suggested split name, e.g. the file name. */
  split_name_hint?: string | null;
}

/** schemas/imports.py:43 — match triage for one extracted exercise. */
export interface ImportedExerciseStatus {
  session_index: number;
  exercise_index: number;
  raw_name: string;
  status: ImportExerciseStatusKind;
  pattern: string | null;
  score: number;
}

/** schemas/imports.py:54 — SplitCreate-shaped inferred split. */
export interface ImportPreviewSplit {
  name: string;
  sessions: SessionCreate[];
}

/** schemas/imports.py:65 — response of the import preview. */
export interface ImportPreviewResponse {
  /** Null when no split could be inferred. */
  split: ImportPreviewSplit | null;
  /** long | wide | blocked | unknown. */
  layout: string;
  /** 0-1 recognized fraction of exercises. */
  confidence: number;
  exercises: ImportedExerciseStatus[];
  warnings: string[];
  sheet_name: string | null;
  skipped_sheets: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Program types (backend/schemas/programs.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/programs.py:60 — body of POST /api/programs. */
export interface ProgramCreate {
  name: string;
  /** YYYY-MM-DD. */
  start_date?: string | null;
  end_date?: string | null;
  /** Max 500 chars. */
  goal?: string | null;
  /** Default 48. */
  stimulus_duration?: number;
  /** Default 4. */
  maintenance_volume?: number;
  /** Default "schoenfeld". */
  dataset?: Dataset;
}

/** schemas/programs.py:70 — body of PUT /api/programs/{id}. */
export interface ProgramUpdate {
  name?: string;
  start_date?: string;
  end_date?: string;
  goal?: string;
  status?: ProgramStatus;
  stimulus_duration?: number;
  maintenance_volume?: number;
  dataset?: Dataset;
}

/** schemas/programs.py:81 — program summary row. */
export interface ProgramResponse {
  id: string;
  user_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  goal: string | null;
  status: string;
  stimulus_duration: number;
  maintenance_volume: number;
  dataset: string;
  session_count: number;
  created_at: string;
  updated_at: string;
}

/** schemas/programs.py:97 — response of GET /api/programs. */
export interface ProgramListResponse {
  programs: ProgramResponse[];
  total: number;
}

/** schemas/programs.py:122 — exercise override row on a program session. */
export interface ProgramSessionExerciseResponse {
  id: string;
  program_session_id: string;
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: string | null;
  created_at: string;
}

/** schemas/programs.py:148 — one scheduled program session. */
export interface ProgramSessionResponse {
  id: string;
  program_id: string;
  micro_id: string | null;
  /** YYYY-MM-DD. */
  date: string;
  template_id: string | null;
  template_name: string | null;
  custom_name: string | null;
  status: string;
  notes: string | null;
  workout_log_id: string | null;
  exercises: ProgramSessionExerciseResponse[];
  created_at: string;
  updated_at: string;
}

/** schemas/programs.py:101 — program detail with scheduled sessions. */
export interface ProgramDetailResponse {
  id: string;
  user_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  goal: string | null;
  status: string;
  stimulus_duration: number;
  maintenance_volume: number;
  dataset: string;
  sessions: ProgramSessionResponse[];
  created_at: string;
  updated_at: string;
}

/** schemas/programs.py:133 — body of POST /api/programs/{id}/sessions. */
export interface ProgramSessionCreate {
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  template_id?: string | null;
  custom_name?: string | null;
  notes?: string | null;
}

/** schemas/programs.py:140 — body of PUT /api/programs/{id}/sessions/{sid}. */
export interface ProgramSessionUpdate {
  date?: string;
  template_id?: string;
  custom_name?: string;
  status?: ProgramSessionStatus;
  notes?: string;
}

/** schemas/programs.py:164 — list wrapper for program sessions. */
export interface ProgramSessionListResponse {
  sessions: ProgramSessionResponse[];
  total: number;
}

/** schemas/programs.py:168 — body of POST /api/programs/{id}/sessions/batch. */
export interface ProgramSessionBatchCreate {
  sessions: ProgramSessionCreate[];
}

/** schemas/programs.py:14 — exercise inside a session template create. */
export interface TemplateExerciseCreate {
  exercise_name: string;
  sets: number;
  /** Default 0 (falls back to list order server-side). */
  order_index?: number;
  unilateral?: boolean;
  resistance_profile?: string | null;
}

/** schemas/programs.py:22 — stored template exercise row. */
export interface TemplateExerciseResponse {
  id: string;
  template_id: string;
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: string | null;
  created_at: string;
}

/** schemas/programs.py:33 — body of POST /api/session-templates. */
export interface SessionTemplateCreate {
  name: string;
  exercises: TemplateExerciseCreate[];
  notes?: string | null;
}

/** schemas/programs.py — body of PUT /api/session-templates/{id}. */
export interface SessionTemplateUpdate {
  name: string;
  exercises: TemplateExerciseCreate[];
  notes?: string | null;
}

/** schemas/programs.py:39 — one session template. */
export interface SessionTemplateResponse {
  id: string;
  user_id: string;
  name: string;
  source_session_id: string | null;
  source_split_id: string | null;
  notes: string | null;
  exercises: TemplateExerciseResponse[];
  created_at: string;
  updated_at: string;
}

/** schemas/programs.py:51 — response of GET /api/session-templates. */
export interface SessionTemplateListResponse {
  templates: SessionTemplateResponse[];
  total: number;
}

/** schemas/programs.py:177 — body of POST /api/session-templates/from-session. */
export interface CreateTemplateFromSession {
  /** ID of the split session to clone. */
  session_id: string;
  /** Override template name. */
  name?: string | null;
}

/** schemas/programs.py:187 — exercise resolved from template or overrides. */
export interface ResolvedExercise {
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: string | null;
}

/** schemas/programs.py:195 — response of GET .../sessions/{sid}/exercises. */
export interface ResolvedExerciseList {
  exercises: ResolvedExercise[];
}

/** schemas/programs.py:198 — a program session scheduled for a given date. */
export interface TodaySessionItem {
  id: string;
  program_id: string;
  program_name: string;
  /** YYYY-MM-DD. */
  date: string;
  display_name: string;
  status: string;
  template_id: string | null;
}

/** schemas/programs.py:208 — response of GET /api/programs/sessions/today. */
export interface TodaySessionsResponse {
  sessions: TodaySessionItem[];
}

/** schemas/programs.py:216 — body of POST /api/programs/{id}/diagnostics. */
export interface DiagnosticsRequest {
  /** Default "session". */
  level?: DiagnosticsLevel;
  /** Session/micro/meso/macro ID to analyze (required by the backend). */
  target_id?: string | null;
}

// Diagnostics responses are level-dependent (api/routes/program_diagnostics.py):
// session/micro → AnalysisResponse; meso/macro → structured dicts below.

/** Weekly result inside a meso diagnostics run (program_diagnostics.py:157,193). */
export interface MesoDiagnosticsWeek {
  week_index: number;
  analysis: AnalysisResponse | null;
}

/** One point of a muscle progression series (program_diagnostics.py:204-209). */
export interface MuscleProgressionPoint {
  week_index: number;
  net_stimulus: number;
  stimulus: number;
  atrophy: number;
}

/** Per-muscle progression across meso weeks (program_diagnostics.py:200-209). */
export interface MuscleProgression {
  region_id: string;
  display_name: string;
  parent_group: string;
  values: MuscleProgressionPoint[];
}

/** Meso-level diagnostics payload (program_diagnostics.py:211-216). */
export interface MesoDiagnosticsResponse {
  level: 'meso';
  target_id: string;
  weeks: MesoDiagnosticsWeek[];
  progression: MuscleProgression[];
}

/** Average stimulus entry per region (program_diagnostics.py:287-293). */
export interface MacroAvgStimulusEntry {
  region_id: string;
  display_name: string;
  parent_group: string;
  avg_net_stimulus: number;
}

/** Per-meso summary inside macro diagnostics (program_diagnostics.py:295-300). */
export interface MacroMesoSummary {
  meso_id: string;
  name: string;
  avg_stimulus: Record<string, MacroAvgStimulusEntry>;
  /** Absent when the meso had no analyzable weeks. */
  week_count?: number;
}

/** Macro-level diagnostics payload (program_diagnostics.py:302-306). */
export interface MacroDiagnosticsResponse {
  level: 'macro';
  target_id: string;
  meso_summaries: MacroMesoSummary[];
}

/** Union of all diagnostics payloads; discriminate on `level` for meso/macro. */
export type DiagnosticsResponse =
  | AnalysisResponse
  | MesoDiagnosticsResponse
  | MacroDiagnosticsResponse;

// ═══════════════════════════════════════════════════════════════════════════
// Periodization types (backend/schemas/periodization.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/periodization.py:14 — body of POST .../periodization/mesos/{id}/micros. */
export interface MicroCycleCreate {
  /** Week number within the mesocycle, >= 0. */
  week_index: number;
  /** YYYY-MM-DD. */
  start_date?: string | null;
  end_date?: string | null;
  /** Default false. */
  deload?: boolean;
  notes?: string | null;
}

/** schemas/periodization.py:22 — body of PUT .../periodization/micros/{id}. */
export interface MicroCycleUpdate {
  week_index?: number;
  start_date?: string;
  end_date?: string;
  deload?: boolean;
  notes?: string;
}

/** schemas/periodization.py:29 — one microcycle (training week). */
export interface MicroCycleResponse {
  id: string;
  meso_id: string;
  week_index: number;
  start_date: string | null;
  end_date: string | null;
  deload: boolean;
  notes: string | null;
  session_ids: string[];
  created_at: string;
  updated_at: string;
}

/** schemas/periodization.py:41 — list wrapper (declared; not used by any route). */
export interface MicroCycleListResponse {
  micros: MicroCycleResponse[];
  total: number;
}

/** schemas/periodization.py:50 — body of POST .../periodization/macros/{id}/mesos. */
export interface MesoCycleCreate {
  name: string;
  focus?: string | null;
  /** Default 0. */
  order_index?: number;
  start_date?: string | null;
  end_date?: string | null;
  /** Default "linear". */
  progression_type?: ProgressionType;
  notes?: string | null;
}

/** schemas/periodization.py:60 — body of PUT .../periodization/mesos/{id}. */
export interface MesoCycleUpdate {
  name?: string;
  focus?: string;
  order_index?: number;
  start_date?: string;
  end_date?: string;
  progression_type?: ProgressionType;
  notes?: string;
}

/** schemas/periodization.py:69 — one mesocycle (training block). */
export interface MesoCycleResponse {
  id: string;
  macro_id: string;
  name: string;
  focus: string | null;
  order_index: number;
  start_date: string | null;
  end_date: string | null;
  progression_type: string;
  notes: string | null;
  micros: MicroCycleResponse[];
  created_at: string;
  updated_at: string;
}

/** schemas/periodization.py:83 — list wrapper (declared; not used by any route). */
export interface MesoCycleListResponse {
  mesos: MesoCycleResponse[];
  total: number;
}

/** schemas/periodization.py:92 — body of POST .../periodization/macros. */
export interface MacroCycleCreate {
  name: string;
  /** Default 0. */
  order_index?: number;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
}

/** schemas/periodization.py:100 — body of PUT .../periodization/macros/{id}. */
export interface MacroCycleUpdate {
  name?: string;
  order_index?: number;
  start_date?: string;
  end_date?: string;
  notes?: string;
}

/** schemas/periodization.py:107 — one macrocycle with nested mesos/micros. */
export interface MacroCycleResponse {
  id: string;
  program_id: string;
  name: string;
  order_index: number;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  mesos: MesoCycleResponse[];
  created_at: string;
  updated_at: string;
}

/** schemas/periodization.py:119 — response of GET .../periodization/macros. */
export interface MacroCycleListResponse {
  macros: MacroCycleResponse[];
  total: number;
}

/** schemas/periodization.py:128 — body of PUT .../micros/{id}/assign-sessions. */
export interface AssignSessionsRequest {
  session_ids: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Meso template types (backend/schemas/meso_templates.py)
// ═══════════════════════════════════════════════════════════════════════════

/** schemas/meso_templates.py:7 — body of POST /api/meso-templates. */
export interface MesoTemplateCreate {
  name: string;
  /** Existing program meso to snapshot. */
  source_meso_id: string;
  notes?: string | null;
}

/** schemas/meso_templates.py:13 — snapshot of one exercise. */
export interface MesoTemplateExercise {
  exercise_name: string;
  sets: number;
  order_index: number;
  unilateral: boolean;
  resistance_profile: string | null;
}

/** schemas/meso_templates.py:21 — snapshot of one session. */
export interface MesoTemplateSession {
  name: string;
  /** 0=Mon .. 6=Sun. */
  day_of_week: number;
  order_index: number;
  exercises: MesoTemplateExercise[];
}

/** schemas/meso_templates.py:28 — snapshot of one training week. */
export interface MesoTemplateWeek {
  week_index: number;
  deload: boolean;
  sessions: MesoTemplateSession[];
}

/** schemas/meso_templates.py:34 — full template detail. */
export interface MesoTemplateResponse {
  id: string;
  user_id: string;
  name: string;
  focus: string | null;
  progression_type: string | null;
  notes: string | null;
  weeks: MesoTemplateWeek[];
  created_at: string;
}

/** schemas/meso_templates.py:45 — one list row (GET returns an array of these). */
export interface MesoTemplateListResponse {
  id: string;
  name: string;
  focus: string | null;
  week_count: number;
  created_at: string;
}

/** schemas/meso_templates.py:53 — body of POST /api/meso-templates/{id}/apply. */
export interface ApplyMesoTemplateRequest {
  macro_id: string;
  /** YYYY-MM-DD. */
  start_date: string;
  /** Override meso name (defaults to template name). */
  name?: string | null;
}

/** Plain-dict response of the apply endpoint (meso_templates.py:500). */
export interface ApplyMesoTemplateResponse {
  meso_id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Misc types (backend/main.py)
// ═══════════════════════════════════════════════════════════════════════════

/** main.py:243 — GET / API info payload. */
export interface RootResponse {
  name: string;
  version: string;
  description: string;
  /** Nested endpoint directory — informational only. */
  endpoints: Record<string, unknown>;
}

/** main.py:330 — GET /health payload. */
export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

/** main.py:341 — GET /keepalive payload. */
export interface KeepaliveResponse {
  status: string;
  supabase: string;
  rows: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// auth — backend/api/routes/auth.py (prefix /auth)
// ═══════════════════════════════════════════════════════════════════════════

export const auth = {
  /** GET /auth/csrf — issue a readable browser double-submit token. */
  csrf(): Promise<void> {
    return request<void>('GET', '/auth/csrf', undefined, false);
  },

  async refreshIfNeeded(): Promise<boolean> {
    if (IS_WEB || !(await nativeTokenStore.needsRefresh())) return false;
    const outcome = await refreshOnce();
    if (outcome === 'invalid') {
      throw new BackendError(401, 'Your session has expired. Please sign in again.');
    }
    return true;
  },

  /** POST /auth/signup — create an account (api/routes/auth.py:33). 201 → AuthResponse; also sets auth cookies. */
  async signup(email: string, password: string): Promise<AuthResponse> {
    const body: SignUpRequest = { email, password };
    const response = await request<AuthResponse>('POST', '/auth/signup', body);
    if (!response.email_confirmation_required) await storeNativeAuthResponse(response);
    return response;
  },

  /** POST /auth/login — authenticate (api/routes/auth.py:124). Sets auth cookies. */
  async login(email: string, password: string): Promise<AuthResponse> {
    const body: LoginRequest = { email, password };
    const response = await request<AuthResponse>('POST', '/auth/login', body);
    await storeNativeAuthResponse(response);
    return response;
  },

  /** POST /auth/oauth/complete — adopt a verified Supabase social session. */
  async oauthComplete(session: OAuthSessionCompleteRequest): Promise<AuthResponse> {
    const response = await request<AuthResponse>('POST', '/auth/oauth/complete', session);
    await storeNativeAuthResponse(response);
    return response;
  },

  /** GET /auth/user — current user info, i.e. "me" (api/routes/auth.py:209). */
  me(): Promise<UserInfo> {
    return request<UserInfo>('GET', '/auth/user');
  },

  /** GET /auth/identities — connected email, Google, and Apple methods. */
  identities(): Promise<IdentityListResponse> {
    return request<IdentityListResponse>('GET', '/auth/identities');
  },

  /** POST /auth/identities/{provider}/link — get a server-brokered link URL. */
  linkIdentity(provider: SocialProvider, platform: AuthClientPlatform): Promise<IdentityLinkResponse> {
    return request<IdentityLinkResponse>(
      'POST',
      `/auth/identities/${encodeURIComponent(provider)}/link`,
      { platform }
    );
  },

  /** DELETE /auth/identities/{provider} — detach a non-final social method. */
  unlinkIdentity(provider: SocialProvider): Promise<void> {
    return request<void>('DELETE', `/auth/identities/${encodeURIComponent(provider)}`);
  },

  /** POST /auth/refresh — rotate tokens (api/routes/auth.py:234). Cookie clients send no body; native clients pass the refresh token. */
  async refresh(refreshToken?: string): Promise<AuthResponse> {
    const body: RefreshRequest | undefined =
      refreshToken !== undefined ? { refresh_token: refreshToken } : undefined;
    const response = await request<AuthResponse>('POST', '/auth/refresh', body);
    await storeNativeAuthResponse(response);
    return response;
  },

  /** POST /auth/forgot-password — request a reset email (api/routes/auth.py:301). Always 200. */
  forgotPassword(email: string): Promise<MessageResponse> {
    const body: ForgotPasswordRequest = { email };
    return request<MessageResponse>('POST', '/auth/forgot-password', body);
  },

  /** POST /auth/reset-password — set a new password with a recovery token (api/routes/auth.py:329). */
  resetPassword(accessToken: string, newPassword: string): Promise<MessageResponse> {
    const body: ResetPasswordRequest = { access_token: accessToken, new_password: newPassword };
    return request<MessageResponse>('POST', '/auth/reset-password', body);
  },

  /** POST /auth/logout — revoke the session and clear cookies (api/routes/auth.py:384). 204. */
  async logout(): Promise<void> {
    try {
      await request<void>('POST', '/auth/logout');
    } finally {
      await nativeTokenStore.clear();
    }
  },

  /** POST /auth/logout-all — revoke every session belonging to the account. */
  async logoutAll(): Promise<void> {
    try {
      await request<void>('POST', '/auth/logout-all');
    } finally {
      await nativeTokenStore.clear();
    }
  },

  /** DELETE /auth/account — permanently delete the account and all data (api/routes/auth.py:421). 204. */
  async deleteAccount(): Promise<void> {
    await request<void>('DELETE', '/auth/account');
    await nativeTokenStore.clear();
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// splits — backend/api/routes/splits.py (prefix /api/splits)
// ═══════════════════════════════════════════════════════════════════════════

export const splits = {
  /** POST /api/splits — create a split with sessions and exercises (api/routes/splits.py:279). 201. */
  create(split: SplitCreate): Promise<SplitResponse> {
    return request<SplitResponse>('POST', '/api/splits', split);
  },

  /** GET /api/splits — list the user's splits (api/routes/splits.py:401). Pass false to skip nested exercises. */
  list(includeExercises?: boolean): Promise<SplitListResponse> {
    return request<SplitListResponse>(
      'GET',
      `/api/splits${qs({ include_exercises: includeExercises })}`
    );
  },

  /** GET /api/splits/{id} — one split with sessions/exercises (api/routes/splits.py:457). */
  get(splitId: string): Promise<SplitResponse> {
    return request<SplitResponse>('GET', `/api/splits/${encodeURIComponent(splitId)}`);
  },

  createSession(splitId: string, session: SessionCreate): Promise<SessionResponse> {
    return request<SessionResponse>(
      'POST',
      `/api/splits/${encodeURIComponent(splitId)}/sessions`,
      session
    );
  },

  updateSession(
    splitId: string,
    sessionId: string,
    session: SessionCreate
  ): Promise<SessionResponse> {
    return request<SessionResponse>(
      'PUT',
      `/api/splits/${encodeURIComponent(splitId)}/sessions/${encodeURIComponent(sessionId)}`,
      session
    );
  },

  removeSession(splitId: string, sessionId: string): Promise<void> {
    return request<void>(
      'DELETE',
      `/api/splits/${encodeURIComponent(splitId)}/sessions/${encodeURIComponent(sessionId)}`
    );
  },

  /** PUT /api/splits/{id} — update split metadata only (api/routes/splits.py:512). */
  update(splitId: string, update: SplitUpdate): Promise<SplitResponse> {
    return request<SplitResponse>('PUT', `/api/splits/${encodeURIComponent(splitId)}`, update);
  },

  /** PUT /api/splits/{id}/full — replace metadata, sessions, and exercises entirely (api/routes/splits.py:584). */
  replace(splitId: string, split: SplitCreate): Promise<SplitResponse> {
    return request<SplitResponse>(
      'PUT',
      `/api/splits/${encodeURIComponent(splitId)}/full`,
      split
    );
  },

  /** PUT /api/splits/{id}/exercises/batch — patch sets/name/unilateral/profile on existing exercise rows (api/routes/splits.py:734). */
  batchUpdateExercises(
    splitId: string,
    updates: ExerciseBatchUpdateItem[]
  ): Promise<ExerciseBatchUpdateResponse> {
    const body: ExerciseBatchUpdateRequest = { updates };
    return request<ExerciseBatchUpdateResponse>(
      'PUT',
      `/api/splits/${encodeURIComponent(splitId)}/exercises/batch`,
      body
    );
  },

  /** DELETE /api/splits/{id} — delete a split and cascade sessions/exercises (api/routes/splits.py:832). 204. */
  remove(splitId: string): Promise<void> {
    return request<void>('DELETE', `/api/splits/${encodeURIComponent(splitId)}`);
  },

  /** POST /api/splits/{id}/analyze — run the stimulus engine on a saved split (api/routes/splits.py:880). */
  analyze(splitId: string, includeBreakdowns?: boolean): Promise<AnalysisResponse> {
    return request<AnalysisResponse>(
      'POST',
      `/api/splits/${encodeURIComponent(splitId)}/analyze${qs({
        include_breakdowns: includeBreakdowns,
      })}`
    );
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// imports — backend/api/routes/imports.py (prefix /api/splits/import)
// ═══════════════════════════════════════════════════════════════════════════

export const imports = {
  /** POST /api/splits/import/preview — infer a split from raw spreadsheet grids (api/routes/imports.py:34). */
  preview(requestBody: ImportPreviewRequest): Promise<ImportPreviewResponse> {
    return request<ImportPreviewResponse>('POST', '/api/splits/import/preview', requestBody);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// workouts — backend/api/routes/workouts.py (prefix /api/workouts)
// ═══════════════════════════════════════════════════════════════════════════

export const workouts = {
  /**
   * POST /api/workouts — log a completed workout (api/routes/workouts.py:152). 201.
   * `payload` must conform to `WorkoutCreate` (kept `unknown` here per the
   * shared app API contract; annotate your object as WorkoutCreate for safety).
   */
  create(payload: unknown): Promise<WorkoutLogResponse> {
    return request<WorkoutLogResponse>('POST', '/api/workouts', payload);
  },

  /** GET /api/workouts — full workout history, newest first (api/routes/workouts.py:278). */
  list(params?: WorkoutListParams): Promise<WorkoutHistoryResponse> {
    return request<WorkoutHistoryResponse>(
      'GET',
      `/api/workouts${qs({
        limit: params?.limit,
        offset: params?.offset,
        days: params?.days,
      })}`
    );
  },

  /** GET /api/workouts/summaries — compact history cards (api/routes/workouts.py:352). */
  summaries(params?: WorkoutListParams): Promise<WorkoutSummaryListResponse> {
    return request<WorkoutSummaryListResponse>(
      'GET',
      `/api/workouts/summaries${qs({
        limit: params?.limit,
        offset: params?.offset,
        days: params?.days,
      })}`
    );
  },

  overview(days = 180): Promise<WorkoutOverviewResponse> {
    return request<WorkoutOverviewResponse>(
      'GET',
      `/api/workouts/overview${qs({ days })}`
    );
  },

  progress(params: {
    exerciseName: string;
    days?: number;
    limit?: number;
    offset?: number;
  }): Promise<WorkoutProgressResponse> {
    return request<WorkoutProgressResponse>(
      'GET',
      `/api/workouts/progress${qs({
        exercise_name: params.exerciseName,
        days: params.days,
        limit: params.limit,
        offset: params.offset,
      })}`
    );
  },

  /** GET /api/workouts/dates — distinct completion dates for calendar dots (api/routes/workouts.py:432). */
  dates(days?: number): Promise<WorkoutDatesResponse> {
    return request<WorkoutDatesResponse>('GET', `/api/workouts/dates${qs({ days })}`);
  },

  /** DELETE /api/workouts/exercises/by-name/{name} — delete all logged rows for an exercise (api/routes/workouts.py:489). */
  clearExerciseHistory(exerciseName: string): Promise<ClearExerciseHistoryResponse> {
    return request<ClearExerciseHistoryResponse>(
      'DELETE',
      `/api/workouts/exercises/by-name/${encodeURIComponent(exerciseName)}`
    );
  },

  /** PUT /api/workouts/{id} — replace a logged workout's exercises/metadata (api/routes/workouts.py:532). */
  update(workoutId: string, payload: WorkoutCreate): Promise<WorkoutLogResponse> {
    return request<WorkoutLogResponse>(
      'PUT',
      `/api/workouts/${encodeURIComponent(workoutId)}`,
      payload
    );
  },

  /** GET /api/workouts/{id} — one workout with exercises (api/routes/workouts.py:623). */
  get(workoutId: string): Promise<WorkoutLogResponse> {
    return request<WorkoutLogResponse>('GET', `/api/workouts/${encodeURIComponent(workoutId)}`);
  },

  /** GET /api/workouts/stats/summary — aggregate stats (api/routes/workouts.py:676). */
  stats(days?: number): Promise<WorkoutStatsResponse> {
    return request<WorkoutStatsResponse>('GET', `/api/workouts/stats/summary${qs({ days })}`);
  },

  /** DELETE /api/workouts/{id} — delete a logged workout (api/routes/workouts.py:788). 204. */
  remove(workoutId: string): Promise<void> {
    return request<void>('DELETE', `/api/workouts/${encodeURIComponent(workoutId)}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// overrides — backend/api/routes/overrides.py (prefix /api/exercise-overrides)
// ═══════════════════════════════════════════════════════════════════════════

export const overrides = {
  /** GET /api/exercise-overrides — list the user's pattern overrides (api/routes/overrides.py:24). */
  list(): Promise<ExerciseOverrideListResponse> {
    return request<ExerciseOverrideListResponse>('GET', '/api/exercise-overrides');
  },

  /** POST /api/exercise-overrides — create an override (api/routes/overrides.py:70). 201; 409 on duplicate. */
  create(override: ExerciseOverrideCreate): Promise<ExerciseOverrideResponse> {
    return request<ExerciseOverrideResponse>('POST', '/api/exercise-overrides', override);
  },

  /** GET /api/exercise-overrides/{id} — one override (api/routes/overrides.py:148). */
  get(overrideId: string): Promise<ExerciseOverrideResponse> {
    return request<ExerciseOverrideResponse>(
      'GET',
      `/api/exercise-overrides/${encodeURIComponent(overrideId)}`
    );
  },

  /**
   * PUT /api/exercise-overrides/{id}?pattern_override=... — update the pattern
   * (api/routes/overrides.py:198). Note: the backend takes pattern_override as
   * a QUERY parameter, not a JSON body.
   */
  update(overrideId: string, patternOverride: string): Promise<ExerciseOverrideResponse> {
    return request<ExerciseOverrideResponse>(
      'PUT',
      `/api/exercise-overrides/${encodeURIComponent(overrideId)}${qs({
        pattern_override: patternOverride,
      })}`
    );
  },

  /** DELETE /api/exercise-overrides/{id} — remove an override (api/routes/overrides.py:260). 204. */
  remove(overrideId: string): Promise<void> {
    return request<void>('DELETE', `/api/exercise-overrides/${encodeURIComponent(overrideId)}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// customExercises — backend/api/routes/custom_exercises.py (prefix /api/custom-exercises)
// ═══════════════════════════════════════════════════════════════════════════

export const customExercises = {
  /**
   * GET /api/custom-exercises — list the user's custom exercises
   * (api/routes/custom_exercises.py:52). Unwraps the `{ exercises, total }`
   * envelope to a plain array per the app API contract.
   */
  async list(): Promise<CustomExerciseResponse[]> {
    const res = await request<CustomExerciseListResponse>('GET', '/api/custom-exercises');
    return res.exercises;
  },

  /**
   * POST /api/custom-exercises — create a custom exercise
   * (api/routes/custom_exercises.py:76). 201; 409 on duplicate name.
   * `payload` must conform to `CustomExerciseCreate` (kept `unknown` here per
   * the shared app API contract; annotate your object for safety).
   */
  create(payload: unknown): Promise<CustomExerciseResponse> {
    return request<CustomExerciseResponse>('POST', '/api/custom-exercises', payload);
  },

  /** GET /api/custom-exercises/{id} — one custom exercise (api/routes/custom_exercises.py:137). */
  get(exerciseId: string): Promise<CustomExerciseResponse> {
    return request<CustomExerciseResponse>(
      'GET',
      `/api/custom-exercises/${encodeURIComponent(exerciseId)}`
    );
  },

  /** PUT /api/custom-exercises/{id} — partial update; weights must still sum to 1.0 (api/routes/custom_exercises.py:158). */
  update(exerciseId: string, payload: CustomExerciseUpdate): Promise<CustomExerciseResponse> {
    return request<CustomExerciseResponse>(
      'PUT',
      `/api/custom-exercises/${encodeURIComponent(exerciseId)}`,
      payload
    );
  },

  /** DELETE /api/custom-exercises/{id} — delete a custom exercise (api/routes/custom_exercises.py:253). 204. */
  remove(exerciseId: string): Promise<void> {
    return request<void>('DELETE', `/api/custom-exercises/${encodeURIComponent(exerciseId)}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// comparisons — backend/api/routes/comparisons.py (prefix /api/comparisons)
// ═══════════════════════════════════════════════════════════════════════════

export const comparisons = {
  /** GET /api/comparisons — list saved comparisons (api/routes/comparisons.py:20). */
  list(): Promise<ComparisonListResponse> {
    return request<ComparisonListResponse>('GET', '/api/comparisons');
  },

  /** POST /api/comparisons — save a comparison of 2-4 splits (api/routes/comparisons.py:62). 201. */
  create(comparison: ComparisonCreate): Promise<ComparisonResponse> {
    return request<ComparisonResponse>('POST', '/api/comparisons', comparison);
  },

  /** GET /api/comparisons/{id} — one comparison (api/routes/comparisons.py:129). */
  get(comparisonId: string): Promise<ComparisonResponse> {
    return request<ComparisonResponse>(
      'GET',
      `/api/comparisons/${encodeURIComponent(comparisonId)}`
    );
  },

  /** PUT /api/comparisons/{id} — update name/split_ids (api/routes/comparisons.py:177). */
  update(comparisonId: string, update: ComparisonUpdate): Promise<ComparisonResponse> {
    return request<ComparisonResponse>(
      'PUT',
      `/api/comparisons/${encodeURIComponent(comparisonId)}`,
      update
    );
  },

  /** DELETE /api/comparisons/{id} — delete a comparison (api/routes/comparisons.py:266). 204. */
  remove(comparisonId: string): Promise<void> {
    return request<void>('DELETE', `/api/comparisons/${encodeURIComponent(comparisonId)}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// programs — backend/api/routes/programs.py (prefix /api/programs)
// ═══════════════════════════════════════════════════════════════════════════

export const programs = {
  /** POST /api/programs — create a program (api/routes/programs.py:60). 201. */
  create(program: ProgramCreate): Promise<ProgramResponse> {
    return request<ProgramResponse>('POST', '/api/programs', program);
  },

  /** GET /api/programs — list programs with session counts (api/routes/programs.py:88). */
  list(): Promise<ProgramListResponse> {
    return request<ProgramListResponse>('GET', '/api/programs');
  },

  /** GET /api/programs/sessions/today?date=YYYY-MM-DD — planned sessions for a date across programs (api/routes/programs.py:117). */
  todaySessions(date: string): Promise<TodaySessionsResponse> {
    return request<TodaySessionsResponse>('GET', `/api/programs/sessions/today${qs({ date })}`);
  },

  /** GET /api/programs/{id} — program detail with scheduled sessions (api/routes/programs.py:156). */
  get(programId: string): Promise<ProgramDetailResponse> {
    return request<ProgramDetailResponse>('GET', `/api/programs/${encodeURIComponent(programId)}`);
  },

  /** PUT /api/programs/{id} — update program fields (api/routes/programs.py:193). */
  update(programId: string, update: ProgramUpdate): Promise<ProgramResponse> {
    return request<ProgramResponse>(
      'PUT',
      `/api/programs/${encodeURIComponent(programId)}`,
      update
    );
  },

  /** DELETE /api/programs/{id} — delete a program (api/routes/programs.py:220). 204. */
  remove(programId: string): Promise<void> {
    return request<void>('DELETE', `/api/programs/${encodeURIComponent(programId)}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// sessionTemplates — backend/api/routes/session_templates.py (prefix /api/session-templates)
// ═══════════════════════════════════════════════════════════════════════════

export const sessionTemplates = {
  /** POST /api/session-templates — create a template with exercises (api/routes/session_templates.py:36). 201. */
  create(template: SessionTemplateCreate): Promise<SessionTemplateResponse> {
    return request<SessionTemplateResponse>('POST', '/api/session-templates', template);
  },

  /** POST /api/session-templates/from-session — clone a split session into a template (api/routes/session_templates.py:74). 201. */
  createFromSession(body: CreateTemplateFromSession): Promise<SessionTemplateResponse> {
    return request<SessionTemplateResponse>('POST', '/api/session-templates/from-session', body);
  },

  /** GET /api/session-templates — list templates with exercises (api/routes/session_templates.py:127). */
  list(): Promise<SessionTemplateListResponse> {
    return request<SessionTemplateListResponse>('GET', '/api/session-templates');
  },

  /** GET /api/session-templates/{id} — one template (api/routes/session_templates.py:144). */
  get(templateId: string): Promise<SessionTemplateResponse> {
    return request<SessionTemplateResponse>(
      'GET',
      `/api/session-templates/${encodeURIComponent(templateId)}`
    );
  },

  /** PUT /api/session-templates/{id} — replace a template's name, notes, and exercises. */
  update(templateId: string, template: SessionTemplateUpdate): Promise<SessionTemplateResponse> {
    return request<SessionTemplateResponse>(
      'PUT',
      `/api/session-templates/${encodeURIComponent(templateId)}`,
      template
    );
  },

  /** DELETE /api/session-templates/{id} — delete a template (api/routes/session_templates.py:161). 204. */
  remove(templateId: string): Promise<void> {
    return request<void>('DELETE', `/api/session-templates/${encodeURIComponent(templateId)}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// programSessions — backend/api/routes/program_sessions.py
// (prefix /api/programs/{program_id}/sessions)
// ═══════════════════════════════════════════════════════════════════════════

export const programSessions = {
  /** POST /api/programs/{pid}/sessions — schedule one session (api/routes/program_sessions.py:42). 201. Auto-activates draft programs. */
  schedule(programId: string, session: ProgramSessionCreate): Promise<ProgramSessionResponse> {
    return request<ProgramSessionResponse>(
      'POST',
      `/api/programs/${encodeURIComponent(programId)}/sessions`,
      session
    );
  },

  /** POST /api/programs/{pid}/sessions/batch — schedule many sessions (api/routes/program_sessions.py:85). 201. */
  scheduleBatch(
    programId: string,
    sessions: ProgramSessionCreate[]
  ): Promise<ProgramSessionListResponse> {
    const body: ProgramSessionBatchCreate = { sessions };
    return request<ProgramSessionListResponse>(
      'POST',
      `/api/programs/${encodeURIComponent(programId)}/sessions/batch`,
      body
    );
  },

  /** GET /api/programs/{pid}/sessions — list scheduled sessions, optional date window (api/routes/program_sessions.py:131). Dates are YYYY-MM-DD. */
  list(
    programId: string,
    params?: { start_date?: string; end_date?: string }
  ): Promise<ProgramSessionListResponse> {
    return request<ProgramSessionListResponse>(
      'GET',
      `/api/programs/${encodeURIComponent(programId)}/sessions${qs({
        start_date: params?.start_date,
        end_date: params?.end_date,
      })}`
    );
  },

  /** PUT /api/programs/{pid}/sessions/{sid} — update a scheduled session (api/routes/program_sessions.py:157). */
  update(
    programId: string,
    sessionId: string,
    update: ProgramSessionUpdate
  ): Promise<ProgramSessionResponse> {
    return request<ProgramSessionResponse>(
      'PUT',
      `/api/programs/${encodeURIComponent(programId)}/sessions/${encodeURIComponent(sessionId)}`,
      update
    );
  },

  /** DELETE /api/programs/{pid}/sessions/{sid} — unschedule a session (api/routes/program_sessions.py:192). 204. */
  remove(programId: string, sessionId: string): Promise<void> {
    return request<void>(
      'DELETE',
      `/api/programs/${encodeURIComponent(programId)}/sessions/${encodeURIComponent(sessionId)}`
    );
  },

  /** GET /api/programs/{pid}/sessions/{sid}/exercises — resolve exercises (overrides → template → empty) (api/routes/program_sessions.py:210). */
  exercises(programId: string, sessionId: string): Promise<ResolvedExerciseList> {
    return request<ResolvedExerciseList>(
      'GET',
      `/api/programs/${encodeURIComponent(programId)}/sessions/${encodeURIComponent(
        sessionId
      )}/exercises`
    );
  },

  /** PUT /api/programs/{pid}/sessions/{sid}/detach — freeze template exercises onto the session and unlink (api/routes/program_sessions.py:276). */
  detach(programId: string, sessionId: string): Promise<ProgramSessionResponse> {
    return request<ProgramSessionResponse>(
      'PUT',
      `/api/programs/${encodeURIComponent(programId)}/sessions/${encodeURIComponent(
        sessionId
      )}/detach`
    );
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// programDiagnostics — backend/api/routes/program_diagnostics.py
// (prefix /api/programs/{program_id}/diagnostics)
// ═══════════════════════════════════════════════════════════════════════════

export const programDiagnostics = {
  /**
   * POST /api/programs/{pid}/diagnostics — run the analysis engine at
   * session/micro/meso/macro level (api/routes/program_diagnostics.py:32).
   * session/micro → AnalysisResponse; meso → MesoDiagnosticsResponse;
   * macro → MacroDiagnosticsResponse.
   */
  run(programId: string, requestBody: DiagnosticsRequest): Promise<DiagnosticsResponse> {
    return request<DiagnosticsResponse>(
      'POST',
      `/api/programs/${encodeURIComponent(programId)}/diagnostics`,
      requestBody
    );
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// periodization — backend/api/routes/periodization.py
// (prefix /api/programs/{program_id}/periodization)
// ═══════════════════════════════════════════════════════════════════════════

const periodizationBase = (programId: string): string =>
  `/api/programs/${encodeURIComponent(programId)}/periodization`;

export const periodization = {
  /** POST .../periodization/macros — create a macrocycle (api/routes/periodization.py:60). 201. */
  createMacro(programId: string, macro: MacroCycleCreate): Promise<MacroCycleResponse> {
    return request<MacroCycleResponse>('POST', `${periodizationBase(programId)}/macros`, macro);
  },

  /** GET .../periodization/macros — full macro→meso→micro tree (api/routes/periodization.py:84). */
  listMacros(programId: string): Promise<MacroCycleListResponse> {
    return request<MacroCycleListResponse>('GET', `${periodizationBase(programId)}/macros`);
  },

  /** PUT .../periodization/macros/{id} — update a macrocycle (api/routes/periodization.py:98). */
  updateMacro(
    programId: string,
    macroId: string,
    update: MacroCycleUpdate
  ): Promise<MacroCycleResponse> {
    return request<MacroCycleResponse>(
      'PUT',
      `${periodizationBase(programId)}/macros/${encodeURIComponent(macroId)}`,
      update
    );
  },

  /** DELETE .../periodization/macros/{id} — delete a macrocycle (api/routes/periodization.py:123). 204. */
  removeMacro(programId: string, macroId: string): Promise<void> {
    return request<void>(
      'DELETE',
      `${periodizationBase(programId)}/macros/${encodeURIComponent(macroId)}`
    );
  },

  /** POST .../periodization/macros/{id}/mesos — create a mesocycle (api/routes/periodization.py:140). 201. */
  createMeso(
    programId: string,
    macroId: string,
    meso: MesoCycleCreate
  ): Promise<MesoCycleResponse> {
    return request<MesoCycleResponse>(
      'POST',
      `${periodizationBase(programId)}/macros/${encodeURIComponent(macroId)}/mesos`,
      meso
    );
  },

  /** PUT .../periodization/mesos/{id} — update a mesocycle (api/routes/periodization.py:161). */
  updateMeso(
    programId: string,
    mesoId: string,
    update: MesoCycleUpdate
  ): Promise<MesoCycleResponse> {
    return request<MesoCycleResponse>(
      'PUT',
      `${periodizationBase(programId)}/mesos/${encodeURIComponent(mesoId)}`,
      update
    );
  },

  /** DELETE .../periodization/mesos/{id} — delete a mesocycle (api/routes/periodization.py:185). 204. */
  removeMeso(programId: string, mesoId: string): Promise<void> {
    return request<void>(
      'DELETE',
      `${periodizationBase(programId)}/mesos/${encodeURIComponent(mesoId)}`
    );
  },

  /** POST .../periodization/mesos/{id}/micros — create a microcycle (api/routes/periodization.py:202). 201. */
  createMicro(
    programId: string,
    mesoId: string,
    micro: MicroCycleCreate
  ): Promise<MicroCycleResponse> {
    return request<MicroCycleResponse>(
      'POST',
      `${periodizationBase(programId)}/mesos/${encodeURIComponent(mesoId)}/micros`,
      micro
    );
  },

  /** PUT .../periodization/micros/{id} — update a microcycle (api/routes/periodization.py:222). */
  updateMicro(
    programId: string,
    microId: string,
    update: MicroCycleUpdate
  ): Promise<MicroCycleResponse> {
    return request<MicroCycleResponse>(
      'PUT',
      `${periodizationBase(programId)}/micros/${encodeURIComponent(microId)}`,
      update
    );
  },

  /** DELETE .../periodization/micros/{id} — delete a microcycle (api/routes/periodization.py:246). 204. */
  removeMicro(programId: string, microId: string): Promise<void> {
    return request<void>(
      'DELETE',
      `${periodizationBase(programId)}/micros/${encodeURIComponent(microId)}`
    );
  },

  /** PUT .../periodization/micros/{id}/assign-sessions — attach program sessions to a week (api/routes/periodization.py:263). */
  assignSessions(
    programId: string,
    microId: string,
    sessionIds: string[]
  ): Promise<MicroCycleResponse> {
    const body: AssignSessionsRequest = { session_ids: sessionIds };
    return request<MicroCycleResponse>(
      'PUT',
      `${periodizationBase(programId)}/micros/${encodeURIComponent(microId)}/assign-sessions`,
      body
    );
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// mesoTemplates — backend/api/routes/meso_templates.py (prefix /api/meso-templates)
// ═══════════════════════════════════════════════════════════════════════════

export const mesoTemplates = {
  /** POST /api/meso-templates — snapshot an existing program meso as a reusable template (api/routes/meso_templates.py:107). 201. */
  create(body: MesoTemplateCreate): Promise<MesoTemplateResponse> {
    return request<MesoTemplateResponse>('POST', '/api/meso-templates', body);
  },

  /** GET /api/meso-templates — list saved templates (returns a bare array) (api/routes/meso_templates.py:229). */
  list(): Promise<MesoTemplateListResponse[]> {
    return request<MesoTemplateListResponse[]>('GET', '/api/meso-templates');
  },

  /** GET /api/meso-templates/{id} — full template with weeks/sessions/exercises (api/routes/meso_templates.py:262). */
  get(templateId: string): Promise<MesoTemplateResponse> {
    return request<MesoTemplateResponse>(
      'GET',
      `/api/meso-templates/${encodeURIComponent(templateId)}`
    );
  },

  /** DELETE /api/meso-templates/{id} — delete a template and children (api/routes/meso_templates.py:312). 204. */
  remove(templateId: string): Promise<void> {
    return request<void>('DELETE', `/api/meso-templates/${encodeURIComponent(templateId)}`);
  },

  /** POST /api/meso-templates/{id}/apply — instantiate a template into a macro (api/routes/meso_templates.py:350). Returns { meso_id }. */
  apply(templateId: string, body: ApplyMesoTemplateRequest): Promise<ApplyMesoTemplateResponse> {
    return request<ApplyMesoTemplateResponse>(
      'POST',
      `/api/meso-templates/${encodeURIComponent(templateId)}/apply`,
      body
    );
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// bodyweight — backend/api/routes/bodyweight.py (prefix /api/bodyweight)
// ═══════════════════════════════════════════════════════════════════════════

export const bodyweight = {
  /**
   * GET /api/bodyweight — all entries, oldest first (api/routes/bodyweight.py:19).
   * Unwraps the `{ entries, total }` envelope to a plain array per the app API
   * contract.
   */
  async list(): Promise<BodyweightEntry[]> {
    const res = await request<BodyweightEntryListResponse>('GET', '/api/bodyweight');
    return res.entries;
  },

  /**
   * POST /api/bodyweight — log one entry (api/routes/bodyweight.py:38). 201.
   * `date` maps to the backend's `recorded_at` (ISO datetime; defaults to now).
   */
  log(weight: number, date?: string, notes?: string): Promise<BodyweightEntry> {
    const body: BodyweightEntryCreate = { weight };
    if (date !== undefined) body.recorded_at = date;
    if (notes !== undefined) body.notes = notes;
    return request<BodyweightEntry>('POST', '/api/bodyweight', body);
  },

  /** POST /api/bodyweight/batch — import 1-500 entries at once (api/routes/bodyweight.py:72). 201. */
  logBatch(entries: BodyweightEntryCreate[]): Promise<BodyweightEntryListResponse> {
    const body: BodyweightBatchCreate = { entries };
    return request<BodyweightEntryListResponse>('POST', '/api/bodyweight/batch', body);
  },

  /** DELETE /api/bodyweight/{id} — delete one entry (api/routes/bodyweight.py:108). 204. */
  remove(entryId: string): Promise<void> {
    return request<void>('DELETE', `/api/bodyweight/${encodeURIComponent(entryId)}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// analysis — backend/api/analysis_routes.py (mounted at /api, main.py:389)
// ═══════════════════════════════════════════════════════════════════════════

export const analysis = {
  /** POST /api/analyze-split — run the 29-region stimulus engine on a split definition (api/analysis_routes.py:94). */
  analyzeSplit(requestBody: SplitRequest): Promise<AnalysisResponse> {
    return request<AnalysisResponse>('POST', '/api/analyze-split', requestBody);
  },

  /** POST /api/analyze-workouts — analyze logged workouts in a rolling window; all params are query params (api/analysis_routes.py:157). */
  analyzeWorkouts(params?: AnalyzeWorkoutsParams): Promise<AnalysisResponse> {
    return request<AnalysisResponse>(
      'POST',
      `/api/analyze-workouts${qs({
        days: params?.days,
        end_date: params?.end_date,
        timezone_offset_minutes: params?.timezone_offset_minutes,
        stimulus_duration: params?.stimulus_duration,
        maintenance_volume: params?.maintenance_volume,
        dataset: params?.dataset,
      })}`
    );
  },

  /** GET /api/muscle-regions — reference data for all 29 anatomical regions (api/analysis_routes.py:642). */
  muscleRegions(): Promise<MuscleRegionsResponse> {
    return request<MuscleRegionsResponse>('GET', '/api/muscle-regions');
  },

  /** POST /api/parse-exercise — classify one exercise text (api/analysis_routes.py:688). */
  parseExercise(text: string): Promise<ExerciseParseResponse> {
    const body: ExerciseParseRequest = { text };
    return request<ExerciseParseResponse>('POST', '/api/parse-exercise', body);
  },

  /** GET /api/patterns — all movement patterns with tiered targets (api/analysis_routes.py:760). */
  patterns(): Promise<PatternsResponse> {
    return request<PatternsResponse>('GET', '/api/patterns');
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// misc — backend/main.py root/health/keepalive endpoints
// ═══════════════════════════════════════════════════════════════════════════

export const misc = {
  /** GET / — API name/version and endpoint directory (main.py:243). */
  root(): Promise<RootResponse> {
    return request<RootResponse>('GET', '/');
  },

  /** GET /health — health check (main.py:330). */
  health(): Promise<HealthResponse> {
    return request<HealthResponse>('GET', '/health');
  },

  /** GET /keepalive — touches Supabase to prevent auto-pausing (main.py:341). 503 when unreachable. */
  keepalive(): Promise<KeepaliveResponse> {
    return request<KeepaliveResponse>('GET', '/keepalive');
  },

  /** HEAD /keepalive — headers-only variant of the keepalive ping (main.py:340). */
  keepaliveHead(): Promise<void> {
    return request<void>('HEAD', '/keepalive');
  },
};
