jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import { splitShares } from '../src/api/backend';

function response(status: number, body?: unknown) {
  const serialized = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
    text: jest.fn(async () => serialized),
  } as unknown as Response;
}

describe('split sharing API client', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: 'algosplit_csrf_token=csrf-token' },
    });
    jest.restoreAllMocks();
  });

  it('uses the exact owner create, status, and revoke routes', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response(201, {
          token: 'A'.repeat(43),
          expires_at: '2026-08-22T12:00:00Z',
          active_count: 1,
          review_exercises: ['Custom Press'],
        })
      )
      .mockResolvedValueOnce(response(200, { active_count: 1 }))
      .mockResolvedValueOnce(response(200, { revoked_count: 1 }))
      .mockResolvedValueOnce(
        response(201, {
          id: 'copied-split',
          name: 'Shared split',
          sessions: [],
        })
      );

    const created = await splitShares.create('split/one');
    await splitShares.status('split/one');
    await splitShares.revokeAll('split/one');
    const copied = await splitShares.copy('share/token');

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:8000/api/splits/split%2Fone/shares',
      'http://localhost:8000/api/splits/split%2Fone/shares/status',
      'http://localhost:8000/api/splits/split%2Fone/shares',
      'http://localhost:8000/api/split-shares/share%2Ftoken/copy',
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'GET',
      'DELETE',
      'POST',
    ]);
    expect(created.review_exercises).toEqual(['Custom Press']);
    expect(copied.id).toBe('copied-split');
  });

  it('keeps anonymous preview independent of stale account refresh', async () => {
    const token = 'Abcdefghijklmnopqrstuvwxyz0123456789_token';
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(401, { detail: 'stale account cookie' }));

    await expect(splitShares.getPublic(token)).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `http://localhost:8000/api/split-shares/${token}`
    );
  });
});
