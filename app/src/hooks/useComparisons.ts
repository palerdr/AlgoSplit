import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  comparisonKeys,
  createComparison,
  deleteComparison,
  getComparison,
  getComparisons,
  updateComparison,
  type ComparisonCreate,
  type ComparisonUpdate,
} from '../api/comparisons.api';

export function useComparisonsList() {
  return useQuery({
    queryKey: comparisonKeys.list(),
    queryFn: getComparisons,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useComparison(id: string | undefined) {
  return useQuery({
    queryKey: comparisonKeys.detail(id!),
    queryFn: () => getComparison(id!),
    enabled: !!id,
  });
}

export function useSaveComparison() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string | null;
      data: ComparisonCreate | ComparisonUpdate;
    }) => {
      if (payload.id) {
        return updateComparison(payload.id, payload.data);
      }
      return createComparison(payload.data as ComparisonCreate);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.lists() });
      queryClient.setQueryData(comparisonKeys.detail(result.id), result);
    },
  });
}

export function useDeleteComparison() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteComparison(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.lists() });
      queryClient.removeQueries({ queryKey: comparisonKeys.detail(id), exact: true });
    },
  });
}
