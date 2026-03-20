import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import * as splitsApi from '../../src/api/splits.api';
import {
  prefetchSplitAnalysisWithBreakdowns,
  useSplitAnalysis,
  useSplitAnalysisWithBreakdowns,
} from '../../src/hooks/useSplits';
import type { AnalysisResponse, SplitResponse } from '../../src/types/api.types';


function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  activeQueryClients.push(queryClient);
  return queryClient;
}


function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}


const split: SplitResponse = {
  id: 'split-1',
  user_id: 'user-1',
  name: 'Test Split',
  cycle_length: 4,
  stimulus_duration: 48,
  maintenance_volume: 3,
  dataset: 'average',
  sessions: [
    {
      id: 'session-1',
      split_id: 'split-1',
      name: 'Push',
      day_number: 1,
      exercises: [
        {
          id: 'exercise-1',
          session_id: 'session-1',
          exercise_name: 'Bench Press',
          sets: 3,
          order_index: 0,
          unilateral: false,
          resistance_profile: null,
          created_at: '2026-03-20T00:00:00Z',
        },
      ],
      created_at: '2026-03-20T00:00:00Z',
      updated_at: '2026-03-20T00:00:00Z',
    },
  ],
  created_at: '2026-03-20T00:00:00Z',
  updated_at: '2026-03-20T00:00:00Z',
};


const liteAnalysis: AnalysisResponse = {
  split_name: 'Test Split',
  cycle_length: 4,
  stimulus_duration: 48,
  maintenance_volume: 3,
  dataset: 'average',
  muscles: [],
  group_summaries: [],
  suggestions: [],
  summary: {
    total_sets: 3,
    muscles_trained: 1,
    total_muscles: 29,
    avg_net_stimulus: 1.2,
    avg_sets_per_muscle: 3,
    group_summaries: [],
  },
  session_breakdowns: [],
};


const fullAnalysis: AnalysisResponse = {
  ...liteAnalysis,
  session_breakdowns: [
    {
      session_name: 'Push',
      day_number: 1,
      exercises: [],
      cumulative_sets: 3,
      cumulative_axial_fatigue: 0,
      final_cns_multiplier: 1,
      consecutive_days: 1,
      consecutive_day_penalty: 1,
    },
  ],
};


const activeQueryClients: QueryClient[] = [];


describe('useSplits analysis caching', () => {
  afterEach(() => {
    for (const queryClient of activeQueryClients) {
      queryClient.clear();
    }
    activeQueryClients.length = 0;
    jest.restoreAllMocks();
  });

  it('loads lite analysis on split open', async () => {
    const queryClient = createQueryClient();
    const analyzeFromDefinitionSpy = jest
      .spyOn(splitsApi, 'analyzeSplitFromDefinition')
      .mockResolvedValue(liteAnalysis);

    const { result } = renderHook(() => useSplitAnalysis(split.id, true, split), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(liteAnalysis);
    });

    expect(analyzeFromDefinitionSpy).toHaveBeenCalledTimes(1);
    expect(analyzeFromDefinitionSpy.mock.calls[0]?.[0].include_breakdowns).toBe(false);
    expect(analyzeFromDefinitionSpy.mock.calls[0]?.[1]).toBe(false);
  });

  it('prefetches full analysis after lite resolves', async () => {
    const queryClient = createQueryClient();
    const analyzeFromDefinitionSpy = jest
      .spyOn(splitsApi, 'analyzeSplitFromDefinition')
      .mockResolvedValue(fullAnalysis);

    await prefetchSplitAnalysisWithBreakdowns(queryClient, split.id, split);

    expect(analyzeFromDefinitionSpy).toHaveBeenCalledTimes(1);
    expect(analyzeFromDefinitionSpy.mock.calls[0]?.[0].include_breakdowns).toBe(true);
    expect(analyzeFromDefinitionSpy.mock.calls[0]?.[1]).toBe(true);
    expect(
      queryClient.getQueryData([
        ...splitsApi.splitKeys.analysis(split.id),
        'full',
        split.updated_at,
      ])
    ).toEqual(fullAnalysis);
  });

  it('breakdown tab uses cached full analysis when available', async () => {
    const queryClient = createQueryClient();
    const analyzeFromDefinitionSpy = jest
      .spyOn(splitsApi, 'analyzeSplitFromDefinition')
      .mockResolvedValue(fullAnalysis);

    await prefetchSplitAnalysisWithBreakdowns(queryClient, split.id, split);

    const { result } = renderHook(
      () => useSplitAnalysisWithBreakdowns(split.id, true, split),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(fullAnalysis);
    });

    expect(analyzeFromDefinitionSpy).toHaveBeenCalledTimes(1);
  });

  it('does not refetch full analysis on tab switch when cache is warm', async () => {
    const queryClient = createQueryClient();
    const analyzeFromDefinitionSpy = jest
      .spyOn(splitsApi, 'analyzeSplitFromDefinition')
      .mockResolvedValue(fullAnalysis);

    await prefetchSplitAnalysisWithBreakdowns(queryClient, split.id, split);

    const firstRender = renderHook(
      () => useSplitAnalysisWithBreakdowns(split.id, true, split),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(firstRender.result.current.data).toEqual(fullAnalysis);
    });
    firstRender.unmount();

    const secondRender = renderHook(
      () => useSplitAnalysisWithBreakdowns(split.id, true, split),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(secondRender.result.current.data).toEqual(fullAnalysis);
    });

    expect(analyzeFromDefinitionSpy).toHaveBeenCalledTimes(1);
  });
});
