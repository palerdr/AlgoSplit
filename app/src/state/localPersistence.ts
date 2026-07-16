export const LEGACY_APP_STORAGE_KEY = 'fitapp:v1';
const APP_STORAGE_PREFIX = 'algosplit:v2';

export type AnalysisDataset = 'schoenfeld' | 'pelland' | 'average';

export interface AnalysisPreferences {
  stimulusDuration: number;
  maintenanceVolume: number;
  dataset: AnalysisDataset;
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
  await Promise.all([
    AsyncStorage.removeItem(accountStorageKey(userId)),
    AsyncStorage.removeItem(analysisPreferencesKey(userId)),
  ]);
}

/** The pre-account global cache could contain another person's data. */
export async function removeLegacyGlobalData(): Promise<void> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  await AsyncStorage.removeItem(LEGACY_APP_STORAGE_KEY);
}
