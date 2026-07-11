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
import { normalizeExerciseIdentity } from '../utils/exerciseIdentity';

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

export type PreviousExerciseMap = Record<string, {
  reps: number[];
  weight: number[];
  rir?: (number | null)[];
  notes?: string | null;
}>;

function stripLegacyUnilateralNotePrefix(
  notes: string | null | undefined,
  isRepeatedExercise: boolean,
): string | null | undefined {
  if (!notes || !isRepeatedExercise) return notes;
  // Earlier clients overloaded notes with "L", "R", "L | note", or
  // "R | note" to distinguish unilateral rows. Side is a display concern;
  // remove only this legacy encoding when the workout has repeated names.
  const match = notes.trim().match(/^[LR](?:\s*\|\s*(.*))?$/);
  return match ? (match[1]?.trim() || undefined) : notes;
}

export function buildPreviousExerciseMap(
  workouts: Array<{
    session_name: string;
    split_id?: string | null;
    exercises: Array<{
      exercise_name: string;
      reps: number[];
      weight: number[];
      rir?: (number | null)[] | null;
      notes?: string | null;
    }>;
  }>,
  sessionName: string,
  splitId?: string,
): PreviousExerciseMap | null {
  // Within a split, a name identifies the exercise across all of its days.
  // Session names are only a fallback for free/legacy workouts with no split.
  const normalizedSessionName = sessionName.trim().toLocaleLowerCase();
  const matchingWorkouts = workouts.filter((workout) => (
    splitId
      ? workout.split_id === splitId
      : workout.session_name.trim().toLocaleLowerCase() === normalizedSessionName
  ));
  if (matchingWorkouts.length === 0) return null;

  // Exercise names are user-controlled. Null-prototype dictionaries prevent a
  // name such as "__proto__" from changing the map's prototype chain.
  const result: PreviousExerciseMap = Object.create(null) as PreviousExerciseMap;
  for (const workout of matchingWorkouts) {
    const nameCounts = workout.exercises.reduce<Record<string, number>>((counts, exercise) => {
      const key = normalizeExerciseIdentity(exercise.exercise_name);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, Object.create(null) as Record<string, number>);
    for (const exercise of workout.exercises) {
      const exerciseKey = normalizeExerciseIdentity(exercise.exercise_name);
      // The history endpoint is reverse chronological. Keep the first
      // occurrence so skipped exercises can still find their last logged set.
      if (!Object.prototype.hasOwnProperty.call(result, exerciseKey)) {
        result[exerciseKey] = {
          reps: exercise.reps,
          weight: exercise.weight,
          rir: exercise.rir ?? undefined,
          notes: stripLegacyUnilateralNotePrefix(exercise.notes, nameCounts[exerciseKey] > 1),
        };
      }
    }
  }
  return result;
}

async function fetchPreviousWorkoutData(
  sessionName: string,
  splitId?: string,
): Promise<PreviousExerciseMap | null> {
  const history = await getWorkouts({ limit: 50 });
  return buildPreviousExerciseMap(history.workouts, sessionName, splitId);
}

/**
 * Fetch the most recent workout for a given session name.
 * Returns previous exercise data in the shape the store expects.
 */
export function usePreviousWorkoutData(sessionName: string | undefined, splitId?: string) {
  return useQuery({
    queryKey: [...workoutKeys.all, 'previous', splitId ?? 'session', sessionName],
    queryFn: () => fetchPreviousWorkoutData(sessionName!, splitId),
    enabled: !!sessionName,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Prefetch previous workout data for a session so it is warm in the
 * React Query cache before the workout screen mounts.
 */
export function prefetchPreviousWorkoutData(
  qc: QueryClient,
  sessionName: string,
  splitId?: string,
) {
  qc.prefetchQuery({
    queryKey: [...workoutKeys.all, 'previous', splitId ?? 'session', sessionName],
    queryFn: () => fetchPreviousWorkoutData(sessionName, splitId),
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
