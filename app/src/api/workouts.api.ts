import { apiClient } from './client';
import type {
  WorkoutLogCreate,
  WorkoutLogResponse,
  WorkoutHistoryResponse,
  WorkoutSummaryListResponse,
  WorkoutStatsResponse,
  AnalysisResponse,
} from '../types/api.types';

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

export async function getAllWorkouts(params?: {
  days?: number;
}): Promise<WorkoutHistoryResponse> {
  const pageSize = 500;
  let offset = 0;
  let total = 0;
  const workouts: WorkoutLogResponse[] = [];

  while (offset === 0 || offset < total) {
    const page = await getWorkouts({
      ...params,
      limit: pageSize,
      offset,
    });

    workouts.push(...page.workouts);
    total = page.total;

    if (page.workouts.length === 0) {
      break;
    }

    offset += page.workouts.length;
  }

  return {
    workouts,
    total,
  };
}

export async function getWorkoutSummaries(params?: {
  limit?: number;
  offset?: number;
  days?: number;
}): Promise<WorkoutSummaryListResponse> {
  const response = await apiClient.get<WorkoutSummaryListResponse>('/api/workouts/summaries', {
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

export async function analyzeWorkouts(params?: {
  days?: number;
  endDate?: string;
  timezoneOffsetMinutes?: number;
  stimulusDuration?: number;
  maintenanceVolume?: number;
  dataset?: 'schoenfeld' | 'pelland' | 'average';
}): Promise<AnalysisResponse> {
  const response = await apiClient.post<AnalysisResponse>(
    '/api/analyze-workouts',
    null,
    {
      params: {
        days: params?.days ?? 7,
        stimulus_duration: params?.stimulusDuration ?? 48,
        maintenance_volume: params?.maintenanceVolume ?? 3,
        dataset: params?.dataset ?? 'schoenfeld',
        ...(params?.endDate ? { end_date: params.endDate } : {}),
        ...(params?.timezoneOffsetMinutes != null
          ? { timezone_offset_minutes: params.timezoneOffsetMinutes }
          : {}),
      },
    },
  );
  return response.data;
}
