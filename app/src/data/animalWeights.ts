import type { AnimalSlug } from './animalPaths';

export interface AnimalWeightTier {
  /** Upper bound in lb for this tier (inclusive). */
  maxLb: number;
  name: string;
  /** Approximate reference weight, shown in the tooltip. */
  avgWeightLb: number;
  /** Rendered size in points — grows tier over tier so heavier visibly reads as bigger. */
  iconSize: number;
  slug: AnimalSlug;
}

// A fun, approximate ladder across the weight wheel's 0-300 lb range — not a
// scientific claim about any species' exact average weight.
export const ANIMAL_WEIGHT_TIERS: readonly AnimalWeightTier[] = [
  { maxLb: 45, name: 'Dog', avgWeightLb: 40, iconSize: 26, slug: 'dog' },
  { maxLb: 95, name: 'Wolf', avgWeightLb: 90, iconSize: 30, slug: 'wolf' },
  { maxLb: 145, name: 'Human', avgWeightLb: 140, iconSize: 34, slug: 'human' },
  { maxLb: 195, name: 'Deer', avgWeightLb: 180, iconSize: 38, slug: 'deer' },
  { maxLb: 245, name: 'Lion', avgWeightLb: 220, iconSize: 42, slug: 'lion' },
  { maxLb: Infinity, name: 'Gorilla', avgWeightLb: 300, iconSize: 46, slug: 'gorilla' },
];

/** Null for 0 lb (bodyweight-only sets) — there's nothing to compare. */
export function animalTierForWeight(weightLb: number): AnimalWeightTier | null {
  if (!(weightLb > 0)) return null;
  return (
    ANIMAL_WEIGHT_TIERS.find((tier) => weightLb <= tier.maxLb) ??
    ANIMAL_WEIGHT_TIERS[ANIMAL_WEIGHT_TIERS.length - 1]
  );
}
