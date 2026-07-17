import { ANIMAL_WEIGHT_TIERS, animalLiftMultiplier, animalTierForWeight } from '../src/data/animalWeights';
import { ANIMAL_PATHS } from '../src/data/animalPaths';

describe('animal weight comparison', () => {
  it('returns null for a week with no volume yet (0 lb or below)', () => {
    expect(animalTierForWeight(0)).toBeNull();
    expect(animalTierForWeight(-5)).toBeNull();
  });

  it('picks the lightest tier just above 0', () => {
    expect(animalTierForWeight(5)?.name).toBe('Human');
    expect(animalTierForWeight(500)?.name).toBe('Human');
  });

  it('steps up through tiers at their boundaries', () => {
    expect(animalTierForWeight(501)?.name).toBe('Deer');
    expect(animalTierForWeight(2_000)?.name).toBe('Deer');
    expect(animalTierForWeight(2_001)?.name).toBe('Cow');
    expect(animalTierForWeight(8_000)?.name).toBe('Cow');
    expect(animalTierForWeight(8_001)?.name).toBe('Bull');
    expect(animalTierForWeight(20_000)?.name).toBe('Bull');
    expect(animalTierForWeight(20_001)?.name).toBe('Elephant');
    expect(animalTierForWeight(60_000)?.name).toBe('Elephant');
  });

  it('tops out at the heaviest tier for any volume beyond it', () => {
    expect(animalTierForWeight(60_001)?.name).toBe('Whale');
    expect(animalTierForWeight(500_000)?.name).toBe('Whale');
  });

  it('every tier has a valid, present silhouette path', () => {
    for (const tier of ANIMAL_WEIGHT_TIERS) {
      expect(ANIMAL_PATHS[tier.slug]).toBeTruthy();
      expect(ANIMAL_PATHS[tier.slug].length).toBeGreaterThan(20);
    }
  });

  it('icon size strictly grows tier over tier so heavier reads as visibly bigger', () => {
    const sizes = ANIMAL_WEIGHT_TIERS.map((tier) => tier.iconSize);
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });

  it('every tier has a plural for the "lift N ___!" phrasing, Deer included', () => {
    for (const tier of ANIMAL_WEIGHT_TIERS) {
      expect(tier.plural.length).toBeGreaterThan(0);
    }
    expect(ANIMAL_WEIGHT_TIERS.find((t) => t.name === 'Deer')?.plural).toBe('Deer');
  });

  it('lift multiplier is always a whole number, never below 1', () => {
    const deer = ANIMAL_WEIGHT_TIERS.find((t) => t.name === 'Deer')!;
    expect(animalLiftMultiplier(1, deer)).toBe(1);
    expect(animalLiftMultiplier(250, deer)).toBe(1);
    expect(animalLiftMultiplier(1_800, deer)).toBe(7);
    expect(Number.isInteger(animalLiftMultiplier(1_337, deer))).toBe(true);
  });
});
