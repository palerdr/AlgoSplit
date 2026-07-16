jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import { auth } from '../src/api/backend';

function response(status: number, body?: unknown) {
  const serialized = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
    text: jest.fn(async () => serialized),
  } as unknown as Response;
}

const webSession = () => ({
  access_token: '',
  refresh_token: '',
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: 'user-1', email: 'user@example.com' },
});

describe('web session restoration', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: '' },
    });
    jest.restoreAllMocks();
  });

  it('bootstraps CSRF, refreshes once, and retries after an expired access cookie', async () => {
    let userRequests = 0;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) {
        globalThis.document.cookie = 'algosplit_csrf_token=csrf-token';
        return response(204);
      }
      if (url.endsWith('/auth/refresh')) return response(200, webSession());
      userRequests += 1;
      return userRequests === 1
        ? response(401, { detail: 'expired' })
        : response(200, webSession().user);
    });

    await expect(auth.me()).resolves.toMatchObject({ id: 'user-1' });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:8000/auth/user',
      'http://localhost:8000/auth/csrf',
      'http://localhost:8000/auth/refresh',
      'http://localhost:8000/auth/user',
    ]);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      credentials: 'include',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
    });
  });

  it('shares one refresh across simultaneous expired requests', async () => {
    let initialUserRequests = 0;
    let refreshRequests = 0;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) {
        globalThis.document.cookie = 'algosplit_csrf_token=csrf-token';
        return response(204);
      }
      if (url.endsWith('/auth/refresh')) {
        refreshRequests += 1;
        return response(200, webSession());
      }
      initialUserRequests += 1;
      return initialUserRequests <= 2
        ? response(401, { detail: 'expired' })
        : response(200, webSession().user);
    });

    await Promise.all([auth.me(), auth.me()]);

    expect(refreshRequests).toBe(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/csrf'))).toHaveLength(1);
  });

  it('keeps a provider outage retryable instead of converting it to signed out', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) {
        globalThis.document.cookie = 'algosplit_csrf_token=csrf-token';
        return response(204);
      }
      if (url.endsWith('/auth/refresh')) {
        return response(503, { detail: 'Account service is temporarily unavailable. Please try again later.' });
      }
      return response(401, { detail: 'expired' });
    });

    await expect(auth.me()).rejects.toMatchObject({ status: 503 });
  });

  it('re-bootstraps once after a stale CSRF token without dropping the session', async () => {
    globalThis.document.cookie = 'algosplit_csrf_token=stale-token';
    let userRequests = 0;
    let refreshRequests = 0;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) {
        globalThis.document.cookie = 'algosplit_csrf_token=fresh-token';
        return response(204);
      }
      if (url.endsWith('/auth/refresh')) {
        refreshRequests += 1;
        return refreshRequests === 1
          ? response(403, { detail: 'Invalid CSRF token' })
          : response(200, webSession());
      }
      userRequests += 1;
      return userRequests === 1
        ? response(401, { detail: 'expired' })
        : response(200, webSession().user);
    });

    await expect(auth.me()).resolves.toMatchObject({ id: 'user-1' });

    expect(refreshRequests).toBe(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/csrf'))).toHaveLength(1);
  });
});
