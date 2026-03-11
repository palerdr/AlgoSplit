import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnalysisResponse } from '../types/api.types';

interface CompareState {
  selectedSplitIds: string[];
  analysisResults: Record<string, AnalysisResponse>;
  comparisonName: string;
  loadedComparisonId: string | null;
  toggleSplitId: (id: string) => void;
  setSelectedSplitIds: (ids: string[]) => void;
  setAnalysisResult: (id: string, result: AnalysisResponse) => void;
  setComparisonName: (name: string) => void;
  setLoadedComparisonId: (id: string | null) => void;
  reset: () => void;
}

const MAX_COMPARE_SPLITS = 3;

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      selectedSplitIds: [],
      analysisResults: {},
      comparisonName: '',
      loadedComparisonId: null,
      toggleSplitId: (id) => {
        const current = get().selectedSplitIds;
        if (current.includes(id)) {
          set({
            selectedSplitIds: current.filter((entry) => entry !== id),
            loadedComparisonId: null,
          });
          return;
        }
        if (current.length >= MAX_COMPARE_SPLITS) return;
        set({
          selectedSplitIds: [...current, id],
          loadedComparisonId: null,
        });
      },
      setSelectedSplitIds: (ids) =>
        set({
          selectedSplitIds: ids.slice(0, MAX_COMPARE_SPLITS),
          loadedComparisonId: null,
        }),
      setAnalysisResult: (id, result) =>
        set((state) => ({
          analysisResults: {
            ...state.analysisResults,
            [id]: result,
          },
        })),
      setComparisonName: (name) => set({ comparisonName: name }),
      setLoadedComparisonId: (id) => set({ loadedComparisonId: id }),
      reset: () =>
        set({
          selectedSplitIds: [],
          analysisResults: {},
          comparisonName: '',
          loadedComparisonId: null,
        }),
    }),
    {
      name: 'compare-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedSplitIds: state.selectedSplitIds,
        comparisonName: state.comparisonName,
        loadedComparisonId: state.loadedComparisonId,
      }),
    },
  ),
);
