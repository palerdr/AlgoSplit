import { apiClient } from './client';
import type {
  CustomExerciseCreate,
  CustomExerciseUpdate,
  CustomExerciseResponse,
  CustomExerciseListResponse,
  MuscleRegionsResponse,
} from '@/types/api.types';

// Query keys for React Query
export const customExerciseKeys = {
  all: ['custom-exercises'] as const,
  lists: () => [...customExerciseKeys.all, 'list'] as const,
  list: () => [...customExerciseKeys.lists()] as const,
  details: () => [...customExerciseKeys.all, 'detail'] as const,
  detail: (id: string) => [...customExerciseKeys.details(), id] as const,
};

/**
 * List all custom exercises for the current user
 */
export async function listCustomExercises(): Promise<CustomExerciseListResponse> {
  const response = await apiClient.get('/api/custom-exercises');
  return response.data;
}

/**
 * Create a new custom exercise
 */
export async function createCustomExercise(
  data: CustomExerciseCreate
): Promise<CustomExerciseResponse> {
  const response = await apiClient.post('/api/custom-exercises', data);
  return response.data;
}

/**
 * Get a specific custom exercise by ID
 */
export async function getCustomExercise(id: string): Promise<CustomExerciseResponse> {
  const response = await apiClient.get(`/api/custom-exercises/${id}`);
  return response.data;
}

/**
 * Update a custom exercise
 */
export async function updateCustomExercise(
  id: string,
  data: CustomExerciseUpdate
): Promise<CustomExerciseResponse> {
  const response = await apiClient.put(`/api/custom-exercises/${id}`, data);
  return response.data;
}

/**
 * Delete a custom exercise
 */
export async function deleteCustomExercise(id: string): Promise<void> {
  await apiClient.delete(`/api/custom-exercises/${id}`);
}

/**
 * Get all muscle regions (for the editor dropdown)
 */
export async function getMuscleRegions(): Promise<MuscleRegionsResponse> {
  const response = await apiClient.get('/api/muscle-regions');
  return response.data;
}
