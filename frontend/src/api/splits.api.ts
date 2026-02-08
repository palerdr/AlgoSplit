import { apiClient } from './client';
import type {
  SplitRequest,
  SplitResponse,
  SplitListResponse,
  SplitUpdate,
  AnalysisResponse,
} from '@/types/api.types';

// Query key factory
export const splitKeys = {
  all: ['splits'] as const,
  lists: () => [...splitKeys.all, 'list'] as const,
  list: () => [...splitKeys.lists()] as const,
  details: () => [...splitKeys.all, 'detail'] as const,
  detail: (id: string) => [...splitKeys.details(), id] as const,
  analysis: (id: string) => [...splitKeys.all, 'analysis', id] as const,
};

export async function getSplits(): Promise<SplitListResponse> {
  const response = await apiClient.get<SplitListResponse>('/api/splits');
  return response.data;
}

export async function getSplit(id: string): Promise<SplitResponse> {
  const response = await apiClient.get<SplitResponse>(`/api/splits/${id}`);
  return response.data;
}

export async function createSplit(data: SplitRequest): Promise<SplitResponse> {
  // Transform from SplitRequest format to API format
  const apiData: Record<string, unknown> = {
    name: data.name,
    stimulus_duration: data.stimulus_duration ?? 48,
    maintenance_volume: data.maintenance_volume ?? 3,
    dataset: data.dataset ?? 'pelland',
    sessions: data.sessions.map((session) => ({
      name: session.name,
      day_number: session.day,
      exercises: session.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        unilateral: ex.unilateral ?? false,
        resistance_profile: ex.resistance_profile ?? null,
      })),
    })),
  };
  if (data.cycle_length != null) {
    apiData.cycle_length = data.cycle_length;
  }
  const response = await apiClient.post<SplitResponse>('/api/splits', apiData);
  return response.data;
}

export async function updateSplit(
  id: string,
  data: SplitUpdate
): Promise<SplitResponse> {
  const response = await apiClient.put<SplitResponse>(`/api/splits/${id}`, data);
  return response.data;
}

export async function deleteSplit(id: string): Promise<void> {
  await apiClient.delete(`/api/splits/${id}`);
}

export async function replaceSplit(id: string, data: SplitRequest): Promise<SplitResponse> {
  // Transform from SplitRequest format to API format (same as createSplit)
  const apiData: Record<string, unknown> = {
    name: data.name,
    cycle_length: data.cycle_length ?? null,
    stimulus_duration: data.stimulus_duration ?? 48,
    maintenance_volume: data.maintenance_volume ?? 3,
    dataset: data.dataset ?? 'pelland',
    sessions: data.sessions.map((session) => ({
      name: session.name,
      day_number: session.day,
      exercises: session.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        unilateral: ex.unilateral ?? false,
        resistance_profile: ex.resistance_profile ?? null,
      })),
    })),
  };
  const response = await apiClient.put<SplitResponse>(`/api/splits/${id}/full`, apiData);
  return response.data;
}

export async function analyzeSplit(id: string): Promise<AnalysisResponse> {
  const response = await apiClient.post<AnalysisResponse>(
    `/api/splits/${id}/analyze`
  );
  return response.data;
}
