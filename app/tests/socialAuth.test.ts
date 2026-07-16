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
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));
jest.mock('expo-apple-authentication', () => ({}));
jest.mock('expo-crypto', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

import { createClient } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import {
  SocialAuthCancelledError,
  SocialAuthError,
  callbackErrorFromUrl,
  clearTemporaryOAuthCredentials,
  maybeCompleteWebAuthSession,
  oauthCodeFromCallbackUrl,
  socialProviderVisible,
  socialSessionForProvider,
  temporaryOAuthStorage,
} from '../src/auth/socialAuth';

const mockOpenAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;
const mockMaybeCompleteAuthSession = WebBrowser.maybeCompleteAuthSession as jest.Mock;
const mockCreateClient = createClient as jest.Mock;

describe('social auth bridge', () => {
  beforeEach(() => {
    sessionValues.clear();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    process.env.EXPO_PUBLIC_ALGOSPLIT_OAUTH_WEB_CALLBACK_URL =
      'https://app.example/oauth/callback';
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => sessionValues.get(key) ?? null,
        setItem: (key: string, value: string) => sessionValues.set(key, value),
        removeItem: (key: string) => sessionValues.delete(key),
      },
    });
  });

  it('shows Apple only outside Android and always shows Google', () => {
    expect(socialProviderVisible('google', 'android')).toBe(true);
    expect(socialProviderVisible('apple', 'android')).toBe(false);
    expect(socialProviderVisible('apple', 'ios')).toBe(true);
    expect(socialProviderVisible('apple', 'web')).toBe(true);
  });

  it('parses a PKCE callback without treating provider errors as codes', () => {
    expect(oauthCodeFromCallbackUrl('algosplit://oauth/callback?code=pkce-code')).toBe('pkce-code');
    expect(oauthCodeFromCallbackUrl('https://app.example/oauth/callback?error=access_denied')).toBeNull();
    expect(callbackErrorFromUrl('https://app.example/oauth/callback?error=access_denied')).toBe(
      'access_denied'
    );
  });

  it('clears temporary OAuth values from web session storage', async () => {
    await temporaryOAuthStorage.setItem('algosplit.oauth.bridge-code-verifier', 'verifier');
    await temporaryOAuthStorage.setItem('algosplit.oauth.bridge', 'temporary-session');
    expect(sessionValues.get('algosplit_oauth_temporary_v1')).toContain('temporary-session');

    await clearTemporaryOAuthCredentials();

    expect(sessionValues.has('algosplit_oauth_temporary_v1')).toBe(false);
  });

  it('handles browser cancellation and clears any pending verifier', async () => {
    const signInWithOAuth = jest.fn(async () => ({
      data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=google' },
      error: null,
    }));
    mockCreateClient.mockReturnValue({ auth: { signInWithOAuth } });
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    await temporaryOAuthStorage.setItem('algosplit.oauth.bridge-code-verifier', 'verifier');

    await expect(socialSessionForProvider('google')).rejects.toBeInstanceOf(SocialAuthCancelledError);
    expect(sessionValues.has('algosplit_oauth_temporary_v1')).toBe(false);
  });

  it('reports a provider callback error without exposing it as a session', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'https://app.example/oauth/callback?error=access_denied',
    });

    await expect(socialSessionForProvider('google')).rejects.toBeInstanceOf(SocialAuthError);
  });

  it('completes the web popup hook on callback pages', () => {
    maybeCompleteWebAuthSession();
    expect(mockMaybeCompleteAuthSession).toHaveBeenCalledTimes(1);
  });
});
