import { resolveBackendUrl } from '../src/api/backend';
import {
  accountStorageKey,
  analysisPreferencesKey,
  demoStorageKey,
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

describe('local account isolation', () => {
  it('uses distinct encoded stores for demo and each account', () => {
    expect(accountStorageKey('user-a')).not.toBe(accountStorageKey('user-b'));
    expect(accountStorageKey('user/a')).toContain('user%2Fa');
    expect(demoStorageKey()).not.toBe(accountStorageKey('demo'));
    expect(analysisPreferencesKey('user-a')).not.toBe(analysisPreferencesKey('user-b'));
    expect(analysisPreferencesKey('user-a')).not.toBe(accountStorageKey('user-a'));
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
