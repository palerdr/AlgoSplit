export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

interface BackendFailure {
  status: number;
  detail?: unknown;
}

function isBackendFailure(error: unknown): error is BackendFailure {
  return Boolean(
    error
      && typeof error === 'object'
      && 'status' in error
      && typeof (error as { status?: unknown }).status === 'number'
  );
}

export function normalizeUsername(value: string): string {
  return value
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

export function isProfileNotCreated(error: unknown): boolean {
  if (!isBackendFailure(error) || error.status !== 404) return false;
  const detail = error.detail;
  return Boolean(
    detail
      && typeof detail === 'object'
      && 'detail' in detail
      && (detail as { detail?: unknown }).detail === 'Profile not created'
  );
}

export function socialApiUnavailableMessage(error: unknown): string {
  if (isBackendFailure(error) && error.status === 404) {
    return 'This preview is connected to an API build without Friends support.';
  }
  return error instanceof Error ? error.message : 'Friends could not be loaded.';
}
