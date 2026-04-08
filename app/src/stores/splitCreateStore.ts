import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionInput } from '../types/api.types';
import { generateExerciseId, generateSessionId } from '../utils/splitEditHelpers';

function makeDefaultSession(): SessionInput {
  return {
    id: generateSessionId(),
    name: '',
    day: 1,
    exercises: [{ id: generateExerciseId(), name: '', sets: 3 }],
  };
}

interface SplitCreateState {
  splitName: string;
  sessions: SessionInput[];
  dataset: 'schoenfeld' | 'pelland' | 'average';
  cycleLength: string;
  stimulusDuration: string;
  maintenanceVolume: string;

  setSplitName: (name: string) => void;
  setSessions: (sessions: SessionInput[]) => void;
  setDataset: (dataset: 'schoenfeld' | 'pelland' | 'average') => void;
  setCycleLength: (length: string) => void;
  setStimulusDuration: (duration: string) => void;
  setMaintenanceVolume: (volume: string) => void;
  reset: () => void;
}

const initialState = {
  splitName: '',
  sessions: [makeDefaultSession()] as SessionInput[],
  dataset: 'schoenfeld' as const,
  cycleLength: '',
  stimulusDuration: '48',
  maintenanceVolume: '3',
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
      reset: () => set({ ...initialState, sessions: [makeDefaultSession()] }),
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
      }),
    },
  ),
);
