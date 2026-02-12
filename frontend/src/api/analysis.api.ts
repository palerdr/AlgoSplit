import { apiClient } from './client';
import type {
  SplitRequest,
  AnalysisResponse,
  ExerciseParseResponse,
  MuscleRegionsResponse,
  PatternsResponse,
} from '@/types/api.types';

// Query key factory
export const analysisKeys = {
  all: ['analysis'] as const,
  split: (data: SplitRequest) => [...analysisKeys.all, 'split', data] as const,
  exercise: (text: string) => [...analysisKeys.all, 'exercise', text] as const,
  regions: () => [...analysisKeys.all, 'regions'] as const,
  patterns: () => [...analysisKeys.all, 'patterns'] as const,
  workouts: (days: number, stimulusDuration: number, maintenanceVolume: number, dataset: string) =>
    [...analysisKeys.all, 'workouts', days, stimulusDuration, maintenanceVolume, dataset] as const,
};

export async function analyzeSplit(data: SplitRequest): Promise<AnalysisResponse> {
  const response = await apiClient.post<AnalysisResponse>('/api/analyze-split', data);
  return response.data;
}

export async function parseExercise(text: string): Promise<ExerciseParseResponse> {
  const response = await apiClient.post<ExerciseParseResponse>('/api/parse-exercise', {
    text,
  });
  return response.data;
}

export async function getMuscleRegions(): Promise<MuscleRegionsResponse> {
  const response = await apiClient.get<MuscleRegionsResponse>('/api/muscle-regions');
  return response.data;
}

export async function getPatterns(): Promise<PatternsResponse> {
  const response = await apiClient.get<PatternsResponse>('/api/patterns');
  return response.data;
}

export async function analyzeWorkouts(
  days: number,
  stimulusDuration: number = 48,
  maintenanceVolume: number = 3,
  dataset: string = 'schoenfeld',
): Promise<AnalysisResponse> {
  const params = new URLSearchParams({
    days: String(days),
    stimulus_duration: String(stimulusDuration),
    maintenance_volume: String(maintenanceVolume),
    dataset,
  });
  const response = await apiClient.post<AnalysisResponse>(`/api/analyze-workouts?${params}`);
  return response.data;
}
