import { apiClient } from './client';
import type { ImportPreviewRequest, ImportPreviewResponse } from '../types/api.types';

export async function previewImport(data: ImportPreviewRequest): Promise<ImportPreviewResponse> {
  const response = await apiClient.post<ImportPreviewResponse>('/api/splits/import/preview', data);
  return response.data;
}
