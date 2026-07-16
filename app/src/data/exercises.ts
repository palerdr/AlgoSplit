// Exercise layer: the 307-exercise AlgoSplit catalog resolved through the 38
// movement patterns into per-muscle tiered involvement, plus the pattern's
// axial load, resistance profile, and unilateral flag for the engine.

import { EXERCISE_CATALOG, CatalogEntry } from './exerciseCatalog.gen';
import { MOVEMENT_PATTERNS } from './movementPatterns.gen';
import type { StimulusTier } from '../analysis/stimulus';

export interface MuscleInvolvement {
  region: string;
  weight: number; // 0–1 stimulus fraction per set
  tier: StimulusTier;
}

export interface Exercise {
  id: string;
  name: string;
  muscles: MuscleInvolvement[];
  /** 0–1 spinal loading of the movement (feeds CNS fatigue) */
  axialLoad: number;
  resistanceProfile: 'ascending' | 'mid' | 'descending';
  unilateral: boolean;
  equipment?: string;
}

function toExercise(entry: CatalogEntry): Exercise | null {
  const pattern = MOVEMENT_PATTERNS[entry.pattern];
  if (!pattern) return null;
  const muscles: MuscleInvolvement[] = [];
  const tiers: [StimulusTier, Record<string, number>][] = [
    ['prime', pattern.prime],
    ['secondary', pattern.secondary],
    ['tertiary', pattern.tertiary],
    ['quaternary', pattern.quaternary],
  ];
  for (const [tier, targets] of tiers) {
    for (const [region, weight] of Object.entries(targets)) {
      muscles.push({ region, weight, tier });
    }
  }
  return {
    id: entry.id,
    name: entry.name,
    muscles,
    axialLoad: pattern.axialLoad,
    resistanceProfile: pattern.resistanceProfile,
    unilateral: entry.unilateral === true,
    equipment: entry.equipment,
  };
}

export const EXERCISES: Exercise[] = EXERCISE_CATALOG
  .map(toExercise)
  .filter((e): e is Exercise => e !== null);

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return byId.get(id);
}
