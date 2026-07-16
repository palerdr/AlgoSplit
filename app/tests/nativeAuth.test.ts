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

    await expect(auth.logout()).rejects.toThrow('offline');
    expect(await nativeTokenStore.getAccessToken()).toBeNull();
    expect(await nativeTokenStore.getRefreshToken()).toBeNull();
  });
});
