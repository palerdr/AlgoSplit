import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BackendError,
  AnalysisResponse,
  SplitCreate,
  SplitResponse,
  UserInfo,
  WorkoutLogResponse,
  auth,
  analysis,
  backendConfigured,
  splits as splitsApi,
} from '../api/backend';
import { loadAllWorkouts, localDateKey, workoutRangeKey } from '../api/accountData';
import {
  AnalysisPreferences,
  DEFAULT_ANALYSIS_PREFERENCES,
  clearPersistedAccountData,
  loadAnalysisPreferences,
  normalizeAnalysisPreferences,
  saveAnalysisPreferences,
} from './localPersistence';

export type AccountStatus =
  | 'unconfigured'
  | 'checking'
  | 'signedOut'
  | 'authenticated'
  | 'error';

export interface RemoteResource<T> {
  data: T;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

interface AccountState {
  status: AccountStatus;
  user: UserInfo | null;
  sessionError: string | null;
  splits: RemoteResource<SplitResponse[]>;
  workoutRanges: Record<string, RemoteResource<WorkoutLogResponse[]>>;
  recentStimulus: RemoteResource<AnalysisResponse | null>;
  analysisPreferences: AnalysisPreferences;
  analysisPreferencesReady: boolean;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (accessToken: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshSplits: () => Promise<void>;
  replaceSplit: (splitId: string, split: SplitCreate) => Promise<SplitResponse>;
  refreshWorkouts: (days?: number) => Promise<void>;
  refreshStimulus: () => Promise<void>;
  updateAnalysisPreferences: (update: Partial<AnalysisPreferences>) => Promise<void>;
}

const EMPTY_SPLITS: RemoteResource<SplitResponse[]> = {
  data: [],
  loading: false,
  loaded: false,
  error: null,
};

const EMPTY_STIMULUS: RemoteResource<AnalysisResponse | null> = {
  data: null,
  loading: false,
  loaded: false,
  error: null,
};

export function emptyWorkoutResource(): RemoteResource<WorkoutLogResponse[]> {
  return { data: [], loading: false, loaded: false, error: null };
}

export function isSignedOutError(error: unknown): boolean {
  return error instanceof BackendError && error.status === 401;
}

export function shouldUseAccountData(status: AccountStatus): boolean {
  return status === 'authenticated';
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const AccountStateContext = createContext<AccountState | null>(null);

export function AccountStateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>(
    backendConfigured() ? 'checking' : 'unconfigured'
  );
  const [user, setUser] = useState<UserInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [splitResource, setSplitResource] = useState(EMPTY_SPLITS);
  const [workoutRanges, setWorkoutRanges] = useState<
    Record<string, RemoteResource<WorkoutLogResponse[]>>
  >({});
  const [recentStimulus, setRecentStimulus] = useState(EMPTY_STIMULUS);
  const [analysisPreferences, setAnalysisPreferences] = useState(
    DEFAULT_ANALYSIS_PREFERENCES
  );
  const [analysisPreferencesReady, setAnalysisPreferencesReady] = useState(false);
  const stimulusRequestRef = useRef(0);

  const clearRemoteData = useCallback(() => {
    setSplitResource(EMPTY_SPLITS);
    setWorkoutRanges({});
    setRecentStimulus(EMPTY_STIMULUS);
    stimulusRequestRef.current += 1;
  }, []);

  const markSignedOut = useCallback(() => {
    setStatus('signedOut');
    setUser(null);
    setSessionError(null);
    clearRemoteData();
  }, [clearRemoteData]);

  const refreshSession = useCallback(async () => {
    if (!backendConfigured()) {
      setStatus('unconfigured');
      setUser(null);
      setSessionError(null);
      clearRemoteData();
      return;
    }

    setStatus('checking');
    setSessionError(null);
    try {
      const nextUser = await auth.me();
      setUser(nextUser);
      setStatus('authenticated');
    } catch (error) {
      if (isSignedOutError(error)) {
        markSignedOut();
        return;
      }
      setUser(null);
      setStatus('error');
      setSessionError(messageFromError(error));
      clearRemoteData();
    }
  }, [clearRemoteData, markSignedOut]);

  const refreshSplits = useCallback(async () => {
    setSplitResource((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const response = await splitsApi.list(true);
      setSplitResource({ data: response.splits, loading: false, loaded: true, error: null });
    } catch (error) {
      if (isSignedOutError(error)) {
        markSignedOut();
        return;
      }
      setSplitResource((previous) => ({
        ...previous,
        loading: false,
        loaded: true,
        error: messageFromError(error),
      }));
    }
  }, [markSignedOut]);

  const refreshWorkouts = useCallback(
    async (days?: number) => {
      const key = workoutRangeKey(days);
      setWorkoutRanges((previous) => ({
        ...previous,
        [key]: { ...(previous[key] ?? emptyWorkoutResource()), loading: true, error: null },
      }));
      try {
        const data = await loadAllWorkouts(days);
        setWorkoutRanges((previous) => ({
          ...previous,
          [key]: { data, loading: false, loaded: true, error: null },
        }));
      } catch (error) {
        if (isSignedOutError(error)) {
          markSignedOut();
          return;
        }
        setWorkoutRanges((previous) => ({
          ...previous,
          [key]: {
            ...(previous[key] ?? emptyWorkoutResource()),
            loading: false,
            loaded: true,
            error: messageFromError(error),
          },
        }));
      }
    },
    [markSignedOut]
  );

  const refreshStimulus = useCallback(async () => {
    const requestId = ++stimulusRequestRef.current;
    setRecentStimulus((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const data = await analysis.analyzeWorkouts({
        days: 7,
        end_date: localDateKey(new Date()),
        timezone_offset_minutes: new Date().getTimezoneOffset(),
        stimulus_duration: analysisPreferences.stimulusDuration,
        maintenance_volume: analysisPreferences.maintenanceVolume,
        dataset: analysisPreferences.dataset,
      });
      if (requestId !== stimulusRequestRef.current) return;
      setRecentStimulus({ data, loading: false, loaded: true, error: null });
    } catch (error) {
      if (requestId !== stimulusRequestRef.current) return;
      if (isSignedOutError(error)) {
        markSignedOut();
        return;
      }
      setRecentStimulus((previous) => ({
        ...previous,
        loading: false,
        loaded: true,
        error: messageFromError(error),
      }));
    }
  }, [analysisPreferences, markSignedOut]);

  const updateAnalysisPreferences = useCallback(
    async (update: Partial<AnalysisPreferences>) => {
      if (!user?.id) throw new Error('Sign in before changing analysis defaults.');
      const next = normalizeAnalysisPreferences({ ...analysisPreferences, ...update });
      setAnalysisPreferences(next);
      await saveAnalysisPreferences(user.id, next);
    },
    [analysisPreferences, user?.id]
  );

  const replaceSplit = useCallback(
    async (splitId: string, split: SplitCreate) => {
      try {
        const saved = await splitsApi.replace(splitId, split);
        setSplitResource((previous) => ({
          data: previous.data.map((candidate) =>
            candidate.id === splitId ? saved : candidate
          ),
          loading: false,
          loaded: true,
          error: null,
        }));
        return saved;
      } catch (error) {
        if (isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [markSignedOut]
  );

  const login = useCallback(async (email: string, password: string) => {
    setStatus('checking');
    setSessionError(null);
    try {
      const response = await auth.login(email, password);
      setUser(response.user);
      setStatus('authenticated');
    } catch (error) {
      setStatus('signedOut');
      setUser(null);
      setSessionError(messageFromError(error));
      throw error;
    }
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setStatus('checking');
    setSessionError(null);
    try {
      const response = await auth.signup(email, password);
      setUser(response.user);
      setStatus('authenticated');
    } catch (error) {
      setStatus('signedOut');
      setUser(null);
      setSessionError(messageFromError(error));
      throw error;
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const response = await auth.forgotPassword(email);
    return response.message;
  }, []);

  const resetPassword = useCallback(async (accessToken: string, password: string) => {
    await auth.resetPassword(accessToken, password);
  }, []);

  const logout = useCallback(async () => {
    const userId = user?.id;
    let logoutError: unknown;
    try {
      await auth.logout();
    } catch (error) {
      logoutError = error;
    }
    if (userId) await clearPersistedAccountData(userId).catch(() => {});
    markSignedOut();
    if (logoutError) {
      setSessionError(
        'Signed out on this device, but the server could not be reached to revoke the session.'
      );
    }
  }, [markSignedOut, user?.id]);

  const deleteAccount = useCallback(async () => {
    const userId = user?.id;
    await auth.deleteAccount();
    if (userId) await clearPersistedAccountData(userId).catch(() => {});
    markSignedOut();
  }, [markSignedOut, user?.id]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setAnalysisPreferences(DEFAULT_ANALYSIS_PREFERENCES);
      setAnalysisPreferencesReady(false);
      return;
    }
    setAnalysisPreferencesReady(false);
    loadAnalysisPreferences(user.id)
      .then((preferences) => {
        if (!cancelled) setAnalysisPreferences(preferences);
      })
      .finally(() => {
        if (!cancelled) setAnalysisPreferencesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (status === 'authenticated') refreshSplits();
  }, [status, refreshSplits]);

  useEffect(() => {
    if (status === 'authenticated' && analysisPreferencesReady) refreshStimulus();
  }, [status, analysisPreferencesReady, refreshStimulus]);

  const value = useMemo<AccountState>(
    () => ({
      status,
      user,
      sessionError,
      splits: splitResource,
      workoutRanges,
      recentStimulus,
      analysisPreferences,
      analysisPreferencesReady,
      refreshSession,
      login,
      signup,
      forgotPassword,
      resetPassword,
      logout,
      deleteAccount,
      refreshSplits,
      replaceSplit,
      refreshWorkouts,
      refreshStimulus,
      updateAnalysisPreferences,
    }),
    [
      status,
      user,
      sessionError,
      splitResource,
      workoutRanges,
      recentStimulus,
      analysisPreferences,
      analysisPreferencesReady,
      refreshSession,
      login,
      signup,
      forgotPassword,
      resetPassword,
      logout,
      deleteAccount,
      refreshSplits,
      replaceSplit,
      refreshWorkouts,
      refreshStimulus,
      updateAnalysisPreferences,
    ]
  );

  return <AccountStateContext.Provider value={value}>{children}</AccountStateContext.Provider>;
}

export function useAccountState(): AccountState {
  const state = useContext(AccountStateContext);
  if (!state) throw new Error('useAccountState must be used inside AccountStateProvider');
  return state;
}
