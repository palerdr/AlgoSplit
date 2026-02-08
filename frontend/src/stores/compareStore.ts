import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnalysisResponse } from '@/types/api.types';

interface CompareState {
  selectedSplitIds: string[];
  analysisResults: Record<string, AnalysisResponse>;
  comparisonName: string;
  loadedComparisonId: string | null;

  setSelectedSplitIds: (ids: string[]) => void;
  toggleSplitId: (id: string) => void;
  setAnalysisResult: (splitId: string, result: AnalysisResponse) => void;
  setComparisonName: (name: string) => void;
  setLoadedComparisonId: (id: string | null) => void;
  reset: () => void;
}

const initialState = {
  selectedSplitIds: [] as string[],
  analysisResults: {} as Record<string, AnalysisResponse>,
  comparisonName: '',
  loadedComparisonId: null as string | null,
};

export const useCompareStore = create<CompareState>()(
  persist(
    (set) => ({
      ...initialState,

      setSelectedSplitIds: (ids) => set({ selectedSplitIds: ids }),

      toggleSplitId: (id) =>
        set((state) => {
          const exists = state.selectedSplitIds.includes(id);
          if (exists) {
            return {
              selectedSplitIds: state.selectedSplitIds.filter((s) => s !== id),
            };
          }
          if (state.selectedSplitIds.length >= 4) return state;
          return {
            selectedSplitIds: [...state.selectedSplitIds, id],
          };
        }),

      setAnalysisResult: (splitId, result) =>
        set((state) => ({
          analysisResults: { ...state.analysisResults, [splitId]: result },
        })),

      setComparisonName: (name) => set({ comparisonName: name }),

      setLoadedComparisonId: (id) => set({ loadedComparisonId: id }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'algosplit-compare',
      version: 2,
      // Don't persist analysisResults - they're large and can be re-fetched
      partialize: (state) => {
        const { analysisResults, ...rest } = state;
        return rest;
      },
    }
  )
);
