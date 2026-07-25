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
  PENDING_FRIEND_INVITE_TTL_MS,
  clearPendingFriendInvite,
  friendInviteHandleFromUrl,
  friendInviteShareContent,
  friendInviteUrl,
  loadPendingFriendInvite,
  savePendingFriendInvite,
} from '../src/social/friendInviteLink';

const NOW = Date.UTC(2026, 6, 24, 12);
const getItemMock =
  AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const setItemMock =
  AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
const removeItemMock =
  AsyncStorage.removeItem as jest.MockedFunction<typeof AsyncStorage.removeItem>;

describe('friend invite links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getItemMock.mockResolvedValue(null);
    setItemMock.mockResolvedValue(undefined);
    removeItemMock.mockResolvedValue(undefined);
  });

  it('builds a usable HTTPS route containing only the username', () => {
    expect(friendInviteUrl('lift_buddy', 'https://example.test/')).toBe(
      'https://example.test/friends/invite/lift_buddy'
    );
  });

  it('puts the usable link into native share content on every platform', () => {
    expect(friendInviteShareContent('lift_buddy', 'ios')).toEqual({
      message: 'Add @lift_buddy on AlgoSplit.',
      url: 'https://algo-split.vercel.app/friends/invite/lift_buddy',
    });
    expect(friendInviteShareContent('lift_buddy', 'android')).toEqual({
      title: 'Add me on AlgoSplit',
      message:
        'Add @lift_buddy on AlgoSplit: https://algo-split.vercel.app/friends/invite/lift_buddy',
    });
  });

  it('parses web, custom-scheme, Expo Go, and query invite shapes', () => {
    expect(
      friendInviteHandleFromUrl('https://algo-split.vercel.app/friends/invite/lift_buddy')
    ).toBe('lift_buddy');
    expect(friendInviteHandleFromUrl('algosplit://friends/invite/lift_buddy')).toBe(
      'lift_buddy'
    );
    expect(
      friendInviteHandleFromUrl('exp://127.0.0.1:8081/--/friends/invite/lift_buddy')
    ).toBe('lift_buddy');
    expect(friendInviteHandleFromUrl('https://example.test/?friend=lift_buddy')).toBe(
      'lift_buddy'
    );
  });

  it('rejects malformed usernames and unrelated links', () => {
    expect(friendInviteHandleFromUrl('https://example.test/friends/invite/ab')).toBeNull();
    expect(
      friendInviteHandleFromUrl('https://example.test/friends/invite/lift.buddy')
    ).toBeNull();
    expect(friendInviteHandleFromUrl('https://example.test/share/lift_buddy')).toBeNull();
    expect(friendInviteHandleFromUrl('javascript:alert(1)')).toBeNull();
  });

  it('persists the invite through authentication and then clears it', async () => {
    await savePendingFriendInvite('lift_buddy', NOW);
    const serialized = setItemMock.mock.calls[0][1];
    expect(JSON.parse(serialized)).toEqual({ handle: 'lift_buddy', createdAt: NOW });

    getItemMock.mockResolvedValue(serialized);
    await expect(loadPendingFriendInvite(NOW + 1_000)).resolves.toEqual({
      handle: 'lift_buddy',
      createdAt: NOW,
    });
    await expect(clearPendingFriendInvite('lift_buddy')).resolves.toBe(true);
    expect(removeItemMock).toHaveBeenCalledTimes(1);
  });

  it('expires stale invite continuations', async () => {
    getItemMock.mockResolvedValue(JSON.stringify({ handle: 'lift_buddy', createdAt: NOW }));
    await expect(
      loadPendingFriendInvite(NOW + PENDING_FRIEND_INVITE_TTL_MS + 1)
    ).resolves.toBeNull();
    expect(removeItemMock).toHaveBeenCalledTimes(1);
  });
});
