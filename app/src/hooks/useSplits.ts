import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSplits,
  getSplit,
  createSplit,
  deleteSplit,
  analyzeSplit,
  replaceSplit,
  updateSplit,
  updateSplitExercises,
  splitKeys,
  type SplitExerciseBatchUpdateItem,
} from '../api/splits.api';
import type {
  SplitRequest,
  SplitListResponse,
  SplitResponse,
  SplitUpdate,
} from '../types/api.types';

function updateSplitInListCache(
  previous: SplitListResponse | undefined,
  updatedSplit: SplitResponse
): SplitListResponse | undefined {
  if (!previous) return previous;
  return {
    ...previous,
    splits: previous.splits.map((s) => (s.id === updatedSplit.id ? updatedSplit : s)),
  };
}

export function useSplitsList() {
  return useQuery({
    queryKey: splitKeys.list(),
    queryFn: getSplits,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useSplit(id: string | undefined) {
  return useQuery({
    queryKey: splitKeys.detail(id!),
    queryFn: () => getSplit(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useSplitAnalysis(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...splitKeys.analysis(id!), 'lite'],
    queryFn: () => analyzeSplit(id!, false),
    enabled: !!id && enabled,
  });
}

export function useSplitAnalysisWithBreakdowns(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...splitKeys.analysis(id!), 'full'],
    queryFn: () => analyzeSplit(id!, true),
    enabled: !!id && enabled,
  });
}

export function useReplaceSplit(options?: { invalidateLists?: boolean }) {
  const invalidateLists = options?.invalidateLists ?? true;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SplitRequest }) => replaceSplit(id, data),
    onSuccess: (result, variables) => {
      queryClient.setQueryData(splitKeys.detail(variables.id), result);
      if (invalidateLists) {
        queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
      } else {
        const previous = queryClient.getQueryData<SplitListResponse>(splitKeys.list());
        const next = updateSplitInListCache(previous, result);
        if (next) queryClient.setQueryData(splitKeys.list(), next);
      }
      queryClient.invalidateQueries({ queryKey: splitKeys.analysis(variables.id) });
    },
  });
}

export function useUpdateSplit(options?: { invalidateLists?: boolean }) {
  const invalidateLists = options?.invalidateLists ?? true;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SplitUpdate }) => updateSplit(id, data),
    onSuccess: (result, variables) => {
      queryClient.setQueryData(splitKeys.detail(variables.id), result);
      if (invalidateLists) {
        queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
      } else {
        const previous = queryClient.getQueryData<SplitListResponse>(splitKeys.list());
        const next = updateSplitInListCache(previous, result);
        if (next) queryClient.setQueryData(splitKeys.list(), next);
      }
      queryClient.invalidateQueries({ queryKey: splitKeys.analysis(variables.id) });
    },
  });
}

export function useUpdateSplitExercises() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: SplitExerciseBatchUpdateItem[] }) =>
      updateSplitExercises(id, updates),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: splitKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: splitKeys.analysis(variables.id) });
    },
  });
}

export function useCreateSplit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SplitRequest) => createSplit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
    },
  });
}

export function useDeleteSplit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSplit(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: splitKeys.lists() });
      const previous = queryClient.getQueryData<SplitListResponse>(splitKeys.list());
      if (previous) {
        queryClient.setQueryData<SplitListResponse>(splitKeys.list(), {
          ...previous,
          splits: previous.splits.filter((s) => s.id !== id),
          total: previous.total - 1,
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(splitKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
    },
  });
}
