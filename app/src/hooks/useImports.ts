import { useMutation } from '@tanstack/react-query';
import { previewImport } from '../api/imports.api';
import type { ImportPreviewRequest } from '../types/api.types';

export function useImportPreview() {
  return useMutation({
    mutationFn: (data: ImportPreviewRequest) => previewImport(data),
  });
}
