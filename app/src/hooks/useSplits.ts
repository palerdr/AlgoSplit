import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  getSplits,
  getSplit,
  createSplit,
  deleteSplit,
  duplicateSplit,
  analyzeSplit,
  analyzeSplitFromDefinition,
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

function splitToRequestPayload(split: SplitResponse, includeBreakdowns = false): SplitRequest {
  return {
    name: split.name,
    sessions: split.sessions.map((session) => ({
      name: session.name,
      day: session.day_number,
      exercises: session.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.exercise_name,
        sets: exercise.sets,
        unilateral: exercise.unilateral,
        resistance_profile: exercise.resistance_profile,
      })),
    })),
    cycle_length: split.cycle_length ?? undefined,
    stimulus_duration: split.stimulus_duration,
    maintenance_volume: split.maintenance_volume,
    dataset: split.dataset as 'schoenfeld' | 'pelland' | 'average',
    include_breakdowns: includeBreakdowns,
  };
}

function splitAnalysisQueryOptions(
  id: string,
  includeBreakdowns: boolean,
  splitData?: SplitResponse,
) {
  const queryKey = [
    ...splitKeys.analysis(id),
    includeBreakdowns ? 'full' : 'lite',
    splitData?.updated_at ?? 'server',
  ] as const;

  return {
    queryKey,
    queryFn: () => {
      if (splitData) {
        return analyzeSplitFromDefinition(
          splitToRequestPayload(splitData, includeBreakdowns),
          includeBreakdowns,
        );
      }

      return analyzeSplit(id, includeBreakdowns);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  };
}

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
  return useSplitsListWithOptions();
}

export function useSplitsListWithOptions(options?: { includeExercises?: boolean }) {
  const includeExercises = options?.includeExercises ?? true;
  return useQuery({
    queryKey: splitKeys.list(includeExercises),
    queryFn: () => getSplits({ includeExercises }),
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

export function useSplitAnalysis(
  id: string | undefined,
  enabled = true,
  splitData?: SplitResponse
) {
  return useQuery({
    ...splitAnalysisQueryOptions(id!, false, splitData),
    enabled: !!id && enabled,
  });
}

export function useSplitAnalysisWithBreakdowns(
  id: string | undefined,
  enabled = true,
  splitData?: SplitResponse,
) {
  return useQuery({
    ...splitAnalysisQueryOptions(id!, true, splitData),
    enabled: !!id && enabled,
  });
}

export function prefetchSplitAnalysisWithBreakdowns(
  qc: QueryClient,
  id: string,
  splitData?: SplitResponse,
) {
  return qc.prefetchQuery(splitAnalysisQueryOptions(id, true, splitData));
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
        const fullPrevious = queryClient.getQueryData<SplitListResponse>(splitKeys.list(true));
        const fullNext = updateSplitInListCache(fullPrevious, result);
        if (fullNext) queryClient.setQueryData(splitKeys.list(true), fullNext);

        const litePrevious = queryClient.getQueryData<SplitListResponse>(splitKeys.list(false));
        const liteNext = updateSplitInListCache(litePrevious, result);
        if (liteNext) queryClient.setQueryData(splitKeys.list(false), liteNext);
      }
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
        const fullPrevious = queryClient.getQueryData<SplitListResponse>(splitKeys.list(true));
        const fullNext = updateSplitInListCache(fullPrevious, result);
        if (fullNext) queryClient.setQueryData(splitKeys.list(true), fullNext);

        const litePrevious = queryClient.getQueryData<SplitListResponse>(splitKeys.list(false));
        const liteNext = updateSplitInListCache(litePrevious, result);
        if (liteNext) queryClient.setQueryData(splitKeys.list(false), liteNext);
      }
    },
  });
}

export function useUpdateSplitExercises() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: SplitExerciseBatchUpdateItem[] }) =>
      updateSplitExercises(id, updates),
    onSuccess: async (_result, variables) => {
      await queryClient.refetchQueries({ queryKey: splitKeys.detail(variables.id), exact: true });
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

export function useDuplicateSplit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateSplit(id),
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
      const previousFull = queryClient.getQueryData<SplitListResponse>(splitKeys.list(true));
      const previousLite = queryClient.getQueryData<SplitListResponse>(splitKeys.list(false));

      if (previousFull) {
        queryClient.setQueryData<SplitListResponse>(splitKeys.list(true), {
          ...previousFull,
          splits: previousFull.splits.filter((s) => s.id !== id),
          total: previousFull.total - 1,
        });
      }
      if (previousLite) {
        queryClient.setQueryData<SplitListResponse>(splitKeys.list(false), {
          ...previousLite,
          splits: previousLite.splits.filter((s) => s.id !== id),
          total: previousLite.total - 1,
        });
      }

      return { previousFull, previousLite };
    },
    onError: (_err, _id, context) => {
      if (context?.previousFull) queryClient.setQueryData(splitKeys.list(true), context.previousFull);
      if (context?.previousLite) queryClient.setQueryData(splitKeys.list(false), context.previousLite);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
    },
  });
}

// ---------------------------------------------------------------------------
// Prefetch helper
// ---------------------------------------------------------------------------

/** Prefetch splits list so the Splits tab is warm on arrival. */
export function prefetchSplitsQueries(qc: QueryClient) {
  qc.prefetchQuery({
    queryKey: splitKeys.list(false),
    queryFn: () => getSplits({ includeExercises: false }),
    staleTime: 5 * 60 * 1000,
  });
}
