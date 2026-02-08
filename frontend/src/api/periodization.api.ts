import { apiClient } from './client';
import type {
  MacroCycleCreate,
  MacroCycleResponse,
  MacroCycleListResponse,
  MesoCycleCreate,
  MesoCycleResponse,
  MicroCycleCreate,
  MicroCycleResponse,
} from '@/types/api.types';

export const periodizationKeys = {
  all: ['periodization'] as const,
  macros: (programId: string) => [...periodizationKeys.all, 'macros', programId] as const,
};

export async function getMacros(programId: string): Promise<MacroCycleListResponse> {
  const res = await apiClient.get<MacroCycleListResponse>(`/api/programs/${programId}/periodization/macros`);
  return res.data;
}

export async function createMacro(programId: string, data: MacroCycleCreate): Promise<MacroCycleResponse> {
  const res = await apiClient.post<MacroCycleResponse>(`/api/programs/${programId}/periodization/macros`, data);
  return res.data;
}

export async function deleteMacro(programId: string, macroId: string): Promise<void> {
  await apiClient.delete(`/api/programs/${programId}/periodization/macros/${macroId}`);
}

export async function createMeso(programId: string, macroId: string, data: MesoCycleCreate): Promise<MesoCycleResponse> {
  const res = await apiClient.post<MesoCycleResponse>(`/api/programs/${programId}/periodization/macros/${macroId}/mesos`, data);
  return res.data;
}

export async function deleteMeso(programId: string, mesoId: string): Promise<void> {
  await apiClient.delete(`/api/programs/${programId}/periodization/mesos/${mesoId}`);
}

export async function createMicro(programId: string, mesoId: string, data: MicroCycleCreate): Promise<MicroCycleResponse> {
  const res = await apiClient.post<MicroCycleResponse>(`/api/programs/${programId}/periodization/mesos/${mesoId}/micros`, data);
  return res.data;
}

export async function deleteMicro(programId: string, microId: string): Promise<void> {
  await apiClient.delete(`/api/programs/${programId}/periodization/micros/${microId}`);
}

export async function assignSessions(programId: string, microId: string, sessionIds: string[]): Promise<MicroCycleResponse> {
  const res = await apiClient.put<MicroCycleResponse>(
    `/api/programs/${programId}/periodization/micros/${microId}/assign-sessions`,
    { session_ids: sessionIds }
  );
  return res.data;
}
