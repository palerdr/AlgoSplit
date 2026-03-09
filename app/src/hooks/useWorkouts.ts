import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import type { WorkoutLogCreate } from '../types/api.types';

export function useWorkoutHistory(params?: { limit?: number; offset?: number; days?: number }) {
  return useQuery({
    queryKey: workoutKeys.list(params ?? {}),
    queryFn: () => getWorkouts(params),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCompleteWorkoutHistory(params?: { days?: number }) {
  return useQuery({
    queryKey: [...workoutKeys.list(params ?? {}), 'complete'],
    queryFn: () => getAllWorkouts(params),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useWorkoutHistorySummaries(params?: { limit?: number; offset?: number; days?: number }) {
  return useQuery({
    queryKey: [...workoutKeys.list(params ?? {}), 'summary'],
    queryFn: () => getWorkoutSummaries(params),
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
    queryFn: () => getWorkoutStats(days),
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

export function useRecentStimulus(days = 7) {
  return useQuery({
    queryKey: [...workoutKeys.all, 'recent-stimulus', days],
    queryFn: () => analyzeWorkouts({ days }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
