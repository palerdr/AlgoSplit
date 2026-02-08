import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionInput, AnalysisResponse } from '@/types/api.types';

interface AnalysisState {
  // Form state
  splitName: string;
  sessions: SessionInput[];
  cycleLength: number | null; // null = auto-calculate from max day
  stimulusDuration: number | null;
  maintenanceVolume: number | null;
  dataset: 'schoenfeld' | 'pelland' | 'average';

  // Loaded split tracking
  loadedSplitId: string | null;

  // Results
  lastResults: AnalysisResponse | null;

  // Actions
  setSplitName: (name: string) => void;
  setSessions: (sessions: SessionInput[]) => void;
  setSession: (index: number, session: SessionInput) => void;
  addSession: (session: SessionInput) => void;
  removeSession: (index: number) => void;
  setCycleLength: (length: number | null) => void;
  setStimulusDuration: (duration: number | null) => void;
  setMaintenanceVolume: (volume: number | null) => void;
  setDataset: (dataset: 'schoenfeld' | 'pelland' | 'average') => void;
  setLoadedSplitId: (id: string | null) => void;
  setLastResults: (results: AnalysisResponse | null) => void;
  reset: () => void;
}

const defaultSession: SessionInput = {
  name: '',
  day: 1,
  exercises: [{ id: crypto.randomUUID(), name: '', sets: 1, unilateral: false }],
};

const initialState = {
  splitName: 'My Split',
  sessions: [{ ...defaultSession }],
  cycleLength: null as number | null, // null = auto from max day
  stimulusDuration: null as number | null,
  maintenanceVolume: null as number | null,
  dataset: 'pelland' as const,
  loadedSplitId: null as string | null,
  lastResults: null,
};

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set) => ({
      ...initialState,

      setSplitName: (name) => set({ splitName: name }),

      setSessions: (sessions) => set({ sessions }),

      setSession: (index, session) =>
        set((state) => {
          const newSessions = [...state.sessions];
          newSessions[index] = session;
          return { sessions: newSessions };
        }),

      addSession: (session) =>
        set((state) => ({
          sessions: [...state.sessions, session],
        })),

      removeSession: (index) =>
        set((state) => ({
          sessions: state.sessions.filter((_, i) => i !== index),
        })),

      setCycleLength: (length) => set({ cycleLength: length }),

      setStimulusDuration: (duration) => set({ stimulusDuration: duration }),

      setMaintenanceVolume: (volume) => set({ maintenanceVolume: volume }),

      setDataset: (dataset) => set({ dataset }),

      setLoadedSplitId: (id) => set({ loadedSplitId: id }),

      setLastResults: (results) => set({ lastResults: results }),

      reset: () => set({ ...initialState, loadedSplitId: null, sessions: [{ ...defaultSession, exercises: [{ id: crypto.randomUUID(), name: '', sets: 1, unilateral: false }] }] }),
    }),
    {
      name: 'algosplit-analysis',
      version: 3,
      // Don't persist lastResults - it's large and can be re-fetched
      partialize: (state) => {
        const { lastResults, ...rest } = state;
        return rest;
      },
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          return { ...persisted, stimulusDuration: null, maintenanceVolume: null, loadedSplitId: null };
        }
        return persisted;
      },
    }
  )
);

// Helper to get next day number — fills gaps instead of always incrementing
export function getNextDayNumber(sessions: SessionInput[]): number {
  if (sessions.length === 0) return 1;
  const usedDays = new Set(sessions.map(s => s.day));
  let day = 1;
  while (usedDays.has(day)) day++;
  return day;
}
