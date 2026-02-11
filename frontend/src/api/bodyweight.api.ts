import { apiClient } from './client';
import type {
  BodyweightEntryCreate,
  BodyweightEntryResponse,
  BodyweightEntryListResponse,
  BodyweightBatchCreate,
} from '@/types/api.types';

// Query key factory
export const bodyweightKeys = {
  all: ['bodyweight'] as const,
  list: () => [...bodyweightKeys.all, 'list'] as const,
};

export async function getBodyweightEntries(): Promise<BodyweightEntryListResponse> {
  const response = await apiClient.get<BodyweightEntryListResponse>('/api/bodyweight');
  return response.data;
}

export async function createBodyweightEntry(
  data: BodyweightEntryCreate,
): Promise<BodyweightEntryResponse> {
  const response = await apiClient.post<BodyweightEntryResponse>('/api/bodyweight', data);
  return response.data;
}

export async function batchCreateBodyweightEntries(
  data: BodyweightBatchCreate,
): Promise<BodyweightEntryListResponse> {
  const response = await apiClient.post<BodyweightEntryListResponse>('/api/bodyweight/batch', data);
  return response.data;
}

export async function deleteBodyweightEntry(id: string): Promise<void> {
  await apiClient.delete(`/api/bodyweight/${id}`);
}
