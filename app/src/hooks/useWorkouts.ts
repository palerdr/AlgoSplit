import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  getAllWorkouts,
  getWorkouts,
  getWorkoutSummaries,
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

export function useCompleteWorkoutHistory(params?: { days?: number }) {
  return useQuery({
    queryKey: [...workoutKeys.list(params ?? {}), 'complete'],
    queryFn: () =>
      traceAsync('mobile:history:getAllWorkouts', () => getAllWorkouts(params), {
        days: params?.days,
      }),
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
      qc.invalidateQueries({ queryKey: workoutKeys.lists() });
      qc.invalidateQueries({ queryKey: workoutKeys.stats() });
      qc.invalidateQueries({ queryKey: [...workoutKeys.all, 'recent-stimulus'] });
    },
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWorkout(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workoutKeys.lists() });
      qc.invalidateQueries({ queryKey: workoutKeys.stats() });
      qc.invalidateQueries({ queryKey: [...workoutKeys.all, 'recent-stimulus'] });
    },
  });
}

/**
 * Fetch the most recent workout for a given session name.
 * Returns previous exercise data in the shape the store expects.
 */
export function usePreviousWorkoutData(sessionName: string | undefined) {
  return useQuery({
    queryKey: [...workoutKeys.all, 'previous', sessionName],
    queryFn: async () => {
      if (!sessionName) return null;
      const history = await getWorkouts({ limit: 50 });
      const match = history.workouts.find(
        (w) => w.session_name.toLowerCase() === sessionName.toLowerCase(),
      );
      if (!match) return null;

      const result: Record<string, { reps: number[]; weight: number[]; rir?: (number | null)[] }> = {};
      for (const ex of match.exercises) {
        result[ex.exercise_name] = {
          reps: ex.reps,
          weight: ex.weight,
          rir: ex.rir ?? undefined,
        };
      }
      return result;
    },
    enabled: !!sessionName,
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

  // 2. Workout summaries (calendar dots) — lightweight, shared with history
  qc.prefetchQuery({
    queryKey: [...workoutKeys.list({ days: 61, limit: 500 }), 'summary'],
    queryFn: () => getWorkoutSummaries({ days: 61, limit: 500 }),
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
