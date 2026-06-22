import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  getAllWorkouts,
  getWorkouts,
  getWorkoutSummaries,
  getWorkoutDates,
  getWorkout,
  getWorkoutStats,
  logWorkout,
  deleteWorkout,
  analyzeWorkouts,
  workoutKeys,
} from '../api/workouts.api';
import { traceAsync } from '../dev/perfTrace';
import type { WorkoutLogCreate } from '../types/api.types';

export function useWorkoutHistory(params?: { limit?: number; offset?: number; days?: number }) {
  return useQuery({
    queryKey: workoutKeys.list(params ?? {}),
    queryFn: () =>
      traceAsync('mobile:history:getWorkouts', () => getWorkouts(params), {
        limit: params?.limit,
        offset: params?.offset,
        days: params?.days,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useRecentWorkoutPair() {
  return useQuery({
    queryKey: [...workoutKeys.list({ limit: 2 }), 'recent-pair'],
    queryFn: () => getWorkouts({ limit: 2 }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCompleteWorkoutHistory(params?: { days?: number }) {
  return useQuery({
    queryKey: [...workoutKeys.list(params ?? {}), 'complete'],
    queryFn: () =>
      traceAsync('mobile:history:getAllWorkouts', () => getAllWorkouts(params), {
        days: params?.days,
      }),
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useWorkoutHistorySummaries(params?: { limit?: number; offset?: number; days?: number }) {
  return useQuery({
    queryKey: [...workoutKeys.list(params ?? {}), 'summary'],
    queryFn: () =>
      traceAsync('mobile:history:getWorkoutSummaries', () => getWorkoutSummaries(params), {
        limit: params?.limit,
        offset: params?.offset,
        days: params?.days,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch distinct workout completion dates (YYYY-MM-DD strings).
 * Uses the lightweight /api/workouts/dates endpoint — single DB query,
 * no exercise join.  Ideal for calendar dot rendering.
 */
export function useWorkoutDates(params?: { days?: number }) {
  return useQuery({
    queryKey: [...workoutKeys.all, 'dates', params?.days],
    queryFn: () =>
      traceAsync('mobile:dashboard:getWorkoutDates', () => getWorkoutDates(params), {
        days: params?.days,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: workoutKeys.detail(id!),
    queryFn: () => getWorkout(id!),
    enabled: !!id,
  });
}

export function useWorkoutStats(days?: number) {
  return useQuery({
    queryKey: workoutKeys.stats(days),
    queryFn: () =>
      traceAsync('mobile:history:getWorkoutStats', () => getWorkoutStats(days), {
        days,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useLogWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WorkoutLogCreate) => logWorkout(data),
    onSuccess: () => {
      invalidateWorkoutDerivedQueries(qc);
    },
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWorkout(id),
    onSuccess: () => {
      invalidateWorkoutDerivedQueries(qc);
    },
  });
}

export function invalidateWorkoutDerivedQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: workoutKeys.lists() });
  qc.invalidateQueries({ queryKey: workoutKeys.stats() });
  qc.invalidateQueries({ queryKey: [...workoutKeys.all, 'dates'] });
  qc.invalidateQueries({ queryKey: [...workoutKeys.all, 'recent-stimulus'] });
  qc.invalidateQueries({ queryKey: [...workoutKeys.all, 'previous'] });
}

type PreviousExerciseMap = Record<string, { reps: number[]; weight: number[]; rir?: (number | null)[]; notes?: string | null }>;

async function fetchPreviousWorkoutData(sessionName: string): Promise<PreviousExerciseMap | null> {
  const history = await getWorkouts({ limit: 50 });
  // Scan through recent workouts for this session to build per-exercise
  // previous data. If an exercise was skipped in the most recent workout,
  // we look further back to find the last time it was actually logged.
  const matchingWorkouts = history.workouts.filter(
    (w) => w.session_name.toLowerCase() === sessionName.toLowerCase(),
  );
  if (matchingWorkouts.length === 0) return null;

  const result: PreviousExerciseMap = {};
  for (const workout of matchingWorkouts) {
    for (const ex of workout.exercises) {
      // Only use the first (most recent) occurrence of each exercise
      if (!(ex.exercise_name in result)) {
        result[ex.exercise_name] = {
          reps: ex.reps,
          weight: ex.weight,
          rir: ex.rir ?? undefined,
          notes: ex.notes,
        };
      }
    }
  }
  return result;
}

/**
 * Fetch the most recent workout for a given session name.
 * Returns previous exercise data in the shape the store expects.
 */
export function usePreviousWorkoutData(sessionName: string | undefined) {
  return useQuery({
    queryKey: [...workoutKeys.all, 'previous', sessionName],
    queryFn: () => fetchPreviousWorkoutData(sessionName!),
    enabled: !!sessionName,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Prefetch previous workout data for a session so it is warm in the
 * React Query cache before the workout screen mounts.
 */
export function prefetchPreviousWorkoutData(qc: QueryClient, sessionName: string) {
  qc.prefetchQuery({
    queryKey: [...workoutKeys.all, 'previous', sessionName],
    queryFn: () => fetchPreviousWorkoutData(sessionName),
    staleTime: 10 * 60 * 1000,
  });
}

/** Build the query key for recent-stimulus so prefetch + useQuery share the same entry. */
export function recentStimulusKey(
  days: number,
  endDate: string,
  timezoneOffsetMinutes: number,
  stimulusDuration: number,
  maintenanceVolume: number,
  dataset: string,
) {
  return [
    ...workoutKeys.all,
    'recent-stimulus',
    days,
    endDate,
    timezoneOffsetMinutes,
    stimulusDuration,
    maintenanceVolume,
    dataset,
  ] as const;
}

export function useRecentStimulus(
  days = 7,
  endDate?: string,
  timezoneOffsetMinutes?: number,
  params?: {
    stimulusDuration?: number;
    maintenanceVolume?: number;
    dataset?: 'schoenfeld' | 'pelland' | 'average';
  },
) {
  const sd = params?.stimulusDuration ?? 48;
  const mv = params?.maintenanceVolume ?? 3;
  const ds = params?.dataset ?? 'schoenfeld';
  const ed = endDate ?? 'today';
  const tzo = timezoneOffsetMinutes ?? 0;

  return useQuery({
    queryKey: recentStimulusKey(days, ed, tzo, sd, mv, ds),
    queryFn: () =>
      traceAsync(
        'mobile:dashboard:analyzeWorkouts',
        () =>
          analyzeWorkouts({
            days,
            endDate,
            timezoneOffsetMinutes,
            stimulusDuration: sd,
            maintenanceVolume: mv,
            dataset: ds,
          }),
        {
          days,
          endDate,
          timezoneOffsetMinutes,
          stimulusDuration: sd,
          maintenanceVolume: mv,
          dataset: ds,
        },
      ),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Prefetch helpers — fire-and-forget into an external QueryClient
// ---------------------------------------------------------------------------

function formatDateKeyUtil(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Prefetch the dashboard-critical queries so they are warm before the tab
 * mounts.  Call after auth resolves or on tab-press.  Uses
 * `prefetchQuery` so it never triggers a refetch if data is already fresh.
 */
export function prefetchDashboardQueries(qc: QueryClient) {
  const today = formatDateKeyUtil(new Date());
  const tzo = new Date().getTimezoneOffset();
  // Lazy-require to avoid pulling settingsStore into the module's import graph
  // (which would break tests that mock useAuth without mocking zustand/middleware).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useSettingsStore } = require('../stores/settingsStore') as {
    useSettingsStore: { getState: () => { stimulusDuration: number; maintenanceVolume: number; dataset: 'schoenfeld' | 'pelland' | 'average' } };
  };
  const { stimulusDuration, maintenanceVolume, dataset } = useSettingsStore.getState();

  // 1. Recent stimulus (analysis) — the primary dashboard query
  qc.prefetchQuery({
    queryKey: recentStimulusKey(7, today, tzo, stimulusDuration, maintenanceVolume, dataset),
    queryFn: () =>
      analyzeWorkouts({
        days: 7,
        endDate: today,
        timezoneOffsetMinutes: tzo,
        stimulusDuration,
        maintenanceVolume,
        dataset,
      }),
    staleTime: 5 * 60 * 1000,
  });

  // 2. Workout dates (calendar dots) — single DB query, no exercise join
  qc.prefetchQuery({
    queryKey: [...workoutKeys.all, 'dates', 61],
    queryFn: () => getWorkoutDates({ days: 61 }),
    staleTime: 5 * 60 * 1000,
  });

  // 3. Recent workout pair (progress dial) — two most recent full workouts
  qc.prefetchQuery({
    queryKey: [...workoutKeys.list({ limit: 2 }), 'recent-pair'],
    queryFn: () => getWorkouts({ limit: 2 }),
    staleTime: 5 * 60 * 1000,
  });
}

/** Prefetch history summaries so the History tab is warm on arrival. */
export function prefetchHistoryQueries(qc: QueryClient) {
  qc.prefetchQuery({
    queryKey: [...workoutKeys.list({ limit: 100 }), 'summary'],
    queryFn: () => getWorkoutSummaries({ limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });
}

export function prefetchCompleteWorkoutHistory(
  qc: QueryClient,
  params?: { days?: number },
) {
  qc.prefetchQuery({
    queryKey: [...workoutKeys.list(params ?? {}), 'complete'],
    queryFn: () => getAllWorkouts(params),
    staleTime: 5 * 60 * 1000,
  });
}
