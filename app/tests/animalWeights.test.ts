import { ANIMAL_WEIGHT_TIERS, animalTierForWeight } from '../src/data/animalWeights';
import { ANIMAL_PATHS } from '../src/data/animalPaths';

describe('animal weight comparison', () => {
  it('returns null for bodyweight-only sets (0 lb or below)', () => {
    expect(animalTierForWeight(0)).toBeNull();
    expect(animalTierForWeight(-5)).toBeNull();
  });

  it('picks the lightest tier just above 0', () => {
    expect(animalTierForWeight(5)?.name).toBe('Dog');
    expect(animalTierForWeight(45)?.name).toBe('Dog');
  });

  it('steps up through tiers at their boundaries', () => {
    expect(animalTierForWeight(46)?.name).toBe('Wolf');
    expect(animalTierForWeight(95)?.name).toBe('Wolf');
    expect(animalTierForWeight(96)?.name).toBe('Human');
    expect(animalTierForWeight(145)?.name).toBe('Human');
    expect(animalTierForWeight(146)?.name).toBe('Deer');
    expect(animalTierForWeight(195)?.name).toBe('Deer');
    expect(animalTierForWeight(196)?.name).toBe('Lion');
    expect(animalTierForWeight(245)?.name).toBe('Lion');
  });

  it('tops out at the heaviest tier for the rest of the wheel range', () => {
    expect(animalTierForWeight(246)?.name).toBe('Gorilla');
    expect(animalTierForWeight(300)?.name).toBe('Gorilla');
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
});
