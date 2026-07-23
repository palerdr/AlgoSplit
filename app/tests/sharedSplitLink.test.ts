jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PENDING_SHARED_SPLIT_TTL_MS,
  clearPendingSharedSplit,
  loadPendingSharedSplit,
  savePendingSharedSplit,
  sharedSplitTokenFromUrl,
} from '../src/sharing/sharedSplitLink';

const TOKEN = 'Abcdefghijklmnopqrstuvwxyz0123456789_-token';
const OTHER_TOKEN = 'Zbcdefghijklmnopqrstuvwxyz0123456789_-token';
const NOW = Date.UTC(2026, 6, 23, 12);

const getItemMock =
  AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const setItemMock =
  AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
const removeItemMock =
  AsyncStorage.removeItem as jest.MockedFunction<typeof AsyncStorage.removeItem>;

describe('shared split links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getItemMock.mockResolvedValue(null);
    setItemMock.mockResolvedValue(undefined);
    removeItemMock.mockResolvedValue(undefined);
  });

  it('reads public HTTPS paths and query fallbacks', () => {
    expect(sharedSplitTokenFromUrl(`https://algo-split.vercel.app/share/${TOKEN}`)).toBe(TOKEN);
    expect(sharedSplitTokenFromUrl(`https://example.test/?share=${TOKEN}`)).toBe(TOKEN);
  });

  it('reads the app-owned deep-link shape', () => {
    expect(sharedSplitTokenFromUrl(`algosplit://share/${TOKEN}`)).toBe(TOKEN);
  });

  it('rejects unrelated, short, and malformed tokens', () => {
    expect(sharedSplitTokenFromUrl(`https://example.test/reset-password/${TOKEN}`)).toBeNull();
    expect(sharedSplitTokenFromUrl('https://example.test/share/short')).toBeNull();
    expect(sharedSplitTokenFromUrl('javascript:alert(1)')).toBeNull();
    expect(sharedSplitTokenFromUrl(null)).toBeNull();
  });

  it('reports whether a persisted continuation was safely cleared', async () => {
    await expect(clearPendingSharedSplit()).resolves.toBe(true);

    removeItemMock.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(clearPendingSharedSplit()).resolves.toBe(false);
  });

  it('stores a timestamped one-shot sign-in continuation', async () => {
    await savePendingSharedSplit(
      { token: TOKEN, saveAfterAuth: true },
      NOW
    );

    expect(setItemMock).toHaveBeenCalledTimes(1);
    const serialized = setItemMock.mock.calls[0][1];
    expect(JSON.parse(serialized)).toEqual({
      token: TOKEN,
      saveAfterAuth: true,
      createdAt: NOW,
    });

    getItemMock.mockResolvedValue(serialized);
    await expect(loadPendingSharedSplit(NOW + 1_000)).resolves.toEqual({
      token: TOKEN,
      saveAfterAuth: true,
      createdAt: NOW,
    });
  });

  it('expires and clears stale sign-in continuations', async () => {
    getItemMock.mockResolvedValue(
      JSON.stringify({
        token: TOKEN,
        saveAfterAuth: true,
        createdAt: NOW,
      })
    );

    await expect(
      loadPendingSharedSplit(NOW + PENDING_SHARED_SPLIT_TTL_MS + 1)
    ).resolves.toBeNull();
    expect(removeItemMock).toHaveBeenCalledTimes(1);
  });

  it('does not let an old save clear a newer token intent', async () => {
    getItemMock.mockResolvedValue(
      JSON.stringify({
        token: OTHER_TOKEN,
        saveAfterAuth: true,
        createdAt: Date.now(),
      })
    );

    await expect(clearPendingSharedSplit(TOKEN)).resolves.toBe(true);
    expect(removeItemMock).not.toHaveBeenCalled();
  });

  it('serializes intent writes with an in-flight clear', async () => {
    let stored: string | null = JSON.stringify({
      token: TOKEN,
      saveAfterAuth: true,
      createdAt: Date.now(),
    });
    let releaseRead!: () => void;
    let notifyReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      notifyReadStarted = resolve;
    });

    getItemMock.mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          const snapshot = stored;
          releaseRead = () => resolve(snapshot);
          notifyReadStarted();
        })
    );
    setItemMock.mockImplementation(async (_key, value) => {
      stored = value;
    });
    removeItemMock.mockImplementation(async () => {
      stored = null;
    });

    const clearingOldIntent = clearPendingSharedSplit(TOKEN);
    await readStarted;
    const savingNewIntent = savePendingSharedSplit(
      { token: OTHER_TOKEN, saveAfterAuth: true },
      NOW
    );

    expect(setItemMock).not.toHaveBeenCalled();
    releaseRead();
    await Promise.all([clearingOldIntent, savingNewIntent]);

    expect(JSON.parse(stored ?? 'null')).toMatchObject({ token: OTHER_TOKEN });
  });
});
