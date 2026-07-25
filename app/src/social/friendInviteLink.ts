import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { isValidUsername, normalizeUsername } from './usernames';

const FALLBACK_SHARE_ORIGIN = 'https://algo-split.vercel.app';
const PENDING_INVITE_KEY = 'algosplit:pending-friend-invite:v1';
export const PENDING_FRIEND_INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

export interface PendingFriendInvite {
  handle: string;
  createdAt: number;
}

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let pendingStorageOperation: Promise<void> = Promise.resolve();

function sessionStorageOrNull(): SessionStorageLike | null {
  try {
    return (globalThis as { sessionStorage?: SessionStorageLike }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

function browserOrigin(): string | null {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  return origin && origin !== 'null' ? origin : null;
}

function validHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const normalized = normalizeUsername(decoded);
  return isValidUsername(normalized) && normalized === decoded.trim().replace(/^@/, '').toLowerCase()
    ? normalized
    : null;
}

/** Build the HTTPS invite that works whether or not the native app is installed. */
export function friendInviteUrl(
  handle: string,
  baseUrl: string =
    process.env.EXPO_PUBLIC_ALGOSPLIT_SHARE_BASE_URL ??
    browserOrigin() ??
    FALLBACK_SHARE_ORIGIN
): string {
  const normalized = validHandle(handle);
  if (!normalized) throw new Error('A valid username is required to create an invite.');
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
  return `${normalizedBase}/friends/invite/${encodeURIComponent(normalized)}`;
}

export function friendInviteShareContent(
  handle: string,
  platform = Platform.OS
): { message: string; title?: string; url?: string } {
  const normalized = validHandle(handle);
  if (!normalized) throw new Error('A valid username is required to create an invite.');
  const url = friendInviteUrl(normalized);
  return platform === 'ios'
    ? {
        message: `Add @${normalized} on AlgoSplit.`,
        url,
      }
    : {
        title: 'Add me on AlgoSplit',
        message: `Add @${normalized} on AlgoSplit: ${url}`,
      };
}

/** Accept public web invites, the app scheme, Expo Go paths, and a query fallback. */
export function friendInviteHandleFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === '--') parts.shift();

    if (parsed.protocol === 'algosplit:') {
      if (parsed.hostname === 'friends') {
        return validHandle(parts[0] === 'invite' ? parts[1] : parts[0]);
      }
      if (parsed.hostname === 'friend-invite') return validHandle(parts[0]);
      if (parts[0] === 'friends' && parts[1] === 'invite') return validHandle(parts[2]);
      return null;
    }

    if (!['https:', 'http:', 'exp:', 'exps:'].includes(parsed.protocol)) return null;
    if (parts[0] === 'friends' && parts[1] === 'invite') return validHandle(parts[2]);
    return validHandle(parsed.searchParams.get('friend'));
  } catch {
    return null;
  }
}

function parsePendingInvite(serialized: string, now: number): PendingFriendInvite | null {
  try {
    const parsed = JSON.parse(serialized) as Partial<PendingFriendInvite>;
    const handle = validHandle(parsed.handle);
    const createdAt =
      typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
        ? parsed.createdAt
        : null;
    if (
      !handle ||
      createdAt === null ||
      createdAt > now + 60_000 ||
      now - createdAt > PENDING_FRIEND_INVITE_TTL_MS
    ) {
      return null;
    }
    return { handle, createdAt };
  } catch {
    return null;
  }
}

function withPendingStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingStorageOperation.then(operation, operation);
  pendingStorageOperation = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function readPendingInvite(): Promise<string | null> {
  return Platform.OS === 'web'
    ? sessionStorageOrNull()?.getItem(PENDING_INVITE_KEY) ?? null
    : AsyncStorage.getItem(PENDING_INVITE_KEY);
}

async function removePendingInvite(): Promise<void> {
  if (Platform.OS === 'web') {
    sessionStorageOrNull()?.removeItem(PENDING_INVITE_KEY);
  } else {
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  }
}

export async function loadPendingFriendInvite(
  now = Date.now()
): Promise<PendingFriendInvite | null> {
  return withPendingStorageLock(async () => {
    try {
      const serialized = await readPendingInvite();
      if (!serialized) return null;
      const pending = parsePendingInvite(serialized, now);
      if (pending) return pending;
      await removePendingInvite();
      return null;
    } catch {
      return null;
    }
  });
}

export async function savePendingFriendInvite(
  handle: string,
  now = Date.now()
): Promise<void> {
  const normalized = validHandle(handle);
  if (!normalized) return;
  const serialized = JSON.stringify({ handle: normalized, createdAt: now });
  return withPendingStorageLock(async () => {
    try {
      if (Platform.OS === 'web') {
        sessionStorageOrNull()?.setItem(PENDING_INVITE_KEY, serialized);
      } else {
        await AsyncStorage.setItem(PENDING_INVITE_KEY, serialized);
      }
    } catch {
      // The current in-memory navigation remains usable if storage is unavailable.
    }
  });
}

export async function clearPendingFriendInvite(expectedHandle?: string): Promise<boolean> {
  return withPendingStorageLock(async () => {
    try {
      if (expectedHandle !== undefined) {
        const normalized = validHandle(expectedHandle);
        if (!normalized) return false;
        const serialized = await readPendingInvite();
        if (serialized) {
          const pending = parsePendingInvite(serialized, Date.now());
          if (pending && pending.handle !== normalized) return true;
        }
      }
      await removePendingInvite();
      return true;
    } catch {
      return false;
    }
  });
}

/** Remove a consumed invite path without adding a browser-history entry. */
export function cleanFriendInviteUrl(): void {
  if (Platform.OS !== 'web') return;
  const browser = globalThis as {
    location?: { href?: string; origin?: string };
    history?: { replaceState?: (data: unknown, unused: string, url?: string | URL | null) => void };
  };
  if (
    !browser.location?.href ||
    !browser.location.origin ||
    !browser.history?.replaceState ||
    !friendInviteHandleFromUrl(browser.location.href)
  ) {
    return;
  }
  browser.history.replaceState(null, '', `${browser.location.origin}/`);
}
