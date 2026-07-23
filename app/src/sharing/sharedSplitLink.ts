import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PENDING_SHARE_KEY = 'algosplit:pending-share:v1';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PENDING_SHARED_SPLIT_TTL_MS = 24 * 60 * 60_000;

export interface PendingSharedSplit {
  token: string;
  saveAfterAuth: true;
  createdAt: number;
}

export interface PendingSharedSplitIntent {
  token: string;
  saveAfterAuth: boolean;
}

let pendingStorageOperation: Promise<void> = Promise.resolve();

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function sessionStorageOrNull(): SessionStorageLike | null {
  try {
    return (
      globalThis as {
        sessionStorage?: SessionStorageLike;
      }
    ).sessionStorage ?? null;
  } catch {
    return null;
  }
}

function validToken(value: string | null | undefined): string | null {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return TOKEN_PATTERN.test(decoded) ? decoded : null;
}

/** Accept both public HTTPS links and the app-owned `algosplit://share/…` scheme. */
export function sharedSplitTokenFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (parsed.protocol === 'algosplit:') {
      if (parsed.hostname === 'share') return validToken(pathParts[0]);
      if (pathParts[0] === 'share') return validToken(pathParts[1]);
      return null;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (pathParts[0] === 'share') return validToken(pathParts[1]);
    return validToken(parsed.searchParams.get('share'));
  } catch {
    return null;
  }
}

/** Remove a consumed public share path without adding a browser-history entry. */
export function cleanSharedSplitUrl(): void {
  if (Platform.OS !== 'web') return;
  const browser = globalThis as {
    location?: { href?: string; origin?: string };
    history?: { replaceState?: (data: unknown, unused: string, url?: string | URL | null) => void };
  };
  if (
    !browser.location?.href ||
    !browser.location.origin ||
    !browser.history?.replaceState ||
    !sharedSplitTokenFromUrl(browser.location.href)
  ) {
    return;
  }
  browser.history.replaceState(null, '', `${browser.location.origin}/`);
}

async function readPendingSharedSplit(): Promise<string | null> {
  return Platform.OS === 'web'
    ? sessionStorageOrNull()?.getItem(PENDING_SHARE_KEY) ?? null
    : AsyncStorage.getItem(PENDING_SHARE_KEY);
}

async function removePendingSharedSplit(): Promise<void> {
  if (Platform.OS === 'web') {
    sessionStorageOrNull()?.removeItem(PENDING_SHARE_KEY);
  } else {
    await AsyncStorage.removeItem(PENDING_SHARE_KEY);
  }
}

function parsePendingSharedSplit(
  serialized: string,
  now: number
): PendingSharedSplit | null {
  try {
    const parsed = JSON.parse(serialized) as Partial<PendingSharedSplit>;
    const token = validToken(parsed.token);
    const createdAt =
      typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
        ? parsed.createdAt
        : null;
    if (
      !token ||
      parsed.saveAfterAuth !== true ||
      createdAt === null ||
      createdAt > now + 60_000 ||
      now - createdAt > PENDING_SHARED_SPLIT_TTL_MS
    ) {
      return null;
    }
    return { token, saveAfterAuth: true, createdAt };
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

export async function loadPendingSharedSplit(
  now = Date.now()
): Promise<PendingSharedSplit | null> {
  return withPendingStorageLock(async () => {
    try {
      const serialized = await readPendingSharedSplit();
      if (!serialized) return null;
      const pending = parsePendingSharedSplit(serialized, now);
      if (pending) return pending;
      await removePendingSharedSplit();
      return null;
    } catch {
      return null;
    }
  });
}

export async function savePendingSharedSplit(
  intent: PendingSharedSplitIntent,
  now = Date.now()
): Promise<void> {
  const token = validToken(intent.token);
  if (!token || intent.saveAfterAuth !== true) return;
  const serialized = JSON.stringify({
    token,
    saveAfterAuth: true,
    createdAt: now,
  });
  return withPendingStorageLock(async () => {
    try {
      if (Platform.OS === 'web') {
        sessionStorageOrNull()?.setItem(PENDING_SHARE_KEY, serialized);
      } else {
        await AsyncStorage.setItem(PENDING_SHARE_KEY, serialized);
      }
    } catch {
      // The in-memory flow still works if private storage is unavailable.
    }
  });
}

/**
 * Clear a persisted continuation. The boolean lets callers that are about to
 * create data stop safely if native storage could not confirm the removal.
 * When a token is supplied, a newer intent for a different token is preserved.
 */
export async function clearPendingSharedSplit(
  expectedToken?: string
): Promise<boolean> {
  return withPendingStorageLock(async () => {
    try {
      if (expectedToken !== undefined) {
        const token = validToken(expectedToken);
        if (!token) return false;
        const serialized = await readPendingSharedSplit();
        if (serialized) {
          const pending = parsePendingSharedSplit(serialized, Date.now());
          if (pending && pending.token !== token) return true;
        }
      }
      await removePendingSharedSplit();
      return true;
    } catch {
      return false;
    }
  });
}
