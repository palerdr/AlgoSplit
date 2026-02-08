import { apiClient } from './client';

export interface ComparisonResponse {
  id: string;
  user_id: string;
  name: string;
  split_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ComparisonListResponse {
  comparisons: ComparisonResponse[];
  total: number;
}

export interface ComparisonCreate {
  name: string;
  split_ids: string[];
}

export interface ComparisonUpdate {
  name?: string;
  split_ids?: string[];
}

// Query key factory
export const comparisonKeys = {
  all: ['comparisons'] as const,
  lists: () => [...comparisonKeys.all, 'list'] as const,
  list: () => [...comparisonKeys.lists()] as const,
  details: () => [...comparisonKeys.all, 'detail'] as const,
  detail: (id: string) => [...comparisonKeys.details(), id] as const,
};

export async function getComparisons(): Promise<ComparisonListResponse> {
  const response = await apiClient.get<ComparisonListResponse>('/api/comparisons');
  return response.data;
}

export async function getComparison(id: string): Promise<ComparisonResponse> {
  const response = await apiClient.get<ComparisonResponse>(`/api/comparisons/${id}`);
  return response.data;
}

export async function createComparison(data: ComparisonCreate): Promise<ComparisonResponse> {
  const response = await apiClient.post<ComparisonResponse>('/api/comparisons', data);
  return response.data;
}

export async function updateComparison(
  id: string,
  data: ComparisonUpdate
): Promise<ComparisonResponse> {
  const response = await apiClient.put<ComparisonResponse>(`/api/comparisons/${id}`, data);
  return response.data;
}

export async function deleteComparison(id: string): Promise<void> {
  await apiClient.delete(`/api/comparisons/${id}`);
}
