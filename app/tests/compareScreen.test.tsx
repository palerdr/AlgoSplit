jest.mock('zustand/middleware.js', () => jest.requireActual('zustand/middleware'), { virtual: true });
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/hooks/useSplits', () => ({
  useSplitsList: jest.fn(),
  useSplitsListWithOptions: jest.fn(),
}));

jest.mock('../src/hooks/useComparisons', () => ({
  useComparisonsList: jest.fn(),
  useSaveComparison: jest.fn(),
  useDeleteComparison: jest.fn(),
}));

jest.mock('../src/api/splits.api', () => ({
  analyzeSplit: jest.fn(),
}));

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CompareSplitsScreen from '../app/(tabs)/splits/compare';
import { useSplitsList, useSplitsListWithOptions } from '../src/hooks/useSplits';
import {
  useComparisonsList,
  useDeleteComparison,
  useSaveComparison,
} from '../src/hooks/useComparisons';
import { analyzeSplit } from '../src/api/splits.api';
import { useCompareStore } from '../src/stores/compareStore';

const mockUseSplitsList = useSplitsList as jest.Mock;
const mockUseSplitsListWithOptions = useSplitsListWithOptions as jest.Mock;
const mockUseComparisonsList = useComparisonsList as jest.Mock;
const mockUseSaveComparison = useSaveComparison as jest.Mock;
const mockUseDeleteComparison = useDeleteComparison as jest.Mock;
const mockAnalyzeSplit = analyzeSplit as jest.Mock;

const baseAnalysis = {
  split_name: 'Test Split',
  cycle_length: 7,
  stimulus_duration: 48,
  maintenance_volume: 3,
  dataset: 'schoenfeld',
  muscles: [],
  group_summaries: [],
  suggestions: [],
  summary: {
    total_sets: 12,
    muscles_trained: 5,
    total_muscles: 29,
    avg_net_stimulus: 1.2,
    avg_sets_per_muscle: 2.4,
  },
};

describe('CompareSplitsScreen', () => {
  const saveMutation = { mutateAsync: jest.fn(), isPending: false };
  const deleteMutation = { mutateAsync: jest.fn(), isPending: false };

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    act(() => {
      useCompareStore.getState().reset();
    });
    const splitsResult = {
      data: {
        splits: [
          { id: 's1', name: 'Push', sessions: [{ id: 'a' }], stimulus_duration: 48, dataset: 'schoenfeld' },
          { id: 's2', name: 'Pull', sessions: [{ id: 'b' }], stimulus_duration: 48, dataset: 'schoenfeld' },
          { id: 's3', name: 'Legs', sessions: [{ id: 'c' }], stimulus_duration: 48, dataset: 'schoenfeld' },
          { id: 's4', name: 'Upper', sessions: [{ id: 'd' }], stimulus_duration: 48, dataset: 'schoenfeld' },
        ],
      },
      isLoading: false,
    };
    mockUseSplitsList.mockReturnValue(splitsResult);
    mockUseSplitsListWithOptions.mockReturnValue(splitsResult);
    mockUseComparisonsList.mockReturnValue({
      data: {
        comparisons: [
          {
            id: 'cmp-1',
            name: 'Saved Trio',
            split_ids: ['s1', 's2', 's3', 's4'],
          },
        ],
      },
      isLoading: false,
    });
    mockUseSaveComparison.mockReturnValue(saveMutation);
    mockUseDeleteComparison.mockReturnValue(deleteMutation);
    saveMutation.mutateAsync.mockReset();
    deleteMutation.mutateAsync.mockReset();
    mockAnalyzeSplit.mockReset();
    mockAnalyzeSplit.mockResolvedValue(baseAnalysis);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    act(() => {
      useCompareStore.getState().reset();
    });
  });

  it('loads a saved comparison, caps it at three splits, and runs analysis for each loaded split', async () => {
    const screen = render(<CompareSplitsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Saved Trio'));
    });

    await waitFor(() => {
      expect(mockAnalyzeSplit).toHaveBeenCalledTimes(3);
    });

    expect(mockAnalyzeSplit.mock.calls.map((call) => call[0])).toEqual(['s1', 's2', 's3']);
    expect(useCompareStore.getState().selectedSplitIds).toEqual(['s1', 's2', 's3']);
    expect(useCompareStore.getState().loadedComparisonId).toBe('cmp-1');
  });

  it('saves the currently selected comparison payload', async () => {
    act(() => {
      useCompareStore.setState({
        selectedSplitIds: ['s1', 's2'],
        comparisonName: 'Push vs Pull',
        loadedComparisonId: null,
        analysisResults: {},
      });
    });
    saveMutation.mutateAsync.mockResolvedValue({
      id: 'cmp-2',
      name: 'Push vs Pull',
      split_ids: ['s1', 's2'],
    });

    const screen = render(<CompareSplitsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(saveMutation.mutateAsync).toHaveBeenCalledWith({
        id: null,
        data: {
          name: 'Push vs Pull',
          split_ids: ['s1', 's2'],
        },
      });
    });

    expect(useCompareStore.getState().loadedComparisonId).toBe('cmp-2');
  });
});
