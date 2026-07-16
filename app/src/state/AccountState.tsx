import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  BackendError,
  SplitCreate,
  SplitResponse,
  UserInfo,
  WorkoutLogResponse,
  auth,
  backendConfigured,
  splits as splitsApi,
} from '../api/backend';
import { loadAllWorkouts, workoutRangeKey } from '../api/accountData';

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
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSplits: () => Promise<void>;
  replaceSplit: (splitId: string, split: SplitCreate) => Promise<SplitResponse>;
  refreshWorkouts: (days?: number) => Promise<void>;
}

const EMPTY_SPLITS: RemoteResource<SplitResponse[]> = {
  data: [],
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

  const clearRemoteData = useCallback(() => {
    setSplitResource(EMPTY_SPLITS);
    setWorkoutRanges({});
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

  const logout = useCallback(async () => {
    await auth.logout();
    markSignedOut();
  }, [markSignedOut]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (status === 'authenticated') refreshSplits();
  }, [status, refreshSplits]);

  const value = useMemo<AccountState>(
    () => ({
      status,
      user,
      sessionError,
      splits: splitResource,
      workoutRanges,
      refreshSession,
      login,
      signup,
      logout,
      refreshSplits,
      replaceSplit,
      refreshWorkouts,
    }),
    [
      status,
      user,
      sessionError,
      splitResource,
      workoutRanges,
      refreshSession,
      login,
      signup,
      logout,
      refreshSplits,
      replaceSplit,
      refreshWorkouts,
    ]
  );

  return <AccountStateContext.Provider value={value}>{children}</AccountStateContext.Provider>;
}

export function useAccountState(): AccountState {
  const state = useContext(AccountStateContext);
  if (!state) throw new Error('useAccountState must be used inside AccountStateProvider');
  return state;
}
