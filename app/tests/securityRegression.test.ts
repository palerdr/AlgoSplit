import {
  authErrorMessageForDisplay,
  resolveBackendUrl,
  safeAuthErrorMessage,
} from '../src/api/backend';
import {
  accountStorageKey,
  analysisPreferencesKey,
  demoStorageKey,
  homeAnalysisCacheKey,
  homeSplitsCacheKey,
  normalizeAnalysisPreferences,
} from '../src/state/localPersistence';
import { recoveryTokenFromUrl } from '../src/auth/recoveryLink';

describe('deployment API routing', () => {
  it('forces production web through same-origin rewrites', () => {
    expect(resolveBackendUrl(undefined, 'web', false)).toBe('');
    expect(resolveBackendUrl('', 'web', false)).toBe('');
    expect(resolveBackendUrl('https://algosplit.onrender.com', 'web', false)).toBe('');
  });

  it('requires an absolute configured backend for production native', () => {
    expect(resolveBackendUrl(undefined, 'native', false)).toBeNull();
    expect(resolveBackendUrl('', 'native', false)).toBeNull();
    expect(resolveBackendUrl('https://algosplit.onrender.com/', 'native', false)).toBe(
      'https://algosplit.onrender.com'
    );
  });
});

describe('public authentication errors', () => {
  it('turns missing rewrites and provider outages into a safe service message', () => {
    expect(
      safeAuthErrorMessage(404, '/auth/signup', '<html>deployment not found</html>')
    ).toBe('Account service is temporarily unavailable. Please try again later.');
    expect(
      safeAuthErrorMessage(503, '/auth/login', {
        detail: 'upstream service_role key was rejected',
      })
    ).toBe('Account service is temporarily unavailable. Please try again later.');
  });

  it('keeps useful allowlisted messages and rejects arbitrary provider details', () => {
    expect(
      safeAuthErrorMessage(400, '/auth/signup', {
        detail: 'Password does not meet security requirements',
      })
    ).toBe('Password does not meet security requirements');
    expect(
      safeAuthErrorMessage(400, '/auth/signup', {
        detail: 'Supabase internal project id abc123',
      })
    ).toBe('Could not create account with those details');
  });

  it('uses route-specific validation messages without echoing rejected input', () => {
    expect(
      safeAuthErrorMessage(422, '/auth/signup', {
        detail: [{ input: 'plaintext-password' }],
      })
    ).toBe('Enter a valid email and a password of at least 8 characters.');
  });

  it('does not render unexpected runtime error text', () => {
    expect(
      authErrorMessageForDisplay(
        new Error('SecureStore internal keychain details'),
        'Could not sign in. Try again.'
      )
    ).toBe('Could not sign in. Try again.');
  });
});

describe('local account isolation', () => {
  it('uses distinct encoded stores for demo and each account', () => {
    expect(accountStorageKey('user-a')).not.toBe(accountStorageKey('user-b'));
    expect(accountStorageKey('user/a')).toContain('user%2Fa');
    expect(demoStorageKey()).not.toBe(accountStorageKey('demo'));
    expect(analysisPreferencesKey('user-a')).not.toBe(analysisPreferencesKey('user-b'));
    expect(analysisPreferencesKey('user-a')).not.toBe(accountStorageKey('user-a'));
    expect(homeSplitsCacheKey('user-a')).not.toBe(homeSplitsCacheKey('user-b'));
    expect(
      homeAnalysisCacheKey('user-a', {
        days: 7,
        endDate: '2026-07-21',
        timezoneOffsetMinutes: 240,
        stimulusDuration: 48,
        maintenanceVolume: 3,
        dataset: 'schoenfeld',
      })
    ).not.toBe(
      homeAnalysisCacheKey('user-a', {
        days: 7,
        endDate: '2026-07-21',
        timezoneOffsetMinutes: 240,
        stimulusDuration: 72,
        maintenanceVolume: 3,
        dataset: 'schoenfeld',
      })
    );
  });

  it('sanitizes persisted analysis defaults to backend-supported ranges', () => {
    expect(
      normalizeAnalysisPreferences({
        stimulusDuration: 200,
        maintenanceVolume: 0,
        dataset: 'pelland',
      })
    ).toEqual({ stimulusDuration: 96, maintenanceVolume: 1, dataset: 'pelland' });
    expect(normalizeAnalysisPreferences({ dataset: 'invalid' as 'average' })).toEqual({
      stimulusDuration: 48,
      maintenanceVolume: 3,
      dataset: 'schoenfeld',
    });
  });
});

describe('password recovery links', () => {
  it('accepts Supabase recovery fragments and reset routes', () => {
    expect(
      recoveryTokenFromUrl('algosplit://reset-password#access_token=secret&type=recovery')
    ).toBe('secret');
    expect(recoveryTokenFromUrl('https://example.com/reset-password?token=query-token')).toBe(
      'query-token'
    );
  });

  it('does not treat an ordinary access-token link as password recovery', () => {
    expect(recoveryTokenFromUrl('https://example.com/#access_token=ordinary&type=access')).toBeNull();
  });
});
