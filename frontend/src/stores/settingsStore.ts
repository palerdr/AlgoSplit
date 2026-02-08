import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UnitSystem = 'imperial' | 'metric';

interface SettingsState {
  units: UnitSystem;
  defaultRestDuration: number; // in seconds
  setUnits: (units: UnitSystem) => void;
  setDefaultRestDuration: (duration: number) => void;
  toggleUnits: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      units: 'imperial',
      defaultRestDuration: 90,
      setUnits: (units) => set({ units }),
      setDefaultRestDuration: (duration) => set({ defaultRestDuration: duration }),
      toggleUnits: () =>
        set((state) => ({
          units: state.units === 'imperial' ? 'metric' : 'imperial',
        })),
    }),
    {
      name: 'algosplit-settings',
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
