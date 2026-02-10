import { apiClient } from './client';
import type {
  WorkoutLogCreate,
  WorkoutLogResponse,
  WorkoutHistoryResponse,
  WorkoutStatsResponse,
} from '@/types/api.types';

// Query key factory
export const workoutKeys = {
  all: ['workouts'] as const,
  lists: () => [...workoutKeys.all, 'list'] as const,
  list: (filters: { limit?: number; offset?: number; days?: number }) =>
    [...workoutKeys.lists(), filters] as const,
  details: () => [...workoutKeys.all, 'detail'] as const,
  detail: (id: string) => [...workoutKeys.details(), id] as const,
  stats: (days?: number) => [...workoutKeys.all, 'stats', days] as const,
};

export async function getWorkouts(params?: {
  limit?: number;
  offset?: number;
  days?: number;
}): Promise<WorkoutHistoryResponse> {
  const response = await apiClient.get<WorkoutHistoryResponse>('/api/workouts', {
    params,
  });
  return response.data;
}

export async function getWorkout(id: string): Promise<WorkoutLogResponse> {
  const response = await apiClient.get<WorkoutLogResponse>(`/api/workouts/${id}`);
  return response.data;
}

export async function logWorkout(data: WorkoutLogCreate): Promise<WorkoutLogResponse> {
  const response = await apiClient.post<WorkoutLogResponse>('/api/workouts', data);
  return response.data;
}

export async function updateWorkout(id: string, data: WorkoutLogCreate): Promise<WorkoutLogResponse> {
  const response = await apiClient.put<WorkoutLogResponse>(`/api/workouts/${id}`, data);
  return response.data;
}

export async function deleteWorkout(id: string): Promise<void> {
  await apiClient.delete(`/api/workouts/${id}`);
}

export async function clearExerciseHistory(
  exerciseName: string,
): Promise<{ deleted_count: number }> {
  const response = await apiClient.delete<{ deleted_count: number }>(
    `/api/workouts/exercises/by-name/${encodeURIComponent(exerciseName)}`
  );
  return response.data;
}

export async function getWorkoutStats(days?: number): Promise<WorkoutStatsResponse> {
  const response = await apiClient.get<WorkoutStatsResponse>(
    '/api/workouts/stats/summary',
    { params: days ? { days } : undefined }
  );
  return response.data;
}
