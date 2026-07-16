import 'react-native-url-polyfill/auto';

import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createClient } from '@supabase/supabase-js';
import type { OAuthSessionCompleteRequest, SocialProvider } from '../api/backend';

const TEMPORARY_STORAGE_KEY = 'algosplit_oauth_temporary_v1';
const OAUTH_STORAGE_KEY = 'algosplit.oauth.bridge';
const OAUTH_CALLBACK_PATH = 'oauth/callback';
const IDENTITY_CALLBACK_PATH = 'identity/callback';
const WEB_AUTH_WINDOW_NAME = 'algosplit-social-auth';

type CallbackKind = 'oauth' | 'identity';
type DevicePlatform = 'ios' | 'android' | 'web' | string;

interface TemporaryValues {
  [key: string]: string;
}

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// This client is intentionally disposable. Once the API has adopted a social
// session, dropping the bridge client releases its in-memory OAuth session too.
let oauthClient: ReturnType<typeof createClient> | null = null;
let preparedWebAuthWindow: Window | null = null;

/**
 * Open the web auth window while the browser still considers the provider
 * button click a direct user gesture. Supabase creates its PKCE URL
 * asynchronously, which is too late for popup blockers on many browsers.
 */
export function prepareWebAuthSession(provider: SocialProvider): void {
  if (Platform.OS !== 'web') return;
  const browserWindow = (globalThis as { window?: Window }).window;
  if (!browserWindow) {
    throw new SocialAuthError('Social sign-in needs a browser window. Please try again.');
  }
  if (preparedWebAuthWindow && !preparedWebAuthWindow.closed) {
    preparedWebAuthWindow.close();
  }
  const popup = browserWindow.open(
    '',
    WEB_AUTH_WINDOW_NAME,
    'popup=yes,width=500,height=650,resizable=yes,scrollbars=yes'
  );
  if (!popup) {
    throw new SocialAuthError('Allow pop-ups for AlgoSplit, then try again.');
  }
  preparedWebAuthWindow = popup;
  try {
    popup.document.title = `Opening ${provider === 'google' ? 'Google' : 'Apple'} sign-in`;
    popup.document.body.style.background = '#090b10';
    popup.document.body.style.color = '#f5f7fa';
    popup.document.body.style.fontFamily = 'system-ui, sans-serif';
    popup.document.body.style.padding = '32px';
    popup.document.body.textContent = `Opening ${provider === 'google' ? 'Google' : 'Apple'}…`;
  } catch {
    // The placeholder is cosmetic; navigation remains safe without it.
  }
  popup.focus();
}

export function cancelPreparedWebAuthSession(): void {
  if (preparedWebAuthWindow && !preparedWebAuthWindow.closed) {
    preparedWebAuthWindow.close();
  }
  preparedWebAuthWindow = null;
}

async function openPreparedAuthSession(
  authorizationUrl: string,
  redirectTo: string
): Promise<WebBrowser.WebBrowserAuthSessionResult> {
  if (Platform.OS !== 'web') {
    return WebBrowser.openAuthSessionAsync(authorizationUrl, redirectTo);
  }
  if (!preparedWebAuthWindow || preparedWebAuthWindow.closed) {
    throw new SocialAuthError('The sign-in window was closed. Please try again.');
  }
  // Navigate the already-approved window before Expo attaches its secure
  // callback listener. Reusing the same named window avoids popup blocking.
  preparedWebAuthWindow.location.assign(authorizationUrl);
  preparedWebAuthWindow.focus();
  return WebBrowser.openAuthSessionAsync(authorizationUrl, redirectTo, {
    windowName: WEB_AUTH_WINDOW_NAME,
  });
}

function sessionStorageOrNull(): SessionStorageLike | null {
  try {
    const storage = (globalThis as { sessionStorage?: SessionStorageLike }).sessionStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

async function readTemporaryValues(): Promise<TemporaryValues> {
  try {
    const serialized =
      Platform.OS === 'web'
        ? sessionStorageOrNull()?.getItem(TEMPORARY_STORAGE_KEY) ?? null
        : await SecureStore.getItemAsync(TEMPORARY_STORAGE_KEY);
    if (!serialized) return {};
    const parsed = JSON.parse(serialized) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  } catch {
    // A failed temporary-store read should behave like a missing PKCE verifier;
    // it must never fall back to persistent browser storage.
    return {};
  }
}

async function writeTemporaryValues(values: TemporaryValues): Promise<void> {
  const serialized = JSON.stringify(values);
  if (Platform.OS === 'web') {
    const storage = sessionStorageOrNull();
    if (!storage) throw new SocialAuthError('Temporary browser session storage is unavailable.');
    storage.setItem(TEMPORARY_STORAGE_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(TEMPORARY_STORAGE_KEY, serialized, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Storage adapter supplied only to the short-lived Supabase OAuth bridge. */
export const temporaryOAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    return (await readTemporaryValues())[key] ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    const values = await readTemporaryValues();
    values[key] = value;
    await writeTemporaryValues(values);
  },
  async removeItem(key: string): Promise<void> {
    const values = await readTemporaryValues();
    delete values[key];
    await writeTemporaryValues(values);
  },
};

/** Delete the PKCE verifier and any transient Supabase session immediately. */
export async function clearTemporaryOAuthCredentials(): Promise<void> {
  oauthClient = null;
  cancelPreparedWebAuthSession();
  try {
    if (Platform.OS === 'web') {
      sessionStorageOrNull()?.removeItem(TEMPORARY_STORAGE_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(TEMPORARY_STORAGE_KEY);
  } catch {
    // This credential is deliberately short-lived. The normal session handoff
    // succeeds independently, and a later attempt overwrites any stale values.
  }
}

export class SocialAuthCancelledError extends Error {
  constructor() {
    super('Social sign-in was cancelled.');
    this.name = 'SocialAuthCancelledError';
  }
}

export class SocialAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialAuthError';
  }
}

export function isSocialAuthCancellation(error: unknown): boolean {
  return error instanceof SocialAuthCancelledError;
}

/** Surface only errors deliberately written for end users. */
export function socialAuthErrorMessageForDisplay(error: unknown, fallback: string): string {
  return error instanceof SocialAuthError ? error.message : fallback;
}

function normalizedPublicEnv(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function configuredCallbackUrl(kind: CallbackKind): string | undefined {
  // Expo replaces only statically referenced EXPO_PUBLIC_* properties at bundle
  // time. Do not turn these names into a dynamic process.env lookup.
  if (Platform.OS === 'web') {
    return normalizedPublicEnv(
      kind === 'oauth'
        ? process.env.EXPO_PUBLIC_ALGOSPLIT_OAUTH_WEB_CALLBACK_URL
        : process.env.EXPO_PUBLIC_ALGOSPLIT_IDENTITY_WEB_CALLBACK_URL
    );
  }
  return normalizedPublicEnv(
    kind === 'oauth'
      ? process.env.EXPO_PUBLIC_ALGOSPLIT_OAUTH_NATIVE_CALLBACK_URL
      : process.env.EXPO_PUBLIC_ALGOSPLIT_IDENTITY_NATIVE_CALLBACK_URL
  );
}

function callbackPath(kind: CallbackKind): string {
  return kind === 'oauth' ? OAUTH_CALLBACK_PATH : IDENTITY_CALLBACK_PATH;
}

/**
 * Public callback used by Supabase. Production builds should provide the exact
 * canonical value via env; the fallback keeps local development ergonomic.
 */
export function callbackUrl(kind: CallbackKind): string {
  const configured = configuredCallbackUrl(kind);
  if (configured) return configured;
  if (Platform.OS === 'web') {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    if (origin) return `${origin.replace(/\/$/, '')}/${callbackPath(kind)}`;
    return `http://localhost:8081/${callbackPath(kind)}`;
  }
  return AuthSession.makeRedirectUri({ scheme: 'algosplit', path: callbackPath(kind) });
}

export function oauthCallbackUrl(): string {
  return callbackUrl('oauth');
}

export function identityCallbackUrl(): string {
  return callbackUrl('identity');
}

/** Apple is intentionally unavailable on Android in v1. */
export function socialProviderVisible(
  provider: SocialProvider,
  platform: DevicePlatform = Platform.OS
): boolean {
  return provider === 'google' || (provider === 'apple' && platform !== 'android');
}

export function oauthCodeFromCallbackUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('code');
  } catch {
    return null;
  }
}

export function callbackErrorFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  } catch {
    return null;
  }
}

function isExpectedCallback(url: string, expected: string): boolean {
  try {
    const actual = new URL(url);
    const expectedUrl = new URL(expected);
    return (
      actual.protocol === expectedUrl.protocol &&
      actual.host === expectedUrl.host &&
      actual.pathname === expectedUrl.pathname
    );
  } catch {
    return false;
  }
}

export function socialAuthConfigured(): boolean {
  return Boolean(
    normalizedPublicEnv(process.env.EXPO_PUBLIC_SUPABASE_URL) &&
      normalizedPublicEnv(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

function getOAuthClient(): ReturnType<typeof createClient> {
  const supabaseUrl = normalizedPublicEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const supabaseKey = normalizedPublicEnv(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!supabaseUrl || !supabaseKey) {
    throw new SocialAuthError('Social sign-in is not configured for this build.');
  }
  if (!oauthClient) {
    oauthClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: temporaryOAuthStorage,
        storageKey: OAUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }
  return oauthClient;
}

function handoffFromSession(session: {
  access_token: string;
  refresh_token: string;
} | null): OAuthSessionCompleteRequest {
  if (!session?.access_token || !session.refresh_token) {
    throw new SocialAuthError('Social sign-in did not return a usable session. Please try again.');
  }
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };
}

async function socialOAuthSession(provider: SocialProvider): Promise<OAuthSessionCompleteRequest> {
  prepareWebAuthSession(provider);
  const redirectTo = oauthCallbackUrl();
  const client = getOAuthClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    throw new SocialAuthError('Could not start social sign-in. Please try again.');
  }

  const result = await openPreparedAuthSession(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new SocialAuthCancelledError();
  }
  if (result.type !== 'success' || !isExpectedCallback(result.url, redirectTo)) {
    throw new SocialAuthError('Social sign-in did not return to AlgoSplit. Please try again.');
  }
  if (callbackErrorFromUrl(result.url)) {
    throw new SocialAuthError('Social sign-in was not completed. Please try again.');
  }
  const code = oauthCodeFromCallbackUrl(result.url);
  if (!code) {
    throw new SocialAuthError('Social sign-in did not return an authorization code. Please try again.');
  }

  const { data: exchange, error: exchangeError } = await client.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    throw new SocialAuthError('Could not finish social sign-in. Please try again.');
  }
  return handoffFromSession(exchange.session);
}

async function nativeAppleSession(): Promise<OAuthSessionCompleteRequest> {
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new SocialAuthError('Apple sign-in is not available on this device.');
  }
  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') {
      throw new SocialAuthCancelledError();
    }
    throw new SocialAuthError('Apple sign-in could not be completed. Please try again.');
  }
  if (!credential.identityToken) {
    throw new SocialAuthError('Apple did not return an identity token. Please try again.');
  }
  const { data, error } = await getOAuthClient().auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce,
  });
  if (error) {
    throw new SocialAuthError('Could not finish Apple sign-in. Please try again.');
  }
  return handoffFromSession(data.session);
}

/**
 * Complete Google on every platform, web Apple OAuth, or native iOS Apple.
 * The caller must hand the returned credentials straight to /auth/oauth/complete
 * and then call clearTemporaryOAuthCredentials in a finally block.
 */
export async function socialSessionForProvider(
  provider: SocialProvider
): Promise<OAuthSessionCompleteRequest> {
  if (!socialProviderVisible(provider)) {
    throw new SocialAuthError('This sign-in method is not available on this device.');
  }
  try {
    if (provider === 'apple' && Platform.OS === 'ios') return await nativeAppleSession();
    return await socialOAuthSession(provider);
  } catch (error) {
    await clearTemporaryOAuthCredentials();
    throw error;
  }
}

/** Open the server-issued identity-link URL and verify it returned to the expected callback. */
export async function completeIdentityLink(authorizationUrl: string): Promise<void> {
  const redirectTo = identityCallbackUrl();
  try {
    const result = await openPreparedAuthSession(authorizationUrl, redirectTo);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new SocialAuthCancelledError();
    }
    if (result.type !== 'success' || !isExpectedCallback(result.url, redirectTo)) {
      throw new SocialAuthError('Account connection did not return to AlgoSplit. Please try again.');
    }
    if (callbackErrorFromUrl(result.url)) {
      throw new SocialAuthError('Account connection was not completed. Please try again.');
    }
  } finally {
    cancelPreparedWebAuthSession();
  }
}

/** Closes the popup opened by WebBrowser.openAuthSessionAsync on web callback routes. */
export function maybeCompleteWebAuthSession(): void {
  if (Platform.OS === 'web') {
    WebBrowser.maybeCompleteAuthSession();
  }
}
