import type { AnimalSlug } from './animalPaths';

export interface AnimalWeightTier {
  /** Upper bound in lb of cumulative weight moved for this tier (inclusive). */
  maxLb: number;
  name: string;
  /** Plural form for "lift N ___!" phrasing — irregular for Deer. */
  plural: string;
  /** Approximate reference bodyweight for this animal, in lb. */
  avgWeightLb: number;
  /** Rendered size in points — grows tier over tier so heavier visibly reads as bigger. */
  iconSize: number;
  slug: AnimalSlug;
}

// A fun, approximate ladder for a week's cumulative "lbs moved" (sets x reps
// x weight, potentially in the tens of thousands) — not a scientific claim
// about any species' exact average weight. Every silhouette here was
// rendered and eyeballed to confirm it's a genuine whole-body shape, not a
// head/bust icon (game-icons.net's own "lion" and "wolf" entries looked like
// full-body candidates on paper but turned out to be heads only).
export const ANIMAL_WEIGHT_TIERS: readonly AnimalWeightTier[] = [
  { maxLb: 500, name: 'Human', plural: 'Humans', avgWeightLb: 180, iconSize: 26, slug: 'human' },
  { maxLb: 2_000, name: 'Deer', plural: 'Deer', avgWeightLb: 250, iconSize: 30, slug: 'deer' },
  { maxLb: 8_000, name: 'Cow', plural: 'Cows', avgWeightLb: 1_400, iconSize: 34, slug: 'cow' },
  { maxLb: 20_000, name: 'Bull', plural: 'Bulls', avgWeightLb: 1_800, iconSize: 38, slug: 'bull' },
  {
    maxLb: 60_000,
    name: 'Elephant',
    plural: 'Elephants',
    avgWeightLb: 12_000,
    iconSize: 42,
    slug: 'elephant',
  },
  { maxLb: Infinity, name: 'Whale', plural: 'Whales', avgWeightLb: 90_000, iconSize: 46, slug: 'whale' },
];

/** Null for 0 lb (no workouts this week yet) — there's nothing to compare. */
export function animalTierForWeight(totalLb: number): AnimalWeightTier | null {
  if (!(totalLb > 0)) return null;
  return (
    ANIMAL_WEIGHT_TIERS.find((tier) => totalLb <= tier.maxLb) ??
    ANIMAL_WEIGHT_TIERS[ANIMAL_WEIGHT_TIERS.length - 1]
  );
}

/** "You've moved enough to lift 3 deer!" — always at least 1, never a fraction. */
export function animalLiftMultiplier(totalLb: number, tier: AnimalWeightTier): number {
  return Math.max(1, Math.round(totalLb / tier.avgWeightLb));
}
