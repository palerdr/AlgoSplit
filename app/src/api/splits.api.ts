import { apiClient } from './client';
import type {
  SplitRequest,
  SplitResponse,
  SplitListResponse,
  SplitUpdate,
  AnalysisResponse,
} from '../types/api.types';

// Query key factory
export const splitKeys = {
  all: ['splits'] as const,
  lists: () => [...splitKeys.all, 'list'] as const,
  list: (includeExercises = true) => [...splitKeys.lists(), includeExercises ? 'full' : 'lite'] as const,
  details: () => [...splitKeys.all, 'detail'] as const,
  detail: (id: string) => [...splitKeys.details(), id] as const,
  analysis: (id: string) => [...splitKeys.all, 'analysis', id] as const,
};

export async function getSplits(options?: { includeExercises?: boolean }): Promise<SplitListResponse> {
  const includeExercises = options?.includeExercises ?? true;
  const response = await apiClient.get<SplitListResponse>('/api/splits', {
    params: includeExercises ? undefined : { include_exercises: false },
  });
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

export interface SplitExerciseBatchUpdateItem {
  id: string;
  name?: string;
  sets?: number;
  unilateral?: boolean;
  resistance_profile?: 'ascending' | 'mid' | 'descending' | null;
}

export async function updateSplitExercises(
  id: string,
  updates: SplitExerciseBatchUpdateItem[]
): Promise<{ updated: number }> {
  const response = await apiClient.put<{ updated: number }>(
    `/api/splits/${id}/exercises/batch`,
    { updates }
  );
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

export async function replaceExerciseInSplit(
  splitId: string,
  oldName: string,
  newName: string,
): Promise<SplitResponse> {
  // Fetch current split
  const split = await getSplit(splitId);

  // Walk sessions, replace exercise name
  const updatedSessions = split.sessions.map((session) => ({
    name: session.name,
    day: session.day_number,
    exercises: session.exercises.map((ex) => ({
      name: ex.exercise_name === oldName ? newName : ex.exercise_name,
      sets: ex.sets,
      unilateral: ex.unilateral,
      resistance_profile: ex.resistance_profile,
    })),
  }));

  // PUT full replacement
  return replaceSplit(splitId, {
    name: split.name,
    sessions: updatedSessions,
    cycle_length: split.cycle_length ?? undefined,
    stimulus_duration: split.stimulus_duration,
    maintenance_volume: split.maintenance_volume,
    dataset: split.dataset as 'schoenfeld' | 'pelland' | 'average',
  });
}

export async function reorderExercisesInSplit(
  splitId: string,
  sessionName: string,
  exerciseNames: string[],
): Promise<SplitResponse> {
  const split = await getSplit(splitId);

  const updatedSessions = split.sessions.map((session) => {
    if (session.name !== sessionName) {
      return {
        name: session.name,
        day: session.day_number,
        exercises: session.exercises.map((ex) => ({
          name: ex.exercise_name,
          sets: ex.sets,
          unilateral: ex.unilateral,
          resistance_profile: ex.resistance_profile,
        })),
      };
    }
    // Reorder: build new exercise list in the order of exerciseNames
    const exerciseMap = new Map(
      session.exercises.map((ex) => [ex.exercise_name, ex])
    );
    const reordered = exerciseNames
      .filter((name) => exerciseMap.has(name))
      .map((name) => {
        const ex = exerciseMap.get(name)!;
        return {
          name: ex.exercise_name,
          sets: ex.sets,
          unilateral: ex.unilateral,
          resistance_profile: ex.resistance_profile,
        };
      });
    // Append any exercises not in the new order (shouldn't happen, but safety)
    for (const ex of session.exercises) {
      if (!exerciseNames.includes(ex.exercise_name)) {
        reordered.push({
          name: ex.exercise_name,
          sets: ex.sets,
          unilateral: ex.unilateral,
          resistance_profile: ex.resistance_profile,
        });
      }
    }
    return { name: session.name, day: session.day_number, exercises: reordered };
  });

  return replaceSplit(splitId, {
    name: split.name,
    sessions: updatedSessions,
    cycle_length: split.cycle_length ?? undefined,
    stimulus_duration: split.stimulus_duration,
    maintenance_volume: split.maintenance_volume,
    dataset: split.dataset as 'schoenfeld' | 'pelland' | 'average',
  });
}

export async function analyzeSplit(id: string, includeBreakdowns = false): Promise<AnalysisResponse> {
  const response = await apiClient.post<AnalysisResponse>(
    `/api/splits/${id}/analyze`,
    null,
    { params: includeBreakdowns ? { include_breakdowns: true } : undefined }
  );
  return response.data;
}

export async function analyzeSplitFromDefinition(
  data: SplitRequest,
  includeBreakdowns = false
): Promise<AnalysisResponse> {
  const response = await apiClient.post<AnalysisResponse>(
    '/api/analyze-split',
    {
      ...data,
      include_breakdowns: includeBreakdowns,
    }
  );
  return response.data;
}
