import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionInput, AnalysisResponse } from '@/types/api.types';

interface SplitCreateState {
  // Form state
  splitName: string;
  sessions: SessionInput[];
  cycleLength: number | null;
  stimulusDuration: number | null;
  maintenanceVolume: number | null;
  dataset: 'schoenfeld' | 'pelland' | 'average';

  // Preview results
  preview: AnalysisResponse | null;

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
  setPreview: (preview: AnalysisResponse | null) => void;
  reset: () => void;
}

const createDefaultSession = (): SessionInput => ({
  name: '',
  day: 1,
  exercises: [{ id: crypto.randomUUID(), name: '', sets: 1, unilateral: false }],
});

const initialState = {
  splitName: '',
  sessions: [createDefaultSession()],
  cycleLength: null as number | null,
  stimulusDuration: null as number | null,
  maintenanceVolume: null as number | null,
  dataset: 'pelland' as const,
  preview: null as AnalysisResponse | null,
};

export const useSplitCreateStore = create<SplitCreateState>()(
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

      setPreview: (preview) => set({ preview }),

      reset: () => set({ ...initialState, sessions: [createDefaultSession()] }),
    }),
    {
      name: 'algosplit-split-create',
      version: 3,
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          persisted = { ...persisted, stimulusDuration: null, maintenanceVolume: null };
        }
        if (version < 3) {
          // Ensure default dataset is pelland
          persisted = { ...persisted, dataset: 'pelland' };
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
