import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImportExerciseStatus, SessionInput } from '../types/api.types';
import { generateExerciseId, generateSessionId } from '../utils/splitEditHelpers';

function makeDefaultSession(): SessionInput {
  return {
    id: generateSessionId(),
    name: '',
    day: 1,
    exercises: [{ id: generateExerciseId(), name: '', sets: 3 }],
  };
}

// Exercises flagged by the spreadsheet import for user review,
// keyed by client-side exercise id.
type ImportFlags = Record<string, Exclude<ImportExerciseStatus, 'matched'>>;

interface SplitCreateState {
  splitName: string;
  sessions: SessionInput[];
  dataset: 'schoenfeld' | 'pelland' | 'average';
  cycleLength: string;
  stimulusDuration: string;
  maintenanceVolume: string;
  importFlags: ImportFlags;

  setSplitName: (name: string) => void;
  setSessions: (sessions: SessionInput[]) => void;
  setDataset: (dataset: 'schoenfeld' | 'pelland' | 'average') => void;
  setCycleLength: (length: string) => void;
  setStimulusDuration: (duration: string) => void;
  setMaintenanceVolume: (volume: string) => void;
  setImportFlags: (flags: ImportFlags) => void;
  clearImportFlag: (exerciseId: string) => void;
  reset: () => void;
}

const initialState = {
  splitName: '',
  sessions: [makeDefaultSession()] as SessionInput[],
  dataset: 'schoenfeld' as const,
  cycleLength: '',
  stimulusDuration: '48',
  maintenanceVolume: '3',
  importFlags: {} as ImportFlags,
};

export const useSplitCreateStore = create<SplitCreateState>()(
  persist(
    (set) => ({
      ...initialState,

      setSplitName: (name) => set({ splitName: name }),
      setSessions: (sessions) => set({ sessions }),
      setDataset: (dataset) => set({ dataset }),
      setCycleLength: (length) => set({ cycleLength: length }),
      setStimulusDuration: (duration) => set({ stimulusDuration: duration }),
      setMaintenanceVolume: (volume) => set({ maintenanceVolume: volume }),
      setImportFlags: (flags) => set({ importFlags: flags }),
      clearImportFlag: (exerciseId) =>
        set((state) => {
          if (!state.importFlags[exerciseId]) return state;
          const next = { ...state.importFlags };
          delete next[exerciseId];
          return { importFlags: next };
        }),
      reset: () => set({ ...initialState, sessions: [makeDefaultSession()], importFlags: {} }),
    }),
    {
      name: 'split-create-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        splitName: state.splitName,
        sessions: state.sessions,
        dataset: state.dataset,
        cycleLength: state.cycleLength,
        stimulusDuration: state.stimulusDuration,
        maintenanceVolume: state.maintenanceVolume,
        importFlags: state.importFlags,
      }),
    },
  ),
);
