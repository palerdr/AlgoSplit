import { apiClient } from './client';
import type {
  SessionTemplateCreate,
  SessionTemplateResponse,
  SessionTemplateListResponse,
} from '@/types/api.types';

export const templateKeys = {
  all: ['session-templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  list: () => [...templateKeys.lists()] as const,
  details: () => [...templateKeys.all, 'detail'] as const,
  detail: (id: string) => [...templateKeys.details(), id] as const,
};

export async function getTemplates(): Promise<SessionTemplateListResponse> {
  const response = await apiClient.get<SessionTemplateListResponse>('/api/session-templates');
  return response.data;
}

export async function getTemplate(id: string): Promise<SessionTemplateResponse> {
  const response = await apiClient.get<SessionTemplateResponse>(`/api/session-templates/${id}`);
  return response.data;
}

export async function createTemplate(data: SessionTemplateCreate): Promise<SessionTemplateResponse> {
  const response = await apiClient.post<SessionTemplateResponse>('/api/session-templates', data);
  return response.data;
}

export async function createTemplateFromSession(
  sessionId: string,
  name?: string
): Promise<SessionTemplateResponse> {
  const response = await apiClient.post<SessionTemplateResponse>(
    '/api/session-templates/from-session',
    { session_id: sessionId, name }
  );
  return response.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiClient.delete(`/api/session-templates/${id}`);
}
