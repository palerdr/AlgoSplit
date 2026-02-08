import { apiClient } from './client';
import type {
  ProgramCreate,
  ProgramUpdate,
  ProgramResponse,
  ProgramListResponse,
  ProgramDetailResponse,
  ProgramSessionCreate,
  ProgramSessionResponse,
  ProgramSessionListResponse,
  DiagnosticsRequest,
  AnalysisResponse,
  TodaySessionsResponse,
  ResolvedExerciseList,
} from '@/types/api.types';

// Query key factory
export const programKeys = {
  all: ['programs'] as const,
  lists: () => [...programKeys.all, 'list'] as const,
  list: () => [...programKeys.lists()] as const,
  details: () => [...programKeys.all, 'detail'] as const,
  detail: (id: string) => [...programKeys.details(), id] as const,
  sessions: (id: string) => [...programKeys.all, 'sessions', id] as const,
  diagnostics: (programId: string, targetId: string) =>
    [...programKeys.all, 'diagnostics', programId, targetId] as const,
  todaySessions: (date?: string) => [...programKeys.all, 'todaySessions', date] as const,
  sessionExercises: (programId: string, sessionId: string) =>
    [...programKeys.all, 'sessionExercises', programId, sessionId] as const,
};

export async function getPrograms(): Promise<ProgramListResponse> {
  const response = await apiClient.get<ProgramListResponse>('/api/programs');
  return response.data;
}

export async function getProgram(id: string): Promise<ProgramDetailResponse> {
  const response = await apiClient.get<ProgramDetailResponse>(`/api/programs/${id}`);
  return response.data;
}

export async function createProgram(data: ProgramCreate): Promise<ProgramResponse> {
  const response = await apiClient.post<ProgramResponse>('/api/programs', data);
  return response.data;
}

export async function updateProgram(id: string, data: ProgramUpdate): Promise<ProgramResponse> {
  const response = await apiClient.put<ProgramResponse>(`/api/programs/${id}`, data);
  return response.data;
}

export async function deleteProgram(id: string): Promise<void> {
  await apiClient.delete(`/api/programs/${id}`);
}

// Program sessions
export async function getProgramSessions(
  programId: string,
  startDate?: string,
  endDate?: string
): Promise<ProgramSessionListResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await apiClient.get<ProgramSessionListResponse>(
    `/api/programs/${programId}/sessions${query}`
  );
  return response.data;
}

export async function scheduleSession(
  programId: string,
  data: ProgramSessionCreate
): Promise<ProgramSessionResponse> {
  const response = await apiClient.post<ProgramSessionResponse>(
    `/api/programs/${programId}/sessions`,
    data
  );
  return response.data;
}

export async function batchScheduleSessions(
  programId: string,
  sessions: ProgramSessionCreate[]
): Promise<ProgramSessionListResponse> {
  const response = await apiClient.post<ProgramSessionListResponse>(
    `/api/programs/${programId}/sessions/batch`,
    { sessions }
  );
  return response.data;
}

export async function updateProgramSession(
  programId: string,
  sessionId: string,
  data: Partial<ProgramSessionCreate> & { status?: string }
): Promise<ProgramSessionResponse> {
  const response = await apiClient.put<ProgramSessionResponse>(
    `/api/programs/${programId}/sessions/${sessionId}`,
    data
  );
  return response.data;
}

export async function deleteProgramSession(
  programId: string,
  sessionId: string
): Promise<void> {
  await apiClient.delete(`/api/programs/${programId}/sessions/${sessionId}`);
}

export async function detachSession(
  programId: string,
  sessionId: string
): Promise<ProgramSessionResponse> {
  const response = await apiClient.put<ProgramSessionResponse>(
    `/api/programs/${programId}/sessions/${sessionId}/detach`
  );
  return response.data;
}

// Today's sessions
export async function getTodaySessions(date: string): Promise<TodaySessionsResponse> {
  const response = await apiClient.get<TodaySessionsResponse>(
    `/api/programs/sessions/today?date=${date}`
  );
  return response.data;
}

export async function getProgramSessionExercises(
  programId: string,
  sessionId: string
): Promise<ResolvedExerciseList> {
  const response = await apiClient.get<ResolvedExerciseList>(
    `/api/programs/${programId}/sessions/${sessionId}/exercises`
  );
  return response.data;
}

// Diagnostics
export async function runDiagnostics(
  programId: string,
  request: DiagnosticsRequest
): Promise<AnalysisResponse> {
  const response = await apiClient.post<AnalysisResponse>(
    `/api/programs/${programId}/diagnostics`,
    request
  );
  return response.data;
}
