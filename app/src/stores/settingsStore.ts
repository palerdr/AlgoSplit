import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WeightUnit = 'lb' | 'kg';
export type AnalysisDataset = 'schoenfeld' | 'pelland' | 'average';

interface SettingsState {
  weightUnit: WeightUnit;
  stimulusDuration: number;
  maintenanceVolume: number;
  dataset: AnalysisDataset;
  setWeightUnit: (unit: WeightUnit) => void;
  setStimulusDuration: (hours: number) => void;
  setMaintenanceVolume: (sets: number) => void;
  setDataset: (dataset: AnalysisDataset) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      weightUnit: 'lb',
      stimulusDuration: 48,
      maintenanceVolume: 3,
      dataset: 'schoenfeld',
      setWeightUnit: (unit) => set({ weightUnit: unit }),
      setStimulusDuration: (hours) => set({ stimulusDuration: clamp(Math.round(hours), 24, 96) }),
      setMaintenanceVolume: (sets) => set({ maintenanceVolume: clamp(Math.round(sets), 1, 9) }),
      setDataset: (dataset) => set({ dataset }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
