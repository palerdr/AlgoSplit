import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UnitSystem = 'imperial' | 'metric';
export type Dataset = 'schoenfeld' | 'pelland' | 'average';

interface SettingsState {
  units: UnitSystem;
  defaultRestDuration: number; // in seconds
  stimulusDuration: number; // in hours (24-96)
  maintenanceVolume: number; // sets per week (1-9)
  dataset: Dataset;
  setUnits: (units: UnitSystem) => void;
  setDefaultRestDuration: (duration: number) => void;
  setStimulusDuration: (hours: number) => void;
  setMaintenanceVolume: (sets: number) => void;
  setDataset: (dataset: Dataset) => void;
  toggleUnits: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      units: 'imperial',
      defaultRestDuration: 90,
      stimulusDuration: 48,
      maintenanceVolume: 3,
      dataset: 'schoenfeld' as Dataset,
      setUnits: (units) => set({ units }),
      setDefaultRestDuration: (duration) => set({ defaultRestDuration: duration }),
      setStimulusDuration: (hours) => set({ stimulusDuration: hours }),
      setMaintenanceVolume: (sets) => set({ maintenanceVolume: sets }),
      setDataset: (dataset) => set({ dataset }),
      toggleUnits: () =>
        set((state) => ({
          units: state.units === 'imperial' ? 'metric' : 'imperial',
        })),
    }),
    {
      name: 'algosplit-settings',
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) {
          return {
            ...(persisted as Record<string, unknown>),
            stimulusDuration: 48,
            maintenanceVolume: 3,
            dataset: 'schoenfeld',
          };
        }
        return persisted as SettingsState;
      },
      merge: (persisted, current) => ({
        ...(current as SettingsState),
        ...(persisted as Partial<SettingsState>),
      }),
    }
  )
);

// Utility functions for unit conversion
export function convertWeight(value: number, from: UnitSystem, to: UnitSystem): number {
  if (from === to) return value;
  if (from === 'imperial' && to === 'metric') {
    return Math.round(value * 0.453592 * 10) / 10; // lbs to kg
  }
  return Math.round(value * 2.20462 * 10) / 10; // kg to lbs
}

export function formatWeightWithUnit(value: number, units: UnitSystem): string {
  return `${value.toFixed(1)} ${units === 'imperial' ? 'lbs' : 'kg'}`;
}

export function convertBodyweight(value: number, from: UnitSystem, to: UnitSystem): number {
  return convertWeight(value, from, to);
}
