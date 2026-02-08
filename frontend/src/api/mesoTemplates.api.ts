import { apiClient } from './client';
import type { MesoTemplateResponse, MesoTemplateListResponse } from '@/types/api.types';

export const mesoTemplateKeys = {
  all: ['meso-templates'] as const,
  list: () => [...mesoTemplateKeys.all, 'list'] as const,
  detail: (id: string) => [...mesoTemplateKeys.all, 'detail', id] as const,
};

export async function getMesoTemplates(): Promise<MesoTemplateListResponse[]> {
  const { data } = await apiClient.get('/api/meso-templates');
  return data;
}

export async function getMesoTemplate(id: string): Promise<MesoTemplateResponse> {
  const { data } = await apiClient.get(`/api/meso-templates/${id}`);
  return data;
}

export async function saveMesoAsTemplate(body: { name: string; source_meso_id: string; notes?: string }): Promise<MesoTemplateResponse> {
  const { data } = await apiClient.post('/api/meso-templates', body);
  return data;
}

export async function deleteMesoTemplate(id: string): Promise<void> {
  await apiClient.delete(`/api/meso-templates/${id}`);
}

export async function applyMesoTemplate(templateId: string, body: { macro_id: string; start_date: string; name?: string }): Promise<{ meso_id: string }> {
  const { data } = await apiClient.post(`/api/meso-templates/${templateId}/apply`, body);
  return data;
}
