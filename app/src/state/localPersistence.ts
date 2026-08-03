export const LEGACY_APP_STORAGE_KEY = 'fitapp:v1';
const APP_STORAGE_PREFIX = 'algosplit:v2';
const HOME_SPLITS_CACHE_SEGMENT = 'homeSplits';
const HOME_ANALYSIS_CACHE_SEGMENT = 'homeAnalysis';
const HOME_ANALYSIS_CALCULATION_VERSION = 2;
const WORKOUT_SUMMARIES_CACHE_SEGMENT = 'workoutSummaries';

export type AnalysisDataset = 'schoenfeld' | 'pelland' | 'average';

export interface AnalysisPreferences {
  stimulusDuration: number;
  maintenanceVolume: number;
  dataset: AnalysisDataset;
}

export interface HomeAnalysisCacheParams extends AnalysisPreferences {
  days: number;
  endDate: string;
  timezoneOffsetMinutes: number;
}

export interface PersistedHomeResource<T> {
  data: T;
  savedAt: number;
}

export const DEFAULT_ANALYSIS_PREFERENCES: AnalysisPreferences = {
  stimulusDuration: 48,
  maintenanceVolume: 3,
  dataset: 'schoenfeld',
};

export function accountStorageKey(userId: string): string {
  return `${APP_STORAGE_PREFIX}:account:${encodeURIComponent(userId)}`;
}

export function demoStorageKey(): string {
  return `${APP_STORAGE_PREFIX}:demo`;
}

export function analysisPreferencesKey(userId: string): string {
  return `${APP_STORAGE_PREFIX}:analysis:${encodeURIComponent(userId)}`;
}

export function activeSplitKey(userId: string): string {
  return `${APP_STORAGE_PREFIX}:activeSplit:${encodeURIComponent(userId)}`;
}

export function homeSplitsCacheKey(userId: string): string {
  return `${APP_STORAGE_PREFIX}:${HOME_SPLITS_CACHE_SEGMENT}:${encodeURIComponent(userId)}`;
}

export function workoutSummariesCacheKey(userId: string): string {
  return `${APP_STORAGE_PREFIX}:${WORKOUT_SUMMARIES_CACHE_SEGMENT}:${encodeURIComponent(userId)}`;
}

function homeAnalysisCacheUserPrefix(userId: string): string {
  return `${APP_STORAGE_PREFIX}:${HOME_ANALYSIS_CACHE_SEGMENT}:${encodeURIComponent(userId)}:`;
}

function homeAnalysisCachePrefix(userId: string): string {
  return `${homeAnalysisCacheUserPrefix(userId)}${HOME_ANALYSIS_CALCULATION_VERSION}:`;
}

export function homeAnalysisCacheKey(
  userId: string,
  params: HomeAnalysisCacheParams
): string {
  const normalized = normalizeAnalysisPreferences(params);
  return `${homeAnalysisCachePrefix(userId)}${[
    Math.max(1, Math.round(params.days)),
    params.endDate,
    Math.round(params.timezoneOffsetMinutes),
    normalized.stimulusDuration,
    normalized.maintenanceVolume,
    normalized.dataset,
  ].map(encodeURIComponent).join(':')}`;
}

export function decodePersistedResource<T>(
  raw: string | null
): PersistedHomeResource<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedHomeResource<T>>;
    if (!('data' in parsed) || !Number.isFinite(parsed.savedAt)) return null;
    return parsed as PersistedHomeResource<T>;
  } catch {
    return null;
  }
}

export function encodePersistedResource<T>(data: T, savedAt = Date.now()): string {
  return JSON.stringify({ data, savedAt });
}

async function loadPersistedResource<T>(key: string): Promise<PersistedHomeResource<T> | null> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  return decodePersistedResource<T>(await AsyncStorage.getItem(key));
}

async function savePersistedResource<T>(key: string, data: T): Promise<void> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  await AsyncStorage.setItem(key, encodePersistedResource(data));
}

export function loadPersistedHomeSplits<T>(
  userId: string
): Promise<PersistedHomeResource<T> | null> {
  return loadPersistedResource<T>(homeSplitsCacheKey(userId));
}

export function savePersistedHomeSplits<T>(userId: string, data: T): Promise<void> {
  return savePersistedResource(homeSplitsCacheKey(userId), data);
}

export function loadPersistedWorkoutSummaries<T>(
  userId: string
): Promise<PersistedHomeResource<T> | null> {
  return loadPersistedResource<T>(workoutSummariesCacheKey(userId));
}

export function savePersistedWorkoutSummaries<T>(userId: string, data: T): Promise<void> {
  return savePersistedResource(workoutSummariesCacheKey(userId), data);
}

export function loadPersistedHomeAnalysis<T>(
  userId: string,
  params: HomeAnalysisCacheParams
): Promise<PersistedHomeResource<T> | null> {
  return loadPersistedResource<T>(homeAnalysisCacheKey(userId, params));
}

export function savePersistedHomeAnalysis<T>(
  userId: string,
  params: HomeAnalysisCacheParams,
  data: T
): Promise<void> {
  return savePersistedResource(homeAnalysisCacheKey(userId, params), data);
}

/** Per-device choice of which split is "active" (drives home-screen streak/quick start). */
export async function loadActiveSplitId(userId: string): Promise<string | null> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const raw = await AsyncStorage.getItem(activeSplitKey(userId));
  return raw && raw.length > 0 ? raw : null;
}

export async function saveActiveSplitId(userId: string, splitId: string | null): Promise<void> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  if (splitId) {
    await AsyncStorage.setItem(activeSplitKey(userId), splitId);
  } else {
    await AsyncStorage.removeItem(activeSplitKey(userId));
  }
}

export function normalizeAnalysisPreferences(
  value: Partial<AnalysisPreferences> | null | undefined
): AnalysisPreferences {
  const duration = Number(value?.stimulusDuration);
  const maintenance = Number(value?.maintenanceVolume);
  const dataset = value?.dataset;
  return {
    stimulusDuration: Math.min(
      96,
      Math.max(24, Number.isFinite(duration) ? Math.round(duration) : 48)
    ),
    maintenanceVolume: Math.min(
      9,
      Math.max(1, Number.isFinite(maintenance) ? Math.round(maintenance) : 3)
    ),
    dataset:
      dataset === 'pelland' || dataset === 'average' || dataset === 'schoenfeld'
        ? dataset
        : 'schoenfeld',
  };
}

export async function loadAnalysisPreferences(userId: string): Promise<AnalysisPreferences> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const raw = await AsyncStorage.getItem(analysisPreferencesKey(userId));
  if (!raw) return DEFAULT_ANALYSIS_PREFERENCES;
  try {
    return normalizeAnalysisPreferences(JSON.parse(raw) as Partial<AnalysisPreferences>);
  } catch {
    return DEFAULT_ANALYSIS_PREFERENCES;
  }
}

export async function saveAnalysisPreferences(
  userId: string,
  preferences: AnalysisPreferences
): Promise<void> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  await AsyncStorage.setItem(
    analysisPreferencesKey(userId),
    JSON.stringify(normalizeAnalysisPreferences(preferences))
  );
}

/** Remove local account-owned workout data during logout or account deletion. */
export async function clearPersistedAccountData(userId: string): Promise<void> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const keys = await AsyncStorage.getAllKeys();
  const analysisPrefix = homeAnalysisCacheUserPrefix(userId);
  const accountKeys = [
    accountStorageKey(userId),
    analysisPreferencesKey(userId),
    activeSplitKey(userId),
    homeSplitsCacheKey(userId),
    workoutSummariesCacheKey(userId),
    ...keys.filter((key) => key.startsWith(analysisPrefix)),
  ];
  await AsyncStorage.multiRemove(accountKeys);
}

/** The pre-account global cache could contain another person's data. */
export async function removeLegacyGlobalData(): Promise<void> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  await AsyncStorage.removeItem(LEGACY_APP_STORAGE_KEY);
}
