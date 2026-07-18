const sessionValues = new Map<string, string>();

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'algosplit://oauth/callback'),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'bare' },
  ExecutionEnvironment: {
    Bare: 'bare',
    Standalone: 'standalone',
    StoreClient: 'storeClient',
  },
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-apple-authentication', () => ({}));
jest.mock('expo-crypto', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../src/api/backend', () => ({
  auth: { socialConfig: jest.fn() },
}));

import { createClient } from '@supabase/supabase-js';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { auth } from '../src/api/backend';
import {
  SocialAuthError,
  appleProviderEnabled,
  callbackErrorFromUrl,
  clearTemporaryOAuthCredentials,
  completeIdentityLink,
  completePendingWebAuth,
  expoGoOAuthUnsupported,
  oauthCodeFromCallbackUrl,
  resetSocialAuthCaches,
  socialAuthErrorMessageForDisplay,
  socialProviderVisible,
  socialSessionForProvider,
  startWebOAuthRedirect,
  temporaryOAuthStorage,
} from '../src/auth/socialAuth';

const mockOpenAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;
const mockCreateClient = createClient as jest.Mock;
const mockSocialConfig = auth.socialConfig as jest.Mock;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

function oauthClient() {
  const signInWithOAuth = jest.fn(async () => ({
    data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=google' },
    error: null,
  }));
  const exchangeCodeForSession = jest.fn(async () => ({
    data: {
      session: {
        access_token: 'temporary-access',
        refresh_token: 'temporary-refresh',
      },
    },
    error: null,
  }));
  const client = { auth: { signInWithOAuth, exchangeCodeForSession } };
  mockCreateClient.mockReturnValue(client);
  return { client, signInWithOAuth, exchangeCodeForSession };
}

describe('social auth bridge', () => {
  beforeEach(async () => {
    sessionValues.clear();
    jest.clearAllMocks();
    resetSocialAuthCaches();
    mockSocialConfig.mockResolvedValue({
      supabase_url: 'https://project.supabase.co',
      supabase_publishable_key: 'sb_publishable_test',
    });
    process.env.EXPO_PUBLIC_ALGOSPLIT_OAUTH_WEB_CALLBACK_URL =
      'https://app.example/oauth/callback';
    process.env.EXPO_PUBLIC_ALGOSPLIT_IDENTITY_WEB_CALLBACK_URL =
      'https://app.example/identity/callback';
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => sessionValues.get(key) ?? null,
        setItem: (key: string, value: string) => sessionValues.set(key, value),
        removeItem: (key: string) => sessionValues.delete(key),
      },
    });
    await clearTemporaryOAuthCredentials();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows Apple only outside Android at the platform layer', () => {
    expect(socialProviderVisible('google', 'android')).toBe(true);
    expect(socialProviderVisible('apple', 'android')).toBe(false);
    expect(socialProviderVisible('apple', 'ios')).toBe(true);
    expect(socialProviderVisible('apple', 'web')).toBe(true);
  });

  it('detects Expo Go only for native OAuth', () => {
    expect(expoGoOAuthUnsupported('ios', ExecutionEnvironment.StoreClient)).toBe(true);
    expect(expoGoOAuthUnsupported('android', ExecutionEnvironment.StoreClient)).toBe(true);
    expect(expoGoOAuthUnsupported('web', ExecutionEnvironment.StoreClient)).toBe(false);
    expect(expoGoOAuthUnsupported('ios', ExecutionEnvironment.Bare)).toBe(false);
  });

  it('shows deliberate social-auth errors without exposing unknown errors', () => {
    expect(
      socialAuthErrorMessageForDisplay(new SocialAuthError('Provider setup is missing.'), 'Fallback')
    ).toBe('Provider setup is missing.');
    expect(socialAuthErrorMessageForDisplay(new Error('internal detail'), 'Fallback')).toBe('Fallback');
  });

  it('parses a PKCE callback without treating provider errors as codes', () => {
    expect(oauthCodeFromCallbackUrl('algosplit://oauth/callback?code=pkce-code')).toBe('pkce-code');
    expect(oauthCodeFromCallbackUrl('https://app.example/oauth/callback?error=access_denied')).toBeNull();
    expect(callbackErrorFromUrl('https://app.example/oauth/callback?error=access_denied')).toBe(
      'access_denied'
    );
  });

  it('starts web OAuth with exactly one full-page navigation and no Expo popup', async () => {
    const { signInWithOAuth } = oauthClient();
    const navigate = jest.fn();

    await startWebOAuthRedirect('google', navigate, 1_000);

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://app.example/oauth/callback',
        skipBrowserRedirect: true,
      },
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(
      'https://project.supabase.co/auth/v1/authorize?provider=google'
    );
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('loads and caches public Supabase configuration from the backend', async () => {
    const { signInWithOAuth } = oauthClient();

    await startWebOAuthRedirect('google', jest.fn(), 1_000);
    await startWebOAuthRedirect('google', jest.fn(), 2_000);

    expect(mockSocialConfig).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'sb_publishable_test',
      expect.any(Object)
    );
    expect(signInWithOAuth).toHaveBeenCalledTimes(2);
  });

  it('retries backend configuration after a recoverable failure', async () => {
    oauthClient();
    mockSocialConfig
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        supabase_url: 'https://project.supabase.co',
        supabase_publishable_key: 'sb_publishable_test',
      });

    await expect(startWebOAuthRedirect('google', jest.fn(), 1_000)).rejects.toThrow(
      'Could not load social sign-in configuration. Please try again.'
    );
    await expect(startWebOAuthRedirect('google', jest.fn(), 2_000)).resolves.toBeUndefined();
    expect(mockSocialConfig).toHaveBeenCalledTimes(2);
  });

  it('rejects a callback URL supplied as the Supabase project URL', async () => {
    oauthClient();
    mockSocialConfig.mockResolvedValueOnce({
      supabase_url: 'https://project.supabase.co/auth/v1/callback',
      supabase_publishable_key: 'sb_publishable_test',
    });

    await expect(startWebOAuthRedirect('google', jest.fn(), 1_000)).rejects.toThrow(
      'Could not load social sign-in configuration. Please try again.'
    );
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('rejects Expo Go before creating a client or opening a browser', async () => {
    const previousPlatform = Platform.OS;
    const previousEnvironment = Constants.executionEnvironment;
    Object.assign(Platform, { OS: 'ios' });
    Object.assign(Constants, { executionEnvironment: ExecutionEnvironment.StoreClient });
    try {
      await expect(socialSessionForProvider('google')).rejects.toThrow(
        'Google sign-in requires the AlgoSplit development build; Expo Go cannot return from Google sign-in.'
      );
      expect(mockSocialConfig).not.toHaveBeenCalled();
      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    } finally {
      Object.assign(Platform, { OS: previousPlatform });
      Object.assign(Constants, { executionEnvironment: previousEnvironment });
    }
  });

  it('completes Google PKCE in an AlgoSplit native build', async () => {
    const { signInWithOAuth, exchangeCodeForSession } = oauthClient();
    const previousPlatform = Platform.OS;
    const previousEnvironment = Constants.executionEnvironment;
    Object.assign(Platform, { OS: 'ios' });
    Object.assign(Constants, { executionEnvironment: ExecutionEnvironment.Bare });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'algosplit://oauth/callback?code=native-code',
    });
    try {
      await expect(socialSessionForProvider('google')).resolves.toEqual({
        access_token: 'temporary-access',
        refresh_token: 'temporary-refresh',
      });
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'algosplit://oauth/callback',
          skipBrowserRedirect: true,
        },
      });
      expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
        'https://project.supabase.co/auth/v1/authorize?provider=google',
        'algosplit://oauth/callback'
      );
      expect(exchangeCodeForSession).toHaveBeenCalledWith('native-code');
    } finally {
      Object.assign(Platform, { OS: previousPlatform });
      Object.assign(Constants, { executionEnvironment: previousEnvironment });
    }
  });

  it('exchanges a web callback code into a temporary API handoff session', async () => {
    const { exchangeCodeForSession } = oauthClient();
    await startWebOAuthRedirect('google', jest.fn(), 1_000);

    await expect(
      completePendingWebAuth('https://app.example/oauth/callback?code=pkce-code', 2_000)
    ).resolves.toEqual({
      type: 'oauth',
      session: {
        access_token: 'temporary-access',
        refresh_token: 'temporary-refresh',
      },
      returnScreen: 'home',
    });
    expect(exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
    expect(sessionValues.has('algosplit_oauth_pending_v1')).toBe(false);
  });

  it('handles provider errors returned to the site root and clears temporary credentials', async () => {
    oauthClient();
    await startWebOAuthRedirect('google', jest.fn(), 1_000);
    await temporaryOAuthStorage.setItem('algosplit.oauth.bridge-code-verifier', 'verifier');

    await expect(
      completePendingWebAuth(
        'https://app.example/?error=invalid_request&error_code=bad_oauth_callback',
        2_000
      )
    ).rejects.toMatchObject({ kind: 'oauth', returnScreen: 'home' });
    expect(sessionValues.has('algosplit_oauth_pending_v1')).toBe(false);
    expect(sessionValues.has('algosplit_oauth_temporary_v1')).toBe(false);
  });

  it('treats access denial and browser-back restoration as cancellation', async () => {
    oauthClient();
    await startWebOAuthRedirect('google', jest.fn(), 1_000);
    await expect(
      completePendingWebAuth('https://app.example/?error=access_denied', 2_000)
    ).resolves.toEqual({ type: 'cancelled', kind: 'oauth', returnScreen: 'home' });

    await startWebOAuthRedirect('google', jest.fn(), 3_000);
    await expect(completePendingWebAuth('https://app.example/', 4_000)).resolves.toEqual({
      type: 'cancelled',
      kind: 'oauth',
      returnScreen: 'home',
    });
  });

  it('drops a stale pending operation instead of completing it', async () => {
    oauthClient();
    await startWebOAuthRedirect('google', jest.fn(), 1_000);

    await expect(
      completePendingWebAuth('https://app.example/oauth/callback?code=late', 11 * 60_000)
    ).resolves.toEqual({ type: 'none' });
    expect(sessionValues.has('algosplit_oauth_pending_v1')).toBe(false);
  });

  it('uses one full-page redirect for identity linking and restores Account', async () => {
    const navigate = jest.fn();
    await completeIdentityLink(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
      'google',
      navigate,
      1_000
    );

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    await expect(
      completePendingWebAuth('https://app.example/identity/callback', 2_000)
    ).resolves.toEqual({ type: 'identity', provider: 'google', returnScreen: 'account' });
  });

  it('hides Apple when Supabase disables it and reveals it when enabled', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, { external: { apple: false } }))
      .mockResolvedValueOnce(response(200, { external: { apple: true } }));

    await expect(appleProviderEnabled()).resolves.toBe(false);
    resetSocialAuthCaches();
    await expect(appleProviderEnabled()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/settings', {
      headers: { apikey: 'sb_publishable_test' },
    });
  });

  it('keeps Apple hidden when provider settings cannot be loaded', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await expect(appleProviderEnabled()).resolves.toBe(false);
  });

  it('clears temporary OAuth values from web session storage', async () => {
    await temporaryOAuthStorage.setItem('algosplit.oauth.bridge-code-verifier', 'verifier');
    await temporaryOAuthStorage.setItem('algosplit.oauth.bridge', 'temporary-session');
    expect(sessionValues.get('algosplit_oauth_temporary_v1')).toContain('temporary-session');

    await clearTemporaryOAuthCredentials();

    expect(sessionValues.has('algosplit_oauth_temporary_v1')).toBe(false);
  });
});
