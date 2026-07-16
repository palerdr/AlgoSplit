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
  SessionCreate,
  SplitCreate,
  SplitResponse,
  UserInfo,
  WorkoutLogResponse,
  WorkoutOverviewPoint,
  WorkoutProgressWorkout,
  WorkoutSummaryListResponse,
  auth,
  authErrorMessageForDisplay,
  analysis,
  backendConfigured,
  splits as splitsApi,
  workouts as workoutsApi,
} from '../api/backend';
import {
  clearSplitAnalysisCache,
  loadAllWorkoutProgress,
  loadAllWorkouts,
  localDateKey,
  workoutProgressKey,
  workoutRangeKey,
} from '../api/accountData';
import {
  AnalysisPreferences,
  DEFAULT_ANALYSIS_PREFERENCES,
  clearPersistedAccountData,
  loadAnalysisPreferences,
  normalizeAnalysisPreferences,
  saveAnalysisPreferences,
} from './localPersistence';

const RESOURCE_TTL_MS = 60_000;

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
  fetchedAt: number | null;
}

interface AccountState {
  status: AccountStatus;
  user: UserInfo | null;
  sessionError: string | null;
  splits: RemoteResource<SplitResponse[]>;
  workoutRanges: Record<string, RemoteResource<WorkoutLogResponse[]>>;
  workoutOverview: RemoteResource<WorkoutOverviewPoint[]>;
  workoutSummaries: RemoteResource<WorkoutSummaryListResponse>;
  workoutDetails: Record<string, RemoteResource<WorkoutLogResponse | null>>;
  workoutProgress: Record<string, RemoteResource<WorkoutProgressWorkout[]>>;
  recentStimulus: RemoteResource<AnalysisResponse | null>;
  analysisPreferences: AnalysisPreferences;
  analysisPreferencesReady: boolean;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<string | null>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (accessToken: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  ensureSplits: () => Promise<void>;
  refreshSplits: () => Promise<void>;
  replaceSplit: (splitId: string, split: SplitCreate) => Promise<SplitResponse>;
  saveSplitSession: (
    splitId: string,
    sessionId: string | null,
    session: SessionCreate
  ) => Promise<SplitResponse>;
  ensureWorkouts: (days?: number) => Promise<void>;
  refreshWorkouts: (days?: number) => Promise<void>;
  ensureWorkoutOverview: () => Promise<void>;
  refreshWorkoutOverview: () => Promise<void>;
  ensureWorkoutSummaries: () => Promise<void>;
  refreshWorkoutSummaries: () => Promise<void>;
  loadMoreWorkoutSummaries: () => Promise<void>;
  ensureWorkoutDetail: (workoutId: string) => Promise<void>;
  ensureWorkoutProgress: (exerciseName: string, days?: number) => Promise<void>;
  refreshWorkoutProgress: (exerciseName: string, days?: number) => Promise<void>;
  refreshStimulus: () => Promise<void>;
  updateAnalysisPreferences: (update: Partial<AnalysisPreferences>) => Promise<void>;
}

function emptyResource<T>(data: T): RemoteResource<T> {
  return { data, loading: false, loaded: false, error: null, fetchedAt: null };
}

const EMPTY_SPLITS = emptyResource<SplitResponse[]>([]);
const EMPTY_STIMULUS = emptyResource<AnalysisResponse | null>(null);
const EMPTY_OVERVIEW = emptyResource<WorkoutOverviewPoint[]>([]);
const EMPTY_SUMMARIES = emptyResource<WorkoutSummaryListResponse>({ workouts: [], total: 0 });

export function emptyWorkoutResource(): RemoteResource<WorkoutLogResponse[]> {
  return emptyResource<WorkoutLogResponse[]>([]);
}

export function emptyProgressResource(): RemoteResource<WorkoutProgressWorkout[]> {
  return emptyResource<WorkoutProgressWorkout[]>([]);
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

function isFresh(resource: RemoteResource<unknown>): boolean {
  return Boolean(
    resource.loaded &&
      resource.fetchedAt !== null &&
      Date.now() - resource.fetchedAt < RESOURCE_TTL_MS
  );
}

function filterWorkoutRange(workouts: WorkoutLogResponse[], days: number): WorkoutLogResponse[] {
  const cutoff = Date.now() - days * 86_400_000;
  return workouts.filter((workout) => new Date(workout.completed_at).getTime() >= cutoff);
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
  const [workoutOverview, setWorkoutOverview] = useState(EMPTY_OVERVIEW);
  const [workoutSummaries, setWorkoutSummaries] = useState(EMPTY_SUMMARIES);
  const [workoutDetails, setWorkoutDetails] = useState<
    Record<string, RemoteResource<WorkoutLogResponse | null>>
  >({});
  const [workoutProgress, setWorkoutProgress] = useState<
    Record<string, RemoteResource<WorkoutProgressWorkout[]>>
  >({});
  const [recentStimulus, setRecentStimulus] = useState(EMPTY_STIMULUS);
  const [analysisPreferences, setAnalysisPreferences] = useState(
    DEFAULT_ANALYSIS_PREFERENCES
  );
  const [analysisPreferencesReady, setAnalysisPreferencesReady] = useState(false);

  const splitRef = useRef(splitResource);
  const rangesRef = useRef(workoutRanges);
  const overviewRef = useRef(workoutOverview);
  const summariesRef = useRef(workoutSummaries);
  const detailsRef = useRef(workoutDetails);
  const progressRef = useRef(workoutProgress);
  const stimulusRef = useRef(recentStimulus);
  splitRef.current = splitResource;
  rangesRef.current = workoutRanges;
  overviewRef.current = workoutOverview;
  summariesRef.current = workoutSummaries;
  detailsRef.current = workoutDetails;
  progressRef.current = workoutProgress;
  stimulusRef.current = recentStimulus;

  const generationRef = useRef(0);
  const splitInFlight = useRef<Promise<void> | null>(null);
  const workoutInFlight = useRef(new Map<string, Promise<void>>());
  const overviewInFlight = useRef<Promise<void> | null>(null);
  const summariesInFlight = useRef<Promise<void> | null>(null);
  const detailsInFlight = useRef(new Map<string, Promise<void>>());
  const progressInFlight = useRef(new Map<string, Promise<void>>());
  const stimulusInFlight = useRef<Promise<void> | null>(null);
  const stimulusRequestRef = useRef(0);

  const clearRemoteData = useCallback(() => {
    generationRef.current += 1;
    splitInFlight.current = null;
    workoutInFlight.current.clear();
    overviewInFlight.current = null;
    summariesInFlight.current = null;
    detailsInFlight.current.clear();
    progressInFlight.current.clear();
    stimulusInFlight.current = null;
    clearSplitAnalysisCache();
    setSplitResource(EMPTY_SPLITS);
    setWorkoutRanges({});
    setWorkoutOverview(EMPTY_OVERVIEW);
    setWorkoutSummaries(EMPTY_SUMMARIES);
    setWorkoutDetails({});
    setWorkoutProgress({});
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
      if (isSignedOutError(error)) return markSignedOut();
      setUser(null);
      setStatus('error');
      setSessionError(
        authErrorMessageForDisplay(error, 'Could not connect to your account. Try again.')
      );
      clearRemoteData();
    }
  }, [clearRemoteData, markSignedOut]);

  const loadSplits = useCallback(
    (force: boolean): Promise<void> => {
      if (!force && isFresh(splitRef.current)) return Promise.resolve();
      if (splitInFlight.current) return splitInFlight.current;
      const generation = generationRef.current;
      setSplitResource((previous) => ({ ...previous, loading: true, error: null }));
      const promise = splitsApi
        .list(true)
        .then((response) => {
          if (generation !== generationRef.current) return;
          setSplitResource({
            data: response.splits,
            loading: false,
            loaded: true,
            error: null,
            fetchedAt: Date.now(),
          });
        })
        .catch((error) => {
          if (generation !== generationRef.current) return;
          if (isSignedOutError(error)) return markSignedOut();
          setSplitResource((previous) => ({
            ...previous,
            loading: false,
            loaded: true,
            error: messageFromError(error),
          }));
        })
        .finally(() => {
          if (splitInFlight.current === promise) splitInFlight.current = null;
        });
      splitInFlight.current = promise;
      return promise;
    },
    [markSignedOut]
  );
  const ensureSplits = useCallback(() => loadSplits(false), [loadSplits]);
  const refreshSplits = useCallback(() => loadSplits(true), [loadSplits]);

  const reusableWorkoutRange = useCallback((days?: number) => {
    if (days === undefined) return null;
    const candidates = Object.entries(rangesRef.current)
      .filter(([key, resource]) => {
        if (!isFresh(resource)) return false;
        return key === 'all' || Number(key) >= days;
      })
      .sort(([left], [right]) => {
        if (left === 'all') return 1;
        if (right === 'all') return -1;
        return Number(left) - Number(right);
      });
    return candidates[0]?.[1] ?? null;
  }, []);

  const loadWorkouts = useCallback(
    (days: number | undefined, force: boolean): Promise<void> => {
      const key = workoutRangeKey(days);
      const existing = rangesRef.current[key];
      if (!force && existing && isFresh(existing)) return Promise.resolve();
      if (!force && days !== undefined) {
        const reusable = reusableWorkoutRange(days);
        if (reusable) {
          const derived = {
            data: filterWorkoutRange(reusable.data, days),
            loading: false,
            loaded: true,
            error: null,
            fetchedAt: reusable.fetchedAt,
          };
          setWorkoutRanges((previous) => ({ ...previous, [key]: derived }));
          return Promise.resolve();
        }
      }
      const active = workoutInFlight.current.get(key);
      if (active) return active;
      const generation = generationRef.current;
      setWorkoutRanges((previous) => ({
        ...previous,
        [key]: { ...(previous[key] ?? emptyWorkoutResource()), loading: true, error: null },
      }));
      const promise = loadAllWorkouts(days)
        .then((data) => {
          if (generation !== generationRef.current) return;
          setWorkoutRanges((previous) => ({
            ...previous,
            [key]: {
              data,
              loading: false,
              loaded: true,
              error: null,
              fetchedAt: Date.now(),
            },
          }));
        })
        .catch((error) => {
          if (generation !== generationRef.current) return;
          if (isSignedOutError(error)) return markSignedOut();
          setWorkoutRanges((previous) => ({
            ...previous,
            [key]: {
              ...(previous[key] ?? emptyWorkoutResource()),
              loading: false,
              loaded: true,
              error: messageFromError(error),
            },
          }));
        })
        .finally(() => workoutInFlight.current.delete(key));
      workoutInFlight.current.set(key, promise);
      return promise;
    },
    [markSignedOut, reusableWorkoutRange]
  );
  const ensureWorkouts = useCallback((days?: number) => loadWorkouts(days, false), [loadWorkouts]);
  const refreshWorkouts = useCallback((days?: number) => loadWorkouts(days, true), [loadWorkouts]);

  const loadOverview = useCallback(
    (force: boolean): Promise<void> => {
      if (!force && isFresh(overviewRef.current)) return Promise.resolve();
      if (overviewInFlight.current) return overviewInFlight.current;
      const generation = generationRef.current;
      setWorkoutOverview((previous) => ({ ...previous, loading: true, error: null }));
      const promise = workoutsApi
        .overview(180)
        .then((response) => {
          if (generation !== generationRef.current) return;
          setWorkoutOverview({
            data: response.workouts,
            loading: false,
            loaded: true,
            error: null,
            fetchedAt: Date.now(),
          });
        })
        .catch((error) => {
          if (generation !== generationRef.current) return;
          if (isSignedOutError(error)) return markSignedOut();
          setWorkoutOverview((previous) => ({
            ...previous,
            loading: false,
            loaded: true,
            error: messageFromError(error),
          }));
        })
        .finally(() => {
          if (overviewInFlight.current === promise) overviewInFlight.current = null;
        });
      overviewInFlight.current = promise;
      return promise;
    },
    [markSignedOut]
  );
  const ensureWorkoutOverview = useCallback(() => loadOverview(false), [loadOverview]);
  const refreshWorkoutOverview = useCallback(() => loadOverview(true), [loadOverview]);

  const loadSummaries = useCallback(
    (force: boolean, append: boolean): Promise<void> => {
      const current = summariesRef.current;
      if (!force && !append && isFresh(current)) return Promise.resolve();
      if (append && current.data.workouts.length >= current.data.total) return Promise.resolve();
      if (summariesInFlight.current) return summariesInFlight.current;
      const generation = generationRef.current;
      const offset = append ? current.data.workouts.length : 0;
      setWorkoutSummaries((previous) => ({ ...previous, loading: true, error: null }));
      const promise = workoutsApi
        .summaries({ limit: 50, offset })
        .then((response) => {
          if (generation !== generationRef.current) return;
          setWorkoutSummaries((previous) => ({
            data: {
              workouts: append
                ? [...previous.data.workouts, ...response.workouts]
                : response.workouts,
              total: response.total,
            },
            loading: false,
            loaded: true,
            error: null,
            fetchedAt: Date.now(),
          }));
        })
        .catch((error) => {
          if (generation !== generationRef.current) return;
          if (isSignedOutError(error)) return markSignedOut();
          setWorkoutSummaries((previous) => ({
            ...previous,
            loading: false,
            loaded: true,
            error: messageFromError(error),
          }));
        })
        .finally(() => {
          if (summariesInFlight.current === promise) summariesInFlight.current = null;
        });
      summariesInFlight.current = promise;
      return promise;
    },
    [markSignedOut]
  );
  const ensureWorkoutSummaries = useCallback(() => loadSummaries(false, false), [loadSummaries]);
  const refreshWorkoutSummaries = useCallback(() => loadSummaries(true, false), [loadSummaries]);
  const loadMoreWorkoutSummaries = useCallback(() => loadSummaries(false, true), [loadSummaries]);

  const ensureWorkoutDetail = useCallback(
    (workoutId: string): Promise<void> => {
      const existing = detailsRef.current[workoutId];
      // Expanded workout payloads are immutable history records; retain them
      // for the authenticated session instead of refetching after the tab TTL.
      if (existing?.loaded && existing.data) return Promise.resolve();
      const active = detailsInFlight.current.get(workoutId);
      if (active) return active;
      const generation = generationRef.current;
      setWorkoutDetails((previous) => ({
        ...previous,
        [workoutId]: {
          ...(previous[workoutId] ?? emptyResource<WorkoutLogResponse | null>(null)),
          loading: true,
          error: null,
        },
      }));
      const promise = workoutsApi
        .get(workoutId)
        .then((data) => {
          if (generation !== generationRef.current) return;
          setWorkoutDetails((previous) => ({
            ...previous,
            [workoutId]: {
              data,
              loading: false,
              loaded: true,
              error: null,
              fetchedAt: Date.now(),
            },
          }));
        })
        .catch((error) => {
          if (generation !== generationRef.current) return;
          if (isSignedOutError(error)) return markSignedOut();
          setWorkoutDetails((previous) => ({
            ...previous,
            [workoutId]: {
              ...(previous[workoutId] ?? emptyResource<WorkoutLogResponse | null>(null)),
              loading: false,
              loaded: true,
              error: messageFromError(error),
            },
          }));
        })
        .finally(() => detailsInFlight.current.delete(workoutId));
      detailsInFlight.current.set(workoutId, promise);
      return promise;
    },
    [markSignedOut]
  );

  const loadProgress = useCallback(
    (exerciseName: string, days: number | undefined, force: boolean): Promise<void> => {
      const key = workoutProgressKey(exerciseName, days);
      const existing = progressRef.current[key];
      if (!force && existing && isFresh(existing)) return Promise.resolve();
      const active = progressInFlight.current.get(key);
      if (active) return active;
      const generation = generationRef.current;
      setWorkoutProgress((previous) => ({
        ...previous,
        [key]: { ...(previous[key] ?? emptyProgressResource()), loading: true, error: null },
      }));
      const promise = loadAllWorkoutProgress(exerciseName, days)
        .then((data) => {
          if (generation !== generationRef.current) return;
          setWorkoutProgress((previous) => ({
            ...previous,
            [key]: {
              data,
              loading: false,
              loaded: true,
              error: null,
              fetchedAt: Date.now(),
            },
          }));
        })
        .catch((error) => {
          if (generation !== generationRef.current) return;
          if (isSignedOutError(error)) return markSignedOut();
          setWorkoutProgress((previous) => ({
            ...previous,
            [key]: {
              ...(previous[key] ?? emptyProgressResource()),
              loading: false,
              loaded: true,
              error: messageFromError(error),
            },
          }));
        })
        .finally(() => progressInFlight.current.delete(key));
      progressInFlight.current.set(key, promise);
      return promise;
    },
    [markSignedOut]
  );
  const ensureWorkoutProgress = useCallback(
    (exerciseName: string, days?: number) => loadProgress(exerciseName, days, false),
    [loadProgress]
  );
  const refreshWorkoutProgress = useCallback(
    (exerciseName: string, days?: number) => loadProgress(exerciseName, days, true),
    [loadProgress]
  );

  const loadStimulus = useCallback(
    (force: boolean): Promise<void> => {
      if (!force && isFresh(stimulusRef.current)) return Promise.resolve();
      if (stimulusInFlight.current) return stimulusInFlight.current;
      const generation = generationRef.current;
      const requestId = ++stimulusRequestRef.current;
      setRecentStimulus((previous) => ({ ...previous, loading: true, error: null }));
      const promise = analysis
        .analyzeWorkouts({
          days: 7,
          end_date: localDateKey(new Date()),
          timezone_offset_minutes: new Date().getTimezoneOffset(),
          stimulus_duration: analysisPreferences.stimulusDuration,
          maintenance_volume: analysisPreferences.maintenanceVolume,
          dataset: analysisPreferences.dataset,
        })
        .then((data) => {
          if (generation !== generationRef.current || requestId !== stimulusRequestRef.current) return;
          setRecentStimulus({
            data,
            loading: false,
            loaded: true,
            error: null,
            fetchedAt: Date.now(),
          });
        })
        .catch((error) => {
          if (generation !== generationRef.current || requestId !== stimulusRequestRef.current) return;
          if (isSignedOutError(error)) return markSignedOut();
          setRecentStimulus((previous) => ({
            ...previous,
            loading: false,
            loaded: true,
            error: messageFromError(error),
          }));
        })
        .finally(() => {
          if (stimulusInFlight.current === promise) stimulusInFlight.current = null;
        });
      stimulusInFlight.current = promise;
      return promise;
    },
    [analysisPreferences, markSignedOut]
  );
  const ensureStimulus = useCallback(() => loadStimulus(false), [loadStimulus]);
  const refreshStimulus = useCallback(() => loadStimulus(true), [loadStimulus]);

  const replaceSplit = useCallback(
    async (splitId: string, split: SplitCreate) => {
      try {
        const saved = await splitsApi.replace(splitId, split);
        clearSplitAnalysisCache();
        setSplitResource((previous) => ({
          data: previous.data.map((candidate) => (candidate.id === splitId ? saved : candidate)),
          loading: false,
          loaded: true,
          error: null,
          fetchedAt: Date.now(),
        }));
        return saved;
      } catch (error) {
        if (isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [markSignedOut]
  );

  const saveSplitSession = useCallback(
    async (splitId: string, sessionId: string | null, session: SessionCreate) => {
      try {
        const savedSession = sessionId
          ? await splitsApi.updateSession(splitId, sessionId, session)
          : await splitsApi.createSession(splitId, session);
        const currentSplit = splitRef.current.data.find((candidate) => candidate.id === splitId);
        if (!currentSplit) throw new Error('Saved split is no longer loaded. Refresh and retry.');
        const sessions = sessionId
          ? currentSplit.sessions.map((candidate) =>
              candidate.id === sessionId ? savedSession : candidate
            )
          : [...currentSplit.sessions, savedSession];
        const patched = {
          ...currentSplit,
          sessions: sessions.sort((left, right) => left.day_number - right.day_number),
        };
        clearSplitAnalysisCache();
        setSplitResource((previous) => ({
          data: previous.data.map((candidate) => (candidate.id === splitId ? patched : candidate)),
          loading: false,
          loaded: true,
          error: null,
          fetchedAt: Date.now(),
        }));
        return patched;
      } catch (error) {
        if (isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [markSignedOut]
  );

  const updateAnalysisPreferences = useCallback(
    async (update: Partial<AnalysisPreferences>) => {
      if (!user?.id) throw new Error('Sign in before changing analysis defaults.');
      const next = normalizeAnalysisPreferences({ ...analysisPreferences, ...update });
      setAnalysisPreferences(next);
      setRecentStimulus(EMPTY_STIMULUS);
      stimulusRef.current = EMPTY_STIMULUS;
      await saveAnalysisPreferences(user.id, next);
    },
    [analysisPreferences, user?.id]
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
      setSessionError(authErrorMessageForDisplay(error, 'Could not sign in. Try again.'));
      throw error;
    }
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setStatus('checking');
    setSessionError(null);
    try {
      const response = await auth.signup(email, password);
      if (response.email_confirmation_required) {
        markSignedOut();
        return 'Check your email to confirm your account, then sign in.';
      }
      setUser(response.user);
      setStatus('authenticated');
      return null;
    } catch (error) {
      setStatus('signedOut');
      setUser(null);
      setSessionError(authErrorMessageForDisplay(error, 'Could not create account. Try again.'));
      throw error;
    }
  }, [markSignedOut]);

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
      setSessionError('Signed out on this device, but the server could not be reached to revoke the session.');
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
    if (status === 'authenticated') ensureSplits();
  }, [status, ensureSplits]);

  useEffect(() => {
    if (status === 'authenticated' && analysisPreferencesReady) ensureStimulus();
  }, [status, analysisPreferencesReady, ensureStimulus]);

  const value = useMemo<AccountState>(
    () => ({
      status,
      user,
      sessionError,
      splits: splitResource,
      workoutRanges,
      workoutOverview,
      workoutSummaries,
      workoutDetails,
      workoutProgress,
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
      ensureSplits,
      refreshSplits,
      replaceSplit,
      saveSplitSession,
      ensureWorkouts,
      refreshWorkouts,
      ensureWorkoutOverview,
      refreshWorkoutOverview,
      ensureWorkoutSummaries,
      refreshWorkoutSummaries,
      loadMoreWorkoutSummaries,
      ensureWorkoutDetail,
      ensureWorkoutProgress,
      refreshWorkoutProgress,
      refreshStimulus,
      updateAnalysisPreferences,
    }),
    [
      status,
      user,
      sessionError,
      splitResource,
      workoutRanges,
      workoutOverview,
      workoutSummaries,
      workoutDetails,
      workoutProgress,
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
      ensureSplits,
      refreshSplits,
      replaceSplit,
      saveSplitSession,
      ensureWorkouts,
      refreshWorkouts,
      ensureWorkoutOverview,
      refreshWorkoutOverview,
      ensureWorkoutSummaries,
      refreshWorkoutSummaries,
      loadMoreWorkoutSummaries,
      ensureWorkoutDetail,
      ensureWorkoutProgress,
      refreshWorkoutProgress,
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
