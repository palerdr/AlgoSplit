const mockSecureValues = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureValues.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureValues.delete(key);
  }),
}));

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { auth, nativeTokenStore } from '../src/api/backend';

function response(status: number, body?: unknown) {
  const serialized = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
    text: jest.fn(async () => serialized),
  } as unknown as Response;
}

const session = (accessToken: string, refreshToken: string) => ({
  access_token: accessToken,
  refresh_token: refreshToken,
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: 'user-1', email: 'user@example.com' },
});

describe('native authentication lifecycle', () => {
  beforeEach(async () => {
    expect(Platform.OS).not.toBe('web');
    mockSecureValues.clear();
    jest.restoreAllMocks();
  });

  it('stores login credentials in SecureStore and uses Bearer authentication', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, session('access-1', 'refresh-1')))
      .mockResolvedValueOnce(response(200, { id: 'user-1', email: 'user@example.com' }));

    await auth.login('user@example.com', 'password123');
    await auth.me();

    expect(await nativeTokenStore.getAccessToken()).toBe('access-1');
    expect(await nativeTokenStore.getRefreshToken()).toBe('refresh-1');
    expect(mockSecureValues.has('algosplit_native_session_v1')).toBe(true);
    expect(mockSecureValues.has('algosplit_access_token')).toBe(false);
    expect(mockSecureValues.has('algosplit_refresh_token')).toBe(false);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      headers: expect.objectContaining({ 'X-AlgoSplit-Client': 'native' }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer access-1' }),
    });
  });

  it('rotates native credentials once after a 401 and retries the request', async () => {
    await nativeTokenStore.save('expired-access', 'refresh-1');
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(401, { detail: 'expired' }))
      .mockResolvedValueOnce(response(200, session('access-2', 'refresh-2')))
      .mockResolvedValueOnce(response(200, { id: 'user-1', email: 'user@example.com' }));

    await expect(auth.me()).resolves.toMatchObject({ id: 'user-1' });

    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/auth/refresh');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      body: JSON.stringify({ refresh_token: 'refresh-1' }),
    });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer access-2' }),
    });
    expect(await nativeTokenStore.getRefreshToken()).toBe('refresh-2');
  });

  it('clears local credentials even when server logout is unavailable', async () => {
    await nativeTokenStore.save('access-1', 'refresh-1');
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));

    await expect(auth.logout()).rejects.toThrow(
      'Account service is temporarily unavailable. Please try again later.'
    );
    expect(await nativeTokenStore.getAccessToken()).toBeNull();
    expect(await nativeTokenStore.getRefreshToken()).toBeNull();
  });

  it('does not expose a missing signup route or its response body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(404, '<html>VERCEL_DEPLOYMENT_NOT_FOUND</html>'));

    await expect(auth.signup('new@example.com', 'StrongPass123!')).rejects.toThrow(
      'Account service is temporarily unavailable. Please try again later.'
    );
  });

  it('accepts signup pending email confirmation without requiring native tokens', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response(201, {
        ...session('', ''),
        email_confirmation_required: true,
      })
    );

    await expect(auth.signup('new@example.com', 'StrongPass123!')).resolves.toMatchObject({
      email_confirmation_required: true,
    });
    expect(await nativeTokenStore.getAccessToken()).toBeNull();
  });

  it('migrates legacy token keys and refreshes them before use', async () => {
    mockSecureValues.set('algosplit_access_token', 'legacy-access');
    mockSecureValues.set('algosplit_refresh_token', 'legacy-refresh');
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, session('access-2', 'refresh-2')));

    await expect(auth.refreshIfNeeded()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ refresh_token: 'legacy-refresh' }),
    });
    expect(await nativeTokenStore.getAccessToken()).toBe('access-2');
    expect(mockSecureValues.has('algosplit_access_token')).toBe(false);
    expect(mockSecureValues.has('algosplit_refresh_token')).toBe(false);
  });

  it('proactively refreshes a near-expiry session before the account request', async () => {
    await nativeTokenStore.save('expiring-access', 'refresh-1', 60);
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, session('access-2', 'refresh-2')))
      .mockResolvedValueOnce(response(200, { id: 'user-1', email: 'user@example.com' }));

    await auth.me();

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/auth/refresh');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/auth/user');
  });

  it('deduplicates concurrent native refreshes', async () => {
    await nativeTokenStore.save('expired-access', 'refresh-1', 0);
    let userRequests = 0;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return response(200, session('access-2', 'refresh-2'));
      }
      userRequests += 1;
      return response(200, { id: `user-${userRequests}`, email: 'user@example.com' });
    });

    await Promise.all([auth.me(), auth.me()]);

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('does not erase credentials when SecureStore is temporarily unavailable', async () => {
    mockSecureValues.set(
      'algosplit_native_session_v1',
      JSON.stringify({
        version: 1,
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: Date.now() + 3_600_000,
      })
    );
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('device locked'));
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(auth.me()).rejects.toThrow(
      'Secure account storage is temporarily unavailable. Unlock this device and try again.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSecureValues.has('algosplit_native_session_v1')).toBe(true);
  });

  it('keeps the previous envelope when a rotated credential write fails', async () => {
    await nativeTokenStore.save('access-1', 'refresh-1');
    const previousEnvelope = mockSecureValues.get('algosplit_native_session_v1');
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('device locked'));

    await expect(nativeTokenStore.save('access-2', 'refresh-2')).rejects.toThrow('device locked');

    expect(mockSecureValues.get('algosplit_native_session_v1')).toBe(previousEnvelope);
  });

  it('uses the global endpoint only for explicit sign out all', async () => {
    await nativeTokenStore.save('access-1', 'refresh-1');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(204));

    await auth.logoutAll();

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/auth/logout-all');
    expect(await nativeTokenStore.getAccessToken()).toBeNull();
  });
});
