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
  AppState as NativeAppState,
  InteractionManager,
  Platform,
} from 'react-native';
import {
  BackendError,
  AnalysisResponse,
  AuthIdentity,
  SessionCreate,
  SessionTemplateCreate,
  SessionTemplateResponse,
  SessionTemplateUpdate,
  SocialProvider,
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
  sessionTemplates as sessionTemplatesApi,
  splits as splitsApi,
  workouts as workoutsApi,
} from '../api/backend';
import {
  type AuthReturnScreen,
  SocialAuthError,
  appleProviderEnabled,
  cleanWebAuthUrl,
  clearTemporaryOAuthCredentials,
  completePendingWebAuth,
  completeIdentityLink,
  isSocialAuthCancellation,
  socialSessionForProvider,
} from '../auth/socialAuth';
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
  HomeAnalysisCacheParams,
  clearPersistedAccountData,
  loadActiveSplitId,
  loadAnalysisPreferences,
  loadPersistedHomeAnalysis,
  loadPersistedHomeSplits,
  normalizeAnalysisPreferences,
  saveActiveSplitId,
  saveAnalysisPreferences,
  savePersistedHomeAnalysis,
  savePersistedHomeSplits,
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
  appleProviderEnabled: boolean;
  authReturnScreen: AuthReturnScreen | null;
  clearAuthReturnScreen: () => void;
  identities: RemoteResource<AuthIdentity[]>;
  splits: RemoteResource<SplitResponse[]>;
  workoutTemplates: RemoteResource<SessionTemplateResponse[]>;
  workoutRanges: Record<string, RemoteResource<WorkoutLogResponse[]>>;
  workoutOverview: RemoteResource<WorkoutOverviewPoint[]>;
  workoutSummaries: RemoteResource<WorkoutSummaryListResponse>;
  workoutDetails: Record<string, RemoteResource<WorkoutLogResponse | null>>;
  workoutProgress: Record<string, RemoteResource<WorkoutProgressWorkout[]>>;
  recentStimulus: RemoteResource<AnalysisResponse | null>;
  analysisPreferences: AnalysisPreferences;
  analysisPreferencesReady: boolean;
  /** Per-device: the split driving the home-screen streak and quick start. */
  activeSplitId: string | null;
  setActiveSplit: (splitId: string | null) => void;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<string | null>;
  signInWithProvider: (provider: SocialProvider) => Promise<void>;
  refreshIdentities: () => Promise<void>;
  linkIdentity: (provider: SocialProvider) => Promise<void>;
  unlinkIdentity: (provider: SocialProvider) => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (accessToken: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  ensureSplits: () => Promise<void>;
  refreshSplits: () => Promise<void>;
  createSplit: (split: SplitCreate) => Promise<SplitResponse>;
  replaceSplit: (splitId: string, split: SplitCreate) => Promise<SplitResponse>;
  deleteSplit: (splitId: string) => Promise<void>;
  deleteWorkout: (workoutId: string) => Promise<void>;
  saveSplitSession: (
    splitId: string,
    sessionId: string | null,
    session: SessionCreate
  ) => Promise<SplitResponse>;
  deleteSplitSession: (splitId: string, sessionId: string) => Promise<SplitResponse>;
  ensureWorkoutTemplates: () => Promise<void>;
  refreshWorkoutTemplates: () => Promise<void>;
  createWorkoutTemplate: (template: SessionTemplateCreate) => Promise<SessionTemplateResponse>;
  updateWorkoutTemplate: (
    templateId: string,
    template: SessionTemplateUpdate
  ) => Promise<SessionTemplateResponse>;
  deleteWorkoutTemplate: (templateId: string) => Promise<void>;
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
const EMPTY_WORKOUT_TEMPLATES = emptyResource<SessionTemplateResponse[]>([]);
const EMPTY_STIMULUS = emptyResource<AnalysisResponse | null>(null);
const EMPTY_OVERVIEW = emptyResource<WorkoutOverviewPoint[]>([]);
const EMPTY_SUMMARIES = emptyResource<WorkoutSummaryListResponse>({ workouts: [], total: 0 });
const EMPTY_IDENTITIES = emptyResource<AuthIdentity[]>([]);

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

function currentHomeAnalysisParams(
  preferences: AnalysisPreferences
): HomeAnalysisCacheParams {
  return {
    ...preferences,
    days: 7,
    endDate: localDateKey(new Date()),
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  };
}

/** Let the authenticated Home shell commit before starting network/analysis work. */
function runAfterFirstPaint(task: () => void): () => void {
  let interaction: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
  const frame = requestAnimationFrame(() => {
    interaction = InteractionManager.runAfterInteractions(task);
  });
  return () => {
    cancelAnimationFrame(frame);
    interaction?.cancel();
  };
}

const AccountStateContext = createContext<AccountState | null>(null);

export function AccountStateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>(
    backendConfigured() ? 'checking' : 'unconfigured'
  );
  const [user, setUser] = useState<UserInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [appleEnabled, setAppleEnabled] = useState(false);
  const [authReturnScreen, setAuthReturnScreen] = useState<AuthReturnScreen | null>(null);
  const [identityResource, setIdentityResource] = useState(EMPTY_IDENTITIES);
  const [splitResource, setSplitResource] = useState(EMPTY_SPLITS);
  const [workoutTemplateResource, setWorkoutTemplateResource] = useState(
    EMPTY_WORKOUT_TEMPLATES
  );
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
  const [activeSplitId, setActiveSplitId] = useState<string | null>(null);

  const splitRef = useRef(splitResource);
  const workoutTemplatesRef = useRef(workoutTemplateResource);
  const rangesRef = useRef(workoutRanges);
  const overviewRef = useRef(workoutOverview);
  const summariesRef = useRef(workoutSummaries);
  const detailsRef = useRef(workoutDetails);
  const progressRef = useRef(workoutProgress);
  const stimulusRef = useRef(recentStimulus);
  const identitiesRef = useRef(identityResource);
  splitRef.current = splitResource;
  workoutTemplatesRef.current = workoutTemplateResource;
  rangesRef.current = workoutRanges;
  overviewRef.current = workoutOverview;
  summariesRef.current = workoutSummaries;
  detailsRef.current = workoutDetails;
  progressRef.current = workoutProgress;
  stimulusRef.current = recentStimulus;
  identitiesRef.current = identityResource;

  const generationRef = useRef(0);
  const splitInFlight = useRef<Promise<void> | null>(null);
  const workoutTemplatesInFlight = useRef<Promise<void> | null>(null);
  const workoutInFlight = useRef(new Map<string, Promise<void>>());
  const overviewInFlight = useRef<Promise<void> | null>(null);
  const summariesInFlight = useRef<Promise<void> | null>(null);
  const detailsInFlight = useRef(new Map<string, Promise<void>>());
  const progressInFlight = useRef(new Map<string, Promise<void>>());
  const stimulusInFlight = useRef<Promise<void> | null>(null);
  const identitiesInFlight = useRef<Promise<void> | null>(null);
  const stimulusRequestRef = useRef(0);
  const deletedWorkoutIdsRef = useRef(new Set<string>());

  const clearRemoteData = useCallback(() => {
    generationRef.current += 1;
    splitInFlight.current = null;
    workoutTemplatesInFlight.current = null;
    workoutInFlight.current.clear();
    overviewInFlight.current = null;
    summariesInFlight.current = null;
    detailsInFlight.current.clear();
    progressInFlight.current.clear();
    stimulusInFlight.current = null;
    identitiesInFlight.current = null;
    deletedWorkoutIdsRef.current.clear();
    clearSplitAnalysisCache();
    setSplitResource(EMPTY_SPLITS);
    setWorkoutTemplateResource(EMPTY_WORKOUT_TEMPLATES);
    setWorkoutRanges({});
    setWorkoutOverview(EMPTY_OVERVIEW);
    setWorkoutSummaries(EMPTY_SUMMARIES);
    setWorkoutDetails({});
    setWorkoutProgress({});
    setRecentStimulus(EMPTY_STIMULUS);
    setIdentityResource(EMPTY_IDENTITIES);
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
      setStatus('error');
      setSessionError(
        authErrorMessageForDisplay(error, 'Could not connect to your account. Try again.')
      );
    }
  }, [clearRemoteData, markSignedOut]);

  const loadIdentities = useCallback(
    (force: boolean): Promise<void> => {
      if (!force && isFresh(identitiesRef.current)) return Promise.resolve();
      if (identitiesInFlight.current) return identitiesInFlight.current;
      const generation = generationRef.current;
      setIdentityResource((previous) => ({ ...previous, loading: true, error: null }));
      const promise = auth
        .identities()
        .then((response) => {
          if (generation !== generationRef.current) return;
          setIdentityResource({
            data: response.identities,
            loading: false,
            loaded: true,
            error: null,
            fetchedAt: Date.now(),
          });
        })
        .catch((error) => {
          if (generation !== generationRef.current) return;
          if (isSignedOutError(error)) return markSignedOut();
          setIdentityResource((previous) => ({
            ...previous,
            loading: false,
            loaded: true,
            error: authErrorMessageForDisplay(
              error,
              'Could not load your connected accounts. Please try again.'
            ),
          }));
        })
        .finally(() => {
          if (identitiesInFlight.current === promise) identitiesInFlight.current = null;
        });
      identitiesInFlight.current = promise;
      return promise;
    },
    [markSignedOut]
  );
  const refreshIdentities = useCallback(() => loadIdentities(true), [loadIdentities]);

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
          if (user?.id) void savePersistedHomeSplits(user.id, response.splits).catch(() => {});
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
    [markSignedOut, user?.id]
  );
  const ensureSplits = useCallback(() => loadSplits(false), [loadSplits]);
  const refreshSplits = useCallback(() => loadSplits(true), [loadSplits]);

  const loadWorkoutTemplates = useCallback(
    (force: boolean): Promise<void> => {
      if (!force && isFresh(workoutTemplatesRef.current)) return Promise.resolve();
      if (workoutTemplatesInFlight.current) return workoutTemplatesInFlight.current;
      const generation = generationRef.current;
      setWorkoutTemplateResource((previous) => ({ ...previous, loading: true, error: null }));
      const promise = sessionTemplatesApi
        .list()
        .then((response) => {
          if (generation !== generationRef.current) return;
          setWorkoutTemplateResource({
            data: response.templates,
            loading: false,
            loaded: true,
            error: null,
            fetchedAt: Date.now(),
          });
        })
        .catch((error) => {
          if (generation !== generationRef.current) return;
          if (isSignedOutError(error)) return markSignedOut();
          setWorkoutTemplateResource((previous) => ({
            ...previous,
            loading: false,
            loaded: true,
            error: messageFromError(error),
          }));
        })
        .finally(() => {
          if (workoutTemplatesInFlight.current === promise) {
            workoutTemplatesInFlight.current = null;
          }
        });
      workoutTemplatesInFlight.current = promise;
      return promise;
    },
    [markSignedOut]
  );
  const ensureWorkoutTemplates = useCallback(
    () => loadWorkoutTemplates(false),
    [loadWorkoutTemplates]
  );
  const refreshWorkoutTemplates = useCallback(
    () => loadWorkoutTemplates(true),
    [loadWorkoutTemplates]
  );

  // Unlike the interactive mutations above, template saves can resolve after a
  // logout/account switch (the wizard fires one without awaiting), so they
  // check the generation before touching the cache.
  const createWorkoutTemplate = useCallback(
    async (template: SessionTemplateCreate) => {
      const generation = generationRef.current;
      try {
        const saved = await sessionTemplatesApi.create(template);
        if (generation !== generationRef.current) return saved;
        setWorkoutTemplateResource((previous) => ({
          data: [saved, ...previous.data.filter((candidate) => candidate.id !== saved.id)],
          loading: false,
          loaded: true,
          error: null,
          fetchedAt: Date.now(),
        }));
        return saved;
      } catch (error) {
        if (generation === generationRef.current && isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [markSignedOut]
  );

  const updateWorkoutTemplate = useCallback(
    async (templateId: string, template: SessionTemplateUpdate) => {
      const generation = generationRef.current;
      try {
        const saved = await sessionTemplatesApi.update(templateId, template);
        if (generation !== generationRef.current) return saved;
        setWorkoutTemplateResource((previous) => ({
          data: previous.data.map((candidate) =>
            candidate.id === templateId ? saved : candidate
          ),
          loading: false,
          loaded: true,
          error: null,
          fetchedAt: Date.now(),
        }));
        return saved;
      } catch (error) {
        if (generation === generationRef.current && isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [markSignedOut]
  );

  const deleteWorkoutTemplate = useCallback(
    async (templateId: string) => {
      const generation = generationRef.current;
      try {
        await sessionTemplatesApi.remove(templateId);
        if (generation !== generationRef.current) return;
        setWorkoutTemplateResource((previous) => ({
          data: previous.data.filter((candidate) => candidate.id !== templateId),
          loading: false,
          loaded: true,
          error: null,
          fetchedAt: Date.now(),
        }));
      } catch (error) {
        if (generation === generationRef.current && isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [markSignedOut]
  );

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
          const visibleData = data.filter(
            (workout) => !deletedWorkoutIdsRef.current.has(workout.id)
          );
          setWorkoutRanges((previous) => ({
            ...previous,
            [key]: {
              data: visibleData,
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
          const visibleWorkouts = response.workouts.filter(
            (workout) => !deletedWorkoutIdsRef.current.has(workout.id)
          );
          setWorkoutOverview({
            data: visibleWorkouts,
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
          const visibleWorkouts = response.workouts.filter(
            (workout) => !deletedWorkoutIdsRef.current.has(workout.id)
          );
          const filteredCount = response.workouts.length - visibleWorkouts.length;
          setWorkoutSummaries((previous) => {
            const workouts = append
                ? [...previous.data.workouts, ...visibleWorkouts]
                : visibleWorkouts;
            return {
              data: {
                workouts,
                total: Math.max(workouts.length, response.total - filteredCount),
              },
              loading: false,
              loaded: true,
              error: null,
              fetchedAt: Date.now(),
            };
          });
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
      if (deletedWorkoutIdsRef.current.has(workoutId)) return Promise.resolve();
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
          if (
            generation !== generationRef.current ||
            deletedWorkoutIdsRef.current.has(workoutId)
          ) return;
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
          if (
            generation !== generationRef.current ||
            deletedWorkoutIdsRef.current.has(workoutId)
          ) return;
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
          const visibleData = data.filter(
            (workout) => !deletedWorkoutIdsRef.current.has(workout.id)
          );
          setWorkoutProgress((previous) => ({
            ...previous,
            [key]: {
              data: visibleData,
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
      const cacheParams = currentHomeAnalysisParams(analysisPreferences);
      const promise = analysis
        .analyzeWorkouts({
          days: cacheParams.days,
          end_date: cacheParams.endDate,
          timezone_offset_minutes: cacheParams.timezoneOffsetMinutes,
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
          if (user?.id) {
            void savePersistedHomeAnalysis(user.id, cacheParams, data).catch(() => {});
          }
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
    [analysisPreferences, markSignedOut, user?.id]
  );
  const refreshStimulus = useCallback(() => loadStimulus(true), [loadStimulus]);

  const createSplit = useCallback(
    async (split: SplitCreate) => {
      try {
        const saved = await splitsApi.create(split);
        clearSplitAnalysisCache();
        setSplitResource((previous) => ({
          data: [saved, ...previous.data.filter((candidate) => candidate.id !== saved.id)],
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

  const setActiveSplit = useCallback(
    (splitId: string | null) => {
      setActiveSplitId(splitId);
      if (user?.id) void saveActiveSplitId(user.id, splitId).catch(() => {});
    },
    [user?.id]
  );

  const deleteSplit = useCallback(
    async (splitId: string) => {
      try {
        await splitsApi.remove(splitId);
        setActiveSplitId((previous) => {
          if (previous !== splitId) return previous;
          if (user?.id) void saveActiveSplitId(user.id, null).catch(() => {});
          return null;
        });
        clearSplitAnalysisCache();
        setSplitResource((previous) => ({
          data: previous.data.filter((candidate) => candidate.id !== splitId),
          loading: false,
          loaded: true,
          error: null,
          fetchedAt: Date.now(),
        }));
      } catch (error) {
        if (isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [markSignedOut]
  );

  const deleteWorkout = useCallback(
    async (workoutId: string) => {
      try {
        await workoutsApi.remove(workoutId);
        deletedWorkoutIdsRef.current.add(workoutId);
        detailsInFlight.current.delete(workoutId);
        const fetchedAt = Date.now();

        setWorkoutRanges((previous) => {
          const next = { ...previous };
          for (const [key, resource] of Object.entries(next)) {
            next[key] = {
              ...resource,
              data: resource.data.filter((workout) => workout.id !== workoutId),
              fetchedAt,
            };
          }
          return next;
        });
        setWorkoutOverview((previous) => ({
          ...previous,
          data: previous.data.filter((workout) => workout.id !== workoutId),
          fetchedAt,
        }));
        setWorkoutSummaries((previous) => {
          const containedWorkout = previous.data.workouts.some(
            (workout) => workout.id === workoutId
          );
          return {
            ...previous,
            data: {
              workouts: previous.data.workouts.filter((workout) => workout.id !== workoutId),
              total: containedWorkout
                ? Math.max(0, previous.data.total - 1)
                : previous.data.total,
            },
            fetchedAt,
          };
        });
        setWorkoutDetails((previous) => {
          const next = { ...previous };
          delete next[workoutId];
          return next;
        });
        setWorkoutProgress((previous) => {
          const next = { ...previous };
          for (const [key, resource] of Object.entries(next)) {
            next[key] = {
              ...resource,
              data: resource.data.filter((workout) => workout.id !== workoutId),
              fetchedAt,
            };
          }
          return next;
        });

        // A deleted workout changes the home heatmap immediately. Supersede
        // any analysis request that started before the deletion completed.
        stimulusRequestRef.current += 1;
        stimulusInFlight.current = null;
        stimulusRef.current = EMPTY_STIMULUS;
        setRecentStimulus(EMPTY_STIMULUS);
        void loadStimulus(true);
      } catch (error) {
        if (isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [loadStimulus, markSignedOut]
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

  const deleteSplitSession = useCallback(
    async (splitId: string, sessionId: string) => {
      try {
        const currentSplit = splitRef.current.data.find((candidate) => candidate.id === splitId);
        if (!currentSplit) throw new Error('Saved split is no longer loaded. Refresh and retry.');
        await splitsApi.removeSession(splitId, sessionId);
        const patched = {
          ...currentSplit,
          sessions: currentSplit.sessions.filter((candidate) => candidate.id !== sessionId),
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

  const signInWithProvider = useCallback(async (provider: SocialProvider) => {
    setStatus('checking');
    setSessionError(null);
    let credentialsCreated = false;
    try {
      const socialSession = await socialSessionForProvider(provider);
      // Web continues after a full-page callback. Keep the checking state so a
      // restored page cannot briefly show the signed-out form during redirect.
      if (!socialSession) return;
      credentialsCreated = true;
      const response = await auth.oauthComplete(socialSession);
      setUser(response.user);
      setStatus('authenticated');
    } catch (error) {
      setStatus('signedOut');
      setUser(null);
      if (!isSocialAuthCancellation(error)) {
        setSessionError(authErrorMessageForDisplay(error, 'Could not sign in. Try again.'));
      }
      throw error;
    } finally {
      if (credentialsCreated) await clearTemporaryOAuthCredentials();
    }
  }, []);

  const linkIdentity = useCallback(
    async (provider: SocialProvider) => {
      try {
        const response = await auth.linkIdentity(
          provider,
          Platform.OS === 'web' ? 'web' : 'native'
        );
        await completeIdentityLink(response.url, provider);
        if (Platform.OS === 'web') return;
        await refreshIdentities();
      } catch (error) {
        if (isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [markSignedOut, refreshIdentities]
  );

  const unlinkIdentity = useCallback(
    async (provider: SocialProvider) => {
      try {
        await auth.unlinkIdentity(provider);
        await refreshIdentities();
      } catch (error) {
        if (isSignedOutError(error)) markSignedOut();
        throw error;
      }
    },
    [markSignedOut, refreshIdentities]
  );

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

  const logoutAll = useCallback(async () => {
    const userId = user?.id;
    let logoutError: unknown;
    try {
      await auth.logoutAll();
    } catch (error) {
      logoutError = error;
    }
    if (userId) await clearPersistedAccountData(userId).catch(() => {});
    markSignedOut();
    if (logoutError) {
      setSessionError(
        'Signed out on this device, but other sessions could not be revoked. Try again after signing in.'
      );
    }
  }, [markSignedOut, user?.id]);

  const deleteAccount = useCallback(async () => {
    const userId = user?.id;
    await auth.deleteAccount();
    if (userId) await clearPersistedAccountData(userId).catch(() => {});
    markSignedOut();
  }, [markSignedOut, user?.id]);

  const clearAuthReturnScreen = useCallback(() => setAuthReturnScreen(null), []);

  const bootstrapAuth = useCallback(async () => {
    if (Platform.OS !== 'web') {
      await refreshSession();
      return;
    }

    let handledCallback = false;
    try {
      const result = await completePendingWebAuth();
      if (result.type === 'none') {
        await refreshSession();
        return;
      }
      handledCallback = true;
      cleanWebAuthUrl();
      setAuthReturnScreen(result.returnScreen);

      if (result.type === 'cancelled') {
        if (result.kind === 'oauth') {
          markSignedOut();
        } else {
          const nextUser = await auth.me();
          setUser(nextUser);
          setStatus('authenticated');
        }
        return;
      }

      if (result.type === 'oauth') {
        const response = await auth.oauthComplete(result.session);
        setUser(response.user);
        setSessionError(null);
        setStatus('authenticated');
        return;
      }

      const nextUser = await auth.me();
      const response = await auth.identities();
      const linked = response.identities.some((identity) => identity.provider === result.provider);
      setUser(nextUser);
      setStatus('authenticated');
      setIdentityResource({
        data: response.identities,
        loading: false,
        loaded: true,
        error: linked ? null : 'Could not load your connected accounts. Please try again.',
        fetchedAt: Date.now(),
      });
    } catch (error) {
      handledCallback = true;
      cleanWebAuthUrl();
      const callbackError = error instanceof SocialAuthError ? error : null;
      if (callbackError?.returnScreen) setAuthReturnScreen(callbackError.returnScreen);

      // An identity callback still has the first-party HttpOnly cookie even
      // when the provider rejects or cannot finish the link.
      if (callbackError?.kind === 'identity') {
        try {
          const nextUser = await auth.me();
          setUser(nextUser);
          setStatus('authenticated');
          setIdentityResource((previous) => ({
            ...previous,
            loading: false,
            loaded: true,
            error: 'Could not load your connected accounts. Please try again.',
          }));
          return;
        } catch {
          // Fall through to the normal signed-out recovery below.
        }
      }

      markSignedOut();
      if (!isSocialAuthCancellation(error)) {
        setSessionError('Could not sign in. Try again.');
      }
    } finally {
      if (handledCallback) await clearTemporaryOAuthCredentials();
    }
  }, [markSignedOut, refreshSession]);

  useEffect(() => {
    void bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void bootstrapAuth();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [bootstrapAuth]);

  useEffect(() => {
    let active = true;
    void appleProviderEnabled().then((enabled) => {
      if (active) setAppleEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = NativeAppState.addEventListener('change', (nextState) => {
      // Retain and retry a known account after a transient offline/provider
      // error; only a definitive refresh rejection clears the user/session.
      if (nextState !== 'active' || !user?.id) return;
      auth
        .refreshIfNeeded()
        .then((refreshed) => {
          if (refreshed) return refreshSession();
        })
        .catch((error) => {
          if (isSignedOutError(error)) {
            markSignedOut();
            return;
          }
          setStatus('error');
          setSessionError(
            authErrorMessageForDisplay(error, 'Could not reconnect to your account. Try again.')
          );
        });
    });
    return () => subscription.remove();
  }, [markSignedOut, refreshSession, user?.id]);

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
    let cancelled = false;
    if (!user?.id) {
      setActiveSplitId(null);
      return;
    }
    loadActiveSplitId(user.id)
      .then((splitId) => {
        if (!cancelled) setActiveSplitId(splitId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) return;
    let cancelled = false;
    let cancelRefresh = () => {};
    const generation = generationRef.current;
    loadPersistedHomeSplits<SplitResponse[]>(user.id)
      .then((cached) => {
        if (
          cancelled ||
          generation !== generationRef.current ||
          !cached ||
          !Array.isArray(cached.data)
        ) return;
        setSplitResource({
          data: cached.data,
          loading: false,
          loaded: true,
          error: null,
          fetchedAt: cached.savedAt,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled || generation !== generationRef.current) return;
        cancelRefresh = runAfterFirstPaint(() => void loadSplits(true));
      });
    return () => {
      cancelled = true;
      cancelRefresh();
    };
  }, [status, user?.id, loadSplits]);

  useEffect(() => {
    if (status !== 'authenticated' || !analysisPreferencesReady || !user?.id) return;
    let cancelled = false;
    let cancelRefresh = () => {};
    const generation = generationRef.current;
    const cacheParams = currentHomeAnalysisParams(analysisPreferences);
    loadPersistedHomeAnalysis<AnalysisResponse>(user.id, cacheParams)
      .then((cached) => {
        if (
          cancelled ||
          generation !== generationRef.current ||
          !cached ||
          !cached.data ||
          !Array.isArray(cached.data.muscles)
        ) return;
        setRecentStimulus({
          data: cached.data,
          loading: false,
          loaded: true,
          error: null,
          fetchedAt: cached.savedAt,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled || generation !== generationRef.current) return;
        cancelRefresh = runAfterFirstPaint(() => void loadStimulus(true));
      });
    return () => {
      cancelled = true;
      cancelRefresh();
    };
  }, [
    status,
    user?.id,
    analysisPreferences,
    analysisPreferencesReady,
    loadStimulus,
  ]);

  const value = useMemo<AccountState>(
    () => ({
      status,
      user,
      sessionError,
      appleProviderEnabled: appleEnabled,
      authReturnScreen,
      clearAuthReturnScreen,
      identities: identityResource,
      splits: splitResource,
      workoutTemplates: workoutTemplateResource,
      workoutRanges,
      workoutOverview,
      workoutSummaries,
      workoutDetails,
      workoutProgress,
      recentStimulus,
      analysisPreferences,
      analysisPreferencesReady,
      activeSplitId,
      setActiveSplit,
      refreshSession,
      login,
      signup,
      signInWithProvider,
      refreshIdentities,
      linkIdentity,
      unlinkIdentity,
      forgotPassword,
      resetPassword,
      logout,
      logoutAll,
      deleteAccount,
      ensureSplits,
      refreshSplits,
      createSplit,
      replaceSplit,
      deleteSplit,
      deleteWorkout,
      saveSplitSession,
      deleteSplitSession,
      ensureWorkoutTemplates,
      refreshWorkoutTemplates,
      createWorkoutTemplate,
      updateWorkoutTemplate,
      deleteWorkoutTemplate,
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
      appleEnabled,
      authReturnScreen,
      clearAuthReturnScreen,
      identityResource,
      splitResource,
      workoutTemplateResource,
      workoutRanges,
      workoutOverview,
      workoutSummaries,
      workoutDetails,
      workoutProgress,
      recentStimulus,
      analysisPreferences,
      analysisPreferencesReady,
      activeSplitId,
      setActiveSplit,
      refreshSession,
      login,
      signup,
      signInWithProvider,
      refreshIdentities,
      linkIdentity,
      unlinkIdentity,
      forgotPassword,
      resetPassword,
      logout,
      logoutAll,
      deleteAccount,
      ensureSplits,
      refreshSplits,
      createSplit,
      replaceSplit,
      deleteSplit,
      deleteWorkout,
      saveSplitSession,
      deleteSplitSession,
      ensureWorkoutTemplates,
      refreshWorkoutTemplates,
      createWorkoutTemplate,
      updateWorkoutTemplate,
      deleteWorkoutTemplate,
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
